import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { audio } from './audio';
import { localizeMessage } from './i18n';
import { has, resolveAction, saveGame } from './model';
import { center, DOORS, findPath, getLocation, GRID, HEIGHT, isWalkable, lineOfSight, NIGHT_SECONDS, OBJECTS, ROOMS, TILE, WIDTH } from './world';
import type { CameraMode, GameState, Settings, Snapshot, WorldObject } from './types';

interface Callbacks {
  onSnapshot: (snapshot: Snapshot) => void;
  onInteract: (object: WorldObject) => void;
  onMessage: (message: string) => void;
  onEnd: (state: GameState) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onCameraMode: (mode: CameraMode) => void;
}
interface Obstacle { x: number; z: number; w: number; d: number }

function canvasTexture(kind: 'wall' | 'floor' | 'ceiling') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const y = Math.floor(i / 4 / 256), n = Math.random() * 22;
    const base = kind === 'floor' ? 64 : kind === 'ceiling' ? 68 : y > 138 ? 74 : 124;
    pixels.data[i] = base + n - 10; pixels.data[i + 1] = base + n + 2; pixels.data[i + 2] = base + n; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.strokeStyle = kind === 'floor' ? '#1e2b2a' : '#3e504b'; ctx.lineWidth = 2;
  if (kind === 'floor') {
    for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { ctx.fillStyle = `rgba(13,24,24,${Math.random() * .2})`; ctx.fillRect(Math.random() * 256, Math.random() * 256, 18, 3); }
  } else if (kind === 'wall') {
    ctx.fillStyle = '#394b46'; ctx.fillRect(0, 134, 256, 5);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(22,31,27,${Math.random() * .24})`; const x = Math.random() * 256, y = Math.random() * 256; ctx.fillRect(x, y, Math.random() * 7, Math.random() * 35); }
    for (let i = 0; i < 8; i++) { ctx.strokeStyle = 'rgba(24,34,31,.25)'; ctx.beginPath(); const x = Math.random() * 256; ctx.moveTo(x, 0); ctx.lineTo(x + 3, 45); ctx.lineTo(x - 8, 80); ctx.stroke(); }
  } else {
    ctx.strokeStyle = '#3a4846'; ctx.strokeRect(0, 0, 256, 256); ctx.strokeRect(128, 0, 128, 256);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
  if (kind === 'floor') texture.repeat.set(WIDTH / 2, HEIGHT / 2);
  if (kind === 'ceiling') texture.repeat.set(WIDTH / 2, HEIGHT / 2);
  return texture;
}

export class HospitalEngine {
  readonly state: GameState;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, .08, 90);
  private feedCamera = new THREE.PerspectiveCamera(66, 1, .1, 85);
  private settings: Settings;
  private callbacks: Callbacks;
  private container: HTMLElement;
  private observer: ResizeObserver;
  private frameId = 0;
  private disposed = false;
  private paused = true;
  private keys = new Set<string>();
  private touchMove = { x: 0, y: 0 };
  private feed: number | null = null;
  private last = performance.now();
  private total = 0;
  private uiTick = 0;
  private saveTick = 0;
  private footTick = 0;
  private enemyFootTick = 0;
  private pathTick = 0;
  private path: { x: number; z: number }[] = [];
  private patrolIndex = 0;
  private noise = 0;
  private watched = false;
  private danger = 0;
  private shake = 0;
  private hurtTick = 0;
  private eventIndex = 0;
  private flickerUntil = 0;
  private sawHide = false;
  private target: WorldObject | null = null;
  private flashlight: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private enemyGroup = new THREE.Group();
  private enemyArms: THREE.Object3D[] = [];
  private avatarGroup = new THREE.Group();
  private avatarLimbs: { leftArm?: THREE.Object3D; rightArm?: THREE.Object3D; leftLeg?: THREE.Object3D; rightLeg?: THREE.Object3D } = {};
  private cameraMode: CameraMode;
  private cinematicUntil = 0;
  private lastLocation = '';
  private fixedAnchor = new THREE.Vector3();
  private hallucination = 0;
  private fixtures: { light: THREE.PointLight; mesh: THREE.Mesh; base: number }[] = [];
  private lightingPool: THREE.PointLight[] = [];
  private doors: { mesh: THREE.Group; flag: string }[] = [];
  private objectMeshes = new Map<string, THREE.Group>();
  private obstacles: Obstacle[] = [];
  private dust: THREE.Points;
  private glowMaterial = new THREE.MeshStandardMaterial({ color: 0xd1a16b, emissive: 0xa66b32, emissiveIntensity: .7, roughness: .5 });
  private metal = new THREE.MeshStandardMaterial({ color: 0x465654, metalness: .65, roughness: .62 });
  private dark = new THREE.MeshStandardMaterial({ color: 0x263333, metalness: .2, roughness: .85 });
  private pale = new THREE.MeshStandardMaterial({ color: 0x87928b, roughness: .95 });
  private glowDots: THREE.Mesh[] = [];

  constructor(container: HTMLElement, state: GameState, settings: Settings, callbacks: Callbacks) {
    this.container = container; this.state = state; this.settings = settings; this.callbacks = callbacks; this.cameraMode = settings.cameraMode;
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.graphics === 'high', powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement; this.canvas.setAttribute('aria-label', 'Third-person hospital game. Use W A S D to move, V to change camera, and E to interact.');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.graphics === 'high' ? matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25 * settings.brightness;
    this.renderer.shadowMap.enabled = settings.graphics === 'high' && !matchMedia('(pointer: coarse)').matches;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.canvas);
    this.scene.background = new THREE.Color(0x101b1d); this.scene.fog = new THREE.FogExp2(0x101b1d, .028);
    this.scene.add(new THREE.HemisphereLight(0xa6c3c8, 0x25312a, 1.05));
    this.buildHospital();
    this.buildObjects();
    this.batchStaticGeometry();
    for (let i = 0; i < 4; i++) { const light = new THREE.PointLight(0xa9d2d5, 0, 11, 1.7); this.scene.add(light); this.lightingPool.push(light); }
    this.buildEnemy();
    this.buildAvatar();
    this.flashlight = new THREE.SpotLight(0xd6e5dc, 38, 25, Math.PI / 7, .65, 1.25);
    this.flashlight.castShadow = true; this.flashlight.shadow.mapSize.set(1024, 1024); this.flashlight.shadow.bias = -.001;
    this.flashlight.target = this.flashlightTarget;
    this.scene.add(this.flashlight, this.flashlightTarget);
    const dustGeometry = new THREE.BufferGeometry(); const positions = new Float32Array(220 * 3);
    for (let i = 0; i < positions.length; i += 3) { positions[i] = Math.random() * WIDTH * TILE; positions[i + 1] = Math.random() * 3.1; positions[i + 2] = Math.random() * HEIGHT * TILE; }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xb9c9c2, size: .024, transparent: true, opacity: .25, depthWrite: false })); this.scene.add(this.dust);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize();
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.syncWorld(); this.emit(); this.animate(); callbacks.onReady();
  }

  private box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  private sign(text: string, x: number, y: number, z: number, rotation = 0, width = 1.7, color = '#b5c5bc') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#263d3b'; ctx.fillRect(0, 0, 512, 112); ctx.strokeStyle = '#6c8176'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 502, 102);
    ctx.fillStyle = color; ctx.font = '600 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 57, 475);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 112 / 512), new THREE.MeshBasicMaterial({ map: texture })); mesh.position.set(x, y, z); mesh.rotation.y = rotation; this.scene.add(mesh); return mesh;
  }

  private buildHospital() {
    const wallMat = new THREE.MeshStandardMaterial({ map: canvasTexture('wall'), roughness: .96, color: 0x9caeaa });
    const floorMat = new THREE.MeshStandardMaterial({ map: canvasTexture('floor'), metalness: .22, roughness: .43 });
    const ceilingMat = new THREE.MeshStandardMaterial({ map: canvasTexture('ceiling'), roughness: 1 });
    this.box(WIDTH * TILE, .15, HEIGHT * TILE, floorMat, WIDTH * TILE / 2, -.08, HEIGHT * TILE / 2);
    this.box(WIDTH * TILE, .1, HEIGHT * TILE, ceilingMat, WIDTH * TILE / 2, 3.3, HEIGHT * TILE / 2);
    const open = (x: number, z: number) => !!GRID[z]?.[x];
    // Coalescing adjacent wall edges keeps draw calls low on mobile GPUs.
    for (let z = 0; z <= HEIGHT; z++) {
      let start = -1;
      for (let x = 0; x <= WIDTH; x++) {
        const edge = x < WIDTH && open(x, z - 1) !== open(x, z);
        if (edge && start < 0) start = x;
        if (!edge && start >= 0) {
          this.box((x - start) * TILE, 3.3, .14, wallMat, (start + x) * TILE / 2, 1.65, z * TILE);
          this.box((x - start) * TILE, .13, .2, this.dark, (start + x) * TILE / 2, .08, z * TILE); start = -1;
        }
      }
    }
    for (let x = 0; x <= WIDTH; x++) {
      let start = -1;
      for (let z = 0; z <= HEIGHT; z++) {
        const edge = z < HEIGHT && open(x - 1, z) !== open(x, z);
        if (edge && start < 0) start = z;
        if (!edge && start >= 0) {
          this.box(.14, 3.3, (z - start) * TILE, wallMat, x * TILE, 1.65, (start + z) * TILE / 2);
          this.box(.2, .13, (z - start) * TILE, this.dark, x * TILE, .08, (start + z) * TILE / 2); start = -1;
        }
      }
    }
    for (const z of [3, 9, 15, 22, 27]) this.fixture(center(11), center(z), z === 27);
    ROOMS.forEach((r, i) => {
      this.fixture(center(r.x + Math.floor(r.w / 2)), center(r.z + Math.floor(r.h / 2)), i === 5);
      this.sign(r.name, center(r.x + r.w / 2 - .5), 2.45, r.z * TILE + .09, 0, 2.8);
    });
    DOORS.forEach((d, i) => {
      const group = new THREE.Group(); group.position.set(center(d.x), 0, center(d.z));
      if (d.x === 18) group.rotation.y = Math.PI / 2;
      this.box(.16, 3.05, TILE - .05, this.dark, 0, 1.52, 0, group);
      this.box(.18, .5, .65, new THREE.MeshStandardMaterial({ color: 0x394f4d, metalness: .4, roughness: .22 }), 0, 1.9, 0, group);
      this.box(.2, .08, .16, this.glowMaterial, -.02, 1.15, .5, group);
      this.scene.add(group); this.doors.push({ mesh: group, flag: d.flag });
      if (i % 2 === 0) this.sign(d.name, center(d.x) - .12, 2.7, center(d.z), Math.PI / 2, 1.3);
    });
    this.sign('NORTH EXIT', center(11), 2.8, TILE + .1, 0, 2.2, '#dfb090');
    this.sign('ST. MERCY / KEEP QUIET', center(10) - .75, 2.1, center(9), Math.PI / 2, 2);
    this.sign('< SECURITY  /  MAINTENANCE >', center(11), 2.75, center(4.8), Math.PI, 2.5);
    this.sign('< WARD C  /  RECORDS >', center(11), 2.75, center(12.7), Math.PI, 2.5);
    this.sign('< CHAPEL  /  ISOLATION >', center(11), 2.75, center(22), Math.PI, 2.5);
    const wet = new THREE.MeshStandardMaterial({ color: 0x172322, roughness: .12, metalness: .48, transparent: true, opacity: .68 });
    for (const [gx, gz, sx, sz] of [[11.2, 7.5, 1.4, .65], [10.8, 18, .8, 1.7], [17.5, 23.5, 1.2, .7]] as const) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(.62, 22), wet); puddle.scale.set(sx, sz, 1); puddle.rotation.x = -Math.PI / 2; puddle.position.set(center(gx), .012, center(gz)); this.scene.add(puddle);
    }
    const curtain = new THREE.MeshStandardMaterial({ color: 0x506c68, roughness: .93, side: THREE.DoubleSide });
    for (const [gx, gz] of [[2.7, 15.8], [7.8, 13.2], [16.1, 23.1]] as const) {
      this.box(1.25, 1.8, .025, curtain, center(gx), 1.55, center(gz));
      for (let i = -2; i <= 2; i++) this.box(.02, 1.7, .035, this.dark, center(gx) + i * .24, 1.52, center(gz) + .02);
      this.box(1.5, .035, .035, this.metal, center(gx), 2.5, center(gz));
    }
    const glass = new THREE.MeshStandardMaterial({ color: 0x5e7f83, emissive: 0x29494e, emissiveIntensity: .24, roughness: .18, metalness: .1, transparent: true, opacity: .68 });
    for (const gz of [4.2, 15.2, 24.5]) {
      this.box(1.35, 1.25, .04, glass, 22 * TILE - .09, 1.75, center(gz));
      this.box(.04, 1.3, .07, this.metal, 22 * TILE - .12, 1.75, center(gz));
      this.box(1.4, .04, .07, this.metal, 22 * TILE - .12, 1.75, center(gz));
    }
    // Sparse environmental props make routes readable instead of cluttering every tile.
    for (const [gx, gz] of [[2.8, 12.8], [7.5, 15.8], [16, 25.5]]) this.hospitalBed(center(gx), center(gz), false);
    this.hospitalBed(center(10.2), center(21), false);
    const wheelchair = new THREE.Group(); wheelchair.position.set(center(12.1), 0, center(16.5)); wheelchair.rotation.y = -.25; this.scene.add(wheelchair);
    this.box(.7, .12, .68, this.dark, 0, .64, 0, wheelchair); this.box(.7, .65, .1, this.dark, 0, 1, -.3, wheelchair);
    for (const x of [-.42, .42]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(.38, .035, 7, 22), this.metal); wheel.rotation.y = Math.PI / 2; wheel.position.set(x, .4, -.1); wheelchair.add(wheel);
      this.box(.035, .65, .035, this.metal, x, .84, -.3, wheelchair); this.box(.05, .04, .68, this.metal, x, .85, 0, wheelchair); this.box(.26, .04, .3, this.metal, x * .6, .16, .51, wheelchair);
    }
    this.obstacles.push({ x: center(12.1), z: center(16.5), w: .95, d: 1.05 });
    for (const [gx, gz] of [[8, 6.8], [15.3, 14.7], [20.5, 25.8]] as const) {
      const pole = new THREE.Group(); pole.position.set(center(gx), 0, center(gz)); this.scene.add(pole);
      this.box(.035, 2.05, .035, this.metal, 0, 1.05, 0, pole); this.box(.65, .035, .035, this.metal, 0, 2.02, 0, pole);
      for (const x of [-.3, .3]) { const hook = new THREE.Mesh(new THREE.TorusGeometry(.06, .012, 5, 10, Math.PI), this.metal); hook.position.set(x, 1.96, 0); hook.rotation.z = Math.PI; pole.add(hook); }
      const bag = this.box(.25, .42, .06, glass, .3, 1.65, 0, pole); bag.geometry = new THREE.BoxGeometry(.25, .42, .06, 1, 3, 1);
      this.box(.018, .72, .018, glass, .3, 1.18, 0, pole); this.box(.55, .03, .55, this.metal, 0, .04, 0, pole);
    }
    for (const [gx, gz] of [[15.5, 3], [17, 3], [19.5, 3]]) {
      const x = center(gx), z = center(gz); this.box(1.2, 1.8, .45, this.metal, x, .9, z);
      for (let y = .4; y < 1.8; y += .45) this.box(1.3, .04, .52, this.dark, x, y, z - .02);
      this.obstacles.push({ x, z, w: 1.2, d: .45 });
    }
    for (const gz of [12.5, 16.8]) {
      const x = center(15.5), z = center(gz); this.box(1.6, 1.5, .55, this.metal, x, .75, z); this.obstacles.push({ x, z, w: 1.6, d: .55 });
    }
    const chapelCross = new THREE.MeshStandardMaterial({ color: 0x776c50, roughness: .9 });
    this.box(.15, 1.1, .12, chapelCross, center(5), 2.2, 21 * TILE + .13);
    this.box(.65, .13, .12, chapelCross, center(5), 2.45, 21 * TILE + .13);
    for (const gz of [22, 25.5]) this.box(2.8, .45, .5, this.dark, center(5.4), .25, center(gz));
    // The front entrance stays sealed until dawn, but is a visible physical landmark.
    const entrance = new THREE.MeshStandardMaterial({ color: 0x253d3e, metalness: .45, roughness: .35 });
    this.box(3.0, 2.7, .16, entrance, center(11), 1.35, TILE + .15);
    for (const dx of [-.65, .65]) { this.box(.38, .72, .18, this.pale, center(11) + dx, 1.8, TILE + .2); this.box(.08, .4, .22, this.metal, center(11) + dx * .25, 1.1, TILE + .24); }
  }

  private fixture(x: number, z: number, red = false) {
    this.box(1.4, .08, .42, this.dark, x, 3.17, z);
    const material = new THREE.MeshStandardMaterial({ color: red ? 0x653833 : 0xbaccc9, emissive: red ? 0xb3422f : 0xb5dbdd, emissiveIntensity: red ? 1.5 : 2 });
    const mesh = this.box(1.22, .035, .25, material, x, 3.1, z);
    const light = new THREE.PointLight(red ? 0xd86645 : 0xa9d2d5, red ? 12 : 19, 11, 1.7); light.position.set(x, 2.9, z);
    this.fixtures.push({ light, mesh, base: light.intensity });
  }

  private batchStaticGeometry() {
    this.scene.updateMatrixWorld(true);
    const excluded = new Set<THREE.Object3D>([
      ...this.doors.map(d => d.mesh),
      ...this.fixtures.map(f => f.mesh),
      ...OBJECTS.filter(o => o.kind === 'battery' || o.kind === 'medkit').map(o => this.objectMeshes.get(o.id)!),
    ]);
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Mesh[] = [];
    // Static geometry shares a draw call per material; doors and pickups stay independent.
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      let parent: THREE.Object3D | null = object;
      while (parent) { if (excluded.has(parent)) return; parent = parent.parent; }
      const list = groups.get(object.material) ?? [];
      list.push(object.geometry.clone().applyMatrix4(object.matrixWorld)); groups.set(object.material, list); remove.push(object);
    });
    remove.forEach(mesh => { mesh.parent?.remove(mesh); mesh.geometry.dispose(); });
    groups.forEach((geometries, material) => {
      const geometry = mergeGeometries(geometries, false);
      if (geometry) { const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = material instanceof THREE.MeshStandardMaterial; mesh.receiveShadow = true; this.scene.add(mesh); }
      geometries.forEach(g => g.dispose());
    });
  }

  private hospitalBed(x: number, z: number, interactive: boolean, parent: THREE.Object3D = this.scene) {
    const group = new THREE.Group(); group.position.set(x, 0, z); parent.add(group);
    this.box(1.05, .16, 2.1, this.metal, 0, .56, 0, group);
    this.box(.96, .17, 1.95, this.pale, 0, .71, 0, group);
    this.box(.65, .12, .36, this.pale, 0, .83, -.7, group);
    for (const dx of [-.45, .45]) for (const dz of [-.9, .9]) { this.box(.045, .55, .045, this.metal, dx, .3, dz, group); this.box(.1, .09, .15, this.dark, dx, .07, dz, group); }
    for (const dz of [-1, 1]) this.box(1.04, .48, .035, this.metal, 0, .9, dz, group);
    if (interactive) this.box(.14, .06, .13, this.glowMaterial, .2, .18, .45, group);
    this.obstacles.push({ x, z, w: 1.05, d: 2.1 }); return group;
  }

  private buildObjects() {
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x294a42, emissive: 0x6fa59a, emissiveIntensity: .7, roughness: .2 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xc5c3a6, roughness: 1 });
    OBJECTS.forEach(o => {
      const group = new THREE.Group(); group.position.set(o.x, 0, o.z); this.scene.add(group); this.objectMeshes.set(o.id, group);
      switch (o.kind) {
        case 'desk':
          this.box(1.6, .12, .8, this.dark, 0, .91, 0, group);
          for (const dx of [-.65, .65]) this.box(.08, .9, .65, this.metal, dx, .45, 0, group);
          this.box(.48, .02, .38, paper, -.2, 1, -.04, group); this.box(.23, .19, .14, this.metal, .43, 1.06, 0, group);
          this.obstacles.push({ x: o.x, z: o.z, w: 1.6, d: .8 }); break;
        case 'generator':
          this.box(1.15, 1.7, .65, this.metal, 0, .85, 0, group); this.box(.65, .35, .07, screenMat, 0, 1.3, .35, group);
          for (let i = 0; i < 4; i++) this.box(.7, .025, .05, this.dark, 0, .4 + i * .12, .35, group);
          this.obstacles.push({ x: o.x, z: o.z, w: 1.15, d: .65 }); break;
        case 'monitor':
          this.box(2.1, .1, 1, this.dark, 0, .83, 0, group);
          for (const dx of [-.75, .75]) this.box(.09, .8, .7, this.metal, dx, .4, 0, group);
          for (const dx of [-.48, .48]) { this.box(.8, .62, .45, this.dark, dx, 1.21, -.13, group); this.box(.65, .46, .02, screenMat, dx, 1.24, .11, group); }
          this.box(.75, .04, .25, this.metal, 0, .92, .3, group); this.obstacles.push({ x: o.x, z: o.z, w: 2.1, d: 1 }); break;
        case 'bed': this.hospitalBed(0, 0, true, group); this.obstacles.pop(); this.obstacles.push({ x: o.x, z: o.z, w: 1.05, d: 2.1 }); break;
        case 'file':
          this.box(1.4, .9, .75, this.metal, 0, .45, 0, group); this.box(.5, .045, .4, paper, 0, .94, .08, group);
          this.box(.16, .18, .1, this.glowMaterial, .47, 1.02, .15, group); this.obstacles.push({ x: o.x, z: o.z, w: 1.4, d: .75 }); break;
        case 'patient':
          this.hospitalBed(0, 0, false, group); this.obstacles.pop(); this.obstacles.push({ x: o.x, z: o.z, w: 1.05, d: 2.1 });
          this.box(.57, .21, 1.18, this.dark, 0, .93, .05, group);
          { const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), this.pale); head.position.set(0, .99, -.65); group.add(head); }
          this.box(.4, .8, .35, this.metal, 1.0, .8, -.4, group); this.box(.28, .23, .02, screenMat, 1, 1, -.21, group); break;
        case 'tape':
          this.box(.85, .65, .65, this.dark, 0, .32, 0, group); this.box(.36, .08, .22, this.metal, 0, .72, .06, group);
          this.box(.12, .03, .03, this.glowMaterial, .12, .77, .17, group); break;
        case 'safe':
          this.box(.75, .85, .6, this.metal, 0, .45, 0, group); this.box(.61, .68, .04, this.dark, 0, .45, .33, group); this.box(.15, .2, .06, this.glowMaterial, .15, .45, .36, group); break;
        case 'locker':
          this.box(.9, 2.2, .7, this.metal, 0, 1.1, 0, group); this.box(.82, 2.1, .025, this.dark, 0, 1.1, .37, group);
          for (let i = 0; i < 4; i++) this.box(.4, .018, .035, this.metal, 0, 1.7 + i * .07, .4, group);
          this.box(.045, .2, .07, this.pale, .26, 1, .42, group); this.obstacles.push({ x: o.x, z: o.z, w: .9, d: .7 }); break;
        case 'battery':
          this.box(.3, .55, .3, this.dark, 0, .28, 0, group); this.box(.24, .13, .24, this.glowMaterial, 0, .62, 0, group); break;
        case 'medkit':
          this.box(.45, .32, .2, paper, 0, .3, 0, group); this.box(.05, .16, .025, this.glowMaterial, 0, .3, .12, group); this.box(.16, .05, .025, this.glowMaterial, 0, .3, .12, group); break;
        case 'exit': break;
      }
      if (o.kind !== 'locker' && o.kind !== 'exit') {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.025, 7, 5), this.glowMaterial); dot.position.set(0, o.kind === 'generator' ? 1.55 : o.kind === 'monitor' ? 1.65 : 1.12, 0); group.add(dot); this.glowDots.push(dot);
      }
    });
  }

  private buildEnemy() {
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3c4d46, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xa5aca0, roughness: .8 });
    const gown = new THREE.Mesh(new THREE.CylinderGeometry(.23, .38, 1.15, 9), cloth); gown.position.y = 1.1; this.enemyGroup.add(gown);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.185, 14, 12), skin); head.scale.set(.8, 1.23, .9); head.position.set(0, 1.92, .04); head.rotation.z = -.16; this.enemyGroup.add(head);
    const face = new THREE.MeshStandardMaterial({ color: 0x101b18, roughness: .9 });
    for (const x of [-.065, .065]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.034, 8, 6), face); eye.position.set(x, 1.95, .18); this.enemyGroup.add(eye); }
    for (const x of [-.33, .33]) { const arm = this.box(.09, 1.15, .1, skin, x, 1.02, .03, this.enemyGroup); arm.rotation.z = x < 0 ? -.08 : .08; this.enemyArms.push(arm); }
    for (const x of [-.13, .13]) this.box(.12, .6, .13, cloth, x, .34, 0, this.enemyGroup);
    this.enemyGroup.traverse(obj => { if (obj instanceof THREE.Mesh) obj.castShadow = true; });
    this.scene.add(this.enemyGroup);
  }

  private buildAvatar() {
    const palettes = {
      guard: { cloth: 0x263b43, accent: 0xc8a268, skin: 0x9a7058, name: 'NIGHT SECURITY' },
      paramedic: { cloth: 0x314b47, accent: 0xd9ddd0, skin: 0x76503d, name: 'EMERGENCY MEDICAL' },
      investigator: { cloth: 0x34333b, accent: 0x8e3730, skin: 0xb18468, name: 'PRIVATE INVESTIGATOR' },
    } as const;
    const palette = palettes[this.settings.avatar];
    const cloth = new THREE.MeshStandardMaterial({ color: palette.cloth, roughness: .78, metalness: .08 });
    const accent = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: .62, emissive: palette.accent, emissiveIntensity: .03 });
    const skin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: .88 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x151b1c, roughness: .7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .48, 5, 10), cloth); torso.position.set(0, 1.26, 0); this.avatarGroup.add(torso);
    this.box(.5, .07, .3, accent, 0, 1.39, .01, this.avatarGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 16, 12), skin); head.scale.set(.88, 1.08, .92); head.position.set(0, 1.83, 0); this.avatarGroup.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.194, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), boot); hair.position.set(0, 1.88, -.01); this.avatarGroup.add(hair);
    for (const [side, x] of [['left', -.34], ['right', .34]] as const) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .48, 4, 8), cloth); arm.position.set(x, 1.28, 0); this.avatarGroup.add(arm); this.avatarLimbs[`${side}Arm`] = arm;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), skin); hand.position.set(x, .91, 0); this.avatarGroup.add(hand);
    }
    for (const [side, x] of [['left', -.14], ['right', .14]] as const) {
      const leg = this.box(.18, .68, .2, cloth, x, .57, 0, this.avatarGroup); this.avatarLimbs[`${side}Leg`] = leg;
      this.box(.2, .16, .34, boot, x, .15, -.07, this.avatarGroup);
    }
    if (this.settings.avatar === 'guard') { this.box(.19, .25, .06, accent, .19, 1.38, .19, this.avatarGroup); this.box(.18, .12, .12, boot, -.25, .98, 0, this.avatarGroup); }
    if (this.settings.avatar === 'paramedic') { this.box(.16, .16, .035, accent, 0, 1.28, .18, this.avatarGroup); this.box(.05, .16, .04, new THREE.MeshStandardMaterial({ color: 0xa9443b }), 0, 1.28, .205, this.avatarGroup); }
    if (this.settings.avatar === 'investigator') { this.box(.62, .1, .34, cloth, 0, 1.6, 0, this.avatarGroup); this.box(.52, .06, .3, accent, 0, .98, 0, this.avatarGroup); }
    this.avatarGroup.traverse(obj => { obj.userData.avatarName = palette.name; if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    this.scene.add(this.avatarGroup);
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = this.feedCamera.aspect = w / h; this.camera.updateProjectionMatrix(); this.feedCamera.updateProjectionMatrix();
  }
  private onContextLost = (event: Event) => { event.preventDefault(); this.setPaused(true); this.callbacks.onError('The graphics context was interrupted. Your checkpoint is safe. Return to the menu and continue.'); };

  updateSettings(settings: Settings) {
    const avatarChanged = this.settings.avatar !== settings.avatar;
    this.settings = settings; this.cameraMode = settings.cameraMode; this.renderer.toneMappingExposure = 1.25 * settings.brightness;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.graphics === 'high' ? matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5 : 1));
    this.renderer.shadowMap.enabled = settings.graphics === 'high' && !matchMedia('(pointer: coarse)').matches;
    this.dust.visible = settings.graphics === 'high'; this.resize();
    if (avatarChanged) { this.scene.remove(this.avatarGroup); this.avatarGroup = new THREE.Group(); this.avatarLimbs = {}; this.buildAvatar(); }
  }
  setPaused(paused: boolean) { this.paused = paused; if (paused) { this.keys.clear(); this.touchMove = { x: 0, y: 0 }; } this.last = performance.now(); }
  setKey(code: string, down: boolean) { if (down) this.keys.add(code); else this.keys.delete(code); }
  setTouchMove(x: number, y: number) { this.touchMove = { x, y }; }
  look(dx: number, dy: number) {
    if (this.paused || this.state.player.hidden && Math.abs(dx) > 200) return;
    this.state.player.yaw -= dx * .002 * this.settings.sensitivity;
    this.state.player.pitch = THREE.MathUtils.clamp(this.state.player.pitch - dy * .002 * this.settings.sensitivity, -1.15, 1.15);
  }
  cycleCamera() {
    const modes: CameraMode[] = ['third', 'shoulder', 'first'];
    this.cameraMode = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length];
    this.callbacks.onCameraMode(this.cameraMode);
    this.callbacks.onMessage(localizeMessage(this.settings.language, `CAMERA / ${this.cameraMode.toUpperCase()} VIEW`)); this.emit();
  }
  toggleFlashlight() {
    if (this.state.player.hidden) { this.callbacks.onMessage('Keep the light off while you hide.'); return; }
    if (this.state.player.battery <= 0) { this.callbacks.onMessage('The flashlight is empty. Press B to replace the battery.'); return; }
    this.state.player.flashlight = !this.state.player.flashlight; audio.click(); this.emit();
  }
  toggleCrouch() { this.state.player.crouched = !this.state.player.crouched; this.emit(); }
  setFeed(feed: number | null) {
    this.feed = feed;
    if (feed === null) return;
    const positions = [[11, 2, 11, 20], [3, 12, 6, 16], [14.5, 12, 19, 16], [15, 21, 18, 25]];
    const p = positions[feed]; this.feedCamera.position.set(center(p[0]), 2.85, center(p[1])); this.feedCamera.lookAt(center(p[2]), 1.1, center(p[3]));
  }

  perform(id: string, value = '') {
    const result = resolveAction(this.state, id, value);
    if (result.ok) audio.success(); else audio.error();
    if (result.noise) this.emitNoise(result.noise, this.state.player.x, this.state.player.z);
    const saveFailed = result.checkpoint && !saveGame(this.state);
    const message = saveFailed ? `${result.message} Browser storage is unavailable; this checkpoint could not be saved.` : result.message;
    this.callbacks.onMessage(localizeMessage(this.settings.language, message)); this.syncWorld(); this.emit();
    if (result.ending) this.finish();
    return result;
  }

  save() { const saved = saveGame(this.state); this.callbacks.onMessage(saved ? 'CHECKPOINT SAVED / You can continue this shift from the main menu.' : 'Could not save. Browser storage may be full or disabled.'); return saved; }

  interact() {
    if (this.state.player.hidden) { this.toggleHide(); return; }
    const target = this.findTarget();
    if (!target) { this.callbacks.onMessage('Move closer to an object. A small amber light marks usable equipment.'); return; }
    if (target.id.startsWith('door-')) { this.callbacks.onMessage(target.label); audio.click(); return; }
    if (target.kind === 'locker') { this.toggleHide(); return; }
    if (target.kind === 'battery' || target.kind === 'medkit') { this.perform(target.id); return; }
    this.callbacks.onInteract(target);
  }

  toggleHide() {
    const p = this.state.player;
    if (p.hidden) { p.hidden = false; p.flashlight = p.battery > 0; audio.click(); this.callbacks.onMessage('You step out of the locker.'); this.emit(); return; }
    const locker = OBJECTS.filter(o => o.kind === 'locker').find(o => Math.hypot(o.x - p.x, o.z - p.z) < 2.5 && lineOfSight(p.x, p.z, o.x, o.z, this.state));
    if (!locker) { this.callbacks.onMessage('Find a tall metal locker before hiding.'); return; }
    this.sawHide = this.state.enemy.mode === 'chasing' && lineOfSight(this.state.enemy.x, this.state.enemy.z, p.x, p.z, this.state) && Math.hypot(this.state.enemy.x - p.x, this.state.enemy.z - p.z) < 10;
    if (this.sawHide && !this.state.enemy.memory.hideSpots.includes(locker.id)) this.state.enemy.memory.hideSpots.push(locker.id);
    p.hidden = true; p.flashlight = false; audio.click(); this.callbacks.onMessage(this.sawHide ? 'IT SAW YOU HIDE / Get out and find another route.' : 'HIDDEN / Stay quiet. Press E or H to leave.'); this.emit();
  }

  distract() {
    if (this.state.distractions <= 0) { this.callbacks.onMessage('Your pockets are empty. No distractions left.'); return; }
    if (this.state.player.hidden) { this.callbacks.onMessage('Leave the locker before throwing a distraction.'); return; }
    this.state.distractions--;
    const p = this.state.player;
    let x = p.x, z = p.z;
    for (let d = .5; d < 10; d += .5) { const nx = p.x - Math.sin(p.yaw) * d, nz = p.z - Math.cos(p.yaw) * d; if (!isWalkable(nx, nz, this.state)) break; x = nx; z = nz; }
    this.emitNoise(28, x, z); audio.step(true, .7, .8); this.callbacks.onMessage('METAL CLATTERS / Something turns toward the sound.');
    const ring = new THREE.Mesh(new THREE.RingGeometry(.08, .13, 20), new THREE.MeshBasicMaterial({ color: 0xd7ac78, transparent: true, opacity: .7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, .03, z); this.scene.add(ring);
    const start = performance.now();
    const ripple = () => { if (this.disposed) return; const progress = (performance.now() - start) / 900; ring.scale.setScalar(1 + progress * 12); (ring.material as THREE.MeshBasicMaterial).opacity = .7 * (1 - progress); if (progress < 1) requestAnimationFrame(ripple); else { this.scene.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); } }; ripple(); this.emit();
  }

  private emitNoise(radius: number, x: number, z: number) {
    if (has(this.state, 'quiet-wing') && getLocation(x, z) === 'Isolation') radius *= .55;
    radius *= 1 + Math.min(1, this.state.elapsed / NIGHT_SECONDS) * .25;
    this.noise = Math.min(1, radius / 25);
    const e = this.state.enemy;
    if (this.state.mission >= 3 && Math.hypot(e.x - x, e.z - z) < radius && e.mode !== 'chasing') { e.mode = 'investigating'; e.targetX = x; e.targetZ = z; e.timer = 0; this.pathTick = 1; }
  }

  private findTarget(): WorldObject | null {
    const p = this.state.player;
    let nearest: WorldObject | null = null, best = 3.15;
    for (const o of OBJECTS) {
      if (this.state.collected.includes(o.id)) continue;
      const distance = Math.hypot(o.x - p.x, o.z - p.z);
      const dot = (-Math.sin(p.yaw) * (o.x - p.x) - Math.cos(p.yaw) * (o.z - p.z)) / Math.max(.01, distance);
      if (distance < best && dot > -.15 && lineOfSight(p.x, p.z, o.x, o.z, this.state)) { nearest = o; best = distance; }
    }
    if (!nearest) {
      DOORS.forEach((d, i) => { const distance = Math.hypot(center(d.x) - p.x, center(d.z) - p.z); if (!has(this.state, d.flag) && distance < 2.6) nearest = { id: `door-${i}`, label: d.flag === 'staff-key' ? 'Locked / Take the staff key from the shift manifest.' : d.flag === 'records-key' ? 'Locked / Find the records key in Ward C.' : 'Sealed / Recover the patient file from Records.', kind: 'file', x: center(d.x), z: center(d.z), room: getLocation(p.x, p.z) }; });
    }
    return nearest;
  }

  private canMove(x: number, z: number) {
    const r = .25;
    if (![[r, r], [-r, r], [r, -r], [-r, -r]].every(([dx, dz]) => isWalkable(x + dx, z + dz, this.state))) return false;
    return !this.obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + r && Math.abs(z - o.z) < o.d / 2 + r);
  }

  private updatePlayer(dt: number) {
    const p = this.state.player;
    let forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - this.touchMove.y;
    let strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) + this.touchMove.x;
    if (this.keys.has('ArrowLeft')) p.yaw += dt * 1.7;
    if (this.keys.has('ArrowRight')) p.yaw -= dt * 1.7;
    const magnitude = Math.hypot(forward, strafe); if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
    const moving = magnitude > .08 && !p.hidden;
    const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('TouchSprint')) && p.stamina > 4 && !p.crouched && moving;
    const speed = p.crouched ? 1.25 : sprint ? 4.7 : 2.7;
    p.stamina = THREE.MathUtils.clamp(p.stamina + (sprint ? -23 : 16) * dt, 0, 100);
    if (moving) {
      const dx = (-Math.sin(p.yaw) * forward + Math.cos(p.yaw) * strafe) * speed * dt;
      const dz = (-Math.cos(p.yaw) * forward - Math.sin(p.yaw) * strafe) * speed * dt;
      if (this.canMove(p.x + dx, p.z)) p.x += dx;
      if (this.canMove(p.x, p.z + dz)) p.z += dz;
      p.heading = Math.atan2(dx, dz);
      const cell = `${Math.floor(p.x / TILE)}:${Math.floor(p.z / TILE)}`;
      this.state.enemy.memory.routeHeat[cell] = (this.state.enemy.memory.routeHeat[cell] ?? 0) + dt;
      this.footTick += dt;
      if (this.footTick > (sprint ? .3 : p.crouched ? .85 : .49)) {
        this.footTick = 0; audio.step(false, 0, p.crouched ? .25 : sprint ? 1 : .5);
        if (!p.crouched) this.emitNoise(sprint ? 19 : 6, p.x, p.z);
      }
    }
    if (p.flashlight) p.battery = Math.max(0, p.battery - dt * (this.watched ? .34 : .15));
    if (p.flashlight && this.watched) this.state.enemy.memory.flashlightUses += dt;
    if (p.battery <= 0) p.flashlight = false;
    if (this.hurtTick > 15 && this.danger < .2 && p.health < 75) p.health = Math.min(75, p.health + dt * .55);
    const sanityDrain = this.danger > .35 ? 4.2 * this.danger : !p.flashlight ? .18 : -.42;
    p.sanity = THREE.MathUtils.clamp(p.sanity - sanityDrain * dt, 0, 100);
    const stride = moving ? Math.sin(this.total * (sprint ? 12 : 8)) : 0;
    this.avatarGroup.position.set(p.x, 0, p.z); this.avatarGroup.rotation.y = p.heading;
    this.avatarGroup.scale.y = p.crouched ? .72 : 1;
    if (!this.settings.reducedMotion) {
      if (this.avatarLimbs.leftArm) this.avatarLimbs.leftArm.rotation.x = stride * .55;
      if (this.avatarLimbs.rightArm) this.avatarLimbs.rightArm.rotation.x = -stride * .55;
      if (this.avatarLimbs.leftLeg) this.avatarLimbs.leftLeg.rotation.x = -stride * .48;
      if (this.avatarLimbs.rightLeg) this.avatarLimbs.rightLeg.rotation.x = stride * .48;
    }
    this.avatarGroup.visible = !p.hidden && this.cameraMode !== 'first';
  }

  private updateEnemy(dt: number) {
    const s = this.state, e = s.enemy, p = s.player;
    if (s.mission < 3) { e.mode = 'dormant'; this.watched = false; return; }
    const distance = Math.hypot(p.x - e.x, p.z - e.z);
    const sight = lineOfSight(p.x, p.z, e.x, e.z, s);
    const facing = (-Math.sin(p.yaw) * (e.x - p.x) - Math.cos(p.yaw) * (e.z - p.z)) / Math.max(.01, distance);
    this.watched = !p.hidden && p.flashlight && p.battery > 0 && sight && facing > .65 && Math.abs(p.pitch) < .7 && distance < 18;
    const night = Math.min(1, s.elapsed / NIGHT_SECONDS);
    const visible = sight && distance < (p.flashlight ? 12 + night * 2 : 5 + night) && (!p.hidden || this.sawHide);
    const previousMode = e.mode;
    if (visible) { e.mode = 'chasing'; e.targetX = p.x; e.targetZ = p.z; e.timer = 0; }
    else if (e.mode === 'chasing') { e.timer += dt; if (e.timer > 2.2) { e.mode = 'searching'; e.timer = 0; this.sawHide = false; } }
    if (previousMode !== 'chasing' && e.mode === 'chasing') { audio.danger(); this.callbacks.onMessage('Do not look away. Keep the light on it.'); }
    const hottest = Object.entries(e.memory.routeHeat).sort((a, b) => b[1] - a[1])[0]?.[0]?.split(':').map(Number);
    const patrol = hottest && hottest.length === 2 ? [[hottest[0], hottest[1]], [11, 24], [11, 8], [5, 14]] : [[11, 14], [11, 24], [11, 8], [5, 14]];
    if (e.mode === 'searching') {
      e.timer += dt;
      const remembered = OBJECTS.find(o => o.id === e.memory.hideSpots[e.memory.hideSpots.length - 1]);
      if (remembered && e.timer > 1.2) { e.targetX = remembered.x; e.targetZ = remembered.z; }
      if (remembered && p.hidden && Math.hypot(p.x - remembered.x, p.z - remembered.z) < 2.6 && Math.hypot(e.x - remembered.x, e.z - remembered.z) < 1.2) {
        this.sawHide = true; e.mode = 'chasing'; this.callbacks.onMessage(localizeMessage(this.settings.language, 'It remembered this hiding place. Run.'));
      } else if (e.timer > 7) { e.mode = 'returning'; e.timer = 0; }
    }
    if (e.mode === 'patrolling' || e.mode === 'returning') { const point = patrol[this.patrolIndex % patrol.length]; e.targetX = center(point[0]); e.targetZ = center(point[1]); }
    const targetDistance = Math.hypot(e.targetX - e.x, e.targetZ - e.z);
    if (targetDistance < .65) {
      if (e.mode === 'patrolling' || e.mode === 'returning') { this.patrolIndex++; e.mode = 'patrolling'; this.pathTick = 1; }
      else if (e.mode === 'investigating') { e.mode = 'searching'; e.timer = 0; }
    }
    this.pathTick += dt;
    if (this.pathTick > .65 || previousMode !== e.mode) { this.path = findPath(e.x, e.z, e.targetX, e.targetZ, s); this.pathTick = 0; }
    if (!this.watched && e.mode !== 'dormant') {
      let point = this.path[0];
      if (e.mode === 'chasing' && sight) point = { x: e.targetX, z: e.targetZ };
      if (point) {
        const dx = point.x - e.x, dz = point.z - e.z, d = Math.hypot(dx, dz);
        const learned = Math.min(.22, e.memory.flashlightUses / 300);
        const speed = e.mode === 'chasing' ? 1.9 + night * .4 + learned + (has(s, 'gave-name') ? .25 : 0) : e.mode === 'investigating' ? 1.45 + night * .4 : 1.05 + night * .35;
        if (d > .08) {
          const step = Math.min(d, speed * dt); const nx = e.x + dx / d * step, nz = e.z + dz / d * step;
          if (isWalkable(nx, e.z, s)) e.x = nx; if (isWalkable(e.x, nz, s)) e.z = nz;
          this.enemyGroup.rotation.y = Math.atan2(dx, dz);
        }
        if (d < .25) this.path.shift();
      }
      this.enemyFootTick += dt;
      if (this.enemyFootTick > (e.mode === 'chasing' ? .42 : .8) && distance < 20) {
        this.enemyFootTick = 0; const relative = Math.sin(Math.atan2(e.x - p.x, e.z - p.z) + p.yaw); audio.step(true, relative, Math.max(.05, 1 - distance / 20));
      }
      if (distance < 1.3 && e.mode === 'chasing' && (!p.hidden || this.sawHide)) {
        p.health = Math.max(0, p.health - dt * 26); this.shake = .06; this.hurtTick = 0;
        if (p.health <= 0) { s.ending = 'trapped'; this.finish(); }
      }
    }
    this.danger = Math.max(0, (1 - distance / 16) * (e.mode === 'chasing' ? 1 : .55));
  }

  private updateEnvironment(dt: number) {
    const s = this.state;
    const events = [48, 107, 182, 264, 351, 429];
    if (this.eventIndex < events.length && s.elapsed > events[this.eventIndex]) {
      this.eventIndex++; this.flickerUntil = this.total + 2.2; audio.impact();
      const messages = ['A door closes somewhere upstairs.', 'RADIO / "The thing in the corridor is not a patient."', 'For a moment, every clock ticks at once.', 'RADIO / "It knows the sound of running."', 'A woman hums on a frequency that should be empty.', 'RADIO / "When the doors open, do not follow my voice."'];
      const message = messages[this.eventIndex - 1];
      if (message.startsWith('RADIO / ')) audio.speak(message.slice(8).replace(/"/g, ''));
      if (this.settings.subtitles) this.callbacks.onMessage(message);
    }
    const powered = has(s, 'power');
    this.fixtures.forEach((f, i) => {
      const flickering = !this.settings.reducedMotion && (this.total < this.flickerUntil || (i === 2 && Math.sin(this.total * 1.3) > .94));
      const multiplier = flickering && Math.sin(this.total * 37 + i) > -.2 ? .05 : powered ? 1 : .27;
      f.light.intensity = f.base * multiplier; (f.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = multiplier * 1.8;
    });
    const view = this.feed === null ? new THREE.Vector3(s.player.x, 1.6, s.player.z) : this.feedCamera.position;
    const nearby = [...this.fixtures].sort((a, b) => a.light.position.distanceToSquared(view) - b.light.position.distanceToSquared(view)).slice(0, 4);
    this.lightingPool.forEach((light, i) => { const fixture = nearby[i]; light.position.copy(fixture.light.position); light.color.copy(fixture.light.color); light.intensity = fixture.light.intensity; });
    this.doors.forEach(d => { const targetY = has(s, d.flag) ? 3.2 : 0; d.mesh.position.y = THREE.MathUtils.lerp(d.mesh.position.y, targetY, Math.min(1, dt * 4)); });
    this.glowMaterial.emissiveIntensity = .5 + Math.sin(this.total * 2) * .2;
    this.dust.position.y = Math.sin(this.total * .12) * .09;
    const player = s.player;
    const shake = this.settings.reducedMotion ? 0 : this.shake;
    const location = getLocation(player.x, player.z);
    if (!this.lastLocation) this.lastLocation = location;
    if (location !== this.lastLocation) {
      this.lastLocation = location;
      if (this.settings.cinematicCameras && location !== 'North corridor' && location !== 'Central corridor' && location !== 'South corridor') {
        this.cinematicUntil = this.total + 1.45;
        this.fixedAnchor.set(player.x + Math.cos(player.yaw) * 4.6, 2.7, player.z - Math.sin(player.yaw) * 4.6);
      }
    }
    const fixed = this.total < this.cinematicUntil && !this.settings.reducedMotion;
    const targetHeight = player.crouched ? .95 : 1.28;
    const target = new THREE.Vector3(player.x, targetHeight, player.z);
    if (fixed) {
      this.camera.position.lerp(this.fixedAnchor, Math.min(1, dt * 6)); this.camera.lookAt(target);
    } else if (this.cameraMode === 'first') {
      this.camera.position.set(player.x, player.crouched ? 1.05 : 1.62, player.z);
      this.camera.rotation.set(player.pitch + (Math.random() - .5) * shake, player.yaw + (Math.random() - .5) * shake, 0, 'YXZ');
    } else {
      const distance = this.cameraMode === 'shoulder' ? 2.25 : 4.15;
      const side = this.cameraMode === 'shoulder' ? .7 : 0;
      const desired = new THREE.Vector3(player.x + Math.sin(player.yaw) * distance + Math.cos(player.yaw) * side, targetHeight + (this.cameraMode === 'shoulder' ? .48 : 1.05), player.z + Math.cos(player.yaw) * distance - Math.sin(player.yaw) * side);
      let safe = target.clone();
      for (let i = 1; i <= 16; i++) { const point = target.clone().lerp(desired, i / 16); if (!isWalkable(point.x, point.z, s)) break; safe.copy(point); }
      this.camera.position.lerp(safe, Math.min(1, dt * 12)); this.camera.lookAt(target.clone().add(new THREE.Vector3(-Math.sin(player.yaw) * 2, player.pitch * 2.2, -Math.cos(player.yaw) * 2)));
    }
    this.shake *= .9;
    this.flashlight.position.set(player.x + Math.cos(player.heading) * .28, player.crouched ? 1.05 : 1.38, player.z - Math.sin(player.heading) * .28);
    const direction = new THREE.Vector3(-Math.sin(player.yaw), Math.sin(player.pitch), -Math.cos(player.yaw)).normalize(); this.flashlightTarget.position.copy(this.flashlight.position).addScaledVector(direction, 10);
    this.flashlight.intensity = player.flashlight && !player.hidden ? 38 * (player.battery < 12 ? .5 + Math.sin(this.total * 24) * .25 : 1) : 0;
    this.enemyGroup.position.set(s.enemy.x, this.watched || this.settings.reducedMotion ? 0 : Math.sin(this.total * 3.2) * .025, s.enemy.z);
    if (!this.watched) this.enemyArms.forEach((arm, i) => { arm.rotation.x = Math.sin(this.total * 4 + i * Math.PI) * .15; });
    this.hallucination = Math.max(0, (45 - player.sanity) / 45);
    this.scene.fog = new THREE.FogExp2(player.sanity < 45 ? 0x152024 : 0x101b1d, .028 + this.hallucination * .012);
    if (player.sanity < 24 && !this.watched && Math.sin(this.total * 2.7) > .985) {
      this.enemyGroup.position.x += Math.sin(this.total * 31) * .14;
      this.enemyGroup.position.z += Math.cos(this.total * 29) * .14;
    }
  }

  private syncWorld() { this.objectMeshes.forEach((mesh, id) => { mesh.visible = !this.state.collected.includes(id); }); }
  private emit() {
    this.target = this.findTarget();
    this.callbacks.onSnapshot({ state: { ...this.state, player: { ...this.state.player }, enemy: { ...this.state.enemy, memory: { ...this.state.enemy.memory, hideSpots: [...this.state.enemy.memory.hideSpots], routeHeat: { ...this.state.enemy.memory.routeHeat } } }, flags: [...this.state.flags], documents: [...this.state.documents], inventory: [...this.state.inventory], words: [...this.state.words], collected: [...this.state.collected] }, target: this.target, location: getLocation(this.state.player.x, this.state.player.z), watched: this.watched, danger: this.danger, noise: this.noise, cameraMode: this.total < this.cinematicUntil ? 'fixed' : this.cameraMode, hallucination: this.hallucination });
  }
  refresh() { this.syncWorld(); this.emit(); }
  private finish() { this.setPaused(true); audio.stopSpeech(); this.emit(); this.callbacks.onEnd({ ...this.state, player: { ...this.state.player } }); }

  private animate = () => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now(), wallDt = Math.max(0, (now - this.last) / 1000), dt = Math.min(wallDt, .5); this.last = now; this.total += dt;
    if (!this.paused && !this.state.ending) {
      const before = this.state.elapsed;
      // The night follows real time even when rendering slows; physics uses safe substeps.
      this.state.elapsed = Math.min(NIGHT_SECONDS + 180, this.state.elapsed + wallDt); this.hurtTick += dt;
      let remaining = dt;
      while (remaining > 0 && !this.state.ending) { const step = Math.min(.05, remaining); this.updatePlayer(step); this.updateEnemy(step); remaining -= step; }
      this.noise = Math.max(0, this.noise - dt * .5);
      if (before < NIGHT_SECONDS && this.state.elapsed >= NIGHT_SECONDS) { audio.success(); this.callbacks.onMessage('6:00 AM / THE NORTH EXIT IS OPEN. Leave. Do not follow the voice.'); this.save(); }
      this.saveTick += dt; if (this.saveTick > 40 && this.danger < .4 && !this.state.player.hidden) { saveGame(this.state); this.saveTick = 0; }
      this.uiTick += dt; if (this.uiTick > .1) { this.uiTick = 0; this.emit(); }
    }
    this.updateEnvironment(dt);
    this.renderer.render(this.scene, this.feed === null ? this.camera : this.feedCamera);
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frameId); this.observer.disconnect(); this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(obj => { if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) { geometries.add(obj.geometry); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach((mat: THREE.Material) => { materials.add(mat); Object.values(mat).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }); }); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.renderer.dispose(); this.canvas.remove();
  }
}