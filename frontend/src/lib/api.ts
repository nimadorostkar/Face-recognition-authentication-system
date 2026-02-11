// API utility functions for face recognition backend

// Use environment variable or default to localhost
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface RegisterResponse {
  status: string;
  name: string;
  user_id: number;
  message: string;
}

export interface RecognizeResponse {
  match: boolean;
  name: string | null;
  distance: number | null;
  user_id: number | null;
  confidence: string | null;
  message: string;
}

/**
 * Register a new user with face image
 */
export async function registerUser(name: string, imageBase64: string): Promise<RegisterResponse> {
  const response = await fetch(`${API_BASE_URL}/register/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      image: imageBase64,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.detail || 'Registration failed');
  }

  return response.json();
}

/**
 * Recognize a face from image
 */
export async function recognizeFace(imageBase64: string): Promise<RecognizeResponse> {
  const response = await fetch(`${API_BASE_URL}/recognize/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBase64,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.detail || 'Recognition failed');
  }

  return response.json();
}

/**
 * Convert canvas to base64 string
 */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  // Get base64 data URL
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  // Remove the data URL prefix (data:image/jpeg;base64,)
  return dataUrl.split(',')[1];
}

/**
 * Capture frame from video element
 */
export function captureFrame(video: HTMLVideoElement): string | null {
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  return canvasToBase64(canvas);
}

