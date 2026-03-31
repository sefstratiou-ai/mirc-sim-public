import React from 'react';

interface StatusBarProps {
  nick: string;
  userModes: string;
  network: string;
  serverAddress: string;
  port: number;
  connected: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  nick,
  userModes,
  network,
  serverAddress,
  port,
  connected,
}) => {
  const text = connected
    ? `Status: ${nick} [+${userModes}] on ${network} (${serverAddress}:${port})`
    : 'Status: Not connected';

  return (
    <div className="mirc-statusbar">
      <div className="mirc-statusbar-text">{text}</div>
    </div>
  );
};
