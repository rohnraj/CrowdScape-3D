/**
 * Mall: Nexus Mall — 3-floor shopping center
 * Coordinate system: X (east-west), Z (north-south), Y (up)
 * Building footprint: X[-12, 12], Z[-8, 8] (24×16 units per floor)
 */

/** @typedef {{ id: string, name: string, category: string, emoji: string, currentCapacity: number, maxCapacity: number, floor: number, x: number, z: number, w: number, d: number, color: string }} Shop */

/** @type {Shop[]} */
export const ZONES = [
  // ── Ground Floor (floor: 0) — Main Entrance & Anchor Stores ──────────────
  { id: 'g-entrance',   name: 'Grand Atrium',        category: 'Common Area', emoji: '🏛️',  currentCapacity: 320, maxCapacity: 500, floor: 0, x:  0,    z: -5,   w: 10, d: 4,  color: '#60a5fa' },
  { id: 'g-anchor1',    name: 'Zara',                category: 'Fashion',     emoji: '👗',  currentCapacity: 180, maxCapacity: 250, floor: 0, x: -7.5,  z: -1,   w: 7,  d: 6,  color: '#f472b6' },
  { id: 'g-anchor2',    name: 'H&M',                 category: 'Fashion',     emoji: '🛍️', currentCapacity:  95, maxCapacity: 200, floor: 0, x:  7.5,  z: -1,   w: 7,  d: 6,  color: '#fb7185' },
  { id: 'g-food1',      name: 'Starbucks',           category: 'Food & Bev',  emoji: '☕',  currentCapacity:  67, maxCapacity:  80, floor: 0, x: -4,    z:  4.5, w: 4,  d: 3,  color: '#34d399' },
  { id: 'g-food2',      name: 'McDonald\'s',         category: 'Food & Bev',  emoji: '🍔',  currentCapacity: 112, maxCapacity: 150, floor: 0, x:  0,    z:  4.5, w: 4,  d: 3,  color: '#fbbf24' },
  { id: 'g-food3',      name: 'Sushi Bar',           category: 'Food & Bev',  emoji: '🍣',  currentCapacity:  44, maxCapacity:  60, floor: 0, x:  4,    z:  4.5, w: 4,  d: 3,  color: '#f87171' },
  { id: 'g-tech',       name: 'Apple Store',         category: 'Electronics', emoji: '🍎',  currentCapacity: 203, maxCapacity: 220, floor: 0, x: -9.5,  z:  4.5, w: 5,  d: 3,  color: '#a78bfa' },
  { id: 'g-corridor',   name: 'Main Corridor',       category: 'Common Area', emoji: '🚶', currentCapacity:  88, maxCapacity: 400, floor: 0, x:  0,    z:  0,   w: 4,  d: 4,  color: '#94a3b8' },
  { id: 'g-escalator',  name: 'Escalators',          category: 'Common Area', emoji: '⬆️', currentCapacity:  35, maxCapacity: 100, floor: 0, x:  9.5,  z:  4.5, w: 5,  d: 3,  color: '#64748b' },

  // ── First Floor (floor: 1) — Lifestyle & Entertainment ───────────────────
  { id: 'f1-cinema',    name: 'PVR Cinemas',         category: 'Entertainment',emoji: '🎬', currentCapacity: 380, maxCapacity: 450, floor: 1, x: -6,    z: -3,   w: 10, d: 8,  color: '#c084fc' },
  { id: 'f1-nike',      name: 'Nike',                category: 'Sports',      emoji: '👟',  currentCapacity:  78, maxCapacity: 120, floor: 1, x:  6.5,  z: -4,   w: 7,  d: 5,  color: '#f97316' },
  { id: 'f1-adidas',    name: 'Adidas',              category: 'Sports',      emoji: '🏃',  currentCapacity:  55, maxCapacity: 100, floor: 1, x:  6.5,  z:  1,   w: 7,  d: 4,  color: '#38bdf8' },
  { id: 'f1-books',     name: 'Crossword Books',     category: 'Lifestyle',   emoji: '📚',  currentCapacity:  32, maxCapacity:  80, floor: 1, x: -3,    z:  4.5, w: 6,  d: 3,  color: '#a3e635' },
  { id: 'f1-spa',       name: 'Luxury Spa',          category: 'Wellness',    emoji: '💆',  currentCapacity:  18, maxCapacity:  40, floor: 1, x:  3,    z:  4.5, w: 6,  d: 3,  color: '#f0abfc' },
  { id: 'f1-arcade',    name: 'Game Zone',           category: 'Entertainment',emoji: '🎮', currentCapacity: 145, maxCapacity: 180, floor: 1, x:  9.5,  z:  4.5, w: 5,  d: 3,  color: '#fb923c' },

  // ── Second Floor (floor: 2) — Food Court & Premium ───────────────────────
  { id: 'f2-foodcourt', name: 'Food Court',          category: 'Food & Bev',  emoji: '🍽️', currentCapacity: 420, maxCapacity: 600, floor: 2, x:  0,    z: -2,   w: 16, d: 8,  color: '#fde68a' },
  { id: 'f2-premium1',  name: 'Louis Vuitton',       category: 'Luxury',      emoji: '👜',  currentCapacity:  22, maxCapacity:  50, floor: 2, x: -8.5,  z:  3.5, w: 7,  d: 5,  color: '#d4af37' },
  { id: 'f2-premium2',  name: 'Rolex Boutique',      category: 'Luxury',      emoji: '⌚',  currentCapacity:   8, maxCapacity:  25, floor: 2, x: -1,    z:  4.5, w: 6,  d: 3,  color: '#c0a060' },
  { id: 'f2-premium3',  name: 'Sephora',             category: 'Beauty',      emoji: '💄',  currentCapacity:  67, maxCapacity:  90, floor: 2, x:  6,    z:  3.5, w: 8,  d: 5,  color: '#f9a8d4' },
];

export const FLOOR_LABELS = {
  0: 'Ground Floor',
  1: 'First Floor',
  2: 'Second Floor',
};

export const CATEGORY_COLORS = {
  'Fashion':       '#f472b6',
  'Food & Bev':    '#fbbf24',
  'Electronics':   '#a78bfa',
  'Entertainment': '#c084fc',
  'Sports':        '#38bdf8',
  'Lifestyle':     '#a3e635',
  'Wellness':      '#f0abfc',
  'Luxury':        '#d4af37',
  'Beauty':        '#f9a8d4',
  'Common Area':   '#94a3b8',
};

/**
 * Returns a hex color string representing the occupancy level.
 * @param {number} ratio — currentCapacity / maxCapacity (0–1+)
 */
export function getOccupancyColor(ratio) {
  if (ratio <= 0)    return '#6b7280';
  if (ratio < 0.40)  return '#22c55e';
  if (ratio < 0.65)  return '#84cc16';
  if (ratio < 0.80)  return '#eab308';
  if (ratio < 0.92)  return '#f97316';
  return               '#ef4444';
}

/**
 * Returns a short human-readable occupancy status label.
 * @param {number} ratio
 */
export function getOccupancyLabel(ratio) {
  if (ratio <= 0)   return 'Empty';
  if (ratio < 0.40) return 'Quiet';
  if (ratio < 0.65) return 'Busy';
  if (ratio < 0.80) return 'Crowded';
  if (ratio < 0.92) return 'Very Busy';
  return              'Packed';
}
