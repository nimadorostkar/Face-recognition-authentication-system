"""
Database configuration and models for face recognition system.

This module handles:
- Database connection setup with SQLAlchemy
- User model with pgvector embeddings
- Database initialization and table creation
- Automatic database creation if missing (self-healing)
- Retry logic with exponential backoff for resilience
"""

from typing import List
from urllib.parse import urlparse, urlunparse
from sqlalchemy import create_engine, Column, Integer, String, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pgvector.sqlalchemy import Vector
from datetime import datetime
import logging
import time
import os

logger = logging.getLogger(__name__)

# Database URL from environment variable
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/face_recognition")

# Retry configuration
DB_MAX_RETRIES = int(os.getenv("DB_MAX_RETRIES", "10"))
DB_RETRY_DELAY = float(os.getenv("DB_RETRY_DELAY", "2.0"))


def _parse_admin_url(database_url: str) -> tuple:
    """
    Parse a database URL and return an admin URL (pointing to the default
    'postgres' database) and the target database name.

    This is used to connect to PostgreSQL *before* the target database exists,
    so we can CREATE DATABASE if necessary.
    """
    parsed = urlparse(database_url)
    db_name = parsed.path.lstrip("/")
    admin_parsed = parsed._replace(path="/postgres")
    admin_url = urlunparse(admin_parsed)
    return admin_url, db_name


def ensure_database_exists():
    """
    Ensure the target database exists, creating it if necessary.

    Connects to the default 'postgres' database to check whether the target
    database (parsed from DATABASE_URL) exists.  If not, it creates the
    database and applies the pgvector extension.

    Retries with exponential backoff when PostgreSQL is not yet reachable
    (e.g. during container startup ordering).
    """
    admin_url, db_name = _parse_admin_url(DATABASE_URL)

    for attempt in range(1, DB_MAX_RETRIES + 1):
        try:
            admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
            with admin_engine.connect() as conn:
                result = conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :name"),
                    {"name": db_name},
                )
                if not result.fetchone():
                    conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                    logger.info(f"✓ Created missing database '{db_name}'")
                else:
                    logger.debug(f"✓ Database '{db_name}' already exists")
            admin_engine.dispose()
            return
        except Exception as e:
            if attempt < DB_MAX_RETRIES:
                wait = min(DB_RETRY_DELAY * (2 ** (attempt - 1)), 30)
                logger.warning(
                    f"⏳ Cannot reach PostgreSQL (attempt {attempt}/{DB_MAX_RETRIES}): {e}"
                )
                logger.info(f"   Retrying in {wait:.0f}s...")
                time.sleep(wait)
            else:
                logger.error(
                    f"✗ Failed to ensure database exists after {DB_MAX_RETRIES} attempts"
                )
                raise


# Create SQLAlchemy engine
# pool_pre_ping ensures connections are alive before using them
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False  # Set to True for SQL query logging during development
)

# Session factory for creating database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for declarative models
Base = declarative_base()


class User(Base):
    """
    User model for storing face recognition data.
    
    Attributes:
        id: Primary key, auto-incrementing
        name: Unique identifier for the user (e.g., username or full name)
        mobile: User's mobile phone number
        embedding: 128D face embedding vector from dlib
                   TODO: Change to vector(512) when upgrading to ArcFace/InsightFace
        created_at: Timestamp of registration
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    mobile = Column(String, nullable=True, index=True)
    
    # Store 128D embedding for dlib's face_recognition
    # TODO: Change dimension to 512 for ArcFace/InsightFace embeddings
    embedding = Column(Vector(128), nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<User(id={self.id}, name='{self.name}', mobile='{self.mobile}')>"


def get_db() -> Session:
    """
    Dependency function to get database session.
    
    Yields:
        Database session that automatically closes after use
    
    Usage:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            # Use db here
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database with required extensions and tables.

    This function:
    1. **Ensures the database exists** (creates it if missing — self-healing)
    2. Creates pgvector extension if not exists
    3. Creates all tables defined in Base
    4. Creates vector similarity index for fast search

    The ensure step connects to the default 'postgres' database and will
    retry with exponential backoff, so the API can survive restarts where
    PostgreSQL takes a moment to become ready.

    Called on application startup.
    """
    # --- Self-healing: create the database if it was lost/dropped ---
    ensure_database_exists()

    with engine.connect() as connection:
        # Enable pgvector extension
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        connection.commit()

        logger.info("✓ pgvector extension enabled")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database tables created")

    # Create or recreate index for vector similarity search
    # Using ivfflat index with cosine distance for efficient nearest neighbor search
    with engine.connect() as connection:
        # Recreate IVFFlat index for fast similarity search
        # vector_cosine_ops: Uses cosine distance (1 - cosine similarity)
        # lists=100: Number of inverted lists (clusters)
        connection.execute(text("DROP INDEX IF EXISTS users_embedding_idx"))
        connection.execute(text(
            "CREATE INDEX users_embedding_idx ON users "
            "USING ivfflat (embedding vector_cosine_ops) "
            "WITH (lists = 100)"
        ))
        connection.commit()

        logger.info("✓ Vector similarity index created")


def find_similar_faces(db: Session, embedding: List[float], threshold: float = 0.45, limit: int = 1):
    """
    Find similar faces using pgvector similarity search.
    
    Args:
        db: Database session
        embedding: Query embedding vector (128D)
        threshold: Maximum distance threshold for a match (default: 0.45)
        limit: Maximum number of results to return
    
    Returns:
        List of tuples: [(User, distance), ...]
        Returns empty list if no matches found within threshold
    
    Note:
        Uses cosine distance (<->) operator from pgvector.
        Lower distance = more similar faces.
        Distance of 0.0 = identical, 2.0 = opposite
    
    TODO: Implement memory caching for frequently accessed embeddings
    TODO: Consider approximate nearest neighbor (ANN) algorithms for >100k users
    """
    # Convert embedding list to string format for pgvector
    embedding_str = "[" + ",".join(map(str, embedding)) + "]"
    
    # Query using pgvector's cosine distance operator (<->)
    # ORDER BY ensures closest matches first
    query = text("""
        SELECT id, name, embedding, created_at, embedding <-> :embedding AS distance
        FROM users
        WHERE embedding <-> :embedding < :threshold
        ORDER BY distance
        LIMIT :limit
    """)
    
    result = db.execute(
        query,
        {"embedding": embedding_str, "threshold": threshold, "limit": limit}
    )
    
    matches = []
    for row in result:
        user = User(
            id=row.id,
            name=row.name,
            embedding=row.embedding,
            created_at=row.created_at
        )
        matches.append((user, float(row.distance)))
    
    return matches


# TODO: Add database migration support using Alembic for schema changes
# TODO: Consider read replicas for scaling read-heavy workloads

