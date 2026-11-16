'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../contexts/AuthContext';
import { useToast } from '../../../../contexts/ToastContext';

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const error = searchParams.get('error');

    if (error) {
      toast.error('Google Sign-in failed', error);
      router.push('/auth/login');
      return;
    }

    if (token && userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        login(token, user);
        toast.success('Signed in with Google', `Welcome back, ${user.displayName || user.email}!`);
        router.push('/');
      } catch (e) {
        toast.error('Authentication error', 'Failed to parse user profile.');
        router.push('/auth/login');
      }
    } else {
      router.push('/auth/login');
    }
  }, [searchParams, login, router, toast]);

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="spinner" style={{ width: 32, height: 32 }} />
      <p style={{ color: 'var(--text-secondary)' }}>Completing Google sign-in...</p>
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
