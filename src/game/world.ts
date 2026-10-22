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
      if (!previous.has(k) && isWalkable(center(nx), center(nz), state)) {
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