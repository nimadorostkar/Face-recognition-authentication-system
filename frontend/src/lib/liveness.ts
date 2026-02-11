/**
 * Liveness detection utilities for anti-spoofing
 * Implements blink detection and motion analysis to verify real faces
 */

export interface LivenessResult {
  isLive: boolean;
  confidence: number;
  checks: {
    blinkDetected: boolean;
    motionDetected: boolean;
    multiFrameConsistency: boolean;
  };
  message: string;
}

interface EyeAspectRatio {
  left: number;
  right: number;
  average: number;
}

/**
 * Calculate Eye Aspect Ratio (EAR) for blink detection
 * EAR drops significantly when eyes are closed
 */
function calculateEAR(eyeLandmarks: number[][]): number {
  // Calculate vertical distances
  const v1 = Math.hypot(
    eyeLandmarks[1][0] - eyeLandmarks[5][0],
    eyeLandmarks[1][1] - eyeLandmarks[5][1]
  );
  const v2 = Math.hypot(
    eyeLandmarks[2][0] - eyeLandmarks[4][0],
    eyeLandmarks[2][1] - eyeLandmarks[4][1]
  );

  // Calculate horizontal distance
  const h = Math.hypot(
    eyeLandmarks[0][0] - eyeLandmarks[3][0],
    eyeLandmarks[0][1] - eyeLandmarks[3][1]
  );

  // EAR formula
  return (v1 + v2) / (2.0 * h);
}

/**
 * Detect blink by analyzing Eye Aspect Ratio changes
 */
export class BlinkDetector {
  private earHistory: number[] = [];
  private readonly EAR_THRESHOLD = 0.2; // Threshold for closed eyes
  private readonly CONSEC_FRAMES = 2; // Consecutive frames for blink
  private blinkCount = 0;
  private frameCounter = 0;

  detectBlink(leftEye: number[][], rightEye: number[][]): boolean {
    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    this.earHistory.push(avgEAR);
    if (this.earHistory.length > 10) {
      this.earHistory.shift();
    }

    // Check if eyes are closed
    if (avgEAR < this.EAR_THRESHOLD) {
      this.frameCounter++;
    } else {
      // Eyes opened after being closed
      if (this.frameCounter >= this.CONSEC_FRAMES) {
        this.blinkCount++;
        this.frameCounter = 0;
        return true;
      }
      this.frameCounter = 0;
    }

    return false;
  }

  getBlinkCount(): number {
    return this.blinkCount;
  }

  reset(): void {
    this.blinkCount = 0;
    this.frameCounter = 0;
    this.earHistory = [];
  }
}

/**
 * Detect motion between frames to verify video vs static image
 */
export class MotionDetector {
  private previousFrame: ImageData | null = null;
  private readonly MOTION_THRESHOLD = 5; // Pixel difference threshold
  private motionHistory: number[] = [];

  detectMotion(currentFrame: ImageData): number {
    if (!this.previousFrame) {
      this.previousFrame = currentFrame;
      return 0;
    }

    let totalDiff = 0;
    let pixelCount = 0;

    // Sample pixels for performance (check every 10th pixel)
    for (let i = 0; i < currentFrame.data.length; i += 40) {
      const diff = Math.abs(currentFrame.data[i] - this.previousFrame.data[i]);
      if (diff > this.MOTION_THRESHOLD) {
        totalDiff += diff;
        pixelCount++;
      }
    }

    const motionScore = pixelCount / (currentFrame.data.length / 40);
    this.motionHistory.push(motionScore);

    if (this.motionHistory.length > 30) {
      this.motionHistory.shift();
    }

    this.previousFrame = currentFrame;
    return motionScore;
  }

  hasSignificantMotion(): boolean {
    if (this.motionHistory.length < 10) return false;
    
    const avgMotion = this.motionHistory.reduce((a, b) => a + b, 0) / this.motionHistory.length;
    const variance = this.motionHistory.reduce((sum, val) => sum + Math.pow(val - avgMotion, 2), 0) / this.motionHistory.length;
    
    // Check for both motion and variation (not static)
    return avgMotion > 0.01 && variance > 0.0001;
  }

  reset(): void {
    this.previousFrame = null;
    this.motionHistory = [];
  }
}

/**
 * Simple liveness check using basic frame differences
 */
export class SimpleLivenessDetector {
  private frameHistory: ImageData[] = [];
  private readonly MAX_FRAMES = 10;
  private startTime: number = Date.now();

  addFrame(frame: ImageData): void {
    this.frameHistory.push(frame);
    if (this.frameHistory.length > this.MAX_FRAMES) {
      this.frameHistory.shift();
    }
  }

  checkLiveness(): LivenessResult {
    if (this.frameHistory.length < 5) {
      return {
        isLive: false,
        confidence: 0,
        checks: {
          blinkDetected: false,
          motionDetected: false,
          multiFrameConsistency: false,
        },
        message: 'Collecting frames...',
      };
    }

    // Simple check: are frames different from each other?
    let totalDiff = 0;
    let frameCount = 0;

    for (let i = 1; i < this.frameHistory.length; i++) {
      const diff = this.calculateFrameDifference(
        this.frameHistory[i - 1],
        this.frameHistory[i]
      );
      totalDiff += diff;
      frameCount++;
    }

    const avgDiff = totalDiff / frameCount;
    const elapsedTime = (Date.now() - this.startTime) / 1000;

    // Very simple checks
    const motionDetected = avgDiff > 0.001; // Any motion
    const timeCheck = elapsedTime >= 2; // At least 2 seconds

    const isLive = motionDetected && timeCheck;
    const confidence = Math.min((avgDiff * 100 + (timeCheck ? 0.5 : 0)), 1);

    return {
      isLive,
      confidence,
      checks: {
        blinkDetected: motionDetected,
        motionDetected,
        multiFrameConsistency: timeCheck,
      },
      message: isLive
        ? 'Ready for face recognition'
        : 'Please move slightly...',
    };
  }

  private calculateFrameDifference(frame1: ImageData, frame2: ImageData): number {
    let totalDiff = 0;
    const sampleRate = 100; // Sample every 100th pixel

    for (let i = 0; i < frame1.data.length; i += sampleRate * 4) {
      const diff = Math.abs(frame1.data[i] - frame2.data[i]);
      totalDiff += diff;
    }

    return totalDiff / (frame1.data.length / (sampleRate * 4));
  }

  reset(): void {
    this.frameHistory = [];
    this.startTime = Date.now();
  }

  getProgress(): number {
    return Math.min((this.frameHistory.length / this.MAX_FRAMES) * 100, 100);
  }
}

/**
 * Extract frame from video for analysis
 */
export function extractFrameData(video: HTMLVideoElement): ImageData | null {
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    console.error('Error extracting frame data:', error);
    return null;
  }
}

