#!/bin/bash

# Docker Build Helper Script for Face Recognition System
# This script optimizes the Docker build process

echo "🚀 Face Recognition System - Docker Build Helper"
echo "================================================"
echo ""

# Enable BuildKit for faster builds
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "✅ BuildKit enabled for faster builds"
echo ""

# Function to check Docker resources
check_docker_resources() {
    echo "📊 Checking Docker resources..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    echo "✅ Docker is running"
}

# Function to clean up old images
cleanup() {
    echo ""
    echo "🧹 Cleaning up old Docker images..."
    docker system prune -f
    echo "✅ Cleanup complete"
}

# Main menu
echo "Choose a build option:"
echo "1) Full build (clean + build all services)"
echo "2) Quick build (use cache)"
echo "3) Build API only (optimized)"
echo "4) Build with Dockerfile.fast (fastest)"
echo "5) Just start containers (no rebuild)"
echo ""
read -p "Enter your choice (1-5): " choice

check_docker_resources

case $choice in
    1)
        echo ""
        echo "🔨 Full build with cleanup..."
        cleanup
        docker-compose build --no-cache
        ;;
    2)
        echo ""
        echo "⚡ Quick build with cache..."
        docker-compose build
        ;;
    3)
        echo ""
        echo "🎯 Building API service only..."
        docker-compose build api
        ;;
    4)
        echo ""
        echo "🚄 Building with Dockerfile.fast..."
        # Temporarily use Dockerfile.fast
        if [ -f "./api/Dockerfile.fast" ]; then
            mv ./api/Dockerfile ./api/Dockerfile.backup
            mv ./api/Dockerfile.fast ./api/Dockerfile
            docker-compose build api
            mv ./api/Dockerfile ./api/Dockerfile.fast
            mv ./api/Dockerfile.backup ./api/Dockerfile
            echo "✅ Build complete (Dockerfile restored)"
        else
            echo "❌ Dockerfile.fast not found"
            exit 1
        fi
        ;;
    5)
        echo ""
        echo "▶️  Starting containers without rebuild..."
        docker-compose up
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Build complete!"
echo ""
read -p "Start containers now? (y/n): " start

if [ "$start" = "y" ] || [ "$start" = "Y" ]; then
    echo ""
    echo "▶️  Starting containers..."
    docker-compose up
else
    echo ""
    echo "To start containers later, run: docker-compose up"
fi

