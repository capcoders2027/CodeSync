'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, ShieldCheck, BarChart3, History, Activity, Terminal,
  Search, FileCode, Settings, Brain, Zap, Command
} from 'lucide-react';
import Link from 'next/link';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string[];
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onRun: () => void;
  onAnalyze: () => void;
  onToggleTerminal: () => void;
}

export function CommandPalette({ isOpen, onClose, projectId, onRun, onAnalyze, onToggleTerminal }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    { id: 'run', label: 'Run Project', icon: <Play size={16} />, shortcut: ['Ctrl', 'Shift', 'R'], action: onRun, category: 'Actions' },
    { id: 'analyze', label: 'Analyze Code', icon: <ShieldCheck size={16} />, shortcut: ['Ctrl', 'Shift', 'A'], action: onAnalyze, category: 'Actions' },
    { id: 'terminal', label: 'Toggle Terminal', icon: <Terminal size={16} />, shortcut: ['Ctrl', '`'], action: onToggleTerminal, category: 'Actions' },
    { id: 'analysis', label: 'Open Analysis Dashboard', icon: <BarChart3 size={16} />, action: () => window.location.href = `/projects/${projectId}/analysis`, category: 'Navigate' },
    { id: 'predict', label: 'Open ML Prediction', icon: <Brain size={16} />, action: () => window.location.href = `/projects/${projectId}/analysis`, category: 'Navigate' },
    { id: 'versions', label: 'View Version History', icon: <History size={16} />, action: () => window.location.href = `/projects/${projectId}/versions`, category: 'Navigate' },
    { id: 'activity', label: 'View Activity Log', icon: <Activity size={16} />, action: () => window.location.href = `/projects/${projectId}/activity`, category: 'Navigate' },
    { id: 'settings', label: 'Project Settings', icon: <Settings size={16} />, action: () => window.location.href = `/projects/${projectId}/settings`, category: 'Navigate' },
    { id: 'dashboard', label: 'Back to Dashboard', icon: <Zap size={16} />, action: () => window.location.href = '/', category: 'Navigate' },
  ];

  const filtered = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action();
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Group by category
  const grouped: Record<string, CommandItem[]> = {};
  filtered.forEach(cmd => {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  });

  let flatIndex = -1;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-list">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div style={{
                padding: 'var(--sp-3) var(--sp-5)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
              }}>
                {category}
              </div>
              {items.map(cmd => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <div
                    key={cmd.id}
                    className={`command-palette-item ${idx === activeIndex ? 'command-palette-item-active' : ''}`}
                    onClick={() => { cmd.action(); onClose(); }}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className="command-palette-item-icon">{cmd.icon}</span>
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <span className="command-palette-item-shortcut">
                        {cmd.shortcut.map(k => <span key={k} className="kbd">{k}</span>)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
