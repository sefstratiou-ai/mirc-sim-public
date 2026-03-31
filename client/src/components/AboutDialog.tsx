import React from 'react';

interface AboutDialogProps {
  onClose: () => void;
}

export const AboutDialog: React.FC<AboutDialogProps> = ({ onClose }) => {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-frame about-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
          <div className="window-titlebar-text">About mIRC</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="about-dialog-body">
          <div className="about-logo">⚡</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>mIRC Simulator</div>
          <div style={{ fontSize: '11px' }}>Version 6.35</div>
          <div style={{ fontSize: '10px', color: '#808080', marginTop: '8px' }}>
            A nostalgic recreation of the classic mIRC IRC client.
          </div>
          <div style={{ fontSize: '10px', color: '#808080' }}>
            All users and conversations are AI-generated.
          </div>
          <div style={{ fontSize: '10px', color: '#808080', marginTop: '12px' }}>
            Original mIRC by Khaled Mardam-Bey
          </div>
          <div style={{ fontSize: '10px', color: '#808080' }}>
            This is a tribute/simulation, not affiliated with mIRC Co. Ltd.
          </div>
          <button
            className="win-button"
            onClick={onClose}
            style={{ marginTop: '12px' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
