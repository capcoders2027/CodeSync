import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { verifyAccessToken } from '../utils/jwt';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { prisma } from '../db';

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

function getShellArgs(): string[] {
  if (os.platform() === 'win32') {
    return ['-NoLogo', '-NoExit', '-Command', 'function prompt { "codesync $ " }'];
  }
  return [];
}

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

  wss.on('connection', async (ws: WebSocket, req: any) => {
    console.log('[Terminal] Client connected');

    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const projectId = url.searchParams.get('projectId');

    // Default to workspace directory if project is provided
    let terminalCwd = process.cwd();

    if (projectId) {
      try {
        const workspaceDir = path.join(process.cwd(), '.tmp', 'workspaces', projectId);
        await fs.mkdir(workspaceDir, { recursive: true });

        // Sync all project files to the disk workspace so the terminal can run them directly
        const allItems = await prisma.file.findMany({
          where: { projectId },
          select: { id: true, name: true, type: true, parentId: true, content: true },
        });

        const fileMap = new Map(allItems.map(f => [f.id, f]));
        const getRelativePath = (item: any): string => {
          let curr = item;
          const parts = [curr.name];
          while (curr.parentId && fileMap.has(curr.parentId)) {
            curr = fileMap.get(curr.parentId)!;
            parts.unshift(curr.name);
          }
          return parts.join(path.sep);
        };

        for (const item of allItems) {
          const relPath = getRelativePath(item);
          const fullPath = path.join(workspaceDir, relPath);
          if (item.type === 'folder') {
            await fs.mkdir(fullPath, { recursive: true });
          } else if (item.content !== null) {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            // If base64 image or data URI, write binary buffer
            if (item.content.startsWith('data:')) {
              const base64Data = item.content.split(';base64,').pop() || '';
              await fs.writeFile(fullPath, Buffer.from(base64Data, 'base64'));
            } else {
              await fs.writeFile(fullPath, item.content, 'utf8');
            }
          }
        }
        // If project files are inside a single root folder (e.g. student_management_system/),
        // start terminal inside that folder so commands like 'python app.py' work immediately
        const topLevelFolders = allItems.filter(i => i.type === 'folder' && !i.parentId);
        const topLevelFiles = allItems.filter(i => i.type === 'file' && !i.parentId);
        if (topLevelFolders.length === 1 && topLevelFiles.length === 0) {
          terminalCwd = path.join(workspaceDir, topLevelFolders[0].name);
        } else {
          terminalCwd = workspaceDir;
        }
      } catch (err) {
        console.error('[Terminal] Workspace sync error:', err);
      }
    }

    // Spawn a PTY process with clean minimal prompt
    // Note: useConpty: false on Windows avoids 'Error: AttachConsole failed'
    let ptyProcess: any;
    try {
      ptyProcess = pty.spawn(shell, getShellArgs(), {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: terminalCwd,
        useConpty: false,
        env: {
          ...process.env,
          PATH: `C:\\Program Files\\nodejs;${process.env.PATH || ''}`,
          PS1: 'codesync $ ',
          TERM: 'xterm-256color',
        } as Record<string, string>,
      });
    } catch (spawnErr) {
      console.error('[Terminal] PTY spawn failed:', spawnErr);
      ws.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31mFailed to start terminal session.\x1b[0m\r\n' }));
      ws.close();
      return;
    }

    // PTY → WebSocket
    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
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
      try { ptyProcess.kill(); } catch {}
    });

    ws.on('error', (err) => {
      console.error('[Terminal] WebSocket error:', err.message);
      try { ptyProcess.kill(); } catch {}
    });
  });

  console.log('[Terminal] WebSocket server initialized');
}
