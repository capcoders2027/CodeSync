'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../contexts/ToastContext';
import { apiPost } from '../lib/api';
import { X, FolderPlus, AlertTriangle } from 'lucide-react';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const LANGUAGES = [
  { value: 'python', label: 'Python', desc: 'Full analysis + ML prediction', color: '#3572A5' },
  { value: 'javascript', label: 'JavaScript', desc: 'Static analysis only', color: '#f1e05a' },
  { value: 'typescript', label: 'TypeScript', desc: 'Static analysis only', color: '#3178c6' },
  { value: 'java', label: 'Java', desc: 'Static analysis only', color: '#b07219' },
];

export function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('python');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await apiPost('/projects', { name, description, language });
      if (res.ok) {
        toast.success('Project created!', `"${name}" is ready to go.`);
        onSuccess();
        router.push(`/projects/${res.data.project.id}`);
      } else {
        setError(res.message || 'Failed to create project');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-glass animate-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <FolderPlus size={20} style={{ color: 'var(--accent-blue)' }} />
            <h2 style={{ margin: 0 }}>New Project</h2>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body flex flex-col gap-7">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="project-name" className="form-label">Project name</label>
              <input
                id="project-name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g. payment-service"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-desc" className="form-label">Description <span className="text-muted">(optional)</span></label>
              <textarea
                id="project-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="A brief description of this project"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Language</label>
              <div className="flex flex-col gap-2">
                {LANGUAGES.map(lang => (
                  <label
                    key={lang.value}
                    className="flex items-center gap-4"
                    style={{
                      padding: 'var(--sp-4) var(--sp-5)',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${language === lang.value ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
                      background: language === lang.value ? 'var(--accent-blue-bg)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <input
                      type="radio"
                      name="language"
                      value={lang.value}
                      checked={language === lang.value}
                      onChange={e => setLanguage(e.target.value)}
                      style={{ accentColor: 'var(--accent-blue)' }}
                    />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: lang.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="text-md font-medium">{lang.label}</div>
                      <div className="text-sm text-tertiary">{lang.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              {language !== 'python' && (
                <div className="flex items-center gap-2" style={{ marginTop: 'var(--sp-3)', color: 'var(--accent-yellow)', fontSize: 'var(--text-sm)' }}>
                  <AlertTriangle size={13} />
                  ML defect-risk prediction is only available for Python projects.
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading || !name.trim()}>
              {isLoading ? <><span className="spinner" /> Creating...</> : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
