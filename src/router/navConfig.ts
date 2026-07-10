export interface NavItem {
  key: string;
  path: string;
  label: string;
  shortLabel: string;
  iconPath: string;
  /** Shown as one of the 5 primary mobile destinations; the rest live under "More". */
  primaryMobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/', label: 'Home', shortLabel: 'Home', primaryMobile: true, iconPath: 'M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5' },
  { key: 'report', path: '/report', label: 'Weekly Report', shortLabel: 'Report', primaryMobile: true, iconPath: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3' },
  {
    key: 'members',
    path: '/members',
    label: 'Members',
    shortLabel: 'Members',
    primaryMobile: true,
    iconPath: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M17.5 14.5A5.5 5.5 0 0 1 21 20',
  },
  {
    key: 'campaign',
    path: '/campaign',
    label: 'Campaign',
    shortLabel: 'Campaign',
    primaryMobile: false,
    iconPath: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z',
  },
  {
    key: 'events',
    path: '/events',
    label: 'Events & Goals',
    shortLabel: 'Events',
    primaryMobile: true,
    iconPath: 'M4 5h16v16H4zM4 9.5h16M8.5 3v4M15.5 3v4M8 14h3v3H8z',
  },
  { key: 'analytics', path: '/analytics', label: 'Analytics', shortLabel: 'Stats', primaryMobile: false, iconPath: 'M5 21v-8M11 21V5M17 21v-11M2 21h20' },
  { key: 'history', path: '/history', label: 'History', shortLabel: 'History', primaryMobile: false, iconPath: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2' },
  {
    key: 'settings',
    path: '/settings',
    label: 'Settings',
    shortLabel: 'Settings',
    primaryMobile: false,
    iconPath: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  },
];

export const PRIMARY_MOBILE_ITEMS = NAV_ITEMS.filter((i) => i.primaryMobile);
export const MORE_MOBILE_ITEMS = NAV_ITEMS.filter((i) => !i.primaryMobile);
