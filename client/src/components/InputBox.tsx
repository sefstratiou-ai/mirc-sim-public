import React, { useState, useRef, useCallback } from 'react';
import { IRCUser } from '../types/irc';

interface InputBoxProps {
  onSubmit: (text: string) => void;
  users?: IRCUser[];
  disabled?: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({ onSubmit, users, disabled }) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const text = value.trim();
        if (text && !disabled) {
          onSubmit(text);
          setHistory((prev) => [text, ...prev].slice(0, 50));
          setHistoryIndex(-1);
          setValue('');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length > 0) {
          const newIndex = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          setValue(history[newIndex]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setValue(history[newIndex]);
        } else {
          setHistoryIndex(-1);
          setValue('');
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Tab nick completion
        if (users && value.length > 0) {
          const words = value.split(' ');
          const lastWord = words[words.length - 1].toLowerCase();
          if (lastWord) {
            const match = users.find((u) =>
              u.nick.toLowerCase().startsWith(lastWord)
            );
            if (match) {
              words[words.length - 1] = match.nick + (words.length === 1 ? ': ' : ' ');
              setValue(words.join(' '));
            }
          }
        }
      }
    },
    [value, history, historyIndex, onSubmit, users]
  );

  return (
    <div className="chat-input-container">
      <input
        ref={inputRef}
        className="chat-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Disconnected' : 'Type here...'}
        disabled={disabled}
        autoFocus={!disabled}
        style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
      />
    </div>
  );
};
