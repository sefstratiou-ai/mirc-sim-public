import React from 'react';

interface TitleBarProps {
  nick: string;
  network: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ nick, network }) => {
  return (
    <div className="mirc-titlebar">
      <div className="mirc-titlebar-icon">
        <img
          src="/icons/favicon.png"
          alt="mIRC"
          width={20}
          height={20}
        />
      </div>
      <div className="mirc-titlebar-text">
        mIRC {network != 'IRC' ? ` - [${nick} on ${network || 'IRC'}]` : ''}
      </div>
      <div className="mirc-titlebar-buttons">
        <button className="window-titlebar-btn" title="Minimize">_</button>
        <button className="window-titlebar-btn" title="Maximize">□</button>
        <button className="window-titlebar-btn close" title="Close">✕</button>
      </div>
    </div>
  );
};
