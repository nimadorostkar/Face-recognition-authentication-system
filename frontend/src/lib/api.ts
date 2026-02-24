// API utility functions for face recognition backend

// Use relative /api so Next.js rewrites to the backend (works in dev, Docker, and production).
// Avoids browser calling localhost:8000 directly, which fails when API is on another host.
const API_BASE_URL = '/api';

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body.detail?.detail) return body.detail.detail;
    if (typeof body.detail === 'string') return body.detail;
    if (body.message) return body.message;
  } catch {
    // non-JSON or empty body
  }
  return response.statusText || fallback;
}

export interface RegisterResponse {
  status: string;
  name: string;
  mobile: string | null;
  user_id: number;
  message: string;
}

export interface RecognizeResponse {
  match: boolean;
  name: string | null;
  mobile: string | null;
  distance: number | null;
  user_id: number | null;
  confidence: string | null;
  visit_count: number | null;
  message: string;
}

/**
 * Register a new user with face image and mobile number
 */
export async function registerUser(name: string, imageBase64: string, mobile?: string): Promise<RegisterResponse> {
  const response = await fetch(`${API_BASE_URL}/register/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mobile: mobile || null,
      image: imageBase64,
    }),
  });

  if (!response.ok) {
    const msg = await getErrorMessage(response, 'Registration failed');
    throw new Error(msg);
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
    const msg = await getErrorMessage(response, 'Recognition failed');
    throw new Error(msg);
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

export interface UserInfo {
  id: number;
  name: string;
  mobile: string | null;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
}

export interface FetchUsersParams {
  skip?: number;
  limit?: number;
  search?: string;
  min_visits?: number;
  max_visits?: number;
  joined_after?: string;
  joined_before?: string;
  sort_by?: string;
  sort_order?: string;
}

export async function fetchUsers(params: FetchUsersParams = {}): Promise<UserInfo[]> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  const url = `${API_BASE_URL}/users/${query ? `?${query}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    const msg = await getErrorMessage(response, 'Failed to fetch users');
    throw new Error(msg);
  }
  return response.json();
}

/**
 * Send login notification SMS to user after successful face authentication.
 * Fire-and-forget: errors are logged but don't affect the login flow.
 */
export async function sendLoginSms(userId: number): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/send-login-sms/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.warn('[SMS] Failed to send login notification:', error);
  }
}

