-- Initialize pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table with vector embeddings
-- Note: Using 128D for dlib embeddings, can be changed to 512 for ArcFace/InsightFace
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    embedding vector(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fast similarity search
-- Using ivfflat index for efficient nearest neighbor search
-- TODO: For 5000+ users, tune lists parameter (sqrt of row count is a good starting point)
CREATE INDEX IF NOT EXISTS users_embedding_idx ON users 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE users TO postgres;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO postgres;

