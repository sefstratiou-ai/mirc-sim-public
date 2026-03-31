import { Router } from 'express';
import { getAIConfig, getAllAIConfigs, upsertAIConfig, AIConfig, getSecondaryPreset, setSecondaryPreset, clearSecondaryPreset } from './statsDb';

const router = Router();

// Broadcast callback — set by index.ts to push config changes via WebSocket
let broadcastConfigChange: ((config: AIConfig) => void) | null = null;

export function setBroadcastConfigChange(fn: (config: AIConfig) => void): void {
  broadcastConfigChange = fn;
}

/** Strip the API key from a config for public consumption. */
function publicConfig(config: AIConfig): Record<string, unknown> {
  return {
    provider: config.provider,
    lmstudioUrl: config.lmstudioUrl,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    temperature: config.temperature,
    hasApiKey: !!config.apiKey,
  };
}

// ── Public endpoint (no auth) ─────────────────────────────────────────
// Clients fetch this on connect to get the active AI config (no API key).
router.get('/api/ai-config', (_req, res) => {
  const config = getAIConfig('active');
  if (!config) {
    res.json({ provider: 'gemini', model: '', lmstudioUrl: '', reasoningEffort: '', temperature: 0.9, hasApiKey: false });
    return;
  }
  res.json(publicConfig(config));
});

// ── Admin endpoints (auth required) ───────────────────────────────────

function checkAdminKey(key: string | undefined, adminStatsKey: string): boolean {
  return !!adminStatsKey && key === adminStatsKey;
}

/** Attach admin config routes. The key is read from env at mount time. */
export function mountAdminConfigRoutes(app: ReturnType<typeof Router>, adminStatsKey: string): void {
  // GET all configs (admin)
  app.get('/admin/ai-config', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const configs = getAllAIConfigs();
    // Mask API keys — send last 6 chars only
    const masked = configs.map(c => ({
      ...c,
      apiKey: c.apiKey ? `***${c.apiKey.slice(-6)}` : '',
    }));
    res.json(masked);
  });

  // POST save active config
  app.post('/admin/ai-config', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const { provider, apiKey, lmstudioUrl, model, reasoningEffort, temperature } = req.body;
    if (!provider) { res.status(400).json({ error: 'provider is required' }); return; }

    upsertAIConfig('active', {
      provider,
      apiKey: apiKey || '',
      lmstudioUrl: lmstudioUrl || '',
      model: model || '',
      reasoningEffort: reasoningEffort || '',
      temperature: typeof temperature === 'number' ? temperature : 0.9,
    });

    const updated = getAIConfig('active')!;
    if (broadcastConfigChange) broadcastConfigChange(updated);
    res.json({ ok: true });
  });

  // POST apply preset → active
  app.post('/admin/ai-config/apply-preset', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const { preset } = req.body as { preset: string };
    const presetName = `preset:${preset}`;
    const presetConfig = getAIConfig(presetName);
    if (!presetConfig) { res.status(404).json({ error: `Preset '${preset}' not found` }); return; }

    upsertAIConfig('active', {
      provider: presetConfig.provider,
      apiKey: presetConfig.apiKey,
      lmstudioUrl: presetConfig.lmstudioUrl,
      model: presetConfig.model,
      reasoningEffort: presetConfig.reasoningEffort,
      temperature: presetConfig.temperature,
    });

    const updated = getAIConfig('active')!;
    if (broadcastConfigChange) broadcastConfigChange(updated);
    res.json({ ok: true });
  });

  // POST save a preset
  app.post('/admin/ai-config/save-preset', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const { preset, config } = req.body as { preset: string; config: Omit<AIConfig, 'name'> };
    const presetName = `preset:${preset}`;
    if (!preset || !config || !config.provider) {
      res.status(400).json({ error: 'preset and config.provider are required' });
      return;
    }

    const existingConfig = getAIConfig(presetName);
    const nextApiKey = typeof config.apiKey === 'string'
      ? (config.apiKey.trim() ? config.apiKey : existingConfig?.apiKey || '')
      : existingConfig?.apiKey || '';

    upsertAIConfig(presetName, {
      provider: config.provider,
      apiKey: nextApiKey,
      lmstudioUrl: config.lmstudioUrl || '',
      model: config.model || '',
      reasoningEffort: config.reasoningEffort || '',
      temperature: typeof config.temperature === 'number' ? config.temperature : 0.9,
    });
    res.json({ ok: true });
  });

  // GET secondary preset
  app.get('/admin/ai-config/secondary', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const preset = getSecondaryPreset();
    res.json({ preset: preset || null });
  });

  // POST set secondary preset
  app.post('/admin/ai-config/secondary', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const { preset } = req.body as { preset: string };
    if (!preset) { res.status(400).json({ error: 'preset is required' }); return; }
    // Verify preset exists
    const presetConfig = getAIConfig(`preset:${preset}`);
    if (!presetConfig) { res.status(404).json({ error: `Preset '${preset}' not found` }); return; }
    setSecondaryPreset(preset);
    res.json({ ok: true });
  });

  // POST clear secondary preset
  app.post('/admin/ai-config/clear-secondary', (req, res) => {
    const key = req.query.key as string | undefined;
    if (!checkAdminKey(key, adminStatsKey)) { res.status(403).json({ error: 'Forbidden' }); return; }
    clearSecondaryPreset();
    res.json({ ok: true });
  });
}

export default router;
