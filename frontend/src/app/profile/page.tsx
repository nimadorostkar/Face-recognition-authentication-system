'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>User Profile</h1>
      
      <div style={{ 
        marginTop: '30px', 
        padding: '30px', 
        border: '2px solid #0070f3', 
        borderRadius: '8px',
        backgroundColor: '#f5f5f5'
      }}>
        <h2>Welcome, {user.name}! 👋</h2>
        
        <div style={{ marginTop: '20px' }}>
          <p><strong>User ID:</strong> {user.userId}</p>
          <p><strong>Name:</strong> {user.name}</p>
          <p><strong>Status:</strong> Authenticated ✅</p>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <button
          onClick={handleLogout}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#ff4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ marginTop: '40px', fontSize: '14px', color: '#666' }}>
        <h3>Profile Information</h3>
        <p>You have been successfully authenticated using face recognition.</p>
        <p>Your face data is stored securely as a 128D embedding vector (no images are saved).</p>
      </div>
    </div>
  );
}

