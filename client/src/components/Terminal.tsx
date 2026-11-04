'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  visible: boolean;
}

export function Terminal({ visible }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // Derive WS URL from the API URL env var (http->ws, https->wss)
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api$/, '');
    const ws = new WebSocket(`${wsBase}/ws/terminal?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send initial size
      if (termRef.current) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: termRef.current.cols,
          rows: termRef.current.rows,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' && termRef.current) {
          termRef.current.write(msg.data);
        } else if (msg.type === 'exit') {
          termRef.current?.writeln(`\r\n\x1b[90mProcess exited with code ${msg.exitCode}\x1b[0m`);
          setConnected(false);
        }
      } catch {
        // Raw data
        termRef.current?.write(event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new XTermTerminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(56, 139, 253, 0.3)',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#8957e5',
        cyan: '#39d2c0',
        white: '#e6edf3',
        brightBlack: '#6e7681',
        brightRed: '#f85149',
        brightGreen: '#3fb950',
        brightYellow: '#d29922',
        brightBlue: '#58a6ff',
        brightMagenta: '#8957e5',
        brightCyan: '#39d2c0',
        brightWhite: '#ffffff',
      },
      fontFamily: 'var(--font-mono), "JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    // Send input to WebSocket
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Connect
    connect();

    return () => {
      wsRef.current?.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [connect]);

  // Refit on visibility change
  useEffect(() => {
    if (visible && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 50);
    }
  }, [visible]);

  // Listen for window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitRef.current && visible) {
        fitRef.current.fit();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [visible]);

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.clear();
    connect();
  }, [connect]);

  if (!visible) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#0d1117',
    }}>
      {/* Terminal Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--sp-5)',
        height: 28,
        minHeight: 28,
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
        fontSize: 'var(--text-xs)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: connected ? 'var(--accent-green)' : 'var(--accent-red)',
          }} />
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            TERMINAL
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {!connected && (
            <button
              onClick={handleReconnect}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--accent-blue)', fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Terminal Body */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: 'var(--sp-2) 0 0 var(--sp-3)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
