import { useState, useEffect } from 'react';
import { BuildingViewer } from './components/BuildingViewer.jsx';
import { FloorPlan2D } from './components/FloorPlan2D.jsx';
import { ZONES, FLOOR_LABELS, getOccupancyColor } from './data/zones.js';
import './App.css';

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    let start = display, diff = value - start, t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / 700, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + diff * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]); // eslint-disable-line
  return <>{display.toLocaleString()}</>;
}

function StatsPanel({ zones }) {
  const total    = zones.reduce((s, z) => s + z.currentCapacity, 0);
  const totalMax = zones.reduce((s, z) => s + z.maxCapacity, 0);
  const totalPct = Math.round((total / totalMax) * 100);

  const floors = [0, 1, 2].map(floor => {
    const fz  = zones.filter(z => z.floor === floor);
    if (!fz.length) return null;
    const cur = fz.reduce((s, z) => s + z.currentCapacity, 0);
    const max = fz.reduce((s, z) => s + z.maxCapacity, 0);
    return { floor, cur, max, ratio: cur / max };
  }).filter(Boolean);

  return (
    <div className="stats-panel">
      <div className="stat-block">
        <span className="sb-value"><AnimatedNumber value={total} /></span>
        <span className="sb-label">Total Visitors</span>
      </div>
      <div className="stat-sep" />
      <div className="stat-block">
        <span className="sb-value" style={{ color: getOccupancyColor(total / totalMax) }}>
          {totalPct}%
        </span>
        <span className="sb-label">Mall Load</span>
      </div>
      <div className="stat-sep" />
      {floors.map(({ floor, cur, max, ratio }) => (
        <div key={floor} className="stat-block">
          <span className="sb-value" style={{ color: getOccupancyColor(ratio) }}>
            {cur.toLocaleString()}<span className="sb-max">/{max.toLocaleString()}</span>
          </span>
          <span className="sb-label">{FLOOR_LABELS[floor]}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState('2d');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <rect x="2"  y="2"  width="12" height="12" rx="3" fill="#60a5fa" opacity="0.95"/>
              <rect x="16" y="2"  width="12" height="12" rx="3" fill="#60a5fa" opacity="0.55"/>
              <rect x="2"  y="16" width="12" height="12" rx="3" fill="#60a5fa" opacity="0.55"/>
              <rect x="16" y="16" width="12" height="12" rx="3" fill="#60a5fa" opacity="0.85"/>
            </svg>
          </div>
          <div>
            <h1 className="brand-name">Nexus Mall</h1>
            <p className="brand-sub">
              <span className="live-dot" aria-hidden="true" />
              Live Occupancy Monitor · 3 Floors · {ZONES.length} Shops
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
              Floor Plan
            </button>
          </>
        )}
      </main>
    </div>
  );
}
