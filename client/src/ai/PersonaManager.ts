import { AIPersona, IRCUser } from '../types/irc';
import { defaultPersonas } from '../data/personas';

export class PersonaManager {
  private personas: Map<string, AIPersona> = new Map();
  private activePersonas: Map<string, Set<string>> = new Map(); // channel → set of nicks
  private static readonly FEMALE_NAME_HINTS = new Set([
    'alexis', 'alice', 'angel', 'anna', 'annie', 'ashley', 'cathy', 'elena', 'eleni', 'ella', 'emma',
    'jane', 'jenny', 'jen', 'jess', 'jessica', 'kat', 'kate', 'katie', 'kim', 'lisa', 'luna', 'maria',
    'mary', 'nina', 'rose', 'sarah', 'sophie', 'sofia', 'sophia', 'tina', 'victoria'
  ]);
  private static readonly MALE_NAME_HINTS = new Set([
    'alex', 'bob', 'chris', 'dave', 'david', 'joe', 'john', 'kevin', 'matt', 'michael', 'mike',
    'nick', 'paul', 'peter', 'rich', 'richie', 'rob', 'robert', 'sam', 'steve', 'thomas', 'tom'
  ]);

  constructor() {
    defaultPersonas.forEach((p) => this.personas.set(p.nick.toLowerCase(), p));
  }

  getPersona(nick: string): AIPersona | undefined {
    return this.personas.get(nick.toLowerCase());
  }

  private normalizeNickBase(nick: string): string {
    const trimmed = nick
      .toLowerCase()
      .replace(/^[\[\]|^~_]+|[\[\]|^~_]+$/g, '')
      .replace(/\|(?:away|work|afk|brb|zzz)$/i, '')
      .replace(/[_\-|\d]+$/g, '')
      .replace(/^x+x?_|_x+x?$/g, '')
      .replace(/[^a-z]/g, '');
    return trimmed;
  }

  inferSexFromNick(nick: string): 'male' | 'female' | 'unknown' {
    const base = this.normalizeNickBase(nick);
    if (!base) return 'unknown';
    if (PersonaManager.FEMALE_NAME_HINTS.has(base)) return 'female';
    if (PersonaManager.MALE_NAME_HINTS.has(base)) return 'male';
    if (/(girl|chick|babe|lady|queen|princess|grl)$/.test(base)) return 'female';
    if (/(boy|dude|bro|king|guy)$/.test(base)) return 'male';
    return 'unknown';
  }

  private attachToChannel(channel: string, nick: string) {
    const channelNicks = this.activePersonas.get(channel.toLowerCase()) || new Set<string>();
    channelNicks.add(nick.toLowerCase());
    this.activePersonas.set(channel.toLowerCase(), channelNicks);
  }

  ensurePersonaForNick(nick: string, channel?: string, preferredSex?: 'male' | 'female' | 'unknown'): AIPersona {
    const lnick = nick.toLowerCase();
    const inferredSex = this.inferSexFromNick(nick);
    const resolvedSex = preferredSex && preferredSex !== 'unknown' ? preferredSex : inferredSex;
    const existing = this.personas.get(lnick);

    if (existing) {
      if (preferredSex && preferredSex !== 'unknown') {
        existing.sex = preferredSex;
      } else if (!existing.sex || existing.sex === 'unknown') {
        existing.sex = inferredSex;
      }
      if (channel) this.attachToChannel(channel, nick);
      return existing;
    }

    const sex = resolvedSex;
    const persona: AIPersona = {
      nick,
      personality:
        sex === 'female'
          ? 'A regular female IRC user. Casual and friendly.'
          : sex === 'male'
            ? 'A regular male IRC user. Casual and friendly.'
            : 'A regular IRC user. Casual and friendly.',
      typingSpeed: 'normal',
      activityLevel: 'normal',
      interests: [],
      language: 'en',
      quirks: [],
      sex,
    };

    this.personas.set(lnick, persona);
    if (channel) this.attachToChannel(channel, nick);
    return persona;
  }

  getChannelPersonas(channel: string): AIPersona[] {
    const nicks = this.activePersonas.get(channel.toLowerCase()) || new Set();
    return Array.from(nicks)
      .map((n) => this.personas.get(n))
      .filter((p): p is AIPersona => !!p);
  }

  assignPersonasToChannel(channel: string, count: number): IRCUser[] {
    const available = Array.from(this.personas.values());
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    selected.forEach((persona) => {
      if (!persona.sex || persona.sex === 'unknown') {
        persona.sex = this.inferSexFromNick(persona.nick);
      }
    });

    const nicks = new Set(selected.map((p) => p.nick.toLowerCase()));
    this.activePersonas.set(channel.toLowerCase(), nicks);

    return selected.map((p) => ({
      nick: p.nick,
      mode: Math.random() < 0.15 ? 'o' as const : Math.random() < 0.1 ? 'v' as const : '' as const,
      isAI: true,
      persona: p,
    }));
  }

  addPersona(persona: AIPersona) {
    this.personas.set(persona.nick.toLowerCase(), persona);
  }

  addBotPersona(nick: string, channel: string) {
    const lnick = nick.toLowerCase();
    if (!this.personas.has(lnick)) {
      this.personas.set(lnick, {
        nick,
        personality: 'Channel service bot. Never speaks.',
        typingSpeed: 'normal',
        activityLevel: 'lurker',
        interests: [],
        language: 'en',
        quirks: [],
        sex: 'unknown',
        isBot: true,
      });
    }
    this.attachToChannel(channel, nick);
  }

  addDynamicPersonas(nicks: Array<string | { nick: string; sex?: 'male' | 'female' | 'unknown' }>, channel: string) {
    nicks.forEach((entry) => {
      if (typeof entry === 'string') {
        this.ensurePersonaForNick(entry, channel);
        return;
      }
      this.ensurePersonaForNick(entry.nick, channel, entry.sex);
    });
  }

  removePersonaFromChannel(channel: string, nick: string) {
    const channelNicks = this.activePersonas.get(channel.toLowerCase());
    if (!channelNicks) return;
    channelNicks.delete(nick.toLowerCase());
    if (channelNicks.size === 0) this.activePersonas.delete(channel.toLowerCase());
  }

  removePersonaFromAllChannels(nick: string) {
    const loweredNick = nick.toLowerCase();
    for (const [channel, channelNicks] of this.activePersonas.entries()) {
      channelNicks.delete(loweredNick);
      if (channelNicks.size === 0) this.activePersonas.delete(channel);
    }
  }

  selectSpeaker(channel: string): AIPersona | null {
    const personas = this.getChannelPersonas(channel)
      .filter((p) => !p.isBot); // Bots never speak
    if (personas.length === 0) return null;

    // Weight by activity level
    const weighted: AIPersona[] = [];
    personas.forEach((p) => {
      const weight =
        p.activityLevel === 'hyperactive' ? 4 :
        p.activityLevel === 'active' ? 3 :
        p.activityLevel === 'normal' ? 2 : 1;
      for (let i = 0; i < weight; i++) weighted.push(p);
    });

    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  removeChannelPersonas(channel: string) {
    this.activePersonas.delete(channel.toLowerCase());
  }
}
