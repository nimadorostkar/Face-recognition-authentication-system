'use client';

import { useRef, useEffect, useState } from 'react';
import { recognizeFace } from '@/lib/api';
import { MotionDetector, MotionResult } from '@/lib/motionDetector';
import { EnergyEfficientStateMachine, SystemState } from '@/lib/stateMachine';
import { EnergyEfficientCamera } from '@/lib/cameraManager';

export default function EnergyEfficientStartPage() {
  // Video refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);

  // System components
  const cameraRef = useRef<EnergyEfficientCamera | null>(null);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const stateMachineRef = useRef<EnergyEfficientStateMachine | null>(null);

  // Intervals and timers
  const mainLoopRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [systemState, setSystemState] = useState<SystemState>(SystemState.IDLE);
  const [showUI, setShowUI] = useState(false); // Black screen initially
  const [status, setStatus] = useState<'checking' | 'yes' | 'no'>('checking');
  const [userName, setUserName] = useState<string>('');
  const [fadeIn, setFadeIn] = useState(false);
  const [videoSource, setVideoSource] = useState('/media/faceid.mp4');
  const [showQR, setShowQR] = useState(false);
  const showQRRef = useRef<boolean>(false);

  // Debug state
  const [debugInfo, setDebugInfo] = useState({
    fps: 0,
    motionPercent: 0,
    timeInState: 0,
    isMotionDetecting: false,
    isRecognizing: false,
  });

  /**
   * Initialize system components
   */
  useEffect(() => {
    async function initialize() {
      try {
        console.log('[System] Initializing energy-efficient face recognition...');

        // Initialize camera
        if (videoRef.current) {
          cameraRef.current = new EnergyEfficientCamera(videoRef.current);
          await cameraRef.current.start({
            width: 640,
            height: 480,
            facingMode: 'user',
            idealFPS: 30,
          });
          
          // Start with low FPS (energy saving)
          cameraRef.current.setFPS(2);
        }

        // Initialize motion detector
        motionDetectorRef.current = new MotionDetector({
          threshold: 0.08, // 8% pixel change
          minAreaChange: 400, // Minimum 400 pixels
          sensitivity: 6, // Medium-high sensitivity
        });

        // Initialize state machine
        stateMachineRef.current = new EnergyEfficientStateMachine({
          idleFPS: 2,
          motionThreshold: 0.08,
          motionTimeout: 8000,
          recognitionFPS: 12,
          recognitionInterval: 1500,
          cooldownDuration: 3000,
          cooldownFPS: 5,
          maxRecognitionTime: 30000,
        });

        // Start main processing loop
        startMainLoop();

        console.log('[System] Initialization complete');
      } catch (error) {
        console.error('[System] Initialization failed:', error);
      }
    }

    initialize();

    // Cleanup
    return () => {
      console.log('[System] Shutting down...');
      
      if (mainLoopRef.current) {
        clearInterval(mainLoopRef.current);
      }
      if (recognitionTimerRef.current) {
        clearTimeout(recognitionTimerRef.current);
      }
      if (qrTimerRef.current) {
        clearTimeout(qrTimerRef.current);
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (motionDetectorRef.current) {
        motionDetectorRef.current.dispose();
      }
    };
  }, []);

  /**
   * Main processing loop - runs at adaptive rate
   */
  function startMainLoop() {
    console.log('[MainLoop] Starting...');

    mainLoopRef.current = setInterval(() => {
      if (!cameraRef.current || !motionDetectorRef.current || !stateMachineRef.current) {
        return;
      }

      const camera = cameraRef.current;
      const motionDetector = motionDetectorRef.current;
      const stateMachine = stateMachineRef.current;

      // Update state machine
      stateMachine.update();
      const currentState = stateMachine.getState();
      setSystemState(currentState);

      // Sync camera FPS with state
      const targetFPS = stateMachine.getCurrentFPS();
      if (camera.getFPS() !== targetFPS) {
        camera.setFPS(targetFPS);
      }

      // Process frame if camera is ready
      if (!camera.shouldProcessFrame() || !camera.isActive()) {
        return;
      }

      const videoElement = camera.getVideoElement();

      // Handle different states
      switch (currentState) {
        case SystemState.IDLE:
        case SystemState.MOTION_DETECTED:
          // Run motion detection
          handleMotionDetection(videoElement, motionDetector, stateMachine);
          break;

        case SystemState.FACE_RECOGNITION_ACTIVE:
          // Continue motion detection + trigger recognition
          const motionResult = motionDetector.detectMotion(videoElement);
          
          if (motionResult.hasMotion) {
            stateMachine.onMotionDetected();
          } else {
            stateMachine.onNoMotion();
          }

          // Trigger face recognition (throttled)
          if (!recognitionTimerRef.current) {
            recognitionTimerRef.current = setTimeout(() => {
              performFaceRecognition(camera);
              recognitionTimerRef.current = null;
            }, stateMachine.getConfig().recognitionInterval);
          }
          break;

        case SystemState.COOLDOWN:
          // Just wait, check for motion
          const cooldownMotion = motionDetector.detectMotion(videoElement);
          if (cooldownMotion.hasMotion) {
            stateMachine.onMotionDetected();
          }
          break;

        case SystemState.SUCCESS:
        case SystemState.FAILED:
          // Terminal states - stop processing
          break;
      }

      // Update debug info
      updateDebugInfo(stateMachine, motionDetector, camera);
    }, 100); // Main loop runs at 10Hz
  }

  /**
   * Handle motion detection logic
   */
  function handleMotionDetection(
    video: HTMLVideoElement,
    detector: MotionDetector,
    stateMachine: EnergyEfficientStateMachine
  ) {
    const result: MotionResult = detector.detectMotion(video);

    if (result.hasMotion) {
      console.log(`[MotionDetector] Motion detected! Change: ${(result.changePercentage * 100).toFixed(1)}%`);
      stateMachine.onMotionDetected();
      
      // Show UI when motion first detected
      if (!showUI) {
        console.log('[UI] Showing interface (motion detected)');
        setShowUI(true);
        setFadeIn(true);
      }
    } else {
      stateMachine.onNoMotion();
    }
  }

  /**
   * Perform face recognition
   */
  async function performFaceRecognition(camera: EnergyEfficientCamera) {
    try {
      console.log('[Recognition] Attempting face recognition...');
      
      const imageBase64 = camera.captureFrameAsBase64();
      if (!imageBase64) {
        console.warn('[Recognition] Failed to capture frame');
        return;
      }

      const result = await recognizeFace(imageBase64);
      console.log('[Recognition] Result:', result);

      if (result.match && result.name) {
        // Success!
        handleRecognitionSuccess(result.name);
      } else {
        // Not recognized
        handleRecognitionFailure();
      }
    } catch (error: any) {
      console.error('[Recognition] Error:', error);
      handleRecognitionFailure();
    }
  }

  /**
   * Handle successful recognition
   */
  function handleRecognitionSuccess(name: string) {
    console.log(`[Recognition] Success: ${name}`);
    
    if (stateMachineRef.current) {
      stateMachineRef.current.onRecognitionSuccess(name);
    }

    // Clear timers
    if (qrTimerRef.current) {
      clearTimeout(qrTimerRef.current);
      qrTimerRef.current = null;
    }
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }

    // Update UI
    setFadeIn(false);
    setTimeout(() => {
      setStatus('yes');
      setUserName(name);
      setVideoSource('/media/success.mp4');
      setShowQR(false);
      showQRRef.current = false;
      setFadeIn(true);

      if (displayVideoRef.current) {
        displayVideoRef.current.load();
        displayVideoRef.current.play();
      }
    }, 300);

    // Stop camera (energy saving)
    if (cameraRef.current) {
      cameraRef.current.pause();
    }
  }

  /**
   * Handle recognition failure
   */
  function handleRecognitionFailure() {
    console.log('[Recognition] Failed - user not recognized');

    if (stateMachineRef.current) {
      stateMachineRef.current.onRecognitionFailed();
    }

    // Only show failure UI once
    if (showQRRef.current) {
      return;
    }

    // Clear recognition timer
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }

    // Show failure animation
    setFadeIn(false);
    setTimeout(() => {
      setStatus('no');
      setUserName('');
      setVideoSource('/media/fail.mp4');
      setFadeIn(true);

      if (displayVideoRef.current) {
        displayVideoRef.current.load();
        displayVideoRef.current.play();
      }

      // Show QR after 3 seconds
      qrTimerRef.current = setTimeout(() => {
        console.log('[UI] Showing QR code');
        setFadeIn(false);
        setTimeout(() => {
          setShowQR(true);
          showQRRef.current = true;
          setFadeIn(true);

          if (displayVideoRef.current) {
            displayVideoRef.current.pause();
          }
        }, 500);
      }, 3000);
    }, 300);

    // Pause camera (energy saving)
    if (cameraRef.current) {
      cameraRef.current.pause();
    }
  }

  /**
   * Update debug information
   */
  function updateDebugInfo(
    stateMachine: EnergyEfficientStateMachine,
    detector: MotionDetector,
    camera: EnergyEfficientCamera
  ) {
    setDebugInfo({
      fps: camera.getFPS(),
      motionPercent: 0, // Would need to track last result
      timeInState: stateMachine.getTimeInCurrentState(),
      isMotionDetecting: stateMachine.shouldDetectMotion(),
      isRecognizing: stateMachine.shouldRunRecognition(),
    });
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: showUI ? 'white' : 'black', // Black screen initially
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 0,
        padding: 0,
        transition: 'background-color 0.5s ease',
      }}
    >
      {/* Hidden webcam video for face recognition */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* UI - Only show after motion detected */}
      {showUI && (
        <>
          {/* Face ID animation video or QR code */}
          {showQR ? (
            <img
              src="/media/qr.png"
              alt="QR Code"
              style={{
                width: '300px',
                height: 'auto',
                marginBottom: '20px',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                display: 'block',
              }}
            />
          ) : (
            <video
              ref={displayVideoRef}
              autoPlay
              loop
              muted
              playsInline
              onLoadedData={() => {
                if (status === 'checking' && videoSource === '/media/faceid.mp4') {
                  setFadeIn(true);
                }
              }}
              style={{
                width: '300px',
                height: 'auto',
                marginBottom: '20px',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                display: showQR ? 'none' : 'block',
              }}
            >
              <source src={videoSource} type="video/mp4" />
            </video>
          )}

          {/* Status text */}
          <div
            style={{
              fontSize: status === 'yes' ? '36px' : '18px',
              fontWeight: status === 'yes' ? 'normal' : '400',
              color: status === 'yes' ? '#000' : '#666',
              textAlign: 'center',
              maxWidth: '500px',
              lineHeight: '1.5',
              padding: '0 20px',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
            }}
          >
            {status === 'checking'
              ? ''
              : status === 'yes'
              ? `Welcome back, ${userName}`
              : 'Welcome! It seems you are new here. Scan the QR code to join the Needo community.'}
          </div>

          {/* User statistics - only show when recognized */}
          {status === 'yes' && (
            <div
              style={{
                marginTop: '20px',
                fontSize: '14px',
                color: '#555',
                textAlign: 'center',
                lineHeight: '1.8',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
              }}
            >
              <div style={{ marginBottom: '8px' }}>
                <strong>Total cups ordered:</strong> 18 cups
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Favorite drink:</strong> Caramel Latte
              </div>
              <div style={{ marginBottom: '15px' }}>
                <strong>Last order:</strong> 2 days ago
              </div>
              <div
                style={{
                  fontSize: '16px',
                  color: '#FF6B35',
                  fontWeight: '500',
                }}
              >
                &quot;You&apos;re 2 cups away from a free drink!&quot;
              </div>
            </div>
          )}
        </>
      )}

      {/* Debug panel - bottom right */}
      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#0f0',
            padding: '10px',
            borderRadius: '5px',
            fontSize: '12px',
            fontFamily: 'monospace',
            lineHeight: '1.5',
          }}
        >
          <div><strong>System State:</strong> {systemState}</div>
          <div><strong>FPS:</strong> {debugInfo.fps}</div>
          <div><strong>Time in State:</strong> {(debugInfo.timeInState / 1000).toFixed(1)}s</div>
          <div><strong>Motion Detection:</strong> {debugInfo.isMotionDetecting ? '🟢' : '🔴'}</div>
          <div><strong>Recognition:</strong> {debugInfo.isRecognizing ? '🟢' : '🔴'}</div>
          <div><strong>UI Visible:</strong> {showUI ? '✅' : '❌'}</div>
        </div>
      )}
    </div>
  );
}

