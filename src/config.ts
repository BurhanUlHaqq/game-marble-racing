import { TRACK_IDS } from './signatures';
import type { TrackId } from './signatures';
import { Random } from './random';

export const THEMES = ['workshop', 'rainbow', 'crystal', 'night'] as const;
export type Theme = typeof THEMES[number];
export type ObstacleLevel = 'original' | 'standard' | 'extra';

export const DEFAULTS = Object.freeze({
  marbles: 6, roster: 'fixed', minMarbles: 4, maxMarbles: 8, pick: 12, countdown: 5, raceTarget: 120, grace: 8,
  pace: 'fixed', minPace: 90, maxPace: 140, celebration: 8, results: 5, generation: 'random',
  seed: 'zeerush', track: 'rotate', obstacles: 'standard', theme: 'rotate', quality: 'high',
  audio: 'balanced', soundtrack: 'library', announcer: true, master: 0.75, music: 0.65, effects: 0.8, mute: false, hud: 'full',
  championship: true,
} as const);

export type Settings = {
  marbles: number; roster: 'fixed' | 'mixed' | 'random'; minMarbles: number; maxMarbles: number; pick: number; countdown: number;
  raceTarget: number; grace: number; celebration: number; results: number; seed: string;
  generation: 'random' | 'seeded'; pace: 'fixed' | 'random'; minPace: number; maxPace: number;
  track: 'rotate' | 'classic' | TrackId; obstacles: ObstacleLevel; theme: Theme | 'rotate' | 'random';
  quality: 'low' | 'medium' | 'high'; audio: 'balanced' | 'asmr'; soundtrack: 'library' | 'synth';
  master: number; music: number; effects: number; announcer: boolean; mute: boolean; hud: 'full' | 'minimal' | 'off';
  championship: boolean;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

export function settingsFrom(saved: unknown, search = ''): Settings {
  const params = new URLSearchParams(search);
  const prior = asObject(saved);
  const value = (key: keyof Settings) => params.get(key) ?? prior[key];
  const number = (key: keyof Settings, min: number, max: number, integer = true) => {
    const raw = value(key);
    const n = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
    const clamped = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : Number(DEFAULTS[key]);
    return integer ? Math.round(clamped) : clamped;
  };
  const choice = <T extends string>(key: keyof Settings, values: readonly T[]): T => {
    const raw = value(key) as T;
    return values.includes(raw) ? raw : DEFAULTS[key] as T;
  };
  const bool = (key: keyof Settings) => {
    const raw = value(key);
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0') return false;
    return Boolean(DEFAULTS[key]);
  };
  const seed = value('seed');
  const marbleLimits = [number('minMarbles', 4, 8), number('maxMarbles', 4, 8)];
  const paceLimits = [number('minPace', 60, 180), number('maxPace', 60, 180)];
  return {
    marbles: number('marbles', 4, 8), roster: choice('roster', ['fixed', 'mixed', 'random']),
    minMarbles: Math.min(...marbleLimits), maxMarbles: Math.max(...marbleLimits),
    pick: number('pick', 3, 45), countdown: number('countdown', 3, 10),
    raceTarget: number('raceTarget', 60, 180), grace: number('grace', 0, 8),
    pace: choice('pace', ['fixed', 'random']), minPace: Math.min(...paceLimits), maxPace: Math.max(...paceLimits),
    celebration: number('celebration', 3, 30), results: number('results', 3, 30),
    seed: typeof seed === 'string' && seed.trim() ? seed.trim().slice(0, 72) : DEFAULTS.seed,
    generation: params.get('seed')?.trim() && !params.has('generation') ? 'seeded' : choice('generation', ['random', 'seeded']),
    track: choice('track', ['rotate', 'classic', ...TRACK_IDS]),
    obstacles: choice('obstacles', ['original', 'standard', 'extra']),
    theme: choice('theme', ['rotate', 'random', ...THEMES]), quality: choice('quality', ['low', 'medium', 'high']),
    audio: choice('audio', ['balanced', 'asmr']), soundtrack: choice('soundtrack', ['library','synth']), master: number('master', 0, 1, false),
    music: number('music', 0, 1, false), effects: number('effects', 0, 1, false),
    announcer: bool('announcer'), mute: bool('mute'), hud: choice('hud', ['full', 'minimal', 'off']), championship: bool('championship'),
  };
}

// Browser Source settings belong to the source URL. Championship history is stored separately.
export function broadcastSettings(search: string) {
  const params = new URLSearchParams(search), selected = new URLSearchParams();
  for (const key of ['track', 'marbles', 'raceTarget', 'seed', 'quality', 'mute']) {
    const value = params.get(key);
    if (value !== null) selected.set(key, value);
  }
  return settingsFrom({
    roster: selected.get('marbles') === 'random' ? 'random' : DEFAULTS.roster,
    pace: selected.get('raceTarget') === 'random' ? 'random' : DEFAULTS.pace,
  }, selected.toString());
}

export function raceSettings(settings: Settings, sessionId: string, round: number): Settings {
  const seed = settings.generation === 'random' ? `show-${sessionId}` : settings.seed;
  const raceTarget = settings.pace === 'random' ? new Random(`${seed}/pace/${round}`).int(settings.minPace, settings.maxPace) : settings.raceTarget;
  return { ...settings, seed, raceTarget };
}
