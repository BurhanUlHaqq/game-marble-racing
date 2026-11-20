import { along, clamp, side } from './track';
import type { Plan, Sample, V3 } from './track';
import { RADIUS } from './identities';
import type { Place } from './physics';

export function podiumLayout(places: readonly Place[]) {
  const medals = places.filter(p => p.time !== null).slice(0, 3);
  const field = places.filter(p => !medals.includes(p));
  const pitch = Math.min(1.02, 4.12 / Math.max(1, field.length - 1));
  return { medals, field, pitch, size: Math.min(1, pitch / .94) };
}

export const ROLLOUT_SECONDS = 1.65;

export type FinishRack = { line: Sample; depth: number; slope: number; entrants: number };

export function finishRack(plan: Plan, entrants: number): FinishRack {
  const line = plan.nodes[plan.finish];
  const end = plan.nodes[plan.nodes.length - 1];
  const trackTail = end.s - line.s;
  return { line, depth: Math.min(4.65, trackTail - .72), slope: (line.y - end.y) / trackTail, entrants };
}

export function bayOffset(rack: FinishRack, rank: number) {
  return (rank - (rack.entrants - 1) / 2) * .88;
}

export function finishPoint(rack: FinishRack, across: number, forward: number, height = 0, target: V3 = { x: 0, y: 0, z: 0 }) {
  const { line, slope } = rack;
  const x = Math.sin(line.yaw), z = Math.cos(line.yaw);
  target.x = line.x + x * forward + z * across;
  target.y = line.y - slope * forward + height;
  target.z = line.z + z * forward - x * across;
  return target;
}

export function rolloutPosition(rack: FinishRack, start: V3, rank: number, seconds: number, target: V3) {
  const t = clamp(seconds / ROLLOUT_SECONDS, 0, 1);
  if (t === 1) return finishPoint(rack, bayOffset(rack, rank), rack.depth, RADIUS + .035, target);
  const entry = along(rack.line, start);
  const lateral = side(rack.line, start);
  const s = entry + (rack.depth - entry) * t * (2 - t);
  const steer = clamp((t - .08) / .78, 0, 1);
  const u = lateral + (bayOffset(rack, rank) - lateral) * steer ** 2 * (3 - 2 * steer);
  const floor = RADIUS + .035;
  const entryHeight = start.y - (rack.line.y - rack.slope * entry + floor);
  return finishPoint(rack, u, s, floor + entryHeight * (1 - t) ** 2, target);
}
