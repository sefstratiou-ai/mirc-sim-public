import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.STATS_DB_PATH || path.join(__dirname, '../../data/stats.db');

// Ensure the directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    disconnected_at TEXT
  );

  CREATE TABLE IF NOT EXISTS api_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    raw_ip TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    request_type TEXT NOT NULL DEFAULT 'unknown',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Add raw_ip column if missing (migration for existing DBs)
try {
  db.exec(`ALTER TABLE api_calls ADD COLUMN raw_ip TEXT NOT NULL DEFAULT ''`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE api_calls ADD COLUMN request_type TEXT NOT NULL DEFAULT 'unknown'`);
} catch {
  // Column already exists
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at);
  CREATE INDEX IF NOT EXISTS idx_api_calls_provider ON api_calls(provider);
  CREATE INDEX IF NOT EXISTS idx_api_calls_request_type ON api_calls(request_type);
  CREATE INDEX IF NOT EXISTS idx_sessions_connected_at ON sessions(connected_at);
`);

// ── API Errors table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS api_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL DEFAULT '',
    raw_ip TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    request_type TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    error_details TEXT NOT NULL DEFAULT '',
    http_status INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_api_errors_created_at ON api_errors(created_at);
`);

// ── AI Config table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'gemini',
    api_key TEXT NOT NULL DEFAULT '',
    lmstudio_url TEXT NOT NULL DEFAULT 'http://localhost:1234',
    model TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT '',
    temperature REAL NOT NULL DEFAULT 0.9
  );
`);

export interface AIConfig {
  name: string;
  provider: string;
  apiKey: string;
  lmstudioUrl: string;
  model: string;
  reasoningEffort: string;
  temperature: number;
}

interface AIConfigRow {
  name: string;
  provider: string;
  api_key: string;
  lmstudio_url: string;
  model: string;
  reasoning_effort: string;
  temperature: number;
}

function rowToConfig(row: AIConfigRow): AIConfig {
  return {
    name: row.name,
    provider: row.provider,
    apiKey: row.api_key,
    lmstudioUrl: row.lmstudio_url,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    temperature: row.temperature,
  };
}

const getConfigStmt = db.prepare('SELECT * FROM ai_config WHERE name = ?');
const getAllConfigsStmt = db.prepare('SELECT * FROM ai_config ORDER BY name');
const upsertConfigStmt = db.prepare(`
  INSERT INTO ai_config (name, provider, api_key, lmstudio_url, model, reasoning_effort, temperature)
  VALUES (@name, @provider, @api_key, @lmstudio_url, @model, @reasoning_effort, @temperature)
  ON CONFLICT(name) DO UPDATE SET
    provider = excluded.provider,
    api_key = excluded.api_key,
    lmstudio_url = excluded.lmstudio_url,
    model = excluded.model,
    reasoning_effort = excluded.reasoning_effort,
    temperature = excluded.temperature
`);

export function getAIConfig(name: string): AIConfig | null {
  const row = getConfigStmt.get(name) as AIConfigRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function getAllAIConfigs(): AIConfig[] {
  const rows = getAllConfigsStmt.all() as AIConfigRow[];
  return rows.map(rowToConfig);
}

export function upsertAIConfig(name: string, config: Omit<AIConfig, 'name'>): void {
  upsertConfigStmt.run({
    name,
    provider: config.provider,
    api_key: config.apiKey,
    lmstudio_url: config.lmstudioUrl,
    model: config.model,
    reasoning_effort: config.reasoningEffort,
    temperature: config.temperature,
  });
}

// ── Secondary preset helpers ──

export function getSecondaryPreset(): string | null {
  const row = getConfigStmt.get('secondary_preset') as AIConfigRow | undefined;
  return row && row.provider ? row.provider : null;
}

export function setSecondaryPreset(presetName: string): void {
  upsertConfigStmt.run({
    name: 'secondary_preset',
    provider: presetName,
    api_key: '',
    lmstudio_url: '',
    model: '',
    reasoning_effort: '',
    temperature: 0,
  });
}

export function clearSecondaryPreset(): void {
  db.prepare('DELETE FROM ai_config WHERE name = ?').run('secondary_preset');
}

/** Seed default presets + active config (idempotent — skips existing rows). */
export function seedDefaultConfigs(): void {
  const seedIfMissing = db.prepare(`
    INSERT OR IGNORE INTO ai_config (name, provider, api_key, lmstudio_url, model, reasoning_effort, temperature)
    VALUES (@name, @provider, @api_key, @lmstudio_url, @model, @reasoning_effort, @temperature)
  `);

  const presets = [
    { name: 'preset:gemini', provider: 'gemini', api_key: process.env.GEMINI_API_KEY || '', lmstudio_url: process.env.LMSTUDIO_URL || 'http://localhost:1234', model: 'gemini-3.1-flash-lite-preview', reasoning_effort: '', temperature: 0.85 },
    { name: 'preset:openai', provider: 'openai', api_key: process.env.OPENAI_API_KEY || '', lmstudio_url: process.env.LMSTUDIO_URL || 'http://localhost:1234', model: 'gpt-5.3-chat-latest', reasoning_effort: '', temperature: 1.0 },
    { name: 'preset:deepseek', provider: 'deepseek', api_key: process.env.DEEPSEEK_API_KEY || '', lmstudio_url: '', model: 'deepseek-chat', reasoning_effort: '', temperature: 1.3 },
    { name: 'preset:lmstudio', provider: 'lmstudio', api_key: '', lmstudio_url: process.env.LMSTUDIO_URL || 'http://localhost:1234', model: '', reasoning_effort: '', temperature: 0.85 },
  ];

  const seedMany = db.transaction(() => {
    for (const preset of presets) seedIfMissing.run(preset);
    // Seed active from the gemini preset by default
    seedIfMissing.run({ ...presets[0], name: 'active' });
  });
  seedMany();
}

// Run seeding on startup
seedDefaultConfigs();

// Prepared statements
const insertSession = db.prepare(
  'INSERT INTO sessions (ip_hash) VALUES (?)'
);

const updateSessionEnd = db.prepare(
  `UPDATE sessions SET disconnected_at = datetime('now') WHERE id = ?`
);

const insertApiCall = db.prepare(
  'INSERT INTO api_calls (ip_hash, raw_ip, provider, model, request_type, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export function recordSession(ipHash: string): number {
  const result = insertSession.run(ipHash);
  return Number(result.lastInsertRowid);
}

export function endSession(sessionId: number): void {
  updateSessionEnd.run(sessionId);
}

export function recordApiCall(
  ipHash: string,
  rawIp: string,
  provider: string,
  model: string,
  requestType: string,
  inputTokens: number,
  outputTokens: number
): void {
  insertApiCall.run(ipHash, rawIp, provider, model, requestType, inputTokens, outputTokens);
}

// ── API Error recording ──

const insertApiError = db.prepare(
  'INSERT INTO api_errors (ip_hash, raw_ip, provider, model, request_type, error_message, error_details, http_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);

export function recordApiError(
  ipHash: string,
  rawIp: string,
  provider: string,
  model: string,
  requestType: string,
  errorMessage: string,
  errorDetails: string,
  httpStatus: number
): void {
  insertApiError.run(ipHash, rawIp, provider, model, requestType, errorMessage, errorDetails, httpStatus);
  // Prune old errors — keep last 1000
  db.prepare(`DELETE FROM api_errors WHERE id NOT IN (SELECT id FROM api_errors ORDER BY id DESC LIMIT 1000)`).run();
}

export interface ApiError {
  id: number;
  ipHash: string;
  rawIp: string;
  provider: string;
  model: string;
  requestType: string;
  errorMessage: string;
  errorDetails: string;
  httpStatus: number;
  createdAt: string;
}

export function getRecentErrors(limit: number = 50): ApiError[] {
  return db.prepare(`
    SELECT id, ip_hash as ipHash, raw_ip as rawIp, provider, model,
      request_type as requestType, error_message as errorMessage,
      error_details as errorDetails, http_status as httpStatus,
      created_at as createdAt
    FROM api_errors ORDER BY id DESC LIMIT ?
  `).all(limit) as ApiError[];
}

export interface StatsData {
  users: {
    totalUnique: number;
    activeRecent: number;
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
    grandTotal: number;
    byProvider: { provider: string; inputTokens: number; outputTokens: number; total: number; calls: number }[];
    byRequestType: { requestType: string; inputTokens: number; outputTokens: number; total: number; calls: number; avgInput: number }[];
  };
  requests: {
    total: number;
    today: number;
    thisWeek: number;
  };
  sessions: {
    total: number;
    avgDurationMinutes: number | null;
  };
  activeIPs: { ipHash: string; rawIp: string; lastSeen: string; calls: number; tokens: number }[];
  errors: {
    total: number;
    today: number;
  };
}

export function getStats(): StatsData {
  const uniqueUsers = db.prepare(
    'SELECT COUNT(DISTINCT ip_hash) as count FROM (SELECT ip_hash FROM sessions UNION SELECT ip_hash FROM api_calls)'
  ).get() as { count: number };

  const activeRecent = db.prepare(
    `SELECT COUNT(DISTINCT ip_hash) as count FROM api_calls WHERE created_at >= datetime('now', '-60 minutes')`
  ).get() as { count: number };

  const tokenTotals = db.prepare(
    'SELECT COALESCE(SUM(input_tokens), 0) as totalInput, COALESCE(SUM(output_tokens), 0) as totalOutput FROM api_calls'
  ).get() as { totalInput: number; totalOutput: number };

  const byProvider = db.prepare(`
    SELECT provider,
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COUNT(*) as calls
    FROM api_calls GROUP BY provider ORDER BY calls DESC
  `).all() as { provider: string; inputTokens: number; outputTokens: number; calls: number }[];

  const byRequestType = db.prepare(`
    SELECT request_type as requestType,
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COUNT(*) as calls
    FROM api_calls
    GROUP BY request_type
    ORDER BY (inputTokens + outputTokens) DESC, calls DESC
  `).all() as { requestType: string; inputTokens: number; outputTokens: number; calls: number }[];

  const totalRequests = db.prepare(
    'SELECT COUNT(*) as count FROM api_calls'
  ).get() as { count: number };

  const todayRequests = db.prepare(
    `SELECT COUNT(*) as count FROM api_calls WHERE created_at >= datetime('now', 'start of day')`
  ).get() as { count: number };

  const weekRequests = db.prepare(
    `SELECT COUNT(*) as count FROM api_calls WHERE created_at >= datetime('now', '-7 days')`
  ).get() as { count: number };

  const totalSessions = db.prepare(
    'SELECT COUNT(*) as count FROM sessions'
  ).get() as { count: number };

  const avgDuration = db.prepare(`
    SELECT AVG((julianday(disconnected_at) - julianday(connected_at)) * 24 * 60) as avgMin
    FROM sessions WHERE disconnected_at IS NOT NULL
  `).get() as { avgMin: number | null };

  const activeIPs = db.prepare(`
    SELECT ip_hash as ipHash,
      MAX(raw_ip) as rawIp,
      MAX(created_at) as lastSeen,
      COUNT(*) as calls,
      COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
    FROM api_calls
    WHERE created_at >= datetime('now', '-60 minutes')
    GROUP BY ip_hash
    ORDER BY lastSeen DESC
  `).all() as { ipHash: string; rawIp: string; lastSeen: string; calls: number; tokens: number }[];

  return {
    users: {
      totalUnique: uniqueUsers.count,
      activeRecent: activeRecent.count,
    },
    tokens: {
      totalInput: tokenTotals.totalInput,
      totalOutput: tokenTotals.totalOutput,
      grandTotal: tokenTotals.totalInput + tokenTotals.totalOutput,
      byProvider: byProvider.map(p => ({
        ...p,
        total: p.inputTokens + p.outputTokens,
      })),
      byRequestType: byRequestType.map(entry => ({
        ...entry,
        total: entry.inputTokens + entry.outputTokens,
        avgInput: entry.calls > 0 ? Math.round(entry.inputTokens / entry.calls) : 0,
      })),
    },
    requests: {
      total: totalRequests.count,
      today: todayRequests.count,
      thisWeek: weekRequests.count,
    },
    sessions: {
      total: totalSessions.count,
      avgDurationMinutes: avgDuration.avgMin ? Math.round(avgDuration.avgMin * 10) / 10 : null,
    },
    activeIPs,
    errors: {
      total: (db.prepare('SELECT COUNT(*) as count FROM api_errors').get() as { count: number }).count,
      today: (db.prepare(`SELECT COUNT(*) as count FROM api_errors WHERE created_at >= datetime('now', 'start of day')`).get() as { count: number }).count,
    },
  };
}
