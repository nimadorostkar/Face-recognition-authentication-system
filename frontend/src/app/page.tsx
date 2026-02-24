'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import WebcamRecognition from '@/components/WebcamRecognition';

export default function Home() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Redirect to profile if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/profile');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#7a7a9a',
        fontSize: '16px',
      }}>
        در حال انتقال...
      </div>
    );
  }

  return <WebcamRecognition />;
}

