import { useState, useEffect, useRef } from 'react';
import { getOccupancyColor, getOccupancyLabel, CATEGORY_COLORS } from '../data/zones.js';
import PEOPLE_DATA from '../data/people.json';
import PEOPLE_HISTORY from '../data/peopleHistory.json';

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 600 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    const start = display;
    const diff  = value - start;
    const t0    = performance.now();
    const tick  = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + diff * ease));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]); // eslint-disable-line
  return <>{display.toLocaleString()}</>;
}

// ── Radial progress ring ──────────────────────────────────────────────────────
function RingProgress({ ratio, color, size = 64 }) {
  const r   = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(ratio, 1);
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5"/>
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition:'stroke-dasharray 0.7s cubic-bezier(0.34,1.56,0.64,1)' }}
      />
    </svg>
  );
}

// ── Category legend dot ───────────────────────────────────────────────────────
function CategoryDot({ color }) {
  return <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:color, marginRight:5, flexShrink:0 }} />;
}

export function FloorPlan2D({ zones, onLaunch3D }) {
  const [activeFloor, setActiveFloor] = useState(0);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const floorZones = zones.filter(z => z.floor === activeFloor);
  const floors = [...new Set(zones.map(z => z.floor))].sort();

  // Building bounds: X[-12,12] W=24, Z[-8,8] D=16
  const BW = 24, BD = 16, BX0 = -12, BZ0 = -8;

  const renderZone = (zone, i) => {
    const leftPct   = ((zone.x - zone.w/2 - BX0) / BW) * 100;
    const topPct    = ((zone.z - zone.d/2 - BZ0) / BD) * 100;
    const widthPct  = (zone.w / BW) * 100;
    const heightPct = (zone.d / BD) * 100;

    const ratio    = zone.currentCapacity / zone.maxCapacity;
    const occColor = getOccupancyColor(ratio);
    const shopColor = zone.color || occColor;
    const isHovered  = hoveredZone?.id === zone.id;
    const isSelected = selectedZone?.id === zone.id;
    const active = isHovered || isSelected;

    return (
      <div
        key={zone.id}
        className={`fp-zone ${active ? 'fp-zone-active' : ''}`}
        style={{
          left: `${leftPct}%`, top: `${topPct}%`,
          width: `${widthPct}%`, height: `${heightPct}%`,
          backgroundColor: active ? shopColor + '55' : shopColor + '22',
          borderColor: shopColor,
          borderWidth: active ? 2 : 1.5,
          animationDelay: `${i * 40}ms`,
          boxShadow: active ? `0 0 18px ${shopColor}66, inset 0 0 12px ${shopColor}22` : `inset 0 0 8px ${shopColor}11`,
          transform: active ? 'scale(1.015)' : 'scale(1)',
          zIndex: active ? 10 : 1,
        }}
        onMouseEnter={() => setHoveredZone(zone)}
        onMouseLeave={() => setHoveredZone(null)}
        onClick={() => setSelectedZone(prev => prev?.id === zone.id ? null : zone)}
      >
        <div className="fp-zone-inner">
          <span className="fp-zone-emoji">{zone.emoji}</span>
          <span className="fp-zone-name">{zone.name}</span>
          <div className="fp-zone-bar" style={{ background: `${shopColor}33` }}>
            <div className="fp-zone-bar-fill" style={{
              width: `${Math.min(100, ratio*100)}%`,
              background: occColor,
            }} />
          </div>
        </div>
      </div>
    );
  };

  const displayZone = selectedZone || hoveredZone;

  // Category breakdown for current floor
  const categories = {};
  floorZones.forEach(z => {
    if (!categories[z.category]) categories[z.category] = { cur:0, max:0 };
    categories[z.category].cur += z.currentCapacity;
    categories[z.category].max += z.maxCapacity;
  });

  const floorTotal    = floorZones.reduce((s,z) => s + z.currentCapacity, 0);
  const floorMax      = floorZones.reduce((s,z) => s + z.maxCapacity, 0);
  const floorRatio    = floorMax > 0 ? floorTotal / floorMax : 0;
  const floorOccColor = getOccupancyColor(floorRatio);

  return (
    <div className={`fp-container ${mounted ? 'fp-mounted' : ''}`}>
      {/* Header */}
      <div className="fp-header">
        <div className="fp-header-left">
          <div className="fp-mall-badge">
            <span>🏬</span>
            <span>Nexus Mall</span>
          </div>
          <div className="fp-floor-stats">
            <span className="fp-floor-stat-val" style={{ color: floorOccColor }}>
              <AnimatedNumber value={floorTotal} />
            </span>
            <span className="fp-floor-stat-label">visitors on this floor</span>
          </div>
        </div>
        <div className="fp-controls">
          <div className="fp-tabs">
            {floors.map(floor => (
              <button
                key={floor}
                className={`fp-tab ${activeFloor === floor ? 'fp-tab-active' : ''}`}
                onClick={() => { setActiveFloor(floor); setSelectedZone(null); }}
              >
                {floor === 0 ? '🏛 Ground' : floor === 1 ? '1️⃣ First' : '2️⃣ Second'}
              </button>
            ))}
          </div>
          <button className="fp-btn-launch" onClick={onLaunch3D}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Walk in 3D
          </button>
        </div>
      </div>

      <div className="fp-main">
        {/* Map */}
        <div className="fp-map-wrap">
          <div className="fp-map-label">
            <span>{['Ground Floor','First Floor','Second Floor'][activeFloor]}</span>
            <span className="fp-map-label-pct" style={{ color: floorOccColor }}>
              {Math.round(floorRatio * 100)}% occupied
            </span>
          </div>
          <div className="fp-map">
            {/* Compass */}
            <div className="fp-compass">
              <svg viewBox="0 0 32 32" width="28" height="28">
                <circle cx="16" cy="16" r="14" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                <polygon points="16,4 19,16 16,14 13,16" fill="#ef4444"/>
                <polygon points="16,28 19,16 16,18 13,16" fill="rgba(255,255,255,0.5)"/>
                <text x="16" y="9" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">N</text>
              </svg>
            </div>
            {floorZones.map((zone, i) => renderZone(zone, i))}

            {/* Selected person path overlay — shows route on this floor + floor transitions */}
            {selectedPerson && (() => {
              const route = selectedPerson.route;
              // Get waypoints on this floor with their original index
              const onFloor = route.map((wp, idx) => ({ ...wp, idx })).filter(wp => wp.floor === activeFloor);
              if (onFloor.length < 1) return null;

              // Find floor transitions: where the person enters/exits this floor
              const transitions = [];
              for (let i = 0; i < route.length; i++) {
                const cur = route[i];
                const next = route[(i + 1) % route.length];
                // Leaving this floor
                if (cur.floor === activeFloor && next.floor !== activeFloor) {
                  transitions.push({ type: 'exit', x: cur.x, z: cur.z, toFloor: next.floor });
                }
                // Arriving on this floor
                if (cur.floor !== activeFloor && next.floor === activeFloor) {
                  transitions.push({ type: 'enter', x: next.x, z: next.z, fromFloor: cur.floor });
                }
              }

              const toX = (x) => ((x + 12) / 24) * 100;
              const toY = (z) => ((z + 8) / 16) * 100;
              const floorLabels = ['G', 'F1', 'F2'];

              return (
                <svg className="fp-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Path lines between consecutive waypoints on this floor */}
                  {onFloor.map((wp, i) => {
                    if (i === 0) return null;
                    const prev = onFloor[i - 1];
                    // Only draw line if they're consecutive in the original route
                    const consecutive = wp.idx === prev.idx + 1;
                    return (
                      <line key={`l${i}`}
                        x1={toX(prev.x)} y1={toY(prev.z)}
                        x2={toX(wp.x)} y2={toY(wp.z)}
                        stroke={selectedPerson.color}
                        strokeWidth={consecutive ? '0.7' : '0.4'}
                        strokeDasharray={consecutive ? 'none' : '1.5,1'}
                        opacity="0.75"
                        strokeLinecap="round"
                      />
                    );
                  })}

                  {/* Waypoint dots */}
                  {onFloor.map((wp, i) => (
                    <circle key={`d${i}`}
                      cx={toX(wp.x)} cy={toY(wp.z)} r="1.1"
                      fill={selectedPerson.color} stroke="#0d1424" strokeWidth="0.25"
                    />
                  ))}

                  {/* Start marker */}
                  {onFloor.length > 0 && (
                    <g>
                      <circle cx={toX(onFloor[0].x)} cy={toY(onFloor[0].z)} r="2"
                        fill="none" stroke="#22c55e" strokeWidth="0.5" />
                      <text x={toX(onFloor[0].x)} y={toY(onFloor[0].z) - 3}
                        textAnchor="middle" fill="#22c55e" fontSize="2.8" fontWeight="bold">
                        START
                      </text>
                    </g>
                  )}

                  {/* Floor transition markers */}
                  {transitions.map((t, i) => {
                    const cx = toX(t.x);
                    const cy = toY(t.z);
                    const isExit = t.type === 'exit';
                    const otherFloor = isExit ? t.toFloor : t.fromFloor;
                    const arrowColor = isExit ? '#f97316' : '#22c55e';
                    const arrow = isExit ? '↗' : '↙';
                    const label = isExit
                      ? `→ ${floorLabels[otherFloor]}`
                      : `← ${floorLabels[otherFloor]}`;
                    return (
                      <g key={`t${i}`}>
                        {/* Pulsing ring */}
                        <circle cx={cx} cy={cy} r="2.5"
                          fill={arrowColor + '22'} stroke={arrowColor} strokeWidth="0.4"
                          strokeDasharray="1.5,0.8"
                        />
                        {/* Arrow icon */}
                        <text x={cx} y={cy + 1} textAnchor="middle" fill={arrowColor} fontSize="3.2">
                          {arrow}
                        </text>
                        {/* Floor label */}
                        <rect x={cx + 2.5} y={cy - 2} width="8" height="3.5" rx="0.8"
                          fill="#0d1424" stroke={arrowColor} strokeWidth="0.25" opacity="0.9" />
                        <text x={cx + 6.5} y={cy + 0.2} textAnchor="middle"
                          fill={arrowColor} fontSize="2.2" fontWeight="bold">
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Sidebar */}
        <div className="fp-sidebar">
          {displayZone ? (
            <div className="fp-details">
              <div className="fp-details-header">
                <span className="fp-details-emoji">{displayZone.emoji}</span>
                <div>
                  <h3 className="fp-details-title">{displayZone.name}</h3>
                  <p className="fp-details-cat" style={{ color: displayZone.color }}>
                    {displayZone.category}
                  </p>
                </div>
              </div>

              <div className="fp-details-ring-row">
                <div style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  <RingProgress
                    ratio={displayZone.currentCapacity / displayZone.maxCapacity}
                    color={getOccupancyColor(displayZone.currentCapacity / displayZone.maxCapacity)}
                    size={80}
                  />
                  <span className="fp-ring-pct" style={{ color: getOccupancyColor(displayZone.currentCapacity / displayZone.maxCapacity) }}>
                    {Math.round((displayZone.currentCapacity / displayZone.maxCapacity) * 100)}%
                  </span>
                </div>
                <div className="fp-details-nums">
                  <div className="fp-stat-box">
                    <span className="fp-stat-label">Inside</span>
                    <span className="fp-stat-val"><AnimatedNumber value={displayZone.currentCapacity} /></span>
                  </div>
                  <div className="fp-stat-box">
                    <span className="fp-stat-label">Capacity</span>
                    <span className="fp-stat-val">{displayZone.maxCapacity}</span>
                  </div>
                  <div className="fp-stat-box">
                    <span className="fp-stat-label">Free</span>
                    <span className="fp-stat-val" style={{ color:'#22c55e' }}>
                      {Math.max(0, displayZone.maxCapacity - displayZone.currentCapacity)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="fp-bar-wrap">
                <div className="fp-bar-fill" style={{
                  width: `${Math.min(100, (displayZone.currentCapacity / displayZone.maxCapacity)*100)}%`,
                  backgroundColor: getOccupancyColor(displayZone.currentCapacity / displayZone.maxCapacity),
                }} />
              </div>
              <div className="fp-status">
                <span className="fp-status-badge" style={{
                  background: getOccupancyColor(displayZone.currentCapacity / displayZone.maxCapacity) + '33',
                  color: getOccupancyColor(displayZone.currentCapacity / displayZone.maxCapacity),
                  border: `1px solid ${getOccupancyColor(displayZone.currentCapacity / displayZone.maxCapacity)}55`,
                }}>
                  {getOccupancyLabel(displayZone.currentCapacity / displayZone.maxCapacity)}
                </span>
                <span className="fp-status-floor">
                  {['Ground Floor','First Floor','Second Floor'][displayZone.floor]}
                </span>
              </div>
            </div>
          ) : (
            <div className="fp-empty-state">
              <div className="fp-empty-icon">🏪</div>
              <p>Hover or click a shop to see live occupancy details</p>
            </div>
          )}

          {/* Category breakdown */}
          <div className="fp-categories">
            <h4 className="fp-cat-title">Floor Breakdown</h4>
            {Object.entries(categories).map(([cat, { cur, max }]) => {
              const r = cur / max;
              const cc = CATEGORY_COLORS[cat] || '#94a3b8';
              return (
                <div key={cat} className="fp-cat-row">
                  <CategoryDot color={cc} />
                  <span className="fp-cat-name">{cat}</span>
                  <div className="fp-cat-bar">
                    <div className="fp-cat-bar-fill" style={{ width:`${Math.min(100,r*100)}%`, background:cc }} />
                  </div>
                  <span className="fp-cat-pct" style={{ color: cc }}>{Math.round(r*100)}%</span>
                </div>
              );
            })}
          </div>

          {/* People on this floor */}
          <div className="fp-people-section">
            <h4 className="fp-cat-title">People on Floor</h4>
            <div className="fp-people-list">
              {PEOPLE_DATA.people
                .filter(p => p.route.some(wp => wp.floor === activeFloor))
                .map(person => {
                  const isActive = selectedPerson?.id === person.id;
                  return (
                    <div
                      key={person.id}
                      className={`fp-person-row ${isActive ? 'fp-person-active' : ''}`}
                      onClick={() => setSelectedPerson(isActive ? null : person)}
                    >
                      <span className="fp-person-dot" style={{ background: person.color }} />
                      <span className="fp-person-name">{person.name.split(' ')[0]}</span>
                      <span className="fp-person-route">{person.from} → {person.to}</span>
                    </div>
                  );
                })}
            </div>

            {/* Selected person history */}
            {selectedPerson && (
              <div className="fp-person-detail">
                <div className="fp-person-detail-header">
                  <span className="fp-person-dot-lg" style={{ background: selectedPerson.color }} />
                  <span className="fp-person-detail-name">{selectedPerson.name}</span>
                </div>
                <div className="fp-person-detail-route-summary">
                  <span className="fp-person-from-to">📍 {selectedPerson.from} → 🏁 {selectedPerson.to}</span>
                </div>
                <div className="fp-person-floors-visited">
                  {[...new Set(selectedPerson.route.map(wp => wp.floor))].sort().map(f => (
                    <span key={f} className="fp-person-floor-badge" style={{
                      background: f === activeFloor ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                      color: f === activeFloor ? '#60a5fa' : '#64748b',
                      border: f === activeFloor ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      {['Ground', 'Floor 1', 'Floor 2'][f]}
                    </span>
                  ))}
                </div>
                <div className="fp-person-history-label">Visit History</div>
                <div className="fp-person-history">
                  {(PEOPLE_HISTORY.history[selectedPerson.id] || []).map((v, i) => {
                    const shop = zones.find(z => z.name === v.shop);
                    return (
                      <div key={i} className="fp-person-visit">
                        <span className="fp-person-visit-dot" style={{ background: shop?.color || '#64748b' }} />
                        <span className="fp-person-visit-shop">{v.shop}</span>
                        <span className="fp-person-visit-floor">{shop ? ['G', 'F1', 'F2'][shop.floor] : ''}</span>
                        <span className="fp-person-visit-time">{v.time}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
