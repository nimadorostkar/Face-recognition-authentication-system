/**
 * Energy-Efficient Camera Manager
 * Manages camera stream with adaptive FPS based on system state
 */

import { SystemState } from './stateMachine';

export interface CameraConfig {
  width: number;
  height: number;
  facingMode: 'user' | 'environment';
  idealFPS: number;
}

export class EnergyEfficientCamera {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement;
  private currentFPS: number = 2;
  private frameInterval: number = 500; // ms between frames
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;
  private rafId: number | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * Start camera stream
   */
  async start(config: Partial<CameraConfig> = {}): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: config.width || 640 },
          height: { ideal: config.height || 480 },
          facingMode: config.facingMode || 'user',
          frameRate: { ideal: config.idealFPS || 30, max: 30 },
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      
      return new Promise((resolve, reject) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play()
            .then(() => {
              this.isRunning = true;
              resolve();
            })
            .catch(reject);
        };
        
        this.videoElement.onerror = reject;
      });
    } catch (error) {
      console.error('Failed to start camera:', error);
      throw error;
    }
  }

  /**
   * Stop camera stream
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement.srcObject) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Pause camera (keep stream but stop processing)
   */
  pause(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Resume camera processing
   */
  resume(): void {
    this.isRunning = true;
  }

  /**
   * Set target FPS (adaptive frame rate)
   */
  setFPS(fps: number): void {
    this.currentFPS = Math.max(1, Math.min(30, fps));
    this.frameInterval = 1000 / this.currentFPS;
    console.log(`[Camera] FPS changed to ${this.currentFPS} (interval: ${this.frameInterval}ms)`);
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.currentFPS;
  }

  /**
   * Check if camera is running
   */
  isActive(): boolean {
    return this.isRunning && this.stream !== null;
  }

  /**
   * Get video element
   */
  getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  /**
   * Process frames at adaptive rate
   * Returns true if a new frame should be processed
   */
  shouldProcessFrame(): boolean {
    const now = Date.now();
    const timeSinceLastFrame = now - this.lastFrameTime;

    if (timeSinceLastFrame >= this.frameInterval) {
      this.lastFrameTime = now;
      return true;
    }

    return false;
  }

  /**
   * Capture current frame as ImageData
   */
  captureFrame(width: number = 80, height: number = 60): ImageData | null {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d', { 
        willReadFrequently: true,
        alpha: false 
      });
      
      if (!ctx) return null;

      ctx.drawImage(this.videoElement, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height);
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }

  /**
   * Capture frame as base64 for API
   */
  captureFrameAsBase64(): string | null {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(this.videoElement, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    } catch (error) {
      console.error('Error capturing frame as base64:', error);
      return null;
    }
  }

  /**
   * Get stream statistics
   */
  getStats() {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return null;

    const settings = track.getSettings();
    return {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      facingMode: settings.facingMode,
      targetFPS: this.currentFPS,
      frameInterval: this.frameInterval,
      isActive: this.isRunning,
    };
  }
}

