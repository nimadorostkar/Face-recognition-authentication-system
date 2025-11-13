#!/bin/bash

# Quick start script for Face Recognition Frontend

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

print_header "Face Recognition Frontend Setup"

# Check if backend is running
print_info "Checking if backend is running..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    print_success "Backend is running on http://localhost:8000"
else
    print_error "Backend is not running!"
    echo ""
    echo "Please start the backend first:"
    echo "  cd /Users/nima/Projects/Face-recognition-authentication-system"
    echo "  ./start.sh start"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
else
    print_success "Dependencies already installed"
fi

print_header "Starting Development Server"

print_info "Starting Next.js on http://localhost:3000"
print_info "Press Ctrl+C to stop"
echo ""

npm run dev

