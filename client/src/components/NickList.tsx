import React from 'react';
import { IRCUser } from '../types/irc';

interface NickListProps {
  users: IRCUser[];
  onNickClick?: (nick: string) => void;
  width?: number;
}

export const NickList: React.FC<NickListProps> = ({ users, onNickClick, width = 120 }) => {
  // Sort: ops first, then voiced, then regular — alphabetically within each group
  const sorted = [...users].sort((a, b) => {
    const modeOrder = (m: string) => (m === 'o' ? 0 : m === 'v' ? 1 : 2);
    const diff = modeOrder(a.mode) - modeOrder(b.mode);
    if (diff !== 0) return diff;
    return a.nick.toLowerCase().localeCompare(b.nick.toLowerCase());
  });

  const getPrefix = (mode: string) => {
    if (mode === 'o') return '@';
    if (mode === 'v') return '+';
    return '';
  };

  return (
    <div className="nick-list" style={{ width, minWidth: width, maxWidth: width }}>
      {sorted.map((user) => (
        <div
          key={user.nick}
          className="nick-list-item"
          onDoubleClick={() => onNickClick?.(user.nick)}
          title={user.nick}
        >
          <span className="nick-prefix">{getPrefix(user.mode)}</span>
          {user.nick}
        </div>
      ))}
    </div>
  );
};
