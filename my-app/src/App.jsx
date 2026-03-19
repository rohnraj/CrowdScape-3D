import { useState } from 'react';
import { BuildingViewer } from './components/BuildingViewer.jsx';
import { FloorPlan2D } from './components/FloorPlan2D.jsx';
import { ZONES, FLOOR_LABELS, getOccupancyColor } from './data/zones.js';
import './App.css';

// ── Header stats ──────────────────────────────────────────────────────────────
function StatsPanel({ zones }) {
  const total    = zones.reduce((s, z) => s + z.currentCapacity, 0);
  const totalMax = zones.reduce((s, z) => s + z.maxCapacity, 0);
  const totalPct = Math.round((total / totalMax) * 100);

  const floors = [0, 1].map((floor) => {
    const fz    = zones.filter((z) => z.floor === floor);
    const cur   = fz.reduce((s, z) => s + z.currentCapacity, 0);
    const max   = fz.reduce((s, z) => s + z.maxCapacity, 0);
    const ratio = cur / max;
    return { floor, cur, max, ratio };
  });

  return (
    <div className="stats-panel">
      <div className="stat-block">
        <span className="sb-value">{total.toLocaleString()}</span>
        <span className="sb-label">Total Occupants</span>
      </div>
      <div className="stat-sep" />
      <div className="stat-block">
        <span className="sb-value" style={{ color: getOccupancyColor(total / totalMax) }}>
          {totalPct}%
        </span>
        <span className="sb-label">Building Load</span>
      </div>
      <div className="stat-sep" />
      {floors.map(({ floor, cur, max, ratio }) => (
        <div key={floor} className="stat-block">
          <span className="sb-value" style={{ color: getOccupancyColor(ratio) }}>
            {cur}<span className="sb-max">/{max}</span>
          </span>
          <span className="sb-label">{FLOOR_LABELS[floor]}</span>
        </div>
      ))}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [viewMode, setViewMode] = useState('2d');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect x="2"  y="2"  width="9" height="9" rx="2" fill="#58a6ff" opacity="0.9"/>
              <rect x="15" y="2"  width="9" height="9" rx="2" fill="#58a6ff" opacity="0.5"/>
              <rect x="2"  y="15" width="9" height="9" rx="2" fill="#58a6ff" opacity="0.5"/>
              <rect x="15" y="15" width="9" height="9" rx="2" fill="#58a6ff" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <h1 className="brand-name">CrowdScape 3D</h1>
            <p className="brand-sub">
              <span className="live-dot" aria-hidden="true" />
              Nexus Tower · Live Occupancy Monitor
            </p>
          </div>
        </div>
        <StatsPanel zones={ZONES} />
      </header>

      <main className="viewer-area">
        {viewMode === '2d' ? (
          <FloorPlan2D zones={ZONES} onLaunch3D={() => setViewMode('3d')} />
        ) : (
          <>
            <BuildingViewer zones={ZONES} />
            <button className="back-to-2d-btn" onClick={() => setViewMode('2d')}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Exit 3D Area
            </button>
          </>
        )}
      </main>
    </div>
  );
}
