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
import * as Monetize from './monetize.js';

// Two visual tiers. Standard is a big lift over the old flat look for everyone;
// Ultra (the Pro "ultra_fidelity" feature) pushes shadows and world density
// further. Resolved fresh each loadChapter so unlocking Pro mid-session takes
// effect on the next chapter without a reload.
function qualityTier() {
  const ultra = Monetize.hasPro();
  // Software / very weak GPUs (SwiftShader, llvmpipe, some integrated chips)
  // can't afford IBL + a dense instanced meadow at interactive rates. Detect
  // that once and fall back to a lean-but-still-dressed path so the world stays
  // smooth everywhere instead of stuttering.
  if (lowPerf) {
    // Match the original lightweight look: keep sky, sun, shadows, fog and
    // trees, but drop the whole-screen fragment costs (IBL, ground normal map,
    // dense meadow) that a software renderer can't sustain.
    return { ultra, groundNormal: false, shadowMap: 2048, grassCount: 0, treeBoost: 1.0, pixelCap: 1.5 };
  }
  return {
    ultra,
    groundNormal: true,
    shadowMap: ultra ? 4096 : 2048,
    grassCount: ultra ? 7000 : 3500,
    treeBoost: ultra ? 1.6 : 1.0,
    pixelCap: ultra ? 2 : 1.75,
  };
}

// True on software/very weak WebGL, so qualityTier() can lighten the load.
// window.__ANC_FORCE_QUALITY__ ('high' | 'low') overrides the auto-detection —
// used to preview the full-fidelity path on any machine (and by the visual
// smoke check), since the CI's software GL would otherwise always pick 'low'.
function isSoftwareRenderer() {
  try {
    if (typeof window !== 'undefined') {
      if (window.__ANC_FORCE_QUALITY__ === 'high') return false;
      if (window.__ANC_FORCE_QUALITY__ === 'low') return true;
    }
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(String(name || ''));
  } catch (e) {
    return false;
  }
}

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
let lowPerf = false; // true on software/very weak GL — drives the lean quality tier
let ground, pathLine, sky, sun;
let markers = []; // { group, index, pos, reached, isFrontier }
let props = [];
let player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let keys = Object.create(null);
let dragState = null;
let touchLook = null; // active touch-drag look gesture on the world canvas
let touchAxis = { f: 0, s: 0 }; // movement from the on-screen joystick (main.js)
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
  lowPerf = isSoftwareRenderer();
  const q = qualityTier();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelCap));
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

  // Touch drag-to-look. Only engages in the world (running), and only once the
  // finger has actually moved a little — so a tap still becomes a click (the
  // "examine" prompt and every 2D screen are canvas buttons that need clicks).
  // The joystick is a separate DOM element, so its touches never reach here.
  inputCanvas.addEventListener('touchstart', (e) => {
    if (!running) return;
    armAudio();
    const t = e.changedTouches[0];
    touchLook = { id: t.identifier, x: t.clientX, y: t.clientY, yaw: player.yaw, pitch: player.pitch, moved: false };
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!touchLook) return;
    const t = Array.from(e.changedTouches).find((tt) => tt.identifier === touchLook.id);
    if (!t) return;
    const dx = t.clientX - touchLook.x;
    const dy = t.clientY - touchLook.y;
    if (!touchLook.moved && Math.hypot(dx, dy) < 8) return; // below threshold — still a potential tap
    touchLook.moved = true;
    player.yaw = touchLook.yaw - dx * 0.005;
    player.pitch = clamp(touchLook.pitch - dy * 0.005, -1.1, 1.1);
    e.preventDefault(); // suppress page scroll once we're actually looking
  }, { passive: false });
  const endTouchLook = (e) => {
    if (touchLook && Array.from(e.changedTouches).some((tt) => tt.identifier === touchLook.id)) touchLook = null;
  };
  window.addEventListener('touchend', endTouchLook);
  window.addEventListener('touchcancel', endTouchLook);

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
  const w = canvasEl.clientWidth || canvasEl.width;
  const h = canvasEl.clientHeight || canvasEl.height;
  renderer.setSize(w, h, false);
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

  const q = qualityTier();

  const rig = buildSky(extent);
  sky = rig.sky;
  sun = rig.sun;
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  scene.add(sky, rig.hemi, sun, sun.target);
  scene.fog = new THREE.Fog(rig.fogColor, extent * 0.55, extent * 3.4);
  scene.background = rig.fogColor;

  ground = buildGround(extent, q.groundNormal);
  scene.add(ground);

  const seedBase = chapterData.id || chapterData.name || 'chapter';
  const rng = seededRandom(hashSeed(seedBase));
  props = scatterProps(extent, positions, rng, q.treeBoost);
  scene.add(props);

  // A dense instanced meadow near the walkable area — the biggest single lift
  // from "empty field" to "dressed world", and cheap because it's one draw call.
  const grass = buildGrassField(extent, seededRandom(hashSeed(seedBase + ':grass')), q.grassCount, positions);
  if (grass) scene.add(grass);

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

function buildGround(extent, withNormalMap = true) {
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
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  texture.anisotropy = maxAniso;

  // A matching normal map gives the turf real per-pixel relief under the sun,
  // so it catches light like ground instead of reading as a printed sheet.
  // Skipped on the lean tier — it's a per-fragment cost across the whole plane.
  const matOpts = { map: texture, roughness: 0.98, metalness: 0 };
  if (withNormalMap) {
    const normal = groundNormalTexture();
    normal.repeat.copy(texture.repeat);
    normal.anisotropy = maxAniso;
    matOpts.normalMap = normal;
    matOpts.normalScale = new THREE.Vector2(0.55, 0.55);
  }
  const mat = new THREE.MeshStandardMaterial(matOpts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** A tileable normal map derived from blurred value noise — gives the ground
 * fine, light-catching relief without any extra geometry. Linear data, so it
 * must NOT be tagged sRGB. Generated once per module load. */
let cachedGroundNormal = null;
function groundNormalTexture() {
  if (cachedGroundNormal) return cachedGroundNormal;
  const size = 256;
  const noise = new Float32Array(size * size);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
  const blur = (src) => {
    const dst = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            s += src[((y + dy + size) % size) * size + ((x + dx + size) % size)];
          }
        }
        dst[y * size + x] = s / 9;
      }
    }
    return dst;
  };
  const h = blur(blur(noise));
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1 + size) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      img.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cachedGroundNormal = t;
  return t;
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
function scatterProps(extent, waypointPositions, rng, treeBoost = 1) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b432c, roughness: 0.95 });
  const leafPalette = [0x3f6b3a, 0x4f7a42, 0x386b4a];
  const count = Math.round((60 + extent * 0.06) * treeBoost);

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

/** A dense instanced meadow of grass tufts around the walkable area — one draw
 * call for thousands of tufts, biased toward the centre where the player walks
 * and kept clear of the waypoint pads. The single biggest lift from bare plane
 * to "dressed world". Count scales with the visual-quality tier. */
function buildGrassField(extent, rng, count, waypointPositions) {
  if (!count) return null;
  const geo = new THREE.PlaneGeometry(0.9, 0.7);
  geo.translate(0, 0.35, 0); // pivot at the base so tufts sit on the ground
  const mat = new THREE.MeshStandardMaterial({
    map: grassBladeTexture(),
    alphaTest: 0.45, // crisp cutout, no transparency sorting needed
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const radius = extent * 0.9;
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng()) * radius; // sqrt → denser toward the centre
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (waypointPositions.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    const s = 0.7 + rng() * 1.0;
    dummy.position.set(x, groundHeightAt(x, z), z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(s, s * (0.8 + rng() * 0.7), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    col.setHSL(0.25 + rng() * 0.06, 0.42, 0.30 + rng() * 0.14);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed; // trim the reserved-but-skipped tail
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** A small transparent canvas of a few grass blades, used on the meadow tufts. */
let cachedBladeTexture = null;
function grassBladeTexture() {
  if (cachedBladeTexture) return cachedBladeTexture;
  const w = 64, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  for (let b = 0; b < 7; b++) {
    const bx = 8 + Math.random() * (w - 16);
    const bw = 2 + Math.random() * 2.5;
    const bh = 26 + Math.random() * 34;
    const lean = (Math.random() - 0.5) * 12;
    const g = 95 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgb(${40 + Math.floor(Math.random() * 40)}, ${g}, ${40 + Math.floor(Math.random() * 30)})`;
    ctx.beginPath();
    ctx.moveTo(bx, h);
    ctx.quadraticCurveTo(bx + lean, h - bh * 0.6, bx + lean * 1.6, h - bh);
    ctx.lineTo(bx + lean * 1.6 + bw, h - bh);
    ctx.quadraticCurveTo(bx + lean + bw, h - bh * 0.6, bx + bw, h);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cachedBladeTexture = t;
  return t;
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
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.1 })
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
  if (obj.isInstancedMesh && obj.dispose) obj.dispose(); // frees instance buffers too
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

  // Movement blends keyboard (on/off) and the on-screen joystick (analog).
  const forward = clamp((keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) + touchAxis.f, -1, 1);
  const strafe = clamp((keys.d ? 1 : 0) - (keys.a ? 1 : 0) + touchAxis.s, -1, 1);
  let moving = false;
  const mag = Math.hypot(forward, strafe);
  if (mag > 0.02) {
    moving = true;
    const speedFactor = Math.min(1, mag); // a half-pushed stick walks at half pace
    const nf = forward / mag, ns = strafe / mag;
    const fx = -Math.sin(player.yaw) * nf, fz = -Math.cos(player.yaw) * nf;
    const sx = Math.cos(player.yaw) * ns, sz = -Math.sin(player.yaw) * ns;
    const dx = (fx + sx) * PLAYER_SPEED * speedFactor * dt;
    const dz = (fz + sz) * PLAYER_SPEED * speedFactor * dt;
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

/** Feed analog movement from the on-screen joystick (main.js). forward: +ahead,
 * -back; strafe: +right, -left; each in [-1, 1]. */
export function setMoveAxis(forward, strafe) {
  touchAxis.f = clamp(forward, -1, 1);
  touchAxis.s = clamp(strafe, -1, 1);
}
export function start() {
  running = true;
  // Warm up: force shader compilation and one full post-processing pass NOW,
  // while the chapter is loading, so the expensive first frame (bloom program
  // compile, etc.) doesn't land mid-walk — a stall there gets clamped by
  // step()'s dt cap and silently eats the player's first stride.
  try {
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
  } catch (e) { /* non-fatal — the loop will render normally */ }
  clock.getDelta(); // reset so the first interactive step() sees ~0 elapsed, not the warm-up cost
}
export function stop() { running = false; keys = Object.create(null); touchAxis = { f: 0, s: 0 }; touchLook = null; }

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
