'use client';

import { useRef, useEffect, useState } from 'react';
import { recognizeFace, captureFrame } from '@/lib/api';
import { SimpleLivenessDetector, extractFrameData, LivenessResult } from '@/lib/liveness';

export default function StartPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'checking' | 'yes' | 'no'>('checking');
  const [fadeIn, setFadeIn] = useState(false);
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

        // Fade out current status
        setFadeIn(false);

        // After fade out, change status and fade in
        setTimeout(() => {
          if (result.match && result.name) {
            setStatus('yes');
          } else {
            setStatus('no');
          }
          setFadeIn(true);
        }, 300);
      } catch (error: any) {
        console.error('Recognition error:', error);
        // Show "no" on error
        setFadeIn(false);
        setTimeout(() => {
          setStatus('no');
          setFadeIn(true);
        }, 300);
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
      {/* Hidden webcam video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      <h1 style={{ fontSize: '48px', margin: 0, marginBottom: '20px' }}>hi</h1>
      
      <div
        style={{
          fontSize: '36px',
          opacity: fadeIn ? 1 : 0,
          transition: 'opacity 0.5s ease-in-out',
        }}
      >
        {status === 'checking' ? '' : status}
      </div>
    </div>
  );
}
