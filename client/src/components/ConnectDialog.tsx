import React, { useState, useEffect } from 'react';
import { IRCServer, AIProvider as AIProviderType } from '../types/irc';
import { servers } from '../data/servers';

interface ActiveAIConfigResponse {
  provider?: AIProviderType;
  hasApiKey?: boolean;
  lmstudioUrl?: string;
  model?: string;
  reasoningEffort?: string;
  temperature?: number;
}

interface ConnectDialogProps {
  onConnect: (nick: string, server: IRCServer, aiSettings: {
    provider: AIProviderType;
    apiKey: string;
    lmStudioUrl: string;
    model: string;
    reasoningEffort?: string;
    temperature?: number;
  }) => void;
  onCancel: () => void;
}

const showAISettings = import.meta.env.VITE_SHOW_AI_SETTINGS === 'true';

export const ConnectDialog: React.FC<ConnectDialogProps> = ({ onConnect, onCancel }) => {
  const [nick, setNick] = useState(() => localStorage.getItem('mirc-sim-nick') || 'mIRC_User');
  const [selectedServer, setSelectedServer] = useState(2);
  const [aiProvider, setAiProvider] = useState<AIProviderType>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [temperature, setTemperature] = useState(0.9);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [connectBlockedMessage, setConnectBlockedMessage] = useState('');

  // Fetch active AI config from server on mount
  useEffect(() => {
    fetch('/api/ai-config')
      .then(res => res.json())
      .then((cfg: ActiveAIConfigResponse) => {
        setAiProvider(cfg.provider || 'gemini');
        setLmStudioUrl(cfg.lmstudioUrl || 'http://localhost:1234');
        setModel(cfg.model || '');
        setReasoningEffort(cfg.reasoningEffort || '');
        setTemperature(cfg.temperature ?? 0.9);

        const provider = cfg.provider || 'gemini';
        const requiresApiKey = provider !== 'lmstudio';
        setConnectBlockedMessage(
          !cfg.hasApiKey && requiresApiKey
            ? `The active AI provider (${provider}) is not configured yet. Add an API key in the admin stats dashboard before connecting.`
            : ''
        );

        setConfigLoaded(true);
      })
      .catch(() => {
        // Fall back to defaults if server unreachable
        setConnectBlockedMessage('');
        setConfigLoaded(true);
      });
  }, []);

  const isConnectBlocked = configLoaded && !!connectBlockedMessage;

  const handleConnect = () => {
    if (!nick.trim() || isConnectBlocked) return;
    localStorage.setItem('mirc-sim-nick', nick.trim());
    onConnect(nick.trim(), servers[selectedServer], {
      provider: aiProvider,
      apiKey,
      lmStudioUrl,
      model,
      reasoningEffort: reasoningEffort || undefined,
      temperature,
    });
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-frame connect-dialog">
        <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
          <div className="window-titlebar-text">mIRC - Connect to Server</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn close" onClick={onCancel}>✕</button>
          </div>
        </div>
        <div className="connect-dialog-body">
          <div className="connect-dialog-row">
            <label>Nickname:</label>
            <input
              className="win-input"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              style={{ flex: 1 }}
            />
          </div>
          <div className="connect-dialog-row">
            <label>IRC Server:</label>
            <select
              className="win-select"
              value={selectedServer}
              onChange={(e) => setSelectedServer(Number(e.target.value))}
              style={{ flex: 1 }}
            >
              {servers.map((s, i) => (
                <option key={i} value={i}>
                  {s.name} ({s.address})
                </option>
              ))}
            </select>
          </div>

          {showAISettings && <div style={{ borderTop: '1px solid #808080', margin: '8px 0', paddingTop: '8px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>AI Settings (optional)</div>
            <div className="connect-dialog-row">
              <label>AI Provider:</label>
              <select
                className="win-select"
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as AIProviderType)}
                style={{ flex: 1 }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="lmstudio">LM Studio (Local)</option>
              </select>
            </div>
            {aiProvider !== 'lmstudio' ? (
              <div className="connect-dialog-row">
                <label>API Key:</label>
                <input
                  className="win-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key..."
                  style={{ flex: 1 }}
                />
              </div>
            ) : (
              <div className="connect-dialog-row">
                <label>LM Studio URL:</label>
                <input
                  className="win-input"
                  value={lmStudioUrl}
                  onChange={(e) => setLmStudioUrl(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  style={{ flex: 1 }}
                />
              </div>
            )}
            <div className="connect-dialog-row">
              <label>Model (optional):</label>
              <input
                className="win-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={aiProvider === 'gemini' ? 'gemini-pro' : aiProvider === 'openai' ? 'gpt-3.5-turbo' : 'default'}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ fontSize: '10px', color: '#808080', marginTop: '4px' }}>
              Without an API key, AI users will use scripted responses.
            </div>
          </div>}

          {isConnectBlocked && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 10px',
                border: '1px solid #a55',
                background: '#fff4e5',
                color: '#7a1f1f',
                fontSize: '11px',
                lineHeight: 1.4,
              }}
            >
              {connectBlockedMessage}
            </div>
          )}
        </div>
        <div className="connect-dialog-buttons">
          <button className="win-button primary" onClick={handleConnect} disabled={!configLoaded || isConnectBlocked}>
            Connect
          </button>
          <button className="win-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

