'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { recognizeFace, registerUser, captureFrame } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleLivenessDetector, extractFrameData, LivenessResult } from '@/lib/liveness';

export default function WebcamRecognition() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [message, setMessage] = useState('در حال راه‌اندازی دوربین...');
  const [showRegister, setShowRegister] = useState(false);
  const [registrationName, setRegistrationName] = useState('');
  const [registrationMobile, setRegistrationMobile] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [livenessCheck, setLivenessCheck] = useState<LivenessResult | null>(null);
  const [isCheckingLiveness, setIsCheckingLiveness] = useState(false);
  const [livenessProgress, setLivenessProgress] = useState(0);
  const router = useRouter();
  const { login } = useAuth();
  const recognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const livenessDetectorRef = useRef<SimpleLivenessDetector | null>(null);
  const livenessIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          setMessage('دوربین آماده است. شروع بررسی...');
          livenessDetectorRef.current = new SimpleLivenessDetector();
        }
      } catch (error) {
        console.error('Error accessing webcam:', error);
        setMessage('خطا: دسترسی به دوربین امکان‌پذیر نیست. لطفاً اجازه دسترسی بدهید.');
      }
    }

    startWebcam();

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

  useEffect(() => {
    if (!stream || !videoRef.current || isCheckingLiveness) return;

    setIsCheckingLiveness(true);

    const video = videoRef.current;
    video.onloadedmetadata = () => {
      video.play();
      startLivenessCheck();
    };

    function startLivenessCheck() {
      setMessage('شروع تشخیص چهره...');

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
          setMessage('آماده! شروع تشخیص چهره...');
          if (livenessIntervalRef.current) {
            clearInterval(livenessIntervalRef.current);
          }
          setTimeout(() => {
            startContinuousRecognition();
          }, 500);
        } else if (progress >= 100 && !result.isLive) {
          setMessage('لطفاً کمی حرکت کنید و دوباره تلاش کنید...');
          livenessDetectorRef.current.reset();
          setLivenessProgress(0);
        }
      }, 200);
    }

    return () => {
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
      }
    };
  }, [stream, isCheckingLiveness]);

  function startContinuousRecognition() {
    setIsRecognizing(true);
    setMessage('در حال جستجوی چهره...');

    recognitionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;

      try {
        const imageBase64 = captureFrame(videoRef.current);
        if (!imageBase64) return;

        const result = await recognizeFace(imageBase64);

        if (result.match && result.name && result.user_id) {
          setMessage(`خوش آمدید، ${result.name}! در حال ورود...`);
          if (recognitionIntervalRef.current) {
            clearInterval(recognitionIntervalRef.current);
          }
          login(result.name, result.user_id);
          setTimeout(() => {
            router.push('/profile');
          }, 1000);
        } else {
          setMessage('چهره شناسایی نشد. آیا می‌خواهید ثبت‌نام کنید؟');
          setShowRegister(true);
        }
      } catch (error: any) {
        console.error('Recognition error:', error);
        setMessage(`در حال تشخیص... ${error.message || ''}`);
      }
    }, 2000);
  }

  async function handleRegister() {
    if (!registrationName.trim()) {
      alert('لطفاً نام خود را وارد کنید');
      return;
    }

    if (!videoRef.current) return;

    if (!livenessCheck || !livenessCheck.isLive) {
      setMessage('لطفاً ابتدا بررسی زنده بودن را تکمیل کنید. سر خود را حرکت دهید.');
      return;
    }

    setIsRegistering(true);
    setMessage('در حال ثبت تصویر چهره...');

    try {
      if (recognitionIntervalRef.current) {
        clearInterval(recognitionIntervalRef.current);
      }

      const imageBase64 = captureFrame(videoRef.current);
      if (!imageBase64) {
        throw new Error('خطا در ثبت تصویر');
      }

      setMessage('در حال ثبت‌نام...');

      const result = await registerUser(registrationName.trim(), imageBase64, registrationMobile.trim() || undefined);

      setMessage(`ثبت‌نام موفق! خوش آمدید، ${result.name}!`);

      login(result.name, result.user_id, result.mobile);
      setTimeout(() => {
        router.push('/profile');
      }, 1000);
    } catch (error: any) {
      console.error('Registration error:', error);
      setMessage(`خطا در ثبت‌نام: ${error.message}`);
      setIsRegistering(false);
      setIsCheckingLiveness(false);
      if (livenessDetectorRef.current) {
        livenessDetectorRef.current.reset();
      }
      setLivenessProgress(0);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0',
    }}>
      {/* Header */}
      <header style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
        background: 'rgba(15,15,26,0.85)',
        boxSizing: 'border-box',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '22px',
          fontWeight: 700,
          background: 'linear-gradient(90deg, #6c63ff, #48c6ef)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          احراز هویت با تشخیص چهره
        </h1>
        <button
          onClick={() => router.push('/users')}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            color: '#a0a0b8',
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = '#a0a0b8';
          }}
        >
          لیست کاربران
        </button>
      </header>

      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 0 0' }}>
        <Image src="/media/Avro.png" alt="Avro" width={140} height={56} style={{ objectFit: 'contain' }} priority />
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px',
        maxWidth: '700px',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {/* Video Container */}
        <div style={{
          position: 'relative',
          marginBottom: '24px',
          borderRadius: '20px',
          overflow: 'hidden',
          border: livenessCheck?.isLive
            ? '2px solid rgba(76,175,80,0.5)'
            : '2px solid rgba(108,99,255,0.3)',
          boxShadow: livenessCheck?.isLive
            ? '0 0 30px rgba(76,175,80,0.15)'
            : '0 0 30px rgba(108,99,255,0.1)',
          transition: 'border-color 0.5s, box-shadow 0.5s',
          width: '100%',
          maxWidth: '560px',
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              backgroundColor: '#0a0a14',
              transform: 'scaleX(-1)',
            }}
          />
          {/* Progress bar overlay */}
          {!livenessCheck?.isLive && livenessProgress > 0 && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'rgba(0,0,0,0.5)',
            }}>
              <div style={{
                height: '100%',
                width: `${livenessProgress}%`,
                background: 'linear-gradient(90deg, #6c63ff, #48c6ef)',
                transition: 'width 0.3s',
                borderRadius: '2px',
              }} />
            </div>
          )}
        </div>

        {/* Status Message */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          padding: '16px 24px',
          marginBottom: '24px',
          textAlign: 'center',
          width: '100%',
          maxWidth: '560px',
          boxSizing: 'border-box',
        }}>
          <p style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 500,
            color: '#c0c0d8',
            lineHeight: 1.7,
          }}>
            {message}
          </p>
        </div>

        {/* Registration Form */}
        {showRegister && !isRegistering && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            padding: '28px',
            width: '100%',
            maxWidth: '560px',
            boxSizing: 'border-box',
          }}>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 700,
              background: 'linear-gradient(90deg, #6c63ff, #48c6ef)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              ثبت‌نام کاربر جدید
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#7a7a9a' }}>
              چهره شما شناسایی نشد. آیا می‌خواهید ثبت‌نام کنید؟
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>نام</label>
                <input
                  type="text"
                  placeholder="نام خود را وارد کنید"
                  value={registrationName}
                  onChange={(e) => setRegistrationName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>شماره تماس</label>
                <input
                  type="tel"
                  placeholder="شماره موبایل"
                  value={registrationMobile}
                  onChange={(e) => setRegistrationMobile(e.target.value)}
                  style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
                />
              </div>
              <button
                onClick={handleRegister}
                disabled={isRegistering}
                style={{
                  padding: '12px 24px',
                  fontSize: '15px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #6c63ff, #48c6ef)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  width: '100%',
                  fontFamily: 'inherit',
                  transition: 'opacity 0.2s, transform 0.2s',
                  opacity: isRegistering ? 0.6 : 1,
                }}
                onMouseEnter={e => {
                  if (!isRegistering) e.currentTarget.style.opacity = '0.85';
                }}
                onMouseLeave={e => {
                  if (!isRegistering) e.currentTarget.style.opacity = '1';
                }}
              >
                ثبت‌نام
              </button>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div style={{
          marginTop: '16px',
          padding: '20px 24px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '560px',
          boxSizing: 'border-box',
        }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: '#9a9abc' }}>
            نحوه عملکرد:
          </p>
          <ul style={{
            margin: 0,
            paddingRight: '18px',
            paddingLeft: 0,
            fontSize: '13px',
            color: '#6a6a8a',
            lineHeight: 2,
            listStyleType: 'none',
          }}>
            <li>○ &nbsp;دوربین به صورت خودکار فعال می‌شود</li>
            <li>○ &nbsp;تشخیص چهره به صورت مداوم اجرا می‌شود</li>
            <li>○ &nbsp;در صورت شناسایی، ورود خودکار انجام می‌شود</li>
            <li>○ &nbsp;در صورت عدم شناسایی، می‌توانید ثبت‌نام کنید</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: '#7a7a9a',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e0e0f0',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
  fontFamily: 'inherit',
};
