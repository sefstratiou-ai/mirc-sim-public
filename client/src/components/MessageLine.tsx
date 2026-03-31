import React from 'react';
import { IRCMessage } from '../types/irc';
import { renderColoredText } from '../engine/ColorParser';

interface MessageLineProps {
  message: IRCMessage;
  showTimestamp?: boolean;
}

function getNickColor(nick: string): string {
  let hash = 0;
  for (let i = 0; i < nick.length; i++) {
    hash = nick.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `nick-color-${Math.abs(hash) % 10}`;
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `[${h}:${m}]`;
}

// Detect URLs and make them clickable
function renderWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          className="chat-link"
          href={part}
          target="_blank"
          rel="noopener noreferrer"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={i}>{renderColoredText(part)}</React.Fragment>;
  });
}

export const MessageLine: React.FC<MessageLineProps> = ({ message, showTimestamp = true }) => {
  const timestamp = showTimestamp ? (
    <span className="timestamp">{formatTime(message.timestamp)} </span>
  ) : null;

  switch (message.type) {
    case 'message':
      return (
        <div className="message-line">
          {timestamp}
          <span className={`nick ${getNickColor(message.nick || '')}`}>
            &lt;{message.nick}&gt;
          </span>{' '}
          {renderWithLinks(message.content)}
        </div>
      );

    case 'action':
      return (
        <div className="message-line action">
          {timestamp}
          {renderWithLinks(message.content)}
        </div>
      );

    case 'join':
    case 'part':
    case 'quit':
    case 'nick':
    case 'mode':
    case 'topic':
    case 'kick':
      return (
        <div className="message-line system">
          {timestamp}
          {message.content}
        </div>
      );

    case 'notice':
      return (
        <div className="message-line notice">
          {timestamp}
          -{message.nick || 'Server'}- {renderWithLinks(message.content)}
        </div>
      );

    case 'server':
    case 'motd':
    case 'info':
      return (
        <div className="message-line">
          {timestamp}
          {renderWithLinks(message.content)}
        </div>
      );

    case 'error':
      return (
        <div className="message-line error">
          {timestamp}
          {message.content}
        </div>
      );

    case 'ctcp':
      return (
        <div className="message-line notice">
          {timestamp}
          [{message.nick} CTCP] {message.content}
        </div>
      );

    default:
      return (
        <div className="message-line">
          {timestamp}
          {message.content}
        </div>
      );
  }
};
