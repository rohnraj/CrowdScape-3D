import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { getOccupancyColor, getOccupancyLabel } from '../data/zones.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const FLOOR_H    = 3.2;
const FLOOR_STEP = 4.0;
const EYE_H      = 1.7;
const WALK_SPEED = 5.0;    // max speed m/s
const ACCEL      = 28.0;   // acceleration m/s²
const FRICTION   = 14.0;   // deceleration m/s²
const BOB_FREQ   = 8.0;    // head-bob cycles/s while walking
const BOB_AMP    = 0.055;  // head-bob amplitude (world units)
const MALL_W     = 24;
const MALL_D     = 16;
const FOV        = 75;

// Camera starts on the road, facing the mall front gate
const START_X =  0;
const START_Z =  18;

// ── Stair geometry constants (shared between builder and movement) ─────────────
// Stairs are on the LEFT wall (x ≈ STAIR_X), running along Z.
// Walking in the −Z direction goes UP; walking in the +Z direction goes DOWN.
const STAIR_X     = -9.0;   // centre X of stairwell
const STAIR_W     =  2.8;   // width along X
const STAIR_Z_BOT =  5.5;   // z at the bottom landing (floor N)
const STAIR_Z_TOP = -4.0;   // z at the top landing   (floor N+1)
const STAIR_LEN   = Math.abs(STAIR_Z_BOT - STAIR_Z_TOP);

// Returns the interpolated Y on the ramp surface for a given Z position
// (only valid when STAIR_Z_TOP <= z <= STAIR_Z_BOT)
function rampYatZ(z, floorIndex) {
  const yBot = floorIndex * FLOOR_STEP;
  const yTop = (floorIndex + 1) * FLOOR_STEP;
  const t = (STAIR_Z_BOT - z) / STAIR_LEN;   // 0 at bottom, 1 at top
  return yBot + (yTop - yBot) * t;
}

// Is the player currently on the stairwell footprint?
function onStairXZ(x, z) {
  return (
    Math.abs(x - STAIR_X) < STAIR_W / 2 &&
    z >= STAIR_Z_TOP - 0.5 &&
    z <= STAIR_Z_BOT + 0.5
  );
}

// ── Canvas texture: shop info billboard ───────────────────────────────────────
function makeShopTexture(zone) {
  const ratio = Math.min(zone.currentCapacity / zone.maxCapacity, 1);
  const pct   = Math.round(ratio * 100);
  const color = getOccupancyColor(ratio);
  const label = getOccupancyLabel(ratio);
  const W = 512, H = 300;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(8,12,28,0.97)');
  grad.addColorStop(1, 'rgba(14,20,40,0.97)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(4, 4, W-8, H-8, 18); ctx.fill();

  // Accent border
  ctx.strokeStyle = zone.color || color;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(4, 4, W-8, H-8, 18); ctx.stroke();

  // Left color bar
  ctx.fillStyle = zone.color || color;
  ctx.beginPath(); ctx.roundRect(4, 4, 7, H-8, [18,0,0,18]); ctx.fill();

  // Emoji
  ctx.font = '44px serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(zone.emoji || '🏪', 26, 14);

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(zone.name, 26, 72);

  // Category
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui';
  ctx.fillText(zone.category || '', 26, 108);

  // Pct big
  ctx.fillStyle = color;
  ctx.font = 'bold 68px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(`${pct}%`, W-16, 12);

  ctx.font = '16px system-ui';
  ctx.fillText(label, W-16, 90);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(26, 132); ctx.lineTo(W-20, 132); ctx.stroke();

  // Progress bar
  const bx=26, by=146, bw=W-46, bh=12;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(bx, by, bw*ratio, bh, 6); ctx.fill();

  // Stats
  const cols = [
    { l:'INSIDE',    v: zone.currentCapacity.toString() },
    { l:'CAPACITY',  v: zone.maxCapacity.toString() },
    { l:'FREE',      v: `${Math.max(0, zone.maxCapacity - zone.currentCapacity)}` },
  ];
  const colW = (W-46)/3;
  cols.forEach((col, i) => {
    const sx = 26 + i*colW;
    ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(col.l, sx, 172);
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 26px system-ui';
    ctx.fillText(col.v, sx, 192);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ── Floor label sprite ────────────────────────────────────────────────────────
function makeFloorLabel(text) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 72;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 640, 72);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 320, 36);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(9, 1.0, 1);
  return sp;
}

// ── Decorative plaza tiles (like the image) ───────────────────────────────────
function buildPlaza(scene, walkable) {
  // Base ground — also walkable so gravity works outside the mall
  const plazaGeo = new THREE.PlaneGeometry(120, 120);
  const plazaMat = new THREE.MeshStandardMaterial({ color: '#c8d4a0', roughness: 0.95 });
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);
  walkable.push(plaza);   // ← player can stand on the ground outside

  // Decorative tile grid
  const tileColors = ['#d4e8a0', '#e8c8a0', '#a0c8d4', '#d4a0c8', '#c8d4a0'];
  const tileSize = 2.5;
  const tileGeo = new THREE.PlaneGeometry(tileSize - 0.08, tileSize - 0.08);
  for (let xi = -16; xi <= 16; xi++) {
    for (let zi = -16; zi <= 16; zi++) {
      const cx = xi * tileSize, cz = zi * tileSize;
      if (Math.abs(cx) < MALL_W/2 + 2 && Math.abs(cz) < MALL_D/2 + 2) continue;
      const col = tileColors[(Math.abs(xi*3 + zi*7)) % tileColors.length];
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
      const m = new THREE.Mesh(tileGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, -0.04, cz);
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Decorative circular patterns (like the image)
  const circlePositions = [[-22, -18], [22, -18], [-22, 18], [22, 18]];
  circlePositions.forEach(([cx, cz]) => {
    for (let r = 0; r < 5; r++) {
      const segments = 8 + r * 4;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const radius = 1.5 + r * 1.4;
        const px = cx + Math.cos(angle) * radius;
        const pz = cz + Math.sin(angle) * radius;
        const wedgeColors = ['#e8a070', '#70c8a0', '#a070e8', '#e8d070'];
        const wMat = new THREE.MeshStandardMaterial({
          color: wedgeColors[s % wedgeColors.length], roughness: 0.85
        });
        const wGeo = new THREE.PlaneGeometry(1.1, 1.1);
        const wm = new THREE.Mesh(wGeo, wMat);
        wm.rotation.x = -Math.PI / 2;
        wm.position.set(px, -0.03, pz);
        scene.add(wm);
      }
    }
  });

  // Road — a flat box so raycaster hits it reliably
  const roadMat = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 60), roadMat);
  road.position.set(0, -0.0, MALL_D/2 + 30);
  road.receiveShadow = true;
  scene.add(road);
  walkable.push(road);   // ← player walks on the road

  // Road markings
  for (let i = -4; i <= 4; i++) {
    const markMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), markMat);
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(0, -0.01, MALL_D/2 + 10 + i * 6);
    scene.add(mark);
  }

  // Landscaping — green strips
  const grassMat = new THREE.MeshStandardMaterial({ color: '#5a8a30', roughness: 1.0 });
  [[-35, 0], [35, 0]].forEach(([gx, gz]) => {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), grassMat);
    gm.rotation.x = -Math.PI / 2;
    gm.position.set(gx, -0.03, gz);
    gm.receiveShadow = true;
    scene.add(gm);
  });

  // Trees
  const treeMat  = new THREE.MeshStandardMaterial({ color: '#2d6a1f', roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c3d1e', roughness: 1.0 });
  const treeGeo  = new THREE.ConeGeometry(1.6, 4.5, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.38, 1.8, 6);
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() - 0.5) * 90;
    const z = (Math.random() - 0.5) * 90;
    if (Math.abs(x) < MALL_W/2 + 4 && Math.abs(z) < MALL_D/2 + 4) continue;
    if (Math.abs(x) < 5 && z > 0) continue;
    const sc = 0.5 + Math.random() * 0.9;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, sc*0.9 - 0.05, z);
    trunk.scale.setScalar(sc);
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(treeGeo, treeMat);
    leaves.position.set(x, sc*1.8 + sc*0.9 - 0.05, z);
    leaves.scale.setScalar(sc);
    leaves.castShadow = true;
    leaves.rotation.y = Math.random() * Math.PI;
    scene.add(trunk, leaves);
  }
}

// ── Floor slab ────────────────────────────────────────────────────────────────
function buildFloorSlab(scene, yBase, floorIndex, walkableByFloor) {
  const geo = new THREE.BoxGeometry(MALL_W + 0.2, 0.15, MALL_D + 0.2);
  const mat = new THREE.MeshStandardMaterial({ color: '#dde4ea', roughness: 0.85, metalness: 0.05 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, yBase - 0.075, 0);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  walkableByFloor[floorIndex].push(m);
  m.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: '#8899aa', transparent: true, opacity: 0.4 })
  ));
}

// ── Glass facade walls (mall style) ──────────────────────────────────────────
function buildGlassFacade(scene, yBase, floorIndex) {
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#7dd3fc',
    transparent: true, opacity: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.04, metalness: 0.08,
    transmission: 0.85, ior: 1.52,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#c0c8d0', roughness: 0.4, metalness: 0.7 });
  const edgeMat  = new THREE.LineBasicMaterial({ color: '#e0f0ff', transparent: true, opacity: 0.35 });

  const cy = yBase + FLOOR_H / 2;
  const panelW = 2.0;

  // Helper: add a glass wall with frame grid
  const addGlassWall = (x, y, z, w, h, ry) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, glassMat.clone());
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat.clone()));

    // Vertical frame mullions
    const cols = Math.floor(w / panelW);
    for (let c = 0; c <= cols; c++) {
      const fx = -w/2 + c * panelW;
      const fGeo = new THREE.BoxGeometry(0.06, h, 0.06);
      const fm = new THREE.Mesh(fGeo, frameMat);
      fm.position.set(fx, 0, 0);
      mesh.add(fm);
    }
    // Horizontal frame rails
    const rows = Math.floor(h / 1.2);
    for (let r = 0; r <= rows; r++) {
      const fy = -h/2 + r * 1.2;
      const rGeo = new THREE.BoxGeometry(w, 0.06, 0.06);
      const rm = new THREE.Mesh(rGeo, frameMat);
      rm.position.set(0, fy, 0);
      mesh.add(rm);
    }
  };

  if (floorIndex === 0) {
    // Grand entrance cutout on front wall
    const gapW = 6;
    const sideW = (MALL_W - gapW) / 2;
    addGlassWall(-gapW/2 - sideW/2, cy, MALL_D/2, sideW, FLOOR_H, Math.PI);
    addGlassWall( gapW/2 + sideW/2, cy, MALL_D/2, sideW, FLOOR_H, Math.PI);
    // Top transom
    const topH = FLOOR_H - 2.4;
    addGlassWall(0, yBase + 2.4 + topH/2, MALL_D/2, gapW, topH, Math.PI);

    // Entrance frame posts
    const postGeo = new THREE.BoxGeometry(0.18, 2.4, 0.18);
    [-gapW/2, gapW/2].forEach(px => {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(px, yBase + 1.2, MALL_D/2);
      post.castShadow = true;
      scene.add(post);
    });
  } else {
    addGlassWall(0, cy, MALL_D/2, MALL_W, FLOOR_H, Math.PI);
  }

  // Back, left, right walls
  addGlassWall(0,          cy, -MALL_D/2, MALL_W, FLOOR_H, 0);
  addGlassWall( MALL_W/2,  cy, 0,         MALL_D, FLOOR_H, -Math.PI/2);
  addGlassWall(-MALL_W/2,  cy, 0,         MALL_D, FLOOR_H,  Math.PI/2);
}

// ── Atrium skylight roof ──────────────────────────────────────────────────────
function buildRoof(scene, yTop) {
  const roofMat = new THREE.MeshStandardMaterial({ color: '#e8edf2', roughness: 0.7, metalness: 0.2 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(MALL_W + 0.4, 0.3, MALL_D + 0.4), roofMat);
  roof.position.set(0, yTop, 0);
  roof.castShadow = true; roof.receiveShadow = true;
  scene.add(roof);

  // Skylight glass panels on roof
  const skyMat = new THREE.MeshPhysicalMaterial({
    color: '#bae6fd', transparent: true, opacity: 0.4,
    roughness: 0.02, metalness: 0.0, transmission: 0.9,
  });
  const skyGeo = new THREE.PlaneGeometry(10, 8);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.rotation.x = -Math.PI / 2;
  sky.position.set(0, yTop + 0.16, 0);
  scene.add(sky);

  // Rooftop HVAC cylinders (like the image)
  const cylMat = new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.6, metalness: 0.5 });
  const cylPositions = [[-4,-2],[-2,-2],[0,-2],[2,-2],[4,-2],[-3,1],[0,1],[3,1]];
  cylPositions.forEach(([cx, cz]) => {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 10), cylMat);
    cyl.position.set(cx, yTop + 0.85, cz);
    cyl.castShadow = true;
    scene.add(cyl);
    // Cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10), cylMat);
    cap.position.set(cx, yTop + 1.62, cz);
    scene.add(cap);
  });

  // Parapet wall
  const parapetMat = new THREE.MeshStandardMaterial({ color: '#f0f4f8', roughness: 0.8 });
  [
    [0, yTop+0.45, MALL_D/2+0.1, MALL_W+0.4, 0.6, 0.2],
    [0, yTop+0.45, -MALL_D/2-0.1, MALL_W+0.4, 0.6, 0.2],
    [MALL_W/2+0.1, yTop+0.45, 0, 0.2, 0.6, MALL_D+0.4],
    [-MALL_W/2-0.1, yTop+0.45, 0, 0.2, 0.6, MALL_D+0.4],
  ].forEach(([x,y,z,w,h,d]) => {
    const pm = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), parapetMat);
    pm.position.set(x,y,z);
    pm.castShadow = true;
    scene.add(pm);
  });
}

// ── Stairs ────────────────────────────────────────────────────────────────────
// Visual-only geometry — movement is handled analytically via rampYatZ().
// We still push the ramp mesh into walkable[] as a fallback for the raycaster
// when the player is mid-ramp and the floor slab is out of range.
function buildStairs(scene, walkableByFloor) {
  const rampMat  = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.85, metalness: 0.25 });
  const railMat  = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: 0.65 });
  const landMat  = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.8 });

  for (let floor = 0; floor < 2; floor++) {
    const yBot = floor * FLOOR_STEP;
    const yTop = (floor + 1) * FLOOR_STEP;
    const zMid = (STAIR_Z_BOT + STAIR_Z_TOP) / 2;
    const yMid = (yBot + yTop) / 2;
    const angle = Math.atan2(yTop - yBot, STAIR_Z_BOT - STAIR_Z_TOP);

    // ── Ramp surface ──────────────────────────────────────────────────────────
    const rampGeo = new THREE.BoxGeometry(STAIR_W, 0.18, STAIR_LEN + 0.4);
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(STAIR_X, yMid, zMid);
    ramp.rotation.x = angle;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);
    // Add to BOTH adjacent floors so raycaster finds it from either side
    walkableByFloor[floor].push(ramp);
    walkableByFloor[floor + 1].push(ramp);

    // ── Step treads (visual) ──────────────────────────────────────────────────
    const STEPS = 12;
    for (let s = 0; s < STEPS; s++) {
      const t  = (s + 0.5) / STEPS;
      const sz = STAIR_Z_BOT + (STAIR_Z_TOP - STAIR_Z_BOT) * t;
      const sy = yBot + (yTop - yBot) * t;
      const tGeo = new THREE.BoxGeometry(STAIR_W - 0.1, 0.07, STAIR_LEN / STEPS - 0.05);
      const tMesh = new THREE.Mesh(tGeo, railMat);
      tMesh.position.set(STAIR_X, sy + 0.1, sz);
      scene.add(tMesh);
    }

    // ── Handrails ─────────────────────────────────────────────────────────────
    [-STAIR_W / 2 + 0.12, STAIR_W / 2 - 0.12].forEach(dx => {
      const rGeo = new THREE.BoxGeometry(0.07, 0.07, STAIR_LEN + 0.5);
      const rail = new THREE.Mesh(rGeo, railMat);
      rail.position.set(STAIR_X + dx, yMid + 0.65, zMid);
      rail.rotation.x = angle;
      scene.add(rail);
      // Vertical posts every 2 units
      for (let p = 0; p <= 4; p++) {
        const pt = p / 4;
        const pz = STAIR_Z_BOT + (STAIR_Z_TOP - STAIR_Z_BOT) * pt;
        const py = yBot + (yTop - yBot) * pt;
        const postGeo = new THREE.BoxGeometry(0.06, 0.7, 0.06);
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(STAIR_X + dx, py + 0.35, pz);
        scene.add(post);
      }
    });

    // ── Stairwell enclosure walls ─────────────────────────────────────────────
    const wallMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.9, transparent: true, opacity: 0.55 });
    [-STAIR_W / 2 - 0.06, STAIR_W / 2 + 0.06].forEach(dx => {
      const wGeo = new THREE.BoxGeometry(0.12, FLOOR_STEP + 0.5, STAIR_LEN + 0.7);
      const wall = new THREE.Mesh(wGeo, wallMat);
      wall.position.set(STAIR_X + dx, yMid, zMid);
      scene.add(wall);
    });

    // ── Bottom landing ────────────────────────────────────────────────────────
    const botLand = new THREE.Mesh(new THREE.BoxGeometry(STAIR_W + 0.4, 0.15, 2.2), landMat);
    botLand.position.set(STAIR_X, yBot - 0.075, STAIR_Z_BOT + 1.1);
    botLand.receiveShadow = true;
    scene.add(botLand);
    walkableByFloor[floor].push(botLand);

    // ── Top landing ───────────────────────────────────────────────────────────
    const topLand = new THREE.Mesh(new THREE.BoxGeometry(STAIR_W + 0.4, 0.15, 2.2), landMat);
    topLand.position.set(STAIR_X, yTop - 0.075, STAIR_Z_TOP - 1.1);
    topLand.receiveShadow = true;
    scene.add(topLand);
    walkableByFloor[floor + 1].push(topLand);

    // ── Glowing floor-change sign ─────────────────────────────────────────────
    const signMat = new THREE.MeshStandardMaterial({
      color: '#1e40af', roughness: 0.5,
      emissive: '#3b82f6', emissiveIntensity: 0.6,
    });
    const signBox = new THREE.Mesh(new THREE.BoxGeometry(STAIR_W - 0.1, 0.55, 0.1), signMat);
    signBox.position.set(STAIR_X, yBot + 2.5, STAIR_Z_BOT + 0.12);
    scene.add(signBox);

    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 72;
    const sctx = sc.getContext('2d');
    sctx.fillStyle = '#1d4ed8';
    sctx.fillRect(0, 0, 256, 72);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 24px system-ui';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillText(`▲  Floor ${floor + 1}`, 128, 36);
    const stex = new THREE.CanvasTexture(sc);
    const signPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(STAIR_W - 0.15, 0.5),
      new THREE.MeshBasicMaterial({ map: stex, transparent: true })
    );
    signPlane.position.set(STAIR_X, yBot + 2.5, STAIR_Z_BOT + 0.18);
    scene.add(signPlane);

    // Down sign on upper landing
    if (floor > 0 || true) {
      const sc2 = document.createElement('canvas');
      sc2.width = 256; sc2.height = 72;
      const sctx2 = sc2.getContext('2d');
      sctx2.fillStyle = '#374151';
      sctx2.fillRect(0, 0, 256, 72);
      sctx2.fillStyle = '#d1d5db';
      sctx2.font = 'bold 24px system-ui';
      sctx2.textAlign = 'center'; sctx2.textBaseline = 'middle';
      sctx2.fillText(`▼  Floor ${floor}`, 128, 36);
      const stex2 = new THREE.CanvasTexture(sc2);
      const downSign = new THREE.Mesh(
        new THREE.PlaneGeometry(STAIR_W - 0.15, 0.5),
        new THREE.MeshBasicMaterial({ map: stex2, transparent: true })
      );
      downSign.position.set(STAIR_X, yTop + 2.5, STAIR_Z_TOP - 0.18);
      downSign.rotation.y = Math.PI;
      scene.add(downSign);
    }
  }
}

// ── Shop floor tile ───────────────────────────────────────────────────────────
function buildShopTile(scene, zone, yBase) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const shopColor = new THREE.Color(zone.color || getOccupancyColor(ratio));
  const darkColor = shopColor.clone().multiplyScalar(0.35);

  const geo = new THREE.PlaneGeometry(zone.w - 0.1, zone.d - 0.1);
  const mat = new THREE.MeshStandardMaterial({
    color: darkColor,
    emissive: shopColor,
    emissiveIntensity: 0.12,
    roughness: 0.8,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(zone.x, yBase + 0.016, zone.z);
  m.receiveShadow = true;
  scene.add(m);

  // Border glow
  m.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: shopColor, transparent: true, opacity: 0.6 })
  ));
}

// ── Shop sign (storefront) ────────────────────────────────────────────────────
function buildShopSign(scene, zone, yBase) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  const shopColor = zone.color || '#60a5fa';

  ctx.fillStyle = shopColor + 'cc';
  ctx.beginPath(); ctx.roundRect(4, 4, c.width-8, c.height-8, 12); ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${zone.emoji || '🏪'} ${zone.name}`, c.width/2, c.height/2);

  const tex = new THREE.CanvasTexture(c);
  const signW = Math.min(zone.w * 0.85, 4.5);
  const geo = new THREE.PlaneGeometry(signW, signW * (96/512));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(zone.x, yBase + FLOOR_H - 0.5, zone.z - zone.d/2 + 0.05);
  scene.add(m);
}

// ── Crowd people ──────────────────────────────────────────────────────────────
function buildCrowd(scene, zone, yBase, crowdAnimRef) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const count = Math.round(ratio * 35);
  if (count === 0) return;

  const col = new THREE.Color(zone.color || getOccupancyColor(ratio)).lerp(new THREE.Color('#ffffff'), 0.25);
  const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.08, roughness: 0.7 });
  const bodyGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.48, 6);
  const headGeo = new THREE.SphereGeometry(0.055, 7, 7);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, count);
  const heads  = new THREE.InstancedMesh(headGeo, mat.clone(), count);
  bodies.castShadow = true; heads.castShadow = true;

  const dummy = new THREE.Object3D();
  const pad = 0.55;
  for (let i = 0; i < count; i++) {
    const px = zone.x + (Math.random()-0.5) * (zone.w - pad*2);
    const pz = zone.z + (Math.random()-0.5) * (zone.d - pad*2);
    dummy.position.set(px, yBase+0.24, pz); dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, yBase+0.55, pz); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    crowdAnimRef.current.push({ bodies, heads, i, x:px, by:yBase+0.24, hy:yBase+0.55, z:pz, off:Math.random()*Math.PI*2 });
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate  = true;
  scene.add(bodies, heads);
}

// ── Info billboard ────────────────────────────────────────────────────────────
function buildInfoPanel(scene, zone, yBase, billboards) {
  const tex = makeShopTexture(zone);
  const geo = new THREE.PlaneGeometry(3.2, 1.88);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(zone.x, yBase + 2.1, zone.z);
  scene.add(m);
  billboards.push(m);
}

// ── Translucent zone volume ───────────────────────────────────────────────────
function buildZoneVolume(scene, zone, yBase) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const col = new THREE.Color(zone.color || getOccupancyColor(ratio));
  const geo = new THREE.BoxGeometry(zone.w, FLOOR_H, zone.d);
  const mat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 0.08,
    transparent: true, opacity: 0.18, side: THREE.FrontSide,
    roughness: 0.2, metalness: 0.05,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(zone.x, yBase + FLOOR_H/2, zone.z);
  scene.add(m);
}

// ── Camera helpers ────────────────────────────────────────────────────────────
function detectZone(cam, zones, nearZoneRef, setNearZone) {
  const { x, y, z } = cam.position;
  const floor = Math.max(0, Math.min(2, Math.round((y - EYE_H) / FLOOR_STEP)));
  const found = zones.find(zone =>
    zone.floor === floor &&
    Math.abs(x - zone.x) < zone.w / 2 - 0.1 &&
    Math.abs(z - zone.z) < zone.d / 2 - 0.1
  );
  if (found?.id !== nearZoneRef.current?.id) {
    nearZoneRef.current = found ?? null;
    setNearZone(found ?? null);
  }
}

// ── HUD Components ────────────────────────────────────────────────────────────
function FloorIndicator({ y }) {
  const floor = Math.max(0, Math.min(2, Math.round((y - EYE_H) / FLOOR_STEP)));
  const labels = ['G', '1', '2'];
  const names  = ['Ground', 'First', 'Second'];
  return (
    <div className="bv-floor-indicator">
      {[2, 1, 0].map(f => (
        <div key={f} className={`bv-floor-pip ${floor === f ? 'bv-floor-pip-active' : ''}`}>
          <span className="bv-floor-pip-num">{labels[f]}</span>
          {floor === f && <span className="bv-floor-pip-name">{names[f]} Floor</span>}
        </div>
      ))}
    </div>
  );
}
function ZoneHUD({ zone }) {
  const ratio = Math.min(zone.currentCapacity / zone.maxCapacity, 1);
  const pct   = Math.round(ratio * 100);
  const color = getOccupancyColor(ratio);
  const label = getOccupancyLabel(ratio);
  const floorName = ['Ground Floor','First Floor','Second Floor'][zone.floor] || `Floor ${zone.floor}`;

  return (
    <div className="zone-hud">
      <div className="zhud-left">
        <span className="zhud-emoji">{zone.emoji || '🏪'}</span>
        <div>
          <span className="zhud-name">{zone.name}</span>
          <span className="zhud-floor">{floorName} · {zone.category}</span>
        </div>
      </div>
      <div className="zhud-mid">
        <div className="zhud-bar">
          <div className="zhud-bar-fill" style={{ width:`${pct}%`, background:color }} />
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
            <rect x="4" y="6" width="40" height="38" rx="2" stroke="#60a5fa" strokeWidth="2" fill="none"/>
            <rect x="8"  y="10" width="8" height="7" rx="1" fill="#60a5fa" opacity="0.8"/>
            <rect x="20" y="10" width="8" height="7" rx="1" fill="#60a5fa" opacity="0.6"/>
            <rect x="32" y="10" width="8" height="7" rx="1" fill="#60a5fa" opacity="0.8"/>
            <rect x="8"  y="22" width="8" height="7" rx="1" fill="#60a5fa" opacity="0.5"/>
            <rect x="20" y="22" width="8" height="7" rx="1" fill="#60a5fa" opacity="0.5"/>
            <rect x="32" y="22" width="8" height="7" rx="1" fill="#60a5fa" opacity="0.5"/>
            <rect x="18" y="32" width="12" height="12" rx="1" fill="#60a5fa" opacity="0.9"/>
          </svg>
        </div>
        <h2 className="bv-enter-title">Nexus Mall</h2>
        <p className="bv-enter-sub">You're standing outside — walk in through the front gate</p>
        <button className="bv-enter-btn">Click to Start Walking</button>
        <div className="bv-enter-keys">
          <div className="key-row"><kbd>W</kbd><span>Walk forward toward the gate</span></div>
          <div className="key-row"><kbd>A S D</kbd><span>Strafe / turn</span></div>
          <div className="key-row"><kbd>Scroll</kbd><span>Move forward / back</span></div>
          <div className="key-row"><kbd>↑ Stairs</kbd><span>Left wall inside — blue sign</span></div>
          <div className="key-row"><kbd>ESC</kbd><span>Unlock cursor</span></div>
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
  const mountRef     = useRef(null);
  const cameraRef    = useRef(null);
  const controlsRef  = useRef(null);
  const billboardsRef= useRef([]);
  const keysRef      = useRef({ w:false, a:false, s:false, d:false });
  const nearZoneRef  = useRef(null);
  const animRef      = useRef(null);
  const clockRef     = useRef(new THREE.Clock());
  const crowdAnimRef = useRef([]);
  const isLockedRef  = useRef(false);
  const walkableRef  = useRef([]);
  // Smooth movement state
  const velRef       = useRef(new THREE.Vector2(0, 0)); // XZ velocity (world space)
  const bobTimeRef   = useRef(0);   // accumulated bob phase
  const camYRef      = useRef(EYE_H);
  const camYUpdateRef= useRef(0);   // throttle React state updates

  const [isLocked, setIsLocked]   = useState(false);
  const [nearZone, setNearZone]   = useState(null);
  const [camY, setCamY]           = useState(EYE_H);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b8d4f0');
    scene.fog = new THREE.FogExp2('#b8d4f0', 0.016);

    // Camera — start on the road, eye-level, facing the mall entrance
    const camera = new THREE.PerspectiveCamera(FOV, W/H, 0.05, 200);
    camera.position.set(START_X, EYE_H, START_Z);
    camera.lookAt(START_X, EYE_H, 0);   // look straight at the front gate
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.addEventListener('lock',   () => { setIsLocked(true);  isLockedRef.current = true;  });
    controls.addEventListener('unlock', () => { setIsLocked(false); isLockedRef.current = false; });
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight('#e8f0ff', 0.7));

    const sun = new THREE.DirectionalLight('#fff8e8', 2.0);
    sun.position.set(25, 40, -15);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 120;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top  =  30; sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // Hemisphere sky light
    scene.add(new THREE.HemisphereLight('#87ceeb', '#4a7c3f', 0.5));

    // Per-zone point lights
    zones.forEach(zone => {
      const yBase = zone.floor * FLOOR_STEP;
      const lc = new THREE.Color(zone.color || '#ffffff').lerp(new THREE.Color('#ffffff'), 0.4);
      const light = new THREE.PointLight(lc, 1.2, Math.max(zone.w, zone.d) * 1.8);
      light.position.set(zone.x, yBase + FLOOR_H - 0.3, zone.z);
      scene.add(light);
    });

    // Build world
    // walkableByFloor[f] = surfaces the player can stand on while on floor f
    const walkableByFloor = { 0: [], 1: [], 2: [] };
    buildPlaza(scene, walkableByFloor[0]);   // ground/road → floor 0

    const yTop = 3 * FLOOR_STEP;
    [0, 1, 2].forEach((floor, idx) => {
      const yBase = floor * FLOOR_STEP;
      buildFloorSlab(scene, yBase, floor, walkableByFloor);
      buildGlassFacade(scene, yBase, idx);
      const lbl = makeFloorLabel(['Ground Floor','First Floor','Second Floor'][floor]);
      lbl.position.set(-16, yBase + FLOOR_H/2, 0);
      scene.add(lbl);
    });

    buildRoof(scene, yTop);
    buildStairs(scene, walkableByFloor);
    walkableRef.current = walkableByFloor;

    // Zone geometry
    const billboards = [];
    crowdAnimRef.current = [];
    zones.forEach(zone => {
      const yBase = zone.floor * FLOOR_STEP;
      buildShopTile(scene, zone, yBase);
      buildZoneVolume(scene, zone, yBase);
      buildCrowd(scene, zone, yBase, crowdAnimRef);
      buildInfoPanel(scene, zone, yBase, billboards);
      buildShopSign(scene, zone, yBase);
    });
    billboardsRef.current = billboards;

    // Keyboard
    const keys = keysRef.current;
    const onKeyDown = e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code==='KeyW'||e.code==='ArrowUp')    keys.w=true;
      if (e.code==='KeyS'||e.code==='ArrowDown')  keys.s=true;
      if (e.code==='KeyA'||e.code==='ArrowLeft')  keys.a=true;
      if (e.code==='KeyD'||e.code==='ArrowRight') keys.d=true;
    };
    const onKeyUp = e => {
      if (e.code==='KeyW'||e.code==='ArrowUp')    keys.w=false;
      if (e.code==='KeyS'||e.code==='ArrowDown')  keys.s=false;
      if (e.code==='KeyA'||e.code==='ArrowLeft')  keys.a=false;
      if (e.code==='KeyD'||e.code==='ArrowRight') keys.d=false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    const onWheel = e => {
      e.preventDefault();
      if (!isLockedRef.current) return;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir); dir.y = 0;
      if (dir.length() > 0.001) dir.normalize();
      camera.position.addScaledVector(dir, -e.deltaY * 0.015);
      camera.position.x = Math.max(-55, Math.min(55, camera.position.x));
      camera.position.z = Math.max(-55, Math.min(55, camera.position.z));
    };
    mount.addEventListener('wheel', onWheel, { passive: false });

    const raycaster = new THREE.Raycaster();
    const rayDown   = new THREE.Vector3(0, -1, 0);

    // Animate
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      const time = clockRef.current.getElapsedTime();
      const dt   = Math.min(clockRef.current.getDelta(), 0.05); // real delta, capped at 50ms

      if (isLockedRef.current) {
        const k   = keysRef.current;
        const vel = velRef.current;

        // ── Desired input direction (camera-relative, XZ only) ────────────────
        const fwd   = new THREE.Vector3();
        camera.getWorldDirection(fwd); fwd.y = 0;
        if (fwd.length() > 0.001) fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

        const inputX = (k.d ? 1 : 0) - (k.a ? 1 : 0);
        const inputZ = (k.w ? 1 : 0) - (k.s ? 1 : 0);

        // Desired velocity in world XZ
        const desiredVX = fwd.x * inputZ * WALK_SPEED + right.x * inputX * WALK_SPEED;
        const desiredVZ = fwd.z * inputZ * WALK_SPEED + right.z * inputX * WALK_SPEED;

        // Accelerate toward desired, decelerate when no input
        const isMoving = inputX !== 0 || inputZ !== 0;
        const rate = isMoving ? ACCEL : FRICTION;
        vel.x += (desiredVX - vel.x) * Math.min(rate * dt, 1.0);
        vel.y += (desiredVZ - vel.y) * Math.min(rate * dt, 1.0);

        // Speed cap
        const spd = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (spd > WALK_SPEED) { vel.x *= WALK_SPEED / spd; vel.y *= WALK_SPEED / spd; }

        // ── Proposed XZ position ──────────────────────────────────────────────
        const proposed = camera.position.clone();
        proposed.x += vel.x * dt;
        proposed.z += vel.y * dt;
        proposed.x = Math.max(-55, Math.min(55, proposed.x));
        proposed.z = Math.max(-55, Math.min(55, proposed.z));

        // ── Current floor ─────────────────────────────────────────────────────
        const curFloor = Math.max(0, Math.min(2,
          Math.round((camera.position.y - EYE_H) / FLOOR_STEP)
        ));

        // ── Stair logic ───────────────────────────────────────────────────────
        const onStair = onStairXZ(proposed.x, proposed.z);

        if (onStair) {
          let stairFloor = curFloor;
          if (proposed.z > STAIR_Z_BOT && curFloor > 0) stairFloor = curFloor - 1;
          stairFloor = Math.max(0, Math.min(1, stairFloor));

          const targetY = rampYatZ(proposed.z, stairFloor) + EYE_H;
          camera.position.x = proposed.x;
          camera.position.z = proposed.z;
          // Smooth vertical follow on ramp — faster than floor gravity
          camera.position.y += (targetY - camera.position.y) * Math.min(12 * dt, 1.0);

        } else {
          // ── Floor-locked XZ ───────────────────────────────────────────────
          const insideMall = (
            Math.abs(proposed.x) < MALL_W / 2 - 0.15 &&
            proposed.z > -MALL_D / 2 + 0.15 &&
            proposed.z < MALL_D / 2 - 0.15
          );
          if (insideMall || curFloor === 0) {
            camera.position.x = proposed.x;
            camera.position.z = proposed.z;
          } else {
            // Slide along wall: try X only, then Z only
            const tryX = camera.position.clone(); tryX.x = proposed.x;
            const tryZ = camera.position.clone(); tryZ.z = proposed.z;
            const xOk = Math.abs(tryX.x) < MALL_W / 2 - 0.15 &&
                        tryX.z > -MALL_D / 2 + 0.15 && tryX.z < MALL_D / 2 - 0.15;
            const zOk = Math.abs(tryZ.x) < MALL_W / 2 - 0.15 &&
                        tryZ.z > -MALL_D / 2 + 0.15 && tryZ.z < MALL_D / 2 - 0.15;
            if (xOk) camera.position.x = proposed.x;
            if (zOk) camera.position.z = proposed.z;
            // Kill velocity component that hit the wall
            if (!xOk) vel.x = 0;
            if (!zOk) vel.y = 0;
          }

          // ── Gravity: smooth snap to floor surface ─────────────────────────
          const surfaces = walkableRef.current[curFloor] || [];
          const origin = camera.position.clone(); origin.y += 2.5;
          raycaster.set(origin, rayDown);
          const hits = raycaster.intersectObjects(surfaces, false);
          if (hits.length > 0) {
            const targetY = hits[0].point.y + EYE_H;
            if (targetY <= camera.position.y + 0.3) {
              // Exponential snap — feels like real gravity, not teleport
              camera.position.y += (targetY - camera.position.y) * Math.min(18 * dt, 1.0);
            }
          }
        }

        // ── Head-bob ──────────────────────────────────────────────────────────
        const moving = spd > 0.3;
        if (moving) bobTimeRef.current += dt * BOB_FREQ;
        // Smoothly fade bob in/out
        const bobTarget = moving ? Math.sin(bobTimeRef.current * Math.PI * 2) * BOB_AMP : 0;
        const baseY = camera.position.y;
        camera.position.y = baseY + bobTarget * Math.min(spd / WALK_SPEED, 1.0);

        // ── Throttled React state update (every ~100ms) ───────────────────────
        camYRef.current = camera.position.y;
        camYUpdateRef.current += dt;
        if (camYUpdateRef.current > 0.1) {
          camYUpdateRef.current = 0;
          setCamY(camYRef.current);
        }

        billboardsRef.current.forEach(b => b.lookAt(camera.position));
        detectZone(camera, zones, nearZoneRef, setNearZone);

      } else {
        // Idle — stay on the road, gentle head-bob so it feels alive
        camera.position.set(START_X, EYE_H + Math.sin(time * 0.6) * 0.04, START_Z);
        camera.lookAt(START_X, EYE_H, 0);
        velRef.current.set(0, 0);
      }

      // Animate crowd
      const updatedMeshes = new Set();
      const dummy = new THREE.Object3D();
      crowdAnimRef.current.forEach(p => {
        const yOff = Math.abs(Math.sin(time * 3.2 + p.off)) * 0.045;
        dummy.position.set(p.x, p.by + yOff, p.z); dummy.updateMatrix();
        p.bodies.setMatrixAt(p.i, dummy.matrix); updatedMeshes.add(p.bodies);
        dummy.position.set(p.x, p.hy + yOff, p.z); dummy.updateMatrix();
        p.heads.setMatrixAt(p.i, dummy.matrix);  updatedMeshes.add(p.heads);
      });
      updatedMeshes.forEach(m => m.instanceMatrix.needsUpdate = true);

      renderer.render(scene, camera);
    }
    clockRef.current.start();
    animate();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w/h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      mount.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(animRef.current);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      scene.clear();
      billboardsRef.current = [];
      crowdAnimRef.current  = [];
      walkableRef.current   = [];
      nearZoneRef.current   = null;
    };
  }, [zones]);

  const handleClick = () => controlsRef.current?.lock();

  return (
    <div className="bv-wrap">
      <div ref={mountRef} className="bv-canvas" onClick={handleClick} />
      {!isLocked && <EnterOverlay onEnter={handleClick} />}
      {isLocked  && <Crosshair />}
      {isLocked  && <FloorIndicator y={camY} />}
      {isLocked  && nearZone && <ZoneHUD zone={nearZone} />}
      <div className="bv-hint">
        W to walk forward into the mall &nbsp;·&nbsp; find the <strong>blue stair sign</strong> on the left wall to go up &nbsp;·&nbsp; ESC to unlock
      </div>
    </div>
  );
}
