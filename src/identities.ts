import { Random } from './random';
import type { Settings } from './config';

export const IDENTITIES = Object.freeze([
  { id: 1, name: 'Red Rocket', color: '#ff5149', mark: 'ϟ', pattern: 'Lightning' },
  { id: 2, name: 'Blue Bolt', color: '#4294ff', mark: '≋', pattern: 'Stripe' },
  { id: 3, name: 'Sunny', color: '#ffd34e', mark: '☀', pattern: 'Sun' },
  { id: 4, name: 'Green Comet', color: '#53db8c', mark: '◈', pattern: 'Comet' },
  { id: 5, name: 'Purple Pulse', color: '#b37aff', mark: '◎', pattern: 'Ring' },
  { id: 6, name: 'Orange Spark', color: '#ff9946', mark: '✦', pattern: 'Star' },
  { id: 7, name: 'Cyan Splash', color: '#4ce6e6', mark: '∿', pattern: 'Wave' },
  { id: 8, name: 'Silver Star', color: '#dce8f4', mark: '⠿', pattern: 'Dots' },
].map(identity => Object.freeze(identity)));

export type Identity = typeof IDENTITIES[number];
export const RADIUS = 0.335;
export const LANE_PITCH = 0.78;

export function lineupOffset(lane: number, entrants: number) {
  return (lane - (entrants - 1) / 2) * LANE_PITCH;
}

export function rosterFor(settings: Settings, round: number) {
  const rng = new Random(`${settings.seed}/roster/${round}`);
  const active = settings.roster === 'fixed' ? IDENTITIES.slice(0, settings.marbles)
    : rng.shuffle(IDENTITIES).slice(0, settings.roster === 'random' ? rng.int(settings.minMarbles, settings.maxMarbles) : settings.marbles);
  return Object.freeze(rng.shuffle(active));
}
