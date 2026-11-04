'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { useTabs } from '../../../contexts/TabsContext';
import { FileTree } from '../../../components/FileTree';
import { TabBar } from '../../../components/TabBar';
import { RunOutputPanel, RunState } from '../../../components/RunOutputPanel';
import { RunConfigModal } from '../../../components/RunConfigModal';
import { StatusBar } from '../../../components/StatusBar';
import { CommandPalette } from '../../../components/CommandPalette';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Play, Square, ShieldAlert, Settings, Brain, Code2, ArrowLeft,
  ChevronRight, Users, History, Activity, BarChart3, FileCode,
  Loader, CheckCircle, XCircle, Zap, TerminalSquare, PanelBottom, X,
  Command
} from 'lucide-react';

const Editor = dynamic(
  () => import('../../../components/Editor').then(mod => mod.Editor),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center flex-1" style={{ color: 'var(--text-muted)' }}>
      <span className="spinner" style={{ width: 20, height: 20 }} />
    </div>
  )}
);

const TerminalComponent = dynamic(
  () => import('../../../components/Terminal').then(mod => mod.Terminal),
  { ssr: false }
);

interface RunOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  command: string;
  projectType: string;
}

interface RunConfig {
  projectType: string;
  entryCommand: string;
  buildCommand?: string | null;
  workingDir?: string;
}

const AVATAR_COLORS = ['avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-orange', 'avatar-red', 'avatar-cyan', 'avatar-pink'];
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const toast = useToast();
  const { tabs, activeTabId, openFile } = useTabs();

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Run state
  const [runState, setRunState] = useState<RunState>('idle');
  const [runOutput, setRunOutput] = useState<RunOutput | null>(null);
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);
  const [showRunConfig, setShowRunConfig] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Bottom panel
  const [bottomPanel, setBottomPanel] = useState<'none' | 'terminal' | 'output'>('none');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(250);

  // Collaborator presence
  const [collaborators, setCollaborators] = useState<{ displayName: string; id: string }[]>([]);
  const [showCollabList, setShowCollabList] = useState(false);

  // Command palette
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Cursor position for status bar
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';

  useEffect(() => {
    fetchProject();
    fetchRunConfig();
    fetchCollaborators();
  }, [id]);

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K — Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // Ctrl+Shift+R — Run Project
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
      }
      // Ctrl+Shift+A — Analyze
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
      }
      // Ctrl+` — Toggle Terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setBottomPanel(prev => prev === 'terminal' ? 'none' : 'terminal');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchProject = async () => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data.data.project);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchRunConfig = async () => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/run-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data.config) {
          setRunConfig(data.data.config);
        } else if (data.data.detected) {
          setRunConfig(data.data.detected);
        }
      }
    } catch {}
  };

  const fetchCollaborators = async () => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const members = data.data.project.members || [];
        const owner = data.data.project.owner;
        const collabs = [
          { displayName: owner.displayName, id: owner.id },
          ...members.map((m: any) => ({ displayName: m.user.displayName, id: m.user.id })),
        ];
        // Deduplicate
        const seen = new Set<string>();
        setCollaborators(collabs.filter((c: any) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        }));
      }
    } catch {}
  };

  // ---- Run Project ----
  const handleRunProject = useCallback(async () => {
    if (runState === 'running' || runState === 'preparing') return;

    setRunState('preparing');
    setBottomPanel('output');
    setRunOutput(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/run-config/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        const output: RunOutput = {
          stdout: data.data.fullStdout,
          stderr: data.data.fullStderr,
          exitCode: data.data.log.exitCode,
          duration: data.data.log.durationMs,
          command: data.data.command,
          projectType: data.data.projectType,
        };
        setRunOutput(output);
        setRunState(output.exitCode === 0 ? 'completed' : 'failed');

        if (output.exitCode === 0) {
          toast.success('Project run complete', `Finished in ${output.duration}ms`);
        } else {
          toast.error('Project run failed', `Exit code: ${output.exitCode}`);
        }
      } else {
        setRunState('failed');
        setRunOutput({
          stdout: '',
          stderr: data.message || 'Execution failed',
          exitCode: 1,
          duration: 0,
          command: runConfig?.entryCommand || 'unknown',
          projectType: runConfig?.projectType || 'unknown',
        });
        toast.error('Run failed', data.message);
      }
    } catch {
      setRunState('failed');
      setRunOutput({
        stdout: '',
        stderr: 'Network error — unable to reach execution service.',
        exitCode: -1,
        duration: 0,
        command: runConfig?.entryCommand || 'unknown',
        projectType: runConfig?.projectType || 'unknown',
      });
      toast.error('Connection error', 'Unable to reach server.');
    }
  }, [id, token, runState, runConfig]);

  const handleStopProject = useCallback(() => {
    setRunState('stopped');
    toast.info('Project stopped');
  }, []);

  // ---- Analyze ----
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    toast.info('Analysis started', 'Running SonarQube analysis...');

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Analysis complete', `Found ${data.data.smellCount} code smells.`);
      } else {
        toast.error('Analysis failed', data.message || 'Unknown error');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [id, token]);

  // ---- File tree handler ----
  const handleFileSelect = useCallback((fileId: string, fileName: string) => {
    openFile(fileId, fileName);
  }, [openFile]);

  // Find the active tab data
  const activeTab = tabs.find(t => t.fileId === activeTabId);

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <div className="flex flex-col items-center gap-4">
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span className="text-secondary">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <h2>Project not found</h2>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 'var(--sp-4)' }}>Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="workspace-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-root)' }}>
      {/* ─── Workspace Header ─── */}
      <header className="flex items-center justify-between" style={{
        height: 44, minHeight: 44, padding: '0 var(--sp-5)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-icon" style={{ padding: '4px' }}>
            <Code2 size={18} style={{ color: 'var(--accent-blue)' }} />
          </Link>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="font-semibold text-md">{project.name}</span>
          <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>{project.language}</span>
        </div>

        {/* Center: Primary Actions */}
        <div className="flex items-center gap-2">
          {/* Run Project */}
          {runState === 'running' || runState === 'preparing' ? (
            <button className="btn btn-sm" onClick={handleStopProject}
              style={{ background: 'var(--accent-red-bg)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderColor: 'rgba(248,81,73,0.3)' }}>
              <Square size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={handleRunProject}>
              <Play size={13} /> Run Project
            </button>
          )}

          <button className="btn btn-sm btn-purple" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
            Analyze
          </button>

          <Link href={`/projects/${id}/analysis`} className="btn btn-sm btn-ghost">
            <Brain size={13} /> Predict
          </Link>
        </div>

        {/* Right: Collaborators + Nav */}
        <div className="flex items-center gap-3">
          {/* Collaborator Presence */}
          <div className="dropdown" style={{ position: 'relative' }}>
            <button
              className="flex items-center gap-2 btn-ghost"
              onClick={() => setShowCollabList(!showCollabList)}
              style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)' }}
            >
              <div className="flex items-center" style={{ gap: '-4px' }}>
                {collaborators.slice(0, 3).map((c, i) => (
                  <div key={c.id} className={`avatar avatar-xs ${getAvatarColor(c.displayName)}`}
                    style={{ marginLeft: i > 0 ? '-6px' : 0, border: '2px solid var(--bg-secondary)', zIndex: 3 - i }}>
                    {c.displayName.charAt(0)}
                  </div>
                ))}
              </div>
              {collaborators.length > 3 && (
                <span className="text-xs text-muted">+{collaborators.length - 3}</span>
              )}
            </button>

            {showCollabList && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowCollabList(false)} />
                <div className="dropdown-menu" style={{ zIndex: 10, minWidth: 200 }}>
                  <div style={{ padding: 'var(--sp-3) var(--sp-5)' }}>
                    <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Team Members</span>
                  </div>
                  {collaborators.map(c => (
                    <div key={c.id} className="dropdown-item" style={{ cursor: 'default' }}>
                      <div className={`avatar avatar-xs ${getAvatarColor(c.displayName)}`}>
                        {c.displayName.charAt(0)}
                      </div>
                      <span>{c.displayName}</span>
                      {c.id === user?.id && <span className="badge badge-blue" style={{ marginLeft: 'auto', fontSize: '9px' }}>You</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="separator-vertical" style={{ margin: '0 var(--sp-1)' }} />

          {/* Nav links */}
          <button
            className="btn-icon"
            data-tooltip="Terminal"
            style={{ padding: '6px', color: bottomPanel === 'terminal' ? 'var(--accent-blue)' : undefined }}
            onClick={() => setBottomPanel(bottomPanel === 'terminal' ? 'none' : 'terminal')}
          >
            <TerminalSquare size={15} />
          </button>
          <Link href={`/projects/${id}/analysis`} className="btn-icon" data-tooltip="Analysis" style={{ padding: '6px' }}>
            <BarChart3 size={15} />
          </Link>
          <Link href={`/projects/${id}/versions`} className="btn-icon" data-tooltip="Versions" style={{ padding: '6px' }}>
            <History size={15} />
          </Link>
          <Link href={`/projects/${id}/activity`} className="btn-icon" data-tooltip="Activity" style={{ padding: '6px' }}>
            <Activity size={15} />
          </Link>
          <Link href={`/projects/${id}/settings`} className="btn-icon" data-tooltip="Settings" style={{ padding: '6px' }}>
            <Settings size={15} />
          </Link>
        </div>
      </header>

      {/* ─── Main IDE Area ─── */}
      <div className="flex flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* File Explorer */}
        <FileTree
          projectId={project.id}
          activeFileId={activeTabId}
          onSelectFile={handleFileSelect}
        />

        {/* Editor Area (Tabs + Editor + Run Output) */}
        <div className="flex flex-col flex-1" style={{ minWidth: 0, minHeight: 0 }}>
          {/* Tab Bar */}
          <TabBar />

          {/* Editor or Empty State */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {activeTab ? (
              <Editor projectId={project.id} fileId={activeTab.fileId} fileName={activeTab.fileName} />
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-5" style={{ color: 'var(--text-muted)' }}>
                <FileCode size={48} strokeWidth={1} />
                <div style={{ textAlign: 'center' }}>
                  <p className="text-lg font-medium text-secondary" style={{ marginBottom: 'var(--sp-2)' }}>No file open</p>
                  <p className="text-sm">Select a file from the explorer to start editing</p>
                </div>
                <div className="flex items-center gap-3" style={{ marginTop: 'var(--sp-4)' }}>
                  <button className="btn btn-sm btn-primary" onClick={handleRunProject}>
                    <Play size={13} /> Run Project
                  </button>
                  <button className="btn btn-sm btn-purple" onClick={handleAnalyze} disabled={isAnalyzing}>
                    <ShieldAlert size={13} /> Analyze
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel (Terminal / Output) */}
          {bottomPanel !== 'none' && (
            <div style={{
              height: bottomPanelHeight,
              minHeight: 120,
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}>
              {/* Bottom Panel Tabs */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: 30,
                minHeight: 30,
                backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
                padding: '0 var(--sp-3)',
                gap: 'var(--sp-1)',
              }}>
                <button
                  onClick={() => setBottomPanel('terminal')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                    padding: '2px var(--sp-4)', fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer',
                    background: 'transparent', borderRadius: 'var(--radius-xs)',
                    color: bottomPanel === 'terminal' ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottom: bottomPanel === 'terminal' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  }}
                >
                  <TerminalSquare size={12} /> TERMINAL
                </button>
                <button
                  onClick={() => setBottomPanel('output')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                    padding: '2px var(--sp-4)', fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer',
                    background: 'transparent', borderRadius: 'var(--radius-xs)',
                    color: bottomPanel === 'output' ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottom: bottomPanel === 'output' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  }}
                >
                  <PanelBottom size={12} /> OUTPUT
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn-icon" onClick={() => setBottomPanel('none')} style={{ padding: '2px' }}>
                  <X size={13} />
                </button>
              </div>

              {/* Panel Content */}
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {bottomPanel === 'terminal' && (
                  <TerminalComponent visible={bottomPanel === 'terminal'} />
                )}
                {bottomPanel === 'output' && (
                  <RunOutputPanel
                    runState={runState}
                    runOutput={runOutput}
                    runConfig={runConfig}
                    projectName={project.name}
                    onClose={() => setBottomPanel('none')}
                    onStop={handleStopProject}
                    onConfigOpen={() => setShowRunConfig(true)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        language={project.language}
        fileName={activeTab?.fileName}
        line={cursorLine}
        col={cursorCol}
        connectionStatus="connected"
        connectedUsers={collaborators.length}
        projectName={project.name}
      />

      {/* Run Config Modal */}
      {showRunConfig && (
        <RunConfigModal
          projectId={project.id}
          onClose={() => setShowRunConfig(false)}
          onSaved={() => { setShowRunConfig(false); fetchRunConfig(); }}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        projectId={id}
        onRun={handleRunProject}
        onAnalyze={handleAnalyze}
        onToggleTerminal={() => setBottomPanel(prev => prev === 'terminal' ? 'none' : 'terminal')}
      />
    </div>
  );
}
