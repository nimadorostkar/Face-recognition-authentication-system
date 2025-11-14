'use client';

import { useRef, useEffect, useState } from 'react';
import { recognizeFace, captureFrame } from '@/lib/api';
import { SimpleLivenessDetector, extractFrameData, LivenessResult } from '@/lib/liveness';

export default function StartPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'checking' | 'yes' | 'no'>('checking');
  const [userName, setUserName] = useState<string>('');
  const [fadeIn, setFadeIn] = useState(true); // Start visible for initial faceid.mp4
  const [videoSource, setVideoSource] = useState('/media/faceid.mp4');
  const [showQR, setShowQR] = useState(false);
  const recognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const livenessDetectorRef = useRef<SimpleLivenessDetector | null>(null);
  const livenessIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showQRRef = useRef<boolean>(false);

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
          
          // Initialize liveness detector
          livenessDetectorRef.current = new SimpleLivenessDetector();
        }
      } catch (error) {
        console.error('Error accessing webcam:', error);
        setStatus('no');
        setFadeIn(true);
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
      if (qrTimerRef.current) {
        clearTimeout(qrTimerRef.current);
      }
    };
  }, []);

  // Start liveness check once webcam is ready
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    const video = videoRef.current;
    video.onloadedmetadata = () => {
      video.play();
      startLivenessCheck();
    };

    function startLivenessCheck() {
      livenessIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !livenessDetectorRef.current) return;

        const frameData = extractFrameData(videoRef.current);
        if (!frameData) return;

        livenessDetectorRef.current.addFrame(frameData);
        const result = livenessDetectorRef.current.checkLiveness();

        if (result.isLive) {
          // Liveness passed, start recognition
          if (livenessIntervalRef.current) {
            clearInterval(livenessIntervalRef.current);
          }
          setTimeout(() => {
            startContinuousRecognition();
          }, 500);
        }
      }, 200);
    }

    return () => {
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
      }
    };
  }, [stream]);

  // Function to start continuous face recognition after liveness check
  function startContinuousRecognition() {
    // Recognize every 2 seconds
    recognitionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;

      try {
        const imageBase64 = captureFrame(videoRef.current);
        if (!imageBase64) return;

        const result = await recognizeFace(imageBase64);
        console.log('Recognition result:', result);

        // If recognized - reset QR and show success
        if (result.match && result.name) {
          console.log('User recognized:', result.name);
          
          // Clear any existing QR timer
          if (qrTimerRef.current) {
            clearTimeout(qrTimerRef.current);
            qrTimerRef.current = null;
          }
          
          setFadeIn(false);
          setTimeout(() => {
            setStatus('yes');
            setUserName(result.name || '');
            setVideoSource('/media/success.mp4');
            setShowQR(false);
            showQRRef.current = false;
            setFadeIn(true);
            
            if (displayVideoRef.current) {
              displayVideoRef.current.load();
              displayVideoRef.current.play();
            }
          }, 300);
        } 
        // If not recognized and QR not already showing
        else if (!showQRRef.current) {
          console.log('User not recognized, starting QR timer');
          
          // Stop the recognition loop to allow QR timer to complete
          if (recognitionIntervalRef.current) {
            console.log('Pausing recognition loop for QR display');
            clearInterval(recognitionIntervalRef.current);
            recognitionIntervalRef.current = null;
          }
          
          // Clear any existing QR timer
          if (qrTimerRef.current) {
            clearTimeout(qrTimerRef.current);
          }
          
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
            
            // After 3 seconds, show QR code
            qrTimerRef.current = setTimeout(() => {
              console.log('3 seconds passed, showing QR code');
              setFadeIn(false);
              setTimeout(() => {
                console.log('Setting showQR to true');
                setShowQR(true);
                showQRRef.current = true;
                setFadeIn(true);
                
                if (displayVideoRef.current) {
                  displayVideoRef.current.pause();
                }
              }, 500);
            }, 3000);
          }, 300);
        } else {
          console.log('QR already showing, skipping update');
        }
      } catch (error: any) {
        console.error('Recognition error:', error);
        
        // If not recognized and QR not already showing
        if (!showQRRef.current) {
          console.log('Error occurred, starting QR timer');
          
          // Stop the recognition loop to allow QR timer to complete
          if (recognitionIntervalRef.current) {
            console.log('Pausing recognition loop for QR display (error path)');
            clearInterval(recognitionIntervalRef.current);
            recognitionIntervalRef.current = null;
          }
          
          // Clear any existing QR timer
          if (qrTimerRef.current) {
            clearTimeout(qrTimerRef.current);
          }
          
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
            
            // After 3 seconds, show QR code
            qrTimerRef.current = setTimeout(() => {
              console.log('3 seconds passed (error path), showing QR code');
              setFadeIn(false);
              setTimeout(() => {
                console.log('Setting showQR to true (error path)');
                setShowQR(true);
                showQRRef.current = true;
                setFadeIn(true);
                
                if (displayVideoRef.current) {
                  displayVideoRef.current.pause();
                }
              }, 500);
            }, 3000);
          }, 300);
        }
      }
    }, 2000);
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 0,
        padding: 0,
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

      {/* Face ID animation video or QR code */}
      {showQR ? (
        <img
          src="/media/qr.png"
          alt="QR Code"
          onError={(e) => {
            console.error('Failed to load QR image:', e);
          }}
          onLoad={() => {
            console.log('QR image loaded successfully');
            setFadeIn(true);
          }}
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
            // Ensure video is visible when it loads
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
        {status === 'checking' ? '' : status === 'yes' ? `Welcome back, ${userName}` : 'Welcome! It seems you are new here. Scan the QR code to join the Needo community.'}
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
            "You're 2 cups away from a free drink!"
          </div>
        </div>
      )}
    </div>
  );
}
