import { useState } from 'react';
import { getOccupancyColor, getOccupancyLabel } from '../data/zones.js';

export function FloorPlan2D({ zones, onLaunch3D }) {
  const [activeFloor, setActiveFloor] = useState(0);
  const [hoveredZone, setHoveredZone] = useState(null);

  const floorZones = zones.filter((z) => z.floor === activeFloor);

  // Building bounds: X: [-9, 9] (width 18), Z: [-6, 6] (depth 12)
  const renderZone = (zone) => {
    const leftPct = ((zone.x - zone.w / 2 + 9) / 18) * 100;
    const topPct = ((zone.z - zone.d / 2 + 6) / 12) * 100;
    const widthPct = (zone.w / 18) * 100;
    const heightPct = (zone.d / 12) * 100;

    const ratio = zone.currentCapacity / zone.maxCapacity;
    const color = getOccupancyColor(ratio);
    
    const isHovered = hoveredZone?.id === zone.id;

    return (
      <div
        key={zone.id}
        className={`fp-zone ${isHovered ? 'fp-zone-hover' : ''}`}
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          backgroundColor: isHovered ? color : `${color}33`, // 20% opacity when not hovered
          borderColor: color,
        }}
        onMouseEnter={() => setHoveredZone(zone)}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <span className="fp-zone-name">{zone.name}</span>
      </div>
    );
  };

  return (
    <div className="fp-container">
      <div className="fp-header">
        <div className="fp-controls">
          <div className="fp-tabs">
            {[0, 1, 2].map(floor => {
              const hasZones = zones.some(z => z.floor === floor);
              if (!hasZones) return null;
              return (
                <button
                  key={floor}
                  className={`fp-tab ${activeFloor === floor ? 'fp-tab-active' : ''}`}
                  onClick={() => setActiveFloor(floor)}
                >
                  Floor {floor === 0 ? 'G' : floor}
                </button>
              );
            })}
          </div>
          <button className="fp-btn-launch" onClick={onLaunch3D}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 16V8C21 6.89543 20.1046 6 19 6H5C3.89543 6 3 6.89543 3 8V16C3 17.1046 3.89543 18 5 18H19C20.1046 18 21 17.1046 21 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 12L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 12L8 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 12V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 6L16 8L12 10L8 8L12 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Explore in 3D
          </button>
        </div>
      </div>

      <div className="fp-main">
        <div className="fp-map-wrap">
          <div className="fp-map">
            {floorZones.map(renderZone)}
          </div>
        </div>

        <div className="fp-sidebar">
          {hoveredZone ? (
            <div className="fp-details">
              <h3 className="fp-details-title">{hoveredZone.name}</h3>
              <p className="fp-details-floor">
                {hoveredZone.floor === 0 ? 'Ground Floor' : `Floor ${hoveredZone.floor}`}
              </p>
              
              <div className="fp-stat-grid">
                <div className="fp-stat-box">
                  <span className="fp-stat-label">Current</span>
                  <span className="fp-stat-val">{hoveredZone.currentCapacity}</span>
                </div>
                <div className="fp-stat-box">
                  <span className="fp-stat-label">Max</span>
                  <span className="fp-stat-val">{hoveredZone.maxCapacity}</span>
                </div>
              </div>

              <div className="fp-bar-wrap">
                <div 
                  className="fp-bar-fill" 
                  style={{ 
                    width: `${Math.min(100, (hoveredZone.currentCapacity / hoveredZone.maxCapacity) * 100)}%`,
                    backgroundColor: getOccupancyColor(hoveredZone.currentCapacity / hoveredZone.maxCapacity)
                  }} 
                />
              </div>
              <div className="fp-status">
                <span className="fp-status-text" style={{ color: getOccupancyColor(hoveredZone.currentCapacity / hoveredZone.maxCapacity) }}>
                  {getOccupancyLabel(hoveredZone.currentCapacity / hoveredZone.maxCapacity)} Status
                </span>
                <span className="fp-status-pct">
                  {Math.round((hoveredZone.currentCapacity / hoveredZone.maxCapacity) * 100)}% Full
                </span>
              </div>
            </div>
          ) : (
            <div className="fp-empty-state">
              <div className="fp-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 15L21 21M10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10C17 13.866 13.866 17 10 17Z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p>Hover over a zone on the floor map to view live occupancy details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
