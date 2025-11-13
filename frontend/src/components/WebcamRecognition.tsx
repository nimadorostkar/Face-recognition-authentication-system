'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recognizeFace, registerUser, captureFrame } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleLivenessDetector, extractFrameData, LivenessResult } from '@/lib/liveness';

export default function WebcamRecognition() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [message, setMessage] = useState('Starting webcam...');
  const [showRegister, setShowRegister] = useState(false);
  const [registrationName, setRegistrationName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [livenessCheck, setLivenessCheck] = useState<LivenessResult | null>(null);
  const [isCheckingLiveness, setIsCheckingLiveness] = useState(false);
  const [livenessProgress, setLivenessProgress] = useState(0);
  const router = useRouter();
  const { login } = useAuth();
  const recognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const livenessDetectorRef = useRef<SimpleLivenessDetector | null>(null);
  const livenessIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start webcam
  useEffect(() => {
    async function startWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          setStream(mediaStream);
          setMessage('Webcam ready. Starting liveness check...');
          
          // Initialize liveness detector
          livenessDetectorRef.current = new SimpleLivenessDetector();
        }
      } catch (error) {
        console.error('Error accessing webcam:', error);
        setMessage('Error: Could not access webcam. Please grant permission.');
      }
    }

    startWebcam();

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (recognitionIntervalRef.current) {
        clearInterval(recognitionIntervalRef.current);
      }
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
      }
    };
  }, []);

  // Start liveness check once webcam is ready
  useEffect(() => {
    if (!stream || !videoRef.current || isCheckingLiveness) return;

    setIsCheckingLiveness(true);

    const video = videoRef.current;
    video.onloadedmetadata = () => {
      video.play();
      startLivenessCheck();
    };

    function startLivenessCheck() {
      setMessage('Starting face recognition...');

      livenessIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !livenessDetectorRef.current) return;

        const frameData = extractFrameData(videoRef.current);
        if (!frameData) return;

        livenessDetectorRef.current.addFrame(frameData);
        const progress = livenessDetectorRef.current.getProgress();
        setLivenessProgress(progress);

        const result = livenessDetectorRef.current.checkLiveness();
        setLivenessCheck(result);

        if (result.isLive) {
          // Simple check passed!
          setMessage('✅ Ready! Starting face recognition...');
          
          if (livenessIntervalRef.current) {
            clearInterval(livenessIntervalRef.current);
          }

          // Start face recognition
          setTimeout(() => {
            startContinuousRecognition();
          }, 500);
        } else if (progress >= 100 && !result.isLive) {
          setMessage('Please move slightly and try again...');
          livenessDetectorRef.current.reset();
          setLivenessProgress(0);
        }
      }, 200); // Check every 200ms
    }

    return () => {
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
      }
    };
  }, [stream, isCheckingLiveness]);

  // Function to start continuous face recognition after liveness check
  function startContinuousRecognition() {
    setIsRecognizing(true);
    setMessage('Looking for faces...');

    // Recognize every 2 seconds
    recognitionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;

      try {
        const imageBase64 = captureFrame(videoRef.current);
        if (!imageBase64) return;

        const result = await recognizeFace(imageBase64);

        if (result.match && result.name && result.user_id) {
          // Face recognized - auto login!
          setMessage(`Welcome back, ${result.name}! Logging in...`);
          
          // Stop recognition
          if (recognitionIntervalRef.current) {
            clearInterval(recognitionIntervalRef.current);
          }

          // Login and redirect
          login(result.name, result.user_id);
          setTimeout(() => {
            router.push('/profile');
          }, 1000);
        } else {
          // Not recognized
          setMessage('Face not recognized. Would you like to register?');
          setShowRegister(true);
        }
      } catch (error: any) {
        console.error('Recognition error:', error);
        setMessage(`Recognition active... ${error.message || ''}`);
      }
    }, 2000); // Check every 2 seconds
  }

  // Handle registration
  async function handleRegister() {
    if (!registrationName.trim()) {
      alert('Please enter your name');
      return;
    }

    if (!videoRef.current) return;

    // Check liveness before registration
    if (!livenessCheck || !livenessCheck.isLive) {
      setMessage('⚠️ Please complete liveness check first. Move your head or blink.');
      return;
    }

    setIsRegistering(true);
    setMessage('Capturing your face...');

    try {
      // Stop continuous recognition
      if (recognitionIntervalRef.current) {
        clearInterval(recognitionIntervalRef.current);
      }

      // Capture frame
      const imageBase64 = captureFrame(videoRef.current);
      if (!imageBase64) {
        throw new Error('Failed to capture image');
      }

      setMessage('Registering...');

      // Register user
      const result = await registerUser(registrationName.trim(), imageBase64);

      setMessage(`Registration successful! Welcome, ${result.name}!`);

      // Login and redirect
      login(result.name, result.user_id);
      setTimeout(() => {
        router.push('/profile');
      }, 1000);
    } catch (error: any) {
      console.error('Registration error:', error);
      setMessage(`Registration failed: ${error.message}`);
      setIsRegistering(false);
      
      // Restart liveness check
      setIsCheckingLiveness(false);
      if (livenessDetectorRef.current) {
        livenessDetectorRef.current.reset();
      }
      setLivenessProgress(0);
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Face Recognition Authentication</h1>
      
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            maxWidth: '640px',
            height: 'auto',
            border: livenessCheck?.isLive ? '3px solid #4CAF50' : '2px solid #333',
            borderRadius: '8px',
            backgroundColor: '#000',
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '16px', fontWeight: 'bold' }}>{message}</p>
      </div>

      {showRegister && !isRegistering && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>Register New User</h2>
          <p>We don&apos;t recognize your face. Would you like to register?</p>
          
          <div style={{ marginTop: '15px' }}>
            <input
              type="text"
              placeholder="Enter your name"
              value={registrationName}
              onChange={(e) => setRegistrationName(e.target.value)}
              style={{
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                marginRight: '10px',
                width: '200px',
              }}
            />
            <button
              onClick={handleRegister}
              disabled={isRegistering}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Register
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '30px', fontSize: '14px', color: '#666' }}>
        <p><strong>How it works:</strong></p>
        <ul>
          <li>The system starts your webcam automatically</li>
          <li>Face recognition runs continuously</li>
          <li>If recognized, you&apos;ll be logged in instantly</li>
          <li>If not recognized, you can register with your name</li>
        </ul>
      </div>
    </div>
  );
}

