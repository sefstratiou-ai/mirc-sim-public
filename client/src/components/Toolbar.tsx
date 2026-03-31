import React from 'react';

interface ToolbarProps {
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOptions: () => void;
  onFavorites: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  connected,
  onConnect,
  onDisconnect,
  onOptions,
  onFavorites,
}) => {
  return (
    <div className="mirc-toolbar">
      <button
        className="mirc-toolbar-btn"
        title={connected ? 'Disconnect' : 'Connect to Server'}
        onClick={connected ? onDisconnect : onConnect}
      >
        <img
          src={connected ? '/icons/disconnect.png' : '/icons/connect.png'}
          alt={connected ? 'Disconnect' : 'Connect'}
          width={20}
          height={20}
          style={{ display: 'block' }}
        />
      </button>
      <button className="mirc-toolbar-btn" title="Options" onClick={onOptions}>
        <img src="/icons/options.png" alt="Options" width={20} height={20} style={{ display: 'block' }} />
      </button>
      <button
        className="mirc-toolbar-btn"
        title="Favorites"
        onClick={onFavorites}
        disabled={!connected}
      >
        <img src="/icons/favorites.png" alt="Favorites" width={20} height={20} style={{ display: 'block' }} />
      </button>
    </div>
  );
};
