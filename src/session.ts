import type { Settings } from './config';
import { settingsFrom } from './config';
import { IDENTITIES } from './identities';
import type { Place } from './physics';

const KEY = 'zeerush/show/v1';
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1] as const;
export type Stat = { id: number; appearances: number; wins: number; podiums: number; points: number };
export type RoundRecord = {
  id: string; number: number; seed: string; places: Place[]; void: boolean; winner: number | null;
  awards: Record<number, number>; championship: number; titles?: number[]; badge?: string;
};
export type Session = {
  version: 1; id: string; settings: Settings; next: number; pending: number | null; abandoned: number;
  lastCommit: string | null; stats: Stat[]; recent: RoundRecord[]; championship: number;
  cupRound: number; cup: Stat[];
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const newStats = () => IDENTITIES.map(({ id }) => ({ id, appearances: 0, wins: 0, podiums: 0, points: 0 }));
const int = (v: unknown, def = 0) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : def;
const object = (x: unknown): Record<string, unknown> => x && typeof x === 'object' ? x as Record<string, unknown> : {};

function safeStats(source: unknown): Stat[] {
  if (!Array.isArray(source)) return newStats();
  return newStats().map(s => {
    const entry = object(source.find(v => object(v).id === s.id));
    return { ...s, appearances: int(entry.appearances), wins: int(entry.wins), podiums: int(entry.podiums), points: int(entry.points) };
  });
}

export function freshSession(settings: Settings, id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Session {
  return { version: 1, id, settings, next: 1, pending: null, abandoned: 0, lastCommit: null,
    stats: newStats(), recent: [], championship: 1, cupRound: 0, cup: newStats() };
}

export function loadSession(storage: StorageLike | undefined, query = ''): Session {
  try {
    const raw = object(JSON.parse(storage?.getItem(KEY) ?? 'null'));
    const settings = settingsFrom(raw.settings, query);
    if (raw.version !== 1 || settings.session === 'fresh' || typeof raw.id !== 'string' || !raw.id) return freshSession(settings);
    const next = Math.max(1, int(raw.next, 1));
    const pending = int(raw.pending);
    const interrupted = pending === next;
    const recent = Array.isArray(raw.recent) ? raw.recent.slice(0, 12).flatMap((value): RoundRecord[] => {
      const record = object(value);
      if (typeof record.id !== 'string' || typeof record.seed !== 'string' || !Array.isArray(record.places)) return [];
      const winner = typeof record.winner === 'number' && IDENTITIES.some(r => r.id === record.winner) ? record.winner : null;
      return [{ id: record.id, number: int(record.number), seed: record.seed, places: [], void: record.void === true,
        winner, awards: {}, championship: int(record.championship, 1) }];
    }) : [];
    return {
      version: 1, id: raw.id, settings, next: next + Number(interrupted), pending: null, abandoned: int(raw.abandoned) + Number(interrupted),
      lastCommit: typeof raw.lastCommit === 'string' ? raw.lastCommit : null, stats: safeStats(raw.stats), recent,
      championship: Math.max(1, int(raw.championship, 1)), cupRound: Math.min(4, int(raw.cupRound)), cup: safeStats(raw.cup),
    };
  } catch {
    return freshSession(settingsFrom(undefined, query));
  }
}

export function saveSession(storage: StorageLike | undefined, session: Session) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ ...session, settings: { ...session.settings, session: 'resume', mode: 'stream' } }));
    return true;
  } catch { return false; }
}

export function standings(stats: readonly Stat[]) {
  return [...stats].sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.id - b.id);
}

export function commitRound(session: Session, number: number, seed: string, places: Place[], badge?: string) {
  const id = `${session.id}/${number}`;
  if (number !== session.next || id === session.lastCommit) return null;
  const winner = places.find(p => p.time !== null)?.id ?? null;
  const record: RoundRecord = { id, number, seed, places, void: winner === null, winner, awards: {}, championship: session.championship, badge };
  for (const [i, p] of places.entries()) {
    const award = p.time === null ? 0 : POINTS[i] ?? 0;
    record.awards[p.id] = award;
    const apply = (stats: Stat[]) => {
      const s = stats.find(v => v.id === p.id);
      if (!s) return;
      s.appearances++;
      s.wins += Number(p.id === winner);
      s.podiums += Number(p.time !== null && i < 3);
      s.points += award;
    };
    apply(session.stats);
    if (session.settings.championship && !record.void) apply(session.cup);
  }
  let finalCup: Stat[] | undefined;
  if (session.settings.championship && !record.void && ++session.cupRound === 5) {
    finalCup = standings(session.cup);
    const leader = finalCup[0];
    record.titles = finalCup.filter(s => s.points === leader.points && s.wins === leader.wins && s.podiums === leader.podiums).map(s => s.id);
    session.cup = newStats();
    session.championship++;
    session.cupRound = 0;
  }
  session.next = number + 1;
  session.pending = null;
  session.lastCommit = id;
  session.recent = [record, ...session.recent].slice(0, 12);
  return { record, finalCup };
}
