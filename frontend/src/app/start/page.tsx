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
  const [videoSource, setVideoSource] = useState('/media/faceid.gif');
  const [showQR, setShowQR] = useState(false);
  const showQRRef = useRef<boolean>(false);

  // Transition states for smooth fade between ai.gif and faceid.gif
  const [showAiGif, setShowAiGif] = useState(true); // Start with ai.gif visible
  const [aiGifOpacity, setAiGifOpacity] = useState(1); // Full opacity initially
  const [faceidGifOpacity, setFaceidGifOpacity] = useState(0); // Hidden initially

  // Post-success screen state
  const [showPostSuccess, setShowPostSuccess] = useState(false);
  const postSuccessTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animated word sequence state for blue.gif
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [wordOpacity, setWordOpacity] = useState(1);
  const wordSequenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Restart timer - reload page after completion
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Motion persistence tracking
  const motionCounterRef = useRef<number>(0);
  const MOTION_REQUIRED_FRAMES = 3; // Require 3 consecutive frames with motion

  // Debug state
  const [debugInfo, setDebugInfo] = useState({
    fps: 0,
    motionPercent: 0,
    motionCounter: 0,
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
          threshold: 0.15, // 15% pixel change (more strict)
          minAreaChange: 800, // Minimum 800 pixels (doubled)
          sensitivity: 4, // Lower sensitivity (less sensitive to small changes)
        });
          
        // Initialize state machine
        stateMachineRef.current = new EnergyEfficientStateMachine({
          idleFPS: 2,
          motionThreshold: 0.15, // Match detector threshold
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
      if (postSuccessTimerRef.current) {
        clearTimeout(postSuccessTimerRef.current);
      }
      if (wordSequenceTimerRef.current) {
        clearTimeout(wordSequenceTimerRef.current);
      }
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
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
   * Animated word sequence effect for blue.gif
   */
  useEffect(() => {
    if (!showPostSuccess) {
      return;
    }

    // Word sequence: "Hi" → userName → "welcome" → reg.png (stops here)
    const sequence = ['Hi', userName || 'Guest', 'welcome', 'reg.png'];
    const FADE_DURATION = 300; // ms - faster fade
    const DISPLAY_DURATION = 800; // ms - shorter display (faster overall)

    function cycleWord() {
      setCurrentWordIndex((prev) => {
        const nextIndex = prev + 1;
        
        // Stop at reg.png (last item)
        if (nextIndex >= sequence.length) {
          // Clear the interval to stop the loop
          if (wordSequenceTimerRef.current) {
            clearInterval(wordSequenceTimerRef.current);
          }
          return prev; // Stay at reg.png
        }
        
        // Fade out
        setWordOpacity(0);
        
        setTimeout(() => {
          // Change word
          setCurrentWordIndex(nextIndex);
          
          // Fade in
          setTimeout(() => {
            setWordOpacity(1);
          }, 50);
        }, FADE_DURATION);
        
        return prev;
      });
    }

    // Start the sequence
    wordSequenceTimerRef.current = setInterval(cycleWord, FADE_DURATION + DISPLAY_DURATION);

    return () => {
      if (wordSequenceTimerRef.current) {
        clearInterval(wordSequenceTimerRef.current);
      }
    };
  }, [showPostSuccess, userName]);

  /**
   * Restart page after completion (success or failure)
   */
  useEffect(() => {
    // Clear any existing restart timer
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    
    // For success: restart after 10 seconds when post-success screen is shown
    if (showPostSuccess) {
      restartTimerRef.current = setTimeout(() => {
        console.log('[Restart] Success path complete - reloading page after 10 seconds...');
        window.location.reload();
      }, 10000); // 10 seconds for success
    }
    
    // For failure: restart after 6 seconds when QR code is shown
    if (showQR) {
      restartTimerRef.current = setTimeout(() => {
        console.log('[Restart] Failure path complete - reloading page after 6 seconds...');
        window.location.reload();
      }, 6000); // 6 seconds for failure
    }

    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, [showPostSuccess, showQR]);

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
      // Increment motion counter
      motionCounterRef.current += 1;
      
      console.log(`[MotionDetector] Motion detected! Change: ${(result.changePercentage * 100).toFixed(1)}% (count: ${motionCounterRef.current}/${MOTION_REQUIRED_FRAMES})`);
      
      // Only trigger state change if we have enough consecutive motion frames
      if (motionCounterRef.current >= MOTION_REQUIRED_FRAMES) {
        stateMachine.onMotionDetected();
        
        // Show UI when motion is confirmed with smooth fade transition
        if (!showUI) {
          console.log('[UI] Significant motion confirmed - transitioning from ai.gif to faceid.gif');
          
          // Step 1: Fade out ai.gif
          setAiGifOpacity(0);
          
          // Step 2: After fade out, fade in faceid.gif and show UI
          setTimeout(() => {
            setShowAiGif(false); // Hide ai.gif completely
            setShowUI(true);
            setFaceidGifOpacity(1); // Fade in faceid.gif
            setFadeIn(true);
            console.log('[UI] Transition complete - faceid.gif visible');
          }, 500); // 500ms fade duration
        }
      }
    } else {
      // Reset counter if no motion
      if (motionCounterRef.current > 0) {
        console.log(`[MotionDetector] No motion - resetting counter (was: ${motionCounterRef.current})`);
        motionCounterRef.current = 0;
      }
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
    console.log('[Video] Switching from faceid.gif to success.mp4');
    
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
      console.log('[Video] Setting videoSource to /media/success.mp4');
            setStatus('yes');
      setUserName(name);
      setVideoSource('/media/success.mp4'); // This should trigger video change
            setShowQR(false);
            showQRRef.current = false;
            
      // Force video reload
      setTimeout(() => {
            if (displayVideoRef.current) {
          console.log('[Video] Loading success.mp4');
              displayVideoRef.current.load();
          displayVideoRef.current.play().catch(err => {
            console.error('[Video] Play error:', err);
          });
            }
        setFadeIn(true);
        
        // Show post-success screen after 2 seconds
        if (postSuccessTimerRef.current) {
          clearTimeout(postSuccessTimerRef.current);
        }
        postSuccessTimerRef.current = setTimeout(() => {
          console.log('[PostSuccess] Showing blue.gif and purple.gif screen');
          setShowPostSuccess(true);
          setFadeIn(false); // Hide success video
        }, 2000); // 2 seconds after success video starts
      }, 100);
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
      motionCounter: motionCounterRef.current,
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
        backgroundColor: 'black', // Always black background
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

      {/* Animated ring on black screen (idle mode) - ai.gif with fade */}
      {showAiGif && (
        <div
          style={{
            position: 'absolute',
            width: '800px',
            height: '800px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: aiGifOpacity,
            transition: 'opacity 0.5s ease-in-out',
            pointerEvents: 'none',
          }}
        >
          <img
            src="/media/ai.gif"
            alt="Scanning"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          {/* Enhanced radial fade with stronger top fade */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `
                radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.7) 70%, black 85%),
                linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.4) 100%)
              `,
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

      {/* UI - Only show after motion detected, hide when post-success screen is shown */}
      {showUI && !showPostSuccess && (
        <>
      {/* Face ID animation video or QR code */}
      {showQR ? (
        <>
          {/* Full screen background GIF */}
        <img
            src="/media/qrback.gif"
            alt="QR Background"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              objectFit: 'cover',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              display: 'block',
              zIndex: 1,
            }}
          />
          {/* Centered reg.png on top of background */}
          <img
            src="/media/reg.png"
            alt="Registration QR"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              maxWidth: '30%',
              maxHeight: '30%',
              width: 'auto',
              height: 'auto',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              display: 'block',
              zIndex: 2,
            }}
          />
          {/* Text below reg.png */}
          <div
            style={{
              position: 'fixed',
              top: 'calc(50% + 16vh)',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#fff',
              fontSize: '20px',
              fontWeight: 'normal',
              textAlign: 'center',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              zIndex: 2,
            }}
          >
            Join Needo Now!
          </div>
        </>
      ) : videoSource.endsWith('.gif') ? (
        // Render GIF as img element with smooth fade transition and edge fade
        <div
          style={{
            position: 'relative',
            width: '300px',
            height: 'auto',
            marginBottom: '20px',
            display: showQR ? 'none' : 'block',
          }}
        >
          <img
            key={videoSource}
            src={videoSource}
            alt="Face ID"
            onLoad={() => {
              console.log('[Image] Loaded:', videoSource, 'Status:', status);
              // For faceid.gif, use the fade transition opacity
              if (videoSource === '/media/faceid.gif') {
                setFaceidGifOpacity(1);
              }
              setFadeIn(true);
            }}
            onError={(e) => {
              console.error('[Image] Error loading:', videoSource, e);
            }}
            style={{
              width: '100%',
              height: 'auto',
              opacity: videoSource === '/media/faceid.gif' ? faceidGifOpacity : (fadeIn ? 1 : 0),
            transition: 'opacity 0.5s ease-in-out',
            display: 'block',
          }}
        />
          {/* Radial fade overlay to blend edges with black background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `
                radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 85%, black 95%),
                linear-gradient(to top, black 0%, transparent 20%, transparent 80%, black 100%),
                linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%),
                linear-gradient(to left, black 0%, transparent 20%, transparent 80%, black 100%),
                linear-gradient(to right, black 0%, transparent 20%, transparent 80%, black 100%)
              `,
              pointerEvents: 'none',
              borderRadius: '8px',
            }}
          />
        </div>
      ) : (
        // Render MP4 as video element with fade overlay
        <div
          style={{
            position: 'relative',
            width: '300px',
            height: 'auto',
            marginBottom: '20px',
            display: showQR ? 'none' : 'block',
          }}
        >
          <video
            key={videoSource} // Force re-render when video source changes
            ref={displayVideoRef}
            autoPlay
            loop={status === 'checking'} // Only loop faceid.gif, not success/fail
            muted
            playsInline
            onLoadedData={() => {
              // Fade in for all videos when loaded
              console.log('[Video] Loaded:', videoSource, 'Status:', status);
              setFadeIn(true);
            }}
            onError={(e) => {
              console.error('[Video] Error loading:', videoSource, e);
            }}
            style={{
              width: '100%',
              height: 'auto',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              display: 'block',
            }}
          >
            <source src={videoSource} type="video/mp4" key={videoSource} />
        </video>
          {/* Radial fade overlay to blend edges with black background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `
                radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 85%, black 95%),
                linear-gradient(to top, black 0%, transparent 20%, transparent 80%, black 100%),
                linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%),
                linear-gradient(to left, black 0%, transparent 20%, transparent 80%, black 100%),
                linear-gradient(to right, black 0%, transparent 20%, transparent 80%, black 100%)
              `,
              pointerEvents: 'none',
              borderRadius: '8px',
            }}
          />
        </div>
      )}
      
          {/* Status text - only show on success */}
      {status === 'yes' && (
      <div
        style={{
            fontSize: '36px',
            fontWeight: 'normal',
            color: '#fff', // White text on black
          textAlign: 'center',
          maxWidth: '500px',
          lineHeight: '1.5',
          padding: '0 20px',
          opacity: fadeIn ? 1 : 0,
          transition: 'opacity 0.5s ease-in-out',
        }}
      >
          Hi, {userName} 💞 
      </div>
      )}
        </>
      )}
      
      {/* Post-success screen - blue.gif and purple.gif */}
      {showPostSuccess && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {/* purple.gif on the left, vertically centered - 2x bigger */}
          <div
            style={{
              position: 'absolute',
              left: '3%',
              top: '50%',
              transform: 'translateY(-50%)',
              maxWidth: '40%',
              maxHeight: '80%',
              width: 'auto',
              height: 'auto',
          }}
        >
            <img
              src="/media/purple.gif"
              alt="Purple"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
            {/* Radial fade overlay to blend edges with black background */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: `
                  radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 85%, black 95%),
                  linear-gradient(to top, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to left, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to right, black 0%, transparent 20%, transparent 80%, black 100%)
                `,
                pointerEvents: 'none',
              }}
            />
            {/* user.png centered on purple.gif with text below */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 1,
              }}
            >
              {/* user.png */}
              <img
                src="/media/user.png"
                alt="User"
                style={{
                  maxWidth: '120px',
                  maxHeight: '120px',
                  width: 'auto',
                  height: 'auto',
                  marginBottom: '10px',
                }}
              />
              
              {/* Text below user.png: username only */}
              <div
                style={{
                  textAlign: 'center',
                  color: '#fff',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {userName || 'Guest'} ✨
                </div>
              </div>
          </div>
            
            {/* Text below purple.gif: coffee count and gift text */}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '15px',
                textAlign: 'center',
                zIndex: 1,
              }}
            >
              <div style={{ fontSize: '18px', color: '#ccc', marginBottom: '8px' }}>
                25 coffee ☕ until today
              </div>
              <div style={{ fontSize: '14px', color: '#aaa', fontStyle: 'italic' }}>
                Just 1 more order to unlock your gift!
              </div>
          </div>
          </div>
          
          {/* blue.gif on the right, vertically centered - cropped to remove black borders - bigger */}
          <div
            style={{
              position: 'absolute',
              right: '3%',
              top: '50%',
              transform: 'translateY(-50%)',
              maxWidth: '55%',
              maxHeight: '90%',
              width: 'auto',
              height: 'auto',
              overflow: 'hidden',
            }}
          >
            <img
              src="/media/blue.gif"
              alt="Blue"
              style={{
                width: '120%',
                height: '120%',
                objectFit: 'cover',
                objectPosition: 'center',
              }}
            />
            {/* Radial fade overlay to blend edges with black background */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: `
                  radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 85%, black 95%),
                  linear-gradient(to top, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to left, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to right, black 0%, transparent 20%, transparent 80%, black 100%)
                `,
                pointerEvents: 'none',
              }}
            />
            {/* Animated word sequence centered on blue circle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '60%',
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontSize: '38px',
                fontWeight: 'bold',
                textAlign: 'center',
                zIndex: 2,
                pointerEvents: 'none',
                opacity: wordOpacity,
                transition: 'opacity 0.5s ease-in-out',
              }}
            >
              {(() => {
                const sequence = ['Hi', userName || 'Guest', 'welcome', 'reg.png'];
                const currentItem = sequence[currentWordIndex];
                
                if (currentItem === 'reg.png') {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <img
                        src="/media/reg.png"
                        alt="Registration"
                        style={{
                          width: '120px',
                          height: 'auto',
                          marginBottom: '15px',
                        }}
                      />
                      <div style={{ fontSize: '14px', fontWeight: 'normal', color: '#ccc' }}>
                        Scan dashboard
                      </div>
                    </div>
                  );
                }
                
                return currentItem;
              })()}
            </div>
          </div>
        </div>
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
          <div><strong>Motion Counter:</strong> {debugInfo.motionCounter}/{MOTION_REQUIRED_FRAMES}</div>
          <div><strong>Motion Detection:</strong> {debugInfo.isMotionDetecting ? '🟢' : '🔴'}</div>
          <div><strong>Recognition:</strong> {debugInfo.isRecognizing ? '🟢' : '🔴'}</div>
          <div><strong>UI Visible:</strong> {showUI ? '✅' : '❌'}</div>
        </div>
      )}
    </div>
  );
}
