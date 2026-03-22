import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import morgan  from 'morgan';
import path    from 'path';

import connectDB        from './config/db';
import apiKeyMiddleware from './middleware/apiKey';

import userRoutes         from './routes/users';
import workspaceRoutes    from './routes/workspace';
import boardRoutes        from './routes/boards';
import cardRoutes         from './routes/cards';
import tagRoutes          from './routes/tags';
import documentRoutes     from './routes/documents';
import meetingRoutes      from './routes/meetings';
import inboxRoutes        from './routes/inbox';
import notificationRoutes from './routes/notifications';
import dashboardRoutes    from './routes/dashboard';
import fileRoutes         from './routes/file';
import supportRoutes      from './routes/support';

// ── Connect DB ────────────────────────────────────────────────────────────────
connectDB();

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — allow all origins in dev; add all headers the frontend may send
app.use(cors({
  origin:      '*',
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    // Cache-control headers sent by the notification/inbox API to bust 304s
    'Cache-Control',
    'Pragma',
    'Expires',
  ],
  // Expose headers so the browser can read them
  exposedHeaders: ['Cache-Control', 'Pragma'],
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
}));

// Respond to all OPTIONS preflight requests immediately
app.options('*', cors());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads')));

// ── Health check (public) ─────────────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success:   true,
    status:    'ok',
    app:       'FlowSpace API',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── API key guard on all /api routes ──────────────────────────────────────────
app.use('/api', apiKeyMiddleware);

// ── Mount routers ─────────────────────────────────────────────────────────────
app.use('/api/users',         userRoutes);
app.use('/api/workspace',     workspaceRoutes);
app.use('/api/boards',        boardRoutes);
app.use('/api/cards',         cardRoutes);
app.use('/api/tags',          tagRoutes);
app.use('/api/documents',     documentRoutes);
app.use('/api/meetings',      meetingRoutes);
app.use('/api/inbox',         inboxRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/file',          fileRoutes);
app.use('/api/support',       supportRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Unhandled error:', err.stack ?? err.message);

  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ success: false, message: 'File too large. Maximum size is 50 MB.' });
    return;
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e: any) => e.message);
    res.status(400).json({ success: false, message: messages.join(', ') });
    return;
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    res.status(409).json({ success: false, message: `${field} already exists` });
    return;
  }
  if (err.name === 'CastError') {
    res.status(400).json({ success: false, message: `Invalid ID format: ${err.value}` });
    return;
  }

  res.status(err.status ?? 500).json({
    success: false,
    message: err.message ?? 'Internal server error',
  });
});

// ── Start server (only when run directly, not on Vercel) ─────────────────────
if (process.env.VERCEL !== '1') {
  const PORT = parseInt(process.env.PORT ?? '5000', 10);
  app.listen(PORT, () => {
    console.log(`🚀 FlowSpace API running on http://localhost:${PORT}`);
    console.log(`📁 Uploads served at  http://localhost:${PORT}/uploads`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
}

export default app;
