import { AIRequestType, BaseAIProvider } from './AIProvider';
import { PersonaManager } from './PersonaManager';
import { AIPersona, IRCMessage, IRCChannel, IRCUser } from '../types/irc';
import { createMessage } from '../engine/IRCSimulator';

// ---------------------------------------------------------------------------
// Shared static prompt prefix (≥1024 tokens) — placed at the start of every
// system message so that OpenAI's automatic prompt-caching can reuse it across
// requests.  All dynamic content (channel, personas, topic, language) is
// appended AFTER this block.
// ---------------------------------------------------------------------------
const IRC_SIMULATION_RULES = `You are an AI conversation simulator for a late-1990s / early-2000s Internet Relay Chat (IRC) environment. Your purpose is to impersonate realistic IRC users who are chatting in real-time inside mIRC-style clients. Every single message you generate must be completely indistinguishable from what a real human would type in an IRC channel or private message window during 1997-2003.

CORE PERSONALITY & STYLE RULES (apply to ALL messages you generate):
1. Casual register — write the way real people type in IRC, not the way people write essays. Use sentence fragments, slang, filler words, and incomplete thoughts freely.
2. Lowercase start — ALWAYS begin every sentence with a lowercase letter. Nobody capitalizes on IRC unless they are shouting.
3. Minimal punctuation — skip periods at the end of sentences. Use commas sparingly. Exclamation marks and question marks are okay but not in excess (one is enough, never "!!!" or "???").
4. NO modern emoji — absolutely no Unicode emoji (no 😀🔥👍 etc.). Only use old-school 90s-era text smileys: :) :( ;) :P :D :/ :o >:) ^_^ =) and similar ASCII art faces.
5. No quotation marks wrapping your own messages — never put your response inside quotes.
6. No nick prefix — never start a message with your own nick followed by a colon. Just write the message text.
7. Short messages — keep each message to 1-2 sentences maximum. IRC messages are quick, punchy, and conversational. Walls of text are unrealistic.
8. No AI tells — never reference being an AI, a language model, tokens, prompts, or anything that breaks the IRC illusion. You are a real person.
9. Typos & informality — occasional light typos, abbreviations (u, ur, lol, brb, omg, wtf, afk, bbl, np, thx, dunno, gonna, wanna, kinda, gotta, tho, cuz), and internet slang are encouraged. Don't overdo it — be natural.
10. When generating multiple speakers in a batch, format each line as: <nick> message — with angle brackets around the nick.
11. Batch coherence — when generating a multi-message exchange, each successive message MUST respond to, react to, or build on the previous one. Do NOT have multiple people say the same thing (e.g. all greeting or all asking the same question). Vary message types: opinions, questions, jokes, anecdotes, reactions, disagreements, tangents.
12. IRC /me actions — if a persona performs an action, format it as: <nick> * nick does something (or start with /me). Actions should be rare and natural.
13. Persona fidelity — honour each persona's described personality, quirks, typing speed style, and interests. A "goth poetry" persona and a "skater dude" persona should sound completely different.
14. Language obedience — when a language instruction is provided, ALL messages MUST be in that language. Use the specified dialect, character set, and internet abbreviations appropriate for that language's IRC culture.

PRIVATE MESSAGE RULES (apply when simulating DMs):
15. PM memory — when provided with conversation history or memory summaries, weave them in naturally. Reference shared history without explicitly saying "I remember from last time". Be organic.
16. PM engagement — show genuine interest. Ask follow-up questions, react to what the user says, share relevant personal anecdotes from your persona's perspective.
17. PM boundaries — stay in character. Bots (ChanServ, NickServ, etc.) never reply to DMs.

CHANNEL RULES (apply when simulating channel conversation):
18. Topic relevance — channel messages should relate to the channel topic or whatever the current conversation thread is, but tangents are natural and welcome.
19. Only ONE person may greet at most — the rest must say substantive things.
20. Do NOT include timestamps or anything other than <nick> message format.

This completes the universal IRC simulation ruleset.
---
`;

// --- Per-client persistent PM memory via localStorage ---

function getClientId(): string {
  const key = 'mirc-sim-client-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export class PMMemoryStore {
  private static clientId = getClientId();

  private static storageKey(nick: string): string {
    return `mirc-pm-mem-${this.clientId}-${nick.toLowerCase()}`;
  }

  static getMemory(nick: string): string | null {
    return localStorage.getItem(this.storageKey(nick)) || null;
  }

  static setMemory(nick: string, summary: string): void {
    localStorage.setItem(this.storageKey(nick), summary);
  }

  static clearMemory(nick: string): void {
    localStorage.removeItem(this.storageKey(nick));
  }

  static clearAll(): void {
    const prefix = `mirc-pm-mem-${this.clientId}-`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

export function createEmptyTokenBreakdown(): Record<AIRequestType, { inputTokens: number; outputTokens: number; calls: number }> {
  return {
    channel_batch: { inputTokens: 0, outputTokens: 0, calls: 0 },
    channel_reply: { inputTokens: 0, outputTokens: 0, calls: 0 },
    pm_reply: { inputTokens: 0, outputTokens: 0, calls: 0 },
    pm_followup: { inputTokens: 0, outputTokens: 0, calls: 0 },
    pm_summary: { inputTokens: 0, outputTokens: 0, calls: 0 },
    channel_users: { inputTokens: 0, outputTokens: 0, calls: 0 },
    random_pm: { inputTokens: 0, outputTokens: 0, calls: 0 },
    language_detect: { inputTokens: 0, outputTokens: 0, calls: 0 },
  };
}

export class TokenStatsStore {
  private static readonly KEY = `mirc-token-stats-${getClientId()}`;

  private static normalizeBreakdown(
    breakdown: unknown
  ): Record<AIRequestType, { inputTokens: number; outputTokens: number; calls: number }> {
    const normalized = createEmptyTokenBreakdown();
    if (!breakdown || typeof breakdown !== 'object') return normalized;
    for (const requestType of Object.keys(normalized) as AIRequestType[]) {
      const rawEntry = (breakdown as Record<string, unknown>)[requestType];
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as Record<string, unknown>;
      normalized[requestType] = {
        inputTokens: Number(entry.inputTokens) || 0,
        outputTokens: Number(entry.outputTokens) || 0,
        calls: Number(entry.calls) || 0,
      };
    }
    return normalized;
  }

  static get(): {
    inputTokens: number;
    outputTokens: number;
    byType: Record<AIRequestType, { inputTokens: number; outputTokens: number; calls: number }>;
  } {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          inputTokens: parsed.inputTokens || 0,
          outputTokens: parsed.outputTokens || 0,
          byType: this.normalizeBreakdown(parsed.byType),
        };
      }
    } catch { /* ignore corrupt data */ }
    return { inputTokens: 0, outputTokens: 0, byType: createEmptyTokenBreakdown() };
  }

  static add(requestType: AIRequestType, inputTokens: number, outputTokens: number): void {
    const current = this.get();
    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.byType[requestType].inputTokens += inputTokens;
    current.byType[requestType].outputTokens += outputTokens;
    current.byType[requestType].calls += 1;
    localStorage.setItem(this.KEY, JSON.stringify(current));
  }

  static reset(): void {
    localStorage.removeItem(this.KEY);
  }
}

export class ChannelLanguageStore {
  private static readonly TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static clientId = getClientId();

  private static storageKey(channel: string): string {
    return `mirc-language-${this.clientId}-${channel.toLowerCase()}`;
  }

  static get(channel: string): { primary: string; instruction: string } | null {
    try {
      const raw = localStorage.getItem(this.storageKey(channel));
      if (!raw) return null;
      const data = JSON.parse(raw) as {
        primary: string;
        instruction: string;
        timestamp: number;
      };
      if (Date.now() - data.timestamp > this.TTL) {
        localStorage.removeItem(this.storageKey(channel));
        return null;
      }
      if (!data.primary || !data.instruction) return null;
      return { primary: data.primary, instruction: data.instruction };
    } catch {
      return null;
    }
  }

  static set(channel: string, value: { primary: string; instruction: string }): void {
    localStorage.setItem(this.storageKey(channel), JSON.stringify({ ...value, timestamp: Date.now() }));
  }
}

type TokenBreakdown = Record<AIRequestType, { inputTokens: number; outputTokens: number; calls: number }>;

export class TopicStore {
  private static readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private static clientId = getClientId();

  private static storageKey(channel: string): string {
    return `mirc-topic-${this.clientId}-${channel.toLowerCase()}`;
  }

  static get(channel: string): string | null {
    try {
      const raw = localStorage.getItem(this.storageKey(channel));
      if (!raw) return null;
      const { topic, timestamp } = JSON.parse(raw) as { topic: string; timestamp: number };
      if (Date.now() - timestamp > this.TTL) {
        localStorage.removeItem(this.storageKey(channel));
        return null;
      }
      return topic;
    } catch {
      return null;
    }
  }

  static set(channel: string, topic: string): void {
    localStorage.setItem(this.storageKey(channel), JSON.stringify({ topic, timestamp: Date.now() }));
  }
}

export class ChannelUserStore {
  private static readonly TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static clientId = getClientId();

  private static storageKey(channel: string): string {
    return `mirc-chanusers-${this.clientId}-${channel.toLowerCase()}`;
  }

  static get(channel: string): Array<{ nick: string; mode: string; sex?: 'male' | 'female' | 'unknown' }> | null {
    try {
      const raw = localStorage.getItem(this.storageKey(channel));
      if (!raw) return null;
      const { users, timestamp } = JSON.parse(raw) as {
        users: Array<{ nick: string; mode: string; sex?: 'male' | 'female' | 'unknown' }>;
        timestamp: number;
      };
      if (Date.now() - timestamp > this.TTL) {
        localStorage.removeItem(this.storageKey(channel));
        return null;
      }
      return users;
    } catch {
      return null;
    }
  }

  static set(channel: string, users: Array<{ nick: string; mode: string; sex?: 'male' | 'female' | 'unknown' }>): void {
    localStorage.setItem(this.storageKey(channel), JSON.stringify({ users, timestamp: Date.now() }));
  }
}

export class ConversationEngine {
  private provider: BaseAIProvider | null = null;
  private personaManager: PersonaManager;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onMessage: ((channel: string, message: IRCMessage) => void) | null = null;
  private onUserJoin: ((channel: string, nick: string) => void) | null = null;
  private onUserPart: ((channel: string, nick: string, message: string) => void) | null = null;
  private onUserQuit: ((nick: string, message: string) => void) | null = null;
  private onPrivateMessage: ((nick: string, message: IRCMessage) => void) | null = null;
  private pmHistory: Map<string, { role: string; content: string }[]> = new Map();
  private pmChannelContext: Map<string, string> = new Map(); // nick.lower → channel
  private activeChannels: Set<string> = new Set();
  private userNick: string = '';
  private channelLanguageCache: Map<string, { primary: string; instruction: string }> = new Map();
  private channelReserveNicks: Map<string, Array<{ nick: string; sex?: 'male' | 'female' | 'unknown' }>> = new Map();
  private baseTemperature: number = 0.9;
  private tokenStats: { inputTokens: number; outputTokens: number; byType: TokenBreakdown } = {
    inputTokens: 0,
    outputTokens: 0,
    byType: createEmptyTokenBreakdown(),
  };
  private _paused = false;
  private verboseLogHandler: ((message: string) => void) | null = null;
  private failoverNotifyHandler: (() => void) | null = null;
  private failoverNotified = false;

  private static readonly RECENT_CONTEXT_MESSAGES = 8;
  private static readonly RECENT_CONTEXT_CHARS = 700;
  private static readonly PM_HISTORY_LIMIT = 8;
  private static readonly PM_CONTEXT_TURNS = 6;

  constructor() {
    this.personaManager = new PersonaManager();
  }

  setProvider(provider: BaseAIProvider) {
    this.provider = provider;
  }

  getTokenStats(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    return {
      inputTokens: this.tokenStats.inputTokens,
      outputTokens: this.tokenStats.outputTokens,
      totalTokens: this.tokenStats.inputTokens + this.tokenStats.outputTokens,
    };
  }

  getTokenBreakdown(): TokenBreakdown {
    return this.tokenStats.byType;
  }

  getCumulativeTokenStats(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    const c = TokenStatsStore.get();
    return { inputTokens: c.inputTokens, outputTokens: c.outputTokens, totalTokens: c.inputTokens + c.outputTokens };
  }

  getCumulativeTokenBreakdown(): TokenBreakdown {
    return TokenStatsStore.get().byType;
  }

  resetTokenStats() {
    this.tokenStats = { inputTokens: 0, outputTokens: 0, byType: createEmptyTokenBreakdown() };
  }

  resetCumulativeTokenStats() {
    TokenStatsStore.reset();
  }

  setBaseTemperature(temperature: number) {
    this.baseTemperature = temperature;
  }

  private getRequestTemperature(preferredTemperature: number): number {
    const providerInfo = this.getProviderInfo();
    if (providerInfo?.provider === 'openai') {
      return this.baseTemperature;
    }
    return preferredTemperature;
  }

  private getRetryTemperature(attempt: number): number {
    if (attempt === 0) return this.baseTemperature;

    const providerInfo = this.getProviderInfo();
    if (providerInfo?.provider === 'openai') {
      return this.baseTemperature;
    }

    return Math.max(0.2, this.baseTemperature - 0.3);
  }

  private async reportClientAIError(
    requestType: AIRequestType,
    errorMessage: string,
    errorDetails: string,
    httpStatus: number = 0
  ): Promise<void> {
    const providerInfo = this.getProviderInfo();

    try {
      await fetch('/api/client-ai-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerInfo?.provider || '',
          model: providerInfo?.model || '',
          requestType,
          errorMessage,
          errorDetails,
          httpStatus,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Client-side error reporting should never break generation fallbacks.
    }
  }

  private accumulateTokens(requestType: AIRequestType, inputTokens: number, outputTokens: number, failover?: boolean) {
    this.tokenStats.inputTokens += inputTokens;
    this.tokenStats.outputTokens += outputTokens;
    this.tokenStats.byType[requestType].inputTokens += inputTokens;
    this.tokenStats.byType[requestType].outputTokens += outputTokens;
    this.tokenStats.byType[requestType].calls += 1;
    TokenStatsStore.add(requestType, inputTokens, outputTokens);
    this.verboseLog(`[AI] ${requestType}: ${inputTokens} in / ${outputTokens} out tokens${failover ? ' [FAILOVER]' : ''}`);
    if (failover && this.failoverNotifyHandler) {
      this.failoverNotifyHandler();
    }
  }

  private buildRecentChatContext(channelData: IRCChannel): string {
    const chatMessages = channelData.messages
      .filter((m) => m.type === 'message' || m.type === 'action')
      .slice(-ConversationEngine.RECENT_CONTEXT_MESSAGES);

    const lines: string[] = [];
    let totalChars = 0;
    for (let index = chatMessages.length - 1; index >= 0; index--) {
      const message = chatMessages[index];
      const line = `<${message.nick ?? 'unknown'}> ${message.content}`;
      if (lines.length > 0 && totalChars + line.length > ConversationEngine.RECENT_CONTEXT_CHARS) break;
      lines.unshift(line);
      totalChars += line.length;
    }

    return lines.join('\n');
  }

  private getPMContextHistory(history: { role: string; content: string }[]): { role: 'user' | 'assistant'; content: string }[] {
    return history.slice(-ConversationEngine.PM_CONTEXT_TURNS).map((entry) => ({
      role: (entry.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: entry.content,
    }));
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizePrivateMessageText(text: string, nick: string): string {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;

    const nickPattern = this.escapeRegExp(nick);
    const prefixPatterns = [
      new RegExp(`^<${nickPattern}>\\s*`, 'i'),
      new RegExp(`^${nickPattern}:\\s*`, 'i'),
      new RegExp(`^${nickPattern}>\\s*`, 'i'),
    ];

    let normalized = trimmed;
    for (const pattern of prefixPatterns) {
      normalized = normalized.replace(pattern, '');
    }

    return normalized.trim() || trimmed;
  }

  private setResolvedChannelLanguage(channel: string, value: { primary: string; instruction: string }): void {
    const key = channel.toLowerCase();
    this.channelLanguageCache.set(key, value);
    ChannelLanguageStore.set(channel, value);
  }

  private inferLanguageFromScript(channel: string, topic?: string): { primary: string; instruction: string } | null {
    const sample = `${channel} ${topic || ''}`;
    if (/[\u0370-\u03ff]/.test(sample)) {
      return { primary: 'Greek', instruction: 'Write in Greek using either Greek characters (Ελληνικά) OR Greeklish. Casual IRC style.' };
    }
    if (/[\u0400-\u04ff]/.test(sample)) {
      return { primary: 'Russian', instruction: 'Write in Russian (русский) using Cyrillic. Casual IRC style.' };
    }
    if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(sample)) {
      return { primary: 'Japanese', instruction: 'Write in Japanese (日本語). Casual style.' };
    }
    if (/[\u4e00-\u9fff]/.test(sample)) {
      return { primary: 'Chinese', instruction: 'Write in Chinese (中文). Casual style with simplified characters.' };
    }
    if (/[\uac00-\ud7af]/.test(sample)) {
      return { primary: 'Korean', instruction: 'Write in Korean (한국어) using Hangul. Casual style with Korean internet expressions like "ㅋㅋ" and "ㅠㅠ".' };
    }
    if (/[\u0600-\u06ff]/.test(sample)) {
      return { primary: 'Arabic', instruction: 'Write in Arabic (العربية) or Arabizi. Casual IRC style.' };
    }
    return null;
  }

  /** Pause / resume background AI generation (e.g. when the browser tab is hidden). */
  setPaused(paused: boolean) { this._paused = paused; }
  get paused() { return this._paused; }

  setVerboseLogHandler(handler: ((message: string) => void) | null) {
    this.verboseLogHandler = handler;
  }

  setFailoverNotifyHandler(handler: ((message: string) => void) | null) {
    this.failoverNotifyHandler = handler ? () => {
      if (!this.failoverNotified) {
        this.failoverNotified = true;
        handler('* [Failover] Primary AI configuration failed. Switched to secondary preset for this session.');
      }
    } : null;
  }

  private verboseLog(message: string) {
    if (this.verboseLogHandler) this.verboseLogHandler(message);
  }

  getProviderInfo(): { provider: string; model: string; temperature: number } | null {
    if (!this.provider) return null;
    // Extract info from the provider instance
    const p = this.provider as unknown as Record<string, unknown>;
    const providerType =
      p.constructor?.name?.replace('Provider', '').toLowerCase() || 'unknown';
    // Provider classes store model/apiKey as private fields but we can read from JSON body pattern
    return {
      provider: providerType,
      model: (p['model'] as string) || '',
      temperature: this.baseTemperature,
    };
  }

  getPersonaManager(): PersonaManager {
    return this.personaManager;
  }

  setMessageHandler(handler: (channel: string, message: IRCMessage) => void) {
    this.onMessage = handler;
  }

  setUserJoinHandler(handler: (channel: string, nick: string) => void) {
    this.onUserJoin = handler;
  }

  setUserPartHandler(handler: (channel: string, nick: string, message: string) => void) {
    this.onUserPart = handler;
  }

  setUserQuitHandler(handler: (nick: string, message: string) => void) {
    this.onUserQuit = handler;
  }

  setPrivateMessageHandler(handler: (nick: string, message: IRCMessage) => void) {
    this.onPrivateMessage = handler;
  }

  setUserNick(nick: string) {
    this.userNick = nick;
  }

  registerPMFromChannel(nick: string, channel: string) {
    this.pmChannelContext.set(nick.toLowerCase(), channel);
    this.personaManager.ensurePersonaForNick(nick, channel);
  }

  private isNickProtectedFromChannelDeparture(channel: string, nick: string): boolean {
    const key = nick.toLowerCase();
    const pmChannel = this.pmChannelContext.get(key);
    const history = this.pmHistory.get(key);
    return pmChannel?.toLowerCase() === channel.toLowerCase() && !!history && history.length > 0;
  }

  startChannelActivity(channel: string, getChannelData: () => IRCChannel) {
    this.stopChannelActivity(channel);
    this.activeChannels.add(channel.toLowerCase());

    // Kick off async language resolution — populates cache before first message is sent
    this.resolveChannelLanguage(channel, getChannelData().topic);

    const key = channel.toLowerCase();
    const scheduleNext = () => {
      const delay = 15000 + Math.random() * 30000; // 15-45 seconds between batches
      const timer = setTimeout(async () => {
        if (!this.activeChannels.has(key)) return;
        if (this._paused) { scheduleNext(); return; } // skip generation while paused
        await this.generateChannelBatch(channel, getChannelData);
        if (this.activeChannels.has(key)) scheduleNext();
      }, delay);
      this.timers.set(key, timer);
    };

    // Start with a small delay
    setTimeout(() => {
      if (this.activeChannels.has(key)) scheduleNext();
    }, 2000 + Math.random() * 5000);

    // Schedule occasional join/parts
    this.scheduleJoinPart(channel);

    // Start random PM timer if not already running
    if (!this.timers.has('random-pm')) {
      this.scheduleRandomPM();
    }
  }

  stopChannelActivity(channel: string) {
    const key = channel.toLowerCase();
    this.activeChannels.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    const jpTimer = this.timers.get(`${key}-jp`);
    if (jpTimer) {
      clearTimeout(jpTimer);
      this.timers.delete(`${key}-jp`);
    }
  }

  /** Full cleanup when permanently leaving a channel (close/part). */
  cleanupChannel(channel: string) {
    this.stopChannelActivity(channel);
    const key = channel.toLowerCase();
    this.channelLanguageCache.delete(key);
    this.channelReserveNicks.delete(key);
    this.personaManager.removeChannelPersonas(channel);
  }

  stopAll() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.activeChannels.clear();
    this.pmHistory.clear();
    this.channelLanguageCache.clear();
    // Note: tokenStats intentionally NOT cleared here — persists for the whole session.
  }

  private scheduleRandomPM() {
    const delay = (15 + Math.random() * 5) * 60 * 1000; // 15–20 minutes
    const t = setTimeout(async () => {
      if (this.activeChannels.size === 0 || !this.userNick) {
        this.scheduleRandomPM();
        return;
      }
      const channels = Array.from(this.activeChannels);
      const channel = channels[Math.floor(Math.random() * channels.length)];
      const personas = this.personaManager.getChannelPersonas(channel);
      if (personas.length > 0) {
        const nonBotPersonas = personas.filter((p) => !p.isBot);
        if (nonBotPersonas.length === 0) { this.scheduleRandomPM(); return; }
        const persona = nonBotPersonas[Math.floor(Math.random() * nonBotPersonas.length)];
        this.registerPMFromChannel(persona.nick, channel);
        const lang = this.getChannelLanguage(channel);
        let text = '';
        if (this.provider) {
          try {
            const res = await this.provider.generate({
              messages: [
                {
                  role: 'system',
                  content:
                    IRC_SIMULATION_RULES +
                    `CONTEXT: You are "${persona.nick}" initiating a private message with ${this.userNick}, a stranger.\n` +
                    `LANGUAGE: ${lang.instruction} Write in ${lang.primary}.\n` +
                    `Write a very short casual opening line (1 sentence). Just the message text.`,
                },
                { role: 'user', content: `Start a private message to ${this.userNick} as ${persona.nick}:` },
              ],
              maxTokens: 60,
              temperature: this.baseTemperature,
              requestType: 'random_pm',
            });
            this.accumulateTokens('random_pm', res.inputTokens, res.outputTokens, res.failover);
            text = this.normalizePrivateMessageText(res.text, persona.nick);
          } catch (err) {
            this.verboseLog(`[AI] random_pm FAILED: ${err instanceof Error ? err.message : err}`);
          }
        }
        if (!text) {
          const fallbacks = ['hey', 'yo', 'hi there', 'psst', 'hey u'];
          text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
        if (this.onPrivateMessage) {
          this.onPrivateMessage(persona.nick, createMessage('message', text, persona.nick));
        }
      }
      this.scheduleRandomPM();
    }, delay);
    this.timers.set('random-pm', t);
  }

  private scheduleJoinPart(channel: string) {
    const key = `${channel.toLowerCase()}-jp`;
    const doJoinPart = () => {
      const delay = 15000 + Math.random() * 45000; // 15-60 seconds
      const timer = setTimeout(() => {
        if (Math.random() < 0.5) {
          // Simulate a join — prefer reserve nicks generated by LLM for this channel
          const key = channel.toLowerCase();
          const reserve = this.channelReserveNicks.get(key) || [];
          const currentNicks = new Set(
            this.personaManager.getChannelPersonas(channel).map((p) => p.nick.toLowerCase())
          );
          // Find the first reserve nick not already in the channel
          const reserveIdx = reserve.findIndex((entry) => !currentNicks.has(entry.nick.toLowerCase()));
          let nick: string;
          let sex: 'male' | 'female' | 'unknown' = 'unknown';
          if (reserveIdx !== -1) {
            nick = reserve[reserveIdx].nick;
            sex = reserve[reserveIdx].sex || 'unknown';
            reserve.splice(reserveIdx, 1); // consume it
          } else {
            // Fallback pool when reserve is exhausted
            const nickPool = [
              'dave_22', '[tom]', 'jenny_', 'sweetgirl', 'Viper', 'sk8erdude',
              '|Shadow|', 'chris99', '_tina_', 'DaRkAnGeL', 'mike|away', 'l33t',
              'badboy_', '^sarah^', 'Blaze', 'n00b_', 'jen|work', 'Raven',
              'kewl_kat', 'SiLvEr', '~maria~', 'ph34r', 'storm_', 'dave_zZz',
              'Acid_', 'cool_dude', 'xX_Dark_Xx', '[kat]', 'joe_21', 'hotchick22',
              'Wraith', '_kim_', 'sam99', 'angel_', 'Nomad', '|frost|',
              'h4x0r', 'babe_', 'richie_', 'luna_22', '^nick^', 'Shade',
              'punk_', 'dude_99', '~alex~', 'Ice_', 'matt_', '[lisa]',
              'Exile', '_rob_', 'fire_', 'Hawk', 'sk8rgrl', 'Phantom',
            ];
            // Pick one not already in channel
            const available = nickPool.filter((n) => !currentNicks.has(n.toLowerCase()));
            nick = available.length > 0
              ? available[Math.floor(Math.random() * available.length)]
              : nickPool[Math.floor(Math.random() * nickPool.length)];
          }
          this.personaManager.ensurePersonaForNick(nick, channel, sex);
          if (this.onUserJoin) this.onUserJoin(channel, nick);
        } else {
          // Simulate a part/quit
          const personas = this.personaManager
            .getChannelPersonas(channel)
            .filter((persona) => !persona.isBot && !this.isNickProtectedFromChannelDeparture(channel, persona.nick));
          if (personas.length > 3) {
            const leaver = personas[Math.floor(Math.random() * personas.length)];
            const quitMessages = [
              'Client Quit', 'Leaving', 'Ping timeout: 240 seconds',
              'Connection reset by peer', 'Quit: Gone', 'brb',
              'Read error: Connection reset by peer', 'Excess Flood',
            ];
            const msg = quitMessages[Math.floor(Math.random() * quitMessages.length)];
            if (Math.random() < 0.5 && this.onUserPart) {
              this.personaManager.removePersonaFromChannel(channel, leaver.nick);
              this.onUserPart(channel, leaver.nick, msg);
            } else if (this.onUserQuit) {
              this.personaManager.removePersonaFromAllChannels(leaver.nick);
              this.onUserQuit(leaver.nick, msg);
            }
          }
        }
        doJoinPart();
      }, delay);
      this.timers.set(key, timer);
    };
    doJoinPart();
  }

  private async generateChannelBatch(channel: string, getChannelData: () => IRCChannel) {
    const key = channel.toLowerCase();
    if (!this.activeChannels.has(key)) return;
    const channelData = getChannelData();

    if (this.provider) {
      try {
        const lang = this.getChannelLanguage(channel);
        const recentMessages = this.buildRecentChatContext(channelData);

        // Pick 3-4 personas per batch (fewer, larger batches = fewer API calls)
        const batchSize = 3 + Math.floor(Math.random() * 2);
        const speakers: AIPersona[] = [];
        for (let i = 0; i < batchSize; i++) {
          const p = this.personaManager.selectSpeaker(channel);
          if (p && !speakers.find((s) => s.nick === p.nick)) speakers.push(p);
        }
        if (speakers.length === 0) return;

        const speakerList = speakers.map((s) => `- ${s.nick}: ${s.personality}`).join('\n');
        const speakerNicks = speakers.map((s) => s.nick).join(', ');

        const result = await this.provider.generate({
          messages: [
            {
              role: 'system',
              content:
                IRC_SIMULATION_RULES +
                `CHANNEL BATCH TASK: Generate a realistic chat exchange in ${channel}.\n` +
                `Speakers:\n${speakerList}\n` +
                `Topic: ${channelData.topic || 'general chat'}.\n` +
                `LANGUAGE: ${lang.instruction} ALL messages MUST be in ${lang.primary}.\n` +
                `Generate exactly ${speakers.length} messages, one per speaker: ${speakerNicks}.\n` +
                `IMPORTANT: Do NOT generate greetings, "hey everyone", "how is everyone", or "just joined" messages. These users are ALREADY in the channel and have been chatting. Jump straight into substance.`,
            },
            {
              role: 'user',
              content: recentMessages
                ? Math.random() < 0.5
                  // Continue existing thread — anchor on the last 2-3 messages
                  ? `Recent chat:\n${recentMessages}\n\nCONTINUE the conversation above. Directly reply to or build on the LAST 2-3 messages. Do NOT greet, do NOT introduce yourself, do NOT act like you just arrived. Pick up mid-conversation.`
                  // Start a fresh tangent — but still aware of context
                  : `Recent chat:\n${recentMessages}\n\nBring up a NEW topic or tangent — something one of the speakers would naturally say. Do NOT greet or say hi. Do NOT repeat what was already discussed. Just shift to something fresh.`
                : `Start a natural conversation about "${channel || 'something general'}". Have ${speakers[0].nick} open with something interesting and the others react:`,
            },
          ],
          maxTokens: 170,
          temperature: this.baseTemperature,
          requestType: 'channel_batch',
        });
        this.accumulateTokens('channel_batch', result.inputTokens, result.outputTokens, result.failover);

        if (!this.activeChannels.has(key)) return;

        // Parse the batch response into individual messages
        const lines = result.text.trim().split('\n').filter((l) => l.trim());
        const parsed: { nick: string; text: string }[] = [];
        for (const line of lines) {
          const match = line.match(/^<([^>]+)>\s*(.+)$/);
          if (match) {
            parsed.push({ nick: match[1], text: match[2].trim() });
          }
        }

        // Dispatch messages with staggered delays to look natural
        for (let i = 0; i < parsed.length; i++) {
          const { nick, text } = parsed[i];
          if (!text || !this.activeChannels.has(key)) break;
          const delay = i * (6000 + Math.random() * 1000);
          setTimeout(() => {
            if (!this.activeChannels.has(key) || !this.onMessage) return;
            if (text.startsWith('*') || text.toLowerCase().startsWith('/me ')) {
              const actionText = text.replace(/^\*\s*/, '').replace(/^\/me\s*/i, '');
              this.onMessage(channel, createMessage('action', `* ${nick} ${actionText}`, nick, channel));
            } else {
              this.onMessage(channel, createMessage('message', text, nick, channel));
            }
          }, delay);
        }
      } catch (err) {
        this.verboseLog(`[AI] channel_batch FAILED: ${err instanceof Error ? err.message : err}`);
        // Fallback: single message from a random persona
        const persona = this.personaManager.selectSpeaker(channel);
        if (persona && this.activeChannels.has(key)) this.generateFallbackMessage(channel, persona);
      }
    } else {
      const persona = this.personaManager.selectSpeaker(channel);
      if (persona && this.activeChannels.has(key)) this.generateFallbackMessage(channel, persona);
    }
  }

  private generateFallbackMessage(channel: string, persona: AIPersona) {
    const messages = this.getFallbackMessages(persona);
    const text = messages[Math.floor(Math.random() * messages.length)];
    if (this.onMessage) {
      this.onMessage(
        channel,
        createMessage('message', text, persona.nick, channel)
      );
    }
  }

  private getFallbackMessages(persona: AIPersona): string[] {
    // Generic per-personality fallback messages
    const generic = [
      'hey everyone',
      'whats up',
      'anyone around?',
      'lol',
      'haha nice',
      'agreed',
      'yeah totally',
      'brb',
      'back',
      'nothing much here',
      'anyone want to chat?',
      'this channel is quiet today',
      'sup',
      'hi all',
      'any news?',
      ':)',
      'heh',
      'true true',
      'interesting',
      'i see',
    ];

    const personalityMap: Record<string, string[]> = {
      fast: ['lol', 'rofl', 'haha', 'omg', 'yeah!!', 'totally!', 'so true lol', 'hehe xD'],
      slow: [
        'Hmm, interesting thought.',
        'I was just thinking about that.',
        'Indeed.',
        'Let me consider that.',
        'That reminds me of something...',
      ],
    };

    const speed = personalityMap[persona.typingSpeed] || [];
    return [...generic, ...speed];
  }

  /**
   * Synchronous read — returns cached result or English while async resolution is in flight.
   */
  private getChannelLanguage(channel: string): { primary: string; instruction: string } {
      return (
      this.channelLanguageCache.get(channel.toLowerCase()) ??
      ChannelLanguageStore.get(channel) ??
      { primary: 'English', instruction: 'Write in English. Casual IRC style.' }
    );
  }

  /**
   * Known-language regex table.  Returns null for unrecognised channels.
   */
  private matchKnownLanguage(channel: string): { primary: string; instruction: string } | null {
    const name = channel.replace(/^#/, '').toLowerCase();
    if (/(cyprus|κύπρος|nicosia|limassol|lefkosia|paphos|larnaca)/i.test(name))
      return { primary: 'Cypriot Greek', instruction: 'Write in Cypriot Greek dialect using Greeklish (Latin characters for Greek sounds) or Greek characters. Use Cypriot dialect words: "en" for "είναι", "tziai" for "και", "kamia" for "κάμποσα". Mix Greek and Greeklish naturally.' };
    if (/(greece|greek|hellas|athens|thessaloniki|athen|ελλάδα|patra|crete|κρήτη)/i.test(name))
      return { primary: 'Greek', instruction: 'Write in Greek using either Greek characters (Ελληνικά) OR Greeklish (Greek words in Latin letters, e.g. "pws eisai" = "πώς είσαι", "re" = "ρε"). Mix both styles naturally as IRC Greeks do.' };
    if (/(fran(ce|cais|çais)|paris|lyon|marseille|bordeaux|\bfr\b)/i.test(name))
      return { primary: 'French', instruction: 'Write in French (français). Use casual IRC-style French with internet abbreviations like "slt" (salut), "stp" (s\'il te plaît), "pk" (pourquoi), "mdr" (mort de rire, = lol).' };
    if (/(german|germany|deutsch|deutschland|berlin|munich|münchen|hamburg|frankfurt|\bde\b)/i.test(name))
      return { primary: 'German', instruction: 'Write in German (Deutsch). Casual IRC style. Use informal "du" form. Common abbrevs: "lg" (liebe Grüße), "mfg", "gn8" (gute Nacht).' };
    if (/(spain|spanish|espanol|españa|madrid|barcelona|mexico|argentina|colombia|\bes\b)/i.test(name))
      return { primary: 'Spanish', instruction: 'Write in Spanish (español). Casual IRC style. Use internet abbrevs like "xD", "jaja", "q" for "que".' };
    if (/(italy|italian|italiano|italia|rome|roma|milan|milano|napoli|\bit\b)/i.test(name))
      return { primary: 'Italian', instruction: 'Write in Italian (italiano). Casual IRC style.' };
    if (/(poland|polish|polska|warsaw|warszawa|krakow|kraków|\bpl\b)/i.test(name))
      return { primary: 'Polish', instruction: 'Write in Polish (polski). Casual IRC style with common chat abbreviations.' };
    if (/(romania|romanian|română|bucharest|bucurești|cluj|\bro\b)/i.test(name))
      return { primary: 'Romanian', instruction: 'Write in Romanian (română). Casual IRC style.' };
    if (/(turkey|turkish|türkçe|türkiye|istanbul|ankara|\btr\b)/i.test(name))
      return { primary: 'Turkish', instruction: 'Write in Turkish (Türkçe). Casual IRC style with common internet abbreviations.' };
    if (/(netherlands|dutch|nederland|amsterdam|rotterdam|\bnl\b)/i.test(name))
      return { primary: 'Dutch', instruction: 'Write in Dutch (Nederlands). Casual IRC style.' };
    if (/(korea|korean|한국|\bkr\b)/i.test(name))
      return { primary: 'Korean', instruction: 'Write in Korean (한국어) using Hangul. Casual style with Korean internet expressions like "ㅋㅋ" (lol), "ㅠㅠ" (sad).' };
    if (/(japan|japanese|日本|\bjp\b)/i.test(name))
      return { primary: 'Japanese', instruction: 'Write in Japanese (日本語). Mix kanji, hiragana and katakana naturally. Casual style.' };
    if (/(brasil|brazil|portuguese|portugal|porto|lisbon|\bpt\b)/i.test(name))
      return { primary: 'Portuguese', instruction: 'Write in Portuguese. Casual IRC style with internet slang.' };
    if (/(russia|russian|русский|moscow|москва|\bru\b)/i.test(name))
      return { primary: 'Russian', instruction: 'Write in Russian (русский) using Cyrillic. Casual IRC style.' };
    if (/(china|chinese|中文|beijing|shanghai|\bcn\b)/i.test(name))
      return { primary: 'Chinese', instruction: 'Write in Chinese (中文). Casual style with simplified characters.' };
    if (/(arabic|arab|egypt|cairo|saudi|jordan|lebanon|\bar\b)/i.test(name))
      return { primary: 'Arabic', instruction: 'Write in Arabic (العربية) or Arabizi (using numbers for sounds: 3=ع, 7=ح, 2=ء). Casual IRC style.' };
    return null;
  }

  /**
   * Async resolver: regex map → LLM inference → English.
   * Stores the result in channelLanguageCache so getChannelLanguage() can read it synchronously.
   */
  private async resolveChannelLanguage(channel: string, topic?: string): Promise<void> {
    const key = channel.toLowerCase();
    if (this.channelLanguageCache.has(key)) return;

    const stored = ChannelLanguageStore.get(channel);
    if (stored) {
      this.channelLanguageCache.set(key, stored);
      return;
    }

    // 1. Fast path: explicit regex match
    const known = this.matchKnownLanguage(channel);
    if (known) {
      this.setResolvedChannelLanguage(channel, known);
      return;
    }

    const inferred = this.inferLanguageFromScript(channel, topic);
    if (inferred) {
      this.setResolvedChannelLanguage(channel, inferred);
      return;
    }

    // 2. LLM inference for unrecognised channels
    if (this.provider) {
      try {
        const result = await this.provider.generate({
          messages: [
            {
              role: 'system' as const,
              content:
                'You are a language expert for IRC channels. ' +
                'Respond with ONLY a valid JSON object — no markdown, no explanation.',
            },
            {
              role: 'user',
              content:
                `What language/dialect do users speak in IRC channel "${channel}"` +
                (topic ? ` (topic: "${topic}")` : '') + `?\n` +
                `Consider cultural context (e.g. #NorwegianCafe → Norwegian, #BuenosAires → Spanish, ` +
                `#CyprusLounge → Cypriot Greek dialect, #台灣 → Traditional Chinese).\n` +
                `If the channel is clearly English-speaking or language-neutral, use English.\n` +
                `Include IRC-style casual writing notes and common abbreviations for that language.\n` +
                `Respond ONLY with this JSON:\n` +
                `{"primary":"<language name>","instruction":"<style guide: how to write IRC messages in that language>"}`,
            },
          ],
          maxTokens: 90,
          temperature: this.getRequestTemperature(0.2),
          requestType: 'language_detect',
        });
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { primary?: string; instruction?: string };
          if (parsed.primary && parsed.instruction) {
            this.accumulateTokens('language_detect', result.inputTokens, result.outputTokens);
            this.setResolvedChannelLanguage(channel, {
              primary: parsed.primary,
              instruction: parsed.instruction,
            });
            return;
          }
        }
      } catch { /* fall through */ }
    }

    // 3. Final fallback
    this.setResolvedChannelLanguage(channel, { primary: 'English', instruction: 'Write in English. Casual IRC style.' });
  }

  async generateReply(
    channel: string,
    channelData: IRCChannel,
    userMessage: string,
    userNick: string
  ): Promise<void> {
    const lang = this.getChannelLanguage(channel);
    const key = channel.toLowerCase();

    // Check if the user mentioned a specific nick
    const mentionedNick = channelData.users
      .filter((u) => u.nick !== userNick && u.isAI)
      .find((u) => new RegExp(`\\b${u.nick}\\b`, 'i').test(userMessage));

    if (mentionedNick) {
      // Only the mentioned user responds — no one else
      const persona = this.personaManager.getPersona(mentionedNick.nick);
      if (!persona) return;

      // ~25% chance they respond via PM instead of in-channel
      const respondViaPM = Math.random() < 0.25;

      const delay = 1500 + Math.random() * 3000;
      setTimeout(async () => {
        if (!this.activeChannels.has(key)) return;
        if (!this.provider) {
          this.generateFallbackMessage(channel, persona);
          return;
        }

        try {
          const recentHistory = this.buildRecentChatContext(channelData);

          const result = await this.provider.generate({
            messages: [
              {
                role: 'system',
                content:
                  IRC_SIMULATION_RULES +
                  `CONTEXT: You are "${persona.nick}" in ${channel}.\n` +
                  `Personality: ${persona.personality}. Quirks: ${persona.quirks.join(', ')}.\n` +
                  `LANGUAGE: ${lang.instruction} Write in ${lang.primary}.\n` +
                  `${userNick} addressed you by name — respond directly.`,
              },
              {
                role: 'user',
                content: `IRC conversation:\n${recentHistory}\n\n${userNick} said to you: "${userMessage}"\n\nRespond as ${persona.nick}:`,
              },
            ],
            maxTokens: 72,
            temperature: this.baseTemperature,
            requestType: 'channel_reply',
          });
          this.accumulateTokens('channel_reply', result.inputTokens, result.outputTokens, result.failover);
          if (!this.activeChannels.has(key)) return;
          const text = result.text.trim();
          if (!text) return;

          if (respondViaPM) {
            // Send as a private message instead
            this.registerPMFromChannel(persona.nick, channel);
            if (this.onPrivateMessage) {
              this.onPrivateMessage(
                persona.nick,
                createMessage('message', this.normalizePrivateMessageText(text, persona.nick), persona.nick)
              );
            }
          } else if (this.onMessage) {
            this.onMessage(channel, createMessage('message', text, persona.nick, channel));
          }
        } catch (err) {
          this.verboseLog(`[AI] channel_reply (mentioned) FAILED: ${err instanceof Error ? err.message : err}`);
          if (this.activeChannels.has(key)) this.generateFallbackMessage(channel, persona);
        }
      }, delay);
    } else {
      // No specific nick mentioned — batch reply from 1-2 random personas
      const numResponses = 1 + Math.floor(Math.random() * 2);
      const speakers: AIPersona[] = [];
      for (let i = 0; i < numResponses; i++) {
        const p = this.personaManager.selectSpeaker(channel);
        if (p && !speakers.find((s) => s.nick === p.nick)) speakers.push(p);
      }
      if (speakers.length === 0) return;

      const delay = 1500 + Math.random() * 3000;
      setTimeout(async () => {
        if (!this.activeChannels.has(key)) return;
        if (!this.provider) {
          if (speakers[0]) this.generateFallbackMessage(channel, speakers[0]);
          return;
        }

        try {
          const recentHistory = this.buildRecentChatContext(channelData);

          const speakerList = speakers.map((s) => `- ${s.nick}: ${s.personality}`).join('\n');
          const speakerNicks = speakers.map((s) => s.nick).join(', ');

          const result = await this.provider.generate({
            messages: [
              {
                role: 'system',
                content:
                  IRC_SIMULATION_RULES +
                  `REPLY TASK: ${userNick} just spoke in ${channel}. Generate reactions.\n` +
                  `Speakers:\n${speakerList}\n` +
                  `Topic: ${channelData.topic || 'general chat'}.\n` +
                  `LANGUAGE: ${lang.instruction} ALL messages MUST be in ${lang.primary}.\n` +
                  `Generate exactly ${speakers.length} message(s), one per speaker: ${speakerNicks}. All must REACT to ${userNick}.`,
              },
              {
                role: 'user',
                content: `IRC conversation:\n${recentHistory}\n\n${userNick} just said: "${userMessage}"\n\nWrite responses from ${speakerNicks}:`,
              },
            ],
            maxTokens: 160,
            temperature: this.baseTemperature,
            requestType: 'channel_reply',
          });
          this.accumulateTokens('channel_reply', result.inputTokens, result.outputTokens, result.failover);
          if (!this.activeChannels.has(key)) return;

          const lines = result.text.trim().split('\n').filter((l) => l.trim());
          const parsed: { nick: string; text: string }[] = [];
          for (const line of lines) {
            const match = line.match(/^<([^>]+)>\s*(.+)$/);
            if (match) parsed.push({ nick: match[1], text: match[2].trim() });
          }

          for (let i = 0; i < parsed.length; i++) {
            const { nick, text } = parsed[i];
            if (!text || !this.activeChannels.has(key)) break;
            const msgDelay = i * (6000 + Math.random() * 1000);
            setTimeout(() => {
              if (!this.activeChannels.has(key) || !this.onMessage) return;
              this.onMessage(channel, createMessage('message', text, nick, channel));
            }, msgDelay);
          }
        } catch (err) {
          this.verboseLog(`[AI] channel_reply (batch) FAILED: ${err instanceof Error ? err.message : err}`);
          if (speakers[0] && this.activeChannels.has(key)) this.generateFallbackMessage(channel, speakers[0]);
        }
      }, delay);
    }
  }

  async generatePrivateReply(
    targetNick: string,
    userMessage: string,
    userNick: string
  ): Promise<void> {
    const key = targetNick.toLowerCase();
    const fromChannel = this.pmChannelContext.get(key) || '';
    const persona = this.personaManager.ensurePersonaForNick(targetNick, fromChannel || undefined);

    // Bots never reply to DMs
    if (persona?.isBot) return;

    const history = this.pmHistory.get(key) || [];
    const lang = this.getChannelLanguage(fromChannel);

    // Load persistent memories for this persona
    const memories = PMMemoryStore.getMemory(targetNick);
    const memoryContext = memories
      ? `You have memories from past conversations with ${userNick}: "${memories}". ` +
        `Use these memories naturally — if they greet you, you can reference things you remember. ` +
        `Do NOT explicitly say "I remember from last time" — just weave it in naturally. `
      : `You do not know ${userNick} — this is your first conversation. Treat them as a stranger. `;

    // Add user turn to history
    history.push({ role: 'user', content: `${userNick}: ${userMessage}` });
    // Keep history bounded to last 12 turns
    if (history.length > ConversationEngine.PM_HISTORY_LIMIT) history.splice(0, history.length - ConversationEngine.PM_HISTORY_LIMIT);
    this.pmHistory.set(key, history);

    const delay = 1200 + Math.random() * 3500;
    setTimeout(async () => {
      const systemPrompt =
        IRC_SIMULATION_RULES +
        `CONTEXT: You are "${targetNick}" in a private IRC chat with ${userNick}.\n` +
        (persona
          ? `Personality: ${persona.personality}. Sex: ${persona.sex || 'unknown'}. Quirks: ${persona.quirks.join(', ')}.\n`
          : 'You are a regular IRC user.\n') +
        memoryContext +
        `LANGUAGE: ${lang.instruction} Respond ONLY in ${lang.primary}.\n` +
        `If ${userNick} writes in a language you don't understand, say so in ${lang.primary}.\n` +
        `Remember the conversation history.`;

      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
        ...this.getPMContextHistory(history),
      ];

      let text = '';
      if (this.provider) {
        try {
          const res = await this.provider.generate({ messages, maxTokens: 96, temperature: this.baseTemperature, requestType: 'pm_reply' });
          this.accumulateTokens('pm_reply', res.inputTokens, res.outputTokens, res.failover);
          text = this.normalizePrivateMessageText(res.text, targetNick);
        } catch (err) {
          this.verboseLog(`[AI] pm_reply FAILED: ${err instanceof Error ? err.message : err}`);
        }
      }
      if (!text) {
        const fallbacks = ["hey, what's up?", 'hmm', 'lol', 'yeah', 'ic'];
        text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }

      history.push({ role: 'assistant', content: this.normalizePrivateMessageText(text, targetNick) });
      if (history.length > ConversationEngine.PM_HISTORY_LIMIT) history.splice(0, history.length - ConversationEngine.PM_HISTORY_LIMIT);
      this.pmHistory.set(key, history);

      // Persist conversation to memory store
      this.persistPMMemory(targetNick, userNick, history);

      if (this.onPrivateMessage) {
        this.onPrivateMessage(
          targetNick,
          createMessage('message', this.normalizePrivateMessageText(text, targetNick), targetNick)
        );
      }

      // ~20% chance: send a natural follow-up a few seconds later to keep the conversation going
      // only if text doesn't include ';' or '?'
      if (Math.random() < 0.12 && this.provider && text.length >= 18 && !text.includes(';') && !text.includes('?')) {
        const followDelay = 3000 + Math.random() * 4000;
        setTimeout(async () => {
          // Only follow up if the user hasn't replied in the meantime (history tail is still our message)
          const currentHistory = this.pmHistory.get(key);
          if (!currentHistory) return;
          const lastEntry = currentHistory[currentHistory.length - 1];
          if (!lastEntry || lastEntry.role !== 'assistant') return;

          const followMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            {
              role: 'system',
              content:
                IRC_SIMULATION_RULES +
                `CONTEXT: You are "${targetNick}" in a private IRC chat with ${userNick}.\n` +
                `LANGUAGE: ${lang.instruction} Write in ${lang.primary}.\n` +
                `You just sent a message. Send ONE short natural follow-up.`,
            },
            ...this.getPMContextHistory(currentHistory),
            { role: 'user' as const, content: `Send a natural follow-up as ${targetNick}:` },
          ];
          try {
            const followRes = await this.provider!.generate({ messages: followMessages, maxTokens: 60, temperature: this.baseTemperature, requestType: 'pm_followup' });
            this.accumulateTokens('pm_followup', followRes.inputTokens, followRes.outputTokens);
            const followText = this.normalizePrivateMessageText(followRes.text, targetNick);
            if (followText) {
              const hist = this.pmHistory.get(key);
              if (hist) {
                hist.push({ role: 'assistant', content: followText });
                if (hist.length > 20) hist.splice(1, 2);
              }
              if (this.onPrivateMessage) {
                this.onPrivateMessage(targetNick, createMessage('message', followText, targetNick));
              }
            }
          } catch { /* ignore */ }
        }, followDelay);
      }
    }, delay);
  }

  /**
   * Persist PM conversation to localStorage. When history gets long,
   * use LLM to compact it into a summary.
   */
  private async persistPMMemory(
    targetNick: string,
    userNick: string,
    history: { role: string; content: string }[]
  ): Promise<void> {
    const MAX_RAW_TURNS = 8;
    const existing = PMMemoryStore.getMemory(targetNick) || '';

    // Build a raw transcript of recent turns
    const transcript = history
      .map((h) => (h.role === 'user' ? h.content : `${targetNick}: ${h.content}`))
      .join('\n');

    // If short enough, just store the transcript appended to existing summary
    if (history.length <= MAX_RAW_TURNS && existing.length + transcript.length < 2000) {
      const combined = existing
        ? `${existing}\n---\n${transcript}`
        : transcript;
      PMMemoryStore.setMemory(targetNick, combined);
      return;
    }

    // Otherwise, compact via LLM
    if (!this.provider) {
      // No LLM available — just keep last few turns raw
      PMMemoryStore.setMemory(targetNick, transcript.slice(-1500));
      return;
    }

    const compactPrompt = [
      {
        role: 'system' as const,
        content:
          `Summarize the conversation history between "${targetNick}" and "${userNick}" into a concise paragraph (3-5 sentences). ` +
          `Capture key facts: topics discussed, personal details shared, opinions expressed, inside jokes. ` +
          `Write in third person, e.g. "${userNick} mentioned they like X. They discussed Y." ` +
          `Keep it under 500 characters.`,
      },
      {
        role: 'user' as const,
        content: existing
          ? `Previous summary:\n${existing}\n\nNew conversation:\n${transcript}`
          : transcript,
      },
    ];

    try {
      const res = await this.provider.generate({
        messages: compactPrompt,
        maxTokens: 140,
        temperature: this.getRequestTemperature(0.3),
        requestType: 'pm_summary',
      });
      this.accumulateTokens('pm_summary', res.inputTokens, res.outputTokens);
      const summary = res.text.trim();
      if (summary) {
        PMMemoryStore.setMemory(targetNick, summary);
      }
    } catch {
      // Fallback: store truncated raw text
      PMMemoryStore.setMemory(targetNick, transcript.slice(-1500));
    }
  }

  private static readonly BOT_NICKS = ['X', 'Q', 'ChanServ', 'NickServ', 'BotServ', 'HostServ'];

  async generateChannelUsers(
    channelName: string,
    network: string
  ): Promise<{ users: IRCUser[]; userCount: number; topic: string }> {
    const cleanName = channelName.replace(/^#/, '');
    const cachedTopic = TopicStore.get(channelName);
    const storedUsers = ChannelUserStore.get(channelName);

    // Pick 1-2 bot nicks for this channel
    const shuffledBots = [...ConversationEngine.BOT_NICKS].sort(() => Math.random() - 0.5);
    const numBots = 1 + Math.floor(Math.random() * 2);
    const botNicks = shuffledBots.slice(0, numBots);

    // Register bots as personas with isBot flag
    for (const botNick of botNicks) {
      this.personaManager.addBotPersona(botNick, channelName);
    }

    const botUsers: IRCUser[] = botNicks.map((nick) => ({
      nick,
      mode: 'o' as const,
      isAI: true,
      isBot: true,
    }));

    if (!this.provider) {
      const count = 8 + Math.floor(Math.random() * 12);
      const regularUsers = this.personaManager.assignPersonasToChannel(channelName, count);
      // Ensure at least 1-2 ops among regular users
      let opsCount = regularUsers.filter((u) => u.mode === 'o').length;
      for (const u of regularUsers) {
        if (opsCount >= 2) break;
        if (u.mode === '') { u.mode = 'o'; opsCount++; }
      }
      return { users: [...botUsers, ...regularUsers], userCount: count + numBots, topic: cachedTopic || `Welcome to ${channelName}` };
    }

    try {
      const genMessages: { role: 'system' | 'user'; content: string }[] = [
        {
          role: 'system',
          content:
            'You generate IRC channel user lists. Respond with ONLY valid JSON, no markdown or extra text.',
        },
        {
          role: 'user',
          content:
            `Generate IRC user list for #${cleanName} on ${network}.\n` +
            `Estimate userCount by channel type (popular=100-500, country=relative, niche=20-80, obscure=5-20).\n` +
            `JSON only: {"userCount":<int>,"nicks":["<nick>:<m|f|u>"],"reserve":["<nick>:<m|f|u>"],"ops":[1-3 bare nick strings from nicks],"voiced":[0-3 bare nick strings from nicks],"topic":"<short>"}\n` +
            `Nick rules — authentic late-90s mIRC style ONLY:\n` +
            `Styles: lowercase names (mike, jenny), name+digits (sarah22, tom_21), edgy words (Viper, Blaze, Shadow), ` +
            `decorations ([Mike], |Shadow|, ^Sarah^, ~jen~, _tina_), xX_Xx (sparingly), ` +
            `aLtCaPs (DaRkAnGeL, SiLvEr), status suffix (mike|away, dave_zZz), ` +
            `gendered 90s (sweetgirl, badboy_, sk8erdude), leet (l33t, n00b, ph34r).\n` +
            `Keep 3-12 chars. NO modern camelCase compounds (PixelKnight, NightCrawler).\n` +
            `CRITICAL: every nick must use a DIFFERENT base name. NO variants of the same name (e.g. maria, maria_, maria22 — pick ONE). Maximize variety.\n` +
            `Country channels: use culturally appropriate names. 40/40/20 female/male/neutral mix.\n` +
            `For every nick in nicks and reserve, append :m for male, :f for female, or :u for unknown. Example: ["eleni:f", "mike_22:m", "shadow:u"].\n` +
            `ops and voiced MUST contain only the bare nick without the :m/:f/:u suffix. Reserve nicks must not overlap with nicks. Topic: 1-2 sentences.`,
        },
      ];

      // Retry up to 2 times — LLM occasionally returns non-JSON (markdown fences, preamble, etc.)
      let data: {
        userCount?: number;
        nicks?: string[];
        reserve?: string[];
        ops?: string[];
        voiced?: string[];
        topic?: string;
      } | null = null;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for (let attempt = 0; attempt < 2; attempt++) {
        const attemptTemperature = this.getRetryTemperature(attempt);
        const result = await this.provider.generate({
          messages: genMessages,
          maxTokens: 1100,
          temperature: attemptTemperature,
          requestType: 'channel_users',
        });
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        // Strip markdown code fences if present
        const cleaned = result.text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            data = JSON.parse(jsonMatch[0]);
            break;
          } catch {
            await this.reportClientAIError(
              'channel_users',
              `channel_users JSON parse failed on attempt ${attempt + 1}`,
              `temperature=${attemptTemperature}; response=${cleaned.slice(0, 1200)}`
            );
            console.warn(`[ConversationEngine] JSON parse failed on attempt ${attempt + 1}, retrying...`);
          }
        } else {
          await this.reportClientAIError(
            'channel_users',
            `channel_users returned no JSON on attempt ${attempt + 1}`,
            `temperature=${attemptTemperature}; response=${cleaned.slice(0, 1200)}`
          );
          console.warn(`[ConversationEngine] No JSON found on attempt ${attempt + 1}, retrying...`);
        }
      }

      if (!data) throw new Error('No valid JSON after retries');
      this.accumulateTokens('channel_users', totalInputTokens, totalOutputTokens);

      const parseSex = (value?: string): 'male' | 'female' | 'unknown' => {
        switch ((value || '').toLowerCase()) {
          case 'm': return 'male';
          case 'f': return 'female';
          default: return 'unknown';
        }
      };

      const parseTaggedNickList = (list: string[] | undefined): Array<{ nick: string; sex: 'male' | 'female' | 'unknown' }> =>
        (list || [])
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => {
            const trimmed = entry.trim();
            const match = trimmed.match(/^(.*?):([mfu])$/i);
            if (!match) {
              return { nick: trimmed, sex: 'unknown' as const };
            }
            return {
              nick: match[1].trim(),
              sex: parseSex(match[2]),
            };
          })
          .filter((entry) => entry.nick.length > 0);

      const nicks = parseTaggedNickList(data.nicks);
      const rawReserve = parseTaggedNickList(data.reserve);
      const reserve = rawReserve.filter(
        (entry) => !nicks.some((nickEntry) => nickEntry.nick.toLowerCase() === entry.nick.toLowerCase())
      );

      // Deduplicate nicks that share the same base name (e.g. maria, maria_, maria22)
      const dedupeByBase = (list: Array<{ nick: string; sex: 'male' | 'female' | 'unknown' }>) => {
        const seen = new Set<string>();
        return list.filter((nick) => {
          const base = nick.nick.toLowerCase().replace(/^[\[|^~_]+|[\]|^~_]+$/g, '').replace(/[_|\-\d]+$/g, '');
          if (!base || seen.has(base)) return false;
          seen.add(base);
          return true;
        });
      };
      const dedupedNicks = dedupeByBase(nicks);
      const usedBases = new Set(dedupedNicks.map((n) => n.nick.toLowerCase().replace(/^[\[|^~_]+|[\]|^~_]+$/g, '').replace(/[_|\-\d]+$/g, '')));
      const dedupedReserve = reserve.filter((nick) => {
        const base = nick.nick.toLowerCase().replace(/^[\[|^~_]+|[\]|^~_]+$/g, '').replace(/[_|\-\d]+$/g, '');
        if (!base || usedBases.has(base)) return false;
        usedBases.add(base);
        return true;
      });
      const ops: string[] = data.ops || [];
      const voiced: string[] = data.voiced || [];
      const userCount: number = typeof data.userCount === 'number' ? data.userCount : dedupedNicks.length;

      if (dedupedNicks.length === 0) {
        await this.reportClientAIError(
          'channel_users',
          'channel_users returned an empty nick list',
          `payload=${JSON.stringify(data).slice(0, 1200)}`
        );
        throw new Error('Empty nick list');
      }

      // Blend in stored users from previous sessions: replace 40-70% of LLM nicks with familiar faces
      let finalNicks = [...dedupedNicks];
      let finalOps = [...ops];
      let finalVoiced = [...voiced];
      let extraReserve: Array<{ nick: string; sex?: 'male' | 'female' | 'unknown' }> = [];

      if (storedUsers && storedUsers.length >= 3) {
        // Filter out stored users whose nicks collide with LLM-generated ones
        const llmNickSet = new Set(finalNicks.map((n) => n.nick.toLowerCase()));
        const uniqueStored = storedUsers.filter((u) => !llmNickSet.has(u.nick.toLowerCase()));

        if (uniqueStored.length > 0) {
          const shuffledStored = [...uniqueStored].sort(() => Math.random() - 0.5);
          const returnFraction = 0.4 + Math.random() * 0.3; // 40–70%
          const returnCount = Math.min(
            Math.round(shuffledStored.length * returnFraction),
            Math.floor(finalNicks.length * 0.7) // never replace more than 70% of LLM slots
          );
          const returning = shuffledStored.slice(0, returnCount);
          const notReturning = shuffledStored.slice(returnCount);

          // Displaced LLM nicks + offline stored nicks all go to reserve
          const displaced = finalNicks.splice(finalNicks.length - returnCount, returnCount);
          extraReserve = [
            ...displaced,
            ...notReturning.map((u) => ({ nick: u.nick, sex: u.sex })),
          ].filter((entry, index, all) => all.findIndex((candidate) => candidate.nick.toLowerCase() === entry.nick.toLowerCase()) === index);

          // Append returning stored nicks with their remembered modes
          for (const stored of returning) {
            finalNicks.push({ nick: stored.nick, sex: stored.sex || 'unknown' });
            if (stored.mode === 'o') finalOps.push(stored.nick);
            else if (stored.mode === 'v') finalVoiced.push(stored.nick);
          }
        }
      }

      // Store reserve nicks for later joins
      const combinedReserve = [...dedupedReserve, ...extraReserve].filter(
        (entry, index, all) =>
          all.findIndex((candidate) => candidate.nick.toLowerCase() === entry.nick.toLowerCase()) === index
          && !finalNicks.some((nickEntry) => nickEntry.nick.toLowerCase() === entry.nick.toLowerCase())
      );
      if (combinedReserve.length > 0) {
        this.channelReserveNicks.set(channelName.toLowerCase(), combinedReserve);
      }
      // Resolve topic: prefer cached (< 24h), otherwise use LLM-provided
      const llmTopic = typeof data.topic === 'string' && data.topic.trim() ? data.topic.trim() : '';
      const resolvedTopic = cachedTopic || llmTopic || `Welcome to ${channelName}`;
      if (!cachedTopic && llmTopic) {
        TopicStore.set(channelName, llmTopic);
      }
      this.personaManager.addDynamicPersonas(finalNicks, channelName);
      // Persist all nicks (active + reserve) for session continuity
      ChannelUserStore.set(channelName, [
        ...finalNicks.map((entry) => ({
          nick: entry.nick,
          mode: finalOps.includes(entry.nick) ? 'o' : finalVoiced.includes(entry.nick) ? 'v' : '',
          sex: entry.sex,
        })),
        ...combinedReserve.map((entry) => ({ nick: entry.nick, mode: '', sex: entry.sex })),
      ]);

      const users: IRCUser[] = finalNicks.map((entry) => ({
        nick: entry.nick,
        mode: finalOps.includes(entry.nick) ? ('o' as const) : finalVoiced.includes(entry.nick) ? ('v' as const) : ('' as const),
        isAI: true,
      }));

      // Ensure at least 1 human op exists
      if (!users.some((u) => u.mode === 'o')) {
        const first = users.find((u) => u.mode === '');
        if (first) first.mode = 'o';
      }

      return { users: [...botUsers, ...users], userCount: userCount + numBots, topic: resolvedTopic };
    } catch (err) {
      console.error(`[ConversationEngine] generateChannelUsers failed for ${channelName}:`, err);
      const count = 8 + Math.floor(Math.random() * 12);
      const regularUsers = this.personaManager.assignPersonasToChannel(channelName, count);
      let opsCount = regularUsers.filter((u) => u.mode === 'o').length;
      for (const u of regularUsers) {
        if (opsCount >= 2) break;
        if (u.mode === '') { u.mode = 'o'; opsCount++; }
      }
      return { users: [...botUsers, ...regularUsers], userCount: count + numBots, topic: cachedTopic || `Welcome to ${channelName}` };
    }
  }
}

