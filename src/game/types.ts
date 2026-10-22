export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type EnemyMode = 'dormant' | 'patrolling' | 'investigating' | 'searching' | 'chasing' | 'returning';
export type Ending = 'escape' | 'truth' | 'trapped' | 'secret';
export type Language = 'en' | 'mn';
export type CameraMode = 'third' | 'shoulder' | 'first';
export type AvatarId = 'guard' | 'paramedic' | 'investigator';

export interface Settings {
  volume: number;
  brightness: number;
  sensitivity: number;
  graphics: 'high' | 'low';
  subtitles: boolean;
  reducedMotion: boolean;
  difficulty: Difficulty;
  language: Language;
  cameraMode: CameraMode;
  cinematicCameras: boolean;
  avatar: AvatarId;
}

export interface GameState {
  version: 1;
  runId: string;
  savedAt: number;
  elapsed: number;
  mission: number;
  score: number;
  player: {
    x: number; z: number; yaw: number; pitch: number;
    health: number; battery: number; stamina: number; sanity: number;
    heading: number;
    flashlight: boolean; hidden: boolean; crouched: boolean;
  };
  enemy: {
    x: number; z: number; mode: EnemyMode;
    targetX: number; targetZ: number; timer: number;
    memory: { hideSpots: string[]; routeHeat: Record<string, number>; flashlightUses: number };
  };
  flags: string[];
  inventory: string[];
  documents: string[];
  words: string[];
  collected: string[];
  batteries: number;
  distractions: number;
  ending: Ending | null;
}

export interface ScoreEntry {
  id: string; date: string; score: number; ending: Ending;
  missions: number; words: number;
}

export interface Mission {
  title: string;
  description: string;
  target: string;
  room: string;
}

export interface WorldObject {
  id: string;
  label: string;
  kind: 'desk' | 'generator' | 'monitor' | 'bed' | 'file' | 'patient' | 'tape' | 'safe' | 'battery' | 'medkit' | 'locker' | 'exit';
  x: number;
  z: number;
  room: string;
}

export interface DocumentContent {
  title: string;
  label: string;
  body: Record<Difficulty, string>;
  hint: string;
  words: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
  noise?: number;
  checkpoint?: boolean;
  ending?: Ending;
}

export interface Snapshot {
  state: GameState;
  target: WorldObject | null;
  location: string;
  watched: boolean;
  danger: number;
  noise: number;
  cameraMode: CameraMode | 'fixed';
  hallucination: number;
}