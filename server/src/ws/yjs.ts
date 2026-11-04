import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { Server, IncomingMessage } from 'http';
import { prisma } from '../db';
import { verifyAccessToken } from '../utils/jwt';

// In-memory store for Yjs documents
const docs = new Map<string, Y.Doc>();

const getOrCreateDoc = async (docName: string): Promise<Y.Doc> => {
  if (docs.has(docName)) {
    return docs.get(docName)!;
  }

  const ydoc = new Y.Doc();
  docs.set(docName, ydoc);

  // Load persisted state from database
  const parts = docName.split(':');
  if (parts.length === 4) {
    const fileId = parts[3];
    try {
      const dbFile = await prisma.file.findUnique({ where: { id: fileId } });
      if (dbFile?.yjsState) {
        Y.applyUpdate(ydoc, new Uint8Array(dbFile.yjsState));
      } else if (dbFile?.content) {
        // Initialize from plain text content if no Yjs state exists
        const text = ydoc.getText('monaco');
        text.insert(0, dbFile.content);
      }
    } catch (err) {
      console.error(`[YJS] Failed to load state for ${docName}:`, err);
    }
  }

  // Save state to DB on every update (debounced)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  ydoc.on('update', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        const parts = docName.split(':');
        if (parts.length !== 4) return;
        const fileId = parts[3];
        const update = Y.encodeStateAsUpdate(ydoc);
        const textType = ydoc.getText('monaco');
        const plaintext = textType.toString();

        await prisma.file.update({
          where: { id: fileId },
          data: {
            yjsState: Buffer.from(update),
            content: plaintext,
          }
        });

        // Touch project updatedAt to reflect recent Yjs activity
        const projectId = parts[1];
        await prisma.project.update({
          where: { id: projectId },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        console.error(`[YJS] Failed to save state for ${docName}:`, err);
      }
    }, 1000); // Debounce 1 second
  });

  return ydoc;
};

// Track connections per document
const docConnections = new Map<string, Set<WebSocket>>();

export const setupYjsWebsocket = (server: Server) => {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually to integrate authentication
  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    // URL format expected: /api/ws/projects/:projectId/files/:fileId?token=<JWT>
    const url = new URL(request.url!, `http://${request.headers.host}`);
    
    if (url.pathname.startsWith('/api/ws/projects/')) {
      const token = url.searchParams.get('token');
      
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        const payload = verifyAccessToken(token);
        
        // Extract project and file IDs from path
        const match = url.pathname.match(/\/projects\/([^\/]+)\/files\/([^\/]+)/);
        if (!match) throw new Error('Invalid path');
        
        const projectId = match[1];
        const fileId = match[2];

        // Verify user has access to this project
        const member = await prisma.projectMember.findUnique({
          where: { idx_pm_project_user: { projectId, userId: payload.userId } }
        });

        if (!member) {
          throw new Error('Forbidden');
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          const docName = `project:${projectId}:file:${fileId}`;
          wss.emit('connection', ws, request, docName);
        });
      } catch (err) {
        console.error('[YJS] Auth failed:', err);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    }
  });

  wss.on('connection', async (ws: WebSocket, _request: IncomingMessage, docName: string) => {
    let doc: Y.Doc;
    
    try {
      doc = await getOrCreateDoc(docName);
    } catch (err) {
      console.error('[YJS] Failed to create doc:', err);
      ws.close();
      return;
    }

    // Track this connection
    if (!docConnections.has(docName)) {
      docConnections.set(docName, new Set());
    }
    docConnections.get(docName)!.add(ws);

    console.log(`[YJS] Client connected to ${docName}. Total: ${docConnections.get(docName)!.size}`);

    // Send the current state as a sync step 1
    const stateVector = Y.encodeStateVector(doc);
    // Send sync step 1: state vector
    const syncStep1 = createSyncMessage(0, stateVector);
    ws.send(syncStep1);

    // Handle incoming messages (Yjs sync protocol)
    ws.on('message', (data: Buffer) => {
      try {
        const message = new Uint8Array(data);
        const decoder = createDecoder(message);
        const messageType = readVarUint(decoder);

        if (messageType === 0) {
          // Sync message
          const syncType = readVarUint(decoder);
          
          if (syncType === 0) {
            // Sync step 1: Client sends state vector, we respond with missing updates
            const sv = readVarUint8Array(decoder);
            const update = Y.encodeStateAsUpdate(doc, sv);
            const reply = createSyncMessage(1, update);
            ws.send(reply);
            
            // Also send our state vector as sync step 1
            // (already sent on connect)
          } else if (syncType === 1) {
            // Sync step 2: Client sends missing updates
            const update = readVarUint8Array(decoder);
            Y.applyUpdate(doc, update);
          } else if (syncType === 2) {
            // Update message
            const update = readVarUint8Array(decoder);
            Y.applyUpdate(doc, update);
          }
        } else if (messageType === 1) {
          // Awareness message - broadcast to other clients
          const connections = docConnections.get(docName);
          if (connections) {
            for (const conn of connections) {
              if (conn !== ws && conn.readyState === WebSocket.OPEN) {
                conn.send(data);
              }
            }
          }
        }
      } catch (err) {
        console.error('[YJS] Error handling message:', err);
      }
    });

    // Broadcast updates from this doc to all connected clients
    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin === ws) return; // Don't echo back to sender

      const message = createSyncMessage(2, update);
      const connections = docConnections.get(docName);
      if (connections) {
        for (const conn of connections) {
          if (conn.readyState === WebSocket.OPEN) {
            conn.send(message);
          }
        }
      }
    };
    doc.on('update', updateHandler);

    ws.on('close', () => {
      const connections = docConnections.get(docName);
      if (connections) {
        connections.delete(ws);
        console.log(`[YJS] Client disconnected from ${docName}. Remaining: ${connections.size}`);
        
        // Clean up empty documents after a delay
        if (connections.size === 0) {
          setTimeout(() => {
            const conns = docConnections.get(docName);
            if (conns && conns.size === 0) {
              docConnections.delete(docName);
              doc.off('update', updateHandler);
              // Don't destroy the doc immediately - keep it cached
            }
          }, 30000);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[YJS] WebSocket error on ${docName}:`, err);
    });
  });

  console.log('[YJS] WebSocket server initialized');
};

// --- Minimal binary encoding helpers for Yjs sync protocol ---

function createSyncMessage(syncType: number, data: Uint8Array): Uint8Array {
  const syncTypeEncoded = encodeVarUint(syncType);
  const msgTypeEncoded = encodeVarUint(0); // message type 0 = sync
  const dataLenEncoded = encodeVarUint(data.length);
  
  const result = new Uint8Array(msgTypeEncoded.length + syncTypeEncoded.length + dataLenEncoded.length + data.length);
  let offset = 0;
  result.set(msgTypeEncoded, offset); offset += msgTypeEncoded.length;
  result.set(syncTypeEncoded, offset); offset += syncTypeEncoded.length;
  result.set(dataLenEncoded, offset); offset += dataLenEncoded.length;
  result.set(data, offset);
  return result;
}

function createDecoder(data: Uint8Array) {
  return { data, pos: 0 };
}

function readVarUint(decoder: { data: Uint8Array; pos: number }): number {
  let num = 0;
  let mult = 1;
  const len = decoder.data.length;
  while (decoder.pos < len) {
    const r = decoder.data[decoder.pos++];
    num = num + (r & 0x7f) * mult;
    mult *= 128;
    if (r < 0x80) return num;
  }
  return num;
}

function readVarUint8Array(decoder: { data: Uint8Array; pos: number }): Uint8Array {
  const len = readVarUint(decoder);
  const result = decoder.data.slice(decoder.pos, decoder.pos + len);
  decoder.pos += len;
  return result;
}

function encodeVarUint(num: number): Uint8Array {
  const bytes: number[] = [];
  while (num > 0x7f) {
    bytes.push(0x80 | (num & 0x7f));
    num = Math.floor(num / 128);
  }
  bytes.push(num & 0x7f);
  return new Uint8Array(bytes);
}
