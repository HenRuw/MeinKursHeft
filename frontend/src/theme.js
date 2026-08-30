// Shared visual language, lifted from the Notenbuch design.
export const colors = {
  bg: '#e9e6df',
  panelBg: '#f4f2ed',
  cardBg: '#fff',
  cream: '#fbfaf7',
  ink: '#16211f',
  sidebarBg: '#16211f',
  teal: '#0f5b52',
  tealDark: '#0b423b',
  tealTint: '#eef2f0',
  border: '#e0dbd1',
  borderStrong: '#ddd7cb',
  borderCard: '#e2ddd2',
  divider: '#eeeae2',
  muted: '#8b968f',
  mutedStrong: '#6c7a76',
  faint: '#a6a096',
  gold: '#7a5a08',
  goldBorder: '#e3c777',
  goldBg: '#fbf3dd',
  red: '#c0392b',
  redBorder: '#edd3d0',
  redBg: '#fdf3f2',
  green: '#1f7a4d',
  mitBg: '#f3f7f5',
  schBg: '#fdf7e9',
  qBg: '#e9f0ed',
  hBg: '#dde8e4',
  // Stronger tints for a frame's own header row + average column, kept
  // visibly more saturated than the pale individual-grade cells inside it
  // (see Notenuebersicht's nested-frame border/color scheme).
  mitBgStrong: '#dcece3',
  schBgStrong: '#f6e7bd',
};

export const fonts = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
  serif: 'Newsreader, serif',
};

// Only 2 entries on purpose: indexed via (quarter.idx - 1) % length, so
// quarters 3 and 4 repeat quarter 1 and 2's colors instead of introducing
// two more.
export const QUARTER_ACCENTS = ['#0f5b52', '#7a5a08'];
