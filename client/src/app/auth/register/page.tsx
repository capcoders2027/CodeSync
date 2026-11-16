'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { getApiBase } from '../../../lib/apiBase';
import Link from 'next/link';
import { UserPlus, Eye, EyeOff, Check } from 'lucide-react';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();

  const API_URL = getApiBase();

  const passwordChecks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(password) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Account created!', 'Welcome to CodeSync.');
        login(data.data.accessToken, data.data.user);
      } else {
        setError(data.message || 'Registration failed. Please try again.');
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    setGoogleLoading(true);
    setError('');
    window.location.href = `${API_URL}/auth/google`;
  };

  return (
    <>
      <div style={{ marginBottom: 'var(--sp-9)' }}>
        <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-3)' }}>Create your account</h2>
        <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>Start collaborating on CodeSync</p>
      </div>

      {error && (
        <div className="alert alert-error animate-in" style={{ marginBottom: 'var(--sp-6)' }}>
          {error}
        </div>
      )}

      {/* Google Sign-in */}
      <button
        type="button"
        onClick={handleGoogleSignUp}
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
        {googleLoading ? 'Connecting to Google...' : 'Sign up with Google'}
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
          <label htmlFor="displayName" className="form-label">Display name</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            placeholder="John Doe"
            autoComplete="name"
            autoFocus
          />
        </div>

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
          />
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Create a strong password"
              autoComplete="new-password"
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
          {password && (
            <div className="flex flex-col gap-2" style={{ marginTop: 'var(--sp-2)' }}>
              {passwordChecks.map((check) => (
                <div key={check.label} className="flex items-center gap-3" style={{ fontSize: 'var(--text-sm)' }}>
                  <Check size={12} style={{ color: check.met ? 'var(--accent-green)' : 'var(--text-muted)' }} />
                  <span style={{ color: check.met ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{check.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-blue btn-lg w-full" disabled={loading} style={{ marginTop: 'var(--sp-2)' }}>
          {loading ? <><span className="spinner" /> Creating account...</> : <><UserPlus size={18} /> Create account</>}
        </button>
      </form>

      <div style={{ marginTop: 'var(--sp-9)', textAlign: 'center', fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>
        Already have an account?{' '}
        <Link href="/auth/login" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Sign in</Link>
      </div>
    </>
  );
}
