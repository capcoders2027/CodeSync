'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { X, Settings, Loader, Zap, CheckCircle } from 'lucide-react';

interface RunConfigModalProps {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface DetectedConfig {
  projectType: string;
  entryCommand: string;
  buildCommand: string | null;
  workingDir: string;
  confidence: string;
}

const PROJECT_TYPES = [
  { value: 'python', label: 'Python' },
  { value: 'nodejs', label: 'Node.js' },
  { value: 'java', label: 'Java' },
  { value: 'custom', label: 'Custom' },
];

export function RunConfigModal({ projectId, onClose, onSaved }: RunConfigModalProps) {
  const toast = useToast();
  const [projectType, setProjectType] = useState('python');
  const [entryCommand, setEntryCommand] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [workingDir, setWorkingDir] = useState('/');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<DetectedConfig | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${projectId}/run-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data.config) {
          const cfg = data.data.config;
          setProjectType(cfg.projectType);
          setEntryCommand(cfg.entryCommand);
          setBuildCommand(cfg.buildCommand || '');
          setWorkingDir(cfg.workingDir);
        } else if (data.data.detected) {
          const det = data.data.detected;
          setDetected(det);
          setProjectType(det.projectType);
          setEntryCommand(det.entryCommand);
          setBuildCommand(det.buildCommand || '');
          setWorkingDir(det.workingDir);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${projectId}/run-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectType, entryCommand, buildCommand: buildCommand || null, workingDir }),
      });
      if (res.ok) {
        toast.success('Configuration saved', 'Run configuration updated.');
        onSaved();
      } else {
        const data = await res.json();
        toast.error('Save failed', data.message || 'Unknown error');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-glass animate-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <Settings size={18} style={{ color: 'var(--accent-blue)' }} />
            <h2 style={{ margin: 0 }}>Run Configuration</h2>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div className="modal-body flex items-center justify-center" style={{ padding: 'var(--sp-11)' }}>
            <span className="spinner" />
          </div>
        ) : (
          <>
            <div className="modal-body flex flex-col gap-7">
              {/* Auto-detection notice */}
              {detected && (
                <div className="flex items-start gap-3" style={{
                  padding: 'var(--sp-4) var(--sp-5)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-blue-bg)',
                  fontSize: 'var(--text-sm)',
                }}>
                  <Zap size={14} style={{ color: 'var(--accent-blue)', marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Auto-detected</span>
                    <span className="text-secondary"> — {detected.projectType} project ({detected.confidence} confidence)</span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Project Type</label>
                <select value={projectType} onChange={e => setProjectType(e.target.value)}>
                  {PROJECT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Run Command</label>
                <input
                  value={entryCommand}
                  onChange={e => setEntryCommand(e.target.value)}
                  placeholder="e.g. python main.py, npm run dev"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                />
                <span className="text-xs text-muted" style={{ marginTop: 'var(--sp-2)' }}>
                  The command to start your project
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Build Command <span className="text-muted">(optional)</span></label>
                <input
                  value={buildCommand}
                  onChange={e => setBuildCommand(e.target.value)}
                  placeholder="e.g. npm run build"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Working Directory</label>
                <input
                  value={workingDir}
                  onChange={e => setWorkingDir(e.target.value)}
                  placeholder="/"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !entryCommand.trim()}>
                {saving ? <><Loader size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save Configuration</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
