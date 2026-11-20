import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { RADIUS } from './identities';
import type { Identity } from './identities';
import { gridThrows, heldMarble, HOLD_ANGLE } from './grid-launch';
import type { GridThrow } from './grid-launch';
import { compareArrivals, routeProgress } from './progress';
import type { Progress } from './progress';
import { along, branchContact, branchPoint, chuteClearance, chutePoint, clamp, deckPoint, point, side } from './track';
import type { ColliderGeometry, Device, Plan, Surface, V3 } from './track';
import { Random } from './random';
import { SURFACES } from './surfaces';

export const STEP = 1 / 60;
export const CAP = 180;
export const RECOVERY_LIMIT = 3;
const GRAVITY = 9.81;
// CCD safety limit, above the speeds reached on a normal plunge.
const MAX_SPEED = .9 * RADIUS / STEP;
const INERTIA = .4 * RADIUS ** 2;
const LANDING_INTERVAL = STEP / 48;
type Q = { x: number; y: number; z: number; w: number };
type GroundContact = { normal: V3; point: V3; impulse: number; force: number; speed: number; velocity?: V3; angularVelocity?: V3 };

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

function rotation(yaw: number, pitch = 0, spin = 0): Q {
  const s = Math.sin(yaw / 2), c = Math.cos(yaw / 2);
  const x = Math.sin(pitch / 2), w = Math.cos(pitch / 2);
  const yawAfterSpin = yaw + spin, yawBeforeTilt = yaw - spin;
  if (spin) return { x: Math.cos(yawBeforeTilt / 2) * x, y: Math.sin(yawAfterSpin / 2) * w,
    z: -Math.sin(yawBeforeTilt / 2) * x, w: Math.cos(yawAfterSpin / 2) * w };
  return { x: c * x, y: s * w, z: -s * x, w: c * w };
}

export function devicePose(d: Device, seconds: number) {
  const t = seconds + d.phase;
  if (d.kind === 'roller') return { p: d.p, q: rotation(d.yaw + Math.PI / 2, Math.PI / 2) };
  if (d.kind === 'fin') return { p: d.p, q: rotation(d.yaw, d.grade) };
  if (d.kind === 'swing') {
    const yaw = d.yaw + Math.sin(t * .78) * .61;
    const arm = d.size.z / 2;
    return { p: { x: d.p.x + Math.sin(yaw) * Math.cos(d.grade) * arm, y: d.p.y - Math.sin(d.grade) * arm,
      z: d.p.z + Math.cos(yaw) * Math.cos(d.grade) * arm }, q: rotation(yaw, d.grade) };
  }
  if (d.sweep) {
    const travel = Math.sin(t * 1.25) * d.sweep.amplitude;
    return { p: { x: d.p.x + Math.cos(d.yaw) * travel, y: d.p.y + d.sweep.bank * travel,
      z: d.p.z - Math.sin(d.yaw) * travel }, q: rotation(d.yaw) };
  }
  const yaw = d.yaw + (d.kind === 'paddle' ? t * 0.65 : d.kind === 'gate' ? Math.sin(t * 1.12) * 1.32 : 0);
  const pitch = d.kind === 'tilt' ? d.grade + Math.sin(t * 1.26) * 0.13 : d.kind === 'scoop' || d.kind === 'platter' ? d.grade : 0;
  const shift = d.kind === 'scoop' ? Math.sin(t * 1.18) * 0.84 : 0;
  const p = d.kind === 'scoop' ? { x: d.p.x + Math.sin(d.yaw) * shift,
    y: d.p.y + .15 + shift * .14, z: d.p.z + Math.cos(d.yaw) * shift } : d.p;
  return { p, q: rotation(yaw, pitch, d.kind === 'platter' ? seconds * .36 : 0) };
}

export type Racer = {
  id: number; identity: Identity; lane: number; tie: number; launch: GridThrow; body: RigidBody; collider: Collider;
  p: V3; previous: V3; q: Q; previousQ: Q; speed: number; grounded: boolean; belt: boolean; surface: Surface;
  progress: Progress; finish: number | null; dnf: boolean; recoveries: number; lastAdvance: number;
  probe: number; cooldown: number; reason?: string;
  splitIn?: number; splitOut?: number;
  ground?: GroundContact;
  airTime: number;
};
export type Recovery = { id: number; time: number; reason: string; check: number };
export type Impact = { id: number; force: number; surface: Surface | 'marble' | 'chime' | 'landing'; p: V3 };
export type Place = { id: number; time: number | null; distance: number; recoveries: number; reason?: string };
type ColliderTag = { surface: Surface | 'chime'; floor?: boolean; minNormalY?: number; device?: Device };

export function resultOf(ranked: readonly Racer[]): Place[] {
  return ranked.map(r => ({ id: r.id, time: r.finish, distance: r.progress.best, recoveries: r.recoveries, reason: r.reason }));
}

let initialization: Promise<void> | undefined;
export const initPhysics = () => initialization ??= RAPIER.init();

function impactMaterial(d: Device) {
  if (d.kind === 'cushion' || d.kind === 'sweeper' || d.kind === 'swing' || d.kind === 'bumper') {
    return { grip: .52, bounce: .075 };
  }
  if (d.kind === 'paddle' || d.kind === 'gate') return { grip: .27, bounce: .19 };
  return { grip: d.kind === 'roller' ? .46 : .22, bounce: d.kind === 'chime' ? .45 : .36 };
}

function triangles(g: ColliderGeometry) {
  return RAPIER.ColliderDesc.trimesh(new Float32Array(g.points), new Uint32Array(g.triangles),
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
}

export class RacePhysics {
  readonly world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  readonly racers: Racer[] = [];
  readonly finishers: Racer[] = [];
  readonly recoveries: Recovery[] = [];
  readonly visited = new Set<number>();
  private readonly order: Racer[] = [];
  private readonly movers: { device: Device; body: RigidBody }[] = [];
  private readonly tags = new Map<number, ColliderTag>();
  private readonly isFloor = (c: Collider) => this.tags.get(c.handle)?.floor === true;
  private readonly downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly landingTimes: number[] = [];
  private readonly racerColliders = new Map<number, Racer>();
  private readonly queue?: RAPIER.EventQueue;
  private readonly impacts: Impact[] = [];
  private readonly signature?: { entry: number; exit: number };
  private gate: RigidBody;
  private ticks = 0;
  private disposed = false;
  private lastOrder: number[] = [];
  private lastRankTick = -1;
  overtakes = 0;
  jams = 0;
  gripTicks = 0;
  released = false;
  releaseTick: number | null = null;

  constructor(readonly plan: Plan, roster: readonly Identity[], withAudio = false) {
    this.world.timestep = STEP;
    this.world.maxCcdSubsteps = 2;
    this.world.numSolverIterations = 5;
    if (withAudio) this.queue = new RAPIER.EventQueue(true);
    const signature = plan.modules.find(m => m.track);
    if (signature) this.signature = { entry: plan.checks.indexOf(signature.from), exit: plan.checks.indexOf(signature.to) };
    for (const m of plan.modules) {
      for (const { surface, geometry } of m.bands ?? [{ surface: m.surface, geometry: m.floor }]) {
        const material = SURFACES[surface];
        const floor = this.world.createCollider(triangles(geometry).setFriction(material.grip).setRestitution(material.bounce)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min));
        this.tags.set(floor.handle, { surface, floor: true, minNormalY: m.dropDegrees ? Math.cos((m.dropDegrees + 2) * Math.PI / 180) : .46 });
      }
      const rail = this.world.createCollider(triangles(m.rails).setRestitution(plan.obstacles ? .245 : .34)
        .setFriction(plan.obstacles ? .145 : .2));
      this.tags.set(rail.handle, { surface: m.surface });
      for (const d of m.devices) {
        if (d.kind === 'belt') continue;
        const pose = devicePose(d, 0);
        const floor = d.kind === 'tilt' || d.kind === 'scoop' || d.kind === 'platter';
        const moving = floor || d.kind === 'paddle' || d.kind === 'gate' || d.kind === 'sweeper' || d.kind === 'swing';
        const body = this.world.createRigidBody((moving ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed())
          .setTranslation(pose.p.x, pose.p.y, pose.p.z).setRotation(pose.q));
        const rubberDome = d.kind === 'cushion' || d.kind === 'sweeper';
        const corner = .085;
        const desc = d.kind === 'roller' ? RAPIER.ColliderDesc.capsule((d.size.x - d.size.y) / 2, d.size.y / 2)
          : d.kind === 'swing' || d.kind === 'fin'
          ? RAPIER.ColliderDesc.roundCuboid(d.size.x / 2 - corner, d.size.y / 2 - corner, d.size.z / 2 - corner, corner)
          : rubberDome ? RAPIER.ColliderDesc.ball(d.size.x / 2) : ['peg', 'chime', 'bumper', 'platter'].includes(d.kind)
          ? RAPIER.ColliderDesc.cylinder(d.size.y / 2, d.size.x / 2)
          : RAPIER.ColliderDesc.cuboid(d.size.x / 2, d.size.y / 2, d.size.z / 2);
        const material = floor ? SURFACES[d.surface] : impactMaterial(d);
        desc.setFriction(d.kind === 'tilt' ? .55 : material.grip).setRestitution(material.bounce)
          .setRestitutionCombineRule(material.bounce > .23 && !floor ? RAPIER.CoefficientCombineRule.Max : RAPIER.CoefficientCombineRule.Min);
        if (!floor) desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
        const c = this.world.createCollider(desc, body);
        this.tags.set(c.handle, { surface: d.kind === 'chime' ? 'chime' : d.surface, floor, device: d });
        if (moving) this.movers.push({ device: d, body });
      }
    }
    const start = plan.nodes[0];
    const gateNode = plan.nodes[2];
    this.gate = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(gateNode.x, gateNode.y + 0.45, gateNode.z));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(start.half, 0.48, 0.09), this.gate);
    const ties = new Random(`${plan.seed}/tie`).shuffle(roster.map(r => r.id));
    const throws = gridThrows(plan, roster.length);
    for (const [lane, identity] of roster.entries()) {
      const launch = throws[lane];
      const p = heldMarble(launch, HOLD_ANGLE, { x: 0, y: 0, z: 0 });
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
        .setLinearDamping(.018).setAngularDamping(.006).setCcdEnabled(true).setCanSleep(false).setGravityScale(0));
      const desc = RAPIER.ColliderDesc.ball(RADIUS).setMass(1).setFriction(0.61).setRestitution(0.23);
      if (withAudio) desc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(25);
      const collider = this.world.createCollider(desc, body);
      const q = body.rotation();
      const racer = { id: identity.id, identity, lane, tie: ties.indexOf(identity.id), launch, body, collider, p, previous: p, q, previousQ: q,
        speed: 0, grounded: false, belt: false, surface: plan.modules[0].surface,
        progress: { check: 0, segment: 0, distance: start.s, best: start.s, branch: 0 },
        finish: null, dnf: false, recoveries: 0, lastAdvance: 0, probe: 0, cooldown: 0, airTime: 0,
      };
      this.racers.push(racer);
      this.racerColliders.set(collider.handle, racer);
    }
    this.order.push(...this.racers);
  }

  get elapsed() { return this.ticks * STEP; }

  release() {
    if (this.released) return;
    this.released = true;
    this.releaseTick = this.ticks;
    this.gate.setEnabled(false);
    for (const r of this.racers) {
      r.p = r.previous = heldMarble(r.launch, r.launch.releaseAngle, { x: 0, y: 0, z: 0 });
      r.body.setTranslation(r.p, true);
      r.body.setLinvel(r.launch.velocity, true);
      r.body.setGravityScale(1, true);
      r.speed = r.launch.speed;
    }
  }

  step() {
    if (!this.released || this.ticks >= CAP / STEP) return;
    const start = this.elapsed;
    this.ticks++;
    const times = this.landingTimes;
    times.length = 0;
    for (const r of this.racers) {
      if (r.finish !== null || r.dnf) continue;
      r.previous = r.p;
      r.previousQ = r.q;
      if (r.ground) continue;
      const v = r.body.linvel();
      v.y -= .5 * GRAVITY * STEP;
      const hit = this.world.castShape(r.p, r.q, v, r.collider.shape, 0, STEP, false,
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, undefined, this.isFloor);
      if (!hit || hit.time_of_impact <= 0 || hit.normal1.y < (this.tags.get(hit.collider.handle)?.minNormalY ?? .46) || dot(v, hit.normal1) > -.45) continue;
      // Resolve the contact just after touch-down. Marbles arriving together share a solver step.
      const boundary = Math.ceil((hit.time_of_impact + .0001) / LANDING_INTERVAL) * LANDING_INTERVAL;
      if (boundary < STEP) times.push(boundary);
    }
    const arrived: Racer[] = [];
    let offset = 0;
    for (const end of times.sort((a, b) => a - b)) {
      if (end > offset) this.advance(start + offset, end - offset, arrived);
      offset = end;
    }
    this.advance(start + offset, STEP - offset, arrived);
    arrived.sort((a, b) => compareArrivals({ id: a.id, time: a.finish!, tie: a.tie }, { id: b.id, time: b.finish!, tie: b.tie }));
    this.finishers.push(...arrived);
    if (this.ticks % 12 === 0) this.ranked();
  }

  private advance(start: number, seconds: number, arrived: Racer[]) {
    const now = start + seconds;
    this.world.timestep = seconds;
    for (const { device, body } of this.movers) {
      const pose = devicePose(device, now);
      body.setNextKinematicRotation(pose.q);
      if (device.kind === 'scoop' || device.kind === 'sweeper' || device.kind === 'swing') body.setNextKinematicTranslation(pose.p);
    }
    for (const r of this.racers) {
      if (r.finish !== null || r.dnf) continue;
      const v = r.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed;
        v.x *= k; v.y *= k; v.z *= k;
        r.body.setLinvel(v, true);
        const spin = r.body.angvel();
        r.body.setAngvel({ x: spin.x * k, y: spin.y * k, z: spin.z * k }, true);
      }
      if (r.ground) this.applyRollingResistance(r, v, r.ground, seconds);
    }
    this.world.step(this.queue);
    for (const r of this.racers) {
      if (r.finish !== null || r.dnf) continue;
      const previous = r.p;
      r.p = r.body.translation();
      r.q = r.body.rotation();
      const v = r.body.linvel();
      if (![r.p.x, r.p.y, r.p.z, v.x, v.y, v.z, r.q.x, r.q.y, r.q.z, r.q.w].every(Number.isFinite)) {
        this.recover(r, 'Invalid physics state');
        continue;
      }
      r.speed = Math.hypot(v.x, v.y, v.z);
      const previousCheck = r.progress.check;
      const crossing = routeProgress(this.plan, r.progress, previous, r.p);
      if (this.signature && previousCheck !== r.progress.check) {
        if (r.progress.check === this.signature.entry) r.splitIn = now;
        if (r.progress.check === this.signature.exit) r.splitOut = now;
      }
      if (crossing !== null) {
        r.finish = start + crossing * seconds;
        r.body.setEnabled(false);
        arrived.push(r);
        continue;
      }
      const n = this.plan.nodes[r.progress.segment];
      const module = this.plan.modules[n.module];
      this.visited.add(n.module);
      const u = side(n, r.p);
      const branch = module.track ? branchContact(n, module, u, r.p.y, 1.35) : undefined;
      const floor = this.plan.obstacles ? deckPoint(n, module, u) : point(n, u);
      const dy = n.pitch !== undefined ? chuteClearance(n, r.p)
        : (branch?.dy ?? r.p.y - floor.y) + along(n, r.p) * 0.195 * this.plan.gradeFactor;
      r.surface = module.surface;
      r.ground = this.groundContact(r, v, seconds);
      r.grounded = Boolean(r.ground);
      if (r.grounded && (r.surface === 'grit' || r.surface === 'brakepad')) this.gripTicks += seconds / STEP;
      r.belt = r.grounded && module.kind === 'conveyor' && n.t > 0.22 && n.t < 0.75;
      if (this.queue && r.ground && r.airTime >= 4 * STEP && r.ground.impulse >= 1.15 && r.cooldown <= now && this.impacts.length < 24) {
        r.cooldown = now + .23;
        this.impacts.push({ id: r.id, p: r.ground.point, surface: module.kind === 'jump' || r.surface === 'cloth' ? 'landing' : r.surface,
          force: r.ground.impulse / STEP });
      }
      r.airTime = r.grounded ? 0 : r.airTime + seconds;
      if ((module.track ? !branch : Math.abs(u) > n.half + 1.35) || dy < -2.5 || dy > 3.8) {
        this.recover(r, 'Left the catch area');
        continue;
      }
      if (r.progress.distance > r.probe + 0.65) {
        r.probe = r.progress.distance;
        r.lastAdvance = now;
      } else if (now - r.lastAdvance > 3.2) {
        const jam = module.devices.some(d => (d.kind === 'gate' || d.kind === 'scoop' || d.kind === 'paddle' || d.kind === 'sweeper' || d.kind === 'swing')
          && Math.abs(d.s - r.progress.distance) < 3);
        if (jam) this.jams++;
        this.recover(r, jam ? 'Mechanism jam' : 'Stalled');
      }
    }
    this.queue?.drainContactForceEvents(e => {
      const a = e.collider1(), b = e.collider2();
      const r = this.racerColliders.get(a) ?? this.racerColliders.get(b);
      if (!r || r.cooldown > now || this.impacts.length >= 24) return;
      const other = a === r.collider.handle ? b : a;
      const tag = this.tags.get(other);
      const surface = this.racerColliders.has(other) ? 'marble' : tag?.surface ?? 'wood';
      const force = e.totalForceMagnitude() * (seconds / STEP);
      if (force < (tag?.floor ? 78 : 31)) return;
      r.cooldown = now + (tag?.floor ? 0.23 : 0.12);
      this.impacts.push({ id: r.id, force, surface, p: r.p });
    });
  }

  drainImpacts() { return this.impacts.splice(0); }

  floorBelow(center: V3, reach: number) {
    this.downRay.origin = center;
    const hit = this.world.castRayAndGetNormal(this.downRay, reach, false, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      undefined, undefined, undefined, this.isFloor);
    if (hit && hit.normal.y >= (this.tags.get(hit.collider.handle)?.minNormalY ?? .46)) return { point: this.downRay.pointAt(hit.timeOfImpact), normal: hit.normal };
  }

  private groundContact(r: Racer, v: V3, seconds: number): GroundContact | undefined {
    const weightedNormal = { x: 0, y: 0, z: 0 };
    let impulse = 0;
    let bestLoad = 0;
    let strongest: { point: V3; surface: Surface; body?: RigidBody } | undefined;
    this.world.contactPairsWith(r.collider, c => {
      const tag = this.tags.get(c.handle);
      if (!tag?.floor || tag.surface === 'chime') return;
      const { surface } = tag;
      this.world.contactPair(r.collider, c, (manifold, flipped) => {
        if (!manifold.numSolverContacts()) return;
        const normal = manifold.normal();
        const sign = flipped ? 1 : -1;
        if (sign * normal.y < (tag.minNormalY ?? .46)) return;
        let load = 0;
        for (let i = 0; i < manifold.numContacts(); i++) {
          if (manifold.contactDist(i) <= .016) load += manifold.contactImpulse(i);
        }
        if (load <= .0001) return;
        impulse += load;
        weightedNormal.x += normal.x * sign * load;
        weightedNormal.y += normal.y * sign * load;
        weightedNormal.z += normal.z * sign * load;
        const verticalLoad = normal.y * sign * load;
        if (verticalLoad > bestLoad) {
          bestLoad = verticalLoad;
          strongest = { point: manifold.solverContactPoint(0), surface, body: tag.device ? c.parent() ?? undefined : undefined };
        }
      });
    });
    if (!strongest) return;
    const length = Math.hypot(weightedNormal.x, weightedNormal.y, weightedNormal.z);
    const normal = { x: weightedNormal.x / length, y: weightedNormal.y / length, z: weightedNormal.z / length };
    const { point, surface, body } = strongest;
    const velocity = body?.velocityAtPoint(point);
    const relative = velocity ? { x: v.x - velocity.x, y: v.y - velocity.y, z: v.z - velocity.z } : v;
    const vertical = dot(relative, normal);
    r.surface = surface;
    return { normal, point, impulse, force: impulse / seconds, speed: Math.hypot(relative.x - normal.x * vertical,
      relative.y - normal.y * vertical, relative.z - normal.z * vertical), velocity, angularVelocity: body?.angvel() };
  }

  private applyRollingResistance(r: Racer, v: V3, ground: GroundContact, seconds: number) {
    const { normal, velocity } = ground;
    const relative = velocity ? { x: v.x - velocity.x, y: v.y - velocity.y, z: v.z - velocity.z } : v;
    const normalSpeed = dot(relative, normal);
    if (normalSpeed > .12) return;
    // Rapier supplies gravity and sliding friction. Rolling loss is a contact torque
    // opposing rotation about the deck, proportional to load and arm length.
    const spin = r.body.angvel();
    const support = ground.angularVelocity;
    const wx = spin.x - (support?.x ?? 0), wy = spin.y - (support?.y ?? 0), wz = spin.z - (support?.z ?? 0);
    const twist = wx * normal.x + wy * normal.y + wz * normal.z;
    const x = wx - normal.x * twist, y = wy - normal.y * twist, z = wz - normal.z * twist;
    const angularSpeed = Math.hypot(x, y, z);
    if (angularSpeed > .0001) {
      const materialDrag = SURFACES[r.surface].drag;
      const rollingSpeed = RADIUS * angularSpeed;
      const loss = (r.surface === 'slide' ? .0035 : .008) + .045 * materialDrag
        + (materialDrag + (r.surface === 'slide' ? .125 : .238)) * rollingSpeed / GRAVITY;
      const load = Math.min(ground.force, 1.45 * GRAVITY);
      const impulse = Math.min(INERTIA * angularSpeed, seconds * load * RADIUS * loss);
      const scale = -impulse / angularSpeed;
      r.body.applyTorqueImpulse({ x: x * scale, y: y * scale, z: z * scale }, true);
    }
    if (r.belt) {
      const n = this.plan.nodes[r.progress.segment], x = Math.sin(n.yaw), z = Math.cos(n.yaw);
      const tilt = normal.x * x + normal.z * z;
      const drive = .65 * seconds;
      r.body.applyImpulse({ x: (x - tilt * normal.x) * drive, y: -tilt * normal.y * drive,
        z: (z - tilt * normal.z) * drive }, true);
    }
  }

  recover(r: Racer, reason: string) {
    if (r.finish !== null || r.dnf) return;
    if (r.recoveries === RECOVERY_LIMIT) {
      this.dnf(r, reason);
      return;
    }
    const check = this.plan.checks[r.progress.check];
    const i = Math.max(1, check - (r.progress.check === 0 ? 0 : 1));
    const n = this.plan.nodes[i];
    const offset = (r.lane - (this.racers.length - 1) / 2) * 0.61;
    const module = this.plan.modules[n.module];
    const across = clamp(offset, -n.half + .65, n.half - .65);
    const p = n.pitch !== undefined ? chutePoint(n, across, RADIUS + .18) : module.track ? branchPoint(n, module, r.progress.branch ? r.progress.branch * module.lean : Math.sign(offset) || 1,
      clamp(offset * .25, -.55, .55), RADIUS + .18) : this.plan.obstacles ? deckPoint(n, module, across) : point(n, across);
    if (!module.track && n.pitch === undefined) p.y += RADIUS + .18;
    r.body.setTranslation(p, true);
    const pitch = n.pitch ?? 0, forward = Math.cos(pitch) * 1.4;
    r.body.setLinvel({ x: Math.sin(n.yaw) * forward, y: -Math.sin(pitch) * 1.4, z: Math.cos(n.yaw) * forward }, true);
    r.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (reason === 'Invalid physics state') {
      r.q = rotation(n.yaw);
      r.body.setRotation(r.q, true);
    }
    r.previousQ = r.q;
    r.previous = r.p = p;
    r.grounded = r.belt = false;
    r.ground = undefined;
    r.airTime = 0;
    r.progress.segment = i;
    r.progress.distance = Math.min(r.progress.distance, n.s);
    r.lastAdvance = this.elapsed;
    r.probe = r.progress.distance;
    r.recoveries++;
    this.recoveries.push({ id: r.id, time: this.elapsed, reason, check: r.progress.check });
  }

  dnf(r: Racer, reason: string) {
    if (r.finish !== null || r.dnf) return;
    r.dnf = true;
    r.reason = reason;
    r.body.setEnabled(false);
  }

  resolve(reason = 'Time limit') {
    for (const r of this.racers) this.dnf(r, reason);
    return resultOf(this.ranked());
  }

  ranked() {
    this.order.sort((a, b) => {
      if (a.finish !== null && b.finish !== null) return this.finishers.indexOf(a) - this.finishers.indexOf(b);
      if (a.finish !== null) return -1;
      if (b.finish !== null) return 1;
      return Number(a.dnf) - Number(b.dnf)
        || (b.dnf ? b.progress.best - a.progress.best : b.progress.distance - a.progress.distance) || a.tie - b.tie;
    });
    if (this.lastRankTick !== this.ticks && this.elapsed > 1) {
      const active = this.order.filter(r => !r.dnf).map(r => r.id);
      const old = this.lastOrder.filter(id => active.includes(id));
      if (old.length === active.length) {
        for (let i = 0; i < active.length; i++) {
          for (let j = i + 1; j < active.length; j++) {
            if (old.indexOf(active[i]) > old.indexOf(active[j])) this.overtakes++;
          }
        }
      }
      this.lastOrder = active;
      this.lastRankTick = this.ticks;
    }
    return this.order;
  }

  resources() { return { bodies: this.world.bodies.len(), colliders: this.world.colliders.len(), impactQueue: this.impacts.length }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.queue?.free();
    this.world.free();
  }
}
