# Docker Build Optimization Guide

## Problem
Building `dlib` from source in Docker takes 10+ minutes and can appear to hang.

## Solutions (Choose One)

### Solution 1: Use the Optimized Multi-Stage Dockerfile (RECOMMENDED)
The main `Dockerfile` has been optimized with:
- Multi-stage build to reduce final image size
- Separate dlib installation step
- Better layer caching

**Build Command:**
```bash
docker-compose build --no-cache
```

### Solution 2: Use the Fast Dockerfile (FASTEST)
If you want the absolute fastest build, use `Dockerfile.fast`:

```bash
# In docker-compose.yml, change the api service:
# api:
#   build:
#     context: ./api
#     dockerfile: Dockerfile.fast
```

Then rebuild:
```bash
docker-compose build api
```

### Solution 3: Use Docker BuildKit (Parallel Builds)
Enable BuildKit for faster parallel builds:

```bash
export DOCKER_BUILDKIT=1
docker-compose build
```

### Solution 4: Increase Docker Resources
If builds are timing out:
1. Open Docker Desktop Settings
2. Go to Resources
3. Increase:
   - **CPUs**: Set to 4-6 cores
   - **Memory**: Set to 8GB minimum
   - **Swap**: Set to 2GB
4. Click "Apply & Restart"

### Solution 5: Use Pre-built Image (ULTRA FAST)
Pull a pre-built Python image with face_recognition already installed:

```dockerfile
FROM jjanzic/docker-python3-opencv:latest
# Then just install your FastAPI dependencies
```

## Expected Build Times

| Method | First Build | Rebuild with Cache |
|--------|-------------|-------------------|
| Original Dockerfile | 10-15 min | 5-10 min |
| Optimized Dockerfile | 8-12 min | 2-3 min |
| Dockerfile.fast | 5-8 min | 1-2 min |
| Pre-built image | 2-3 min | 30 sec |

## Tips to Speed Up Development

### 1. Use Volume Mounts for Code (Already configured)
Your `docker-compose.yml` already has volume mounts, so code changes don't require rebuilds.

### 2. Keep Containers Running
Instead of rebuilding, just restart:
```bash
docker-compose restart api
```

### 3. Use Docker Layer Caching
Don't change `requirements.txt` frequently. Add new dependencies carefully.

### 4. Build Once, Run Many Times
After initial build, use:
```bash
docker-compose up
```
Not:
```bash
docker-compose up --build  # This rebuilds unnecessarily
```

## Troubleshooting

### Build Appears Stuck on "Building wheel for dlib"
This is NORMAL! It can take 5-10 minutes. You'll see:
```
Building wheel for dlib (pyproject.toml): still running...
```

**Solution**: Just wait. Check:
- Docker Desktop Dashboard shows CPU usage (means it's working)
- No error messages
- Process is consuming resources

### Build Fails with Memory Error
```
error: command 'gcc' failed
```

**Solution**: Increase Docker memory to 8GB minimum.

### Network Timeout Downloading Packages
If you see timeout errors:

**Solution**: Add to Dockerfile before pip install:
```dockerfile
ENV PIP_DEFAULT_TIMEOUT=1000
RUN pip install --retries 5 --timeout 1000 -r requirements.txt
```

## Current Status
✅ Dockerfile optimized with multi-stage build
✅ .dockerignore added to reduce build context
✅ Dockerfile.fast available as alternative
✅ Volume mounts configured for hot-reload

## Next Steps
1. Try building with: `docker-compose build api`
2. If still slow, try `Dockerfile.fast`
3. Increase Docker resources if needed
4. Consider pre-built image for fastest results

