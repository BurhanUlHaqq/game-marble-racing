import { RADIUS } from './identities';
import { Random } from './random';
import { point } from './track';
import type { Plan, V3 } from './track';

export const HOST_SCALE = .85;
export const HIP = .38;
export const SHOULDER = { x: .38, y: .88, z: .30 };
export const ELBOW = { x: .012, y: -.24, z: .068 };
export const PAW = { x: .012, y: -.205, z: .225 };
export const PAD_HEIGHT = .085;
const restArm = .02, restElbow = -.22;
const driveEnd = .16, rollTime = .13;

export type GridThrow = {
  stand: V3; yaw: number; hand: number; speed: number; velocity: V3; spin: V3;
  angle: number; rate: number; elbow: number; swing: number; prepare: number; travel: number; flair: number;
};
export type ThrowPose = {
  lift: number; shift: number; lean: number; arm: number; elbow: number; roll: number; load: number; drive: number;
};
export const neutralThrow = (): ThrowPose => ({
  lift: 0, shift: 0, lean: 0, arm: restArm, elbow: restElbow, roll: 0, load: 0, drive: 0,
});
const unit = (x: number) => Math.max(0, Math.min(1, x));
export function ease(x: number) {
  const t = unit(x);
  return t * t * (3 - 2 * t);
}

export function throwPose(host: GridThrow, t: number, pose = neutralThrow()) {
  const load = ease((t + host.prepare) / (host.prepare - host.swing));
  const drive = ease((t + host.swing) / (host.swing + driveEnd));
  const returnToStand = 1 - ease((t - driveEnd) / .58);
  pose.load = load * (1 - drive);
  pose.drive = drive * returnToStand;
  pose.lift = -.15 * pose.load + .035 * pose.drive;
  pose.shift = -.13 * pose.load + .085 * pose.drive;
  pose.lean = -.23 * pose.load + .17 * pose.drive;
  const backswing = host.angle + .5 * host.rate * host.swing;
  const bent = -.82 - .20 * host.flair;
  if (t <= -host.swing) {
    pose.arm = restArm + (backswing - restArm) * load;
    pose.elbow = restElbow + (bent - restElbow) * load;
  } else if (t < 0) {
    const u = 1 + t / host.swing;
    pose.arm = backswing - .5 * host.rate * host.swing * u * u;
    pose.elbow = bent + (host.elbow - bent) * ease(u);
  } else {
    const follow = Math.min(t, driveEnd);
    const end = host.angle - host.rate * follow * (1 - .5 * follow / driveEnd);
    pose.arm = restArm + (end - restArm) * returnToStand;
    pose.elbow = restElbow + (host.elbow - .55 * ease(t / .23) - restElbow) * returnToStand;
  }
  pose.roll = host.travel * unit(1 + t / rollTime) ** 2;
  return pose;
}

// The wrist stays level. The marble rolls along the pad toward the fingertips just before release.
export function heldMarble(host: GridThrow, pose: ThrowPose, out: V3) {
  const a = pose.arm, b = a + pose.elbow, hip = SHOULDER.y - HIP;
  const y = HIP + pose.lift + hip * Math.cos(pose.lean) - SHOULDER.z * Math.sin(pose.lean)
    + ELBOW.y * Math.cos(a) - ELBOW.z * Math.sin(a) + PAW.y * Math.cos(b) - PAW.z * Math.sin(b);
  const z = HOST_SCALE * (pose.shift + hip * Math.sin(pose.lean) + SHOULDER.z * Math.cos(pose.lean)
    + ELBOW.y * Math.sin(a) + ELBOW.z * Math.cos(a) + PAW.y * Math.sin(b) + PAW.z * Math.cos(b) + pose.roll);
  const x = host.hand * HOST_SCALE * (SHOULDER.x + ELBOW.x + PAW.x);
  out.x = host.stand.x + x * Math.cos(host.yaw) + z * Math.sin(host.yaw);
  out.y = host.stand.y + HOST_SCALE * (y + PAD_HEIGHT) + RADIUS;
  out.z = host.stand.z - x * Math.sin(host.yaw) + z * Math.cos(host.yaw);
  return out;
}

export function gridSpan(entrants: number) { return Math.min(6.1, 1.4 * (entrants - 1)); }

export function gridThrows(plan: Plan, entrants: number): GridThrow[] {
  const n = plan.nodes[0], rng = new Random(plan.seed + '/grid-throws');
  const lanes = Array.from({ length: entrants }, (_, i) => i);
  const speeds = rng.shuffle(lanes), pitches = rng.shuffle(lanes);
  const spacing = gridSpan(entrants) / Math.max(1, entrants - 1);
  return lanes.map(lane => {
    const across = (lane - (entrants - 1) / 2) * spacing;
    const yaw = n.yaw - .034 * across + rng.float(-.044, .044);
    const speed = 2.85 + 1.9 * (speeds[lane] + rng.float(.28, .72)) / entrants;
    const pitch = (12 + 48 * (pitches[lane] + rng.float(.28, .72)) / entrants) * Math.PI / 180;
    const forward = speed * Math.cos(pitch), upward = speed * Math.sin(pitch);
    const flair = rng.next(), swing = .235 + .06 * flair, elbow = -.10 - .14 * flair;
    const travel = rng.float(.052, .084);
    const rollSpeed = 2 * travel * HOST_SCALE / rollTime;
    // Subtract the shoulder drive and fingertip roll before solving the upper arm's tangent.
    const u = swing / (swing + driveEnd), driveRate = 6 * u * (1 - u) / (swing + driveEnd);
    const lean = -.23 + .40 * ease(u), hip = SHOULDER.y - HIP;
    const shoulderY = driveRate * HOST_SCALE * (.185 - .40 * (hip * Math.sin(lean) + SHOULDER.z * Math.cos(lean)));
    const shoulderZ = driveRate * HOST_SCALE * (.215 + .40 * (hip * Math.cos(lean) - SHOULDER.z * Math.sin(lean)));
    const leverY = ELBOW.y + PAW.y * Math.cos(elbow) - PAW.z * Math.sin(elbow);
    const leverZ = ELBOW.z + PAW.y * Math.sin(elbow) + PAW.z * Math.cos(elbow);
    const lift = upward - shoulderY, push = forward - shoulderZ - rollSpeed;
    const spinRate = rollSpeed / RADIUS;
    const host = {
      stand: { x: 0, y: 0, z: 0 }, yaw, hand: across > 0 ? -1 : 1, speed, flair, swing, elbow, travel,
      prepare: 1.04 + .31 * flair,
      angle: Math.atan2(leverZ, -leverY) - Math.atan2(lift, push),
      rate: Math.hypot(lift, push) / (HOST_SCALE * Math.hypot(leverY, leverZ)),
      velocity: { x: forward * Math.sin(yaw), y: upward, z: forward * Math.cos(yaw) },
      spin: { x: spinRate * Math.cos(yaw), y: 0, z: -spinRate * Math.sin(yaw) },
    };
    const reach = heldMarble(host, throwPose(host, 0), { x: 0, y: 0, z: 0 });
    host.stand = point(n, across, .065);
    host.stand.x += .14 * Math.sin(n.yaw) - reach.x;
    host.stand.z += .14 * Math.cos(n.yaw) - reach.z;
    return host;
  });
}
