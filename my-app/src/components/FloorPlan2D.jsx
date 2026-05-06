import { useState, useEffect } from 'react';
import { getOccupancyColor, CATEGORY_COLORS } from '../data/zones.js';
import PEOPLE_DATA from '../data/people.json';
import PEOPLE_HISTORY from '../data/peopleHistory.json';

function CategoryDot({ color }) {
  return <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:color, marginRight:5, flexShrink:0 }} />;
}

// Build a person's journey as an ordered list of zone stops from peopleHistory.json
// Each stop: { zone, time, duration, stepNum }
function buildJourney(personId, zones) {
  const history = PEOPLE_HISTORY.history[personId] || [];
  const stops = [];
  for (const visit of history) {
    const zone = zones.find(z => z.name === visit.shop);
    if (zone) stops.push({ zone, time: visit.time, duration: visit.duration });
  }
  return stops;
}

export function FloorPlan2D({ zones, onLaunch3D }) {
  const [activeFloor, setActiveFloor] = useState(0);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const floorZones = zones.filter(z => z.floor === activeFloor);
  const floors = [...new Set(zones.map(z => z.floor))].sort();
  const BW = 24, BD = 16;
  const toLeftPct = x => ((x + 12) / BW) * 100;
  const toTopPct  = z => ((z + 8) / BD) * 100;

  // Pre-compute journey for selected person
  const journey = selectedPerson ? buildJourney(selectedPerson.id, zones) : [];

  // People who have at least one visit on this floor
  const floorPeople = PEOPLE_DATA.people.filter(p => {
    const hist = PEOPLE_HISTORY.history[p.id] || [];
    return hist.some(v => zones.find(z => z.name === v.shop && z.floor === activeFloor));
  });

  const renderZone = (zone, i) => {
    const leftPct   = ((zone.x - zone.w/2 + 12) / BW) * 100;
    const topPct    = ((zone.z - zone.d/2 + 8) / BD) * 100;
    const widthPct  = (zone.w / BW) * 100;
    const heightPct = (zone.d / BD) * 100;
    const ratio     = zone.currentCapacity / zone.maxCapacity;
    const shopColor = zone.color || getOccupancyColor(ratio);
    const isHovered = hoveredZone?.id === zone.id;
    // Highlight if selected person visited this zone
    const visitedBySelected = selectedPerson && journey.some(s => s.zone.id === zone.id);

    return (
      <div key={zone.id}
        className={`fp-zone ${isHovered ? 'fp-zone-active' : ''} ${visitedBySelected ? 'fp-zone-visited' : ''}`}
        style={{
          left: `${leftPct}%`, top: `${topPct}%`,
          width: `${widthPct}%`, height: `${heightPct}%`,
          backgroundColor: visitedBySelected ? shopColor + '55' : isHovered ? shopColor + '44' : shopColor + '18',
          borderColor: shopColor,
          borderWidth: visitedBySelected ? 2 : 1.5,
          animationDelay: `${i * 40}ms`,
        }}
        onMouseEnter={() => setHoveredZone(zone)}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="fp-zone-inner">
          <span className="fp-zone-emoji">{zone.emoji}</span>
          <span className="fp-zone-name">{zone.name}</span>
          <div className="fp-zone-bar" style={{ background: `${shopColor}33` }}>
            <div className="fp-zone-bar-fill" style={{ width: `${Math.min(100, ratio*100)}%`, background: getOccupancyColor(ratio) }} />
          </div>
        </div>
      </div>
    );
  };

  // ── Path overlay: drawn from peopleHistory stops in order ──────────────────
  const renderPersonPath = () => {
    if (!selectedPerson || journey.length < 1) return null;

    const floorLabels = ['G', 'F1', 'F2'];

    // Stops on the active floor (with their global step index)
    const onFloor = journey
      .map((s, idx) => ({ ...s, stepIdx: idx }))
      .filter(s => s.zone.floor === activeFloor);

    // Floor transitions: consecutive stops where floor changes
    const transitions = [];
    for (let i = 0; i < journey.length - 1; i++) {
      const cur  = journey[i];
      const next = journey[i + 1];
      if (cur.zone.floor !== next.zone.floor) {
        // Exit point: last stop on current floor before switching
        if (cur.zone.floor === activeFloor) {
          transitions.push({ type: 'exit', x: cur.zone.x, z: cur.zone.z, toFloor: next.zone.floor, stepIdx: i });
        }
        // Entry point: first stop on this floor after switching
        if (next.zone.floor === activeFloor) {
          transitions.push({ type: 'enter', x: next.zone.x, z: next.zone.z, fromFloor: cur.zone.floor, stepIdx: i + 1 });
        }
      }
    }

    return (
      <svg className="fp-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Lines connecting consecutive stops on this floor */}
        {onFloor.map((stop, i) => {
          if (i === 0) return null;
          const prev = onFloor[i - 1];
          // Are they consecutive in the full journey?
          const consecutive = stop.stepIdx === prev.stepIdx + 1;
          return (
            <line key={`l${i}`}
              x1={toLeftPct(prev.zone.x)} y1={toTopPct(prev.zone.z)}
              x2={toLeftPct(stop.zone.x)} y2={toTopPct(stop.zone.z)}
              stroke={selectedPerson.color}
              strokeWidth={consecutive ? '0.8' : '0.4'}
              strokeDasharray={consecutive ? 'none' : '2,1.5'}
              opacity="0.85" strokeLinecap="round"
            />
          );
        })}

        {/* Stop dots with step numbers */}
        {onFloor.map((stop, i) => {
          const cx = toLeftPct(stop.zone.x);
          const cy = toTopPct(stop.zone.z);
          const stepNum = stop.stepIdx + 1;
          const isFirst = stop.stepIdx === 0;
          const isLast  = stop.stepIdx === journey.length - 1;
          return (
            <g key={`s${i}`}>
              {/* Outer ring for first/last */}
              {(isFirst || isLast) && (
                <circle cx={cx} cy={cy} r="2.8"
                  fill="none"
                  stroke={isFirst ? '#22c55e' : '#f97316'}
                  strokeWidth="0.5"
                />
              )}
              {/* Main dot */}
              <circle cx={cx} cy={cy} r="1.6"
                fill={selectedPerson.color} stroke="#0d1424" strokeWidth="0.3"
              />
              {/* Step number */}
              <text x={cx} y={cy + 0.55} textAnchor="middle"
                fill="#fff" fontSize="1.6" fontWeight="bold">
                {stepNum}
              </text>
              {/* Shop name label */}
              <text x={cx} y={cy - 2.5} textAnchor="middle"
                fill="rgba(255,255,255,0.75)" fontSize="1.8">
                {stop.zone.name.length > 10 ? stop.zone.name.slice(0, 9) + '…' : stop.zone.name}
              </text>
            </g>
          );
        })}

        {/* Floor transition arrows */}
        {transitions.map((t, i) => {
          const cx = toLeftPct(t.x);
          const cy = toTopPct(t.z);
          const isExit = t.type === 'exit';
          const color  = isExit ? '#f97316' : '#22c55e';
          const label  = isExit ? `→${floorLabels[t.toFloor]}` : `←${floorLabels[t.fromFloor]}`;
          return (
            <g key={`t${i}`}>
              <circle cx={cx} cy={cy} r="2.8"
                fill={color + '22'} stroke={color} strokeWidth="0.4" strokeDasharray="1.2,0.6" />
              <text x={cx} y={cy + 1} textAnchor="middle" fill={color} fontSize="3">
                {isExit ? '↗' : '↙'}
              </text>
              <rect x={cx + 3} y={cy - 2} width="7.5" height="3.2" rx="0.8"
                fill="#0d1424" stroke={color} strokeWidth="0.25" opacity="0.95" />
              <text x={cx + 6.8} y={cy + 0.2} textAnchor="middle"
                fill={color} fontSize="2.1" fontWeight="bold">{label}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  // Categories
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
      <div className="fp-header">
        <div className="fp-header-left">
          <div className="fp-mall-badge"><span>🏬</span><span>Nexus Mall</span></div>
          <div className="fp-floor-stats">
            <span className="fp-floor-stat-val" style={{ color: floorOccColor }}>{floorTotal.toLocaleString()}</span>
            <span className="fp-floor-stat-label">visitors</span>
          </div>
        </div>
        <div className="fp-controls">
          <div className="fp-tabs">
            {floors.map(floor => (
              <button key={floor} className={`fp-tab ${activeFloor === floor ? 'fp-tab-active' : ''}`}
                onClick={() => { setActiveFloor(floor); setSelectedPerson(null); }}>
                {floor === 0 ? '🏛 Ground' : floor === 1 ? '1️⃣ First' : '2️⃣ Second'}
              </button>
            ))}
          </div>
          <button className="fp-btn-launch" onClick={onLaunch3D}>
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Walk in 3D
          </button>
        </div>
      </div>

      <div className="fp-main">
        <div className="fp-map-wrap">
          <div className="fp-map-label">
            <span>{['Ground Floor','First Floor','Second Floor'][activeFloor]}</span>
            <span className="fp-map-label-pct" style={{ color: floorOccColor }}>{Math.round(floorRatio * 100)}% occupied</span>
          </div>
          <div className="fp-map">
            {floorZones.map((zone, i) => renderZone(zone, i))}

            {/* Person dots — placed at their first visited shop on this floor, offset if overlapping */}
            {(() => {
              // Group people by their first-visit zone on this floor
              const zoneGroups = {};
              for (const person of floorPeople) {
                const hist = PEOPLE_HISTORY.history[person.id] || [];
                const firstVisit = hist.find(v => {
                  const z = zones.find(zz => zz.name === v.shop);
                  return z && z.floor === activeFloor;
                });
                if (!firstVisit) continue;
                const zone = zones.find(z => z.name === firstVisit.shop);
                if (!zone) continue;
                const key = zone.id;
                if (!zoneGroups[key]) zoneGroups[key] = { zone, people: [] };
                zoneGroups[key].people.push(person);
              }

              return Object.values(zoneGroups).flatMap(({ zone, people }) =>
                people.map((person, idx) => {
                  // Spread dots in a small arc around the zone centre
                  const total = people.length;
                  const angle = total > 1 ? (idx / total) * Math.PI * 2 : 0;
                  const radius = total > 1 ? 3.5 : 0; // % offset
                  const offsetX = total > 1 ? Math.cos(angle) * radius : 0;
                  const offsetY = total > 1 ? Math.sin(angle) * radius : 0;

                  const leftPct  = toLeftPct(zone.x) + offsetX;
                  const topPct   = toTopPct(zone.z) + offsetY;
                  const isSelected = selectedPerson?.id === person.id;

                  return (
                    <div key={person.id}
                      className={`fp-person-marker ${isSelected ? 'fp-person-marker-active' : ''}`}
                      style={{ left: `${leftPct}%`, top: `${topPct}%`, '--person-color': person.color }}
                      onClick={e => { e.stopPropagation(); setSelectedPerson(isSelected ? null : person); }}
                      title={person.id}
                    >
                      <div className="fp-person-marker-dot" />
                      <div className="fp-person-marker-pulse" />
                      {isSelected && <div className="fp-person-marker-label">{person.id}</div>}
                    </div>
                  );
                })
              );
            })()}

            {renderPersonPath()}
          </div>
        </div>

        {/* Sidebar */}
        <div className="fp-sidebar">
          {hoveredZone && !selectedPerson && (
            <div className="fp-details">
              <div className="fp-details-header">
                <span className="fp-details-emoji">{hoveredZone.emoji}</span>
                <div>
                  <h3 className="fp-details-title">{hoveredZone.name}</h3>
                  <p className="fp-details-cat" style={{ color: hoveredZone.color }}>{hoveredZone.category}</p>
                </div>
              </div>
              <div className="fp-stat-grid-inline">
                <div className="fp-stat-box"><span className="fp-stat-label">Inside</span><span className="fp-stat-val">{hoveredZone.currentCapacity}</span></div>
                <div className="fp-stat-box"><span className="fp-stat-label">Max</span><span className="fp-stat-val">{hoveredZone.maxCapacity}</span></div>
                <div className="fp-stat-box"><span className="fp-stat-label">Free</span><span className="fp-stat-val" style={{ color:'#22c55e' }}>{Math.max(0, hoveredZone.maxCapacity - hoveredZone.currentCapacity)}</span></div>
              </div>
              <div className="fp-bar-wrap">
                <div className="fp-bar-fill" style={{ width: `${Math.min(100, (hoveredZone.currentCapacity / hoveredZone.maxCapacity)*100)}%`, backgroundColor: getOccupancyColor(hoveredZone.currentCapacity / hoveredZone.maxCapacity) }} />
              </div>
            </div>
          )}

          {!hoveredZone && !selectedPerson && (
            <div className="fp-empty-state">
              <div className="fp-empty-icon">👆</div>
              <p>Click a person dot to see their journey, or hover a shop for details</p>
            </div>
          )}

          {/* Floor breakdown */}
          <div className="fp-categories">
            <h4 className="fp-cat-title">Floor Breakdown</h4>
            {Object.entries(categories).map(([cat, { cur, max }]) => {
              const r = cur / max;
              const cc = CATEGORY_COLORS[cat] || '#94a3b8';
              return (
                <div key={cat} className="fp-cat-row">
                  <CategoryDot color={cc} />
                  <span className="fp-cat-name">{cat}</span>
                  <div className="fp-cat-bar"><div className="fp-cat-bar-fill" style={{ width:`${Math.min(100,r*100)}%`, background:cc }} /></div>
                  <span className="fp-cat-pct" style={{ color: cc }}>{Math.round(r*100)}%</span>
                </div>
              );
            })}
          </div>

          {/* Person journey panel — same data as map path */}
          {selectedPerson && (
            <div className="fp-person-panel">
              <div className="fp-person-panel-header">
                <div className="fp-person-panel-avatar" style={{ background: selectedPerson.color + '33', borderColor: selectedPerson.color }}>🧑</div>
                <div className="fp-person-panel-info">
                  <span className="fp-person-panel-id">{selectedPerson.id}</span>
                  <span className="fp-person-panel-route-text">{selectedPerson.from} → {selectedPerson.to}</span>
                </div>
                <button className="fp-person-close" onClick={() => setSelectedPerson(null)}>✕</button>
              </div>

              {/* Floors visited badges */}
              <div className="fp-person-floors-visited">
                {[...new Set(journey.map(s => s.zone.floor))].sort().map(f => (
                  <span key={f} className="fp-person-floor-badge" style={{
                    background: f === activeFloor ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                    color: f === activeFloor ? '#60a5fa' : '#64748b',
                    border: f === activeFloor ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  }}>{['Ground', 'Floor 1', 'Floor 2'][f]}</span>
                ))}
              </div>

              <div className="fp-person-history-label">Journey ({journey.length} stops)</div>
              <div className="fp-person-history">
                {journey.map((stop, i) => {
                  const isOnActiveFloor = stop.zone.floor === activeFloor;
                  const floorLabel = ['G', 'F1', 'F2'][stop.zone.floor];
                  // Show floor-change indicator between stops
                  const prevFloor = i > 0 ? journey[i - 1].zone.floor : null;
                  const floorChanged = prevFloor !== null && prevFloor !== stop.zone.floor;
                  return (
                    <div key={i}>
                      {floorChanged && (
                        <div className="fp-journey-floor-change">
                          <span className="fp-journey-floor-arrow">
                            {stop.zone.floor > prevFloor ? '⬆' : '⬇'}
                          </span>
                          <span className="fp-journey-floor-label">
                            {stop.zone.floor > prevFloor ? 'Went up to' : 'Went down to'} {['Ground', 'Floor 1', 'Floor 2'][stop.zone.floor]}
                          </span>
                        </div>
                      )}
                      <div className={`fp-person-visit ${isOnActiveFloor ? 'fp-person-visit-active' : 'fp-person-visit-dim'}`}>
                        <span className="fp-person-visit-num">{i + 1}</span>
                        <span className="fp-person-visit-dot" style={{ background: stop.zone.color }} />
                        <span className="fp-person-visit-shop">{stop.zone.name}</span>
                        <span className="fp-person-visit-floor">{floorLabel}</span>
                        <span className="fp-person-visit-time">{stop.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
