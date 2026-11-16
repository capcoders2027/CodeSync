'use client';

import React, { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { getApiBase } from '../lib/apiBase';
import { X, Copy, Check, UserPlus, Link as LinkIcon, Loader, Shield, Users } from 'lucide-react';

interface ShareProjectModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ROLES_LIST = [
  { id: 'developer', name: 'Developer', desc: 'Edit files, run code & view quality metrics' },
  { id: 'tester', name: 'QA Tester', desc: 'Run code & tests, review quality & defects' },
  { id: 'team_lead', name: 'Team Lead', desc: 'Full access: manage members & project settings' },
  { id: 'member', name: 'Team Member', desc: 'General collaborator with file edit access' },
  { id: 'viewer', name: 'Viewer', desc: 'Read-only access to code & analysis' },
];

export function ShareProjectModal({ projectId, projectName, onClose, onSuccess }: ShareProjectModalProps) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/projects/${projectId}` : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success('Link copied!', 'Project invite link copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy', 'Please copy the link manually.');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = getApiBase();

      const res = await fetch(`${apiBase}/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          role,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Invitation sent!', `${email} has been invited as ${role.replace('_', ' ')}.`);
        setEmail('');
        onSuccess?.();
      } else {
        toast.error('Failed to invite', data.message || 'Unable to send invitation.');
      }
    } catch {
      toast.error('Network error', 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop animate-in" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--sp-4)',
    }}>
      <div
        className="card animate-slide"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{
          padding: 'var(--sp-5) var(--sp-6)',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-primary)',
        }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Share Project</h3>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{projectName}</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          {/* Quick Copy Link */}
          <div>
            <label className="form-label" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--sp-2)' }}>
              Project URL
            </label>
            <div className="flex items-center gap-2">
              <div style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: 'var(--bg-root)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {inviteUrl}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyLink}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {copied ? <Check size={14} style={{ color: 'var(--accent-green)' }} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: 'var(--border-subtle)' }} />

          {/* Email Invite Form */}
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 'var(--sp-4)' }}>
              <UserPlus size={16} style={{ color: 'var(--accent-purple)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Invite Collaborator</span>
            </div>

            <form onSubmit={handleInvite} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Project Role & Privileges</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                  {ROLES_LIST.map(r => (
                    <label
                      key={r.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)',
                        padding: 'var(--sp-2) var(--sp-3)',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${role === r.id ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                        backgroundColor: role === r.id ? 'var(--accent-blue-bg)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r.id}
                        checked={role === r.id}
                        onChange={() => setRole(r.id)}
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</span>
                          {role === r.id && (
                            <span style={{ fontSize: 10, background: 'rgba(56, 189, 248, 0.2)', color: 'var(--accent-blue)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              SELECTED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3" style={{ marginTop: 'var(--sp-3)' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner" /> Inviting...</> : <><UserPlus size={16} /> Send Invitation</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

