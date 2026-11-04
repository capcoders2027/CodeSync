import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiRouter } from './routes';

const app = express();
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api', apiRouter);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

import { setupYjsWebsocket } from './ws/yjs';
import { setupTerminalWebsocket } from './ws/terminal';

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

setupYjsWebsocket(httpServer);
setupTerminalWebsocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║          CodeSync API Server                  ║
  ║          Running on port ${env.PORT}                ║
  ║          Environment: ${env.NODE_ENV}          ║
  ╚═══════════════════════════════════════════════╝
  `);
});

export { app, httpServer };
