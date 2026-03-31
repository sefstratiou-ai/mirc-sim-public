import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { handleGenerate, clearFailoverState } from './aiProxy';
import { checkRateLimit } from './rateLimiter';
import { hashIp, recordSession, endSession, getStats, getAIConfig, AIConfig, recordApiError } from './statsDb';
import { renderStatsPage } from './statsPage';
import { getClientIp } from './utils';
import configRouter, { mountAdminConfigRoutes, setBroadcastConfigChange } from './configApi';

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_STATS_KEY = process.env.ADMIN_STATS_KEY || '';

app.use(cors());
app.use(express.json());

// Mount config public + admin routes
app.use(configRouter);
mountAdminConfigRoutes(app, ADMIN_STATS_KEY);

// Rate limiting middleware
app.use('/api/generate', (req, res, next) => {
  const clientId = getClientIp(req);
  if (!checkRateLimit(clientId)) {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait.' });
    return;
  }
  next();
});

// AI generation endpoint
app.post('/api/generate', handleGenerate);

// Client-side AI validation/logging endpoint
app.post('/api/client-ai-error', (req, res) => {
  const rawIp = getClientIp(req);
  const ipHash = hashIp(rawIp);
  const body = req.body as {
    provider?: unknown;
    model?: unknown;
    requestType?: unknown;
    errorMessage?: unknown;
    errorDetails?: unknown;
    httpStatus?: unknown;
  };

  try {
    recordApiError(
      ipHash,
      rawIp,
      typeof body.provider === 'string' ? body.provider.slice(0, 64) : '',
      typeof body.model === 'string' ? body.model.slice(0, 200) : '',
      typeof body.requestType === 'string' ? body.requestType.slice(0, 64) : 'unknown',
      typeof body.errorMessage === 'string' ? body.errorMessage.slice(0, 500) : 'Client AI error',
      typeof body.errorDetails === 'string' ? body.errorDetails.slice(0, 4000) : '',
      typeof body.httpStatus === 'number' && Number.isFinite(body.httpStatus) ? body.httpStatus : 0
    );
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to record client AI error' });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Admin stats — JSON
app.get('/api/stats', (req, res) => {
  const key = req.query.key as string | undefined;
  if (!ADMIN_STATS_KEY || key !== ADMIN_STATS_KEY) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(getStats());
});

// Admin stats — HTML page
app.get('/admin/stats', (req, res) => {
  const key = req.query.key as string | undefined;
  if (!ADMIN_STATS_KEY || key !== ADMIN_STATS_KEY) {
    res.status(403).send('Forbidden');
    return;
  }
  const activeConfig = getAIConfig('active');
  const stats = getStats();
  res.type('html').send(renderStatsPage(stats, activeConfig, key!));
});

// Serve static frontend in production
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SPA fallback — serve index.html for any non-API route (Express 5 requires named param)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Create HTTP server
const server = createServer(app);

// Raise timeouts to accommodate slow reasoning model responses (default headersTimeout is 60s)
server.headersTimeout = 150_000;
server.requestTimeout = 150_000;

// WebSocket server for real-time communication
const wss = new WebSocketServer({ server, path: '/ws' });

// Wire up config change broadcasting to all WS clients
setBroadcastConfigChange((config: AIConfig) => {
  const payload = JSON.stringify({
    type: 'config_changed',
    config: {
      provider: config.provider,
      lmstudioUrl: config.lmstudioUrl,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      temperature: config.temperature,
      hasApiKey: !!config.apiKey,
    },
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
  console.log(`[config] Broadcasted config change to ${wss.clients.size} client(s): provider=${config.provider}, model=${config.model}`);
});

wss.on('connection', (ws: WebSocket, req) => {
  const rawIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim()
    || req.socket.remoteAddress
    || 'unknown';
  const ip = rawIp.replace(/^::ffff:/, '');
  const ipHash = hashIp(ip);
  const sessionId = recordSession(ipHash);
  console.log('WebSocket client connected');

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      // Broadcast to all other clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    } catch {
      // Invalid message
    }
  });

  ws.on('close', () => {
    endSession(sessionId);
    clearFailoverState(ipHash);
    console.log('WebSocket client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`mIRC-Sim server running on http://localhost:${PORT}`);
});
