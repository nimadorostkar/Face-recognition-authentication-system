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

  // Don't show anything if redirecting
  if (isAuthenticated) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  return <WebcamRecognition />;
}

