'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { getApiBase } from '../../../lib/apiBase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();

  const API_URL = getApiBase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        if (data.data?.resetUrl) {
          setResetUrl(data.data.resetUrl);
        }
        toast.success('Reset link ready', 'Password reset instructions have been generated.');
      } else {
        setError(data.message || 'Failed to process request.');
      }
    } catch {
      setError('Network error. Unable to contact server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 'var(--sp-9)' }}>
        <Link
          href="/auth/login"
          className="flex items-center gap-2 text-sm text-secondary hover-text-primary"
          style={{ marginBottom: 'var(--sp-5)', display: 'inline-flex', textDecoration: 'none' }}
        >
          <ArrowLeft size={16} /> Back to Sign in
        </Link>
        <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
          Reset your password
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
          Enter your email address and we will send you a password reset link.
        </p>
      </div>

      {submitted ? (
        <div style={{
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--sp-6)',
          textAlign: 'center',
        }}>
          <CheckCircle size={36} color="var(--accent-green)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
            Reset Link Dispatched
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-5)' }}>
            Password reset instructions have been generated for <strong>{email}</strong>.
          </p>

          {resetUrl && (
            <div style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--sp-4)',
              marginBottom: 'var(--sp-5)',
              textAlign: 'left',
            }}>
              <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '10px', lineHeight: 1.4 }}>
                ⚡ <strong>Direct Access:</strong> If your mail delivery is delayed or blocked, you can use the direct reset link below:
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={resetUrl}
                  className="btn btn-primary btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  Reset Password Now
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(resetUrl);
                    toast.success('Copied!', 'Reset URL copied to clipboard');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={13} /> Copy Reset Link
                </button>
              </div>
            </div>
          )}

          <Link href="/auth/login" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            Return to Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-4)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-red)',
              fontSize: 'var(--text-sm)',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <div style={{ position: 'relative' }}>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                style={{ paddingLeft: '38px' }}
              />
              <Mail
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
            style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          >
            {loading ? 'Sending link...' : 'Send reset link'}
          </button>
        </form>
      )}
    </>
  );
}
