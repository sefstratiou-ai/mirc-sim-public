import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MenuItem {
  label: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
}

interface MenuBarProps {
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOptions: () => void;
  onFavorites: () => void;
  onAbout: () => void;
  onShowStats: () => void;
  onCascade: () => void;
  onTileHorizontal: () => void;
  onTileVertical: () => void;
  onJoinChannel: () => void;
  verboseLogging: boolean;
  onToggleVerbose: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  connected,
  onConnect,
  onDisconnect,
  onOptions,
  onFavorites,
  onAbout,
  onShowStats,
  onCascade,
  onTileHorizontal,
  onTileVertical,
  onJoinChannel,
  verboseLogging,
  onToggleVerbose,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeMenu]);

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'Connect', action: onConnect, disabled: connected },
      { label: 'Disconnect', action: onDisconnect, disabled: !connected },
      { label: '', separator: true },
      { label: 'Select Server...', action: onConnect },
      { label: 'Options...', action: onOptions },
      { label: '', separator: true },
      { label: 'Exit', action: () => {} },
    ],
    View: [
      { label: 'Font...', disabled: true },
      { label: 'Colors...', disabled: true },
      { label: '', separator: true },
      { label: '✓ Switchbar', disabled: true },
      { label: '✓ Toolbar', disabled: true },
      { label: '✓ Status Bar', disabled: true },
    ],
    Favorites: [
      { label: 'Favorites...', action: onFavorites, disabled: !connected },
      { label: '', separator: true },
    ],
    Tools: [
      { label: 'Notify List...', disabled: true },
      { label: 'Address Book...', disabled: true },
      { label: '', separator: true },
      { label: 'Logging', submenu: [
        { label: `${verboseLogging ? '✓ ' : ''}Verbose`, action: onToggleVerbose },
      ]},
      { label: '', separator: true },
      { label: 'Timer...', disabled: true },
    ],
    Commands: [
      { label: 'Join Channel...', action: onJoinChannel, disabled: !connected },
      { label: 'Part Channel', disabled: !connected },
      { label: '', separator: true },
      { label: 'Change Nick...', disabled: !connected },
      { label: 'Away...', disabled: !connected },
    ],
    Window: [
      { label: 'Cascade', action: onCascade },
      { label: 'Tile Horizontal', action: onTileHorizontal },
      { label: 'Tile Vertical', action: onTileVertical },
      { label: '', separator: true },
      { label: 'Arrange Icons', disabled: true },
    ],
    Help: [
      { label: 'mIRC Help', disabled: true },
      { label: '', separator: true },
      { label: 'Show Stats...', action: onShowStats },
      { label: '', separator: true },
      { label: 'About mIRC...', action: onAbout },
    ],
  };

  const handleMenuClick = (name: string) => {
    setOpenMenu(openMenu === name ? null : name);
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.separator) return;
    item.action?.();
    closeMenu();
  };

  return (
    <div className="mirc-menubar" ref={menuRef}>
      {Object.entries(menus).map(([name, items]) => (
        <div
          key={name}
          className={`mirc-menu-item ${openMenu === name ? 'open' : ''}`}
          onMouseDown={() => handleMenuClick(name)}
          onMouseEnter={() => openMenu && setOpenMenu(name)}
        >
          {name}
          {openMenu === name && (
            <div className="mirc-menu-dropdown">
              {items.map((item, idx) =>
                item.separator ? (
                  <div key={idx} className="mirc-menu-separator" />
                ) : item.submenu ? (
                  <div key={idx} className="mirc-menu-dropdown-item mirc-submenu-parent">
                    {item.label} ►
                    <div className="mirc-submenu">
                      {item.submenu.map((sub, sidx) =>
                        sub.separator ? (
                          <div key={sidx} className="mirc-menu-separator" />
                        ) : (
                          <div
                            key={sidx}
                            className={`mirc-menu-dropdown-item ${sub.disabled ? 'disabled' : ''}`}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleItemClick(sub);
                            }}
                          >
                            {sub.label}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    key={idx}
                    className={`mirc-menu-dropdown-item ${item.disabled ? 'disabled' : ''}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleItemClick(item);
                    }}
                  >
                    {item.label}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
