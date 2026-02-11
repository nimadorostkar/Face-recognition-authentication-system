/**
 * State Machine for Energy-Efficient Face Recognition
 * Manages system states to minimize power consumption
 */

export enum SystemState {
  IDLE = 'idle',                           // Low-power mode, 1-2 FPS
  MOTION_DETECTED = 'motion_detected',     // Motion detected, ramping up
  FACE_RECOGNITION_ACTIVE = 'face_recognition_active', // Full recognition mode
  COOLDOWN = 'cooldown',                   // Waiting to return to idle
  SUCCESS = 'success',                     // Face recognized
  FAILED = 'failed',                       // Recognition failed
}

export interface StateTransition {
  from: SystemState;
  to: SystemState;
  timestamp: number;
  reason: string;
}

export interface StateConfig {
  // Idle state configuration
  idleFPS: number;                        // 1-2 FPS in idle
  
  // Motion detection configuration
  motionThreshold: number;                // 0-1, percentage of change
  motionTimeout: number;                  // ms, how long to wait before returning to idle
  
  // Face recognition configuration
  recognitionFPS: number;                 // 10-15 FPS when active
  recognitionInterval: number;            // ms between recognition attempts
  
  // Cooldown configuration
  cooldownDuration: number;               // ms to wait before returning to idle
  cooldownFPS: number;                    // FPS during cooldown
  
  // Timeout configuration
  maxRecognitionTime: number;             // ms, max time in recognition mode
}

export class EnergyEfficientStateMachine {
  private currentState: SystemState = SystemState.IDLE;
  private stateHistory: StateTransition[] = [];
  private config: StateConfig;
  private lastStateChange: number = Date.now();
  private lastMotionDetected: number = 0;
  private recognitionStartTime: number = 0;

  constructor(config: Partial<StateConfig> = {}) {
    this.config = {
      idleFPS: config.idleFPS || 2,
      motionThreshold: config.motionThreshold || 0.10,
      motionTimeout: config.motionTimeout || 8000, // 8 seconds
      recognitionFPS: config.recognitionFPS || 12,
      recognitionInterval: config.recognitionInterval || 1500, // 1.5 seconds
      cooldownDuration: config.cooldownDuration || 3000, // 3 seconds
      cooldownFPS: config.cooldownFPS || 5,
      maxRecognitionTime: config.maxRecognitionTime || 30000, // 30 seconds
    };
  }

  /**
   * Get current system state
   */
  getState(): SystemState {
    return this.currentState;
  }

  /**
   * Get current FPS based on state
   */
  getCurrentFPS(): number {
    switch (this.currentState) {
      case SystemState.IDLE:
        return this.config.idleFPS;
      case SystemState.MOTION_DETECTED:
        return this.config.recognitionFPS;
      case SystemState.FACE_RECOGNITION_ACTIVE:
        return this.config.recognitionFPS;
      case SystemState.COOLDOWN:
        return this.config.cooldownFPS;
      case SystemState.SUCCESS:
      case SystemState.FAILED:
        return 0; // Stop camera
      default:
        return this.config.idleFPS;
    }
  }

  /**
   * Get interval for current state (ms between frames)
   */
  getFrameInterval(): number {
    const fps = this.getCurrentFPS();
    return fps > 0 ? 1000 / fps : 1000;
  }

  /**
   * Check if face recognition should be active
   */
  shouldRunRecognition(): boolean {
    return this.currentState === SystemState.FACE_RECOGNITION_ACTIVE;
  }

  /**
   * Check if motion detection should be active
   */
  shouldDetectMotion(): boolean {
    return this.currentState === SystemState.IDLE || 
           this.currentState === SystemState.MOTION_DETECTED;
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: SystemState, reason: string): void {
    if (this.currentState === newState) return;

    const transition: StateTransition = {
      from: this.currentState,
      to: newState,
      timestamp: Date.now(),
      reason,
    };

    this.stateHistory.push(transition);
    this.currentState = newState;
    this.lastStateChange = Date.now();

    // Track recognition start time
    if (newState === SystemState.FACE_RECOGNITION_ACTIVE) {
      this.recognitionStartTime = Date.now();
    }

    console.log(`[StateMachine] ${transition.from} → ${transition.to}: ${reason}`);
  }

  /**
   * Handle motion detection result
   */
  onMotionDetected(): void {
    this.lastMotionDetected = Date.now();

    switch (this.currentState) {
      case SystemState.IDLE:
        this.transitionTo(SystemState.MOTION_DETECTED, 'Motion detected in idle state');
        break;
      case SystemState.MOTION_DETECTED:
        // Continue detecting motion
        break;
      case SystemState.FACE_RECOGNITION_ACTIVE:
        // Keep recognition active
        break;
      case SystemState.COOLDOWN:
        // Return to motion detection
        this.transitionTo(SystemState.MOTION_DETECTED, 'Motion detected during cooldown');
        break;
    }
  }

  /**
   * Activate face recognition
   */
  activateRecognition(): void {
    if (this.currentState === SystemState.MOTION_DETECTED || 
        this.currentState === SystemState.FACE_RECOGNITION_ACTIVE) {
      this.transitionTo(SystemState.FACE_RECOGNITION_ACTIVE, 'Activating face recognition');
    }
  }

  /**
   * Handle successful face recognition
   */
  onRecognitionSuccess(userName: string): void {
    this.transitionTo(SystemState.SUCCESS, `Face recognized: ${userName}`);
  }

  /**
   * Handle failed face recognition
   */
  onRecognitionFailed(): void {
    this.transitionTo(SystemState.FAILED, 'Face not recognized');
  }

  /**
   * Handle no motion detected
   */
  onNoMotion(): void {
    const timeSinceLastMotion = Date.now() - this.lastMotionDetected;

    switch (this.currentState) {
      case SystemState.MOTION_DETECTED:
        if (timeSinceLastMotion > this.config.motionTimeout) {
          this.transitionTo(SystemState.COOLDOWN, 'No motion timeout');
        }
        break;
      case SystemState.FACE_RECOGNITION_ACTIVE:
        if (timeSinceLastMotion > this.config.motionTimeout) {
          this.transitionTo(SystemState.COOLDOWN, 'No motion during recognition');
        }
        break;
    }
  }

  /**
   * Update state machine (call this regularly)
   */
  update(): void {
    const now = Date.now();
    const timeSinceStateChange = now - this.lastStateChange;
    const timeSinceLastMotion = now - this.lastMotionDetected;

    switch (this.currentState) {
      case SystemState.IDLE:
        // Stay in idle until motion detected
        break;

      case SystemState.MOTION_DETECTED:
        // Auto-activate recognition after motion detected
        if (timeSinceStateChange > 1000) { // 1 second delay
          this.activateRecognition();
        }
        break;

      case SystemState.FACE_RECOGNITION_ACTIVE:
        // Check timeout
        const recognitionDuration = now - this.recognitionStartTime;
        if (recognitionDuration > this.config.maxRecognitionTime) {
          this.transitionTo(SystemState.COOLDOWN, 'Recognition timeout');
        }
        // Check for no motion
        else if (timeSinceLastMotion > this.config.motionTimeout) {
          this.transitionTo(SystemState.COOLDOWN, 'No motion detected');
        }
        break;

      case SystemState.COOLDOWN:
        if (timeSinceStateChange > this.config.cooldownDuration) {
          this.transitionTo(SystemState.IDLE, 'Cooldown complete');
        }
        break;

      case SystemState.SUCCESS:
      case SystemState.FAILED:
        // Terminal states - manual reset required
        break;
    }
  }

  /**
   * Reset to idle state
   */
  reset(): void {
    this.transitionTo(SystemState.IDLE, 'Manual reset');
    this.lastMotionDetected = 0;
    this.recognitionStartTime = 0;
  }

  /**
   * Get state history
   */
  getHistory(): StateTransition[] {
    return [...this.stateHistory];
  }

  /**
   * Get time in current state (ms)
   */
  getTimeInCurrentState(): number {
    return Date.now() - this.lastStateChange;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): StateConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      currentState: this.currentState,
      currentFPS: this.getCurrentFPS(),
      timeInState: this.getTimeInCurrentState(),
      timeSinceLastMotion: Date.now() - this.lastMotionDetected,
      stateTransitions: this.stateHistory.length,
    };
  }
}

