# Use Python 3.10 slim image as builder
FROM python:3.10-slim as builder

# Set working directory
WORKDIR /app

# Install system dependencies for dlib and OpenCV (build tools)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    libboost-python-dev \
    libboost-system-dev \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install wheel
RUN pip install --upgrade pip setuptools wheel

# Copy requirements
COPY requirements.txt .

# Install dlib dependencies first
RUN pip install --no-cache-dir numpy==1.24.3

# Install dlib with build optimizations (this is the slow part)
# Using face-recognition package which includes dlib as dependency
# This avoids CMake version conflicts
ENV DLIB_NO_GUI_SUPPORT=1
RUN pip install --no-cache-dir face-recognition==1.3.0

# Install remaining dependencies (skip face-recognition as it's already installed)
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    python-multipart==0.0.6 \
    sqlalchemy==2.0.23 \
    psycopg2-binary==2.9.9 \
    pgvector==0.2.3 \
    opencv-python-headless==4.8.1.78 \
    Pillow==10.1.0 \
    pydantic==2.5.0 \
    pydantic-settings==2.1.0 \
    python-dotenv==1.0.0 \
    kavenegar==1.1.0

# Final stage - smaller runtime image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install only runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y \
    libopenblas0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libglib2.0-0 \
    libpng16-16 \
    libjpeg62-turbo \
    libwebp7 \
    libtiff6 \
    libboost-python1.83.0 \
    libboost-system1.83.0 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Command will be overridden by docker-compose
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

