/**
 * Motion Detection Module
 * Ultra-lightweight motion detection using pixel differences
 * Optimized for minimal CPU and battery usage
 */

export interface MotionDetectionConfig {
  threshold: number; // 0-1 (percentage of pixels that need to change)
  minAreaChange: number; // Minimum number of pixels that must change
  sensitivity: number; // 1-10 (higher = more sensitive)
}

export interface MotionResult {
  hasMotion: boolean;
  changePercentage: number;
  timestamp: number;
}

export class MotionDetector {
  private previousFrame: ImageData | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: MotionDetectionConfig;

  constructor(config: Partial<MotionDetectionConfig> = {}) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: false 
    })!;
    
    this.config = {
      threshold: config.threshold || 0.10, // 10% of pixels must change
      minAreaChange: config.minAreaChange || 500, // At least 500 pixels
      sensitivity: config.sensitivity || 5,
    };
  }

  /**
   * Capture frame from video element at low resolution for motion detection
   */
  private captureFrame(video: HTMLVideoElement): ImageData | null {
    try {
      // Use reduced resolution for motion detection (80x60 = 4800 pixels)
      // This is ~1/64th of 640x480, massively reducing computation
      const width = 80;
      const height = 60;
      
      this.canvas.width = width;
      this.canvas.height = height;
      
      this.ctx.drawImage(video, 0, 0, width, height);
      return this.ctx.getImageData(0, 0, width, height);
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }

  /**
   * Fast pixel difference algorithm
   * Only compares grayscale values for speed
   */
  private calculateDifference(current: ImageData, previous: ImageData): number {
    const data1 = current.data;
    const data2 = previous.data;
    let changedPixels = 0;
    const totalPixels = current.width * current.height;
    
    // Sample every 4 bytes (RGBA) and convert to grayscale
    // Use threshold based on sensitivity
    const changeThreshold = Math.max(5, 30 - (this.config.sensitivity * 2));
    
    for (let i = 0; i < data1.length; i += 4) {
      // Fast grayscale: (R + G + B) / 3
      const gray1 = (data1[i] + data1[i + 1] + data1[i + 2]) / 3;
      const gray2 = (data2[i] + data2[i + 1] + data2[i + 2]) / 3;
      
      if (Math.abs(gray1 - gray2) > changeThreshold) {
        changedPixels++;
      }
    }
    
    return changedPixels;
  }

  /**
   * Detect motion in video frame
   */
  detectMotion(video: HTMLVideoElement): MotionResult {
    const currentFrame = this.captureFrame(video);
    
    if (!currentFrame) {
      return {
        hasMotion: false,
        changePercentage: 0,
        timestamp: Date.now(),
      };
    }

    // First frame - no comparison possible
    if (!this.previousFrame) {
      this.previousFrame = currentFrame;
      return {
        hasMotion: false,
        changePercentage: 0,
        timestamp: Date.now(),
      };
    }

    // Calculate difference
    const changedPixels = this.calculateDifference(currentFrame, this.previousFrame);
    const totalPixels = currentFrame.width * currentFrame.height;
    const changePercentage = (changedPixels / totalPixels);

    // Update previous frame
    this.previousFrame = currentFrame;

    // Check if motion detected
    const hasMotion = 
      changePercentage >= this.config.threshold && 
      changedPixels >= this.config.minAreaChange;

    return {
      hasMotion,
      changePercentage,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousFrame = null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MotionDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.previousFrame = null;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

/**
 * WebGL-accelerated motion detection (optional, for better performance)
 */
export class WebGLMotionDetector {
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private previousTexture: WebGLTexture | null = null;
  private program: WebGLProgram | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 80;
    this.canvas.height = 60;
    
    try {
      this.gl = this.canvas.getContext('webgl', { 
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: true 
      });
      
      if (this.gl) {
        this.initShaders();
      }
    } catch (error) {
      console.warn('WebGL not available, falling back to canvas', error);
    }
  }

  private initShaders(): void {
    if (!this.gl) return;

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // Fragment shader for difference calculation
    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_current;
      uniform sampler2D u_previous;
      varying vec2 v_texCoord;
      
      void main() {
        vec4 current = texture2D(u_current, v_texCoord);
        vec4 previous = texture2D(u_previous, v_texCoord);
        
        // Calculate grayscale difference
        float currentGray = dot(current.rgb, vec3(0.299, 0.587, 0.114));
        float previousGray = dot(previous.rgb, vec3(0.299, 0.587, 0.114));
        float diff = abs(currentGray - previousGray);
        
        // Threshold
        float motion = step(0.1, diff);
        gl_FragColor = vec4(motion, motion, motion, 1.0);
      }
    `;

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (vertexShader && fragmentShader) {
      this.program = this.createProgram(vertexShader, fragmentShader);
    }
  }

  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    if (!this.gl) return null;
    
    const program = this.gl.createProgram();
    if (!program) return null;
    
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program linking error:', this.gl.getProgramInfoLog(program));
      this.gl.deleteProgram(program);
      return null;
    }
    
    return program;
  }

  isAvailable(): boolean {
    return this.gl !== null && this.program !== null;
  }

  dispose(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    if (this.gl && this.previousTexture) {
      this.gl.deleteTexture(this.previousTexture);
    }
    this.gl = null;
    this.program = null;
    this.previousTexture = null;
  }
}

