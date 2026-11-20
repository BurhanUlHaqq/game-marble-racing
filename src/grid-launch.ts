import { RADIUS } from './identities';
import { Random } from './random';
import { point } from './track';
import type { Plan, V3 } from './track';

export const HOST_SCALE = .85;
export const SHOULDER = { x: .35, y: .85, z: .25 };
export const PAW = { x: .015, y: -.407, z: .25 };
export const HOLD_ANGLE = .05;
const swingRadius = HOST_SCALE * Math.hypot(PAW.y, PAW.z);
const swingSeconds = .22, followSeconds = .13;

export type GridThrow = { stand: V3; yaw: number; releaseAngle: number; speed: number; velocity: V3 };

function handOffset(yaw: number, angle: number, out: V3) {
  const x = HOST_SCALE * (SHOULDER.x + PAW.x);
  const z = HOST_SCALE * (SHOULDER.z + PAW.y * Math.sin(angle) + PAW.z * Math.cos(angle));
  out.x = x * Math.cos(yaw) + z * Math.sin(yaw);
  out.y = HOST_SCALE * (SHOULDER.y + PAW.y * Math.cos(angle) - PAW.z * Math.sin(angle)) + RADIUS + .055;
  out.z = z * Math.cos(yaw) - x * Math.sin(yaw);
}

export function heldMarble(host: GridThrow, angle: number, out: V3) {
  handOffset(host.yaw, angle, out);
  out.x += host.stand.x;
  out.y += host.stand.y;
  out.z += host.stand.z;
  return out;
}

export function gridThrows(plan: Plan, entrants: number): GridThrow[] {
  const start = plan.nodes[0], rng = new Random(plan.seed + '/grid-throws');
  const lanes = Array.from({ length: entrants }, (_, i) => i);
  const speeds = rng.shuffle(lanes), pitches = rng.shuffle(lanes);
  const spacing = Math.min(1.4, 6.1 / Math.max(1, entrants - 1));
  return lanes.map(lane => {
    const across = (lane - (entrants - 1) / 2) * spacing;
    const yaw = start.yaw - .034 * across + rng.float(-.044, .044);
    const speed = 2.85 + 1.9 * (speeds[lane] + rng.float(.28, .72)) / entrants;
    const pitch = (12 + 48 * (pitches[lane] + rng.float(.28, .72)) / entrants) * Math.PI / 180;
    const forward = speed * Math.cos(pitch);
    const velocity = { x: forward * Math.sin(yaw), y: speed * Math.sin(pitch), z: forward * Math.cos(yaw) };
    // The hand's tangent at release has the same direction as the ball's initial velocity.
    const releaseAngle = Math.atan2(PAW.z, -PAW.y) - pitch;
    const stand = point(start, across, .065), offset = { x: 0, y: 0, z: 0 };
    handOffset(yaw, releaseAngle, offset);
    stand.x += .14 * Math.sin(start.yaw) - offset.x;
    stand.z += .14 * Math.cos(start.yaw) - offset.z;
    return { stand, yaw, releaseAngle, speed, velocity };
  });
}

function ease(t: number) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

// Zero is the gate tick. The hand accelerates into the throw, then follows through.
export function throwingArm(host: GridThrow, timeFromGo: number) {
  const rate = host.speed / swingRadius;
  const wound = host.releaseAngle + .5 * rate * swingSeconds;
  if (timeFromGo <= -swingSeconds) return HOLD_ANGLE + (wound - HOLD_ANGLE) * ease((timeFromGo + .72) / (.72 - swingSeconds));
  if (timeFromGo < 0) {
    const u = 1 + timeFromGo / swingSeconds;
    return wound - .5 * rate * swingSeconds * u * u;
  }
  const follow = Math.min(timeFromGo, followSeconds);
  const angle = host.releaseAngle - rate * follow * (1 - .5 * follow / followSeconds);
  return angle + (HOLD_ANGLE - angle) * ease((timeFromGo - followSeconds) / .48);
}
