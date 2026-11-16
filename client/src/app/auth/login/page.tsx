'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import Link from 'next/link';
import { LogIn, Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // 2FA state
  const [is2faRequired, setIs2faRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { login } = useAuth();
  const toast = useToast();

  const API_URL = typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
    ? (process.env.NEXT_PUBLIC_API_URL || 'https://codesync-server-ealz.onrender.com/api')
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.data?.requiresTwoFactor) {
          setIs2faRequired(true);
          setTempToken(data.data.tempToken);
          toast.info('Two-Factor Authentication', 'A 6-digit code has been sent to your email.');
          return;
        }

        toast.success('Welcome back!', `Signed in as ${data.data.user.displayName}`);
        login(data.data.accessToken, data.data.user);
      } else {
        setError(data.message || 'Invalid email or password.');
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTwoFactorLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
        },
        body: JSON.stringify({
          email,
          code: twoFactorCode.trim(),
          tempToken,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Verified!', `Signed in as ${data.data.user.displayName}`);
        login(data.data.accessToken, data.data.user);
      } else {
        setError(data.message || 'Invalid or expired verification code.');
      }
    } catch {
      setError('Unable to verify code. Please check your connection.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleResend2FA = async () => {
    if (resendCooldown > 0) return;
    setError('');

    try {
      const res = await fetch(`${API_URL}/auth/2fa/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
        },
        body: JSON.stringify({ email, tempToken }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Code resent', 'A new 6-digit verification code was emailed to you.');
        setResendCooldown(60);
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(data.message || 'Failed to resend code.');
      }
    } catch {
      setError('Failed to resend verification code.');
    }
  };

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    setError('');
    window.location.href = `${API_URL}/auth/google`;
  };

  if (is2faRequired) {
    return (
      <>
        <div style={{ marginBottom: 'var(--sp-9)' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)' }}>
              <ShieldCheck size={28} />
            </div>
            <h2 style={{ fontSize: 'var(--text-3xl)' }}>Two-Factor Auth</h2>
          </div>
          <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>
            Enter the 6-digit verification code sent to <strong>{email}</strong>
          </p>
        </div>

        {error && (
          <div className="alert alert-error animate-in" style={{ marginBottom: 'var(--sp-6)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleVerify2FA} className="flex flex-col gap-6">
          <div className="form-group">
            <label htmlFor="twoFactorCode" className="form-label">Verification Code</label>
            <input
              id="twoFactorCode"
              type="text"
              maxLength={6}
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
              required
              placeholder="123456"
              autoFocus
              style={{
                fontSize: '24px',
                letterSpacing: '8px',
                textAlign: 'center',
                fontWeight: 700,
                padding: '12px',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-blue btn-lg w-full"
            disabled={twoFactorLoading || twoFactorCode.length < 6}
          >
            {twoFactorLoading ? <><span className="spinner" /> Verifying...</> : <><ShieldCheck size={18} /> Verify & Sign In</>}
          </button>

          <div className="flex items-center justify-between" style={{ marginTop: 'var(--sp-2)' }}>
            <button
              type="button"
              onClick={handleResend2FA}
              disabled={resendCooldown > 0}
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-sm)', color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--accent-blue)' }}
            >
              <RefreshCw size={14} className={resendCooldown > 0 ? 'animate-spin' : ''} />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIs2faRequired(false);
                setError('');
                setTwoFactorCode('');
              }}
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              <ArrowLeft size={14} /> Back to Sign In
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 'var(--sp-9)' }}>
        <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-3)' }}>Welcome back</h2>
        <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>Sign in to your CodeSync account</p>
      </div>

      {error && (
        <div className="alert alert-error animate-in" style={{ marginBottom: 'var(--sp-6)' }}>
          {error}
        </div>
      )}

      {/* Google Sign-in */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="btn w-full"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          fontWeight: 600,
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginBottom: 'var(--sp-6)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: 'var(--sp-6)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
        <span>OR</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="form-group">
          <div className="flex justify-between items-center">
            <label htmlFor="password" className="form-label">Password</label>
            <Link href="/auth/forgot-password" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-blue)' }}>
              Forgot password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ paddingRight: '40px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="btn-icon"
              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)' }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn-blue btn-lg w-full" disabled={loading} style={{ marginTop: 'var(--sp-2)' }}>
          {loading ? <><span className="spinner" /> Signing in...</> : <><LogIn size={18} /> Sign in</>}
        </button>
      </form>

      <div style={{ marginTop: 'var(--sp-9)', textAlign: 'center', fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>
        Don't have an account?{' '}
        <Link href="/auth/register" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Create account</Link>
      </div>
    </>
  );
}
