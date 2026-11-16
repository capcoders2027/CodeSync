'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../../../../contexts/ToastContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import { useAuth } from '../../../../contexts/AuthContext';
import { getApiBase } from '../../../../lib/apiBase';
import Link from 'next/link';
import {
  ArrowLeft, Users, Trash2, Crown, UserPlus, Settings, Code2,
  Shield, AlertTriangle, Loader, CheckCircle, LayoutDashboard,
  Sun, Moon, Copy, Home as HomeIcon
} from 'lucide-react';

interface Member {
  id: string;
  role: string;
  invitationStatus: string;
  user: { id: string; displayName: string; email: string; avatarUrl: string | null };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string;
  owner: { id: string; displayName: string };
  members: Member[];
}

const AVATAR_COLORS = ['avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-orange', 'avatar-red', 'avatar-cyan', 'avatar-pink'];

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

const ROLES = [
  { id: 'developer', name: 'Developer', desc: 'Can edit files, run code, and view analysis results' },
  { id: 'tester', name: 'Tester', desc: 'Can run tests & executions, review quality metrics, and report defects' },
  { id: 'team_lead', name: 'Team Lead', desc: 'Can manage members, trigger analysis, and update project settings' },
  { id: 'member', name: 'Member', desc: 'General collaborator with editing and execution access' },
  { id: 'viewer', name: 'Viewer', desc: 'Read-only access to source code and analysis reports' },
];

export default function ProjectSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const { user, updateUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('developer');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: any = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchProject(); }, [id]);

  const fetchProject = async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/projects/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProject(data.data.project);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/projects/${id}/members`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          permissions: {
            can_trigger_analysis: inviteRole === 'team_lead',
            can_view_analysis: true,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const inviteUrl = data.data?.inviteUrl || `${window.location.origin}/projects/${id}`;
        navigator.clipboard.writeText(inviteUrl).catch(() => {});
        toast.success('Invitation sent & link copied!', `${inviteEmail} invited as ${inviteRole}. Direct invite link copied to clipboard.`);
        setInviteEmail('');
        fetchProject();
      } else {
        toast.error('Failed to invite', data.message || 'Unable to send invitation.');
      }
    } catch {
      toast.error('Connection error', 'Unable to reach server.');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/projects/${id}/members/${userId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        toast.success('Role updated', `Member role changed to ${newRole}.`);
        fetchProject();
      } else {
        toast.error('Failed to update role');
      }
    } catch {
      toast.error('Failed to update member role');
    }
  };

  const handleRemoveMember = async (userId: string, displayName: string) => {
    if (!confirm(`Remove ${displayName} from this project?`)) return;

    const res = await fetch(`${getApiBase()}/projects/${id}/members/${userId}`, {
      method: 'DELETE',
      headers,
    });

    if (res.ok) {
      toast.success('Member removed', `${displayName} has been removed from the project.`);
      fetchProject();
    } else {
      toast.error('Failed to remove member');
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    const confirmName = prompt(`To delete this project, type the project name "${project.name}":`);
    if (confirmName !== project.name) {
      if (confirmName !== null) toast.error('Name mismatch', 'Project was not deleted.');
      return;
    }

    setIsDeleting(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/projects/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        toast.success('Project deleted', `"${project.name}" has been deleted.`);
        router.push('/');
      } else {
        const data = await res.json();
        toast.error('Failed to delete', data.message || 'Could not delete project.');
      }
    } catch {
      toast.error('Connection error', 'Unable to reach server.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'team_lead':
        return <span className="badge badge-purple flex items-center gap-1"><Crown size={10} /> Team Lead</span>;
      case 'developer':
        return <span className="badge badge-blue flex items-center gap-1"><Code2 size={10} /> Developer</span>;
      case 'tester':
        return <span className="badge badge-green flex items-center gap-1"><CheckCircle size={10} /> Tester</span>;
      case 'viewer':
        return <span className="badge badge-secondary flex items-center gap-1">Viewer</span>;
      default:
        return <span className="badge badge-yellow flex items-center gap-1">Member</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      {/* Header */}
      <header className="flex items-center justify-between" style={{
        height: 52, padding: '0 var(--sp-8)',
        borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div className="flex items-center gap-4">
          <Link href={`/projects/${id}`} className="btn-icon" style={{ padding: '4px' }} title="Back to Project">
            <ArrowLeft size={18} />
          </Link>
          <div className="separator-vertical" />
          <div className="flex items-center gap-3">
            <Settings size={18} style={{ color: 'var(--text-secondary)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Project & Team Settings</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="btn btn-sm btn-ghost"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Link href="/" className="btn btn-sm btn-ghost" title="Go to Home Page">
            <HomeIcon size={14} /> Home
          </Link>
          <Link href="/dashboard" className="btn btn-sm btn-ghost" title="Go to Workspace Dashboard">
            <LayoutDashboard size={14} /> Dashboard
          </Link>
          <Link href={`/projects/${id}`} className="btn btn-sm btn-secondary">
            <Code2 size={14} /> Open IDE
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 840, margin: '0 auto', padding: 'var(--sp-8)' }}>
        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 'var(--sp-8)' }}>
          <button className={`tab ${activeTab === 'general' ? 'tab-active' : ''}`} onClick={() => setActiveTab('general')}>
            <Settings size={14} /> General
          </button>
          <button className={`tab ${activeTab === 'members' ? 'tab-active' : ''}`} onClick={() => setActiveTab('members')}>
            <Users size={14} /> Members & RBAC
            <span className="tab-count">{project.members.length}</span>
          </button>
        </div>

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="flex flex-col gap-8 animate-in">
            <div className="card">
              <div className="card-header">
                <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Project Information</h2>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 'var(--sp-5)', fontSize: 'var(--text-md)' }}>
                  <span className="text-secondary font-medium">Name</span>
                  <span className="font-semibold">{project.name}</span>

                  <span className="text-secondary font-medium">Language</span>
                  <span style={{ textTransform: 'capitalize' }}>{project.language}</span>

                  <span className="text-secondary font-medium">Owner</span>
                  <span>{project.owner.displayName}</span>

                  {project.description && (
                    <>
                      <span className="text-secondary font-medium">Description</span>
                      <span className="text-secondary">{project.description}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="card">
              <div className="card-header">
                <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Workspace Shortcuts</h2>
              </div>
              <div className="card-body">
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-4)' }}>
                  {[
                    { href: `/projects/${id}`, icon: <Code2 size={16} />, label: 'Code Editor & IDE' },
                    { href: `/projects/${id}/analysis`, icon: <Shield size={16} />, label: 'Analysis & Metrics' },
                    { href: `/projects/${id}/versions`, icon: <CheckCircle size={16} />, label: 'Version History' },
                  ].map(link => (
                    <Link key={link.label} href={link.href} className="card card-interactive" style={{
                      padding: 'var(--sp-6)', textAlign: 'center', textDecoration: 'none', color: 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-3)',
                    }}>
                      {link.icon}
                      <span className="text-sm font-medium">{link.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="card" style={{ border: '1px solid rgba(248, 81, 73, 0.4)' }}>
              <div className="card-header flex items-center justify-between" style={{ backgroundColor: 'rgba(248, 81, 73, 0.06)' }}>
                <div className="flex items-center gap-3">
                  <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0, color: 'var(--accent-red)' }}>Danger Zone</h2>
                </div>
              </div>
              <div className="card-body flex items-center justify-between" style={{ padding: 'var(--sp-6)' }}>
                <div>
                  <div className="font-semibold" style={{ color: 'var(--text-primary)', marginBottom: 'var(--sp-1)' }}>
                    Delete this project
                  </div>
                  <div className="text-sm text-secondary" style={{ maxWidth: 460 }}>
                    Permanently delete this project, including all files, version snapshots, analysis metrics, and execution history.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  disabled={isDeleting}
                  className="btn btn-sm"
                  style={{
                    backgroundColor: 'var(--accent-red)',
                    color: '#fff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                  }}
                >
                  {isDeleting ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="flex flex-col gap-8 animate-in">
            {/* Team Members */}
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <Users size={18} />
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Team Members & Roles</h2>
                </div>
                <span className="text-sm text-secondary">{project.members.length} member(s)</span>
              </div>
              <div style={{ padding: 'var(--sp-2)' }}>
                {project.members.map(member => (
                  <div key={member.id} className="flex items-center justify-between" style={{
                    padding: 'var(--sp-4) var(--sp-5)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'background var(--transition-fast)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`avatar avatar-md ${getAvatarColor(member.user.displayName)}`}>
                        {member.user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-md font-medium">{member.user.displayName}</div>
                        <div className="text-sm text-tertiary">{member.user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Role selection or badge */}
                      {member.user.id === project.owner.id ? (
                        <span className="badge badge-purple flex items-center gap-1"><Crown size={10} /> Owner</span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.user.id, e.target.value)}
                          style={{
                            fontSize: 'var(--text-xs)',
                            padding: '3px 8px',
                            background: 'var(--bg-elevated)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      )}

                      {getRoleBadge(member.role)}

                      {member.invitationStatus === 'pending' && (
                        <div className="flex items-center gap-2">
                          <span className="badge badge-yellow">Pending</span>
                          <button
                            type="button"
                            onClick={() => {
                              const inviteUrl = `${window.location.origin}/projects/${id}`;
                              navigator.clipboard.writeText(inviteUrl);
                              toast.success('Invite link copied!', 'Send this URL directly to your teammate.');
                            }}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Copy direct invite link for this teammate"
                          >
                            <Copy size={11} /> Copy Invite Link
                          </button>
                        </div>
                      )}
                      {member.user.id !== project.owner.id && (
                        <button
                          className="btn-icon"
                          onClick={() => handleRemoveMember(member.user.id, member.user.displayName)}
                          style={{ color: 'var(--text-muted)' }}
                          title="Remove member"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invite Form */}
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <UserPlus size={18} />
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Invite Team Member</h2>
                </div>
              </div>
              <div className="card-body">
                <form onSubmit={handleInvite} className="flex flex-col gap-4">
                  <div className="flex items-end gap-3">
                    <div className="form-group flex-1">
                      <label htmlFor="invite-email" className="form-label">Email Address</label>
                      <input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        required
                        placeholder="colleague@company.com"
                      />
                    </div>
                    <div className="form-group" style={{ minWidth: 160 }}>
                      <label htmlFor="invite-role" className="form-label">Assigned Role</label>
                      <select id="invite-role" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={inviting} style={{ height: 'auto' }}>
                      {inviting ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Send Invite
                    </button>
                  </div>
                  <div className="text-xs text-muted" style={{ paddingLeft: '2px' }}>
                    <strong>{ROLES.find(r => r.id === inviteRole)?.name}:</strong> {ROLES.find(r => r.id === inviteRole)?.desc}
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
