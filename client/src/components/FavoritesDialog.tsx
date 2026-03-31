import React, { useState, useEffect, useRef } from 'react';
import { FavoriteChannel, loadFavorites, saveFavorites } from '../data/favorites';

interface FavoritesDialogProps {
  currentNetwork?: string;
  onJoin: (channel: string) => void;
  onClose: () => void;
}

const PREF_KEY = 'mirc_fav_prefs';

function loadPrefs() {
  try {
    const s = localStorage.getItem(PREF_KEY);
    if (s) return JSON.parse(s) as { showOnConnect: boolean; joinOnConnect: boolean };
  } catch { /* ignore */ }
  return { showOnConnect: true, joinOnConnect: true };
}

function savePrefs(p: { showOnConnect: boolean; joinOnConnect: boolean }) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export const FavoritesDialog: React.FC<FavoritesDialogProps> = ({
  currentNetwork,
  onJoin,
  onClose,
}) => {
  const [favorites, setFavorites] = useState<FavoriteChannel[]>(loadFavorites);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [channelInput, setChannelInput] = useState('');
  const [networkFilter, setNetworkFilter] = useState(currentNetwork || 'All Networks');
  const [prefs, setPrefs] = useState(loadPrefs);
  const [editMode, setEditMode] = useState<'add' | 'edit' | null>(null);
  const [editChannel, setEditChannel] = useState('');
  const [editNetwork, setEditNetwork] = useState(currentNetwork || 'UnderNet');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Networks present in the list
  const allNetworks = Array.from(new Set(favorites.map((f) => f.network))).sort();

  const filtered = networkFilter === 'All Networks'
    ? favorites
    : favorites.filter((f) => f.network === networkFilter);

  const handleJoin = () => {
    const target = channelInput.trim() || (selectedIndex !== null ? filtered[selectedIndex]?.name : null);
    if (!target) return;
    const ch = target.startsWith('#') ? target : `#${target}`;
    onJoin(ch);
    onClose();
  };

  const handleRowDoubleClick = (idx: number) => {
    setSelectedIndex(idx);
    const ch = filtered[idx].name;
    onJoin(ch.startsWith('#') ? ch : `#${ch}`);
    onClose();
  };

  const handleAdd = () => {
    setEditChannel('');
    setEditNetwork(networkFilter === 'All Networks' ? (currentNetwork || 'UnderNet') : networkFilter);
    setEditMode('add');
  };

  const handleEdit = () => {
    if (selectedIndex === null) return;
    const item = filtered[selectedIndex];
    setEditChannel(item.name);
    setEditNetwork(item.network);
    setEditMode('edit');
  };

  const handleDelete = () => {
    if (selectedIndex === null) return;
    const item = filtered[selectedIndex];
    const updated = favorites.filter((f) => f !== item);
    setFavorites(updated);
    saveFavorites(updated);
    setSelectedIndex(null);
  };

  const handleEditConfirm = () => {
    const name = editChannel.trim();
    if (!name) return;
    const ch = name.startsWith('#') ? name : `#${name}`;
    let updated: FavoriteChannel[];
    if (editMode === 'add') {
      updated = [...favorites, { name: ch, network: editNetwork }];
    } else {
      const item = filtered[selectedIndex!];
      updated = favorites.map((f) =>
        f === item ? { name: ch, network: editNetwork } : f
      );
    }
    setFavorites(updated);
    saveFavorites(updated);
    setEditMode(null);
    setSelectedIndex(null);
  };

  const handlePrefs = (key: 'showOnConnect' | 'joinOnConnect', val: boolean) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    savePrefs(updated);
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-frame" style={{ width: 420, padding: 0 }}>
        {/* Title bar */}
        <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
          <div className="window-titlebar-text">mIRC Favorites</div>
          <div className="window-titlebar-buttons">
            <button className="window-titlebar-btn close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ padding: '10px 10px 6px 10px' }}>
          {/* Channel name input + Join */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: 'Tahoma, MS Sans Serif, sans-serif', marginBottom: 2 }}>
                Type a channel name:
              </div>
              <input
                ref={inputRef}
                className="win-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="#channel"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="win-button"
                style={{ minWidth: 60, marginBottom: 1 }}
                onClick={handleJoin}
              >
                Join
              </button>
            </div>
          </div>

          {/* Network dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontFamily: 'Tahoma, MS Sans Serif, sans-serif' }}>Network:</span>
            <select
              className="win-select"
              style={{ flex: 1 }}
              value={networkFilter}
              onChange={(e) => { setNetworkFilter(e.target.value); setSelectedIndex(null); }}
            >
              <option value="All Networks">All Networks</option>
              {allNetworks.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Channel list + buttons side by side */}
          <div style={{ display: 'flex', gap: 6 }}>
            {/* List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                background: '#c0c0c0',
                borderTop: '2px solid #dfdfdf',
                borderLeft: '2px solid #dfdfdf',
                borderRight: '2px solid #808080',
                fontSize: 11,
                fontFamily: 'Tahoma, MS Sans Serif, sans-serif',
                userSelect: 'none',
              }}>
                <div style={{ flex: 1, padding: '1px 4px', borderRight: '1px solid #808080' }}>Channel</div>
                <div style={{ width: 90, padding: '1px 4px' }}>Network</div>
              </div>
              {/* Rows */}
              <div style={{
                height: 220,
                overflowY: 'auto',
                border: '2px solid',
                borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                background: 'white',
              }}>
                {filtered.map((item, idx) => (
                  <div
                    key={`${item.name}-${item.network}-${idx}`}
                    style={{
                      display: 'flex',
                      background: idx === selectedIndex ? '#000080' : 'white',
                      color: idx === selectedIndex ? 'white' : 'black',
                      cursor: 'default',
                      fontSize: 11,
                      fontFamily: 'Tahoma, MS Sans Serif, sans-serif',
                    }}
                    onClick={() => setSelectedIndex(idx)}
                    onDoubleClick={() => handleRowDoubleClick(idx)}
                  >
                    <div style={{ flex: 1, padding: '1px 4px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ width: 90, padding: '1px 4px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {item.network}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right button column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 72 }}>
              <button className="win-button" style={{ width: '100%' }} onClick={handleAdd}>Add...</button>
              <button
                className="win-button"
                style={{ width: '100%' }}
                onClick={handleEdit}
                disabled={selectedIndex === null}
              >
                Edit...
              </button>
              <button
                className="win-button"
                style={{ width: '100%' }}
                onClick={handleDelete}
                disabled={selectedIndex === null}
              >
                Delete
              </button>
              <div style={{ flex: 1 }} />
              <button className="win-button primary" style={{ width: '100%' }} onClick={handleJoin}>
                Join
              </button>
              <button className="win-button" style={{ width: '100%' }} onClick={onClose}>
                OK
              </button>
            </div>
          </div>

          {/* Checkboxes */}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, fontFamily: 'Tahoma, MS Sans Serif, sans-serif', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.showOnConnect}
                onChange={(e) => handlePrefs('showOnConnect', e.target.checked)}
              />
              Show favorites on connect
            </label>
            <label style={{ fontSize: 11, fontFamily: 'Tahoma, MS Sans Serif, sans-serif', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.joinOnConnect}
                onChange={(e) => handlePrefs('joinOnConnect', e.target.checked)}
              />
              Enable join on connect
            </label>
          </div>
        </div>
      </div>

      {/* Add/Edit sub-dialog */}
      {editMode && (
        <div className="dialog-overlay" style={{ zIndex: 1001 }}>
          <div className="dialog-frame" style={{ width: 300, padding: 0 }}>
            <div className="window-titlebar" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
              <div className="window-titlebar-text">{editMode === 'add' ? 'Add Favorite' : 'Edit Favorite'}</div>
              <div className="window-titlebar-buttons">
                <button className="window-titlebar-btn close" onClick={() => setEditMode(null)}>✕</button>
              </div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontFamily: 'Tahoma, MS Sans Serif, sans-serif', minWidth: 60 }}>Channel:</span>
                <input
                  className="win-input"
                  style={{ flex: 1 }}
                  value={editChannel}
                  onChange={(e) => setEditChannel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditConfirm()}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontFamily: 'Tahoma, MS Sans Serif, sans-serif', minWidth: 60 }}>Network:</span>
                <input
                  className="win-input"
                  style={{ flex: 1 }}
                  value={editNetwork}
                  onChange={(e) => setEditNetwork(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button className="win-button primary" onClick={handleEditConfirm}>OK</button>
                <button className="win-button" onClick={() => setEditMode(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
