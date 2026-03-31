import React from 'react';

interface OptionsDialogProps {
  onClose: () => void;
}

export const OptionsDialog: React.FC<OptionsDialogProps> = ({ onClose }) => {
  return (
    <div className="dialog-overlay">
      <div className="dialog-frame options-dialog">
        <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
          <div className="window-titlebar-text">mIRC Options</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="options-dialog-body">
          <div className="options-sidebar">
            {['Connect', 'IRC', 'Sounds', 'Display', 'Colors', 'DCC', 'Other'].map((tab) => (
              <div key={tab} className="win-listbox-item" style={{ padding: '4px 8px' }}>
                📁 {tab}
              </div>
            ))}
          </div>
          <div className="options-content">
            <div style={{ fontSize: '11px', color: '#808080', textAlign: 'center', marginTop: '40px' }}>
              <p>mIRC Options</p>
              <p style={{ marginTop: '8px' }}>Settings are simulated for the nostalgic experience.</p>
              <p style={{ marginTop: '4px' }}>This dialog is for display purposes only.</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '8px 12px', borderTop: '1px solid #808080' }}>
          <button className="win-button" onClick={onClose}>OK</button>
          <button className="win-button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
