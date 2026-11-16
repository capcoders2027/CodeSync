'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function GoogleCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const error = searchParams.get('error');

    if (error) {
      window.location.href = `/auth/login?error=${encodeURIComponent(error)}`;
      return;
    }

    if (token) {
      localStorage.setItem('accessToken', token);
      if (userParam) {
        try {
          const user = JSON.parse(decodeURIComponent(userParam));
          localStorage.setItem('user', JSON.stringify(user));
        } catch {}
      }
      // Hard browser navigation to root directly enters dashboard
      window.location.href = '/';
    } else {
      window.location.href = '/auth/login';
    }
  }, [searchParams]);

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="spinner" style={{ width: 32, height: 32 }} />
      <p style={{ color: 'var(--text-secondary)' }}>Entering CodeSync...</p>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    }>
      <GoogleCallbackContent />
    </Suspense>
  );
}
