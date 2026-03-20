import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { getOccupancyColor, getOccupancyLabel } from '../data/zones.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROOM_H = 2.8;
const FLOOR_STEP = 3.5;
const EYE_H = 1.65;
const WALK_SPEED = 5.5;
const BLDG_W = 18;
const BLDG_D = 12;
const FOV = 72;

// ── Canvas texture: room info billboard ───────────────────────────────────────
function makeRoomTexture(zone) {
  const ratio = Math.min(zone.currentCapacity / zone.maxCapacity, 1);
  const pct = Math.round(ratio * 100);
  const color = getOccupancyColor(ratio);
  const label = getOccupancyLabel(ratio);
  const floor = zone.floor === 0 ? 'Ground Floor' : 'Upper Floor';

  const W = 480, H = 290;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = 'rgba(6, 10, 22, 0.94)';
  ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 16); ctx.fill();

  // Accent border
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 16); ctx.stroke();

  // Left colour bar
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(4, 4, 6, H - 8, [16, 0, 0, 16]); ctx.fill();

  // Room name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(zone.name, 26, 18);

  // Floor badge
  ctx.fillStyle = '#6b7280'; ctx.font = '17px system-ui';
  ctx.fillText(floor, 26, 58);

  // Big percentage — right side
  ctx.fillStyle = color; ctx.font = 'bold 74px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(`${pct}%`, W - 16, 10);

  // Status label
  ctx.font = '17px system-ui'; ctx.fillText(label, W - 16, 96);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(26, 118); ctx.lineTo(W - 20, 118); ctx.stroke();

  // Occupancy bar
  const bx = 26, by = 132, bw = W - 46, bh = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(bx, by, bw * ratio, bh, 7); ctx.fill();

  // Stats columns
  const cols = [
    { l: 'CURRENT', v: zone.currentCapacity.toString() },
    { l: 'CAPACITY', v: zone.maxCapacity.toString() },
    { l: 'AVAILABLE', v: `${Math.max(0, zone.maxCapacity - zone.currentCapacity)}` },
  ];
  const colW = (W - 46) / 3;
  cols.forEach((col, i) => {
    const sx = 26 + i * colW;
    ctx.fillStyle = '#6b7280'; ctx.font = '13px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(col.l, sx, 164);
    ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 28px system-ui';
    ctx.fillText(col.v, sx, 184);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ── Sprite: floor level label ─────────────────────────────────────────────────
function makeFloorLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 60;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 60);
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 256, 30);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(7, 0.82, 1);
  return sp;
}

// ── Scene helpers ─────────────────────────────────────────────────────────────
function buildFloorSlab(scene, yBase) {
  const geo = new THREE.BoxGeometry(BLDG_W + 0.1, 0.12, BLDG_D + 0.1);
  const mat = new THREE.MeshStandardMaterial({ color: '#111828', roughness: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, yBase - 0.06, 0);
  scene.add(m);

  // Slab edge outline
  const edges = new THREE.EdgesGeometry(geo);
  m.add(new THREE.LineSegments(edges,
    new THREE.LineBasicMaterial({ color: '#243858', transparent: true, opacity: 0.6 })));
}

function buildOuterWalls(scene, yBase) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#1b2d4f', transparent: true, opacity: 0.20,
    side: THREE.DoubleSide, roughness: 0.35, metalness: 0.4,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#3a6090', transparent: true, opacity: 0.45 });

  const cy = yBase + ROOM_H / 2;
  [
    [0, cy, -BLDG_D / 2, BLDG_W, ROOM_H, 0],
    [0, cy, BLDG_D / 2, BLDG_W, ROOM_H, Math.PI],
    [BLDG_W / 2, cy, 0, BLDG_D, ROOM_H, -Math.PI / 2],
    [-BLDG_W / 2, cy, 0, BLDG_D, ROOM_H, Math.PI / 2],
  ].forEach(([x, y, z, w, h, ry]) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    scene.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat.clone()));
  });
}

function buildFloorTile(scene, zone, yBase) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const darkColor = new THREE.Color(getOccupancyColor(ratio)).multiplyScalar(0.26);
  const emissive = new THREE.Color(getOccupancyColor(ratio));

  const geo = new THREE.PlaneGeometry(zone.w - 0.06, zone.d - 0.06);
  const mat = new THREE.MeshStandardMaterial({
    color: darkColor, emissive, emissiveIntensity: 0.06, roughness: 0.85,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(zone.x, yBase + 0.013, zone.z);
  m.receiveShadow = true;
  scene.add(m);

  // Thin border at room edges
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: new THREE.Color(getOccupancyColor(ratio)), transparent: true, opacity: 0.35 }),
  );
  m.add(border);
}

function buildCeiling(scene, zone, yBase) {
  const geo = new THREE.PlaneGeometry(zone.w - 0.06, zone.d - 0.06);
  const mat = new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 0.92 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(zone.x, yBase + ROOM_H - 0.01, zone.z);
  scene.add(m);
}

function buildCrowdPeople(scene, zone, yBase) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const count = Math.round(ratio * 40);
  if (count === 0) return;

  const col = new THREE.Color(getOccupancyColor(ratio)).lerp(new THREE.Color('#ffffff'), 0.3);
  const mat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.55,
  });

  const bodyGeo = new THREE.CylinderGeometry(0.031, 0.038, 0.44, 6);
  const headGeo = new THREE.SphereGeometry(0.046, 7, 7);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, count);
  const heads = new THREE.InstancedMesh(headGeo, mat.clone(), count);
  const dummy = new THREE.Object3D();
  const pad = 0.46;

  for (let i = 0; i < count; i++) {
    const px = zone.x + (Math.random() - 0.5) * (zone.w - pad * 2);
    const pz = zone.z + (Math.random() - 0.5) * (zone.d - pad * 2);

    dummy.position.set(px, yBase + 0.22, pz);
    dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);

    dummy.position.set(px, yBase + 0.51, pz);
    dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(bodies, heads);
}

function buildInfoPanel(scene, zone, yBase, billboards) {
  const tex = makeRoomTexture(zone);
  const geo = new THREE.PlaneGeometry(3.0, 1.81); // 480:290 ratio
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(zone.x, yBase + 1.9, zone.z);
  scene.add(m);
  billboards.push(m);
}

// ── Camera helpers ────────────────────────────────────────────────────────────
function clampCamera(cam) {
  cam.position.x = Math.max(-9.1, Math.min(9.1, cam.position.x));
  cam.position.z = Math.max(-15, Math.min(6.4, cam.position.z));
  cam.position.y = Math.max(0.3, Math.min(FLOOR_STEP * 1.7 + EYE_H, cam.position.y));
}

function detectZone(cam, zones, nearZoneRef, setNearZone) {
  const { x, y, z } = cam.position;
  const floor = y > FLOOR_STEP * 0.55 ? 1 : 0;
  const found = zones.find(zone =>
    zone.floor === floor &&
    Math.abs(x - zone.x) < zone.w / 2 - 0.12 &&
    Math.abs(z - zone.z) < zone.d / 2 - 0.12,
  );
  if (found?.id !== nearZoneRef.current?.id) {
    nearZoneRef.current = found ?? null;
    setNearZone(found ?? null);
  }
}

// ── ZoneHUD — bottom-center panel when inside a zone ─────────────────────────
function ZoneHUD({ zone }) {
  const ratio = Math.min(zone.currentCapacity / zone.maxCapacity, 1);
  const pct = Math.round(ratio * 100);
  const color = getOccupancyColor(ratio);
  const label = getOccupancyLabel(ratio);
  const floorName = zone.floor === 0 ? 'Ground Floor' : 'Upper Floor';

  return (
    <div className="zone-hud">
      <div className="zhud-left">
        <span className="zhud-name">{zone.name}</span>
        <span className="zhud-floor">{floorName}</span>
      </div>
      <div className="zhud-mid">
        <div className="zhud-bar">
          <div className="zhud-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="zhud-pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="zhud-right">
        <span className="zhud-count">{zone.currentCapacity} / {zone.maxCapacity}</span>
        <span className="zhud-status" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

// ── EnterOverlay — shown before pointer lock is active ───────────────────────
function EnterOverlay({ onEnter }) {
  return (
    <div className="bv-enter" onClick={onEnter}>
      <div className="bv-enter-card">
        <div className="bv-enter-building-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="4" width="36" height="40" rx="2" stroke="#58a6ff" strokeWidth="2" fill="none" />
            <rect x="10" y="8" width="8" height="8" rx="1" fill="#58a6ff" opacity="0.7" />
            <rect x="22" y="8" width="8" height="8" rx="1" fill="#58a6ff" opacity="0.7" />
            <rect x="10" y="20" width="8" height="8" rx="1" fill="#58a6ff" opacity="0.5" />
            <rect x="22" y="20" width="8" height="8" rx="1" fill="#58a6ff" opacity="0.5" />
            <rect x="10" y="32" width="8" height="8" rx="1" fill="#58a6ff" opacity="0.4" />
            <rect x="18" y="30" width="12" height="14" rx="1" fill="#58a6ff" opacity="0.9" />
          </svg>
        </div>
        <h2 className="bv-enter-title">Nexus Tower</h2>
        <p className="bv-enter-sub">3D Building Explorer</p>
        <button className="bv-enter-btn">
          Click to Enter &amp; Look Around
        </button>
        <div className="bv-enter-keys">
          <div className="key-row">
            <kbd>W A S D</kbd><span>Walk</span>
          </div>
          <div className="key-row">
            <kbd>Scroll</kbd><span>Move forward / back</span>
          </div>
          <div className="key-row">
            <kbd>Q / E</kbd><span>Go up / down floors</span>
          </div>
          <div className="key-row">
            <kbd>ESC</kbd><span>Unlock cursor</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Crosshair ─────────────────────────────────────────────────────────────────
function Crosshair() {
  return <div className="bv-crosshair" />;
}

// ── BuildingViewer ─────────────────────────────────────────────────────────────
export function BuildingViewer({ zones }) {
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const billboardsRef = useRef([]);
  const keysRef = useRef({ w: false, a: false, s: false, d: false, q: false, e: false });
  const nearZoneRef = useRef(null);
  const animRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  const [isLocked, setIsLocked] = useState(false);
  const [nearZone, setNearZone] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06090f');
    scene.fog = new THREE.FogExp2('#06090f', 0.038);

    // ── Camera ───────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 120);
    camera.position.set(0, EYE_H, -12); // start outside, facing building
    camera.lookAt(0, EYE_H, 0);
    cameraRef.current = camera;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ── Pointer Lock Controls ─────────────────────────────────────────────────
    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.addEventListener('lock', () => setIsLocked(true));
    controls.addEventListener('unlock', () => setIsLocked(false));
    controlsRef.current = controls;

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight('#1e2f4a', 3.0));

    // Soft sky light coming from above
    const sky = new THREE.DirectionalLight('#ffffff', 0.6);
    sky.position.set(0, 30, -5);
    scene.add(sky);

    // Per-zone ceiling lights — coloured by occupancy
    zones.forEach((zone) => {
      const yBase = zone.floor * FLOOR_STEP;
      const lc = new THREE.Color(getOccupancyColor(zone.currentCapacity / zone.maxCapacity));
      lc.lerp(new THREE.Color('#88aaff'), 0.42);
      const radius = Math.max(zone.w, zone.d) * 1.6;
      const light = new THREE.PointLight(lc, 1.4, radius);
      light.position.set(zone.x, yBase + ROOM_H - 0.12, zone.z);
      scene.add(light);
    });

    // Exterior ambient light (for outside view)
    const extLight = new THREE.PointLight('#334d80', 2.5, 20);
    extLight.position.set(0, 5, -12);
    scene.add(extLight);

    // ── Ground grid (outside) ─────────────────────────────────────────────────
    const grid = new THREE.GridHelper(60, 60, '#10192c', '#0d1526');
    grid.position.y = -0.07;
    scene.add(grid);

    // ── Floor structures ──────────────────────────────────────────────────────
    [0, 1].forEach((floor) => {
      const yBase = floor * FLOOR_STEP;
      buildFloorSlab(scene, yBase);
      buildOuterWalls(scene, yBase);

      const lbl = makeFloorLabel(floor === 0 ? 'Ground Floor' : 'Upper Floor');
      lbl.position.set(-13, yBase + ROOM_H / 2, 0);
      scene.add(lbl);
    });

    // ── Zone interior geometry ────────────────────────────────────────────────
    const billboards = [];
    zones.forEach((zone) => {
      const yBase = zone.floor * FLOOR_STEP;
      buildFloorTile(scene, zone, yBase);
      buildCeiling(scene, zone, yBase);
      buildCrowdPeople(scene, zone, yBase);
      buildInfoPanel(scene, zone, yBase, billboards);
    });
    billboardsRef.current = billboards;

    // ── Exterior building silhouette (visible from outside) ──────────────────
    // Colored translucent room boxes so the building is visible before entering
    zones.forEach((zone) => {
      const ratio = zone.currentCapacity / zone.maxCapacity;
      const col = new THREE.Color(getOccupancyColor(ratio));
      const yBase = zone.floor * FLOOR_STEP;
      const geo = new THREE.BoxGeometry(zone.w, ROOM_H, zone.d);
      const mat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.08,
        transparent: true, opacity: 0.18, side: THREE.FrontSide,
        roughness: 0.3, metalness: 0.05,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(zone.x, yBase + ROOM_H / 2, zone.z);
      scene.add(m);
    });

    // ── Keyboard ─────────────────────────────────────────────────────────────
    const keys = keysRef.current;
    const onKeyDown = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = true;
      if (e.code === 'KeyQ') keys.q = true;
      if (e.code === 'KeyE') keys.e = true;
    };
    const onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = false;
      if (e.code === 'KeyQ') keys.q = false;
      if (e.code === 'KeyE') keys.e = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // ── Scroll: move forward/back ─────────────────────────────────────────────
    const onWheel = (e) => {
      e.preventDefault();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.length() > 0.001) dir.normalize();
      camera.position.addScaledVector(dir, -e.deltaY * 0.014);
      clampCamera(camera);
    };
    mount.addEventListener('wheel', onWheel, { passive: false });

    // ── Animate loop ──────────────────────────────────────────────────────────
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      const dt = Math.min(clockRef.current.getDelta(), 0.05);
      const speed = WALK_SPEED * dt;
      const k = keysRef.current;

      // Movement direction — always horizontal
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.length() > 0.001) dir.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(dir, camera.up).normalize();

      if (k.w) camera.position.addScaledVector(dir, speed);
      if (k.s) camera.position.addScaledVector(dir, -speed);
      if (k.a) camera.position.addScaledVector(right, -speed);
      if (k.d) camera.position.addScaledVector(right, speed);
      if (k.q) camera.position.y += speed * 0.65;
      if (k.e) camera.position.y -= speed * 0.65;

      clampCamera(camera);

      // Info panels always face the camera (billboard effect)
      billboardsRef.current.forEach((b) => b.lookAt(camera.position));

      // Update room HUD
      detectZone(camera, zones, nearZoneRef, setNearZone);

      renderer.render(scene, camera);
    }
    clockRef.current.start();
    animate();

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      mount.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(animRef.current);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      scene.clear();
      billboardsRef.current = [];
      nearZoneRef.current = null;
    };
  }, [zones]);

  const handleClick = () => controlsRef.current?.lock();

  return (
    <div className="bv-wrap">
      <div
        ref={mountRef}
        className="bv-canvas"
        onClick={handleClick}
      />

      {/* Enter screen before pointer lock */}
      {!isLocked && <EnterOverlay onEnter={handleClick} />}

      {/* First-person crosshair */}
      {isLocked && <Crosshair />}

      {/* Room info HUD — appears when camera is inside a zone */}
      {nearZone && <ZoneHUD zone={nearZone} />}

      {/* Persistent hint */}
      <div className="bv-hint">
        WASD · scroll to move &nbsp;·&nbsp; Q / E to change floor &nbsp;·&nbsp; click to look &amp; unlock
      </div>
    </div>
  );
}
