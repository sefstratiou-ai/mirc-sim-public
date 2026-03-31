import { useReducer, useCallback, useRef, useEffect } from 'react';
import { AppState, AppAction, IRCServer, IRCMessage, IRCUser } from '../types/irc';
import { ircReducer, createInitialState, createMessage } from '../engine/IRCSimulator';
import { parseCommand } from '../engine/CommandParser';
import { soundManager } from '../engine/SoundManager';
import { getDefaultTopic } from '../data/topics';
import { ConversationEngine } from '../ai/ConversationEngine';
import { createProvider } from '../ai/AIProvider';
import { AISettings } from '../types/irc';

export function useIRC() {
  const [state, dispatch] = useReducer(ircReducer, undefined, createInitialState);
  const conversationEngineRef = useRef(new ConversationEngine());
  // Always holds current state so closures passed to the engine can read live data
  const stateRef = useRef(state);
  stateRef.current = state;

  const engine = conversationEngineRef.current;

  // Verbose logging state — ref so closures always see the latest value
  const verboseRef = useRef(false);

  const setVerboseLogging = useCallback((enabled: boolean) => {
    verboseRef.current = enabled;
    if (enabled) {
      engine.setVerboseLogHandler((msg: string) => {
        dispatch({
          type: 'ADD_SERVER_MESSAGE',
          message: createMessage('info', `* ${msg}`),
        });
      });
      // Log current AI config immediately
      const info = engine.getProviderInfo();
      if (info) {
        dispatch({
          type: 'ADD_SERVER_MESSAGE',
          message: createMessage('info', `* [Verbose] AI Config: provider=${info.provider}, model=${info.model}, temperature=${info.temperature}`),
        });
      }
    } else {
      engine.setVerboseLogHandler(null);
    }
  }, [engine]);

  const setupEngineHandlers = useCallback(() => {
    engine.setMessageHandler((channel, message) => {
      dispatch({ type: 'ADD_CHANNEL_MESSAGE', channel, message });
    });
    engine.setUserJoinHandler((channel, nick) => {
      dispatch({
        type: 'USER_JOIN',
        channel,
        user: { nick, mode: '', isAI: true },
      });
      soundManager.playJoin();
    });
    engine.setUserPartHandler((channel, nick, message) => {
      dispatch({ type: 'USER_PART', channel, nick, message });
      soundManager.playPart();
    });
    engine.setUserQuitHandler((nick, message) => {
      dispatch({ type: 'USER_QUIT', nick, message });
    });
    engine.setPrivateMessageHandler((nick, message) => {
      dispatch({ type: 'OPEN_QUERY', nick });
      dispatch({ type: 'ADD_QUERY_MESSAGE', nick, message });
      soundManager.playPrivateMessage();
    });
    // Always-on failover notification (shown once per session)
    engine.setFailoverNotifyHandler((msg: string) => {
      dispatch({
        type: 'ADD_SERVER_MESSAGE',
        message: createMessage('info', msg),
      });
    });
  }, [engine]);

  // Track the WebSocket for config change notifications
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(
    (nick: string, server: IRCServer, aiSettings: AISettings) => {
      setupEngineHandlers();

      // Always set up AI provider — server manages API keys now
      const provider = createProvider(
        aiSettings.provider,
        aiSettings.apiKey,
        aiSettings.lmStudioUrl,
        aiSettings.model,
        aiSettings.reasoningEffort
      );
      engine.setProvider(provider);

      engine.setBaseTemperature(aiSettings.temperature ?? 0.9);
      engine.setUserNick(nick);

      // Open WebSocket to receive live config changes from admin
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'config_changed' && data.config) {
              const cfg = data.config;
              // Hot-swap the AI provider
              const newProvider = createProvider(
                cfg.provider || 'gemini',
                '', // API key is managed server-side
                cfg.lmstudioUrl || '',
                cfg.model || '',
                cfg.reasoningEffort || undefined
              );
              engine.setProvider(newProvider);
              engine.setBaseTemperature(cfg.temperature ?? 0.9);
              console.log(`[config] Hot-swapped AI provider: ${cfg.provider}, model: ${cfg.model}`);
              // Verbose: log new config
              if (verboseRef.current) {
                dispatch({
                  type: 'ADD_SERVER_MESSAGE',
                  message: createMessage('info', `* [Verbose] Config changed: provider=${cfg.provider}, model=${cfg.model}, temperature=${cfg.temperature ?? 0.9}${cfg.reasoningEffort ? ', reasoning=' + cfg.reasoningEffort : ''}`),
                });
              }
            }
          } catch {
            // Not a config message, ignore
          }
        };
      } catch {
        // WebSocket not available in this environment
      }

      dispatch({ type: 'CONNECT', server, nick });

      // Simulate connection sequence
      const addServerMsg = (content: string, delay: number) => {
        setTimeout(() => {
          dispatch({
            type: 'ADD_SERVER_MESSAGE',
            message: createMessage('server', content),
          });
        }, delay);
      };

      soundManager.playConnect();

      //addServerMsg(`* Dial up...`,  0);
      var initialDelay = 50;

      addServerMsg(`* Connecting to ${server.address} (${server.port})...`,  initialDelay);
      addServerMsg(`* Connected to ${server.address}`, initialDelay + 1000);
      addServerMsg(`* *** Looking up your hostname...`, initialDelay + 1500);
      addServerMsg(`* *** Found your hostname`, initialDelay + 2000);
      addServerMsg(`* *** Checking Ident`, initialDelay + 2200);
      addServerMsg(`* *** No Ident response`, initialDelay + 2800);

      // MOTD
      setTimeout(() => {
        addServerMsg(`- ${server.address} Message of the Day -`, 0);
        server.motd.forEach((line, i) => {
          addServerMsg(`- ${line}`, (i + 1) * 80);
        });
        addServerMsg(`- End of /MOTD command.`, (server.motd.length + 1) * 80);
      }, initialDelay + 3000);

      // Mark as connected – do NOT auto-join; the Favorites dialog will handle that
      setTimeout(() => {
        dispatch({ type: 'CONNECTED' });

        dispatch({
          type: 'ADD_SERVER_MESSAGE',
          message: createMessage('info', `* You are now known as ${nick}`),
        });

        // Verbose: log initial AI config
        if (verboseRef.current) {
          dispatch({
            type: 'ADD_SERVER_MESSAGE',
            message: createMessage('info', `* [Verbose] Connected with AI: provider=${aiSettings.provider}, model=${aiSettings.model || '(default)'}, temperature=${aiSettings.temperature ?? 0.9}${aiSettings.reasoningEffort ? ', reasoning=' + aiSettings.reasoningEffort : ''}`),
          });
        }
      }, initialDelay + 3000 + (server.motd.length + 2) * 80);
    },
    [engine, setupEngineHandlers]
  );

  const joinChannel = useCallback(
    async (channelName: string, currentNick?: string) => {
      const nick = currentNick || state.nick;
      const channel = channelName.startsWith('#') ? channelName : `#${channelName}`;
      const placeholderTopic = getDefaultTopic(channel);
      const network = state.server?.network || 'IRC';

      // Immediately open window with placeholder so the UI responds right away
      dispatch({
        type: 'JOIN_CHANNEL',
        channel,
        users: [{ nick, mode: '' as const, isAI: false }],
        topic: placeholderTopic,
        modes: 'nt',
      });

      // Generate contextual users via LLM (or fall back to personas)
      const { users: aiUsers, userCount, topic } = await engine.generateChannelUsers(channel, network);
      const allUsers: IRCUser[] = [
        { nick, mode: '' as const, isAI: false },
        ...aiUsers,
      ];

      dispatch({
        type: 'ADD_CHANNEL_MESSAGE',
        channel,
        message: createMessage('join', `* Now talking in ${channel}`),
      });
      dispatch({ type: 'UPDATE_CHANNEL_USERS', channel, users: allUsers });
      dispatch({ type: 'SET_TOPIC', channel, topic });

      // Show names list (show displayed count vs actual LLM-reported total)
      // const listedNicks = allUsers
      //   .map((u) => (u.mode === 'o' ? '@' : u.mode === 'v' ? '+' : '') + u.nick)
      //   .join(' ');
      // dispatch({
      //   type: 'ADD_CHANNEL_MESSAGE',
      //   channel,
      //   message: createMessage('server', `* ${channel} [${userCount} total]: ${listedNicks}`),
      // });

      // Start AI conversation activity — pass a getter so the engine always reads live messages
      const initialChannelData = {
        name: channel,
        topic: topic,
        users: allUsers,
        messages: [],
        modes: 'nt',
      };
      engine.startChannelActivity(
        channel,
        () => stateRef.current.channels.get(channel) ?? initialChannelData
      );
    },
    [state.nick, state.server, engine]
  );

  const disconnect = useCallback(() => {
    engine.stopAll();
    // Close the config change WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    dispatch({ type: 'DISCONNECT' });
    soundManager.playDisconnect();
  }, [engine]);

  const handleInput = useCallback(
    (text: string, activeChannel?: string) => {
      const parsed = parseCommand(text);

      if (parsed) {
        switch (parsed.command) {
          case 'JOIN': {
            const channel = parsed.args[0];
            if (channel) joinChannel(channel);
            break;
          }
          case 'PART': {
            const channel = parsed.args[0] || activeChannel;
            if (channel) {
              engine.cleanupChannel(channel);
              dispatch({ type: 'PART_CHANNEL', channel });
            }
            break;
          }
          case 'NICK': {
            const newNick = parsed.args[0];
            if (newNick) {
              const oldNick = state.nick;
              dispatch({ type: 'CHANGE_NICK', nick: newNick });
              engine.setUserNick(newNick);
              dispatch({
                type: 'ADD_SERVER_MESSAGE',
                message: createMessage('nick', `* ${oldNick} is now known as ${newNick}`),
              });
            }
            break;
          }
          case 'MSG': {
            const [target, ...msgParts] = parsed.args;
            const msgText = msgParts.join(' ');
            if (target && msgText) {
              if (target.startsWith('#')) {
                dispatch({
                  type: 'ADD_CHANNEL_MESSAGE',
                  channel: target,
                  message: createMessage('message', msgText, state.nick, target),
                });
              } else {
                dispatch({ type: 'OPEN_QUERY', nick: target });
                dispatch({
                  type: 'ADD_QUERY_MESSAGE',
                  nick: target,
                  message: createMessage('message', msgText, state.nick),
                });
              }
            }
            break;
          }
          case 'QUERY': {
            const target = parsed.args[0];
            if (target) {
              dispatch({ type: 'OPEN_QUERY', nick: target });
            }
            break;
          }
          case 'ME': {
            const actionText = parsed.args.join(' ');
            if (activeChannel && actionText) {
              const channelData = state.channels.get(activeChannel.toLowerCase());
              dispatch({
                type: 'ADD_CHANNEL_MESSAGE',
                channel: activeChannel,
                message: createMessage('action', `* ${state.nick} ${actionText}`, state.nick, activeChannel),
              });
              if (channelData) {
                engine.generateReply(activeChannel, channelData, `* ${state.nick} ${actionText}`, state.nick);
              }
            }
            break;
          }
          case 'TOPIC': {
            const channel = parsed.args[0];
            const topicText = parsed.args.slice(1).join(' ');
            if (channel && topicText) {
              dispatch({ type: 'SET_TOPIC', channel, topic: topicText, nick: state.nick });
            }
            break;
          }
          case 'QUIT': {
            disconnect();
            break;
          }
          case 'WHOIS': {
            const target = parsed.args[0];
            if (target) {
              dispatch({
                type: 'ADD_SERVER_MESSAGE',
                message: createMessage('server', `* [${target}] (~${target}@user.${state.server?.network || 'irc'}.net)`),
              });
              dispatch({
                type: 'ADD_SERVER_MESSAGE',
                message: createMessage('server', `* [${target}] is using a secure connection`),
              });
              dispatch({
                type: 'ADD_SERVER_MESSAGE',
                message: createMessage('server', `* [${target}] End of /WHOIS list.`),
              });
            }
            break;
          }
          case 'LIST': {
            // Handled by the UI to open channel list dialog
            break;
          }
          case 'SERVER': {
            dispatch({
              type: 'ADD_SERVER_MESSAGE',
              message: createMessage('info', '* Use the Connect dialog to change servers.'),
            });
            break;
          }
          default: {
            dispatch({
              type: 'ADD_SERVER_MESSAGE',
              message: createMessage('error', `* Unknown command: ${parsed.command}`),
            });
          }
        }
      } else {
        // Regular message
        if (activeChannel) {
          const channelLower = activeChannel.toLowerCase();
          const channelData = state.channels.get(channelLower) || state.queries.get(channelLower);

          if (state.channels.has(channelLower)) {
            dispatch({
              type: 'ADD_CHANNEL_MESSAGE',
              channel: activeChannel,
              message: createMessage('message', text, state.nick, activeChannel),
            });
            // Trigger AI responses
            if (channelData) {
              engine.generateReply(activeChannel, channelData, text, state.nick);
            }
          } else if (state.queries.has(channelLower)) {
            dispatch({
              type: 'ADD_QUERY_MESSAGE',
              nick: activeChannel,
              message: createMessage('message', text, state.nick),
            });
            // Trigger AI private reply
            engine.generatePrivateReply(activeChannel, text, state.nick);
          }
        }
      }
    },
    [state.nick, state.channels, state.queries, state.server, joinChannel, disconnect, engine]
  );

  const openQuery = useCallback(
    (nick: string, fromChannel?: string) => {
      if (fromChannel) engine.registerPMFromChannel(nick, fromChannel);
      dispatch({ type: 'OPEN_QUERY', nick });
    },
    [engine]
  );

  // Pause AI background generation when the browser tab is hidden to save tokens.
  useEffect(() => {
    const handleVisibility = () => {
      engine.setPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [engine]);

  return {
    state,
    dispatch,
    connect,
    disconnect,
    joinChannel,
    handleInput,
    openQuery,
    conversationEngine: engine,
    setVerboseLogging,
    verboseRef,
  };
}
