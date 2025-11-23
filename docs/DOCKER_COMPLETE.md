# 🐳 DOCKER SETUP COMPLETE

## ✅ Frontend Now Dockerized!

The frontend is now fully integrated into the Docker setup. The entire system (backend + frontend + database) runs with one command.

---

## 🚀 Quick Start (All Services)

### One Command to Rule Them All:
```bash
cd /Users/nima/Projects/Face-recognition-authentication-system
docker compose up --build
```

That's it! Everything starts together:
- 🗄️ PostgreSQL + pgvector (port 5432)
- ⚡ FastAPI backend (port 8000)
- 🎨 Next.js frontend (port 3000)

### Access the System:
```
Frontend: http://localhost:3000
Backend:  http://localhost:8000
API Docs: http://localhost:8000/docs
```

---

## 🐳 Docker Services

### 3 Services in docker-compose.yml:

```yaml
services:
  db:                    # PostgreSQL + pgvector
    ports: 5432:5432
    
  api:                   # FastAPI backend
    ports: 8000:8000
    depends_on: db
    
  frontend:              # Next.js frontend (NEW!)
    ports: 3000:3000
    depends_on: api
```

---

## 📂 Updated Files

### New Files:
- ✅ `frontend/Dockerfile` - Next.js container config
- ✅ `frontend/.dockerignore` - Docker ignore rules

### Updated Files:
- ✅ `docker-compose.yml` - Added frontend service + network
- ✅ `frontend/next.config.js` - Standalone output for Docker
- ✅ `frontend/src/lib/api.ts` - Environment-based API URL

---

## 🔧 Development Options

### Option 1: All in Docker (Recommended)
```bash
# Start everything
docker compose up --build

# View logs
docker compose logs -f

# Stop everything
docker compose down
```

### Option 2: Backend in Docker, Frontend Local
```bash
# Start backend only
docker compose up db api

# In another terminal - start frontend locally
cd frontend
npm run dev
```

### Option 3: Everything Local (Original)
```bash
# Backend
./start.sh start

# Frontend (separate terminal)
cd frontend
npm run dev
```

---

## 🌐 Network Configuration

All services are on the same Docker network (`face_recognition_network`):
- Services can communicate using service names
- Frontend → Backend: Uses `localhost:8000` (exposed ports)
- Backend → Database: Uses `db:5432` (service name)

---

## 🔄 Updated Start Script

The main `start.sh` script now handles the frontend too:

```bash
# Start all services (backend + frontend)
./start.sh start

# View all logs
./start.sh logs

# View frontend logs only
./start.sh logs frontend

# Stop all services
./start.sh stop
```

---

## 📊 Container Overview

```
┌─────────────────────────────────────────────┐
│   Docker Host (Your Computer)              │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │  face_recognition_network          │    │
│  │                                     │    │
│  │  ┌──────────────┐                  │    │
│  │  │  db          │                  │    │
│  │  │  PostgreSQL  │                  │    │
│  │  │  :5432       │                  │    │
│  │  └──────┬───────┘                  │    │
│  │         │                          │    │
│  │  ┌──────▼───────┐                  │    │
│  │  │  api         │                  │    │
│  │  │  FastAPI     │                  │    │
│  │  │  :8000       │◄─────────┐       │    │
│  │  └──────────────┘          │       │    │
│  │                            │       │    │
│  │  ┌──────────────┐          │       │    │
│  │  │  frontend    │          │       │    │
│  │  │  Next.js     │──────────┘       │    │
│  │  │  :3000       │                  │    │
│  │  └──────────────┘                  │    │
│  │                                     │    │
│  └────────────────────────────────────┘    │
│         │         │         │              │
│      Port 5432  Port 8000  Port 3000       │
│         │         │         │              │
└─────────┼─────────┼─────────┼──────────────┘
          │         │         │
       (Optional) (API)   (Frontend)
       DB Access   Docs    Web App
```

---

## 🎯 Benefits of Docker Setup

### ✅ Advantages:
1. **One Command**: Start entire stack instantly
2. **Consistency**: Same environment everywhere
3. **Isolation**: No dependency conflicts
4. **Easy Reset**: `docker compose down -v` clears everything
5. **Production-Like**: Matches deployment environment
6. **No Node/Python Required**: Everything in containers

### ⚠️ Considerations:
1. **Build Time**: Initial build takes 2-5 minutes
2. **Hot Reload**: Works but slightly slower than local
3. **Resource Usage**: Docker uses ~1-2GB RAM
4. **Volume Mounting**: API has hot reload, frontend rebuilds

---

## 🔨 Docker Commands

### Start Services:
```bash
# Build and start all
docker compose up --build

# Start in background
docker compose up -d

# Start specific service
docker compose up frontend
```

### View Logs:
```bash
# All logs
docker compose logs -f

# Specific service
docker compose logs -f frontend
docker compose logs -f api
docker compose logs -f db
```

### Stop Services:
```bash
# Stop all
docker compose down

# Stop and remove volumes (clears DB)
docker compose down -v
```

### Restart Services:
```bash
# Restart all
docker compose restart

# Restart specific
docker compose restart frontend
```

### Rebuild:
```bash
# Rebuild specific service
docker compose build frontend

# Rebuild and start
docker compose up --build frontend
```

---

## 🐛 Troubleshooting

### Frontend Not Building?
```bash
# Check logs
docker compose logs frontend

# Rebuild from scratch
docker compose build --no-cache frontend
```

### Can't Connect to Backend?
```bash
# Check API is running
curl http://localhost:8000/health

# Check network
docker network ls
docker network inspect face-recognition-authentication-system_face_recognition_network
```

### Port Already in Use?
```bash
# Frontend (3000)
lsof -ti:3000 | xargs kill

# Backend (8000)
lsof -ti:8000 | xargs kill

# Or change ports in docker-compose.yml
```

### Rebuild Everything:
```bash
# Stop and remove everything
docker compose down -v

# Remove all images
docker compose rm -f

# Rebuild from scratch
docker compose up --build
```

---

## 📝 Environment Variables

### Frontend (.env.local - optional):
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Production:
```yaml
# docker-compose.prod.yml
services:
  frontend:
    environment:
      NEXT_PUBLIC_API_URL: https://api.yourdomain.com
```

---

## ✅ Complete Setup Checklist

- ✅ Backend Dockerfile (api/Dockerfile)
- ✅ Frontend Dockerfile (frontend/Dockerfile)
- ✅ Docker Compose with 3 services
- ✅ Docker network for inter-service communication
- ✅ Environment variable configuration
- ✅ Volume mounts for hot reload
- ✅ Health checks for dependencies
- ✅ .dockerignore files
- ✅ Updated documentation

---

## 🎉 Ready to Use!

**Start the complete system:**
```bash
docker compose up --build
```

**Then open:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs

Everything runs together in Docker! 🐳

---

**Updated**: November 13, 2024  
**Status**: ✅ Fully Dockerized

