import { Request, Response } from 'express';
import { hashIp, recordApiCall, getAIConfig, getSecondaryPreset, recordApiError } from './statsDb';
import { getClientIp } from './utils';

// ── Failover state (in-memory, per IP hash) ──
interface FailoverState {
  consecutiveFailures: number;
  useSecondary: boolean;
}
const failoverMap = new Map<string, FailoverState>();

export function clearFailoverState(ipHash: string): void {
  failoverMap.delete(ipHash);
}

function getFailoverState(ipHash: string): FailoverState {
  let state = failoverMap.get(ipHash);
  if (!state) {
    state = { consecutiveFailures: 0, useSecondary: false };
    failoverMap.set(ipHash, state);
  }
  return state;
}

interface GenerateRequest {
  provider: 'gemini' | 'openai' | 'deepseek' | 'lmstudio';
  apiKey?: string;
  endpoint?: string;
  model?: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: string;
  requestType?: string;
}

type AIRequestType =
  | 'channel_batch'
  | 'channel_reply'
  | 'pm_reply'
  | 'pm_followup'
  | 'pm_summary'
  | 'channel_users'
  | 'random_pm'
  | 'language_detect';

const REQUEST_TOKEN_LIMITS: Record<AIRequestType, number> = {
  channel_batch: 170,
  channel_reply: 160,
  pm_reply: 96,
  pm_followup: 60,
  pm_summary: 140,
  channel_users: 900,
  random_pm: 60,
  language_detect: 90,
};

const VALID_REQUEST_TYPES = new Set<AIRequestType>(Object.keys(REQUEST_TOKEN_LIMITS) as AIRequestType[]);

function normalizeRequestType(requestType?: string): AIRequestType {
  return requestType && VALID_REQUEST_TYPES.has(requestType as AIRequestType)
    ? (requestType as AIRequestType)
    : 'channel_reply';
}

function sanitizeMessages(messages: GenerateRequest['messages']): { role: string; content: string }[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is { role: string; content: string } => !!message && typeof message.role === 'string' && typeof message.content === 'string')
    .slice(-20)
    .map((message) => ({
      role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
      content: message.content.slice(0, 6000),
    }));
}

function clampMaxTokens(requestType: AIRequestType, maxTokens?: number): number {
  const limit = REQUEST_TOKEN_LIMITS[requestType];
  if (typeof maxTokens !== 'number' || Number.isNaN(maxTokens)) return limit;
  return Math.max(16, Math.min(Math.round(maxTokens), limit));
}

export async function handleGenerate(req: Request, res: Response) {
  const body = req.body as GenerateRequest;

  // Determine caller IP for failover tracking
  const rawIp = getClientIp(req);
  const ipHash = hashIp(rawIp);
  const failover = getFailoverState(ipHash);

  // Resolve config: if failover is active, use secondary preset instead of active
  let dbConfig = getAIConfig('active');
  let isFailover = false;
  if (failover.useSecondary) {
    const secondaryName = getSecondaryPreset();
    if (secondaryName) {
      const secondaryConfig = getAIConfig(`preset:${secondaryName}`);
      if (secondaryConfig) {
        dbConfig = secondaryConfig;
        isFailover = true;
      }
    }
  }

  const provider = body.provider || (dbConfig?.provider as 'gemini' | 'openai' | 'deepseek' | 'lmstudio') || 'gemini';
  const apiKey = body.apiKey || dbConfig?.apiKey || '';
  const endpoint = body.endpoint || dbConfig?.lmstudioUrl || '';
  const model = body.model || dbConfig?.model || '';
  const temperature = body.temperature ?? dbConfig?.temperature;
  const reasoningEffort = body.reasoningEffort || dbConfig?.reasoningEffort || undefined;

  const requestType = normalizeRequestType(body.requestType);
  const messages = sanitizeMessages(body.messages);
  const maxTokens = clampMaxTokens(requestType, body.maxTokens);

  if (messages.length === 0) {
    res.status(400).json({ error: 'At least one valid message is required.' });
    return;
  }

  try {
    let result: { text: string; inputTokens: number; outputTokens: number };

    switch (provider) {
      case 'gemini':
        result = await callGemini(apiKey || '', model || 'gemini-pro', messages, maxTokens, temperature, reasoningEffort);
        break;
      case 'openai':
        result = await callOpenAI(apiKey || '', model || 'gpt-3.5-turbo', messages, maxTokens, temperature, reasoningEffort);
        break;
      case 'deepseek':
        result = await callDeepSeek(apiKey || '', model || 'deepseek-chat', messages, maxTokens, temperature, reasoningEffort);
        break;
      case 'lmstudio':
        result = await callLMStudio(endpoint || process.env.LMSTUDIO_URL || 'http://localhost:1234', model || '', messages, maxTokens, temperature);
        break;
      default:
        res.status(400).json({ error: 'Unknown provider' });
        return;
    }

    res.json({ ...result, failover: isFailover });

    // Success — reset consecutive failure counter (but keep useSecondary sticky)
    failover.consecutiveFailures = 0;

    // Record stats asynchronously (non-blocking)
    try {
      recordApiCall(ipHash, rawIp, provider, model || '', requestType, result.inputTokens, result.outputTokens);
    } catch {
      // Stats recording should never break the API response
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const details = err instanceof Error ? (err.stack || err.message) : String(err);
    console.error(`AI generation error (${provider}):`, message);

    // Record error in DB
    try {
      const httpStatus = /API error (\d+)/.exec(message)?.[1];
      recordApiError(ipHash, rawIp, provider, model || '', requestType, message, details, httpStatus ? parseInt(httpStatus, 10) : 0);
    } catch {
      // Error recording should never break the response
    }

    // Track consecutive failures for failover
    failover.consecutiveFailures++;
    if (failover.consecutiveFailures >= 2 && !failover.useSecondary) {
      const secondaryName = getSecondaryPreset();
      if (secondaryName) {
        failover.useSecondary = true;
        console.log(`[failover] IP ${ipHash}: activating secondary preset "${secondaryName}" after ${failover.consecutiveFailures} consecutive failures`);
      }
    }

    res.status(500).json({ error: message, failover: isFailover });
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens?: number,
  temperature?: number,
  reasoningEffort?: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: maxTokens || 150,
    temperature: temperature || 0.9,
  };

  // Map reasoning effort to Gemini thinkingConfig
  if (reasoningEffort) {
    const levelMap: Record<string, string> = {
      none: 'MINIMAL',
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
    };
    const thinkingLevel = levelMap[reasoningEffort.toLowerCase()] || reasoningEffort.toUpperCase();
    generationConfig.thinkingConfig = { thinkingLevel };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const inputTokens: number = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens: number = data.usageMetadata?.candidatesTokenCount ?? 0;
  return { text, inputTokens, outputTokens };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens?: number,
  temperature?: number,
  reasoningEffort?: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const normalizedTemperature = typeof temperature === 'number' && Number.isFinite(temperature)
    ? temperature
    : undefined;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens || 150,
  };

  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  } else if (
    normalizedTemperature !== undefined
    && Math.abs(normalizedTemperature - 1) > 0.0001
    && openAIModelSupportsCustomTemperature(model)
  ) {
    body.temperature = normalizedTemperature;
  }

  let response = await sendOpenAIRequest(apiKey, body);

  if (!response.ok) {
    const errorBody = await response.text();
    if (canRetryOpenAIRequestWithoutTemperature(response.status, errorBody, body)) {
      delete body.temperature;
      response = await sendOpenAIRequest(apiKey, body);
      if (!response.ok) {
        const retryErrorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${retryErrorBody}`);
      }
    } else {
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }
  }

  const data: any = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;
  return { text, inputTokens, outputTokens };
}

function openAIModelSupportsCustomTemperature(model: string): boolean {
  const normalizedModel = model.trim().toLowerCase();
  if (!normalizedModel) return true;
  return !/^gpt-5(?:[.-]|$)/.test(normalizedModel);
}

function canRetryOpenAIRequestWithoutTemperature(
  status: number,
  errorBody: string,
  requestBody: Record<string, unknown>
): boolean {
  if (status !== 400 || requestBody.temperature === undefined) return false;
  return /"param"\s*:\s*"temperature"/i.test(errorBody)
    || /does not support .*temperature/i.test(errorBody)
    || /"code"\s*:\s*"unsupported_value"/i.test(errorBody);
}

function sendOpenAIRequest(apiKey: string, body: Record<string, unknown>): Promise<globalThis.Response> {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
}

async function callDeepSeek(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens?: number,
  temperature?: number,
  reasoningEffort?: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens || 150,
  };
  // deepseek-reasoner doesn't support temperature
  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  } else {
    body.temperature = temperature || 0.9;
  }
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;
  return { text, inputTokens, outputTokens };
}

async function callLMStudio(
  endpoint: string,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens?: number,
  temperature?: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const url = `${endpoint}/v1/chat/completions`;
  const body: Record<string, unknown> = {
    messages,
    max_tokens: maxTokens || 150,
    temperature: temperature || 0.9,
  };
  if (model) body.model = model;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LM Studio API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;
  return { text, inputTokens, outputTokens };
}
