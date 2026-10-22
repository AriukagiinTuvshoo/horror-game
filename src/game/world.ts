import type { GameState, WorldObject } from './types';

export const TILE = 1.7;
export const WIDTH = 25;
export const HEIGHT = 31;
export const NIGHT_SECONDS = 480;
export const center = (n: number) => (n + 0.5) * TILE;

export const ROOMS = [
  { name: 'SECURITY', short: 'Security', x: 3, z: 2, w: 6, h: 7 },
  { name: 'MAINTENANCE', short: 'Maintenance', x: 15, z: 2, w: 7, h: 7 },
  { name: 'WARD C', short: 'Ward C', x: 2, z: 12, w: 7, h: 7 },
  { name: 'RECORDS', short: 'Records', x: 14, z: 12, w: 8, h: 7 },
  { name: 'CHAPEL', short: 'Chapel', x: 2, z: 21, w: 7, h: 7 },
  { name: 'ISOLATION', short: 'Isolation', x: 15, z: 21, w: 7, h: 7 },
];

export const GRID: number[][] = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
function carve(x: number, z: number, w: number, h: number) {
  for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) GRID[j][i] = 1;
}
carve(10, 1, 3, 28);
carve(2, 10, 21, 1);
ROOMS.forEach(r => carve(r.x, r.z, r.w, r.h));
carve(9, 5, 1, 1);
carve(13, 5, 2, 1);
carve(9, 14, 1, 1);
carve(13, 14, 1, 1);
carve(9, 24, 1, 1);
carve(13, 24, 2, 1);
carve(5, 9, 1, 3);
carve(18, 9, 1, 3);
carve(5, 19, 1, 2);
carve(18, 19, 1, 2);

export const DOORS = [
  { x: 14, z: 5, flag: 'staff-key', name: 'STAFF ONLY' },
  { x: 18, z: 9, flag: 'staff-key', name: 'MAINTENANCE' },
  { x: 13, z: 14, flag: 'records-key', name: 'RECORDS / LOCKED' },
  { x: 18, z: 11, flag: 'records-key', name: 'RECORDS / LOCKED' },
  { x: 14, z: 24, flag: 'patient-file', name: 'ISOLATION / SEALED' },
  { x: 18, z: 20, flag: 'patient-file', name: 'ISOLATION / SEALED' },
];

/** Canonical furniture/collision obstacles — single source of truth for both rendering (engine.ts)
 *  and pathfinding/LoS. Positions match the hospital and object meshes; sizes are the
 *  collision boxes used by HospitalEngine.canMove. Keep this in sync with buildHospital/buildObjects. */
export const OBSTACLES: { x: number; z: number; w: number; d: number }[] = [
  // buildHospital — wheelchair + shelves
  { x: center(12.1), z: center(16.5), w: 0.95, d: 1.05 },
  { x: center(15.5), z: center(3), w: 1.2, d: 0.45 },
  { x: center(17), z: center(3), w: 1.2, d: 0.45 },
  { x: center(19.5), z: center(3), w: 1.2, d: 0.45 },
  { x: center(15.5), z: center(12.5), w: 1.6, d: 0.55 },
  { x: center(15.5), z: center(16.8), w: 1.6, d: 0.55 },
  // buildHospital — ward / corridor beds
  { x: center(2.8), z: center(12.8), w: 1.05, d: 2.1 },
  { x: center(7.5), z: center(15.8), w: 1.05, d: 2.1 },
  { x: center(16), z: center(25.5), w: 1.05, d: 2.1 },
  { x: center(10.2), z: center(21), w: 1.05, d: 2.1 },
  // buildObjects — interactables
  { x: center(11), z: center(4), w: 1.6, d: 0.8 }, // desk
  { x: center(19), z: center(5), w: 1.15, d: 0.65 }, // generator
  { x: center(4), z: center(4), w: 2.1, d: 1 }, // monitor
  { x: center(4), z: center(14), w: 1.05, d: 2.1 }, // ward bed
  { x: center(19), z: center(14), w: 1.4, d: 0.75 }, // file cabinet
  { x: center(18), z: center(24), w: 1.05, d: 2.1 }, // isolation patient bed
  // lockers
  { x: center(7), z: center(7), w: 0.9, d: 0.7 },
  { x: center(20), z: center(7), w: 0.9, d: 0.7 },
  { x: center(3), z: center(17), w: 0.9, d: 0.7 },
  { x: center(20), z: center(17), w: 0.9, d: 0.7 },
  { x: center(3), z: center(24), w: 0.9, d: 0.7 },
];

export function isObstacleBlocked(x: number, z: number, radius = 0.25): boolean {
  return OBSTACLES.some(o => Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}

export function isPassable(x: number, z: number, state: GameState, radius = 0.28): boolean {
  return isWalkable(x, z, state) && !isObstacleBlocked(x, z, radius);
}

function segmentIntersectsExpandedAABB(x1: number, z1: number, x2: number, z2: number, o: { x: number; z: number; w: number; d: number }, pad = 0.08): boolean {
  const minX = o.x - o.w / 2 - pad, maxX = o.x + o.w / 2 + pad;
  const minZ = o.z - o.d / 2 - pad, maxZ = o.z + o.d / 2 + pad;
  const segMinX = Math.min(x1, x2), segMaxX = Math.max(x1, x2);
  const segMinZ = Math.min(z1, z2), segMaxZ = Math.max(z1, z2);
  if (segMaxX < minX || segMinX > maxX || segMaxZ < minZ || segMinZ > maxZ) return false;
  const dx = x2 - x1, dz = z2 - z1;
  let tMin = 0, tMax = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > tMax) return false; if (t > tMin) tMin = t; }
    else { if (t < tMin) return false; if (t < tMax) tMax = t; }
    return true;
  };
  if (!clip(-dx, x1 - minX)) return false;
  if (!clip(dx, maxX - x1)) return false;
  if (!clip(-dz, z1 - minZ)) return false;
  if (!clip(dz, maxZ - z1)) return false;
  return tMin <= tMax;
}

export function lineBlockedByObstacle(x1: number, z1: number, x2: number, z2: number): boolean {
  return OBSTACLES.some(o => segmentIntersectsExpandedAABB(x1, z1, x2, z2, o));
}

function object(id: string, label: string, kind: WorldObject['kind'], x: number, z: number, room: string): WorldObject {
  return { id, label, kind, x: center(x), z: center(z), room };
}

export const OBJECTS: WorldObject[] = [
  object('shift', 'Read the shift manifest', 'desk', 11, 4, 'North corridor'),
  object('generator', 'Auxiliary power panel', 'generator', 19, 5, 'Maintenance'),
  object('monitor', 'Security surveillance', 'monitor', 4, 4, 'Security'),
  object('ward', 'The empty bed', 'bed', 4, 14, 'Ward C'),
  object('records', 'Sealed patient file', 'file', 19, 14, 'Records'),
  object('isolation', 'Patient 09', 'patient', 18, 24, 'Isolation'),
  object('tape', 'Nora\'s witness recording', 'tape', 4, 23, 'Chapel'),
  object('secret', 'The memorial safe', 'safe', 7, 26, 'Chapel'),
  object('battery-security', 'Spare flashlight battery', 'battery', 7, 3, 'Security'),
  object('battery-records', 'Spare flashlight battery', 'battery', 15, 16, 'Records'),
  object('battery-chapel', 'Spare flashlight battery', 'battery', 3, 26, 'Chapel'),
  object('medkit', 'First aid supplies', 'medkit', 7, 17, 'Ward C'),
  object('locker-security', 'Hide in the locker', 'locker', 7, 7, 'Security'),
  object('locker-storage', 'Hide in the locker', 'locker', 20, 7, 'Maintenance'),
  object('locker-ward', 'Hide in the locker', 'locker', 3, 17, 'Ward C'),
  object('locker-records', 'Hide in the locker', 'locker', 20, 17, 'Records'),
  object('locker-chapel', 'Hide in the locker', 'locker', 3, 24, 'Chapel'),
  object('exit', 'Hospital front exit', 'exit', 11, 1, 'North entrance'),
];

export function isWalkable(x: number, z: number, state: GameState): boolean {
  const gx = Math.floor(x / TILE), gz = Math.floor(z / TILE);
  if (!GRID[gz]?.[gx]) return false;
  const door = DOORS.find(d => d.x === gx && d.z === gz);
  return !door || state.flags.includes(door.flag);
}

export function lineOfSight(x1: number, z1: number, x2: number, z2: number, state: GameState) {
  if (lineBlockedByObstacle(x1, z1, x2, z2)) return false;
  const distance = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.ceil(distance / 0.35);
  for (let i = 1; i < steps; i++) {
    if (!isWalkable(x1 + (x2 - x1) * i / steps, z1 + (z2 - z1) * i / steps, state)) return false;
  }
  return true;
}

export function findPath(x1: number, z1: number, x2: number, z2: number, state: GameState): { x: number; z: number }[] {
  const start = [Math.floor(x1 / TILE), Math.floor(z1 / TILE)];
  const goal = [Math.floor(x2 / TILE), Math.floor(z2 / TILE)];
  const key = (x: number, z: number) => z * WIDTH + x;
  const previous = new Map<number, number>();
  const queue = [start];
  previous.set(key(...start as [number, number]), -1);
  let end = -1;
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    if (x === goal[0] && z === goal[1]) { end = key(x, z); break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (!previous.has(k) && isPassable(center(nx), center(nz), state)) {
        previous.set(k, key(x, z)); queue.push([nx, nz]);
      }
    }
  }
  const path: { x: number; z: number }[] = [];
  while (end !== -1 && previous.has(end)) {
    path.unshift({ x: center(end % WIDTH), z: center(Math.floor(end / WIDTH)) });
    end = previous.get(end)!;
  }
  return path.slice(1);
}

export function getLocation(x: number, z: number) {
  const gx = x / TILE, gz = z / TILE;
  return ROOMS.find(r => gx >= r.x && gx < r.x + r.w && gz >= r.z && gz < r.z + r.h)?.short ?? (gz < 10 ? 'North corridor' : gz < 20 ? 'Central corridor' : 'South corridor');
}