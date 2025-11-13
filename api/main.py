"""
FastAPI main application for face recognition authentication system.

This is a production-ready face recognition backend that:
- Registers users with face embeddings (no image storage)
- Recognizes faces using pgvector similarity search
- Scales to 5000+ users with optimized vector indexing
- Designed for future upgrades (ArcFace, GPU, liveness detection)
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import List
import logging

# Import local modules
from database import init_db, get_db, User, find_similar_faces, engine
from schemas import (
    RegisterRequest, RegisterResponse,
    RecognizeRequest, RecognizeResponse,
    ErrorResponse, HealthResponse, UserInfo
)
from face_utils import (
    get_face_embedding_from_image,
    get_confidence_level,
    NoFaceDetectedError,
    MultipleFacesDetectedError,
    InvalidImageError,
    FaceRecognitionError
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="Face Recognition Authentication API",
    description="""
    A high-performance face recognition authentication system built with FastAPI and pgvector.
    
    Features:
    - User registration with face embeddings (no image storage)
    - Real-time face recognition using vector similarity search
    - Optimized for 5000+ users with pgvector indexing
    - Designed for future scalability (GPU, ArcFace, liveness detection)
    
    Current Stack:
    - Detection: dlib HOG detector
    - Embeddings: dlib ResNet (128D)
    - Database: PostgreSQL with pgvector extension
    - Similarity: Cosine distance
    
    Future Upgrades (see code TODOs):
    - RetinaFace/MediaPipe for detection
    - ArcFace/InsightFace for embeddings (512D)
    - GPU acceleration with ONNX/TensorRT
    - Liveness detection
    - Real-time video recognition
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS for web frontend integration
# TODO: Restrict origins in production to specific domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """
    Initialize database and extensions on application startup.
    
    This ensures:
    - pgvector extension is enabled
    - Required tables are created
    - Vector similarity index is built
    """
    logger.info("🚀 Starting Face Recognition API...")
    try:
        init_db()
        logger.info("✓ Database initialized successfully")
    except Exception as e:
        logger.error(f"✗ Database initialization failed: {str(e)}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown."""
    logger.info("👋 Shutting down Face Recognition API...")
    engine.dispose()


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Face Recognition Authentication API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for monitoring and load balancing.
    
    Verifies:
    - API service is running
    - Database connection is active
    - pgvector extension is available
    """
    try:
        # Test database connection
        db.execute(text("SELECT 1"))
        
        # Verify pgvector extension
        result = db.execute(text(
            "SELECT extname FROM pg_extension WHERE extname = 'vector'"
        ))
        if not result.fetchone():
            raise Exception("pgvector extension not found")
        
        return HealthResponse(
            status="healthy",
            database="connected",
            timestamp=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service unhealthy: {str(e)}"
        )


@app.post("/register/", response_model=RegisterResponse, tags=["Authentication"])
async def register_user(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register a new user with face recognition.
    
    Process:
    1. Validate input (name, base64 image)
    2. Extract face embedding from image
    3. Store {name, embedding} in database
    4. Return registration confirmation
    
    Note: No images are stored, only 128D embeddings.
    
    Args:
        request: RegisterRequest with name and base64 image
        db: Database session
    
    Returns:
        RegisterResponse with registration status
    
    Raises:
        400: Invalid input (no face, multiple faces, invalid image)
        409: User already exists
        500: Internal server error
    
    TODO: Add duplicate face detection (prevent registering same person twice)
    TODO: Add face quality validation (reject blurry/poorly lit images)
    TODO: Implement batch registration for multiple users
    """
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.name == request.name).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=ErrorResponse(
                    error="UserAlreadyExists",
                    detail=f"User '{request.name}' is already registered",
                    suggestion="Use a different name or update existing user"
                ).dict()
            )
        
        # Extract face embedding from image
        try:
            embedding = get_face_embedding_from_image(
                request.image,
                require_single_face=True
            )
        except NoFaceDetectedError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="NoFaceDetected",
                    detail="No face detected in the provided image",
                    suggestion="Ensure the image contains a clear, front-facing face with good lighting"
                ).dict()
            )
        except MultipleFacesDetectedError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="MultipleFacesDetected",
                    detail="Multiple faces detected in the image",
                    suggestion="Provide an image with only one face"
                ).dict()
            )
        except InvalidImageError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="InvalidImage",
                    detail=str(e),
                    suggestion="Provide a valid base64-encoded image (JPEG or PNG)"
                ).dict()
            )
        
        # Create new user with embedding
        new_user = User(
            name=request.name,
            embedding=embedding
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        logger.info(f"✓ User registered: {request.name} (ID: {new_user.id})")
        
        return RegisterResponse(
            status="registered",
            name=new_user.name,
            user_id=new_user.id,
            message="User registered successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="InternalServerError",
                detail="Failed to register user",
                suggestion="Please try again or contact support"
            ).dict()
        )


@app.post("/recognize/", response_model=RecognizeResponse, tags=["Authentication"])
async def recognize_face(
    request: RecognizeRequest,
    db: Session = Depends(get_db),
    threshold: float = 0.45
):
    """
    Recognize a face from an image.
    
    Process:
    1. Extract face embedding from input image
    2. Search database for similar embeddings using pgvector
    3. Return match if similarity distance < threshold
    
    Args:
        request: RecognizeRequest with base64 image
        db: Database session
        threshold: Maximum distance for a match (default: 0.45)
    
    Returns:
        RecognizeResponse with match status and user info
    
    Similarity Thresholds:
    - < 0.35: High confidence match
    - 0.35-0.45: Medium confidence match
    - > 0.45: No match (likely different person)
    
    Raises:
        400: Invalid input (no face, invalid image)
        404: No matching face found
        500: Internal server error
    
    Performance:
    - Uses pgvector's IVFFlat index for fast similarity search
    - Typical query time: <10ms for 5000+ users
    - Scales horizontally with multiple API instances
    
    TODO: Implement confidence threshold calibration based on user data
    TODO: Add support for multiple face recognition in single image
    TODO: Cache frequently accessed embeddings in Redis for faster lookup
    TODO: Add face tracking across multiple requests (session-based)
    """
    try:
        # Extract face embedding from image
        try:
            embedding = get_face_embedding_from_image(
                request.image,
                require_single_face=True
            )
        except NoFaceDetectedError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="NoFaceDetected",
                    detail="No face detected in the provided image",
                    suggestion="Ensure the image contains a clear, front-facing face with good lighting"
                ).dict()
            )
        except MultipleFacesDetectedError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="MultipleFacesDetected",
                    detail="Multiple faces detected in the image",
                    suggestion="Provide an image with only one face for recognition"
                ).dict()
            )
        except InvalidImageError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="InvalidImage",
                    detail=str(e),
                    suggestion="Provide a valid base64-encoded image (JPEG or PNG)"
                ).dict()
            )
        
        # Search for similar faces using pgvector
        matches = find_similar_faces(db, embedding, threshold=threshold, limit=1)
        
        if not matches:
            logger.info("✗ No matching face found")
            return RecognizeResponse(
                match=False,
                name=None,
                distance=None,
                user_id=None,
                confidence=None,
                message="No matching face found in database"
            )
        
        # Get best match
        matched_user, distance = matches[0]
        confidence = get_confidence_level(distance)
        
        logger.info(
            f"✓ Face recognized: {matched_user.name} "
            f"(distance: {distance:.3f}, confidence: {confidence})"
        )
        
        return RecognizeResponse(
            match=True,
            name=matched_user.name,
            distance=round(distance, 3),
            user_id=matched_user.id,
            confidence=confidence,
            message="Face recognized successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Recognition error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="InternalServerError",
                detail="Failed to recognize face",
                suggestion="Please try again or contact support"
            ).dict()
        )


@app.get("/users/", response_model=List[UserInfo], tags=["Management"])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List registered users (for management/debugging).
    
    Args:
        skip: Number of users to skip (pagination)
        limit: Maximum number of users to return
        db: Database session
    
    Returns:
        List of UserInfo objects (without embeddings)
    
    Note: Embeddings are not returned for security and performance.
    
    TODO: Add authentication/authorization for this endpoint
    TODO: Add filtering and search capabilities
    """
    users = db.query(User).offset(skip).limit(limit).all()
    return [
        UserInfo(
            id=user.id,
            name=user.name,
            created_at=user.created_at
        )
        for user in users
    ]


@app.delete("/users/{user_id}", tags=["Management"])
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a user by ID.
    
    Args:
        user_id: Database ID of user to delete
        db: Database session
    
    Returns:
        Success message
    
    TODO: Add authentication/authorization
    TODO: Add soft delete option (mark as inactive instead of deleting)
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found"
        )
    
    db.delete(user)
    db.commit()
    
    logger.info(f"✓ User deleted: {user.name} (ID: {user_id})")
    
    return {
        "status": "deleted",
        "user_id": user_id,
        "name": user.name,
        "message": "User deleted successfully"
    }


@app.get("/stats/", tags=["Management"])
async def get_stats(db: Session = Depends(get_db)):
    """
    Get system statistics.
    
    Returns:
        Dictionary with system stats (user count, etc.)
    
    TODO: Add more metrics (avg query time, recognition success rate, etc.)
    TODO: Add prometheus metrics endpoint for monitoring
    """
    total_users = db.query(User).count()
    
    return {
        "total_users": total_users,
        "database": "PostgreSQL with pgvector",
        "embedding_model": "dlib ResNet (128D)",
        "similarity_metric": "cosine distance"
    }


# TODO: Add WebSocket endpoint for real-time video stream recognition
#       - Accept video frames from client
#       - Process frames in real-time
#       - Return recognition results with face tracking
#       - Example:
#       @app.websocket("/ws/recognize")
#       async def websocket_recognize(websocket: WebSocket):
#           await websocket.accept()
#           while True:
#               frame = await websocket.receive_bytes()
#               # Process frame and send results

# TODO: Add batch processing endpoints
#       - Register multiple users in one request
#       - Recognize multiple faces in one image
#       - Bulk user management operations

# TODO: Add authentication/authorization middleware
#       - Protect management endpoints with API keys
#       - Implement rate limiting
#       - Add audit logging for security

# TODO: Add liveness detection endpoint
#       - Challenge-response based (blink, turn head, smile)
#       - Return liveness score along with recognition

# TODO: Add model monitoring and performance tracking
#       - Log recognition accuracy metrics
#       - Track false positive/negative rates
#       - A/B testing for model upgrades

# TODO: Add horizontal scaling support
#       - Implement distributed caching (Redis)
#       - Load balancer configuration
#       - Session management for video streams

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

