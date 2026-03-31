import React, { useRef, useEffect, useState, useCallback } from 'react';
import { IRCChannel } from '../types/irc';
import { MessageLine } from './MessageLine';
import { NickList } from './NickList';
import { InputBox } from './InputBox';

interface ChatWindowProps {
  channel: IRCChannel;
  showNickList?: boolean;
  onSubmit: (text: string) => void;
  onNickClick?: (nick: string) => void;
  disabled?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  channel,
  showNickList = true,
  onSubmit,
  onNickClick,
  disabled,
}) => {
  const messagesRef = useRef<HTMLDivElement>(null);
  const [nickListWidth, setNickListWidth] = useState(120);
  const isDraggingRef = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = nickListWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Moving left increases nick list width (divider is on the left side of nick list)
      const delta = startX - ev.clientX;
      const newWidth = Math.max(80, Math.min(300, startWidth + delta));
      setNickListWidth(newWidth);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [nickListWidth]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [channel.messages.length]);

  return (
    <div className="channel-window">
      {channel.topic && (
        <div
          style={{
            padding: '2px 4px',
            background: '#c0c0c0',
            borderBottom: '1px solid #808080',
            fontSize: '11px',
            fontFamily: 'Tahoma, MS Sans Serif, sans-serif',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={channel.topic}
        >
          {channel.topic}
        </div>
      )}
      <div className="chat-content-area">
        <div className="chat-messages" ref={messagesRef}>
          {channel.messages.map((msg) => (
            <MessageLine key={msg.id} message={msg} />
          ))}
        </div>
        {showNickList && (
          <>
            <div
              style={{
                width: 4,
                cursor: 'ew-resize',
                background: '#c0c0c0',
                borderLeft: '1px solid #808080',
                borderRight: '1px solid #dfdfdf',
                flexShrink: 0,
              }}
              onMouseDown={handleDividerMouseDown}
            />
            <NickList users={channel.users} onNickClick={onNickClick} width={nickListWidth} />
          </>
        )}
      </div>
      <InputBox onSubmit={onSubmit} users={channel.users} disabled={disabled} />
    </div>
  );
};
