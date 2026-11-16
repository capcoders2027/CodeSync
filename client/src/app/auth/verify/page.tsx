'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { getApiBase } from '../../../lib/apiBase';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('No verification token found in link.');
      return;
    }

    const verify = async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (res.ok) {
          setSuccess(true);
        } else {
          setError(data.message || 'Verification link expired or invalid.');
        }
      } catch {
        setError('Network error while verifying email.');
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-8)' }}>
        <span className="spinner" style={{ width: 36, height: 36, margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>Verifying your email...</h2>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        background: 'rgba(34, 197, 94, 0.08)',
        border: '1px solid rgba(34, 197, 94, 0.25)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--sp-8)',
        textAlign: 'center',
      }}>
        <CheckCircle size={48} color="var(--accent-green)" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
          Email Verified!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-6)' }}>
          Your email address has been verified. You can now access all CodeSync features.
        </p>
        <Link
          href="/auth/login"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
        >
          Sign in to CodeSync
        </Link>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-6)' }}>
      <AlertCircle size={44} color="var(--accent-red)" style={{ margin: '0 auto 16px' }} />
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--sp-3)' }}>
        Verification Failed
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-6)' }}>
        {error}
      </p>
      <Link href="/auth/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
        Return to Sign in
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
