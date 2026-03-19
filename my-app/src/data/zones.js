/**
 * Building: Nexus Tower — 2-floor office building
 * Coordinate system: X (east-west), Z (north-south), Y (up)
 * Building footprint: X[-9, 9], Z[-6, 6] (18×12 units per floor)
 *
 * Each zone's position is its center; w = width (X), d = depth (Z)
 */

/** @typedef {{ id: string, name: string, currentCapacity: number, maxCapacity: number, floor: number, x: number, z: number, w: number, d: number }} Zone */

/** @type {Zone[]} */
export const ZONES = [
  // ── Ground Floor (floor: 0) ──────────────────────────────────────────────
  // Row 1 — z: [-6, -3], full X width
  { id: 'g-entrance', name: 'Main Entrance',        currentCapacity: 145, maxCapacity: 200, floor: 0, x: -5,   z: -4.5, w: 8,  d: 3 },
  { id: 'g-lobby',    name: 'Lobby & Reception',    currentCapacity:  67, maxCapacity: 100, floor: 0, x:  4,   z: -4.5, w: 10, d: 3 },
  // Row 2 — z: [-3, 3]
  { id: 'g-cafeteria',name: 'Cafeteria',            currentCapacity: 312, maxCapacity: 350, floor: 0, x: -5.5, z:  0,   w: 7,  d: 6 },
  { id: 'g-mr-a',     name: 'Meeting Room A',       currentCapacity:  18, maxCapacity:  20, floor: 0, x:  0.5, z: -1.5, w: 5,  d: 3 },
  { id: 'g-mr-b',     name: 'Meeting Room B',       currentCapacity:   8, maxCapacity:  20, floor: 0, x:  0.5, z:  1.5, w: 5,  d: 3 },
  { id: 'g-restrooms',name: 'Restrooms (G)',         currentCapacity:  12, maxCapacity:  30, floor: 0, x:  4.5, z: -1.5, w: 3,  d: 3 },
  { id: 'g-security', name: 'Security Post',        currentCapacity:   4, maxCapacity:  10, floor: 0, x:  4.5, z:  1.5, w: 3,  d: 3 },
  { id: 'g-stairwell',name: 'Stairwell & Lifts',    currentCapacity:  23, maxCapacity:  80, floor: 0, x:  7.5, z:  0,   w: 3,  d: 6 },
  // Row 3 — z: [3, 6], utility/service
  { id: 'g-corridor', name: 'Service Corridor',     currentCapacity:  14, maxCapacity:  80, floor: 0, x:  0,   z:  4.5, w: 18, d: 3 },

  // ── Upper Floor (floor: 1) ───────────────────────────────────────────────
  // Main body — z: [-6, 3]
  { id: 'u-openoffice',name: 'Open Office',         currentCapacity: 218, maxCapacity: 300, floor: 1, x: -3.5, z: -1.5, w: 11, d: 9 },
  { id: 'u-conf-a',   name: 'Conference Room A',    currentCapacity:  47, maxCapacity:  50, floor: 1, x:  5.5, z: -3.5, w: 7,  d: 5 },
  { id: 'u-conf-b',   name: 'Conference Room B',    currentCapacity:  12, maxCapacity:  40, floor: 1, x:  4,   z:  1,   w: 4,  d: 4 },
  { id: 'u-exec',     name: 'Executive Suite',      currentCapacity:   6, maxCapacity:  15, floor: 1, x:  7.5, z:  1,   w: 3,  d: 4 },
  // Row 3 — z: [3, 6]
  { id: 'u-server',   name: 'Server Room',          currentCapacity:   3, maxCapacity:   8, floor: 1, x: -7,   z:  4.5, w: 4,  d: 3 },
  { id: 'u-lounge',   name: 'Collaboration Lounge', currentCapacity:  38, maxCapacity:  60, floor: 1, x: -2.5, z:  4.5, w: 5,  d: 3 },
  { id: 'u-hr',       name: 'HR Office',            currentCapacity:  24, maxCapacity:  40, floor: 1, x:  4.5, z:  4.5, w: 9,  d: 3 },
  { id: 'f2-server',  name: 'Server Room',     currentCapacity:  30, maxCapacity:  23, floor: 2, x:  -3.5, z:  -1.5, w: 11,  d: 9 },
];

export const FLOOR_LABELS = {
  0: 'Ground Floor',
  1: 'Upper Floor',
  2: '3rd Floor',
};

/**
 * Returns a hex color string representing the occupancy level.
 * @param {number} ratio — currentCapacity / maxCapacity (0–1+)
 */
export function getOccupancyColor(ratio) {
  if (ratio <= 0)    return '#6b7280'; // empty / grey
  if (ratio < 0.40)  return '#22c55e'; // green  — low
  if (ratio < 0.65)  return '#84cc16'; // lime   — moderate
  if (ratio < 0.80)  return '#eab308'; // yellow — high
  if (ratio < 0.92)  return '#f97316'; // orange — very high
  return               '#ef4444';       // red    — critical
}

/**
 * Returns a short human-readable occupancy status label.
 * @param {number} ratio
 */
export function getOccupancyLabel(ratio) {
  if (ratio <= 0)   return 'Empty';
  if (ratio < 0.40) return 'Low';
  if (ratio < 0.65) return 'Moderate';
  if (ratio < 0.80) return 'High';
  if (ratio < 0.92) return 'Very High';
  return              'Critical';
}
