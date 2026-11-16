'use client';

import React, { useState, useEffect, use, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { useTabs } from '../../../contexts/TabsContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
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
  Command, LayoutDashboard, Sun, Moon, Maximize2, Minimize2,
  HelpCircle, PanelLeftClose, PanelLeft, Save
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
  framework?: string;
  entryFile?: string;
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
  const { theme, toggleTheme } = useTheme();
  const { getWorkspace, setWorkspace } = useWorkspace();
  const { tabs, activeTabId, openFile, closeTab, setActiveTab } = useTabs();

  // Try restoring from workspace cache to prevent reload on window switch
  const cachedWs = getWorkspace(id);

  const [project, setProject] = useState<any>(cachedWs?.project || null);
  const [loading, setLoading] = useState(!cachedWs?.project);

  // Resizable panels state
  const [showExplorer, setShowExplorer] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codesync_explorer_width');
      if (saved) return parseInt(saved, 10);
    }
    return cachedWs?.explorerWidth || 250;
  });

  const [bottomPanel, setBottomPanel] = useState<'none' | 'terminal' | 'output'>(cachedWs?.bottomPanel || 'none');
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codesync_bottom_height');
      if (saved) return parseInt(saved, 10);
    }
    return cachedWs?.bottomPanelHeight || 250;
  });
  const [isBottomMaximized, setIsBottomMaximized] = useState(false);
  const prevBottomHeight = useRef(250);

  // Run state
  const [runState, setRunState] = useState<RunState>('idle');
  const [runOutput, setRunOutput] = useState<RunOutput | null>(null);
  const [runConfig, setRunConfig] = useState<RunConfig | null>(cachedWs?.runConfig || null);
  const [showRunConfig, setShowRunConfig] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Collaborator presence
  const [collaborators, setCollaborators] = useState<{ displayName: string; id: string }[]>(cachedWs?.collaborators || []);
  const [showCollabList, setShowCollabList] = useState(false);

  // Command palette & Shortcuts modal
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Cursor position for status bar
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';

  useEffect(() => {
    fetchProject();
    fetchRunConfig();
    fetchCollaborators();
  }, [id]);

  // Sync workspace state to context for instant retention
  useEffect(() => {
    setWorkspace(id, {
      project,
      runConfig,
      collaborators,
      explorerWidth,
      bottomPanelHeight,
      bottomPanel,
    });
  }, [id, project, runConfig, collaborators, explorerWidth, bottomPanelHeight, bottomPanel, setWorkspace]);

  // ---- Resizing Explorer Drag Handlers ----
  const handleMouseDownExplorer = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = explorerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(480, startWidth + (moveEvent.clientX - startX)));
      setExplorerWidth(newWidth);
      localStorage.setItem('codesync_explorer_width', newWidth.toString());
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // ---- Resizing Bottom Panel Drag Handlers ----
  const handleMouseDownBottomPanel = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomPanelHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const maxHeight = Math.floor(window.innerHeight * 0.75);
      const newHeight = Math.max(120, Math.min(maxHeight, startHeight - (moveEvent.clientY - startY)));
      setBottomPanelHeight(newHeight);
      setIsBottomMaximized(false);
      localStorage.setItem('codesync_bottom_height', newHeight.toString());
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const toggleMaximizeBottom = () => {
    if (isBottomMaximized) {
      setBottomPanelHeight(prevBottomHeight.current);
      setIsBottomMaximized(false);
    } else {
      prevBottomHeight.current = bottomPanelHeight;
      setBottomPanelHeight(Math.floor(window.innerHeight * 0.7));
      setIsBottomMaximized(true);
    }
  };

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S — Save File
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        toast.success('Saved', 'File synchronized to workspace');
      }

      // Ctrl+B / Cmd+B — Toggle Explorer Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setShowExplorer(prev => !prev);
      }

      // Ctrl+P or Ctrl+K — Command Palette
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }

      // Ctrl+` — Toggle Terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setBottomPanel(prev => prev === 'terminal' ? 'none' : 'terminal');
      }

      // Ctrl+W — Close active tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }

      // Ctrl+Tab — Next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.fileId === activeTabId);
        if (currentIndex !== -1 && tabs.length > 1) {
          const nextIndex = (currentIndex + 1) % tabs.length;
          setActiveTab(tabs[nextIndex].fileId);
        }
      }

      // Ctrl+Shift+Tab — Previous tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.fileId === activeTabId);
        if (currentIndex !== -1 && tabs.length > 1) {
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          setActiveTab(tabs[prevIndex].fileId);
        }
      }

      // Ctrl+Shift+R — Run Project
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        handleRunProject();
      }

      // Ctrl+Shift+A — Analyze
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        handleAnalyze();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs, closeTab, setActiveTab]);

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
  }, [id, token, runState, runConfig, toast]);

  const handleStopProject = useCallback(() => {
    setRunState('stopped');
    toast.info('Project stopped');
  }, [toast]);

  // ---- Analyze ----
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    toast.info('Analysis started', 'Running SonarQube & defect analysis...');

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
  }, [id, token, toast]);

  // ---- File tree handler ----
  const handleFileSelect = useCallback((fileId: string, fileName: string) => {
    openFile(fileId, fileName);
  }, [openFile]);

  // Find the active tab data
  const activeTab = tabs.find(t => t.fileId === activeTabId);

  // Loading
  if (loading && !project) {
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
        height: 44, minHeight: 44, padding: '0 var(--sp-4)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        {/* Left: Dashboard Button & Breadcrumb */}
        <div className="flex items-center gap-2">
          {/* Prominent Dashboard Button */}
          <Link
            href="/"
            className="btn btn-sm btn-ghost"
            data-tooltip="Return to Dashboard"
            style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-primary)' }}
          >
            <LayoutDashboard size={15} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: 'var(--text-sm)' }}>Dashboard</span>
          </Link>

          <div className="separator-vertical" style={{ height: 18 }} />

          {/* Toggle Explorer Button */}
          <button
            className="btn-icon"
            onClick={() => setShowExplorer(prev => !prev)}
            data-tooltip={showExplorer ? 'Hide Explorer (Ctrl+B)' : 'Show Explorer (Ctrl+B)'}
            style={{ padding: '5px' }}
          >
            {showExplorer ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>

          <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          <span className="font-semibold text-md">{project.name}</span>
          <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>
            {runConfig?.framework ? `${runConfig.framework} (${project.language})` : project.language}
          </span>
          {runConfig?.entryFile && (
            <span className="badge badge-blue" style={{ fontSize: '10px' }} data-tooltip="Main Entry Point">
              {runConfig.entryFile}
            </span>
          )}
        </div>

        {/* Center: Primary Actions */}
        <div className="flex items-center gap-2">
          {runState === 'running' || runState === 'preparing' ? (
            <button className="btn btn-sm" onClick={handleStopProject}
              data-tooltip="Stop execution"
              style={{ background: 'var(--accent-red-bg)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderColor: 'rgba(248,81,73,0.3)' }}>
              <Square size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={handleRunProject} data-tooltip="Run project (Ctrl+Shift+R)">
              <Play size={13} /> Run Project
            </button>
          )}

          <button className="btn btn-sm btn-purple" onClick={handleAnalyze} disabled={isAnalyzing} data-tooltip="Analyze with SonarQube & ML (Ctrl+Shift+A)">
            {isAnalyzing ? <Loader size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
            Analyze
          </button>

          <Link href={`/projects/${id}/analysis`} className="btn btn-sm btn-ghost" data-tooltip="Open Defect-Risk Prediction Dashboard">
            <Brain size={13} /> Predict
          </Link>
        </div>

        {/* Right: Collaborators + Theme + Nav Icons */}
        <div className="flex items-center gap-2">
          {/* Collaborator Presence */}
          <div className="dropdown" style={{ position: 'relative' }}>
            <button
              className="flex items-center gap-2 btn-ghost"
              onClick={() => setShowCollabList(!showCollabList)}
              data-tooltip="Team members"
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

          {/* Theme Toggle Button */}
          <button
            className="btn-icon"
            onClick={toggleTheme}
            data-tooltip={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            style={{ padding: '6px' }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Keyboard Shortcuts Help */}
          <button
            className="btn-icon"
            onClick={() => setShowShortcutsModal(true)}
            data-tooltip="Keyboard Shortcuts (Ctrl+K)"
            style={{ padding: '6px' }}
          >
            <HelpCircle size={15} />
          </button>

          {/* Terminal Toggle */}
          <button
            className="btn-icon"
            data-tooltip="Terminal (Ctrl+`)"
            style={{ padding: '6px', color: bottomPanel === 'terminal' ? 'var(--accent-blue)' : undefined }}
            onClick={() => setBottomPanel(bottomPanel === 'terminal' ? 'none' : 'terminal')}
          >
            <TerminalSquare size={15} />
          </button>

          <Link href={`/projects/${id}/analysis`} className="btn-icon" data-tooltip="Analysis & Metrics" style={{ padding: '6px' }}>
            <BarChart3 size={15} />
          </Link>
          <Link href={`/projects/${id}/versions`} className="btn-icon" data-tooltip="Version History & Snapshots" style={{ padding: '6px' }}>
            <History size={15} />
          </Link>
          <Link href={`/projects/${id}/activity`} className="btn-icon" data-tooltip="Activity Log & History" style={{ padding: '6px' }}>
            <Activity size={15} />
          </Link>
          <Link href={`/projects/${id}/settings`} className="btn-icon" data-tooltip="Project Settings & Team" style={{ padding: '6px' }}>
            <Settings size={15} />
          </Link>
        </div>
      </header>

      {/* ─── Main IDE Area ─── */}
      <div className="flex flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* File Explorer with independent resizability */}
        {showExplorer && (
          <>
            <FileTree
              projectId={project.id}
              activeFileId={activeTabId}
              onSelectFile={handleFileSelect}
              width={explorerWidth}
            />
            {/* Draggable vertical separator */}
            <div
              className="resizer-vertical"
              onMouseDown={handleMouseDownExplorer}
              title="Drag to resize explorer panel"
            />
          </>
        )}

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
                  <p className="text-sm">Select a file from the explorer or press <kbd style={{ padding: '2px 6px', background: 'var(--bg-quaternary)', borderRadius: 4, border: '1px solid var(--border-default)', fontSize: 11 }}>Ctrl+P</kbd> to start editing</p>
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

          {/* Bottom Panel (Terminal / Output) with independent resizability */}
          {bottomPanel !== 'none' && (
            <div style={{
              height: bottomPanelHeight,
              minHeight: 120,
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              position: 'relative',
            }}>
              {/* Draggable horizontal separator */}
              <div
                className="resizer-horizontal"
                onMouseDown={handleMouseDownBottomPanel}
                title="Drag to resize panel height"
                style={{ position: 'absolute', top: -2, left: 0, right: 0 }}
              />

              {/* Bottom Panel Tabs & Window Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: 32,
                minHeight: 32,
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

                {/* Panel Window Controls: Maximize/Restore & Close */}
                <button
                  className="btn-icon"
                  onClick={toggleMaximizeBottom}
                  data-tooltip={isBottomMaximized ? 'Restore panel size' : 'Maximize panel'}
                  style={{ padding: '3px' }}
                >
                  {isBottomMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button
                  className="btn-icon"
                  onClick={() => setBottomPanel('none')}
                  data-tooltip="Close panel"
                  style={{ padding: '3px' }}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Panel Content (Terminal session preserved even when switched to output) */}
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: bottomPanel === 'terminal' ? 'flex' : 'none', minHeight: 0 }}>
                  <TerminalComponent visible={bottomPanel === 'terminal'} />
                </div>
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
        language={runConfig?.framework ? `${runConfig.framework} (${project.language})` : project.language}
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

      {/* Keyboard Shortcuts Helper Modal */}
      {showShortcutsModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          backdropFilter: 'blur(3px)',
        }}>
          <div className="card" style={{ width: 440, padding: 24, boxShadow: 'var(--shadow-xl)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2 font-semibold text-lg">
                <Command size={18} style={{ color: 'var(--accent-blue)' }} />
                <span>Keyboard Shortcuts</span>
              </div>
              <button className="btn-icon" onClick={() => setShowShortcutsModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2" style={{ fontSize: 13 }}>
              {[
                { key: 'Ctrl + S', desc: 'Save current file' },
                { key: 'Ctrl + B', desc: 'Toggle Explorer sidebar' },
                { key: 'Ctrl + P / Ctrl + K', desc: 'Command Palette / Quick Open' },
                { key: 'Ctrl + `', desc: 'Toggle integrated terminal' },
                { key: 'Ctrl + W', desc: 'Close active tab' },
                { key: 'Ctrl + Tab', desc: 'Switch to next tab' },
                { key: 'Ctrl + Shift + Tab', desc: 'Switch to previous tab' },
                { key: 'Ctrl + Shift + R', desc: 'Run project' },
                { key: 'Ctrl + Shift + A', desc: 'Trigger code analysis' },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
                  <kbd style={{ padding: '3px 8px', background: 'var(--bg-quaternary)', borderRadius: 4, border: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowShortcutsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
