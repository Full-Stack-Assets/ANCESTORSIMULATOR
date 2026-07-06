// The open-world "map" screen: a real, walkable 3D space built from a
// chapter's own waypoint data (see geo.js for how lat/lng becomes a walkable
// layout). Reused across chapters — call loadChapter() each time the player
// picks a new one.

import * as THREE from 'three';
import { projectWaypoints } from './geo.js';
import { confidenceHex } from './confidence.js';

const PLAYER_SPEED = 5.2; // units/sec, roughly a brisk walk (1 unit = 1 m)
const TURN_SPEED = 2.0; // rad/sec from keyboard
const ARRIVE_RADIUS = 6; // units — how close counts as "at" a waypoint
const EYE_HEIGHT = 1.7;

let renderer, scene, camera, clock;
let ground, pathLine;
let markers = []; // { group, index, pos, reached, isFrontier }
let player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let keys = Object.create(null);
let dragState = null;
let interactable = null; // index of the nearest in-range marker, or null
let nearestDistance = null;
let frontierIndex = 0;
let onArrive = null; // callback(index)
let running = false;
let canvasEl = null;

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
  renderer.setSize(
    renderCanvas.clientWidth || renderCanvas.width,
    renderCanvas.clientHeight || renderCanvas.height,
    false
  );

  camera = new THREE.PerspectiveCamera(68, aspect(), 0.1, 3000);
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  inputCanvas.addEventListener('mousedown', (e) => {
    if (!running) return;
    dragState = { x: e.clientX, y: e.clientY, yaw: player.yaw, pitch: player.pitch };
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;
    player.yaw = dragState.yaw - dx * 0.0035;
    player.pitch = clamp(dragState.pitch - dy * 0.0035, -1.1, 1.1);
  });
  window.addEventListener('mouseup', () => {
    dragState = null;
  });
  window.addEventListener('resize', resize);

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
  renderer.setSize(
    canvasEl.clientWidth || canvasEl.width,
    canvasEl.clientHeight || canvasEl.height,
    false
  );
  camera.aspect = aspect();
  camera.updateProjectionMatrix();
}

/** Build the scene for one chapter. `reachedCount` = how many waypoints
 * (from the start) are already unlocked; the next one is the "frontier"
 * the player is walking toward. */
export function loadChapter(chapterData, reachedCount) {
  clearScene();

  scene.background = new THREE.Color(0xbfe0e8);
  scene.fog = new THREE.Fog(0xbfe0e8, 220, 1400);

  scene.add(new THREE.HemisphereLight(0xfff6df, 0x3a4a33, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
  sun.position.set(180, 260, 120);
  scene.add(sun);

  const positions = projectWaypoints(chapterData.waypoints);
  const extent = Math.max(400, ...positions.map((p) => Math.hypot(p.x, p.z) * 1.4));

  ground = buildGround(extent);
  scene.add(ground);

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

function buildGround(extent) {
  const size = extent * 2.4;
  const segs = 90;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const bump =
      Math.sin(x * 0.012) * Math.cos(z * 0.012) * 2.4 + Math.sin(x * 0.05 + z * 0.03) * 0.6;
    pos.setY(i, bump);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f7a4a, roughness: 1, metalness: 0 });
  return new THREE.Mesh(geo, mat);
}

function buildMarker(wp, visible, isFrontier) {
  const group = new THREE.Group();
  group.visible = visible;

  const color = confidenceHex(wp.confidence);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 6, 10),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.5,
    })
  );
  pole.position.y = 3;
  group.add(pole);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 16, 16),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      roughness: 0.35,
    })
  );
  head.position.y = 6.4;
  group.add(head);

  if (isFrontier) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf2c14e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.userData.spin = true;
    group.add(ring);
  }

  return group;
}

function buildPath(positions) {
  if (positions.length < 2) return new THREE.Group();
  const pts = positions.map((p) => new THREE.Vector3(p.x, 0.15, p.z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
  const geo = new THREE.TubeGeometry(curve, Math.max(8, positions.length * 6), 0.28, 6, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.9 });
  return new THREE.Mesh(geo, mat);
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
  if (forward || strafe) {
    const mag = Math.hypot(forward, strafe) || 1;
    const fx = -Math.sin(player.yaw) * forward,
      fz = -Math.cos(player.yaw) * forward;
    const sx = Math.cos(player.yaw) * strafe,
      sz = -Math.sin(player.yaw) * strafe;
    player.x += ((fx + sx) / mag) * PLAYER_SPEED * dt;
    player.z += ((fz + sz) / mag) * PLAYER_SPEED * dt;
  }

  camera.position.set(player.x, groundHeightAt(player.x, player.z) + EYE_HEIGHT, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  markers.forEach((m) => {
    m.group.children.forEach((child) => {
      if (child.userData.spin) child.rotation.z += dt * 1.1;
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
  if (interactable != null && onArrive) onArrive(interactable, interactable === frontierIndex);
}

function groundHeightAt(x, z) {
  return Math.sin(x * 0.012) * Math.cos(z * 0.012) * 2.4 + Math.sin(x * 0.05 + z * 0.03) * 0.6;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function setOnArrive(fn) {
  onArrive = fn;
}
export function start() {
  running = true;
  clock.getDelta();
}
export function stop() {
  running = false;
  keys = Object.create(null);
}

export function getWorldState() {
  return {
    player: { x: round2(player.x), z: round2(player.z), yaw: round2(player.yaw) },
    frontierIndex,
    interactable, // index of the nearest reached-or-frontier waypoint in range, or null
    isFrontierInteractable: interactable === frontierIndex,
    nearestDistance: nearestDistance == null ? null : round2(nearestDistance),
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

function round2(n) {
  return Math.round(n * 100) / 100;
}
