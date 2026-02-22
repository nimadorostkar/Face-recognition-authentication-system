"""
Pydantic schemas for request/response validation.

This module defines all data models for API input/output validation,
ensuring type safety and automatic documentation generation.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime
import base64


class RegisterRequest(BaseModel):
    """
    Request schema for user registration.
    
    Attributes:
        name: Unique identifier for the user
        mobile: User's mobile phone number
        image: Base64-encoded image string or raw image data
    """
    name: str = Field(..., min_length=1, max_length=100, description="Unique user identifier")
    mobile: Optional[str] = Field(None, max_length=20, description="User's mobile phone number")
    image: str = Field(..., description="Base64-encoded image containing a face")
    
    @validator('name')
    def validate_name(cls, v):
        """Validate and sanitize user name."""
        if not v.strip():
            raise ValueError("Name cannot be empty or whitespace only")
        return v.strip()
    
    @validator('mobile', pre=True, always=True)
    def validate_mobile(cls, v):
        """Validate and sanitize mobile number."""
        if v is None or v == '':
            return None
        # Strip whitespace and dashes
        cleaned = v.strip().replace(' ', '').replace('-', '')
        if not cleaned:
            return None
        # Allow digits, optional leading +
        if not cleaned.replace('+', '').isdigit():
            raise ValueError("Mobile number must contain only digits and an optional leading +")
        if len(cleaned) < 7 or len(cleaned) > 20:
            raise ValueError("Mobile number must be between 7 and 20 characters")
        return cleaned
    
    @validator('image')
    def validate_image(cls, v):
        """Validate base64 image format."""
        if not v:
            raise ValueError("Image data cannot be empty")
        
        # Check if it's base64-encoded
        try:
            # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
            if ',' in v:
                v = v.split(',', 1)[1]
            base64.b64decode(v)
        except Exception:
            raise ValueError("Invalid base64 image format")
        
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "John Doe",
                "mobile": "+989123456789",
                "image": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
        }


class RegisterResponse(BaseModel):
    """
    Response schema for successful registration.
    
    Attributes:
        status: Registration status message
        name: Registered user's name
        mobile: Registered user's mobile number
        user_id: Database ID of the registered user
        message: Additional information
    """
    status: str = Field(..., description="Registration status")
    name: str = Field(..., description="Registered user name")
    mobile: Optional[str] = Field(None, description="Registered user mobile number")
    user_id: int = Field(..., description="Database user ID")
    message: str = Field(..., description="Additional information")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "registered",
                "name": "John Doe",
                "mobile": "+989123456789",
                "user_id": 1,
                "message": "User registered successfully"
            }
        }


class RecognizeRequest(BaseModel):
    """
    Request schema for face recognition.
    
    Attributes:
        image: Base64-encoded image string containing a face to recognize
    """
    image: str = Field(..., description="Base64-encoded image containing a face")
    
    @validator('image')
    def validate_image(cls, v):
        """Validate base64 image format."""
        if not v:
            raise ValueError("Image data cannot be empty")
        
        # Check if it's base64-encoded
        try:
            # Remove data URL prefix if present
            if ',' in v:
                v = v.split(',', 1)[1]
            base64.b64decode(v)
        except Exception:
            raise ValueError("Invalid base64 image format")
        
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "image": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
        }


class RecognizeResponse(BaseModel):
    """
    Response schema for face recognition.
    
    Attributes:
        match: Whether a matching face was found
        name: Name of matched user (None if no match)
        mobile: Mobile number of matched user (None if no match)
        distance: Similarity distance (lower is more similar)
        user_id: Database ID of matched user (None if no match)
        confidence: Human-readable confidence level
    """
    match: bool = Field(..., description="Whether a matching face was found")
    name: Optional[str] = Field(None, description="Name of matched user")
    mobile: Optional[str] = Field(None, description="Mobile number of matched user")
    distance: Optional[float] = Field(None, description="Cosine distance (0.0 = identical, 2.0 = opposite)")
    user_id: Optional[int] = Field(None, description="Database user ID")
    confidence: Optional[str] = Field(None, description="Confidence level (high/medium/low)")
    visit_count: Optional[int] = Field(None, description="Total visit count for the user")
    message: str = Field(..., description="Status message")
    
    class Config:
        json_schema_extra = {
            "example": {
                "match": True,
                "name": "John Doe",
                "mobile": "+989123456789",
                "distance": 0.33,
                "user_id": 1,
                "confidence": "high",
                "visit_count": 5,
                "message": "Face recognized successfully"
            }
        }


class ErrorResponse(BaseModel):
    """
    Standard error response schema.
    
    Attributes:
        error: Error type or category
        detail: Detailed error message
        suggestion: Optional suggestion for resolution
    """
    error: str = Field(..., description="Error type")
    detail: str = Field(..., description="Detailed error message")
    suggestion: Optional[str] = Field(None, description="Suggestion for resolution")
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "NoFaceDetected",
                "detail": "No face detected in the provided image",
                "suggestion": "Ensure the image contains a clear, front-facing face with good lighting"
            }
        }


class HealthResponse(BaseModel):
    """
    Health check response schema.
    
    Attributes:
        status: Service status
        database: Database connection status
        timestamp: Current server timestamp
    """
    status: str = Field(..., description="Service status")
    database: str = Field(..., description="Database connection status")
    timestamp: datetime = Field(..., description="Current server timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "database": "connected",
                "timestamp": "2024-11-13T12:00:00"
            }
        }


class UserInfo(BaseModel):
    """
    User information schema for listing users.
    
    Attributes:
        id: User database ID
        name: User name
        mobile: User mobile number
        created_at: Registration timestamp
    """
    id: int
    name: str
    mobile: Optional[str] = None
    visit_count: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "John Doe",
                "mobile": "+989123456789",
                "visit_count": 5,
                "created_at": "2024-11-13T12:00:00"
            }
        }


# TODO: Add schemas for batch processing endpoints (register/recognize multiple faces)
# TODO: Add schema for liveness detection results when implemented
# TODO: Add schema for real-time video stream metadata (WebSocket)

