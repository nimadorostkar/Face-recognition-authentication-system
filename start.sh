#!/bin/bash

# Quick start script for Face Recognition Authentication System
# This script helps you quickly start, stop, and manage the system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed"
}

# Start the system
start_system() {
    print_header "Starting Face Recognition System"
    
    check_docker
    
    print_info "Building and starting containers..."
    docker-compose up --build -d
    
    print_info "Waiting for services to be ready..."
    sleep 5
    
    # Wait for API to be ready
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            print_success "API is ready!"
            break
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        print_error "API failed to start. Check logs with: ./start.sh logs"
        exit 1
    fi
    
    echo ""
    print_success "System started successfully!"
    print_info "API: http://localhost:8000"
    print_info "Docs: http://localhost:8000/docs"
    print_info "Health: http://localhost:8000/health"
}

# Stop the system
stop_system() {
    print_header "Stopping Face Recognition System"
    
    print_info "Stopping containers..."
    docker-compose down
    
    print_success "System stopped"
}

# Restart the system
restart_system() {
    print_header "Restarting Face Recognition System"
    
    stop_system
    start_system
}

# Show logs
show_logs() {
    print_header "System Logs"
    
    if [ -z "$1" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$1"
    fi
}

# Show status
show_status() {
    print_header "System Status"
    
    docker-compose ps
    
    echo ""
    print_info "Testing API health..."
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        response=$(curl -s http://localhost:8000/health)
        print_success "API is healthy"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        print_error "API is not responding"
    fi
}

# Clean up everything
clean_system() {
    print_header "Cleaning Up System"
    
    print_warning "This will remove all containers, volumes, and data!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Removing containers and volumes..."
        docker-compose down -v
        print_success "Cleanup complete"
    else
        print_info "Cleanup cancelled"
    fi
}

# Run tests
run_tests() {
    print_header "Running API Tests"
    
    if [ ! -f "test_api.py" ]; then
        print_error "test_api.py not found"
        exit 1
    fi
    
    print_info "Installing test dependencies..."
    pip3 install requests 2>&1 | grep -v "already satisfied" || true
    
    if [ -z "$1" ]; then
        print_warning "No image provided. Running basic tests only."
        python3 test_api.py
    else
        print_info "Testing with image: $1"
        python3 test_api.py "$1"
    fi
}

# Show help
show_help() {
    cat << EOF
Face Recognition Authentication System - Quick Start Script

Usage: ./start.sh [command] [options]

Commands:
    start       Start the system (default)
    stop        Stop the system
    restart     Restart the system
    status      Show system status
    logs        Show logs (add 'api' or 'db' to filter)
    clean       Remove all containers and data
    test        Run API tests (provide image path as argument)
    help        Show this help message

Examples:
    ./start.sh                    # Start the system
    ./start.sh stop               # Stop the system
    ./start.sh logs api           # Show API logs
    ./start.sh test face.jpg      # Test with face image
    ./start.sh clean              # Clean up everything

After starting:
    - API: http://localhost:8000
    - Docs: http://localhost:8000/docs
    - Health: http://localhost:8000/health
EOF
}

# Main script logic
case "${1:-start}" in
    start)
        start_system
        ;;
    stop)
        stop_system
        ;;
    restart)
        restart_system
        ;;
    logs)
        show_logs "$2"
        ;;
    status)
        show_status
        ;;
    clean)
        clean_system
        ;;
    test)
        run_tests "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

