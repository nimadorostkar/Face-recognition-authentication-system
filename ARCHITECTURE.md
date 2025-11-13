# SYSTEM ARCHITECTURE

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT APPLICATIONS                            │
│                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│   │  Web Browser │  │ Mobile Apps  │  │   IoT/Edge   │               │
│   │  (JS/React)  │  │ (iOS/Android)│  │   Devices    │               │
│   └──────────────┘  └──────────────┘  └──────────────┘               │
│            │                 │                 │                        │
└────────────┼─────────────────┼─────────────────┼────────────────────────┘
             │                 │                 │
             │         HTTP/HTTPS (REST API)     │
             │                 │                 │
┌────────────▼─────────────────▼─────────────────▼────────────────────────┐
│                         API GATEWAY (Optional)                          │
│                    Load Balancer / Nginx / Traefik                      │
└────────────┬─────────────────┬─────────────────┬────────────────────────┘
             │                 │                 │
   ┌─────────▼─────┐  ┌────────▼────────┐  ┌────▼─────────┐
   │  FastAPI      │  │  FastAPI        │  │  FastAPI     │
   │  Instance 1   │  │  Instance 2     │  │  Instance N  │
   │  (Container)  │  │  (Container)    │  │  (Container) │
   └───────┬───────┘  └────────┬────────┘  └────┬─────────┘
           │                   │                 │
           │          ┌────────▼─────────┐       │
           └──────────►   Application    ◄───────┘
                      │     Layer        │
                      └────────┬─────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
   ┌──────────▼─────────┐  ┌──▼────────────┐  │
   │   Business Logic   │  │ Face Utils    │  │
   │   (main.py)        │  │ (Detection &  │  │
   │                    │  │  Recognition) │  │
   │ - Registration     │  │               │  │
   │ - Recognition      │  │ - dlib HOG    │  │
   │ - User Mgmt        │  │ - ResNet 128D │  │
   └──────────┬─────────┘  └───────────────┘  │
              │                                 │
   ┌──────────▼─────────┐  ┌──────────────────▼──────────┐
   │  Data Access Layer │  │   Validation Layer          │
   │  (database.py)     │  │   (schemas.py)              │
   │                    │  │                             │
   │ - SQLAlchemy ORM   │  │ - Pydantic Models           │
   │ - Connection Pool  │  │ - Input Validation          │
   │ - Query Builder    │  │ - Type Checking             │
   └──────────┬─────────┘  └─────────────────────────────┘
              │
              │
   ┌──────────▼─────────────────────────────────────┐
   │         PostgreSQL + pgvector                  │
   │                                                 │
   │  ┌──────────────────────────────────────────┐  │
   │  │ users                                    │  │
   │  │  - id (SERIAL PRIMARY KEY)               │  │
   │  │  - name (TEXT UNIQUE)                    │  │
   │  │  - embedding (VECTOR(128))               │  │
   │  │  - created_at (TIMESTAMP)                │  │
   │  └──────────────────────────────────────────┘  │
   │                                                 │
   │  ┌──────────────────────────────────────────┐  │
   │  │ IVFFlat Index (vector_cosine_ops)        │  │
   │  │ - Fast similarity search O(log n)        │  │
   │  │ - lists=100 for ~10k users               │  │
   │  └──────────────────────────────────────────┘  │
   │                                                 │
   │  Container: face_recognition_db                │
   └─────────────────────────────────────────────────┘
```

---

## Request Flow Diagram

### Registration Flow
```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /register/ {name, image_base64}
     ▼
┌────────────┐
│  FastAPI   │
│  Endpoint  │
└────┬───────┘
     │
     │ 1. Validate Input (Pydantic)
     ▼
┌─────────────────┐
│ Schemas.py      │
│ RegisterRequest │
└────┬────────────┘
     │ ✓ Validated
     ▼
┌─────────────────┐
│ Face Utils      │
└────┬────────────┘
     │
     │ 2. Decode base64 → numpy array
     ▼
┌─────────────────┐
│ Preprocessing   │
└────┬────────────┘
     │ 3. Convert to RGB, resize if needed
     ▼
┌─────────────────┐
│ Face Detection  │
│ (dlib HOG)      │
└────┬────────────┘
     │ 4. Detect face location
     ▼
┌─────────────────┐
│ Face Encoding   │
│ (dlib ResNet)   │
└────┬────────────┘
     │ 5. Extract 128D embedding
     ▼
┌─────────────────┐
│ Database Layer  │
└────┬────────────┘
     │ 6. Create User object
     │    User(name=..., embedding=[...])
     ▼
┌─────────────────┐
│ PostgreSQL      │
│ + pgvector      │
└────┬────────────┘
     │ 7. INSERT user row with vector
     │ 8. Build/update IVFFlat index
     ▼
┌─────────────────┐
│ Response        │
│ RegisterResponse│
└────┬────────────┘
     │ {status, name, user_id, message}
     ▼
┌─────────┐
│ Client  │
└─────────┘
```

### Recognition Flow
```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /recognize/ {image_base64}
     ▼
┌────────────┐
│  FastAPI   │
│  Endpoint  │
└────┬───────┘
     │
     │ 1. Validate Input
     ▼
┌─────────────────┐
│ Face Utils      │
└────┬────────────┘
     │
     │ 2. Decode → 3. Preprocess → 4. Detect → 5. Extract
     │    (Same pipeline as registration)
     ▼
┌─────────────────┐
│ Query Embedding │
│ [128D vector]   │
└────┬────────────┘
     │
     │ 6. find_similar_faces(embedding, threshold=0.45)
     ▼
┌─────────────────────────────────────────────────┐
│ PostgreSQL + pgvector                           │
│                                                 │
│ SELECT *, embedding <-> [query] AS distance    │
│ FROM users                                      │
│ WHERE embedding <-> [query] < 0.45              │
│ ORDER BY distance                               │
│ LIMIT 1;                                        │
│                                                 │
│ [Uses IVFFlat index for fast search]           │
└────┬────────────────────────────────────────────┘
     │
     │ 7. Return best match (if any)
     ▼
┌─────────────────┐
│ Confidence      │
│ Calculation     │
└────┬────────────┘
     │ 8. distance → confidence level
     │    < 0.35: high
     │    0.35-0.45: medium
     │    > 0.45: low/no match
     ▼
┌─────────────────┐
│ Response        │
│ RecognizeResponse│
└────┬────────────┘
     │ {match, name, distance, confidence}
     ▼
┌─────────┐
│ Client  │
└─────────┘
```

---

## Component Interaction Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                       FastAPI Application                       │
│                                                                 │
│  ┌──────────────┐                                              │
│  │   main.py    │──────────────────────┐                       │
│  │              │                       │                       │
│  │ Endpoints:   │                       │                       │
│  │ - /register/ │                       │                       │
│  │ - /recognize/│                       │                       │
│  │ - /health    │                       │                       │
│  │ - /users/    │                       │                       │
│  │ - /stats/    │                       │                       │
│  └───────┬──────┘                       │                       │
│          │                              │                       │
│          │ uses                         │ uses                  │
│          │                              │                       │
│  ┌───────▼──────┐    ┌──────────────┐  │  ┌──────────────┐    │
│  │  schemas.py  │◄───│ database.py  │◄─┴──│ face_utils.py│    │
│  │              │    │              │     │              │    │
│  │ - Request    │    │ - Models     │     │ - Detection  │    │
│  │   Validation │    │ - Session    │     │ - Encoding   │    │
│  │ - Response   │    │ - Queries    │     │ - Distance   │    │
│  │   Models     │    │ - pgvector   │     │ - Quality    │    │
│  └──────────────┘    └───────┬──────┘     └──────────────┘    │
│                              │                                 │
└──────────────────────────────┼─────────────────────────────────┘
                               │
                               │ SQL + Vector Ops
                               │
                     ┌─────────▼─────────┐
                     │   PostgreSQL      │
                     │   + pgvector      │
                     │                   │
                     │ - CRUD operations │
                     │ - Vector search   │
                     │ - Indexing        │
                     └───────────────────┘
```

---

## Data Flow: Image → Embedding → Database

```
Raw Image (JPEG/PNG)
       │
       │ base64 encoding
       ▼
Base64 String ─────────────────► API Request
       │                              │
       │ decode_image()               │
       ▼                              │
NumPy Array (RGB)                     │
   [H, W, 3]                          │
       │                              │
       │ preprocess_image()           │
       ▼                              │
Normalized Image                      │
       │                              │
       │ detect_faces()               │
       ▼                              │
Face Location                         │
  (top, right,                        │
   bottom, left)                      │
       │                              │
       │ extract_face_embedding()     │
       ▼                              │
128D Embedding                        │
  [0.1, -0.3, ..., 0.5]              │
  (NumPy array)                       │
       │                              │
       │ .tolist()                    │
       ▼                              │
128D List                             │
  [float, float, ...]                 │
       │                              │
       │ PostgreSQL insertion         │
       ▼                              ▼
┌────────────────────────────────────────┐
│          users table                   │
│                                        │
│ embedding column: vector(128)          │
│ [stored as native vector type]        │
└────────────────────────────────────────┘
       │
       │ IVFFlat indexing
       ▼
┌────────────────────────────────────────┐
│     Inverted File Index (IVF)          │
│                                        │
│ Cluster 1: [vec1, vec2, ...]          │
│ Cluster 2: [vec3, vec4, ...]          │
│ ...                                    │
│ Cluster 100: [vecN, ...]               │
│                                        │
│ [Enables O(log n) search]              │
└────────────────────────────────────────┘
```

---

## Similarity Search Mechanism

```
Query Embedding: [0.2, -0.1, ..., 0.4]
                        │
                        │ <-> operator (cosine distance)
                        ▼
┌────────────────────────────────────────────────────┐
│          pgvector Search Process                   │
│                                                    │
│  1. Find nearest cluster using IVFFlat index      │
│     - Compare query to cluster centroids          │
│     - Select top K clusters (probes)              │
│                                                    │
│  2. Search within selected clusters               │
│     - Calculate cosine distance to each vector    │
│     - Distance = 1 - cosine_similarity            │
│                                                    │
│  3. Filter by threshold (0.45)                    │
│     - Keep only matches below threshold           │
│                                                    │
│  4. Sort by distance (ascending)                  │
│     - Closest match first                         │
│                                                    │
│  5. Return top 1 result                           │
│     - (User object, distance)                     │
└────────────────────────────────────────────────────┘
                        │
                        ▼
            Match Result or No Match
```

### Cosine Distance Calculation
```
For two embeddings A and B:

cosine_similarity = (A · B) / (||A|| × ||B||)

cosine_distance = 1 - cosine_similarity

Range: [0.0, 2.0]
  0.0 = identical vectors
  1.0 = orthogonal (no similarity)
  2.0 = opposite direction
```

---

## Scalability Architecture (Future)

```
┌────────────────────────────────────────────────────────┐
│                   Load Balancer                        │
│                 (Nginx / HAProxy)                      │
└─────┬───────────────┬───────────────┬──────────────────┘
      │               │               │
      ▼               ▼               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│ FastAPI  │    │ FastAPI  │    │ FastAPI  │
│ Instance │    │ Instance │    │ Instance │
│    1     │    │    2     │    │    N     │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     │               │               │
     └───────────────┼───────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │ Redis  │  │Primary │  │ Read   │
    │ Cache  │  │  DB    │  │Replica │
    └────────┘  └────────┘  └────────┘
                     │
                     │ Replication
                     ▼
                ┌────────┐
                │ Backup │
                │   DB   │
                └────────┘
```

---

## Docker Container Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Host                           │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  Docker Network: face_recognition_default      │     │
│  │                                                 │     │
│  │  ┌──────────────────────┐  ┌────────────────┐ │     │
│  │  │   api Container      │  │  db Container  │ │     │
│  │  │                      │  │                │ │     │
│  │  │  FastAPI App         │  │  PostgreSQL 15 │ │     │
│  │  │  + face_recognition  │◄─┼► + pgvector   │ │     │
│  │  │  + OpenCV            │  │                │ │     │
│  │  │  + SQLAlchemy        │  │  Port: 5432    │ │     │
│  │  │                      │  │  (internal)    │ │     │
│  │  │  Port: 8000          │  │                │ │     │
│  │  │  (mapped to host)    │  └────────────────┘ │     │
│  │  └──────────────────────┘                     │     │
│  │                                                │     │
│  │  Volume: postgres_data ──┐                    │     │
│  └──────────────────────────┼────────────────────┘     │
│                             │                          │
│  Host Filesystem            ▼                          │
│  ┌──────────────────────────────────────┐              │
│  │  /var/lib/docker/volumes/            │              │
│  │    postgres_data/                    │              │
│  │      (persistent database storage)   │              │
│  └──────────────────────────────────────┘              │
│                                                         │
│  Port Mapping:                                          │
│    Host:8000 → Container:8000 (API)                    │
│    Host:5432 → Container:5432 (DB, optional)           │
└──────────────────────────────────────────────────────────┘
```

---

## Security Layers (Future Production)

```
┌─────────────────────────────────────────────────┐
│              Client Request                     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         1. TLS/HTTPS Termination                │
│            (SSL Certificate)                    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         2. Firewall / WAF                       │
│            (DDoS protection, IP filtering)      │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         3. Rate Limiting                        │
│            (Prevent abuse)                      │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         4. API Key / JWT Authentication         │
│            (Verify identity)                    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         5. Input Validation                     │
│            (Pydantic schemas)                   │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         6. Authorization                        │
│            (Check permissions)                  │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         7. Business Logic                       │
│            (Process request)                    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         8. Database Query (Parameterized)       │
│            (SQL injection prevention)           │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         9. Audit Logging                        │
│            (Track all operations)               │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         10. Response Sanitization               │
│            (Remove sensitive data)              │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│              Client Response                    │
└─────────────────────────────────────────────────┘
```

---

**Architecture Version**: 1.0
**Last Updated**: November 13, 2024

