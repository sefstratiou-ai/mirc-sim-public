export type AIRequestType =
  | 'channel_batch'
  | 'channel_reply'
  | 'pm_reply'
  | 'pm_followup'
  | 'pm_summary'
  | 'channel_users'
  | 'random_pm'
  | 'language_detect';

export interface AIGenerateRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  temperature?: number;
  requestType?: AIRequestType;
}

export interface AIGenerateResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  failover?: boolean;
}

export abstract class BaseAIProvider {
  abstract generate(request: AIGenerateRequest): Promise<AIGenerateResponse>;
}

export class GeminiProvider extends BaseAIProvider {
  constructor(
    private apiKey: string,
    private model: string = 'gemini-pro',
    private reasoningEffort?: string
  ) {
    super();
  }

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const body: Record<string, unknown> = {
      provider: 'gemini',
      apiKey: this.apiKey,
      model: this.model,
      messages: request.messages,
      maxTokens: request.maxTokens || 150,
      temperature: request.temperature || 0.9,
      requestType: request.requestType,
    };
    if (this.reasoningEffort) {
      body.reasoningEffort = this.reasoningEffort;
    }
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(135_000),
    });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const data = await response.json();
    return { text: data.text, inputTokens: data.inputTokens ?? 0, outputTokens: data.outputTokens ?? 0, failover: data.failover ?? false };
  }
}

export class OpenAIProvider extends BaseAIProvider {
  constructor(
    private apiKey: string,
    private model: string = 'gpt-3.5-turbo',
    private reasoningEffort?: string
  ) {
    super();
  }

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const body: Record<string, unknown> = {
      provider: 'openai',
      apiKey: this.apiKey,
      model: this.model,
      messages: request.messages,
      maxTokens: request.maxTokens || 150,
      temperature: request.temperature || 0.9,
      requestType: request.requestType,
    };
    if (this.reasoningEffort) {
      body.reasoningEffort = this.reasoningEffort;
    }
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(135_000),
    });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const data = await response.json();
    return { text: data.text, inputTokens: data.inputTokens ?? 0, outputTokens: data.outputTokens ?? 0, failover: data.failover ?? false };
  }
}

export class DeepSeekProvider extends BaseAIProvider {
  constructor(
    private apiKey: string,
    private model: string = 'deepseek-chat',
    private reasoningEffort?: string
  ) {
    super();
  }

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const body: Record<string, unknown> = {
      provider: 'deepseek',
      apiKey: this.apiKey,
      model: this.model,
      messages: request.messages,
      maxTokens: request.maxTokens || 150,
      temperature: request.temperature || 0.9,
      requestType: request.requestType,
    };
    if (this.reasoningEffort) {
      body.reasoningEffort = this.reasoningEffort;
    }
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(135_000),
    });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const data = await response.json();
    return { text: data.text, inputTokens: data.inputTokens ?? 0, outputTokens: data.outputTokens ?? 0, failover: data.failover ?? false };
  }
}

export class LMStudioProvider extends BaseAIProvider {
  constructor(private endpoint: string, private model: string = 'default') {
    super();
  }

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'lmstudio',
        endpoint: this.endpoint,
        model: this.model,
        messages: request.messages,
        maxTokens: request.maxTokens || 150,
        temperature: request.temperature || 0.9,
        requestType: request.requestType,
      }),
      signal: AbortSignal.timeout(135_000),
    });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const data = await response.json();
    return { text: data.text, inputTokens: data.inputTokens ?? 0, outputTokens: data.outputTokens ?? 0, failover: data.failover ?? false };
  }
}

export function createProvider(
  provider: 'gemini' | 'openai' | 'deepseek' | 'lmstudio',
  apiKey: string,
  lmStudioUrl: string,
  model?: string,
  reasoningEffort?: string
): BaseAIProvider {
  switch (provider) {
    case 'gemini':
      return new GeminiProvider(apiKey, model || 'gemini-pro', reasoningEffort);
    case 'openai':
      return new OpenAIProvider(apiKey, model || 'gpt-3.5-turbo', reasoningEffort);
    case 'deepseek':
      return new DeepSeekProvider(apiKey, model || 'deepseek-chat', reasoningEffort);
    case 'lmstudio':
      return new LMStudioProvider(lmStudioUrl, model || 'default');
  }
}
