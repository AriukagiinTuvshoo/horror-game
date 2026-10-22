import { DOCUMENTS } from './content';
import { center, NIGHT_SECONDS } from './world';
import type { ActionResult, Ending, GameState, ScoreEntry, Settings } from './types';

export const SAVE_KEY = 'last-night-shift-save-v1';
export const SETTINGS_KEY = 'last-night-shift-settings-v1';
export const SCORES_KEY = 'last-night-shift-scores-v1';
export const DEFAULT_SETTINGS: Settings = { volume: 65, brightness: 1, sensitivity: 1, graphics: 'high', subtitles: true, reducedMotion: false, difficulty: 'intermediate', language: 'en', cameraMode: 'third', cinematicCameras: true, avatar: 'guard' };

export function newGame(): GameState {
  return {
    version: 1, runId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now(),
    elapsed: 0, mission: 0, score: 0,
    player: { x: center(11), z: center(3), yaw: Math.PI, pitch: -0.06, heading: Math.PI, health: 100, battery: 100, stamina: 100, sanity: 100, flashlight: true, hidden: false, crouched: false },
    enemy: { x: center(6), z: center(16), mode: 'dormant', targetX: center(6), targetZ: center(16), timer: 0, memory: { hideSpots: [], routeHeat: {}, flashlightUses: 0 } },
    flags: [], inventory: ['Flashlight', 'Pocket radio'], documents: [], words: [], collected: [], batteries: 1, distractions: 3, ending: null,
  };
}

export const has = (s: GameState, flag: string) => s.flags.includes(flag);
export function flag(s: GameState, value: string) { if (!has(s, value)) s.flags.push(value); }
export function addDocument(s: GameState, id: string) {
  if (!s.documents.includes(id)) { s.documents.push(id); s.score += 80; }
  for (const word of DOCUMENTS[id]?.words ?? []) {
    if (!s.words.includes(word)) { s.words.push(word); s.score += 10; }
  }
}
function nextMission(s: GameState, expected: number) {
  if (s.mission === expected) { s.mission++; s.score += 250; }
}
function ok(message: string, checkpoint = false): ActionResult { return { ok: true, message, checkpoint }; }
function fail(message: string, noise = 0): ActionResult { return { ok: false, message, noise }; }

export function evidenceCount(s: GameState) {
  return ['ward-chart', 'patient-file', 'witness-tape', 'original-ledger'].filter(f => has(s, f)).length;
}

export function determineEnding(s: GameState): Ending {
  if (s.player.health <= 0 || has(s, 'followed-voice')) return 'trapped';
  if (has(s, 'broadcast') && has(s, 'patient-saved') && has(s, 'original-ledger') && has(s, 'protected-names') && !has(s, 'gave-name')) return 'secret';
  if (has(s, 'broadcast') && evidenceCount(s) >= 3) return 'truth';
  return 'escape';
}

export function resolveAction(s: GameState, id: string, value = ''): ActionResult {
  if (s.ending) return fail('This shift has ended.');
  switch (id) {
    case 'shift':
      if (has(s, 'staff-key')) return ok('The manifest is signed. Your shift ends at 6:00 AM.');
      addDocument(s, 'shift'); flag(s, 'staff-key'); s.inventory.push('Staff key'); nextMission(s, 0);
      return ok('CLOCKED IN / Staff key collected. Find Maintenance on the right.', true);
    case 'generator':
      if (!has(s, 'staff-key')) return fail('You need the staff key. Read the shift manifest first.');
      if (has(s, 'power')) return ok('Auxiliary power is already running.');
      if (value !== '0317') return fail('ACCESS DENIED / The panel clicks loudly. Read the incident time again.', 10);
      addDocument(s, 'generator'); flag(s, 'power'); s.inventory.push('Spare fuse'); s.player.battery = Math.max(60, s.player.battery); nextMission(s, 1);
      return ok('POWER RESTORED / Something in the ward has woken up.', true);
    case 'camera':
      if (!has(s, 'power')) return fail('The surveillance system needs auxiliary power.');
      if (value !== 'ward') return fail('No movement on this feed. Check the camera marked WARD C.');
      if (has(s, 'camera-checked')) return ok('The movement has already been logged. Stay alert.');
      flag(s, 'camera-checked'); nextMission(s, 2); s.enemy.mode = 'patrolling';
      return ok('MOVEMENT RECORDED / Keep your light on it. It cannot move while you watch.', true);
    case 'ward':
      if (!has(s, 'camera-checked')) return fail('The bed is empty. Check the Ward C surveillance feed first.');
      if (has(s, 'records-key')) return ok('You already took the key beneath this bed.');
      if (value === 'cabinet') { s.player.health = Math.max(10, s.player.health - 15); s.player.sanity = Math.max(0, s.player.sanity - 12); flag(s, 'opened-cabinet'); return fail('THE CABINET WAS EMPTY / The false instruction cost 15 health and 12 sanity.', 25); }
      if (value !== 'bed') return fail('Listen again. Where did the voice say the key was?');
      addDocument(s, 'ward'); flag(s, 'ward-chart'); flag(s, 'records-key'); s.inventory.push('Records key'); nextMission(s, 3);
      return ok('RECORDS KEY FOUND / Twelve admissions. Only eleven discharge forms.', true);
    case 'records':
      if (!has(s, 'records-key')) return fail('The archive requires the records key from Ward C.');
      if (has(s, 'patient-file')) return ok('The archive has already been opened.');
      if (value !== '1984') return fail('ARCHIVE SEALED / Four details. Four numbers. Keep their original order.', 8);
      addDocument(s, 'records'); flag(s, 'patient-file'); s.inventory.push('Project Lullaby file');
      return ok('ARCHIVE OPEN / Before you leave, decide what to do with the patient names.');
    case 'names':
      if (!has(s, 'patient-file')) return fail('Open the sealed archive first.');
      if (has(s, 'protected-names') || has(s, 'shared-names')) return ok('You have already made your choice.');
      if (value === 'protect') { flag(s, 'protected-names'); s.score += 100; }
      else if (value === 'share') { flag(s, 'shared-names'); s.enemy.mode = 'investigating'; s.enemy.targetX = s.player.x; s.enemy.targetZ = s.player.z; }
      else return fail('Choose whether to protect or transmit the names.');
      nextMission(s, 4);
      return { ...ok(value === 'protect' ? 'PRIVATE COPY KEPT / The patients are evidence, not bargaining chips.' : 'NAMES TRANSMITTED / The radio repeats every name. Something is listening.', true), noise: value === 'share' ? 22 : 0 };
    case 'isolation':
      if (!has(s, 'patient-file')) return fail('Isolation is sealed. Recover the patient file from Records.');
      if (s.mission < 5) return fail('Return to the archive and decide what to do with the patient names first.');
      if (has(s, 'patient-saved') || has(s, 'patient-abandoned')) return ok('The decision has been made.');
      if (value === 'save') {
        flag(s, 'patient-saved'); s.player.battery = Math.max(0, s.player.battery - 12); s.inventory = s.inventory.filter(i => i !== 'Spare fuse'); s.score += 200;
      } else if (value === 'cut') { flag(s, 'patient-abandoned'); flag(s, 'quiet-wing'); }
      else return fail('The oxygen pump needs a decision.');
      addDocument(s, 'isolation'); nextMission(s, 5);
      return ok(value === 'save' ? 'OXYGEN RESTORED / A small hand touches the other side of the glass.' : 'SUPPLY DISCONNECTED / The breathing stops. The radio thanks you.', true);
    case 'tape':
      if (s.mission < 6) return fail('The tape is damaged. The patient in Isolation may explain who recorded it.');
      if (has(s, 'witness-tape')) return ok('Nora\'s testimony is in your inventory. Broadcast it from Security.');
      addDocument(s, 'tape'); flag(s, 'witness-tape'); s.inventory.push('Nora\'s witness tape'); s.score += 200;
      return ok('WITNESS TAPE RECOVERED / Broadcast it from Security. There is a safe in this room.', true);
    case 'secret':
      if (has(s, 'original-ledger')) return ok('The memorial safe stands open. You have the original ledger.');
      if (value.trim().toLowerCase() !== 'silence') return fail('The lock does not yield. Think of what speaking breaks.', 4);
      addDocument(s, 'secret'); flag(s, 'original-ledger'); s.inventory.push('Original trial ledger'); s.score += 500;
      return ok('ORIGINAL LEDGER RECOVERED / Every missing name. Every signature. Nothing erased.', true);
    case 'broadcast':
      if (!has(s, 'witness-tape')) return fail('Find Nora\'s witness tape in the Chapel first.');
      if (has(s, 'broadcast')) return ok('The testimony is broadcasting. Survive until dawn.');
      if (value === 'name') {
        flag(s, 'gave-name'); s.enemy.mode = 'chasing'; s.enemy.targetX = s.player.x; s.enemy.targetZ = s.player.z;
        return { ...ok('The voice repeats your name. Again. And again.'), noise: 30 };
      }
      if (value !== 'truth') return fail('Transmit the recording without introducing yourself.');
      flag(s, 'broadcast'); nextMission(s, 6); s.score += 300;
      return ok('TESTIMONY ON AIR / Nora\'s voice fills the hospital. The north exit unlocks at 6:00 AM.', true);
    case 'exit':
      if (value === 'follow') { flag(s, 'followed-voice'); s.ending = 'trapped'; return { ...ok('You follow the familiar voice down the stairs.'), ending: 'trapped' }; }
      if (s.elapsed < NIGHT_SECONDS) return fail(`The magnetic lock releases at 6:00 AM. ${Math.ceil((NIGHT_SECONDS - s.elapsed) / 60)} real minute(s) until dawn. Keep moving, or hide.`);
      s.mission = 8; s.ending = determineEnding(s); s.score += 1000 + Math.round(s.player.health * 5);
      return { ...ok('The first light of morning touches the doors.'), ending: s.ending };
    case 'battery':
      if (s.batteries <= 0) return fail('No spare batteries. Search Security, Records, or the Chapel.');
      if (s.player.battery >= 95) return fail('Your current battery is almost full. Save the spare.');
      s.batteries--; s.player.battery = Math.min(100, s.player.battery + 60); return ok('BATTERY REPLACED / +60% flashlight power.');
    default:
      if (id.startsWith('battery-')) {
        if (s.collected.includes(id)) return fail('Already collected.');
        s.collected.push(id); s.batteries++; s.score += 30; return ok('SPARE BATTERY COLLECTED / Press B to replace your flashlight battery.');
      }
      if (id === 'medkit') {
        if (s.collected.includes(id)) return fail('The first aid box is empty.');
        s.collected.push(id); s.player.health = Math.min(100, s.player.health + 45); s.player.sanity = Math.min(100, s.player.sanity + 25); s.score += 30; return ok('WOUNDS TREATED / +45 health and +25 sanity.');
      }
      return fail('Nothing happens.');
  }
}

export function formatTime(elapsed: number) {
  const minutes = Math.min(360, Math.floor(elapsed / NIGHT_SECONDS * 360));
  const hour = Math.floor(minutes / 60);
  return `${hour === 0 ? '12' : String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} AM`;
}

export function readStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
export function writeStorage(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function loadGame(): GameState | null {
  const s = readStorage<GameState | null>(SAVE_KEY, null);
  if (!s || s.version !== 1 || !s.player || !s.enemy || !Array.isArray(s.flags) || !Array.isArray(s.words) || !Array.isArray(s.inventory) || !Array.isArray(s.collected) || !Array.isArray(s.documents) || s.ending) return null;
  if (![s.player.x, s.player.z, s.player.health, s.elapsed, s.mission, s.player.battery].every(Number.isFinite) || s.player.health <= 0 || s.mission < 0 || s.mission > 8) return null;
  s.player.sanity = Number.isFinite(s.player.sanity) ? s.player.sanity : 100;
  s.player.heading = Number.isFinite(s.player.heading) ? s.player.heading : s.player.yaw;
  s.enemy.memory = s.enemy.memory && Array.isArray(s.enemy.memory.hideSpots) && s.enemy.memory.routeHeat && typeof s.enemy.memory.routeHeat === 'object'
    ? s.enemy.memory : { hideSpots: [], routeHeat: {}, flashlightUses: 0 };
  return s;
}
export function clearSave(): boolean {
  try { localStorage.removeItem(SAVE_KEY); return true; } catch { return false; }
}

export function isVictoryEnding(ending: Ending | null): boolean {
  return ending === 'escape' || ending === 'truth' || ending === 'secret';
}

export function saveGame(s: GameState): boolean {
  if (s.ending || s.player.health <= 0) return false;
  s.savedAt = Date.now();
  return writeStorage(SAVE_KEY, { ...s, player: { ...s.player, hidden: false } });
}
export function loadSettings(): Settings {
  const raw = readStorage<Partial<Settings> | null>(SETTINGS_KEY, {});
  const saved = raw && typeof raw === 'object' ? raw : {};
  const number = (value: unknown, fallback: number, min: number, max: number) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  return {
    ...DEFAULT_SETTINGS,
    volume: number(saved.volume ?? 65, 65, 0, 100), brightness: number(saved.brightness ?? 1, 1, .65, 1.6), sensitivity: number(saved.sensitivity ?? 1, 1, .3, 2),
    graphics: saved.graphics === 'low' ? 'low' : 'high',
    difficulty: ['beginner', 'intermediate', 'advanced'].includes(saved.difficulty ?? '') ? saved.difficulty! : 'intermediate',
    language: saved.language === 'mn' ? 'mn' : 'en',
    cameraMode: ['third', 'shoulder', 'first'].includes(saved.cameraMode ?? '') ? saved.cameraMode! : 'third',
    cinematicCameras: typeof saved.cinematicCameras === 'boolean' ? saved.cinematicCameras : true,
    avatar: ['guard', 'paramedic', 'investigator'].includes(saved.avatar ?? '') ? saved.avatar! : 'guard',
    subtitles: typeof saved.subtitles === 'boolean' ? saved.subtitles : true, reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : false,
  };
}
export function loadScores(): ScoreEntry[] {
  const raw = readStorage<ScoreEntry[] | null>(SCORES_KEY, []);
  return Array.isArray(raw) ? raw.filter(e => e && typeof e.id === 'string' && Number.isFinite(e.score) && ['escape', 'truth', 'trapped', 'secret'].includes(e.ending)).sort((a, b) => b.score - a.score).slice(0, 7) : [];
}
export function recordScore(s: GameState): ScoreEntry[] {
  const scores = loadScores();
  if (!s.ending) return scores;
  const entry: ScoreEntry = { id: s.runId, date: new Date().toLocaleDateString('en', { month: 'short', day: '2-digit' }), score: Math.round(s.score + s.elapsed * 2), ending: s.ending, missions: Math.min(8, s.mission), words: s.words.length };
  const result = [...scores.filter(e => e.id !== entry.id), entry].sort((a, b) => b.score - a.score).slice(0, 7);
  writeStorage(SCORES_KEY, result);
  return result;
}