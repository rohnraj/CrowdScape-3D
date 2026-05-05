import { useState, useEffect } from 'react';
import { getOccupancyColor, getOccupancyLabel, CATEGORY_COLORS } from '../data/zones.js';
import PEOPLE_DATA from '../data/people.json';
import PEOPLE_HISTORY from '../data/peopleHistory.json';

function CategoryDot({ color }) {
  return <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:color, marginRight:5, flexShrink:0 }} />;
}

export function FloorPlan2D({ zones, onLaunch3D }) {
  const [activeFloor, setActiveFloor] = useState(0);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const floorZones = zones.filter(z => z.floor === activeFloor);
  const floors = [...new Set(zones.map(z => z.floor))].sort();

  // People whose first waypoint is on this floor (their "home" position)
  const floorPeople = PEOPLE_DATA.people.filter(p => p.route[0].floor === activeFloor);

  const BW = 24, BD = 16;

  const renderZone = (zone, i) => {
    const leftPct   = ((zone.x - zone.w/2 + 12) / BW) * 100;
    const topPct    = ((zone.z - zone.d/2 + 8) / BD) * 100;
    const widthPct  = (zone.w / BW) * 100;
    const heightPct = (zone.d / BD) * 100;
    const ratio     = zone.currentCapacity / zone.maxCapacity;
    const shopColor = zone.color || getOccupancyColor(ratio);
    const isHovered = hoveredZone?.id === zone.id;

    return (
      <div
        key={zone.id}
        className={`fp-zone ${isHovered ? 'fp-zone-active' : ''}`}
        style={{
          left: `${leftPct}%`, top: `${topPct}%`,
          width: `${widthPct}%`, height: `${heightPct}%`,
          backgroundColor: isHovered ? shopColor + '44' : shopColor + '18',
          borderColor: shopColor,
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

  // Categories
  const categories = {};
  floorZones.forEach(z => {
    if (!categories[z.category]) categories[z.category] = { cur:0, max:0 };
    categories[z.category].cur += z.currentCapacity;
    categories[z.category].max += z.maxCapacity;
  });
  const floorTotal = floorZones.reduce((s,z) => s + z.currentCapacity, 0);
  const floorMax   = floorZones.reduce((s,z) => s + z.maxCapacity, 0);
  const floorRatio = floorMax > 0 ? floorTotal / floorMax : 0;
  const floorOccColor = getOccupancyColor(floorRatio);

  // Person path overlay
  const renderPersonPath = () => {
    if (!selectedPerson) return null;
    const route = selectedPerson.route;
    const onFloor = route.map((wp, idx) => ({ ...wp, idx })).filter(wp => wp.floor === activeFloor);
    if (onFloor.length < 1) return null;

    const transitions = [];
    for (let i = 0; i < route.length; i++) {
      const cur = route[i], next = route[(i + 1) % route.length];
      if (cur.floor === activeFloor && next.floor !== activeFloor)
        transitions.push({ type: 'exit', x: cur.x, z: cur.z, toFloor: next.floor });
      if (cur.floor !== activeFloor && next.floor === activeFloor)
        transitions.push({ type: 'enter', x: next.x, z: next.z, fromFloor: cur.floor });
    }

    const toX = x => ((x + 12) / 24) * 100;
    const toY = z => ((z + 8) / 16) * 100;
    const fl = ['G', 'F1', 'F2'];

    return (
      <svg className="fp-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {onFloor.map((wp, i) => {
          if (i === 0) return null;
          const prev = onFloor[i - 1];
          const consecutive = wp.idx === prev.idx + 1;
          return <line key={`l${i}`} x1={toX(prev.x)} y1={toY(prev.z)} x2={toX(wp.x)} y2={toY(wp.z)}
            stroke={selectedPerson.color} strokeWidth={consecutive ? '0.7' : '0.35'}
            strokeDasharray={consecutive ? 'none' : '1.5,1'} opacity="0.8" strokeLinecap="round" />;
        })}
        {onFloor.map((wp, i) => (
          <circle key={`d${i}`} cx={toX(wp.x)} cy={toY(wp.z)} r="1" fill={selectedPerson.color} stroke="#0d1424" strokeWidth="0.2" />
        ))}
        {transitions.map((t, i) => {
          const cx = toX(t.x), cy = toY(t.z);
          const isExit = t.type === 'exit';
          const color = isExit ? '#f97316' : '#22c55e';
          const label = isExit ? `→${fl[t.toFloor]}` : `←${fl[t.fromFloor]}`;
          return (
            <g key={`t${i}`}>
              <circle cx={cx} cy={cy} r="2.2" fill={color+'22'} stroke={color} strokeWidth="0.35" strokeDasharray="1.2,0.6" />
              <text x={cx} y={cy+0.8} textAnchor="middle" fill={color} fontSize="2.6">{isExit ? '↗' : '↙'}</text>
              <rect x={cx+2.2} y={cy-1.8} width="6.5" height="3" rx="0.7" fill="#0d1424" stroke={color} strokeWidth="0.2" opacity="0.92" />
              <text x={cx+5.5} y={cy+0.1} textAnchor="middle" fill={color} fontSize="2" fontWeight="bold">{label}</text>
            </g>
          );
        })}
      </svg>
    );
  };

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
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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

            {/* Static people markers */}
            {floorPeople.map(person => {
              const wp = person.route[0];
              const leftPct = ((wp.x + 12) / 24) * 100;
              const topPct  = ((wp.z + 8) / 16) * 100;
              const isSelected = selectedPerson?.id === person.id;
              return (
                <div key={person.id}
                  className={`fp-person-marker ${isSelected ? 'fp-person-marker-active' : ''}`}
                  style={{ left: `${leftPct}%`, top: `${topPct}%`, '--person-color': person.color }}
                  onClick={(e) => { e.stopPropagation(); setSelectedPerson(isSelected ? null : person); }}
                >
                  <div className="fp-person-marker-dot" />
                  <div className="fp-person-marker-pulse" />
                  {isSelected && <div className="fp-person-marker-label">{person.id}</div>}
                </div>
              );
            })}

            {renderPersonPath()}
          </div>
        </div>

        {/* Sidebar */}
        <div className="fp-sidebar">
          {selectedPerson ? (
            <div className="fp-person-panel">
              <div className="fp-person-panel-header">
                <div className="fp-person-panel-avatar" style={{ background: selectedPerson.color + '33', borderColor: selectedPerson.color }}>🧑</div>
                <div className="fp-person-panel-info">
                  <span className="fp-person-panel-id">{selectedPerson.id}</span>
                  <span className="fp-person-panel-route-text">{selectedPerson.from} → {selectedPerson.to}</span>
                </div>
                <button className="fp-person-close" onClick={() => setSelectedPerson(null)}>✕</button>
              </div>
              <div className="fp-person-floors-visited">
                {[...new Set(selectedPerson.route.map(wp => wp.floor))].sort().map(f => (
                  <span key={f} className="fp-person-floor-badge" style={{
                    background: f === activeFloor ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                    color: f === activeFloor ? '#60a5fa' : '#64748b',
                    border: f === activeFloor ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  }}>{['Ground', 'Floor 1', 'Floor 2'][f]}</span>
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
                      <span className="fp-person-visit-floor">{shop ? ['G','F1','F2'][shop.floor] : ''}</span>
                      <span className="fp-person-visit-time">{v.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : hoveredZone ? (
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
          ) : (
            <div className="fp-empty-state">
              <div className="fp-empty-icon">👆</div>
              <p>Click a person on the map to see their journey, or hover a shop for details</p>
            </div>
          )}

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
        </div>
      </div>
    </div>
  );
}
