import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { verifyAccessToken } from '../utils/jwt';
import os from 'os';
import { execSync } from 'child_process';

// Prefer bash; fall back to sh (Alpine Linux / minimal containers only have sh)
function detectShell(): string {
  if (os.platform() === 'win32') return 'powershell.exe';
  try {
    execSync('which bash', { stdio: 'ignore' });
    return 'bash';
  } catch {
    return 'sh';
  }
}

const shell = detectShell();

export function setupTerminalWebsocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    // Only handle /ws/terminal path
    if (!url.pathname.startsWith('/ws/terminal')) return;

    // Auth
    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      verifyAccessToken(token);
    } catch (err) {
      console.error('[Terminal] Auth failed:', (err as Error).message);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[Terminal] Client connected');

    // Spawn a PTY process
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: { ...process.env } as Record<string, string>,
    });

    // PTY → WebSocket
    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', exitCode }));
      }
    });

    // WebSocket → PTY
    ws.on('message', (msg: Buffer) => {
      try {
        const parsed = JSON.parse(msg.toString());
        switch (parsed.type) {
          case 'input':
            ptyProcess.write(parsed.data);
            break;
          case 'resize':
            ptyProcess.resize(parsed.cols || 120, parsed.rows || 30);
            break;
        }
      } catch {
        // Raw text fallback
        ptyProcess.write(msg.toString());
      }
    });

    ws.on('close', () => {
      console.log('[Terminal] Client disconnected');
      ptyProcess.kill();
    });

    ws.on('error', (err) => {
      console.error('[Terminal] WebSocket error:', err.message);
      ptyProcess.kill();
    });
  });

  console.log('[Terminal] WebSocket server initialized');
}
