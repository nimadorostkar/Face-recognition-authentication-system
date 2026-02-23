"""
Database configuration and models for face recognition system.

Features:
- SQLAlchemy connection pooling with health checks
- pgvector embeddings for face similarity search
- Automatic database creation if missing (self-healing)
- Runtime auto-recovery: if the database disappears while the API is
  running, the next request will recreate it and rebuild the schema
- Retry logic with exponential backoff
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
import threading

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/face_recognition")
DB_MAX_RETRIES = int(os.getenv("DB_MAX_RETRIES", "10"))
DB_RETRY_DELAY = float(os.getenv("DB_RETRY_DELAY", "2.0"))
RECOVERY_COOLDOWN = int(os.getenv("DB_RECOVERY_COOLDOWN", "15"))

# ── Engine lifecycle ──────────────────────────────────────────────────
_engine_lock = threading.Lock()
_last_recovery_time: float = 0.0

engine = None
SessionLocal = None

Base = declarative_base()


def _build_engine():
    """(Re)create the SQLAlchemy engine and session factory."""
    global engine, SessionLocal
    old = engine
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=300,
        echo=False,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if old is not None:
        try:
            old.dispose()
        except Exception:
            pass


_build_engine()


# ── Helpers ───────────────────────────────────────────────────────────

def _parse_admin_url(database_url: str) -> tuple:
    """Return an admin URL (targeting the 'postgres' db) and the target db name."""
    parsed = urlparse(database_url)
    db_name = parsed.path.lstrip("/")
    admin_parsed = parsed._replace(path="/postgres")
    admin_url = urlunparse(admin_parsed)
    return admin_url, db_name


def _is_database_missing_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "does not exist" in msg and "database" in msg


# ── Database creation ─────────────────────────────────────────────────

def ensure_database_exists():
    """
    Ensure the target database exists, creating it if necessary.

    Connects to the default 'postgres' database to check whether the target
    database exists.  If not, it creates the database.
    Retries with exponential backoff when PostgreSQL is not yet reachable.
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


# ── Model ─────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    mobile = Column(String, nullable=True, index=True)
    embedding = Column(Vector(128), nullable=False)
    visit_count = Column(Integer, default=0, nullable=False, server_default='0')
    last_visit_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<User(id={self.id}, name='{self.name}', mobile='{self.mobile}')>"


# ── Schema application ────────────────────────────────────────────────

def _apply_schema():
    """Create extensions, tables, columns, and indexes on the current engine."""
    with engine.connect() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        connection.commit()
        logger.info("✓ pgvector extension enabled")

    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database tables created")

    with engine.connect() as connection:
        try:
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0 NOT NULL"
            ))
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMP"
            ))
            connection.commit()
            logger.info("✓ visit_count / last_visit_at columns ensured")
        except Exception as e:
            logger.debug(f"Column migration skipped: {e}")

    with engine.connect() as connection:
        connection.execute(text("DROP INDEX IF EXISTS users_embedding_idx"))
        connection.execute(text(
            "CREATE INDEX users_embedding_idx ON users "
            "USING ivfflat (embedding vector_cosine_ops) "
            "WITH (lists = 100)"
        ))
        connection.commit()
        logger.info("✓ Vector similarity index created")


# ── Auto-recovery ─────────────────────────────────────────────────────

def attempt_recovery() -> bool:
    """
    Thread-safe database recovery with cooldown.

    When the database disappears at runtime (e.g. dropped externally),
    this function recreates it, rebuilds the engine, and reapplies the
    schema.  A cooldown prevents stampeding when many requests fail at
    once.
    """
    global _last_recovery_time
    now = time.time()
    if now - _last_recovery_time < RECOVERY_COOLDOWN:
        return False

    with _engine_lock:
        if time.time() - _last_recovery_time < RECOVERY_COOLDOWN:
            return False
        _last_recovery_time = time.time()

        logger.warning("🔄 Attempting automatic database recovery...")
        try:
            ensure_database_exists()
            _build_engine()
            _apply_schema()
            logger.info("✓ Database auto-recovered successfully!")
            return True
        except Exception as e:
            logger.error(f"✗ Auto-recovery failed: {e}")
            return False


# ── Session management ────────────────────────────────────────────────

def get_db() -> Session:
    """
    FastAPI dependency that yields a database session.

    On the first request after the database disappears, it automatically
    triggers recovery (recreate DB + schema) and retries the connection.
    If a database error occurs *during* a request, recovery is triggered
    for the benefit of subsequent requests (the current request still
    fails with 500).
    """
    for attempt in range(2):
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        except Exception as e:
            db.close()
            if attempt == 0 and _is_database_missing_error(e):
                attempt_recovery()
                continue
            raise
        try:
            yield db
        except Exception as e:
            if _is_database_missing_error(e):
                attempt_recovery()
            raise
        finally:
            db.close()
        return


# ── Initialization ────────────────────────────────────────────────────

def init_db():
    """
    Full database initialization on application startup.

    1. Ensures the database exists (creates if missing)
    2. Rebuilds the engine so connections point to the verified database
    3. Applies schema (extensions, tables, indexes)
    """
    ensure_database_exists()
    _build_engine()
    _apply_schema()


# ── Query helpers ─────────────────────────────────────────────────────

def find_similar_faces(db: Session, embedding: List[float], threshold: float = 0.45, limit: int = 1):
    """
    Find similar faces using pgvector cosine-distance search.

    Returns list of (User, distance) tuples.  Empty list if no matches
    within threshold.
    """
    embedding_str = "[" + ",".join(map(str, embedding)) + "]"

    query = text("""
        SELECT id, name, embedding, created_at, visit_count, last_visit_at,
               embedding <-> :embedding AS distance
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
            created_at=row.created_at,
            visit_count=row.visit_count,
            last_visit_at=row.last_visit_at,
        )
        matches.append((user, float(row.distance)))

    return matches


VISIT_COOLDOWN_MINUTES = 30


def increment_visit_if_eligible(db: Session, user_id: int) -> int:
    """
    Increment a user's visit_count if more than 30 minutes have passed
    since their last counted visit.  Returns the updated visit_count.
    """
    now = datetime.utcnow()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return 0

    should_increment = (
        user.last_visit_at is None
        or (now - user.last_visit_at).total_seconds() > VISIT_COOLDOWN_MINUTES * 60
    )

    if should_increment:
        user.visit_count = (user.visit_count or 0) + 1
        user.last_visit_at = now
        db.commit()
        db.refresh(user)
        logger.info(
            f"✓ Visit counted for {user.name}: visit #{user.visit_count}"
        )
    else:
        remaining = VISIT_COOLDOWN_MINUTES * 60 - (now - user.last_visit_at).total_seconds()
        logger.info(
            f"⏳ Visit not counted for {user.name} "
            f"(within 30-min window, {remaining:.0f}s remaining)"
        )

    return user.visit_count
