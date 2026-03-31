import React, { useRef, useEffect } from 'react';
import { IRCMessage } from '../types/irc';
import { MessageLine } from './MessageLine';
import { InputBox } from './InputBox';

interface ServerWindowProps {
  messages: IRCMessage[];
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export const ServerWindow: React.FC<ServerWindowProps> = ({ messages, onSubmit, disabled }) => {
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="channel-window">
      <div className="chat-content-area">
        <div className="server-messages" ref={messagesRef}>
          {messages.map((msg) => (
            <MessageLine key={msg.id} message={msg} />
          ))}
        </div>
      </div>
      <InputBox onSubmit={onSubmit} disabled={disabled} />
    </div>
  );
};
