'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { getApiBase } from '../../../lib/apiBase';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Missing or invalid password reset token. Please request a new link.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        toast.success('Password reset successfully!', 'You can now sign in with your new password.');
      } else {
        setError(data.message || 'Failed to reset password. The link may have expired.');
      }
    } catch {
      setError('Network error. Unable to contact authentication server.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-6)' }}>
        <AlertCircle size={44} color="var(--accent-red)" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--sp-3)' }}>
          Invalid Reset Link
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-6)' }}>
          No password reset token was provided, or the link has expired.
        </p>
        <Link href="/auth/forgot-password" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
          Request a new link
        </Link>
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
          Password Reset Complete
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-6)' }}>
          Your password has been changed successfully. You can now log into your CodeSync account.
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
    <>
      <div style={{ marginBottom: 'var(--sp-8)' }}>
        <Link
          href="/auth/login"
          className="flex items-center gap-2 text-sm text-secondary hover-text-primary"
          style={{ marginBottom: 'var(--sp-4)', display: 'inline-flex', textDecoration: 'none' }}
        >
          <ArrowLeft size={16} /> Back to Sign in
        </Link>
        <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
          Set new password
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
          Please choose a strong password with at least 8 characters.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-3)',
            padding: 'var(--sp-4)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent-red)',
            fontSize: 'var(--text-sm)',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="newPassword" className="form-label">New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              style={{ paddingLeft: '38px', paddingRight: '38px' }}
            />
            <Lock
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              autoComplete="new-password"
              style={{ paddingLeft: '38px' }}
            />
            <Lock
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 'var(--sp-2)' }}
        >
          {loading ? 'Updating password...' : 'Reset Password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
