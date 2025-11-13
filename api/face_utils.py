"""
Face recognition utilities using dlib and OpenCV.

This module provides core face recognition functionality:
- Face detection in images
- Face embedding extraction (128D vectors)
- Image preprocessing and validation

Current implementation uses face_recognition (dlib-based) for simplicity.
Future upgrades are clearly marked with TODO comments.
"""

import face_recognition
import cv2
import numpy as np
from typing import List, Optional, Tuple
import base64
from PIL import Image
import io


class FaceRecognitionError(Exception):
    """Custom exception for face recognition errors."""
    pass


class NoFaceDetectedError(FaceRecognitionError):
    """Raised when no face is detected in the image."""
    pass


class MultipleFacesDetectedError(FaceRecognitionError):
    """Raised when multiple faces are detected (single face expected)."""
    pass


class InvalidImageError(FaceRecognitionError):
    """Raised when image format is invalid or corrupted."""
    pass


def decode_image(base64_string: str) -> np.ndarray:
    """
    Decode base64 string to OpenCV image (numpy array).
    
    Args:
        base64_string: Base64-encoded image string
    
    Returns:
        Image as numpy array (RGB format)
    
    Raises:
        InvalidImageError: If image cannot be decoded
    
    TODO: Add support for multiple image formats (JPEG, PNG, WebP)
    TODO: Add image quality validation (resolution, clarity checks)
    """
    try:
        # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        if ',' in base64_string:
            base64_string = base64_string.split(',', 1)[1]
        
        # Decode base64 to bytes
        img_bytes = base64.b64decode(base64_string)
        
        # Convert bytes to PIL Image
        pil_image = Image.open(io.BytesIO(img_bytes))
        
        # Convert PIL Image to numpy array (RGB)
        img_array = np.array(pil_image.convert('RGB'))
        
        return img_array
    
    except Exception as e:
        raise InvalidImageError(f"Failed to decode image: {str(e)}")


def preprocess_image(image: np.ndarray, target_size: Optional[Tuple[int, int]] = None) -> np.ndarray:
    """
    Preprocess image for face detection and recognition.
    
    Args:
        image: Input image as numpy array (RGB)
        target_size: Optional resize dimensions (width, height)
    
    Returns:
        Preprocessed image
    
    Current preprocessing:
    - Optional resizing for faster processing
    - Color space is already RGB (required by face_recognition)
    
    TODO: Add histogram equalization for better lighting normalization
    TODO: Add face alignment using facial landmarks for better accuracy
    TODO: Add image quality enhancement (denoising, sharpening)
    """
    # Resize if target size specified (for faster processing on large images)
    if target_size:
        image = cv2.resize(image, target_size, interpolation=cv2.INTER_AREA)
    
    # Ensure RGB format (face_recognition requires RGB)
    if len(image.shape) == 2:  # Grayscale
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:  # RGBA
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
    
    return image


def detect_faces(image: np.ndarray, model: str = "hog") -> List[Tuple[int, int, int, int]]:
    """
    Detect faces in an image.
    
    Args:
        image: Input image as numpy array (RGB)
        model: Detection model - "hog" (faster, CPU) or "cnn" (more accurate, GPU)
    
    Returns:
        List of face bounding boxes as (top, right, bottom, left) tuples
    
    Current: Uses dlib's HOG-based detector (fast on CPU)
    
    TODO: Upgrade to RetinaFace for better accuracy and speed
          - RetinaFace detects small faces better
          - Provides facial landmarks and confidence scores
          - Better handling of various angles and lighting
    
    TODO: Alternative: MediaPipe Face Detection
          - Lightweight, optimized for real-time
          - Works well on mobile and web
          - Good for video streams
    
    TODO: Add face quality scoring (blur detection, pose estimation)
    """
    # Detect face locations using dlib (via face_recognition library)
    # model="hog": CPU-friendly, good for most cases
    # model="cnn": More accurate but requires GPU for real-time performance
    face_locations = face_recognition.face_locations(image, model=model)
    
    return face_locations


def extract_face_embedding(image: np.ndarray, face_location: Tuple[int, int, int, int]) -> List[float]:
    """
    Extract face embedding (feature vector) from a detected face.
    
    Args:
        image: Input image as numpy array (RGB)
        face_location: Face bounding box as (top, right, bottom, left)
    
    Returns:
        128-dimensional face embedding vector
    
    Current: Uses dlib's ResNet-based face recognition model
    - Generates 128D embeddings
    - Trained on ~3 million faces
    - Good accuracy for most use cases
    
    TODO: Upgrade to ArcFace (InsightFace) for state-of-the-art accuracy
          - 512D embeddings (change database schema)
          - Superior accuracy on challenging cases
          - Better handling of age, pose, and expression variations
          - Example implementation:
            ```python
            from insightface.app import FaceAnalysis
            app = FaceAnalysis()
            app.prepare(ctx_id=0, det_size=(640, 640))
            faces = app.get(img)
            embedding = faces[0].embedding  # 512D vector
            ```
    
    TODO: Support ONNX Runtime for faster inference
          - Export models to ONNX format
          - 2-3x speedup on CPU, 5-10x on GPU
    
    TODO: Add TensorRT support for NVIDIA GPUs
          - Up to 10x faster inference on compatible GPUs
          - Critical for real-time video processing
    """
    # Extract 128D embedding using dlib's face recognition model
    # This internally:
    # 1. Aligns the face using 68 facial landmarks
    # 2. Passes through ResNet to generate 128D feature vector
    encodings = face_recognition.face_encodings(image, [face_location])
    
    if len(encodings) == 0:
        raise NoFaceDetectedError("Failed to extract face encoding")
    
    # Convert numpy array to list for JSON serialization
    embedding = encodings[0].tolist()
    
    return embedding


def get_face_embedding_from_image(base64_image: str, require_single_face: bool = True) -> List[float]:
    """
    End-to-end pipeline: base64 image -> face embedding.
    
    This is the main function used by API endpoints.
    
    Args:
        base64_image: Base64-encoded image string
        require_single_face: If True, raise error when multiple faces detected
    
    Returns:
        128-dimensional face embedding vector
    
    Raises:
        InvalidImageError: If image is invalid
        NoFaceDetectedError: If no face is detected
        MultipleFacesDetectedError: If multiple faces detected and require_single_face=True
    
    Pipeline:
    1. Decode base64 image
    2. Preprocess image
    3. Detect faces
    4. Extract embedding from detected face
    
    TODO: Add batch processing support for multiple faces
    TODO: Add face quality filtering (reject blurry/poorly lit faces)
    TODO: Implement face cropping and alignment for better consistency
    """
    # Step 1: Decode image
    image = decode_image(base64_image)
    
    # Step 2: Preprocess
    # Optionally resize large images for faster processing
    # Uncomment if you want to resize images > 1024px on longest side
    # h, w = image.shape[:2]
    # if max(h, w) > 1024:
    #     scale = 1024 / max(h, w)
    #     new_size = (int(w * scale), int(h * scale))
    #     image = preprocess_image(image, target_size=new_size)
    
    image = preprocess_image(image)
    
    # Step 3: Detect faces
    # Use "hog" model by default (fast on CPU)
    # Change to "cnn" for better accuracy if GPU is available
    face_locations = detect_faces(image, model="hog")
    
    if len(face_locations) == 0:
        raise NoFaceDetectedError("No face detected in the image")
    
    if len(face_locations) > 1 and require_single_face:
        raise MultipleFacesDetectedError(
            f"Multiple faces detected ({len(face_locations)}). "
            "Please provide an image with a single face."
        )
    
    # Step 4: Extract embedding from first detected face
    face_location = face_locations[0]
    embedding = extract_face_embedding(image, face_location)
    
    return embedding


def calculate_face_distance(embedding1: List[float], embedding2: List[float]) -> float:
    """
    Calculate distance between two face embeddings.
    
    Args:
        embedding1: First face embedding
        embedding2: Second face embedding
    
    Returns:
        Euclidean distance (lower = more similar)
    
    Note:
        - Distance < 0.6: Likely same person
        - Distance 0.6-1.0: Uncertain, may need manual verification
        - Distance > 1.0: Likely different people
    
    Current: Uses Euclidean distance (L2 norm)
    Database: Uses cosine distance for similarity search
    
    TODO: Standardize on single distance metric (cosine is generally better)
    TODO: Add confidence calibration based on data distribution
    """
    # Convert to numpy arrays for efficient computation
    emb1 = np.array(embedding1)
    emb2 = np.array(embedding2)
    
    # Calculate Euclidean distance
    distance = np.linalg.norm(emb1 - emb2)
    
    return float(distance)


def get_confidence_level(distance: float) -> str:
    """
    Convert distance to human-readable confidence level.
    
    Args:
        distance: Cosine distance from pgvector (0.0 = identical, 2.0 = opposite)
    
    Returns:
        Confidence level: "high", "medium", or "low"
    
    Thresholds based on empirical testing with dlib embeddings:
    - < 0.35: High confidence (very likely same person)
    - 0.35-0.45: Medium confidence (likely same person, but verify)
    - > 0.45: Low confidence (likely different person)
    
    TODO: Implement adaptive thresholds based on user-specific data
    TODO: Add confidence scores calibrated on validation dataset
    """
    if distance < 0.35:
        return "high"
    elif distance < 0.45:
        return "medium"
    else:
        return "low"


# TODO: Implement GPU acceleration support
#       - Check if CUDA is available
#       - Use GPU-optimized models (CNN detector, TensorRT inference)
#       - Batch processing for multiple images

# TODO: Add liveness detection to prevent spoofing attacks
#       Approaches:
#       1. Blink detection (require user to blink)
#       2. Head movement (ask user to turn head)
#       3. Depth-based (use depth camera data)
#       4. Challenge-response (random actions)
#       5. Passive (texture analysis, frequency domain analysis)

# TODO: Add face image quality assessment
#       - Sharpness/blur detection
#       - Lighting quality
#       - Face pose/angle
#       - Occlusion detection (sunglasses, mask, hand)

# TODO: Add support for face tracking in video streams
#       - Maintain face IDs across frames
#       - Smooth recognition results over time
#       - Handle temporary occlusions

# TODO: Implement ensemble models for better accuracy
#       - Combine multiple embedding models
#       - Weighted voting for final decision

