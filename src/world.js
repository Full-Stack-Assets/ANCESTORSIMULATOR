// The open-world "map" screen: a real, walkable 3D space built from a
// chapter's own waypoint data (see geo.js for how lat/lng becomes a walkable
// layout). Reused across chapters — call loadChapter() each time the player
// picks a new one.
//
// Rendering targets the production-quality bar of the studio's other
// open-world build (Project SouthCoast, Godot): a physically-lit sky with
// filmic tonemapping, a shadow-casting sun, a dressed world (not just bare
// terrain + primitives), a first-person camera with real footfall feel, and
// a minimap — scaled down to what a walking, non-combat genealogy game
// actually needs (no vehicles, weather states, or factions here).

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { projectWaypoints } from './geo.js';
import * as Audio from './audio.js';

const CONFIDENCE_COLOR = {
  documented: 0x3ba55c,
  inferred: 0x3b82c4,
  legend: 0x9b59b6,
};

const PLAYER_SPEED = 5.2; // units/sec, roughly a brisk walk (1 unit = 1 m)
const TURN_SPEED = 2.0; // rad/sec from keyboard
const ARRIVE_RADIUS = 6; // units — how close counts as "at" a waypoint
const EYE_HEIGHT = 1.7;
const STEP_INTERVAL = 2.1; // units of ground covered between footstep sounds
const BOB_AMPLITUDE = 0.055;
const BOB_FREQUENCY = 5.6; // radians/sec while moving at full speed

let renderer, scene, camera, clock;
let ground, pathLine, sky, sun;
let markers = []; // { group, index, pos, reached, isFrontier }
let props = [];
let player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let keys = Object.create(null);
let dragState = null;
let interactable = null; // index of the nearest in-range marker, or null
let prevInteractable = null;
let nearestDistance = null;
let frontierIndex = 0;
let currentExtent = 400;
let distanceWalked = 0; // meters since the last footstep cue
let bobPhase = 0;
let onArrive = null; // callback(index)
let running = false;
let canvasEl = null;
let audioArmed = false;

/**
 * @param {HTMLCanvasElement} renderCanvas the WebGL surface (the `#world`
 *   canvas — stacked behind and rendered to, never receives pointer events)
 * @param {HTMLCanvasElement} inputCanvas the input surface (the `#stage`
 *   canvas — layered on top, so it's what mouse drags actually land on)
 */
export function initWorld(renderCanvas, inputCanvas) {
  canvasEl = renderCanvas;
  renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(renderCanvas.clientWidth || renderCanvas.width, renderCanvas.clientHeight || renderCanvas.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Far plane has to clear the Sky dome (scaled to tens of thousands of
  // units so it never intersects geometry) — see buildSky().
  camera = new THREE.PerspectiveCamera(68, aspect(), 0.1, 100000);
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  const armAudio = () => { if (!audioArmed) { audioArmed = true; Audio.startAmbience(); } };
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; armAudio(); });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  inputCanvas.addEventListener('mousedown', (e) => {
    if (!running) return;
    armAudio();
    dragState = { x: e.clientX, y: e.clientY, yaw: player.yaw, pitch: player.pitch };
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;
    player.yaw = dragState.yaw - dx * 0.0035;
    player.pitch = clamp(dragState.pitch - dy * 0.0035, -1.1, 1.1);
  });
  window.addEventListener('mouseup', () => { dragState = null; });

  renderer.setAnimationLoop(() => {
    if (!running) return;
    step(clock.getDelta());
    renderer.render(scene, camera);
  });
}

function aspect() {
  const w = canvasEl.clientWidth || canvasEl.width;
  const h = canvasEl.clientHeight || canvasEl.height;
  return w / Math.max(1, h);
}

export function resize() {
  if (!renderer) return;
  renderer.setSize(canvasEl.clientWidth || canvasEl.width, canvasEl.clientHeight || canvasEl.height, false);
  camera.aspect = aspect();
  camera.updateProjectionMatrix();
}

/** Build the scene for one chapter. `reachedCount` = how many waypoints
 * (from the start) are already unlocked; the next one is the "frontier"
 * the player is walking toward. */
export function loadChapter(chapterData, reachedCount) {
  clearScene();
  distanceWalked = 0;
  bobPhase = 0;
  prevInteractable = null;

  const positions = projectWaypoints(chapterData.waypoints);
  const extent = Math.max(400, ...positions.map((p) => Math.hypot(p.x, p.z) * 1.4));
  currentExtent = extent;

  const rig = buildSky(extent);
  sky = rig.sky;
  sun = rig.sun;
  scene.add(sky, rig.hemi, sun, sun.target);
  scene.fog = new THREE.Fog(rig.fogColor, extent * 0.55, extent * 3.4);
  scene.background = rig.fogColor;

  ground = buildGround(extent);
  scene.add(ground);

  const rng = seededRandom(hashSeed(chapterData.id || chapterData.name || 'chapter'));
  props = scatterProps(extent, positions, rng);
  scene.add(props);

  markers = chapterData.waypoints.map((wp, i) => {
    const pos = positions[i];
    const reached = i < reachedCount;
    const isFrontier = i === reachedCount;
    const group = buildMarker(wp, reached || isFrontier, isFrontier);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
    return { group, index: i, pos, reached, isFrontier };
  });

  pathLine = buildPath(positions.slice(0, Math.max(1, reachedCount + 1)));
  scene.add(pathLine);

  frontierIndex = Math.min(reachedCount, chapterData.waypoints.length - 1);

  // Spawn a short walk behind the most recently reached stop (or waypoint 0
  // at the very start of the chapter), facing the frontier.
  const spawnFrom = positions[Math.max(0, reachedCount - 1)];
  const target = positions[frontierIndex];
  const dir = Math.atan2(target.x - spawnFrom.x, -(target.z - spawnFrom.z));
  player.x = spawnFrom.x - Math.sin(dir) * 12;
  player.z = spawnFrom.z + Math.cos(dir) * 12;
  player.yaw = dir;
  player.pitch = -0.08;

  updateInteractable(); // don't wait for the first animation frame to know this
}

// ---------------------------------------------------------------------
// Sky, sun and ambient light. Mirrors the "WorldEnvironment (procedural sky
// + filmic tonemap) + shadow-casting directional sun" setup used by the
// studio's Godot open-world build, translated to Three.js's Sky shader +
// ACESFilmicToneMapping instead of Godot's ProceduralSkyMaterial.
// ---------------------------------------------------------------------

const SUN_ELEVATION_DEG = 34;
const SUN_AZIMUTH_DEG = 140;

function buildSky(extent) {
  const skyMesh = new Sky();
  skyMesh.scale.setScalar(Math.max(45000, extent * 8));

  const uniforms = skyMesh.material.uniforms;
  uniforms.turbidity.value = 3.2;
  uniforms.rayleigh.value = 1.6;
  uniforms.mieCoefficient.value = 0.006;
  uniforms.mieDirectionalG.value = 0.8;

  const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION_DEG);
  const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sunDir);

  const hemi = new THREE.HemisphereLight(0xf5f2e0, 0x3a4a33, 0.85);

  const sunLight = new THREE.DirectionalLight(0xfff3d6, 3.1);
  sunLight.position.copy(sunDir).multiplyScalar(Math.max(400, extent * 1.2));
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0006;
  const shadowSpan = Math.min(280, extent * 0.6); // shadows only need to cover what's near the player
  sunLight.shadow.camera.left = -shadowSpan;
  sunLight.shadow.camera.right = shadowSpan;
  sunLight.shadow.camera.top = shadowSpan;
  sunLight.shadow.camera.bottom = -shadowSpan;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = Math.max(800, extent * 3);
  sunLight.target.position.set(0, 0, 0);

  // A believable horizon-tinted haze color, sampled from the sky's own warm
  // key light rather than a flat hardcoded blue, so fog reads as "the same
  // sky, thinning with distance" instead of a mismatched wall of color.
  const fogColor = new THREE.Color(0xcfe0e0).lerp(new THREE.Color(0xfff3d6), 0.25);

  return { sky: skyMesh, hemi, sun: sunLight, fogColor };
}

/** Keeps the shadow-casting sun roughly centered on the player as they walk,
 * so the fixed-size shadow frustum (sized for close-range detail) always
 * covers the ground actually in view instead of drifting off to one side. */
function updateSunTarget() {
  if (!sun) return;
  const sunDir = sun.position.clone().normalize();
  sun.target.position.set(player.x, 0, player.z);
  sun.position.set(player.x, 0, player.z).addScaledVector(sunDir, Math.max(400, currentExtent * 1.2));
}

// ---------------------------------------------------------------------
// Ground + world dressing
// ---------------------------------------------------------------------

function buildGround(extent) {
  const size = extent * 2.4;
  const segs = 90;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const bump = Math.sin(x * 0.012) * Math.cos(z * 0.012) * 2.4
      + Math.sin(x * 0.05 + z * 0.03) * 0.6;
    pos.setY(i, bump);
  }
  geo.computeVertexNormals();

  const texture = grassTexture();
  const tile = 14; // meters per texture repeat
  texture.repeat.set(size / tile, size / tile);
  // A tiny texture repeated this many times across a huge ground plane
  // aliases badly at grazing viewing angles (moire "speed lines") without
  // anisotropic filtering — this is what fixes it, not more geometry detail.
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** A small tileable canvas texture standing in for real turf art — mottled
 * green with a subtle blade-like speckle, so the ground reads as dressed
 * terrain rather than a flat color fill. Generated once per module load. */
let cachedGrassTexture = null;
function grassTexture() {
  if (cachedGrassTexture) return cachedGrassTexture;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx2d = c.getContext('2d');
  ctx2d.fillStyle = '#5f7a4a';
  ctx2d.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = Math.random();
    ctx2d.fillStyle = shade < 0.5
      ? `rgba(70, 95, 55, ${0.25 + Math.random() * 0.3})`
      : `rgba(140, 160, 95, ${0.15 + Math.random() * 0.25})`;
    const len = 2 + Math.random() * 4;
    ctx2d.fillRect(x, y, 1, len);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedGrassTexture = texture;
  return texture;
}

/** Scatters simple low-poly trees/shrubs around the walkable area for visual
 * depth — the same "no prefabs, runtime primitives" approach the studio's
 * Godot town-block greybox uses. Deterministic per chapter (seeded RNG) so
 * reloading the same chapter (e.g. after closing a detail screen) doesn't
 * make the dressing jump around. Waypoints and the path stay clear so props
 * never block interaction or walking. */
function scatterProps(extent, waypointPositions, rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b432c, roughness: 0.95 });
  const leafPalette = [0x3f6b3a, 0x4f7a42, 0x386b4a];
  const count = Math.round(60 + extent * 0.06);

  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * extent * 1.05;
    const z = (rng() * 2 - 1) * extent * 1.05;
    const tooCloseToWaypoint = waypointPositions.some((p) => Math.hypot(p.x - x, p.z - z) < 14);
    if (tooCloseToWaypoint) continue;

    const scale = 0.7 + rng() * 0.9;
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, 2.2 * scale, 6), trunkMat);
    trunk.position.y = 1.1 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    const leafColor = leafPalette[Math.floor(rng() * leafPalette.length)];
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85 });
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.4 * scale, 3.2 * scale, 7), leafMat);
    leaves.position.y = 3.4 * scale;
    leaves.castShadow = true;
    tree.add(leaves);

    tree.position.set(x, groundHeightAt(x, z), z);
    tree.rotation.y = rng() * Math.PI * 2;
    group.add(tree);
  }

  return group;
}

function buildMarker(wp, visible, isFrontier) {
  const group = new THREE.Group();
  group.visible = visible;

  const color = CONFIDENCE_COLOR[wp.confidence] || 0x999999;

  // A tapered waystone rather than a bare pole — reads as a deliberate
  // landmark rather than a debug gizmo.
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.6, 5.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b6558, roughness: 0.8, metalness: 0.05 })
  );
  stone.position.y = 2.8;
  stone.castShadow = true;
  stone.receiveShadow = true;
  group.add(stone);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.05, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 })
  );
  crystal.position.y = 6.2;
  crystal.castShadow = true;
  crystal.userData.spin = true;
  group.add(crystal);

  if (isFrontier) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    ring.userData.ringSpin = true;
    group.add(ring);

    const glow = new THREE.PointLight(0xf2c14e, 6, 22, 2);
    glow.position.y = 6.2;
    group.add(glow);
  }

  return group;
}

function buildPath(positions) {
  if (positions.length < 2) return new THREE.Group();
  const pts = positions.map((p) => new THREE.Vector3(p.x, 0.15, p.z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
  const geo = new THREE.TubeGeometry(curve, Math.max(8, positions.length * 6), 0.28, 6, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function clearScene() {
  if (!scene) return;
  while (scene.children.length) {
    const obj = scene.children.pop();
    disposeDeep(obj);
  }
}

function disposeDeep(obj) {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
  }
  if (obj.children) obj.children.slice().forEach(disposeDeep);
}

function step(dt) {
  dt = Math.min(dt, 0.05);

  if (keys.arrowleft) player.yaw += TURN_SPEED * dt;
  if (keys.arrowright) player.yaw -= TURN_SPEED * dt;

  const forward = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  const strafe = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  let moving = false;
  if (forward || strafe) {
    moving = true;
    const mag = Math.hypot(forward, strafe) || 1;
    const fx = -Math.sin(player.yaw) * forward, fz = -Math.cos(player.yaw) * forward;
    const sx = Math.cos(player.yaw) * strafe, sz = -Math.sin(player.yaw) * strafe;
    const dx = ((fx + sx) / mag) * PLAYER_SPEED * dt;
    const dz = ((fz + sz) / mag) * PLAYER_SPEED * dt;
    player.x += dx;
    player.z += dz;

    const covered = Math.hypot(dx, dz);
    distanceWalked += covered;
    bobPhase += dt * BOB_FREQUENCY * (PLAYER_SPEED / 5.2);
    if (distanceWalked >= STEP_INTERVAL) {
      distanceWalked -= STEP_INTERVAL;
      Audio.footstep();
    }
  }

  const bob = moving ? Math.sin(bobPhase) * BOB_AMPLITUDE : 0;
  camera.position.set(player.x, groundHeightAt(player.x, player.z) + EYE_HEIGHT + bob, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  updateSunTarget();

  markers.forEach((m) => {
    m.group.children.forEach((child) => {
      if (child.userData.spin) child.rotation.y += dt * 1.1;
      if (child.userData.ringSpin) child.rotation.z += dt * 0.6;
    });
  });

  updateInteractable();
}

/** Recomputes which visited-or-current waypoint (if any) the player is
 * close enough to examine. Split out from step() so loadChapter() can call
 * it once up front too, rather than leaving stale state until the first
 * animation frame ticks. */
function updateInteractable() {
  let nearest = null;
  for (const m of markers) {
    if (!m.reached && !m.isFrontier) continue; // only visited/current stops are walkable-to
    const d = Math.hypot(player.x - m.pos.x, player.z - m.pos.z);
    if (!nearest || d < nearest.d) nearest = { m, d };
  }
  interactable = nearest && nearest.d <= ARRIVE_RADIUS ? nearest.m.index : null;
  nearestDistance = nearest ? nearest.d : null;
  if (interactable != null && prevInteractable == null) Audio.arrivalChime();
  prevInteractable = interactable;
  if (interactable != null && onArrive) onArrive(interactable, interactable === frontierIndex);
}

function groundHeightAt(x, z) {
  return Math.sin(x * 0.012) * Math.cos(z * 0.012) * 2.4 + Math.sin(x * 0.05 + z * 0.03) * 0.6;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Simple deterministic PRNG (mulberry32) so world dressing is stable across
 * reloads of the same chapter instead of re-randomizing every time the
 * player re-enters the world (e.g. closing a detail screen). */
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return h;
}

export function setOnArrive(fn) { onArrive = fn; }
export function start() { running = true; clock.getDelta(); }
export function stop() { running = false; keys = Object.create(null); }

export function getWorldState() {
  return {
    player: { x: round2(player.x), z: round2(player.z), yaw: round2(player.yaw) },
    frontierIndex,
    interactable, // index of the nearest reached-or-frontier waypoint in range, or null
    isFrontierInteractable: interactable === frontierIndex,
    nearestDistance: nearestDistance == null ? null : round2(nearestDistance),
  };
}

/** Snapshot for the 2D HUD's minimap — the player's position plus every
 * marker's local position and reached/frontier state, scaled to the current
 * chapter's extent. Kept separate from getWorldState() since the minimap
 * needs the whole layout, not just the single nearest-interactable summary. */
export function getMarkerLayout() {
  return {
    extent: currentExtent,
    player: { x: player.x, z: player.z, yaw: player.yaw },
    markers: markers.map((m) => ({
      x: m.pos.x,
      z: m.pos.z,
      reached: m.reached,
      isFrontier: m.isFrontier,
    })),
  };
}

/** Test-only shortcut: place the player at interact range of waypoint
 * `index` (defaults to the current frontier), facing it. Real play always
 * reaches this by walking — see README "World scale" — this exists purely
 * so tools/smoke.mjs can exercise every chapter without literally walking a
 * compressed ocean for each one. */
export function debugWarpTo(index = frontierIndex) {
  const target = markers[index];
  if (!target) return;
  const angle = Math.random() * Math.PI * 2;
  player.x = target.pos.x + Math.sin(angle) * (ARRIVE_RADIUS * 0.5);
  player.z = target.pos.z + Math.cos(angle) * (ARRIVE_RADIUS * 0.5);
  player.yaw = angle + Math.PI;
}

function round2(n) { return Math.round(n * 100) / 100; }
