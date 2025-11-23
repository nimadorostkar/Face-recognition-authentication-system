@echo off
REM Docker Build Helper Script for Face Recognition System (Windows)
REM This script optimizes the Docker build process

echo ========================================
echo Face Recognition System - Docker Build
echo ========================================
echo.

REM Enable BuildKit for faster builds
set DOCKER_BUILDKIT=1
set COMPOSE_DOCKER_CLI_BUILD=1

echo [OK] BuildKit enabled
echo.

REM Main menu
echo Choose a build option:
echo 1) Full build (clean + build all services)
echo 2) Quick build (use cache)
echo 3) Build API only (optimized)
echo 4) Build with Dockerfile.fast (fastest)
echo 5) Just start containers (no rebuild)
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto fullbuild
if "%choice%"=="2" goto quickbuild
if "%choice%"=="3" goto apionly
if "%choice%"=="4" goto fastbuild
if "%choice%"=="5" goto startonly
goto invalid

:fullbuild
echo.
echo [BUILD] Full build with cleanup...
docker system prune -f
docker-compose build --no-cache
goto finish

:quickbuild
echo.
echo [BUILD] Quick build with cache...
docker-compose build
goto finish

:apionly
echo.
echo [BUILD] Building API service only...
docker-compose build api
goto finish

:fastbuild
echo.
echo [BUILD] Building with Dockerfile.fast...
if exist "api\Dockerfile.fast" (
    move api\Dockerfile api\Dockerfile.backup
    move api\Dockerfile.fast api\Dockerfile
    docker-compose build api
    move api\Dockerfile api\Dockerfile.fast
    move api\Dockerfile.backup api\Dockerfile
    echo [OK] Build complete
) else (
    echo [ERROR] Dockerfile.fast not found
    exit /b 1
)
goto finish

:startonly
echo.
echo [START] Starting containers...
docker-compose up
exit /b 0

:invalid
echo [ERROR] Invalid choice
exit /b 1

:finish
echo.
echo [OK] Build complete!
echo.
set /p start="Start containers now? (y/n): "
if /i "%start%"=="y" (
    echo.
    echo [START] Starting containers...
    docker-compose up
) else (
    echo.
    echo To start containers later, run: docker-compose up
)

