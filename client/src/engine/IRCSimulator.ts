import { AppState, AppAction, IRCMessage, IRCUser, WindowState } from '../types/irc';

let messageId = 0;
export function createMessage(
  type: IRCMessage['type'],
  content: string,
  nick?: string,
  channel?: string
): IRCMessage {
  return {
    id: `msg-${++messageId}`,
    timestamp: new Date(),
    type,
    content,
    nick,
    channel,
  };
}

export function createInitialState(): AppState {
  return {
    connected: false,
    connecting: false,
    nick: '',
    userModes: '',
    server: null,
    channels: new Map(),
    queries: new Map(),
    serverMessages: [],
    windows: [],
    activeWindowId: null,
    nextZIndex: 1,
  };
}

function createWindowState(
  id: string,
  type: WindowState['type'],
  title: string,
  name: string,
  existingWindows: WindowState[],
  nextZ: number
): WindowState {
  const offset = existingWindows.length * 25;
  return {
    id,
    type,
    title,
    name,
    x: 10 + offset,
    y: 10 + offset,
    width: 600,
    height: 400,
    minimized: false,
    maximized: false,
    zIndex: nextZ,
    unread: false,
    highlighted: false,
  };
}

export function ircReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'CONNECT': {
      const serverWindow = createWindowState(
        'server',
        'server',
        `Status: ${action.nick} on ${action.server.network}`,
        'Status',
        [],
        state.nextZIndex
      );
      serverWindow.maximized = false;
      serverWindow.width = 680;
      serverWindow.height = 440;
      return {
        ...state,
        connecting: true,
        connected: false,
        nick: action.nick,
        server: action.server,
        serverMessages: [],
        channels: new Map(),
        queries: new Map(),
        windows: [serverWindow],
        activeWindowId: 'server',
        nextZIndex: state.nextZIndex + 1,
      };
    }

    case 'CONNECTED':
      return {
        ...state,
        connecting: false,
        connected: true,
        userModes: 'i',
      };

    case 'DISCONNECT':
      return {
        ...state,
        connected: false,
        connecting: false,
        server: null,
        // Keep channels, queries, and windows so the user can still read history
        serverMessages: [
          ...state.serverMessages,
          createMessage('info', '* Disconnected'),
        ],
      };

    case 'ADD_SERVER_MESSAGE':
      return {
        ...state,
        serverMessages: [...state.serverMessages, action.message],
      };

    case 'JOIN_CHANNEL': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const existing = channels.get(channelLower);
      if (existing) {
        channels.set(channelLower, {
          ...existing,
          users: action.users || existing.users,
          topic: action.topic || existing.topic,
          modes: action.modes || existing.modes,
        });
      } else {
        channels.set(channelLower, {
          name: action.channel,
          topic: action.topic || '',
          users: action.users || [{ nick: state.nick, mode: '' }],
          messages: [createMessage('info', `* Joining ${action.channel}...`)],
          modes: action.modes || 'nt',
        });
      }

      const windowId = `channel-${channelLower}`;
      const existingWindow = state.windows.find((w) => w.id === windowId);
      let windows = state.windows;
      let nextZ = state.nextZIndex;

      if (!existingWindow) {
        const userCount = action.users?.length || 1;
        const modeStr = action.modes || 'nt';
        const win = createWindowState(
          windowId,
          'channel',
          `${action.channel} [${userCount}] [+${modeStr}]`,
          action.channel,
          state.windows,
          nextZ
        );
        // Start as a resizable floating window, not maximized
        win.maximized = false;
        win.width = 680;
        win.height = 440;
        windows = [...state.windows, win];
        nextZ++;
      }

      return {
        ...state,
        channels,
        windows,
        activeWindowId: windowId,
        nextZIndex: nextZ,
      };
    }

    case 'PART_CHANNEL': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      channels.delete(channelLower);
      const windowId = `channel-${channelLower}`;
      const windows = state.windows.filter((w) => w.id !== windowId);
      const activeWindowId =
        state.activeWindowId === windowId
          ? windows[windows.length - 1]?.id || null
          : state.activeWindowId;
      return { ...state, channels, windows, activeWindowId };
    }

    case 'ADD_CHANNEL_MESSAGE': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const channel = channels.get(channelLower);
      if (channel) {
        channels.set(channelLower, {
          ...channel,
          messages: [...channel.messages, action.message],
        });
      }
      // Mark unread if not active
      const windowId = `channel-${channelLower}`;
      const windows = state.windows.map((w) =>
        w.id === windowId && state.activeWindowId !== windowId
          ? { ...w, unread: true }
          : w
      );
      return { ...state, channels, windows };
    }

    case 'USER_JOIN': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const channel = channels.get(channelLower);
      if (channel) {
        const userExists = channel.users.some(
          (u) => u.nick.toLowerCase() === action.user.nick.toLowerCase()
        );
        if (!userExists) {
          const newUsers = [...channel.users, action.user];
          channels.set(channelLower, {
            ...channel,
            users: newUsers,
            messages: [
              ...channel.messages,
              createMessage(
                'join',
                `* ${action.user.nick} has joined ${action.channel}`,
                action.user.nick,
                action.channel
              ),
            ],
          });
          // Update window title with user count
          const windowId = `channel-${channelLower}`;
          const windows = state.windows.map((w) =>
            w.id === windowId
              ? { ...w, title: `${channel.name} [${newUsers.length}] [+${channel.modes}]` }
              : w
          );
          return { ...state, channels, windows };
        }
      }
      return { ...state, channels };
    }

    case 'USER_PART': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const channel = channels.get(channelLower);
      if (channel) {
        const newUsers = channel.users.filter(
          (u) => u.nick.toLowerCase() !== action.nick.toLowerCase()
        );
        const msg = action.message
          ? `* ${action.nick} has left ${action.channel} (${action.message})`
          : `* ${action.nick} has left ${action.channel}`;
        channels.set(channelLower, {
          ...channel,
          users: newUsers,
          messages: [...channel.messages, createMessage('part', msg, action.nick, action.channel)],
        });
        const windowId = `channel-${channelLower}`;
        const windows = state.windows.map((w) =>
          w.id === windowId
            ? { ...w, title: `${channel.name} [${newUsers.length}] [+${channel.modes}]` }
            : w
        );
        return { ...state, channels, windows };
      }
      return state;
    }

    case 'USER_QUIT': {
      const channels = new Map(state.channels);
      const msg = action.message
        ? `* ${action.nick} has quit IRC (${action.message})`
        : `* ${action.nick} has quit IRC`;
      let windows = [...state.windows];
      channels.forEach((channel, key) => {
        if (channel.users.some((u) => u.nick.toLowerCase() === action.nick.toLowerCase())) {
          const newUsers = channel.users.filter(
            (u) => u.nick.toLowerCase() !== action.nick.toLowerCase()
          );
          channels.set(key, {
            ...channel,
            users: newUsers,
            messages: [...channel.messages, createMessage('quit', msg, action.nick)],
          });
          const windowId = `channel-${key}`;
          windows = windows.map((w) =>
            w.id === windowId
              ? { ...w, title: `${channel.name} [${newUsers.length}] [+${channel.modes}]` }
              : w
          );
        }
      });
      return { ...state, channels, windows };
    }

    case 'USER_NICK': {
      const channels = new Map(state.channels);
      channels.forEach((channel, key) => {
        const userIdx = channel.users.findIndex(
          (u) => u.nick.toLowerCase() === action.oldNick.toLowerCase()
        );
        if (userIdx >= 0) {
          const newUsers = [...channel.users];
          newUsers[userIdx] = { ...newUsers[userIdx], nick: action.newNick };
          channels.set(key, {
            ...channel,
            users: newUsers,
            messages: [
              ...channel.messages,
              createMessage(
                'nick',
                `* ${action.oldNick} is now known as ${action.newNick}`,
                action.oldNick
              ),
            ],
          });
        }
      });
      return { ...state, channels };
    }

    case 'SET_TOPIC': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const channel = channels.get(channelLower);
      if (channel) {
        const msg = action.nick
          ? `* ${action.nick} changes topic to '${action.topic}'`
          : `* Topic is '${action.topic}'`;
        channels.set(channelLower, {
          ...channel,
          topic: action.topic,
          messages: [...channel.messages, createMessage('topic', msg, action.nick, action.channel)],
        });
      }
      return { ...state, channels };
    }

    case 'SET_MODE': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const channel = channels.get(channelLower);
      if (channel) {
        const targetStr = action.target ? ` ${action.target}` : '';
        const msg = `* ${action.nick || 'Server'} sets mode: ${action.mode}${targetStr}`;

        // Apply user mode changes
        let newUsers = [...channel.users];
        if (action.target) {
          const targetIdx = newUsers.findIndex(
            (u) => u.nick.toLowerCase() === action.target!.toLowerCase()
          );
          if (targetIdx >= 0) {
            if (action.mode === '+o') newUsers[targetIdx] = { ...newUsers[targetIdx], mode: 'o' };
            else if (action.mode === '-o') newUsers[targetIdx] = { ...newUsers[targetIdx], mode: '' };
            else if (action.mode === '+v') newUsers[targetIdx] = { ...newUsers[targetIdx], mode: 'v' };
            else if (action.mode === '-v') newUsers[targetIdx] = { ...newUsers[targetIdx], mode: '' };
          }
        }

        channels.set(channelLower, {
          ...channel,
          users: newUsers,
          messages: [...channel.messages, createMessage('mode', msg, action.nick, action.channel)],
        });
      }
      return { ...state, channels };
    }

    case 'OPEN_QUERY': {
      const queryLower = action.nick.toLowerCase();
      const queries = new Map(state.queries);
      if (!queries.has(queryLower)) {
        queries.set(queryLower, {
          name: action.nick,
          topic: '',
          users: [
            { nick: state.nick, mode: '' },
            { nick: action.nick, mode: '' },
          ],
          messages: [],
          modes: '',
        });
      }
      const windowId = `query-${queryLower}`;
      const existingWindow = state.windows.find((w) => w.id === windowId);
      let windows = state.windows;
      let nextZ = state.nextZIndex;
      if (!existingWindow) {
        const win = createWindowState(windowId, 'query', action.nick, action.nick, state.windows, nextZ);
        win.maximized = false;
        win.width = 680;
        win.height = 440;
        windows = [...state.windows, win];
        nextZ++;
        // Only auto-focus newly created query windows
        return { ...state, queries, windows, activeWindowId: windowId, nextZIndex: nextZ };
      }
      // Window already exists — don't steal focus so unread state works
      return { ...state, queries, windows, nextZIndex: nextZ };
    }

    case 'ADD_QUERY_MESSAGE': {
      const queries = new Map(state.queries);
      const queryLower = action.nick.toLowerCase();
      let query = queries.get(queryLower);
      if (!query) {
        query = {
          name: action.nick,
          topic: '',
          users: [
            { nick: state.nick, mode: '' },
            { nick: action.nick, mode: '' },
          ],
          messages: [],
          modes: '',
        };
      }
      queries.set(queryLower, {
        ...query,
        messages: [...query.messages, action.message],
      });
      // Also ensure window exists
      const windowId = `query-${queryLower}`;
      let windows = state.windows;
      let nextZ = state.nextZIndex;
      if (!state.windows.find((w) => w.id === windowId)) {
        const win = createWindowState(windowId, 'query', action.nick, action.nick, state.windows, nextZ);
        win.maximized = false;
        win.width = 680;
        win.height = 440;
        windows = [...state.windows, win];
        nextZ++;
      }
      // Mark unread if not active
      windows = windows.map((w) =>
        w.id === windowId && state.activeWindowId !== windowId ? { ...w, unread: true, highlighted: true } : w
      );
      return { ...state, queries, windows, nextZIndex: nextZ };
    }

    case 'CHANGE_NICK':
      return { ...state, nick: action.nick };

    case 'SET_ACTIVE_WINDOW': {
      const windows = state.windows.map((w) =>
        w.id === action.windowId
          ? { ...w, zIndex: state.nextZIndex, unread: false, highlighted: false, minimized: false }
          : w
      );
      return {
        ...state,
        windows,
        activeWindowId: action.windowId,
        nextZIndex: state.nextZIndex + 1,
      };
    }

    case 'CLOSE_WINDOW': {
      const windows = state.windows.filter((w) => w.id !== action.windowId);
      const activeWindowId =
        state.activeWindowId === action.windowId
          ? windows[windows.length - 1]?.id || null
          : state.activeWindowId;
      return { ...state, windows, activeWindowId };
    }

    case 'MOVE_WINDOW': {
      const windows = state.windows.map((w) =>
        w.id === action.windowId ? { ...w, x: action.x, y: action.y } : w
      );
      return { ...state, windows };
    }

    case 'RESIZE_WINDOW': {
      const windows = state.windows.map((w) =>
        w.id === action.windowId ? { ...w, width: action.width, height: action.height } : w
      );
      return { ...state, windows };
    }

    case 'MINIMIZE_WINDOW': {
      const windows = state.windows.map((w) =>
        w.id === action.windowId ? { ...w, minimized: true } : w
      );
      const activeWindowId =
        state.activeWindowId === action.windowId
          ? windows.find((w) => !w.minimized)?.id || null
          : state.activeWindowId;
      return { ...state, windows, activeWindowId };
    }

    case 'MAXIMIZE_WINDOW': {
      const windows = state.windows.map((w) =>
        w.id === action.windowId ? { ...w, maximized: true, minimized: false } : w
      );
      return { ...state, windows };
    }

    case 'RESTORE_WINDOW': {
      const windows = state.windows.map((w) =>
        w.id === action.windowId ? { ...w, maximized: false, minimized: false } : w
      );
      return { ...state, windows };
    }

    case 'CASCADE_WINDOWS': {
      const windows = state.windows.map((w, i) => ({
        ...w,
        maximized: false,
        minimized: false,
        x: 10 + i * 25,
        y: 10 + i * 25,
        width: 600,
        height: 400,
      }));
      return { ...state, windows };
    }

    case 'TILE_HORIZONTAL': {
      const visible = state.windows.filter((w) => !w.minimized);
      const h = Math.floor(100 / Math.max(visible.length, 1));
      const windows = state.windows.map((w) => {
        const idx = visible.indexOf(w);
        if (idx < 0) return w;
        return { ...w, maximized: false, x: 0, y: idx * h * 4, width: 800, height: h * 4 };
      });
      return { ...state, windows };
    }

    case 'TILE_VERTICAL': {
      const visible = state.windows.filter((w) => !w.minimized);
      const ww = Math.floor(800 / Math.max(visible.length, 1));
      const windows = state.windows.map((w) => {
        const idx = visible.indexOf(w);
        if (idx < 0) return w;
        return { ...w, maximized: false, x: idx * ww, y: 0, width: ww, height: 500 };
      });
      return { ...state, windows };
    }

    case 'UPDATE_CHANNEL_USERS': {
      const channels = new Map(state.channels);
      const channelLower = action.channel.toLowerCase();
      const channel = channels.get(channelLower);
      if (channel) {
        channels.set(channelLower, { ...channel, users: action.users });
        const windowId = `channel-${channelLower}`;
        const windows = state.windows.map((w) =>
          w.id === windowId
            ? { ...w, title: `${channel.name} [${action.users.length}] [+${channel.modes}]` }
            : w
        );
        return { ...state, channels, windows };
      }
      return state;
    }

    default:
      return state;
  }
}
