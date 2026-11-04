'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import Link from 'next/link';
import { UserPlus, Eye, EyeOff, Check } from 'lucide-react';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/register`, {
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

  return (
    <>
      <div style={{ marginBottom: 'var(--sp-9)' }}>
        <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-3)' }}>Create your account</h2>
        <p style={{ fontSize: 'var(--text-md)' }}>Start collaborating on CodeSync</p>
      </div>

      {error && (
        <div className="alert alert-error animate-in" style={{ marginBottom: 'var(--sp-6)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-7">
        <div className="form-group">
          <label htmlFor="displayName" className="form-label">Display name</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
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
            onChange={e => setEmail(e.target.value)}
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
              onChange={e => setPassword(e.target.value)}
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
              {passwordChecks.map(check => (
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
