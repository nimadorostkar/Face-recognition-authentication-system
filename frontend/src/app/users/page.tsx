'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { fetchUsers, UserInfo, FetchUsersParams } from '@/lib/api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toInputDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [minVisits, setMinVisits] = useState('');
  const [maxVisits, setMaxVisits] = useState('');
  const [joinedAfter, setJoinedAfter] = useState('');
  const [joinedBefore, setJoinedBefore] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: FetchUsersParams = {
        search: search || undefined,
        min_visits: minVisits ? Number(minVisits) : undefined,
        max_visits: maxVisits ? Number(maxVisits) : undefined,
        joined_after: joinedAfter || undefined,
        joined_before: joinedBefore || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        limit: 200,
      };
      const data = await fetchUsers(params);
      setUsers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, minVisits, maxVisits, joinedAfter, joinedBefore, sortBy, sortOrder]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }

  function clearFilters() {
    setSearch('');
    setMinVisits('');
    setMaxVisits('');
    setJoinedAfter('');
    setJoinedBefore('');
    setSortBy('created_at');
    setSortOrder('desc');
  }

  const sortIndicator = (field: string) => {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  const hasFilters = search || minVisits || maxVisits || joinedAfter || joinedBefore;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
      color: '#e0e0e0',
      padding: '0',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
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
            لیست کاربران
          </h1>
        </div>
        <div style={{
          fontSize: '14px',
          color: '#7a7a9a',
          background: 'rgba(108,99,255,0.1)',
          padding: '6px 16px',
          borderRadius: '20px',
          border: '1px solid rgba(108,99,255,0.2)',
        }}>
          {loading ? '...' : `${users.length} کاربر`}
        </div>
      </header>

      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 0 0' }}>
        <Image src="/media/Avro.png" alt="Avro" width={140} height={56} style={{ objectFit: 'contain' }} priority />
      </div>

      <div style={{ padding: '24px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Filters */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#b0b0cc' }}>
              فیلتر و جستجو
            </span>
            {hasFilters && (
              <button
                onClick={clearFilters}
                style={{
                  background: 'rgba(255,82,82,0.1)',
                  border: '1px solid rgba(255,82,82,0.2)',
                  borderRadius: '8px',
                  color: '#ff5252',
                  padding: '4px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,82,82,0.2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,82,82,0.1)';
                }}
              >
                پاک کردن فیلترها
              </button>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            {/* Search */}
            <div>
              <label style={labelStyle}>جستجو بر اساس نام</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="نام کاربر..."
                style={inputStyle}
              />
            </div>

            {/* Min Visits */}
            <div>
              <label style={labelStyle}>حداقل بازدید</label>
              <input
                type="number"
                min="0"
                value={minVisits}
                onChange={e => setMinVisits(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </div>

            {/* Max Visits */}
            <div>
              <label style={labelStyle}>حداکثر بازدید</label>
              <input
                type="number"
                min="0"
                value={maxVisits}
                onChange={e => setMaxVisits(e.target.value)}
                placeholder="—"
                style={inputStyle}
              />
            </div>

            {/* Joined After */}
            <div>
              <label style={labelStyle}>عضویت از تاریخ</label>
              <input
                type="date"
                value={joinedAfter}
                onChange={e => setJoinedAfter(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Joined Before */}
            <div>
              <label style={labelStyle}>عضویت تا تاریخ</label>
              <input
                type="date"
                value={joinedBefore}
                onChange={e => setJoinedBefore(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.25)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            color: '#ff6b6b',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span style={{ fontSize: '18px' }}>⚠</span>
            {error}
            <button
              onClick={loadUsers}
              style={{
                marginRight: 'auto',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}>
              <thead>
                <tr style={{
                  background: 'rgba(108,99,255,0.08)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <th style={thStyle}>#</th>
                  <th
                    style={{ ...thStyle, cursor: 'pointer' }}
                    onClick={() => handleSort('name')}
                  >
                    نام{sortIndicator('name')}
                  </th>
                  <th style={thStyle}>شماره تماس</th>
                  <th
                    style={{ ...thStyle, cursor: 'pointer' }}
                    onClick={() => handleSort('visit_count')}
                  >
                    تعداد بازدید{sortIndicator('visit_count')}
                  </th>
                  <th style={thStyle}>آخرین بازدید</th>
                  <th
                    style={{ ...thStyle, cursor: 'pointer' }}
                    onClick={() => handleSort('created_at')}
                  >
                    تاریخ عضویت{sortIndicator('created_at')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: '#7a7a9a' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          border: '3px solid rgba(108,99,255,0.2)',
                          borderTopColor: '#6c63ff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        <span>در حال بارگذاری...</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: '#7a7a9a' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.5 }}>👤</div>
                      {hasFilters ? 'کاربری با این فیلتر یافت نشد' : 'هنوز کاربری ثبت‌نام نکرده'}
                    </td>
                  </tr>
                ) : (
                  users.map((user, idx) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(108,99,255,0.05)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'rgba(108,99,255,0.12)',
                          color: '#8a84ff',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}>
                          {idx + 1}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: `linear-gradient(135deg, ${avatarColor(user.name)})`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '14px',
                            color: '#fff',
                            flexShrink: 0,
                          }}>
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 500, color: '#e0e0f0' }}>{user.name}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: user.mobile ? '#b0b0cc' : '#555570', direction: 'ltr', display: 'inline-block' }}>
                          {user.mobile || '—'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          background: visitBadgeBg(user.visit_count),
                          color: visitBadgeColor(user.visit_count),
                        }}>
                          {user.visit_count}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#8a8aaa', fontSize: '13px' }}>
                        {formatDateTime(user.last_visit_at)}
                      </td>
                      <td style={{ ...tdStyle, color: '#8a8aaa', fontSize: '13px' }}>
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.7);
        }
      `}} />
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
  padding: '10px 14px',
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

const thStyle: React.CSSProperties = {
  padding: '14px 16px',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: '13px',
  color: '#9a9abc',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  whiteSpace: 'nowrap',
};

function avatarColor(name: string): string {
  const colors = [
    '#6c63ff, #48c6ef',
    '#ff6b6b, #ffa07a',
    '#4ecdc4, #45b7d1',
    '#a18cd1, #fbc2eb',
    '#f093fb, #f5576c',
    '#4facfe, #00f2fe',
    '#43e97b, #38f9d7',
    '#fa709a, #fee140',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function visitBadgeBg(count: number): string {
  if (count >= 10) return 'rgba(76, 175, 80, 0.15)';
  if (count >= 5) return 'rgba(33, 150, 243, 0.15)';
  if (count >= 1) return 'rgba(255, 193, 7, 0.12)';
  return 'rgba(255,255,255,0.05)';
}

function visitBadgeColor(count: number): string {
  if (count >= 10) return '#66bb6a';
  if (count >= 5) return '#42a5f5';
  if (count >= 1) return '#ffc107';
  return '#666680';
}
