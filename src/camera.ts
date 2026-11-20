import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { gridSpan } from './grid-launch';
import { RADIUS } from './identities';
import type { Phase } from './lifecycle';
import { STEP } from './physics';
import type { Racer } from './physics';
import { clamp, nodeAt, pathPoseAt } from './track';
import type { Module, Plan } from './track';

// Coordinates are across the track, above the marbles and along the track.
// Keep the camera on the same side when changing height or following an obstacle.
const running = new Vector3(-4.85, 3.55, 1.85);
const drop = new Vector3(-3.15, 3.15, 5.55);
const narrow = new Vector3(-2.9, 4.65, -3.35);
const overhead = new Vector3(-2.65, 6.15, -2.45);
const landmark = new Vector3(-3.6, 4.45, -4.8);
const spiral = new Vector3(-2.55, 6.0, -1.65);
const straight = new Vector3(-4.8, 4.3, 2.65);

function shotFor(module: Module) {
  if (module.dropDegrees || module.kind === 'jump') return drop;
  if (module.kind === 'terraces' || module.kind === 'helix') return spiral;
  if (module.bridge || module.passes || module.kind === 'sweepers') return narrow;
  if (module.track) return landmark;
  if (module.kind === 'split' || module.kind === 'pegs' || module.kind === 'tunnel') return overhead;
  if (module.kind === 'finish') return straight;
  return running;
}

const weightAt = (gap: number) => 1 - MathUtils.smoothstep(gap, 4, 7);

export class ShowCamera {
  readonly value = new PerspectiveCamera(39, 16 / 9, .06, 240);
  private readonly focus = new Vector3();
  private readonly desiredFocus = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly center = new Vector3();
  private readonly velocity = new Vector3();
  private readonly racerPosition = new Vector3();
  private readonly leadPosition = new Vector3();
  private readonly low = new Vector3();
  private readonly high = new Vector3();
  private readonly side = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly backward = new Vector3();
  private readonly screenUp = new Vector3();
  private readonly offset = running.clone();
  private readonly finishFocus = new Vector3();
  private readonly finishEye = new Vector3();
  private readonly gridFocus = new Vector3();
  private readonly gridEye = new Vector3();
  private readonly heading = { x: 0, y: 0, z: 0, yaw: 0 };
  private sections: { offset: Vector3; fixedYaw?: number }[] = [];
  private yaw = 0;
  private pullback = 0;
  private first = true;

  reset() {
    this.first = true;
    this.yaw = this.pullback = 0;
    this.offset.copy(running);
  }

  cut() { this.first = true; }

  course(plan: Plan) {
    this.sections = plan.modules.map(m => ({
      offset: shotFor(m), fixedYaw: m.kind === 'helix' || m.kind === 'terraces' ? plan.nodes[m.from].yaw : undefined,
    }));
  }

  private lineup(plan: Plan, count: number, time: number, launching: boolean) {
    const n = plan.nodes[1], field = (gridSpan(count) - gridSpan(4)) / (gridSpan(8) - gridSpan(4));
    const follow = launching ? MathUtils.smoothstep(time, 0, .93) : 0;
    const drift = .15 * Math.sin(time * .28);
    this.gridFocus.set(n.x - 1.98 - .57 * field + 2.15 * follow, n.y + .80, n.z + .08 + 1.35 * follow);
    this.gridEye.set(n.x + .95 + .40 * field + drift - 2.05 * follow,
      n.y + 3.00 + .46 * field + .65 * follow, n.z + 8.35 + 2.17 * field + .62 * follow);
  }

  private podium(phase: Phase, time: number, podium: Vector3) {
    const results = phase === 'RESULTS';
    const reveal = results ? 1 : MathUtils.smoothstep(time, 2.4, 4.7);
    this.desiredFocus.set(podium.x - (results ? 1.14 : .64), podium.y + 1.61 - .16 * reveal, podium.z + .30);
    this.desiredPosition.set(podium.x + .86 + .45 * reveal, podium.y + 3.04 + 1.30 * reveal,
      podium.z + 8.15 + (results ? 3.45 : 1.15 * reveal));
  }

  private frontGroup(ranked: readonly Racer[], distance: number, alpha: number) {
    const lead = ranked[0];
    this.leadPosition.lerpVectors(lead.previous, lead.p, alpha);
    this.low.set(0, 0, 0);
    this.high.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    let total = 0;
    for (const r of ranked) {
      if (r.dnf || r.finish !== null) continue;
      const weight = weightAt(distance - r.progress.distance);
      if (!weight) break;
      this.racerPosition.lerpVectors(r.previous, r.p, alpha).sub(this.leadPosition).multiplyScalar(weight);
      this.low.min(this.racerPosition);
      this.high.max(this.racerPosition);
      this.velocity.addScaledVector(this.racerPosition.subVectors(r.p, r.previous), weight / STEP);
      total += weight;
    }
    this.center.addVectors(this.low, this.high).multiplyScalar(.5).add(this.leadPosition);
    this.velocity.multiplyScalar(1 / total).clampLength(0, 17);
  }

  // Fit close opponents between the header, ticker and standings, including their whole silhouettes.
  private fitGroup(ranked: readonly Racer[], distance: number, alpha: number, base: number, dt: number) {
    const height = Math.tan(MathUtils.degToRad(this.value.fov / 2));
    const width = height * this.value.aspect;
    let extra = 0;
    for (const r of ranked) {
      if (r.dnf || r.finish !== null) continue;
      const weight = weightAt(distance - r.progress.distance);
      if (!weight) break;
      const relative = this.racerPosition.lerpVectors(r.previous, r.p, alpha).sub(this.center);
      const horizontal = (Math.abs(relative.dot(this.right)) + RADIUS + .14) / (.66 * width);
      const vertical = (Math.abs(relative.dot(this.screenUp)) + RADIUS + .14) / (.71 * height);
      const required = relative.dot(this.backward) + Math.max(horizontal, vertical);
      extra = Math.max(extra, (required - base) * weight);
    }
    this.pullback = MathUtils.damp(this.pullback, extra, extra > this.pullback ? 7 : 2.1, dt);
    return base + this.pullback;
  }

  // A downstream view holds the stripe and finish bays together as each ball crosses and parks.
  private finish(plan: Plan, arrived: boolean) {
    const n = plan.nodes[plan.finish];
    this.side.set(Math.cos(n.yaw), 0, -Math.sin(n.yaw));
    this.forward.set(Math.sin(n.yaw), 0, Math.cos(n.yaw));
    this.finishFocus.copy(n).addScaledVector(this.side, 1.25).addScaledVector(this.forward, arrived ? 2.65 : .55);
    this.finishFocus.y += arrived ? -.39 : RADIUS;
    this.finishEye.copy(n).addScaledVector(this.side, -2.15).addScaledVector(this.forward, arrived ? 12.40 : 9.45);
    this.finishEye.y += arrived ? 5.95 : 5.50;
  }

  private race(plan: Plan, ranked: readonly Racer[], dt: number, alpha: number) {
    const lead = ranked[0];
    if (!lead || lead.finish !== null) {
      this.finish(plan, true);
      this.desiredFocus.copy(this.finishFocus);
      this.desiredPosition.copy(this.finishEye);
      return;
    }
    if (lead.dnf) return;
    const distance = lead.progress.distance;
    this.frontGroup(ranked, distance, alpha);
    const ahead = distance + clamp(lead.speed * .28, .55, 3);
    const section = this.sections[nodeAt(plan, ahead).module];
    const pose = pathPoseAt(plan, ahead, this.heading);
    const yaw = section.fixedYaw ?? pose.yaw;
    const delta = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.yaw += clamp(delta * (1 - Math.exp(-4.2 * dt)), -1.65 * dt, 1.65 * dt);
    this.side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.offset.lerp(section.offset, 1 - Math.exp(-2.9 * dt));
    this.backward.copy(this.side).multiplyScalar(this.offset.x).addScaledVector(this.forward, this.offset.z);
    this.backward.y = this.offset.y;
    const base = this.backward.length();
    this.backward.multiplyScalar(1 / base);
    this.right.set(this.backward.z, 0, -this.backward.x).normalize();
    this.screenUp.crossVectors(this.backward, this.right);
    const range = this.fitGroup(ranked, distance, alpha, base, dt);
    // Look through damping by a fraction of a second so a fast falling pack stays in frame.
    this.center.addScaledVector(this.velocity, .145);
    this.desiredFocus.copy(this.center).addScaledVector(this.right, range * .115).addScaledVector(this.velocity, .035);
    this.desiredFocus.y += .08;
    this.desiredPosition.copy(this.desiredFocus).addScaledVector(this.backward, range);

    const toLine = plan.length - distance;
    if (toLine < 10) {
      this.finish(plan, false);
      // Move inboard before the arch so the near handrail clears a leader running along the edge.
      this.desiredPosition.lerp(this.finishEye, 1 - MathUtils.smoothstep(toLine, 2.2, 10));
      this.desiredFocus.lerp(this.finishFocus, 1 - MathUtils.smoothstep(toLine, .1, 5.6));
    }
  }

  update(plan: Plan, ranked: readonly Racer[], phase: Phase, dt: number, phaseTime: number, podium: Vector3, alpha = 1) {
    const queued = phase === 'PREPARE' || phase === 'PICK_MARBLE' || phase === 'COUNTDOWN' || phase === 'NEXT_ROUND';
    const celebrating = phase === 'CELEBRATION' || phase === 'RESULTS';
    if (queued) {
      this.lineup(plan, ranked.length || 8, phaseTime, false);
      this.desiredFocus.copy(this.gridFocus);
      this.desiredPosition.copy(this.gridEye);
    } else if (celebrating) this.podium(phase, phaseTime, podium);
    else {
      this.race(plan, ranked, dt, alpha);
      if (phase === 'RACING' && phaseTime < 2.55) {
        this.lineup(plan, ranked.length || 8, phaseTime, true);
        this.desiredFocus.lerp(this.gridFocus, 1 - MathUtils.smoothstep(phaseTime, .26, 1.38));
        this.desiredPosition.lerp(this.gridEye, 1 - MathUtils.smoothstep(phaseTime, .36, 2.55));
      }
    }
    const rate = queued || celebrating ? 4.7 : 6.4;
    const factor = this.first ? 1 : 1 - Math.exp(-rate * dt);
    this.first = false;
    this.value.position.lerp(this.desiredPosition, factor);
    this.focus.lerp(this.desiredFocus, factor);
    this.value.lookAt(this.focus);
  }
}
