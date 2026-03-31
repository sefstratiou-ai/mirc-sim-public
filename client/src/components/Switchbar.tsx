import React from 'react';
import { WindowState } from '../types/irc';

interface SwitchbarProps {
  windows: WindowState[];
  activeWindowId: string | null;
  onWindowSelect: (id: string) => void;
}

export const Switchbar: React.FC<SwitchbarProps> = ({
  windows,
  activeWindowId,
  onWindowSelect,
}) => {
  if (windows.length === 0) return null;

  const getIcon = (w: WindowState) => {
    if (w.type === 'server') return '📡';
    if (w.type === 'channel') return '';
    return '';
  };

  return (
    <div className="mirc-switchbar">
      {windows.map((w) => (
        <button
          key={w.id}
          className={`mirc-switchbar-btn ${
            activeWindowId === w.id ? 'active' : ''
          } ${w.highlighted ? 'highlight' : ''} ${w.unread ? 'unread' : ''}`}
          onClick={() => onWindowSelect(w.id)}
        >
          <span className="mirc-switchbar-icon">{getIcon(w)}</span>
          {w.name}
        </button>
      ))}
    </div>
  );
};
