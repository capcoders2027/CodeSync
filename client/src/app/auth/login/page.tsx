'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import Link from 'next/link';
import { LogIn, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
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

  return (
    <>
      <div style={{ marginBottom: 'var(--sp-9)' }}>
        <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-3)' }}>Welcome back</h2>
        <p style={{ fontSize: 'var(--text-md)' }}>Sign in to your CodeSync account</p>
      </div>

      {error && (
        <div className="alert alert-error animate-in" style={{ marginBottom: 'var(--sp-6)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-7">
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
            autoFocus
          />
        </div>

        <div className="form-group">
          <div className="flex justify-between items-center">
            <label htmlFor="password" className="form-label">Password</label>
            <Link href="/auth/forgot-password" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-blue)' }}>Forgot password?</Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
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
