import { expect, test } from '@playwright/test';
import { DOCUMENTS } from '../src/game/content';
import { determineEnding, evidenceCount, flag, formatTime, has, loadGame, loadScores, loadSettings, newGame, recordScore, resolveAction, SAVE_KEY, saveGame, SETTINGS_KEY } from '../src/game/model';
import { center, findPath, isWalkable, NIGHT_SECONDS } from '../src/game/world';

function completeToArchive() {
  const s = newGame();
  expect(resolveAction(s, 'shift').ok).toBe(true);
  expect(resolveAction(s, 'generator', '0317').ok).toBe(true);
  expect(resolveAction(s, 'camera', 'ward').ok).toBe(true);
  expect(resolveAction(s, 'ward', 'bed').ok).toBe(true);
  expect(resolveAction(s, 'records', '1984').ok).toBe(true);
  return s;
}

test('the eight-mission route has valid solutions and reaches the secret ending', () => {
  const s = completeToArchive();
  resolveAction(s, 'names', 'protect');
  expect(s.mission).toBe(5);
  resolveAction(s, 'isolation', 'save');
  expect(s.mission).toBe(6);
  resolveAction(s, 'tape');
  expect(s.mission).toBe(6);
  resolveAction(s, 'secret', 'SILENCE');
  resolveAction(s, 'broadcast', 'truth');
  expect(s.mission).toBe(7);
  expect(evidenceCount(s)).toBe(4);
  expect(s.words.length).toBeGreaterThan(20);
  expect(resolveAction(s, 'exit', 'front').ok).toBe(false);
  s.elapsed = NIGHT_SECONDS;
  expect(resolveAction(s, 'exit', 'front').ending).toBe('secret');
  expect(s.mission).toBe(8);
});

test('escape, truth, and trapped endings depend on actual decisions', () => {
  const escape = newGame(); escape.elapsed = NIGHT_SECONDS;
  expect(resolveAction(escape, 'exit', 'front').ending).toBe('escape');
  const truth = completeToArchive();
  resolveAction(truth, 'names', 'share'); resolveAction(truth, 'isolation', 'cut'); resolveAction(truth, 'tape'); resolveAction(truth, 'broadcast', 'truth');
  truth.elapsed = NIGHT_SECONDS;
  expect(resolveAction(truth, 'exit', 'front').ending).toBe('truth');
  const trapped = newGame();
  expect(resolveAction(trapped, 'exit', 'follow').ending).toBe('trapped');
  const caught = newGame(); caught.player.health = 0;
  expect(determineEnding(caught)).toBe('trapped');
});

test('mistakes have recoverable consequences and do not bypass prerequisites', () => {
  const s = newGame();
  expect(resolveAction(s, 'generator', '0317').ok).toBe(false);
  resolveAction(s, 'shift');
  expect(resolveAction(s, 'generator', '0000').noise).toBeGreaterThan(0);
  expect(s.mission).toBe(1);
  resolveAction(s, 'generator', '0317'); resolveAction(s, 'camera', 'ward');
  expect(resolveAction(s, 'ward', 'cabinet').ok).toBe(false);
  expect(s.player.health).toBe(85);
  expect(has(s, 'records-key')).toBe(false);
  resolveAction(s, 'ward', 'bed'); resolveAction(s, 'records', '1984');
  expect(resolveAction(s, 'isolation', 'save').ok).toBe(false);
  expect(s.mission).toBe(4);
  resolveAction(s, 'names', 'protect'); resolveAction(s, 'isolation', 'save');
  expect(s.mission).toBe(6);
});

test('one-time interactions cannot farm score or reset the pursuer', () => {
  const s = completeToArchive(); const score = s.score;
  s.enemy.mode = 'chasing';
  resolveAction(s, 'camera', 'ward'); resolveAction(s, 'shift'); resolveAction(s, 'ward', 'bed'); resolveAction(s, 'records', '1984');
  expect(s.score).toBe(score); expect(s.enemy.mode).toBe('chasing');
});

test('keys gate all routes into locked sections and paths connect all rooms', () => {
  const s = newGame();
  expect(findPath(s.player.x, s.player.z, center(19), center(5), s)).toHaveLength(0);
  flag(s, 'staff-key');
  expect(findPath(s.player.x, s.player.z, center(19), center(5), s).length).toBeGreaterThan(0);
  expect(findPath(s.player.x, s.player.z, center(19), center(14), s)).toHaveLength(0);
  flag(s, 'records-key');
  expect(findPath(s.player.x, s.player.z, center(19), center(14), s).length).toBeGreaterThan(0);
  expect(findPath(s.player.x, s.player.z, center(18), center(24), s)).toHaveLength(0);
  flag(s, 'patient-file');
  expect(findPath(s.player.x, s.player.z, center(18), center(24), s).length).toBeGreaterThan(0);
  expect(findPath(s.player.x, s.player.z, center(4), center(23), s).length).toBeGreaterThan(0);
  expect(isWalkable(-1, -1, s)).toBe(false);
});

test('all English levels retain complete clues and the clock ends at six', () => {
  for (const doc of Object.values(DOCUMENTS)) for (const level of ['beginner', 'intermediate', 'advanced'] as const) expect(doc.body[level].length).toBeGreaterThan(100);
  expect(formatTime(0)).toBe('12:00 AM'); expect(formatTime(80)).toBe('01:00 AM'); expect(formatTime(480)).toBe('06:00 AM');
});

test('saves round-trip, fatal states preserve checkpoints, and scores deduplicate', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  const s = completeToArchive();
  expect(saveGame(s)).toBe(true);
  expect(loadGame()?.flags).toEqual(s.flags);
  const original = storage.get(SAVE_KEY);
  s.player.health = 0; s.ending = 'trapped';
  expect(saveGame(s)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(original);
  recordScore(s); recordScore(s);
  expect(loadScores()).toHaveLength(1);
  storage.set(SAVE_KEY, '{corrupted'); expect(loadGame()).toBe(null);
  storage.set(SETTINGS_KEY, JSON.stringify({ volume: 'broken', brightness: 9, difficulty: 'impossible' }));
  expect(loadSettings().volume).toBe(65); expect(loadSettings().brightness).toBe(1.6); expect(loadSettings().difficulty).toBe('intermediate');
  expect(loadSettings().language).toBe('en'); expect(loadSettings().cameraMode).toBe('third'); expect(loadSettings().avatar).toBe('guard');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

test('battery use and irreversible choices affect resources and secret eligibility', () => {
  const s = completeToArchive(); resolveAction(s, 'names', 'protect');
  const before = s.player.battery;
  resolveAction(s, 'isolation', 'save');
  expect(s.player.battery).toBe(before - 12); expect(s.inventory.includes('Spare fuse')).toBe(false);
  expect(resolveAction(s, 'isolation', 'cut').ok).toBe(true); expect(has(s, 'patient-abandoned')).toBe(false);
  s.player.battery = 20; const spares = s.batteries;
  resolveAction(s, 'battery'); expect(s.player.battery).toBe(80); expect(s.batteries).toBe(spares - 1);
  resolveAction(s, 'tape'); resolveAction(s, 'secret', 'silence'); resolveAction(s, 'broadcast', 'name'); resolveAction(s, 'broadcast', 'truth');
  expect(determineEnding(s)).toBe('truth');
});