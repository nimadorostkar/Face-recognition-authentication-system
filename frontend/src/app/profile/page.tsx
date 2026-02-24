'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#7a7a9a',
        fontSize: '16px',
      }}>
        در حال بارگذاری...
      </div>
    );
  }

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
        background: 'rgba(15,15,26,0.85)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#a0a0b8',
              padding: '8px 14px',
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
            ← بازگشت
          </button>
          <h1 style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            background: 'linear-gradient(90deg, #6c63ff, #48c6ef)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            پروفایل کاربری
          </h1>
        </div>
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

      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '40px 24px',
      }}>
        {/* Avatar + Welcome */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '32px',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6c63ff, #48c6ef)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            fontWeight: 700,
            color: '#fff',
            marginBottom: '16px',
            boxShadow: '0 8px 32px rgba(108,99,255,0.3)',
          }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h2 style={{
            margin: '0 0 4px 0',
            fontSize: '24px',
            fontWeight: 700,
            color: '#e0e0f0',
          }}>
            خوش آمدید، {user.name}!
          </h2>
          <span style={{
            fontSize: '13px',
            color: '#4ecdc4',
            background: 'rgba(78,205,196,0.1)',
            padding: '4px 14px',
            borderRadius: '20px',
            border: '1px solid rgba(78,205,196,0.2)',
          }}>
            احراز هویت شده
          </span>
        </div>

        {/* Info Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '28px',
          marginBottom: '20px',
        }}>
          <h3 style={{
            margin: '0 0 20px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: '#b0b0cc',
          }}>
            اطلاعات حساب
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <InfoRow label="شناسه کاربری" value={String(user.userId)} />
            <InfoRow label="نام" value={user.name} />
            {user.mobile && <InfoRow label="شماره تماس" value={user.mobile} ltr />}
          </div>
        </div>

        {/* Security Info */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '14px',
          padding: '20px 24px',
          marginBottom: '28px',
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#9a9abc' }}>
            اطلاعات امنیتی
          </p>
          <ul style={{
            margin: 0,
            paddingRight: '18px',
            paddingLeft: 0,
            fontSize: '13px',
            color: '#6a6a8a',
            lineHeight: 2.2,
            listStyleType: 'none',
          }}>
            <li>○ &nbsp;احراز هویت با تشخیص چهره انجام شده</li>
            <li>○ &nbsp;اطلاعات چهره به صورت بردار رمزنگاری‌شده ذخیره شده (بدون تصویر)</li>
          </ul>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 600,
            background: 'rgba(255,82,82,0.1)',
            color: '#ff5252',
            border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: '12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,82,82,0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,82,82,0.1)';
          }}
        >
          خروج از حساب
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: '13px', color: '#7a7a9a' }}>{label}</span>
      <span style={{
        fontSize: '14px',
        fontWeight: 500,
        color: '#d0d0e8',
        direction: ltr ? 'ltr' : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}
