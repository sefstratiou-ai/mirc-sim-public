export interface IRCMessage {
  id: string;
  timestamp: Date;
  type: 'message' | 'action' | 'join' | 'part' | 'quit' | 'nick' | 'mode' | 'topic' | 'kick' | 'notice' | 'ctcp' | 'server' | 'motd' | 'error' | 'info';
  nick?: string;
  content: string;
  channel?: string;
  target?: string;
  raw?: string;
}

export interface IRCUser {
  nick: string;
  mode: '' | 'o' | 'v'; // op, voice, or regular
  ident?: string;
  host?: string;
  realname?: string;
  isAI?: boolean;
  isBot?: boolean;
  persona?: AIPersona;
}

export interface IRCChannel {
  name: string;
  topic: string;
  users: IRCUser[];
  messages: IRCMessage[];
  modes: string;
  userCount?: number;
}

export interface IRCServer {
  name: string;
  address: string;
  port: number;
  network: string;
  description: string;
  defaultChannels: string[];
  motd: string[];
}

export interface AIPersona {
  nick: string;
  personality: string;
  typingSpeed: 'slow' | 'normal' | 'fast';
  activityLevel: 'lurker' | 'normal' | 'active' | 'hyperactive';
  interests: string[];
  language: string;
  quirks: string[];
  sex?: 'male' | 'female' | 'unknown';
  isBot?: boolean;
}

export interface WindowState {
  id: string;
  type: 'channel' | 'query' | 'server';
  title: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  unread: boolean;
  highlighted: boolean;
}

export interface AppState {
  connected: boolean;
  connecting: boolean;
  nick: string;
  userModes: string;
  server: IRCServer | null;
  channels: Map<string, IRCChannel>;
  queries: Map<string, IRCChannel>;
  serverMessages: IRCMessage[];
  windows: WindowState[];
  activeWindowId: string | null;
  nextZIndex: number;
}

export type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'lmstudio';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  lmStudioUrl: string;
  model: string;
  reasoningEffort?: string;
  temperature?: number;
}

export type AppAction =
  | { type: 'CONNECT'; server: IRCServer; nick: string }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECT' }
  | { type: 'ADD_SERVER_MESSAGE'; message: IRCMessage }
  | { type: 'JOIN_CHANNEL'; channel: string; users?: IRCUser[]; topic?: string; modes?: string }
  | { type: 'PART_CHANNEL'; channel: string }
  | { type: 'ADD_CHANNEL_MESSAGE'; channel: string; message: IRCMessage }
  | { type: 'USER_JOIN'; channel: string; user: IRCUser }
  | { type: 'USER_PART'; channel: string; nick: string; message?: string }
  | { type: 'USER_QUIT'; nick: string; message?: string }
  | { type: 'USER_NICK'; oldNick: string; newNick: string }
  | { type: 'SET_TOPIC'; channel: string; topic: string; nick?: string }
  | { type: 'SET_MODE'; channel: string; mode: string; nick?: string; target?: string }
  | { type: 'OPEN_QUERY'; nick: string }
  | { type: 'ADD_QUERY_MESSAGE'; nick: string; message: IRCMessage }
  | { type: 'CHANGE_NICK'; nick: string }
  | { type: 'SET_ACTIVE_WINDOW'; windowId: string }
  | { type: 'CLOSE_WINDOW'; windowId: string }
  | { type: 'MOVE_WINDOW'; windowId: string; x: number; y: number }
  | { type: 'RESIZE_WINDOW'; windowId: string; width: number; height: number }
  | { type: 'MINIMIZE_WINDOW'; windowId: string }
  | { type: 'MAXIMIZE_WINDOW'; windowId: string }
  | { type: 'RESTORE_WINDOW'; windowId: string }
  | { type: 'CASCADE_WINDOWS' }
  | { type: 'TILE_HORIZONTAL' }
  | { type: 'TILE_VERTICAL' }
  | { type: 'UPDATE_CHANNEL_USERS'; channel: string; users: IRCUser[] };
