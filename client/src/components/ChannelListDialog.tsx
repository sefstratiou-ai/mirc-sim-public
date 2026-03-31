import React, { useState } from 'react';

interface ChannelListDialogProps {
  channels: { name: string; users: number; topic: string }[];
  onJoin: (channel: string) => void;
  onClose: () => void;
}

export const ChannelListDialog: React.FC<ChannelListDialogProps> = ({
  channels,
  onJoin,
  onClose,
}) => {
  const [filter, setFilter] = useState('');

  const filtered = channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(filter.toLowerCase()) ||
      ch.topic.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="dialog-overlay">
      <div className="dialog-frame channel-list-dialog">
        <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
          <div className="window-titlebar-text">mIRC Channels List</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="channel-list-body">
          <div className="channel-list-header">
            <label style={{ fontSize: '11px' }}>Filter:</label>
            <input
              className="win-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="win-button" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="channel-list-table">
            <div
              className="channel-list-row"
              style={{ fontWeight: 'bold', background: '#c0c0c0', cursor: 'default' }}
            >
              <div className="col-name">Channel</div>
              <div className="col-users">Users</div>
              <div className="col-topic">Topic</div>
            </div>
            {filtered.map((ch) => (
              <div
                key={ch.name}
                className="channel-list-row"
                onDoubleClick={() => {
                  onJoin(ch.name);
                  onClose();
                }}
              >
                <div className="col-name">{ch.name}</div>
                <div className="col-users">{ch.users}</div>
                <div className="col-topic">{ch.topic}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
