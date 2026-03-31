import React, { useState, useCallback, useMemo } from 'react';
import { TitleBar } from './TitleBar';
import { MenuBar } from './MenuBar';
import { Toolbar } from './Toolbar';
import { Switchbar } from './Switchbar';
import { StatusBar } from './StatusBar';
import { ChatWindow } from './ChatWindow';
import { ServerWindow } from './ServerWindow';
import { MdiWindow } from './MdiWindow';
import { ConnectDialog } from './ConnectDialog';
import { AboutDialog } from './AboutDialog';
import { ChannelListDialog } from './ChannelListDialog';
import { OptionsDialog } from './OptionsDialog';
import { FavoritesDialog } from './FavoritesDialog';
import { StatsDialog } from './StatsDialog';
import { useIRC } from '../hooks/useIRC';
import { IRCServer, AIProvider, AISettings } from '../types/irc';
import { channelTopics } from '../data/topics';
import '../styles/mirc.css';

const App: React.FC = () => {
  const { state, dispatch, connect, disconnect, joinChannel, handleInput, openQuery, conversationEngine, setVerboseLogging, verboseRef } = useIRC();
  const [showConnectDialog, setShowConnectDialog] = useState(true);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showChannelList, setShowChannelList] = useState(false);
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [verboseLogging, setVerboseLoggingState] = useState(false);
  // Token stats are read from the engine on every render — no extra state needed
  const tokenStats = conversationEngine.getTokenStats();

  const handleConnect = useCallback(
    (nick: string, server: IRCServer, aiSettings: AISettings) => {
      setShowConnectDialog(false);
      connect(nick, server, aiSettings as AISettings);
      // Show favorites after the MOTD sequence completes (~3s)
      const motdDelay = 3000 + (server.motd?.length ?? 10) * 80 + 500;
      setTimeout(() => setShowFavorites(true), motdDelay);
    },
    [connect]
  );

  const handleWindowSelect = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_ACTIVE_WINDOW', windowId: id });
    },
    [dispatch]
  );

  const handleJoinChannel = useCallback(() => {
    const channel = prompt('Enter channel name (e.g., #chat):');
    if (channel) {
      joinChannel(channel);
    }
  }, [joinChannel]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (!state.activeWindowId) return;

      // Determine the active channel/query name
      const activeWindow = state.windows.find((w) => w.id === state.activeWindowId);
      if (!activeWindow) return;

      let channelName: string | undefined;
      if (activeWindow.type === 'channel') {
        channelName = activeWindow.name;
      } else if (activeWindow.type === 'query') {
        channelName = activeWindow.name;
      }

      // Check if /list command
      if (text.trim().toLowerCase() === '/list') {
        setShowChannelList(true);
        return;
      }

      handleInput(text, channelName);
    },
    [state.activeWindowId, state.windows, handleInput]
  );

  const handleNickClick = useCallback(
    (nick: string) => {
      const activeWin = state.windows.find((w) => w.id === state.activeWindowId);
      const fromChannel = activeWin?.type === 'channel' ? activeWin.name : undefined;
      openQuery(nick, fromChannel);
    },
    [openQuery, state.windows, state.activeWindowId]
  );

  // Get current channel list for the dialog
  const channelListData = useMemo(() => {
    if (!state.server) return [];
    const serverChannels = state.server.defaultChannels.map((ch) => ({
      name: ch,
      users: 10 + Math.floor(Math.random() * 50),
      topic: channelTopics[ch] || `Welcome to ${ch}`,
    }));
    // Add more random channels
    const extraChannels = ['#music', '#trivia', '#tech', '#gaming', '#lounge', '#fun'];
    extraChannels.forEach((ch) => {
      if (!serverChannels.find((s) => s.name === ch)) {
        serverChannels.push({
          name: ch,
          users: 5 + Math.floor(Math.random() * 30),
          topic: channelTopics[ch] || `Welcome to ${ch}`,
        });
      }
    });
    return serverChannels;
  }, [state.server]);

  return (
    <div className="mirc-app">
      <TitleBar
        nick={state.nick || 'mIRC'}
        network={state.server?.network || 'IRC'}
      />
      <MenuBar
        connected={state.connected}
        onConnect={() => setShowConnectDialog(true)}
        onDisconnect={disconnect}
        onOptions={() => setShowOptionsDialog(true)}
        onFavorites={() => setShowFavorites(true)}
        onAbout={() => setShowAboutDialog(true)}
        onShowStats={() => setShowStats(true)}
        onCascade={() => dispatch({ type: 'CASCADE_WINDOWS' })}
        onTileHorizontal={() => dispatch({ type: 'TILE_HORIZONTAL' })}
        onTileVertical={() => dispatch({ type: 'TILE_VERTICAL' })}
        onJoinChannel={handleJoinChannel}
        verboseLogging={verboseLogging}
        onToggleVerbose={() => {
          const next = !verboseLogging;
          setVerboseLoggingState(next);
          setVerboseLogging(next);
        }}
      />
      <Toolbar
        connected={state.connected}
        onConnect={() => setShowConnectDialog(true)}
        onDisconnect={disconnect}
        onOptions={() => setShowOptionsDialog(true)}
        onFavorites={() => setShowFavorites(true)}
      />
      <Switchbar
        windows={state.windows}
        activeWindowId={state.activeWindowId}
        onWindowSelect={handleWindowSelect}
      />

      <div className="mirc-mdi-area">
        {state.windows.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#c0c0c0',
            fontSize: '14px',
            userSelect: 'none',
          }}>
            Welcome to mIRC Simulator. Click Connect to begin.
          </div>
        )}

        {/* Render ALL windows as MDI floating children */}
        {(() => {
          let minimizedCount = 0;
          return state.windows.map((win) => {
            const isActive = win.id === state.activeWindowId;
            const minIdx = win.minimized ? minimizedCount++ : 0;

            const winContent = (() => {
              if (win.type === 'server') {
                return (
                  <ServerWindow
                    messages={state.serverMessages}
                    onSubmit={handleSubmit}
                    disabled={!state.connected}
                  />
                );
              }
              if (win.type === 'channel') {
                const ch = state.channels.get(win.name.toLowerCase());
                if (!ch) return null;
                return (
                  <ChatWindow
                    channel={ch}
                    showNickList
                    onSubmit={handleSubmit}
                    onNickClick={handleNickClick}
                    disabled={!state.connected}
                  />
                );
              }
              if (win.type === 'query') {
                const q = state.queries.get(win.name.toLowerCase());
                if (!q) return null;
                return (
                  <ChatWindow
                    channel={q}
                    showNickList={false}
                    onSubmit={handleSubmit}
                    disabled={!state.connected}
                  />
                );
              }
              return null;
            })();

            return (
              <MdiWindow
                key={win.id}
                id={win.id}
                title={win.title}
                x={win.x}
                y={win.y}
                width={win.width}
                height={win.height}
                minimized={win.minimized}
                maximized={win.maximized}
                active={isActive}
                minimizedIndex={minIdx}
                onFocus={() => dispatch({ type: 'SET_ACTIVE_WINDOW', windowId: win.id })}
                onMove={(x, y) => dispatch({ type: 'MOVE_WINDOW', windowId: win.id, x, y })}
                onResize={(w, h) => dispatch({ type: 'RESIZE_WINDOW', windowId: win.id, width: w, height: h })}
                onMinimize={() => dispatch({ type: 'MINIMIZE_WINDOW', windowId: win.id })}
                onMaximize={() => dispatch({ type: 'MAXIMIZE_WINDOW', windowId: win.id })}
                onRestore={() => dispatch({ type: 'RESTORE_WINDOW', windowId: win.id })}
                onClose={() => {
                  // If closing a channel window, fully clean up engine state
                  if (win.id.startsWith('channel-')) {
                    const channelName = win.id.slice('channel-'.length);
                    conversationEngine.cleanupChannel(channelName);
                    dispatch({ type: 'PART_CHANNEL', channel: channelName });
                  } else {
                    dispatch({ type: 'CLOSE_WINDOW', windowId: win.id });
                  }
                }}
              >
                {winContent}
              </MdiWindow>
            );
          });
        })()}
      </div>

      <StatusBar
        nick={state.nick}
        userModes={state.userModes}
        network={state.server?.network || ''}
        serverAddress={state.server?.address || ''}
        port={state.server?.port || 6667}
        connected={state.connected}
      />

      {/* Dialogs */}
      {showConnectDialog && (
        <ConnectDialog
          onConnect={handleConnect}
          onCancel={() => setShowConnectDialog(false)}
        />
      )}
      {showAboutDialog && (
        <AboutDialog onClose={() => setShowAboutDialog(false)} />
      )}
      {showChannelList && (
        <ChannelListDialog
          channels={channelListData}
          onJoin={(ch) => joinChannel(ch)}
          onClose={() => setShowChannelList(false)}
        />
      )}
      {showOptionsDialog && (
        <OptionsDialog onClose={() => setShowOptionsDialog(false)} />
      )}
      {showFavorites && (
        <FavoritesDialog
          currentNetwork={state.server?.network}
          onJoin={(ch) => joinChannel(ch)}
          onClose={() => setShowFavorites(false)}
        />
      )}
      {showStats && (() => {
        const cumStats = conversationEngine.getCumulativeTokenStats();
        const sessionBreakdown = conversationEngine.getTokenBreakdown();
        const cumulativeBreakdown = conversationEngine.getCumulativeTokenBreakdown();
        return (
          <StatsDialog
            inputTokens={tokenStats.inputTokens}
            outputTokens={tokenStats.outputTokens}
            totalTokens={tokenStats.totalTokens}
            cumulativeInputTokens={cumStats.inputTokens}
            cumulativeOutputTokens={cumStats.outputTokens}
            cumulativeTotalTokens={cumStats.totalTokens}
            sessionBreakdown={sessionBreakdown}
            cumulativeBreakdown={cumulativeBreakdown}
            onClose={() => setShowStats(false)}
            onReset={() => { conversationEngine.resetTokenStats(); setShowStats(false); }}
            onResetCumulative={() => { conversationEngine.resetCumulativeTokenStats(); setShowStats(false); }}
          />
        );
      })()}
    </div>
  );
};

export default App;
