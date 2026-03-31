import React, { useRef, useCallback } from 'react';

interface MdiWindowProps {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  active: boolean;
  minimizedIndex: number; // slot index for minimized icon row
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export const MdiWindow: React.FC<MdiWindowProps> = ({
  title,
  x,
  y,
  width,
  height,
  minimized,
  maximized,
  active,
  minimizedIndex,
  onFocus,
  onMove,
  onResize,
  onMinimize,
  onMaximize,
  onRestore,
  onClose,
  children,
}) => {
  const isDragging = useRef(false);
  const isResizing = useRef(false);

  const handleTitleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window-titlebar-btn')) return;
      if (maximized) return; // can't drag maximized
      e.preventDefault();
      onFocus();
      isDragging.current = true;
      const startX = e.clientX - x;
      const startY = e.clientY - y;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        onMove(ev.clientX - startX, ev.clientY - startY);
      };
      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [x, y, maximized, onFocus, onMove]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = width;
      const startH = height;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const newW = Math.max(280, startW + ev.clientX - startX);
        const newH = Math.max(180, startH + ev.clientY - startY);
        onResize(newW, newH);
      };
      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width, height, onResize]
  );

  // ── Minimized state: hidden from MDI area, only visible in switchbar ──
  if (minimized) {
    return null;
  }

  // ── Maximized state ──
  if (maximized) {
    return (
      <div
        className={`window-frame mdi-child${active ? ' active' : ''}`}
        style={{ position: 'absolute', inset: 0, zIndex: active ? 100 : 50 }}
        onMouseDown={onFocus}
      >
        <div className="window-titlebar" onDoubleClick={onRestore}>
          <div className="window-titlebar-text">{title}</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn" onClick={onMinimize} title="Minimize">_</button>
            <button className="window-titlebar-btn" onClick={onRestore} title="Restore">❐</button>
            <button className="window-titlebar-btn close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>
        <div className="mdi-window-body">{children}</div>
      </div>
    );
  }

  // ── Normal floating window ──
  return (
    <div
      className={`window-frame mdi-child${active ? ' active' : ''}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        zIndex: active ? 100 : 50,
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseDown={onFocus}
    >
      <div className="window-titlebar" onMouseDown={handleTitleBarMouseDown} onDoubleClick={onMaximize} style={{ cursor: 'move' }}>
        <div className="window-titlebar-text">{title}</div>
        <div className="window-titlebar-buttons">
          <button className="window-titlebar-btn" onClick={onMinimize} title="Minimize">_</button>
          <button className="window-titlebar-btn" onClick={onMaximize} title="Maximize">□</button>
          <button className="window-titlebar-btn close" onClick={onClose} title="Close">✕</button>
        </div>
      </div>
      <div className="mdi-window-body">{children}</div>
      {/* SE resize handle */}
      <div
        className="window-resize-handle"
        onMouseDown={handleResizeMouseDown}
        style={{ cursor: 'nwse-resize' }}
      />
    </div>
  );
};
