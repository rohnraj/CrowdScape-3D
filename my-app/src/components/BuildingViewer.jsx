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

  ctx.fillStyle = 'rgba(6, 10, 22, 0.94)';
  ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 16); ctx.fill();

  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 16); ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(4, 4, 6, H - 8, [16, 0, 0, 16]); ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(zone.name, 26, 18);

  ctx.fillStyle = '#6b7280'; ctx.font = '17px system-ui';
  ctx.fillText(floor, 26, 58);

  ctx.fillStyle = color; ctx.font = 'bold 74px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(`${pct}%`, W - 16, 10);

  ctx.font = '17px system-ui'; ctx.fillText(label, W - 16, 96);

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(26, 118); ctx.lineTo(W - 20, 118); ctx.stroke();

  const bx = 26, by = 132, bw = W - 46, bh = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(bx, by, bw * ratio, bh, 7); ctx.fill();

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

// ── Environment Helpers ───────────────────────────────────────────────────────
function buildEnvironment(scene, walkable) {
  // Grass plane
  const geo = new THREE.PlaneGeometry(120, 120);
  const mat = new THREE.MeshStandardMaterial({ color: '#557a27', roughness: 1.0 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  scene.add(ground);
  walkable.push(ground); // Crucial for taking stairs realistically

  // Paved Road leading to the front
  const roadGeo = new THREE.PlaneGeometry(6, 40);
  const roadMat = new THREE.MeshStandardMaterial({ color: '#313438', roughness: 0.95 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.10, BLDG_D / 2 + 20); // Extends from front of building
  road.receiveShadow = true;
  scene.add(road);
  walkable.push(road);

  // Procedural low-poly trees
  const treeMat = new THREE.MeshStandardMaterial({ color: '#325828', roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4d3d2c', roughness: 1.0 });
  const treeGeo = new THREE.ConeGeometry(1.4, 4.0, 5);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.5, 5);

  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    
    // Clear zone around building and road
    if (Math.abs(x) < BLDG_W / 2 + 3 && Math.abs(z) < BLDG_D / 2 + 3) continue;
    if (Math.abs(x) < 4.0 && z > 0) continue; // Keep road clear

    const scale = 0.6 + Math.random() * 0.8;

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, scale * 0.75 - 0.12, z);
    trunk.scale.set(scale, scale, scale);
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    const leaves = new THREE.Mesh(treeGeo, treeMat);
    leaves.position.set(x, scale * 1.5 + scale * 0.75 - 0.12, z);
    leaves.scale.set(scale, scale, scale);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    leaves.rotation.y = Math.random() * Math.PI;

    scene.add(trunk, leaves);
  }
}

// ── Scene helpers ─────────────────────────────────────────────────────────────
function buildFloorSlab(scene, yBase, walkable) {
  const geo = new THREE.BoxGeometry(BLDG_W + 0.1, 0.12, BLDG_D + 0.1);
  const mat = new THREE.MeshStandardMaterial({ color: '#c4cbcf', roughness: 0.9, metalness: 0.1 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, yBase - 0.06, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  walkable.push(m); // Physical floor to walk on

  const edges = new THREE.EdgesGeometry(geo);
  m.add(new THREE.LineSegments(edges,
    new THREE.LineBasicMaterial({ color: '#8899aa', transparent: true, opacity: 0.6 })));
}

function buildOuterWalls(scene, yBase, floorIndex) {
  // Tinted beautiful vibrant glass
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#8bd4ff', transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, roughness: 0.05, metalness: 0.1,
    transmission: 0.8, ior: 1.5, clearcoat: 1.0, clearcoatRoughness: 0.1
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 });

  const cy = yBase + ROOM_H / 2;

  // Front Wall (z = BLDG_D/2)
  if (floorIndex === 0) {
    // Grand entrance gate (Cutout)
    const gapW = 4;
    const wS = (BLDG_W - gapW) / 2;

    const pL = new THREE.Mesh(new THREE.PlaneGeometry(wS, ROOM_H), mat);
    pL.position.set(-gapW / 2 - wS / 2, cy, BLDG_D / 2);
    pL.rotation.y = Math.PI;

    const pR = new THREE.Mesh(new THREE.PlaneGeometry(wS, ROOM_H), mat);
    pR.position.set(gapW / 2 + wS / 2, cy, BLDG_D / 2);
    pR.rotation.y = Math.PI;

    const topH = ROOM_H - 2.2;
    const pT = new THREE.Mesh(new THREE.PlaneGeometry(gapW, topH), mat);
    pT.position.set(0, yBase + 2.2 + topH / 2, BLDG_D / 2);
    pT.rotation.y = Math.PI;

    scene.add(pL, pR, pT);
    pL.add(new THREE.LineSegments(new THREE.EdgesGeometry(pL.geometry), edgeMat.clone()));
    pR.add(new THREE.LineSegments(new THREE.EdgesGeometry(pR.geometry), edgeMat.clone()));
    pT.add(new THREE.LineSegments(new THREE.EdgesGeometry(pT.geometry), edgeMat.clone()));

    // Gate decorative frame
    const frameMat = new THREE.MeshStandardMaterial({ color: '#2a3b4c', roughness: 0.8 });
    const pFrameGeo = new THREE.BoxGeometry(0.5, 2.2, 0.5);
    const post1 = new THREE.Mesh(pFrameGeo, frameMat); post1.position.set(-gapW / 2, yBase + 1.1, BLDG_D / 2);
    const post2 = new THREE.Mesh(pFrameGeo, frameMat); post2.position.set(gapW / 2, yBase + 1.1, BLDG_D / 2);
    
    post1.castShadow = true; post2.castShadow = true;
    scene.add(post1, post2);

  } else {
    // Normal enclosed front wall for upper floors
    const pF = new THREE.Mesh(new THREE.PlaneGeometry(BLDG_W, ROOM_H), mat.clone());
    pF.position.set(0, cy, BLDG_D / 2);
    pF.rotation.y = Math.PI;
    scene.add(pF);
    pF.add(new THREE.LineSegments(new THREE.EdgesGeometry(pF.geometry), edgeMat.clone()));
  }

  // Back, Right, Left walls
  [
    [0, cy, -BLDG_D / 2, BLDG_W, ROOM_H, 0],            // back
    [BLDG_W / 2, cy, 0, BLDG_D, ROOM_H, -Math.PI / 2],  // right
    [-BLDG_W / 2, cy, 0, BLDG_D, ROOM_H, Math.PI / 2],  // left
  ].forEach(([x, y, z, w, h, ry]) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    scene.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat.clone()));
  });
}

function buildStairs(scene, walkable) {
  // A ramp that looks seamlessly placed in the back room connecting Floor 0 to 1
  const len = 9;
  const w = 2.4;
  const geo = new THREE.BoxGeometry(len, 0.2, w);
  const mat = new THREE.MeshStandardMaterial({ color: '#445566', roughness: 0.95 });
  const ramp = new THREE.Mesh(geo, mat);

  ramp.position.set(0, FLOOR_STEP / 2, -BLDG_D / 2 + w / 2 + 0.1);
  ramp.rotation.z = Math.atan2(FLOOR_STEP, len); // Ramp slopes upwards towards +X
  ramp.receiveShadow = true;
  ramp.castShadow = true;
  scene.add(ramp);
  walkable.push(ramp);
}

function buildFloorTile(scene, zone, yBase) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const darkColor = new THREE.Color(getOccupancyColor(ratio)).multiplyScalar(0.4);
  const emissive = new THREE.Color(getOccupancyColor(ratio));

  const geo = new THREE.PlaneGeometry(zone.w - 0.06, zone.d - 0.06);
  const mat = new THREE.MeshStandardMaterial({
    color: darkColor, emissive, emissiveIntensity: 0.15, roughness: 0.85,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(zone.x, yBase + 0.013, zone.z);
  m.receiveShadow = true;
  scene.add(m);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: new THREE.Color(getOccupancyColor(ratio)), transparent: true, opacity: 0.5 }),
  );
  m.add(border);
}

function buildCeiling(scene, zone, yBase) {
  const geo = new THREE.PlaneGeometry(zone.w - 0.06, zone.d - 0.06);
  const mat = new THREE.MeshStandardMaterial({ color: '#f0f4f8', roughness: 0.95 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(zone.x, yBase + ROOM_H - 0.01, zone.z);
  m.receiveShadow = true;
  m.castShadow = true;
  scene.add(m);
}

function buildCrowdPeople(scene, zone, yBase, crowdAnimRef) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const count = Math.round(ratio * 40);
  if (count === 0) return;

  const col = new THREE.Color(getOccupancyColor(ratio)).lerp(new THREE.Color('#ffffff'), 0.2);
  const mat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 0.1, roughness: 0.65,
  });

  const bodyGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.44, 6);
  const headGeo = new THREE.SphereGeometry(0.05, 7, 7);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, count);
  const heads = new THREE.InstancedMesh(headGeo, mat.clone(), count);
  
  bodies.castShadow = true; bodies.receiveShadow = true;
  heads.castShadow = true; heads.receiveShadow = true;
  
  const dummy = new THREE.Object3D();
  const pad = 0.5;

  for (let i = 0; i < count; i++) {
    const px = zone.x + (Math.random() - 0.5) * (zone.w - pad * 2);
    const pz = zone.z + (Math.random() - 0.5) * (zone.d - pad * 2);

    dummy.position.set(px, yBase + 0.22, pz);
    dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);

    dummy.position.set(px, yBase + 0.51, pz);
    dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);

    crowdAnimRef.current.push({
      bodies, heads, i, x: px, by: yBase + 0.22, hy: yBase + 0.51, z: pz, off: Math.random() * Math.PI * 2
    });
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(bodies, heads);
}

function buildInfoPanel(scene, zone, yBase, billboards) {
  const tex = makeRoomTexture(zone);
  const geo = new THREE.PlaneGeometry(3.0, 1.81);
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
  cam.position.x = Math.max(-55, Math.min(55, cam.position.x));
  cam.position.z = Math.max(-55, Math.min(55, cam.position.z));
}

function detectZone(cam, zones, nearZoneRef, setNearZone) {
  const { x, y, z } = cam.position;
  // Dynamic floor detection based on camera height!
  const floor = y > FLOOR_STEP * 0.5 + EYE_H ? 1 : 0;
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

// ── Handlers ──────────────────────────────────────────────────────────────────
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
        <p className="bv-enter-sub">3D Physical Environment Explorer</p>
        <button className="bv-enter-btn">
          Click to Enter &amp; Walk Inside
        </button>
        <div className="bv-enter-keys">
          <div className="key-row">
            <kbd>W A S D</kbd><span>Walk</span>
          </div>
          <div className="key-row">
            <kbd>Scroll</kbd><span>Move forward / back</span>
          </div>
          <div className="key-row">
            <kbd>ESC</kbd><span>Unlock cursor</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Crosshair() {
  return <div className="bv-crosshair" />;
}

// ── BuildingViewer ─────────────────────────────────────────────────────────────
export function BuildingViewer({ zones }) {
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const billboardsRef = useRef([]);
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const nearZoneRef = useRef(null);
  const animRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const crowdAnimRef = useRef([]);
  const isLockedRef = useRef(false);
  const walkableRef = useRef([]);

  const [isLocked, setIsLocked] = useState(false);
  const [nearZone, setNearZone] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#7ec0ee');
    scene.fog = new THREE.FogExp2('#7ec0ee', 0.02);

    // ── Camera ───────────────────────────────────────────────────────────────
    // Start standing slightly outside the front road facing the main gate
    const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 150);
    camera.position.set(0, EYE_H, 14);
    camera.lookAt(0, EYE_H, 0);
    cameraRef.current = camera;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Pointer Lock Controls ─────────────────────────────────────────────────
    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.addEventListener('lock', () => { setIsLocked(true); isLockedRef.current = true; });
    controls.addEventListener('unlock', () => { setIsLocked(false); isLockedRef.current = false; });
    controlsRef.current = controls;

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight('#ffffff', 0.6));

    const sun = new THREE.DirectionalLight('#fff5e6', 1.8);
    sun.position.set(20, 30, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    zones.forEach((zone) => {
      const yBase = zone.floor * FLOOR_STEP;
      const lc = new THREE.Color(getOccupancyColor(zone.currentCapacity / zone.maxCapacity));
      lc.lerp(new THREE.Color('#ffffff'), 0.5);
      const radius = Math.max(zone.w, zone.d) * 1.6;
      const light = new THREE.PointLight(lc, 1.0, radius);
      light.position.set(zone.x, yBase + ROOM_H - 0.2, zone.z);
      scene.add(light);
    });

    // ── Environment & Walkable array ──────────────────────────────────────────
    const walkable = [];
    buildEnvironment(scene, walkable);

    // ── Floor structures ──────────────────────────────────────────────────────
    [0, 1].forEach((floor, idx) => {
      const yBase = floor * FLOOR_STEP;
      buildFloorSlab(scene, yBase, walkable);
      buildOuterWalls(scene, yBase, idx);

      const lbl = makeFloorLabel(floor === 0 ? 'Ground Floor' : 'Upper Floor');
      lbl.position.set(-13, yBase + ROOM_H / 2, 0);
      scene.add(lbl);
    });

    buildStairs(scene, walkable);
    walkableRef.current = walkable;

    // ── Zone interior geometry ────────────────────────────────────────────────
    const billboards = [];
    crowdAnimRef.current = []; // reset for hot reloads
    zones.forEach((zone) => {
      const yBase = zone.floor * FLOOR_STEP;
      buildFloorTile(scene, zone, yBase);
      buildCeiling(scene, zone, yBase);
      buildCrowdPeople(scene, zone, yBase, crowdAnimRef);
      buildInfoPanel(scene, zone, yBase, billboards);
    });
    billboardsRef.current = billboards;

    // Solid colored translucent blocks for visual flair
    zones.forEach((zone) => {
      const ratio = zone.currentCapacity / zone.maxCapacity;
      const col = new THREE.Color(getOccupancyColor(ratio));
      const yBase = zone.floor * FLOOR_STEP;
      const geo = new THREE.BoxGeometry(zone.w, ROOM_H, zone.d);
      const mat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.1,
        transparent: true, opacity: 0.2, side: THREE.FrontSide,
        roughness: 0.2, metalness: 0.1,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(zone.x, yBase + ROOM_H / 2, zone.z);
      scene.add(m);
    });

    // ── Keyboard ─────────────────────────────────────────────────────────────
    const keys = keysRef.current;
    const onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = true;
    };
    const onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // ── Scroll ───────────────────────────────────────────────────────────────
    const onWheel = (e) => {
      e.preventDefault();
      if (!isLockedRef.current) return;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.length() > 0.001) dir.normalize();
      camera.position.addScaledVector(dir, -e.deltaY * 0.014);
      clampCamera(camera);
    };
    mount.addEventListener('wheel', onWheel, { passive: false });

    // Gravity logic elements
    const raycaster = new THREE.Raycaster();
    const rayDown = new THREE.Vector3(0, -1, 0);

    // ── Animate loop ──────────────────────────────────────────────────────────
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      const time = clockRef.current.getElapsedTime();
      const dt = Math.min(clockRef.current.getDelta(), 0.05);

      if (isLockedRef.current) {
        // Player manual walk mode
        const speed = WALK_SPEED * dt;
        const k = keysRef.current;
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

        clampCamera(camera);

        // Apply physical Raycast to find floor beneath player
        const origin = new THREE.Vector3().copy(camera.position);
        origin.y += 1.0; // Cast from above the player to find stairs they're on
        raycaster.set(origin, rayDown);
        const hits = raycaster.intersectObjects(walkableRef.current, false);
        if (hits.length > 0) {
           const groundY = hits[0].point.y;
           // Smooth dampening to simulate walking/climbing
           camera.position.y += ((groundY + EYE_H) - camera.position.y) * 0.25;
        }

        billboardsRef.current.forEach((b) => b.lookAt(camera.position));
      } else {
        // Cinematic camera mode
        const dist = 24.0;
        camera.position.x = Math.sin(time * 0.15) * dist;
        camera.position.z = Math.cos(time * 0.15) * dist;
        camera.position.y = 6.0 + Math.sin(time * 0.2) * 2.0;
        camera.lookAt(0, 3, 0);
      }

      // Animating the people bouncing
      const updatedMeshes = new Set();
      const dummy = new THREE.Object3D();
      crowdAnimRef.current.forEach((p) => {
        const yOff = Math.abs(Math.sin(time * 3.5 + p.off)) * 0.04;
        
        dummy.position.set(p.x, p.by + yOff, p.z);
        dummy.updateMatrix();
        p.bodies.setMatrixAt(p.i, dummy.matrix);
        updatedMeshes.add(p.bodies);

        dummy.position.set(p.x, p.hy + yOff, p.z);
        dummy.updateMatrix();
        p.heads.setMatrixAt(p.i, dummy.matrix);
        updatedMeshes.add(p.heads);
      });
      updatedMeshes.forEach(m => m.instanceMatrix.needsUpdate = true);

      // Update room HUD
      if (isLockedRef.current) {
        detectZone(camera, zones, nearZoneRef, setNearZone);
      }

      renderer.render(scene, camera);
    }
    clockRef.current.start();
    animate();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

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
      crowdAnimRef.current = [];
      walkableRef.current = [];
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

      {!isLocked && <EnterOverlay onEnter={handleClick} />}
      {isLocked && <Crosshair />}
      {isLocked && nearZone && <ZoneHUD zone={nearZone} />}

      <div className="bv-hint">
        WASD/Arrows · scroll to move &nbsp;·&nbsp; walk up the rear stairs to change floor &nbsp;·&nbsp; click to unlock
      </div>
    </div>
  );
}
