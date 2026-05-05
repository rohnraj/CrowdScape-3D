import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { getOccupancyColor, getOccupancyLabel } from '../data/zones.js';
import PEOPLE_DATA from '../data/people.json';
import PEOPLE_HISTORY from '../data/peopleHistory.json';

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
// Stairs are in a dedicated corridor on the RIGHT side of the mall.
// This keeps them clear of all shop zones and reachable from every floor.
// MALL bounds: X ∈ [-12, 12], Z ∈ [-8, 8]
// Stair corridor: X ∈ [9, 12], Z ∈ [-7, 6]  — right wall, full depth
const STAIR_X     =  10.5;  // centre X of stairwell (right side, clear of shops)
const STAIR_W     =   2.4;  // width along X
const STAIR_Z_BOT =   5.0;  // z at the bottom (floor N) — positive Z = front
const STAIR_Z_TOP =  -6.0;  // z at the top    (floor N+1) — negative Z = back
const STAIR_LEN   = Math.abs(STAIR_Z_BOT - STAIR_Z_TOP); // 11 units

// Returns the ramp surface Y for a given Z, for the stair connecting
// floor `seg` to floor `seg+1`.
function rampYatZ(z, seg) {
  const yBot = seg * FLOOR_STEP;
  const yTop = (seg + 1) * FLOOR_STEP;
  const t = Math.max(0, Math.min(1, (STAIR_Z_BOT - z) / STAIR_LEN));
  return yBot + (yTop - yBot) * t;
}

// Is the player's XZ inside the stairwell footprint?
function onStairXZ(x, z) {
  return (
    Math.abs(x - STAIR_X) < STAIR_W / 2 + 0.15 &&
    z >= STAIR_Z_TOP - 0.4 &&
    z <= STAIR_Z_BOT + 0.4
  );
}

// Which stair segment (0→1 or 1→2) is closest to the player's current Y?
function resolveStairSeg(camY, z) {
  const y0 = rampYatZ(z, 0) + EYE_H;
  const y1 = rampYatZ(z, 1) + EYE_H;
  return Math.abs(camY - y0) <= Math.abs(camY - y1) ? 0 : 1;
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
  // Base ground — single large plane, walkable
  const plazaGeo = new THREE.PlaneGeometry(80, 80);
  const plazaMat = new THREE.MeshLambertMaterial({ color: '#b8c890' });
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);
  walkable.push(plaza);

  // Road — single flat box
  const roadMat = new THREE.MeshLambertMaterial({ color: '#3a3d42' });
  const road = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 60), roadMat);
  road.position.set(0, 0, MALL_D / 2 + 30);
  road.receiveShadow = true;
  scene.add(road);
  walkable.push(road);
}

// ── Floor slab ────────────────────────────────────────────────────────────────
function buildFloorSlab(scene, yBase, floorIndex, walkableByFloor) {
  const geo = new THREE.BoxGeometry(MALL_W + 0.2, 0.15, MALL_D + 0.2);
  const mat = new THREE.MeshLambertMaterial({ color: '#dde4ea' });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, yBase - 0.075, 0);
  scene.add(m);
  walkableByFloor[floorIndex].push(m);
}

// ── Glass facade walls (mall style — lightweight) ────────────────────────────
function buildGlassFacade(scene, yBase, floorIndex) {
  const glassMat = new THREE.MeshLambertMaterial({
    color: '#7dd3fc', transparent: true, opacity: 0.22, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#a0d8f0', transparent: true, opacity: 0.3 });
  const cy = yBase + FLOOR_H / 2;

  const addWall = (x, y, z, w, h, ry) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, glassMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
  };

  if (floorIndex === 0) {
    const gapW = 6, sideW = (MALL_W - gapW) / 2;
    addWall(-gapW / 2 - sideW / 2, cy, MALL_D / 2, sideW, FLOOR_H, Math.PI);
    addWall( gapW / 2 + sideW / 2, cy, MALL_D / 2, sideW, FLOOR_H, Math.PI);
  } else {
    addWall(0, cy, MALL_D / 2, MALL_W, FLOOR_H, Math.PI);
  }
  addWall(0,         cy, -MALL_D / 2, MALL_W, FLOOR_H, 0);
  addWall( MALL_W/2, cy, 0,           MALL_D, FLOOR_H, -Math.PI / 2);
  addWall(-MALL_W/2, cy, 0,           MALL_D, FLOOR_H,  Math.PI / 2);
}

// ── Roof ──────────────────────────────────────────────────────────────────────
function buildRoof(scene, yTop) {
  const roofMat = new THREE.MeshLambertMaterial({ color: '#e0e5ea' });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(MALL_W + 0.4, 0.3, MALL_D + 0.4), roofMat);
  roof.position.set(0, yTop, 0);
  roof.receiveShadow = true;
  scene.add(roof);
}

// ── Stairs ────────────────────────────────────────────────────────────────────
function buildStairs(scene, walkableByFloor) {
  const rampMat = new THREE.MeshLambertMaterial({ color: '#334155' });
  const railMat = new THREE.MeshLambertMaterial({ color: '#94a3b8' });
  const landMat = new THREE.MeshLambertMaterial({ color: '#475569' });

  for (let floor = 0; floor < 2; floor++) {
    const yBot = floor * FLOOR_STEP;
    const yTop = (floor + 1) * FLOOR_STEP;
    const zMid = (STAIR_Z_BOT + STAIR_Z_TOP) / 2;
    const yMid = (yBot + yTop) / 2;
    const angle = Math.atan2(yTop - yBot, STAIR_Z_BOT - STAIR_Z_TOP);

    // Ramp
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(STAIR_W, 0.18, STAIR_LEN + 0.4), rampMat);
    ramp.position.set(STAIR_X, yMid, zMid);
    ramp.rotation.x = angle;
    scene.add(ramp);
    walkableByFloor[floor].push(ramp);
    walkableByFloor[floor + 1].push(ramp);

    // Handrails (just 2 bars, no posts)
    [-STAIR_W / 2 + 0.1, STAIR_W / 2 - 0.1].forEach(dx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, STAIR_LEN + 0.4), railMat);
      rail.position.set(STAIR_X + dx, yMid + 0.6, zMid);
      rail.rotation.x = angle;
      scene.add(rail);
    });

    // Side walls
    [-STAIR_W / 2 - 0.06, STAIR_W / 2 + 0.06].forEach(dx => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, FLOOR_STEP + 0.3, STAIR_LEN + 0.5),
        new THREE.MeshLambertMaterial({ color: '#1e293b', transparent: true, opacity: 0.4 })
      );
      wall.position.set(STAIR_X + dx, yMid, zMid);
      scene.add(wall);
    });

    // Landings
    const botLand = new THREE.Mesh(new THREE.BoxGeometry(STAIR_W + 0.3, 0.15, 2.0), landMat);
    botLand.position.set(STAIR_X, yBot - 0.075, STAIR_Z_BOT + 1.0);
    scene.add(botLand);
    walkableByFloor[floor].push(botLand);

    const topLand = new THREE.Mesh(new THREE.BoxGeometry(STAIR_W + 0.3, 0.15, 2.0), landMat);
    topLand.position.set(STAIR_X, yTop - 0.075, STAIR_Z_TOP - 1.0);
    scene.add(topLand);
    walkableByFloor[floor + 1].push(topLand);

    // Sign
    const makeSignCanvas = (text, bg, fg) => {
      const sc = document.createElement('canvas');
      sc.width = 256; sc.height = 64;
      const ctx = sc.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = fg; ctx.font = 'bold 24px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);
      return new THREE.CanvasTexture(sc);
    };
    const upSign = new THREE.Mesh(
      new THREE.PlaneGeometry(STAIR_W - 0.2, 0.4),
      new THREE.MeshBasicMaterial({ map: makeSignCanvas(`▲ Floor ${floor + 1}`, '#1d4ed8', '#fff'), transparent: true })
    );
    upSign.position.set(STAIR_X, yBot + 2.3, STAIR_Z_BOT + 0.2);
    scene.add(upSign);
  }
}

// ── Shop floor tile ───────────────────────────────────────────────────────────
function buildShopTile(scene, zone, yBase) {
  const shopColor = new THREE.Color(zone.color || '#94a3b8');
  const geo = new THREE.PlaneGeometry(zone.w - 0.1, zone.d - 0.1);
  const mat = new THREE.MeshLambertMaterial({ color: shopColor.clone().multiplyScalar(0.5) });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(zone.x, yBase + 0.016, zone.z);
  scene.add(m);
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

// ── Animated mall people (agent walkers) ─────────────────────────────────────
// Full humanoid: head, torso, 2 arms, 2 legs — all animated with a walk cycle.

// Proportions (all in world units, ~1/10 real scale)
const AG_TOTAL_H  = 0.95;   // total height head-to-toe
const AG_LEG_H    = 0.38;   // each leg length
const AG_LEG_R    = 0.038;  // leg radius
const AG_TORSO_H  = 0.30;   // torso height
const AG_TORSO_RX = 0.065;  // torso half-width X
const AG_TORSO_RZ = 0.050;  // torso half-depth Z
const AG_ARM_H    = 0.26;   // arm length
const AG_ARM_R    = 0.028;  // arm radius
const AG_HEAD_R   = 0.075;  // head radius
const AG_ARRIVE   = 0.18;   // waypoint arrival radius

// Y offsets from group origin (feet = y 0)
const AG_Y_FEET   = 0;
const AG_Y_HIP    = AG_LEG_H;
const AG_Y_TORSO  = AG_Y_HIP  + AG_TORSO_H / 2;
const AG_Y_SHLDR  = AG_Y_HIP  + AG_TORSO_H;
const AG_Y_HEAD   = AG_Y_SHLDR + AG_HEAD_R + 0.02;

function createAgentMesh(color) {
  const col      = new THREE.Color(color);
  const skinCol  = col.clone().lerp(new THREE.Color('#ffe0c8'), 0.45);
  const shirtCol = col.clone();
  const pantCol  = col.clone().multiplyScalar(0.55).lerp(new THREE.Color('#1e293b'), 0.5);

  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
  const mat  = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });

  const group = new THREE.Group();

  // ── Torso ──────────────────────────────────────────────────────────────────
  const torso = mk(new THREE.BoxGeometry(AG_TORSO_RX * 2, AG_TORSO_H, AG_TORSO_RZ * 2), mat(shirtCol));
  torso.position.y = AG_Y_TORSO;
  group.add(torso);

  // ── Head ───────────────────────────────────────────────────────────────────
  const head = mk(new THREE.SphereGeometry(AG_HEAD_R, 8, 8), mat(skinCol));
  head.position.y = AG_Y_HEAD;
  group.add(head);

  // ── Arms (pivot at shoulder, hang down) ────────────────────────────────────
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (AG_TORSO_RX + AG_ARM_R + 0.01), AG_Y_SHLDR, 0);
    const arm = mk(new THREE.CylinderGeometry(AG_ARM_R, AG_ARM_R * 0.85, AG_ARM_H, 6), mat(shirtCol));
    arm.position.y = -AG_ARM_H / 2;
    pivot.add(arm);
    group.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm( 1);

  // ── Legs (pivot at hip, hang down) ─────────────────────────────────────────
  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (AG_LEG_R + 0.015), AG_Y_HIP, 0);
    const leg = mk(new THREE.CylinderGeometry(AG_LEG_R, AG_LEG_R * 0.8, AG_LEG_H, 6), mat(pantCol));
    leg.position.y = -AG_LEG_H / 2;
    pivot.add(leg);
    // Foot
    const foot = mk(new THREE.BoxGeometry(AG_LEG_R * 2.2, AG_LEG_R * 1.2, AG_LEG_R * 3.5), mat(pantCol.clone().multiplyScalar(0.6)));
    foot.position.set(0, -AG_LEG_H + AG_LEG_R * 0.5, AG_LEG_R * 1.2);
    pivot.add(foot);
    group.add(pivot);
    return pivot;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg( 1);

  // Store limb refs on the group for animation
  group.userData = { head, torso, armL, armR, legL, legR };
  return group;
}

function initAgents(scene) {
  return PEOPLE_DATA.people.map(def => {
    const mesh = createAgentMesh(def.color);
    const wp0  = def.route[0];
    // Group origin = feet level
    mesh.position.set(wp0.x, wp0.floor * FLOOR_STEP, wp0.z);
    scene.add(mesh);
    return {
      id:       def.id,
      name:     def.name,
      age:      def.age,
      from:     def.from,
      to:       def.to,
      color:    def.color,
      speed:    def.speed,
      route:    def.route,
      wpIdx:    0,
      mesh,
      walkPhase: Math.random() * Math.PI * 2,  // offset so not all in sync
    };
  });
}

// Walk cycle amplitudes
const STRIDE_AMP = 0.55;   // leg swing (radians)
const ARM_AMP    = 0.40;   // arm swing (opposite to legs)

function updateAgents(agents, dt) {
  for (const ag of agents) {
    const wp   = ag.route[ag.wpIdx];
    const cx   = ag.mesh.position.x;
    const cz   = ag.mesh.position.z;
    const dx   = wp.x - cx;
    const dz   = wp.z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < AG_ARRIVE) {
      ag.wpIdx = (ag.wpIdx + 1) % ag.route.length;
      continue;
    }

    // ── XZ movement ──────────────────────────────────────────────────────────
    const step = ag.speed * dt;
    const nx = cx + (dx / dist) * Math.min(step, dist);
    const nz = cz + (dz / dist) * Math.min(step, dist);

    // ── Floor Y — feet must sit exactly on the surface ────────────────────────
    // On stairs: use analytic ramp formula.
    // Off stairs: snap to flat floor of the target waypoint.
    let floorY;
    if (onStairXZ(nx, nz)) {
      // Determine which stair segment (0→1 or 1→2) by current height
      const seg = Math.max(0, Math.min(1,
        Math.round(ag.mesh.position.y / FLOOR_STEP)
      ));
      floorY = rampYatZ(nz, seg);
    } else {
      floorY = wp.floor * FLOOR_STEP;
    }

    // Snap Y directly — no lerp lag, feet stay on ground
    ag.mesh.position.set(nx, floorY, nz);

    // ── Face direction of travel (Y rotation only — no tilt) ─────────────────
    ag.mesh.rotation.set(0, Math.atan2(dx, dz), 0);

    // ── Walk cycle ────────────────────────────────────────────────────────────
    ag.walkPhase += ag.speed * dt * 7.0;
    const phase = ag.walkPhase;
    const { head, armL, armR, legL, legR, torso } = ag.mesh.userData;

    // Legs: swing forward/back (rotation.x in pivot local space)
    // Pivot is at hip, leg hangs down — positive X rotation = leg swings forward
    legL.rotation.x =  Math.sin(phase) * STRIDE_AMP;
    legR.rotation.x = -Math.sin(phase) * STRIDE_AMP;

    // Arms: opposite swing to legs (natural gait)
    armL.rotation.x = -Math.sin(phase) * ARM_AMP;
    armR.rotation.x =  Math.sin(phase) * ARM_AMP;

    // Body bob: move torso/head up-down, NOT the group (keeps feet on ground)
    const bob = Math.abs(Math.sin(phase)) * 0.014;
    torso.position.y = AG_Y_TORSO + bob;
    head.position.y  = AG_Y_HEAD  + bob;
    // Arms and legs pivot positions stay fixed — only torso/head bob
  }
}

// Detect which agent the player is looking at (dot-product cone test)
function detectLookedAtAgent(camera, agents, maxDist) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let closest = null;
  let closestDist = maxDist;
  for (const ag of agents) {
    // Test against agent centre (mid-torso height)
    const agPos = ag.mesh.position.clone();
    agPos.y += AG_Y_TORSO;
    const toAg = agPos.sub(camera.position);
    const along = toAg.dot(dir);
    if (along < 0.3 || along > maxDist) continue;
    const perp = toAg.clone().sub(dir.clone().multiplyScalar(along)).length();
    if (perp < 0.35 && along < closestDist) {
      closestDist = along;
      closest = ag;
    }
  }
  return closest;
}

// Legacy static crowd (kept for zones that have no agent coverage)
function buildStaticCrowd(scene, zone, yBase, crowdAnimRef) {
  const ratio = zone.currentCapacity / zone.maxCapacity;
  const count = Math.max(0, Math.round(ratio * 12)); // fewer — agents fill the rest
  if (count === 0) return;

  const col = new THREE.Color(zone.color || getOccupancyColor(ratio)).lerp(new THREE.Color('#ffffff'), 0.3);
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 });
  const bodyGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.48, 6);
  const headGeo = new THREE.SphereGeometry(0.055, 7, 7);
  const bodies  = new THREE.InstancedMesh(bodyGeo, mat, count);
  const heads   = new THREE.InstancedMesh(headGeo, mat.clone(), count);
  bodies.castShadow = true; heads.castShadow = true;

  const dummy = new THREE.Object3D();
  const pad = 0.55;
  for (let i = 0; i < count; i++) {
    const px = zone.x + (Math.random() - 0.5) * (zone.w - pad * 2);
    const pz = zone.z + (Math.random() - 0.5) * (zone.d - pad * 2);
    dummy.position.set(px, yBase + 0.24, pz); dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, yBase + 0.55, pz); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    crowdAnimRef.current.push({ bodies, heads, i, x: px, by: yBase + 0.24, hy: yBase + 0.55, z: pz, off: Math.random() * Math.PI * 2 });
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

// ── Person info HUD (shown when player looks at a walking agent) ──────────────
function PersonHUD({ agent, zones }) {
  const history = PEOPLE_HISTORY.history[agent.id] || [];

  // Build a lookup: shop name → { x, z, floor, color }
  const shopMap = {};
  zones.forEach(z => { shopMap[z.name] = z; });

  // Resolve visited shops to coordinates for the mini-map
  const visits = history.map(v => {
    const shop = shopMap[v.shop];
    return shop ? { ...v, x: shop.x, z: shop.z, floor: shop.floor, color: shop.color } : null;
  }).filter(Boolean);

  // SVG mini-map dimensions
  const MAP_W = 200, MAP_H = 130;
  // Mall bounds: X[-12,12], Z[-8,8]
  const toSvgX = (x) => ((x + 12) / 24) * MAP_W;
  const toSvgY = (z) => ((z + 8) / 16) * MAP_H;

  // Floor colors
  const floorColors = ['#60a5fa', '#c084fc', '#fbbf24'];
  const floorLabels = ['G', 'F1', 'F2'];

  return (
    <div className="person-hud">
      <div className="phud-left">
        <div className="phud-avatar" style={{ background: agent.color + '33', borderColor: agent.color }}>
          <span style={{ fontSize: 20 }}>🧑</span>
        </div>
        <div className="phud-body">
          <div className="phud-label">Visited Shops</div>
          <div className="phud-history">
            {history.map((visit, i) => (
              <div key={i} className="phud-visit">
                <span className="phud-visit-dot" style={{ background: shopMap[visit.shop]?.color || '#94a3b8' }} />
                <span className="phud-visit-shop">{visit.shop}</span>
                <span className="phud-visit-meta">{visit.time}</span>
              </div>
            ))}
            {history.length === 0 && <div className="phud-visit-empty">No visits yet</div>}
          </div>
        </div>
      </div>
      {visits.length > 1 && (
        <div className="phud-map">
          <div className="phud-map-title">Walking Path</div>
          <svg width={MAP_W} height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="phud-svg">
            {/* Mall outline */}
            <rect x="0" y="0" width={MAP_W} height={MAP_H} rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
            {/* Path lines connecting visits */}
            {visits.map((v, i) => {
              if (i === 0) return null;
              const prev = visits[i - 1];
              const sameFloor = v.floor === prev.floor;
              return (
                <line
                  key={`l${i}`}
                  x1={toSvgX(prev.x)} y1={toSvgY(prev.z)}
                  x2={toSvgX(v.x)} y2={toSvgY(v.z)}
                  stroke={sameFloor ? floorColors[v.floor] : '#475569'}
                  strokeWidth={sameFloor ? 1.5 : 1}
                  strokeDasharray={sameFloor ? 'none' : '3,2'}
                  opacity="0.7"
                />
              );
            })}
            {/* Visit dots */}
            {visits.map((v, i) => (
              <g key={`d${i}`}>
                <circle
                  cx={toSvgX(v.x)} cy={toSvgY(v.z)}
                  r={i === visits.length - 1 ? 5 : 3.5}
                  fill={v.color || floorColors[v.floor]}
                  stroke="#0d1424" strokeWidth="1"
                  opacity={i === visits.length - 1 ? 1 : 0.8}
                />
                {/* Floor label on first and last */}
                {(i === 0 || i === visits.length - 1) && (
                  <text
                    x={toSvgX(v.x)} y={toSvgY(v.z) - 7}
                    textAnchor="middle" fill="rgba(255,255,255,0.7)"
                    fontSize="8" fontWeight="bold"
                  >
                    {floorLabels[v.floor]}
                  </text>
                )}
              </g>
            ))}
            {/* Floor legend */}
            {[0, 1, 2].map(f => {
              const hasVisit = visits.some(v => v.floor === f);
              if (!hasVisit) return null;
              return (
                <g key={`fl${f}`}>
                  <circle cx={10 + f * 28} cy={MAP_H - 10} r={4} fill={floorColors[f]} opacity="0.8"/>
                  <text x={17 + f * 28} y={MAP_H - 7} fill="rgba(255,255,255,0.5)" fontSize="7">
                    {floorLabels[f]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
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
  const agentsRef    = useRef([]);
  const isLockedRef  = useRef(false);
  const walkableRef  = useRef([]);
  const velRef       = useRef(new THREE.Vector2(0, 0));
  const bobTimeRef   = useRef(0);
  const camYRef      = useRef(EYE_H);
  const camYUpdateRef= useRef(0);
  const stairSegRef  = useRef(-1);
  const [isLocked, setIsLocked]   = useState(false);
  const [nearZone, setNearZone]   = useState(null);
  const [camY, setCamY]           = useState(EYE_H);
  const [lookedAtAgent, setLookedAtAgent] = useState(null);
  const lookedAtRef = useRef(null);

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

    // Renderer — optimized for performance
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.addEventListener('lock',   () => { setIsLocked(true);  isLockedRef.current = true;  });
    controls.addEventListener('unlock', () => { setIsLocked(false); isLockedRef.current = false; });
    controlsRef.current = controls;

    // Lights — minimal, no shadows
    scene.add(new THREE.AmbientLight('#ffffff', 0.9));
    const sun = new THREE.DirectionalLight('#fff8e8', 1.2);
    sun.position.set(20, 30, -10);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight('#87ceeb', '#4a7c3f', 0.4));

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

    // Zone geometry — lightweight: just floor tiles and shop signs
    crowdAnimRef.current = [];
    zones.forEach(zone => {
      const yBase = zone.floor * FLOOR_STEP;
      buildShopTile(scene, zone, yBase);
      buildShopSign(scene, zone, yBase);
    });
    billboardsRef.current = [];

    // Spawn animated agents from people.json
    agentsRef.current = initAgents(scene);

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
        // Check PROPOSED position — stair takes priority over floor-lock
        const onStair = onStairXZ(proposed.x, proposed.z);

        if (onStair) {
          // Lock onto the correct stair segment when first stepping on
          if (stairSegRef.current === -1) {
            stairSegRef.current = resolveStairSeg(camera.position.y, proposed.z);
          }
          const seg = stairSegRef.current;
          const targetY = rampYatZ(proposed.z, seg) + EYE_H;

          // Always allow XZ movement on stairs — no floor-lock here
          camera.position.x = proposed.x;
          camera.position.z = proposed.z;
          // Drive Y directly to ramp surface — no lerp lag, feels solid
          camera.position.y = targetY;

        } else {
          // Left the stair — clear the locked segment
          stairSegRef.current = -1;

          // ── Floor-locked XZ ───────────────────────────────────────────────
          // Allow: inside mall interior OR ground floor (outside) OR stair corridor
          const inMallInterior = (
            Math.abs(proposed.x) < MALL_W / 2 - 0.1 &&
            proposed.z > -MALL_D / 2 + 0.1 &&
            proposed.z < MALL_D / 2 - 0.1
          );
          const inStairCorridor = onStairXZ(proposed.x, proposed.z);
          const canMove = inMallInterior || inStairCorridor || curFloor === 0;

          if (canMove) {
            camera.position.x = proposed.x;
            camera.position.z = proposed.z;
          } else {
            // Wall-slide: try each axis independently
            const tryX = camera.position.clone(); tryX.x = proposed.x;
            const tryZ = camera.position.clone(); tryZ.z = proposed.z;
            const xOk = (Math.abs(tryX.x) < MALL_W / 2 - 0.1 &&
                         tryX.z > -MALL_D / 2 + 0.1 && tryX.z < MALL_D / 2 - 0.1)
                        || onStairXZ(tryX.x, tryX.z);
            const zOk = (Math.abs(tryZ.x) < MALL_W / 2 - 0.1 &&
                         tryZ.z > -MALL_D / 2 + 0.1 && tryZ.z < MALL_D / 2 - 0.1)
                        || onStairXZ(tryZ.x, tryZ.z);
            if (xOk) camera.position.x = proposed.x; else vel.x = 0;
            if (zOk) camera.position.z = proposed.z; else vel.y = 0;
          }

          // ── Gravity: snap to current floor surface ────────────────────────
          const surfaces = walkableRef.current[curFloor] || [];
          const origin = camera.position.clone(); origin.y += 2.5;
          raycaster.set(origin, rayDown);
          const hits = raycaster.intersectObjects(surfaces, false);
          if (hits.length > 0) {
            const targetY = hits[0].point.y + EYE_H;
            if (targetY <= camera.position.y + 0.4) {
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

        detectZone(camera, zones, nearZoneRef, setNearZone);

        // Detect which agent the player is looking at
        const looked = detectLookedAtAgent(camera, agentsRef.current, 8);
        if (looked?.id !== lookedAtRef.current?.id) {
          lookedAtRef.current = looked ?? null;
          setLookedAtAgent(looked ?? null);
        }

      } else {
        // Idle — stay on the road, gentle head-bob so it feels alive
        camera.position.set(START_X, EYE_H + Math.sin(time * 0.6) * 0.04, START_Z);
        camera.lookAt(START_X, EYE_H, 0);
        velRef.current.set(0, 0);
      }

      // Animate static crowd bob (removed — no static crowd)

      // Update walking agents
      updateAgents(agentsRef.current, dt);

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
      agentsRef.current     = [];
      walkableRef.current   = [];
      nearZoneRef.current   = null;
      stairSegRef.current   = -1;
    };
  }, [zones]);

  const handleClick = () => controlsRef.current?.lock();

  return (
    <div className="bv-wrap">
      <div ref={mountRef} className="bv-canvas" onClick={handleClick} />
      {!isLocked && <EnterOverlay onEnter={handleClick} />}
      {isLocked  && <Crosshair />}
      {isLocked  && <FloorIndicator y={camY} />}
      {isLocked  && lookedAtAgent && <PersonHUD agent={lookedAtAgent} zones={zones} />}
      {isLocked  && nearZone && !lookedAtAgent && <ZoneHUD zone={nearZone} />}
      <div className="bv-hint">
        WASD · walk · find the <strong>blue stair sign on the RIGHT wall</strong> to go up/down · ESC to unlock
      </div>
    </div>
  );
}
