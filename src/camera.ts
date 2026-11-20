import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Phase } from './lifecycle';
import type { Racer } from './physics';
import { clamp, pathPoseAt } from './track';
import type { Plan } from './track';

export class ShowCamera {
  readonly value = new PerspectiveCamera(39, 16 / 9, 0.06, 240);
  private focus = new Vector3();
  private desiredFocus = new Vector3();
  private desiredPosition = new Vector3();
  private side = new Vector3();
  private forward = new Vector3();
  private readonly followPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly lookaheadPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private distance = 0;
  private yaw = 0;
  private first = true;
  private finishLocked = false;
  private finishBlend = 0;
  private landmark?: { start: number; end: number; lean: number };
  private challengeSections: { start: number; end: number }[] = [];
  private passShots: { start: number; end: number; bridge: boolean }[] = [];
  private passEye = new Vector3();
  private passTarget = new Vector3();
  private dropShots: { start: number; end: number; focus: Vector3; eye: Vector3 }[] = [];
  private spiral?: { start: number; end: number; focus: Vector3; position: Vector3 };

  reset() {
    this.first = true;
    this.distance = 0;
    this.yaw = 0;
    this.finishLocked = false;
    this.finishBlend = 0;
  }

  cut() { this.first = true; }

  course(plan: Plan) {
    this.dropShots = plan.modules.filter(m => m.dropDegrees).map(m => {
      const at = (t: number) => plan.nodes[m.from + Math.round(t * (m.to - m.from))];
      const lip = at(.13), catchDeck = at(.76);
      const focus = new Vector3().copy(lip).lerp(catchDeck, .54);
      const eye = focus.clone()
        .addScaledVector(new Vector3(Math.cos(lip.yaw), 0, -Math.sin(lip.yaw)), (lip.y - catchDeck.y) * 1.72 + 4)
        .addScaledVector(new Vector3(Math.sin(lip.yaw), 0, Math.cos(lip.yaw)), 6.8);
      eye.y += 5.5;
      return { start: at(0).s, end: at(1).s, focus, eye };
    });
    this.passShots = plan.modules.filter(m => m.bridge || m.passes)
      .map(m => ({ start: plan.nodes[m.from].s, end: plan.nodes[m.to].s, bridge: Boolean(m.bridge) }));
    const m = plan.modules.find(item => item.track);
    this.landmark = m ? { start: plan.nodes[m.from].s, end: plan.nodes[m.to].s, lean: m.lean } : undefined;
    this.challengeSections = plan.modules.filter(section => section.bridge || section.passes || section.kind === 'cushions' || section.kind === 'sweepers' || section.kind === 'terraces')
      .map(section => ({ start: plan.nodes[section.from].s, end: plan.nodes[section.to].s }));
    const spiral = plan.modules.find(section => section.kind === 'terraces');
    if (!spiral) { this.spiral = undefined; return; }
    const first = plan.nodes[spiral.from], last = plan.nodes[spiral.to];
    const radius = spiral.length / (2 * Math.PI);
    const focus = new Vector3();
    for (let i = spiral.from; i < spiral.to; i++) focus.add(plan.nodes[i]);
    focus.divideScalar(spiral.to - spiral.from);
    focus.y -= 1.85;
    const position = new Vector3(focus.x, first.y + 2.52 * radius, focus.z)
      .addScaledVector(new Vector3(Math.cos(first.yaw), 0, -Math.sin(first.yaw)), 2.36 * radius * spiral.lean)
      .addScaledVector(new Vector3(Math.sin(first.yaw), 0, Math.cos(first.yaw)), 1.79 * radius);
    this.spiral = { start: first.s, end: last.s, focus, position };
  }

  update(plan: Plan, ranked: readonly Racer[], phase: Phase, dt: number, phaseTime: number, podium: Vector3) {
    const lead = ranked.find(r => !r.dnf && r.finish === null);
    const presentation = phase === 'PREPARE' || phase === 'PICK_MARBLE' || phase === 'COUNTDOWN' || phase === 'NEXT_ROUND';
    const launch = phase === 'RACING' && phaseTime < .85;
    if (presentation || launch) {
      const n = plan.nodes[1];
      const truck = Math.sin((phaseTime + .3) * .29) * .32;
      const follow = launch ? MathUtils.smoothstep(phaseTime, 0, .78) : 0;
      this.desiredFocus.set(n.x - 2.55 + 2.2 * follow, n.y + .75, n.z + .12 + follow);
      this.desiredPosition.set(n.x + 1.35 + truck, n.y + 3.65 + follow * 1.3, n.z + 10.6 + follow * 1.4);
    } else if (phase === 'CELEBRATION' || phase === 'RESULTS') {
      const results = phase === 'RESULTS';
      this.desiredFocus.set(podium.x - (results ? 1.02 : .58), podium.y + 1.52, podium.z);
      this.desiredPosition.set(podium.x + 2.8 + Math.sin(phaseTime * .33) * 1.2, podium.y + (results ? 5.55 : 5.2), podium.z + (results ? 11.65 : 10.2));
    } else {
      const leadDistance = ranked[0]?.progress.distance ?? this.distance;
      this.finishLocked ||= leadDistance >= plan.length - 15 || phase === 'FINISHING';
      const goal = this.finishLocked ? plan.length - 3 : leadDistance;
      this.distance = MathUtils.damp(this.distance, goal, this.finishLocked ? 3.2 : 5.2, dt);
      this.finishBlend = MathUtils.damp(this.finishBlend, Number(this.finishLocked), 4, dt);
      const n = pathPoseAt(plan, this.distance, this.followPose);
      const peek = pathPoseAt(plan, this.distance + 6 - this.finishBlend * 2, this.lookaheadPose);
      const headingDelta = Math.atan2(Math.sin(peek.yaw - this.yaw), Math.cos(peek.yaw - this.yaw));
      this.yaw += headingDelta * (1 - Math.exp(-2.4 * dt));
      const trailing = ranked.find(r => r.finish === null && !r.dnf && r !== lead);
      const spread = clamp(((lead?.progress.distance ?? goal) - (trailing?.progress.distance ?? goal)) * 0.13, 0, 4);
      const startEnd = plan.nodes[plan.modules[0].to].s;
      const opening = 1 - MathUtils.smoothstep(this.distance, 0, startEnd);
      const close = MathUtils.lerp(opening, 1, this.finishBlend);
      this.side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.desiredFocus.copy(peek).addScaledVector(this.side, -0.75);
      this.desiredFocus.y += 0.15;
      this.desiredPosition.copy(n).addScaledVector(this.forward, MathUtils.lerp(-5.5, 13.2, close))
        .addScaledVector(this.side, MathUtils.lerp(8.5, 9.1, close) + spread * 0.37);
      this.desiredPosition.y += MathUtils.lerp(8.1, 9.25, close) + spread * 0.62;
      this.desiredFocus.addScaledVector(this.forward, this.finishBlend * .95);
      if (!this.finishLocked) {
        const section = this.challengeSections.find(({ start, end }) => leadDistance > start - 7 && leadDistance < end + 7);
        if (section) {
          const wide = MathUtils.smoothstep(leadDistance, section.start - 7, section.start + 4)
            * (1 - MathUtils.smoothstep(leadDistance, section.end - 4, section.end + 7));
          this.desiredPosition.addScaledVector(this.side, wide * 1.85);
          this.desiredPosition.y += wide * 2.15;
        }
        const spiral = this.spiral;
        if (spiral) {
          const wide = MathUtils.smoothstep(leadDistance, spiral.start - 13, spiral.start + 3)
            * (1 - MathUtils.smoothstep(leadDistance, spiral.start + 8, spiral.start + (spiral.end - spiral.start) * .51));
          this.desiredFocus.lerp(spiral.focus, wide * .98);
          this.desiredPosition.lerp(spiral.position, wide * .98);
        }
      }
      const shot = !this.finishLocked && this.passShots.find(s => leadDistance > s.start - 6 && leadDistance < s.end + 4);
      if (shot) {
        const blend = MathUtils.smoothstep(leadDistance, shot.start - 6, shot.start + 3)
          * (1 - MathUtils.smoothstep(leadDistance, shot.end - 3, shot.end + 4));
        this.passTarget.copy(n).addScaledVector(this.forward, shot.bridge ? .85 : 1.7);
        this.passTarget.y += .23;
        this.passEye.copy(n).addScaledVector(this.forward, shot.bridge ? 4.7 : -4.2).addScaledVector(this.side, shot.bridge ? 1.7 : 6.4);
        this.passEye.y += shot.bridge ? 4.2 : 9.5;
        this.desiredFocus.lerp(this.passTarget, blend);
        this.desiredPosition.lerp(this.passEye, blend);
      }
      if (this.landmark && !this.finishLocked) {
        const { start, end, lean } = this.landmark;
        const wide = MathUtils.smoothstep(leadDistance, start - 11, start + 6)
          * (1 - MathUtils.smoothstep(leadDistance, end - 6, end + 12));
        const lift = plan.track === 'prism-aquarium' ? 9 : plan.track === 'cloud-quilt' ? 2.8 : 6.2;
        this.desiredPosition.addScaledVector(this.side, wide * (lean < 0 ? 5.2 : -18.8));
        this.desiredPosition.y += wide * lift;
        this.desiredFocus.y -= wide * .85;
        if (plan.track === 'cedar-creek') {
          this.desiredFocus.addScaledVector(this.side, wide * lean * 2.20);
          this.desiredPosition.addScaledVector(this.forward, -wide * 2.2);
          this.desiredFocus.y += wide * 1.26;
          this.desiredPosition.y += wide * 2.8;
        }
        if (plan.track === 'midnight-record' || plan.track === 'truck-art') {
          this.desiredFocus.addScaledVector(this.side, wide * lean * 2.85);
          this.desiredPosition.y += wide * 2.6;
          if (lead) {
            this.desiredFocus.x = MathUtils.lerp(this.desiredFocus.x, lead.p.x, wide * .44);
            this.desiredFocus.z = MathUtils.lerp(this.desiredFocus.z, lead.p.z, wide * .44);
          }
        }
      }
      const drop = !this.finishLocked && this.dropShots.find(d => leadDistance > d.start - 6 && leadDistance < d.end + 3);
      if (drop) {
        const blend = MathUtils.smoothstep(leadDistance, drop.start - 6, drop.start + 4)
          * (1 - MathUtils.smoothstep(leadDistance, drop.end - 9, drop.end + 3));
        this.desiredFocus.lerp(drop.focus, blend);
        this.desiredPosition.lerp(drop.eye, blend);
      }
    }
    const factor = this.first ? 1 : 1 - Math.exp(-(presentation ? 4.8 : 3.2) * dt);
    this.first = false;
    this.value.position.lerp(this.desiredPosition, factor);
    this.focus.lerp(this.desiredFocus, factor);
    this.value.lookAt(this.focus);
  }
}
