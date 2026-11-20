import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { Vector3 } from 'three';
import { broadcastSettings, raceSettings, settingsFrom, THEMES } from '../src/config';
import { bayOffset, finishPoint, finishRack, podiumLayout, ROLLOUT_SECONDS, rolloutPosition } from '../src/finish-runout';
import { IDENTITIES, rosterFor, RADIUS } from '../src/identities';
import { GridCrew } from '../src/grid-crew';
import { gridThrows, HOST_SCALE, PAD_HEIGHT, throwPose } from '../src/grid-launch';
import { Lifecycle } from '../src/lifecycle';
import { LiveOrder } from '../src/live-order';
import { CAP, devicePose, initPhysics, RacePhysics, RECOVERY_LIMIT, STEP } from '../src/physics';
import { compareArrivals, crossing, routeProgress } from '../src/progress';
import { AdaptiveScale } from '../src/render-scale';
import { commitRound, freshSession, loadSession, saveSession } from '../src/session';
import { along, branchPoint, deckPoint, MECHANISMS, nodeAt, pathPoseAt, planFor, point, side, validatePlan } from '../src/track';
import { selectPlan, simulate } from '../src/calibration';
import { signatureFor, TRACK_IDS } from '../src/signatures';

before(initPhysics);
const options = settingsFrom({ track: 'classic' });
const plan = planFor(options, 1);

test('settings clamp and query overrides saved values', () => {
  const config = settingsFrom({ marbles: 4, seed: 'saved', master: 0.49 }, '?marbles=10&raceTarget=20&audio=other&music=-1&mute=1&theme=night');
  assert.deepEqual([config.marbles, config.raceTarget, config.audio, config.music, config.seed, config.master, config.mute, config.theme],
    [8, 60, 'balanced', 0, 'saved', 0.49, true, 'night']);
  assert.equal(settingsFrom({}, '?pick=&countdown=Infinity&marbles=no').pick, 12);
});

test('the source URL owns only the six broadcast options across reloads', () => {
  const setup = broadcastSettings('?track=cedar-creek&marbles=8&raceTarget=80&seed=replay&quality=low&mute=1&pick=3&grace=0&hud=off&announcer=0');
  assert.deepEqual([setup.track, setup.marbles, setup.raceTarget, setup.seed, setup.generation, setup.quality, setup.mute],
    ['cedar-creek', 8, 80, 'replay', 'seeded', 'low', true]);
  assert.deepEqual([setup.pick, setup.grace, setup.hud, setup.announcer], [12, 8, 'full', true]);
  const random = broadcastSettings('?marbles=random&raceTarget=random');
  assert.deepEqual([random.roster, random.pace], ['random', 'random']);
  const historic = freshSession(setup, 'old-profile');
  historic.next = 3;
  historic.stats[0].points = 18;
  let raw = JSON.stringify({ ...historic, settings: { ...setup, hud: 'off', controls: 'show' } });
  const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
  const resumed = loadSession(storage);
  assert.deepEqual(resumed.settings, broadcastSettings(''));
  assert.deepEqual([resumed.next, resumed.stats[0].points], [3, 18]);
  assert.ok(saveSession(storage, resumed));
  assert.equal('settings' in JSON.parse(raw), false);
});

test('every entrant gets exactly one ceremony place, including a field of non-finishers', () => {
  for (let count = 4; count <= 8; count++) for (let finishers = 0; finishers <= count; finishers++) {
    const places = Array.from({length: count}, (_, i) => ({
      id: count - i, time: i < finishers ? 62 + i : null, distance: 100 - i, recoveries: 0,
    }));
    const {medals, field, pitch, size} = podiumLayout(places);
    assert.deepEqual([...medals, ...field], places);
    assert.equal(medals.length, Math.min(3, finishers));
    assert.ok(medals.every(p => p.time !== null));
    assert.ok(size * .8 < pitch && (field.length - 1) * pitch <= 4.12 + 1e-6);
  }
});

test('show configuration generates fresh layouts by session and bounded fields by race', () => {
  const settings = settingsFrom({ roster: 'random', minMarbles: 7, maxMarbles: 5, pace: 'random', minPace: 126, maxPace: 118, theme: 'random' });
  assert.deepEqual([settings.minMarbles, settings.maxMarbles, settings.minPace, settings.maxPace], [5, 7, 118, 126]);
  const first = raceSettings(settings, 'local-a', 1);
  assert.deepEqual(raceSettings(settings, 'local-a', 1), first);
  assert.notEqual(planFor(raceSettings(settings, 'local-b', 1), 1).seed, planFor(first, 1).seed);
  const rounds = Array.from({ length: 20 }, (_, i) => i + 1);
  const targets = rounds.map(round => raceSettings(settings, 'local-a', round).raceTarget);
  assert.ok(new Set(targets).size > 2 && targets.every(value => value >= 118 && value <= 126));
  assert.ok(rounds.every(round => {
    const count = rosterFor(raceSettings(settings, 'local-a', round), round).length;
    return count >= 5 && count <= 7;
  }));
  assert.equal(new Set(rounds.map(round => planFor(raceSettings(settings, 'local-a', round), round).seed)).size, rounds.length);
  const repeatable = settingsFrom({}, '?seed=legacy');
  assert.equal(repeatable.generation, 'seeded');
  assert.deepEqual(raceSettings(repeatable, 'local-a', 1), raceSettings(repeatable, 'local-b', 1));
  assert.equal(rosterFor(settingsFrom({ roster: 'mixed', marbles: 4 }), 1).length, 4);
});

test('every entrant stays in its own host’s hand until a simultaneous launch with distinct, repeatable velocities', () => {
  for (const count of [4, 5, 6, 7, 8]) {
    const roster = rosterFor(settingsFrom({ marbles: count }), 1);
    const race = new RacePhysics(plan, roster);
    const crew = new GridCrew();
    try {
      Array.from(crew.build(plan, roster));
      const hosts = crew.group.children;
      assert.equal(hosts.length, count);
      assert.equal(new Set(hosts.map(host => host.name)).size, count);
      assert.deepEqual(race.racers.map(r => r.launch), gridThrows(plan, count));
      assert.notDeepEqual(race.racers.map(r => r.launch), gridThrows({ ...plan, seed: plan.seed + '/next' }, count));
      const before = roster.map(() => new Vector3()), release = roster.map(() => new Vector3());
      for (const time of [-45, -3, -.5, -.18, -.00001, 0]) {
        crew.pose(time);
        for (const r of race.racers) {
          const center = new Vector3();
          crew.ball(r.lane, center);
          const hand = hosts[r.lane].getObjectByName('Palm')!;
          const palm = hand.localToWorld(new Vector3(0, PAD_HEIGHT, throwPose(r.launch, time).roll));
          assert.ok(Math.hypot(palm.x - center.x, palm.z - center.z) < 1e-8);
          assert.ok(Math.abs(center.y - palm.y - RADIUS) < 1e-8);
          if (time <= -3) assert.ok(center.distanceTo(r.p) < 1e-8);
          if (time === -.00001) before[r.lane].copy(center);
          if (time === 0) release[r.lane].copy(center);
        }
        race.step();
        assert.equal(race.elapsed, 0);
        assert.ok(race.racers.every(r => r.speed === 0 && !r.grounded));
      }
      race.release();
      const heights: number[] = [], speeds: number[] = [];
      for (const racer of race.racers) {
        const center = release[racer.lane], velocity = new Vector3().copy(racer.body.linvel());
        assert.ok(center.distanceTo(racer.body.translation()) < 1e-5);
        assert.ok(center.clone().sub(before[racer.lane]).multiplyScalar(1e5).distanceTo(velocity) < .001);
        const spin = racer.body.angvel();
        assert.ok(Math.abs(Math.hypot(spin.x, spin.y, spin.z) * RADIUS - 2 * HOST_SCALE * racer.launch.travel / .13) < 1e-5);
        assert.ok(Math.abs(center.z - release[0].z) < 1e-8);
        speeds.push(velocity.length());
        heights.push(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) * 180 / Math.PI);
      }
      assert.equal(new Set(speeds.map(v => v.toFixed(2))).size, count);
      assert.equal(new Set(heights.map(v => v.toFixed(1))).size, count);
      assert.ok(Math.max(...speeds) - Math.min(...speeds) > 1);
      assert.ok(Math.max(...heights) - Math.min(...heights) > 25);
      const landed = new Set<number>();
      for (let tick = 0; tick < 100; tick++) {
        race.step();
        for (const r of race.racers) {
          if (!tick) assert.ok(!r.grounded && r.p.z > release[r.lane].z);
          if (r.grounded) landed.add(r.id);
        }
      }
      assert.equal(landed.size, count);
      assert.ok(race.racers.every(r => r.firstLanding !== undefined && r.firstLanding > .2));
      assert.ok(race.racers.every(r => r.progress.segment > 2 && !r.dnf));
      assert.equal(race.recoveries.length, 0);
    } finally { crew.dispose(); race.dispose(); }
  }
});

test('finish runout travels forward into distinct bays on short tracks', () => {
  const shortTrack = planFor(settingsFrom({ track: 'paper-moon', raceTarget: 60 }), 1);
  const rack = finishRack(shortTrack, 8);
  assert.ok(rack.depth + .54 < shortTrack.nodes.at(-1)!.s - shortTrack.length);
  const start = finishPoint(rack, 2.63, .09, RADIUS);
  for (let rank = 0; rank < rack.entrants; rank++) {
    const target = { x: 0, y: 0, z: 0 };
    rolloutPosition(rack, start, rank, 0, target);
    assert.ok(Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z) < 1e-9);
    let prior = along(rack.line, target);
    for (const t of [.15, .4, .8, 1.2, ROLLOUT_SECONDS]) {
      rolloutPosition(rack, start, rank, t, target);
      const forward = along(rack.line, target);
      assert.ok(forward >= prior - 1e-9 && forward <= rack.depth + 1e-9);
      prior = forward;
    }
    assert.deepEqual(target, finishPoint(rack, bayOffset(rack, rank), rack.depth, RADIUS + .035));
    assert.ok(Math.abs(bayOffset(rack, rank)) + RADIUS < rack.line.half);
    if (rank) assert.ok(bayOffset(rack, rank) - bayOffset(rack, rank - 1) > 2 * RADIUS);
  }
});

test('live positions hold near-ties, settle sustained passes and snap to finish order', () => {
  const racer = (id: number, distance: number, finish: number | null = null, dnf = false) =>
    ({ id, progress: { distance }, finish, dnf });
  const board = new LiveOrder();
  const ids = (entries: ReturnType<typeof racer>[], seconds: number) => board.update(entries, seconds).map(entry => entry.id);
  assert.deepEqual(ids([racer(1, 5), racer(2, 4.99), racer(3, 4)], 1), [1, 2, 3]);
  assert.deepEqual(ids([racer(2, 5.1), racer(1, 5.08), racer(3, 4)], 1.08), [1, 2, 3]);
  assert.deepEqual(ids([racer(1, 5.2), racer(2, 5.18), racer(3, 4)], 1.16), [1, 2, 3]);
  const sustained = [racer(2, 5.3), racer(1, 5.18), racer(3, 4)];
  assert.deepEqual(ids(sustained, 1.24), [1, 2, 3]);
  assert.deepEqual(ids(sustained, 1.5), [2, 1, 3]);
  assert.deepEqual(ids([racer(3, 10, 2), racer(2, 10, 2.02), racer(1, 9.99)], 2.02), [3, 2, 1]);
  assert.deepEqual(ids([racer(3, 10, 2), racer(2, 10, 2.02), racer(1, 9.99, null, true)], 2.1), [3, 2, 1]);
});

test('adaptive scale reacts to a busy window, retains its scale at handoff and recovers gradually', () => {
  const quality = new AdaptiveScale('medium');
  const sample = (count: number, ms: number) => { for (let i = 0; i < count; i++) quality.sample(ms); };
  sample(1, 800);
  assert.equal(quality.scale, 1);
  sample(67, 33);
  assert.ok(Math.abs(quality.scale - 0.93) < 1e-9);
  quality.pause();
  assert.ok(Math.abs(quality.scale - 0.93) < 1e-9);
  sample(600, 17);
  assert.ok(Math.abs(quality.scale - 0.93) < 1e-9);
  sample(120, 17);
  assert.ok(Math.abs(quality.scale - 0.965) < 1e-9);
  quality.setQuality('high');
  sample(200, 33);
  assert.equal(quality.scale, 1);
});

test('camera track samples remain continuous across short starting-section joins', () => {
  const short = planFor(settingsFrom({ raceTarget: 60 }), 1);
  const end = short.nodes[short.modules[0].to];
  const pose = () => ({ x: 0, y: 0, z: 0, yaw: 0 });
  const before = pathPoseAt(short, end.s - 0.001, pose());
  const after = pathPoseAt(short, end.s + 0.001, pose());
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) < 0.003);
  assert.ok(Math.abs(after.yaw - before.yaw) < 0.001);
  const midpoint = pathPoseAt(short, (short.nodes[0].s + short.nodes[1].s) / 2, pose());
  assert.ok(Math.abs(midpoint.z - (short.nodes[0].z + short.nodes[1].z) / 2) < 1e-9);
});

test('every roster size has frozen members, fair lane draws and identical sphere properties', () => {
  for (let count = 4; count <= 8; count++) {
    const settings = settingsFrom({ marbles: count });
    const roster = rosterFor(settings, 1);
    const different = new Set(Array.from({ length: 10 }, (_, i) => rosterFor(settings, i + 1).map(r => r.id).join(',')));
    assert.ok(different.size >= 6);
    assert.equal(roster.length, count);
    assert.ok(Object.isFrozen(roster) && roster.every(Object.isFrozen));
    const race = new RacePhysics(plan, roster);
    assert.ok(race.racers.every(r => r.body.mass() === 1 && r.body.gravityScale() === 0 && Math.abs(r.collider.radius() - RADIUS) < 1e-6));
    assert.equal(new Set(race.racers.map(r => r.collider.friction())).size, 1);
    assert.equal(new Set(race.racers.map(r => r.collider.restitution())).size, 1);
    race.step();
    assert.equal(race.elapsed, 0);
    race.release();
    race.release();
    assert.ok(race.racers.every(r => r.body.gravityScale() === 1));
    assert.equal(race.releaseTick, 0);
    race.step();
    assert.equal(race.elapsed, STEP);
    assert.ok(race.racers.every(r => !r.grounded && r.body.linvel().y > 0), 'The whole field launches on the gate tick');
    race.dispose();
    race.dispose();
  }
  const random = settingsFrom({ roster: 'random' });
  const samples = Array.from({ length: 50 }, (_, i) => rosterFor(random, i + 1));
  assert.deepEqual([...new Set(samples.map(r => r.length))].sort(), [4, 5, 6, 7, 8]);
  assert.ok(samples.every(r => new Set(r.map(v => v.id)).size === r.length));
});

test('all lifecycle deadlines and finishing cap advance automatically', () => {
  const l = new Lifecycle(options);
  const idle = { done: false, elapsed: 0 };
  for (const [state, next, seconds] of [
    ['PREPARE', 'PICK_MARBLE', 5], ['PICK_MARBLE', 'COUNTDOWN', 12], ['COUNTDOWN', 'RACING', 5],
    ['RACING', 'CELEBRATION', CAP], ['FINISHING', 'CELEBRATION', 2],
    ['CELEBRATION', 'RESULTS', 8], ['RESULTS', 'NEXT_ROUND', 5], ['NEXT_ROUND', 'PREPARE', 0.8],
  ] as const) {
    l.enter(state, 1000, 178);
    assert.equal(l.next(1000 + seconds * 1000 - 1, false, idle), null);
    assert.equal(l.next(1000 + seconds * 1000, false, idle), next);
  }
  l.enter('RACING', 0);
  assert.equal(l.next(120001, true, { done: false, elapsed: 120, first: 120 }), 'FINISHING');
});

test('course seeds reproduce physical geometry, modules and compatible connectors', () => {
  assert.deepEqual(planFor(options, 1), plan);
  assert.notEqual(planFor(options, 2).signature, plan.signature);
  for (let i = 1; i <= 20; i++) {
    const p = planFor(options, i);
    assert.equal(p.theme, THEMES[(i - 1) % 4]);
    assert.ok(validatePlan(p));
    assert.equal(p.modules.length, MECHANISMS.length + 4);
    assert.ok(p.modules.every(m => m.floor.triangles.length && m.rails.triangles.length));
    for (const m of p.modules.slice(1)) {
      const a = p.nodes[m.from], b = p.nodes[m.from + 1];
      assert.ok(Math.abs(b.y - a.y) < 0.4 && Math.hypot(b.x - a.x, b.z - a.z) < 1.04);
    }
  }
});

test('same-tick finish ordering uses swept time then stable pre-drawn tie policy', () => {
  const n = plan.nodes[plan.finish];
  const relative = (distance: number) => ({ x: n.x + Math.sin(n.yaw) * distance, y: n.y + RADIUS, z: n.z + Math.cos(n.yaw) * distance });
  const a = crossing(n, relative(-0.13), relative(0.01));
  const b = crossing(n, relative(-0.04), relative(0.10));
  assert.ok(a !== null && b !== null && b < a);
  assert.equal(crossing(n, relative(0.1), relative(-0.08)), null);
  const arrivals = [{ id: 1, time: 100 + a * STEP, tie: 0 }, { id: 2, time: 100 + b * STEP, tie: 1 }].sort(compareArrivals);
  assert.equal(arrivals[0].id, 2);
  assert.equal(compareArrivals({ id: 1, time: 100.000000001, tie: 1 }, { id: 2, time: 100, tie: 0 }), 1);
  const progress = { check: 0, segment: 1, distance: 1, best: 1, branch: 0 };
  assert.equal(routeProgress(plan, progress, relative(-0.1), relative(0.1)), null);
  assert.equal(progress.check, 0);
});

test('real Rapier traversal reaches every mechanism, both branches and legal finish', () => {
  const seen = new Set();
  const branches = new Set();
  for (let i = 0; i < 5; i++) {
    const s = settingsFrom({ track: 'classic', seed: `traversal-${i}`, marbles: 4 + i });
    const result = simulate(planFor(s, i + 1), rosterFor(s, i + 1), 8);
    result.visited.forEach(v => seen.add(v));
    result.branches.forEach(v => branches.add(v));
    assert.ok(result.first && result.first >= 60 && result.last! <= CAP);
    assert.ok(result.results.filter(p => p.time !== null).every(p => p.distance > 460));
    assert.equal(new Set(result.results.map(p => p.id)).size, s.marbles);
  }
  assert.ok(MECHANISMS.every(m => seen.has(m)));
  assert.deepEqual([...branches].sort(), [-1, 1]);
});

test('both branches have equivalent legal checkpoint progress', () => {
  const module = plan.modules.find(m => m.kind === 'split')!;
  const i = plan.checks.findIndex(i => i > module.from + (module.to - module.from) * 0.36);
  const n = plan.nodes[plan.checks[i]];
  const visits = [-1.6, 1.6].map(u => {
    const center = point(n, u, RADIUS);
    const offset = Math.sin(n.yaw) * 0.1, dz = Math.cos(n.yaw) * 0.1;
    const p = { check: i - 1, segment: plan.checks[i] - 1, distance: n.s - 0.1, best: n.s - 0.1, branch: 0 };
    routeProgress(plan, p, { ...center, x: center.x - offset, z: center.z - dz }, { ...center, x: center.x + offset, z: center.z + dz });
    return p;
  });
  assert.equal(visits[0].check, visits[1].check);
  assert.ok(Math.abs(visits[0].distance - visits[1].distance) < 0.035);
  assert.deepEqual(visits.map(p => p.branch), [-1, 1]);
});

test('high-speed ball stays inside a thin rail and recovery never gives forward progress', () => {
  const race = new RacePhysics(plan, rosterFor(options, 1));
  const r = race.racers[0];
  race.release();
  const n = plan.nodes[6];
  r.body.setTranslation(point(n, n.half - RADIUS - 0.05, RADIUS + 0.1), true);
  r.body.setLinvel({ x: 11.8, y: 0, z: 0.9 }, true);
  r.p = r.body.translation();
  r.progress.segment = 6;
  r.progress.check = 1;
  r.progress.distance = n.s;
  race.step();
  assert.ok(r.body.translation().x < n.half + 0.005);
  const d = r.progress.distance;
  for (let i = 0; i <= RECOVERY_LIMIT; i++) race.recover(r, 'Test fall');
  assert.equal(r.recoveries, RECOVERY_LIMIT);
  assert.ok(r.dnf && r.progress.distance <= d);
  assert.equal(race.recoveries.length, RECOVERY_LIMIT);
  assert.ok(race.resolve().every(a => a.time === null));
  race.dispose();
});

test('airborne marbles coast, then rebound and sound according to the surface they hit', () => {
  const rebounds = [];
  for (const surface of ['glaze', 'cork'] as const) {
    const course = planFor(settingsFrom({ track: 'paper-moon', seed: 'postmark-26' }), 1);
    course.modules[0].surface = surface;
    const race = new RacePhysics(course, IDENTITIES.slice(0, 1), true);
    try {
      race.release();
      const [r] = race.racers;
      const n = course.nodes[6];
      r.p = r.previous = point(n, .8, RADIUS + .65);
      r.progress = { check: 1, segment: 6, distance: n.s, best: n.s, branch: 0 };
      r.body.setTranslation(r.p, true);
      r.body.setLinvel({ x: 0, y: 0, z: 4 }, true);
      for (let i = 0; i < 12; i++) {
        race.step();
        assert.equal(r.grounded, false);
        assert.equal(r.ground, undefined);
        assert.deepEqual(race.drainImpacts(), []);
      }
      assert.ok(r.body.linvel().z > 3.97);
      while (!r.ground && race.elapsed < 1) race.step();
      assert.ok(r.ground && r.ground.normal.y > .95 && r.ground.normal.z > .12);
      const v = r.body.linvel(), normal = r.ground.normal;
      rebounds.push(v.x * normal.x + v.y * normal.y + v.z * normal.z);
      const impacts = race.drainImpacts();
      assert.deepEqual(impacts.map(impact => impact.surface), [surface]);
      assert.ok(Math.abs(impacts[0].force * STEP - r.ground.impulse) < .001);
      assert.ok(Math.abs(r.ground.point.y - r.p.y) < RADIUS + .03);
      assert.equal(r.recoveries, 0);
    } finally {
      race.dispose();
    }
  }
  assert.ok(rebounds[0] > rebounds[1] + .25, `Expected a stronger rebound on glaze: ${rebounds}`);
});

test('a rolling marble follows the banked spiral with support below the sphere', () => {
  const course = planFor(settingsFrom({ track: 'paper-moon', seed: 'postmark-26' }), 1);
  const spiral = course.modules.find(m => m.kind === 'terraces')!;
  const node = Math.round((spiral.from + spiral.to) / 2);
  const n = course.nodes[node];
  const race = new RacePhysics(course, IDENTITIES.slice(0, 1));
  try {
    race.release();
    const [r] = race.racers;
    r.p = r.previous = deckPoint(n, spiral, -.55 * n.half * spiral.lean);
    r.p.y += RADIUS + .045;
    r.progress = { check: course.checks.findIndex(i => i > node) - 1, segment: node, distance: n.s, best: n.s, branch: 1 };
    r.body.setTranslation(r.p, true);
    r.body.setLinvel({ x: Math.sin(n.yaw) * 4, y: -.8, z: Math.cos(n.yaw) * 4 }, true);
    let supported = 0;
    let banked = 0;
    for (let i = 0; i < 45; i++) {
      race.step();
      if (!r.ground) continue;
      const { normal, point, speed } = r.ground;
      const height = (r.p.x - point.x) * normal.x + (r.p.y - point.y) * normal.y + (r.p.z - point.z) * normal.z;
      assert.ok(Math.abs(height - RADIUS) < .045, `Contact point is ${height} below the center`);
      if (Math.abs(normal.x * Math.cos(n.yaw) - normal.z * Math.sin(n.yaw)) > .16) banked++;
      assert.ok(speed > 2 && normal.y > .8);
      supported++;
    }
    assert.ok(supported >= 39 && banked >= 24, `${supported} supported ticks, ${banked} banked ticks`);
    assert.ok(r.progress.distance > n.s + 2 && r.recoveries === 0);
  } finally {
    race.dispose();
  }
});

test('touchdowns between ticks keep the marble above the deck for different drop heights and speeds', () => {
  const course = planFor(settingsFrom({ track: 'paper-moon', seed: 'postmark-26' }), 1);
  const n = course.nodes[6], next = course.nodes[7];
  const grade = (n.y - next.y) / (next.s - n.s);
  const normalY = 1 / Math.hypot(1, grade);
  for (const surface of ['cork', 'glaze'] as const) {
    course.modules[0].surface = surface;
    for (const height of [.12, .52, .82, 1.28, 2.05]) {
      const race = new RacePhysics(course, IDENTITIES.slice(0, 2), true);
      try {
        race.release();
        for (const [lane, r] of race.racers.entries()) {
          r.progress = { check: 1, segment: 6, distance: n.s, best: n.s, branch: 0 };
          r.p = r.previous = point(n, lane - .5, RADIUS / normalY + height + lane * .013);
          r.body.setTranslation(r.p, true);
          r.body.setLinvel({ x: 0, y: 0, z: lane * 4 }, true);
        }
        const landed = new Set<number>();
        const sounded = new Set<number>();
        for (let tick = 0; tick < 100; tick++) {
          const previous = race.racers.map(r => r.p);
          race.step();
          for (const [lane, r] of race.racers.entries()) {
            assert.deepEqual(r.previous, previous[lane], 'Keep the beginning of the broadcast tick for render interpolation');
            const clearance = (r.p.y - n.y + grade * along(n, r.p)) * normalY - RADIUS;
            assert.ok(clearance >= -.009, `${surface} drop ${height} penetrated by ${-clearance}`);
            if (r.grounded) landed.add(r.id);
          }
          for (const impact of race.drainImpacts()) if (impact.surface === surface) sounded.add(impact.id);
        }
        assert.equal(landed.size, 2);
        assert.equal(sounded.size, 2);
      } finally {
        race.dispose();
      }
    }
  }
});

test('the shadow can find a lower landing while airborne and disappears over the open gap', () => {
  const race = new RacePhysics(plan, IDENTITIES.slice(0, 1));
  try {
    race.release();
    race.step();
    const jump = plan.modules.find(m => m.kind === 'jump')!;
    const at = jump.from + Math.round(jump.gap![0] * (jump.to - jump.from));
    const lip = plan.nodes[at], catchDeck = plan.nodes[at + 1];
    const mid = { x: (lip.x + catchDeck.x) / 2, y: lip.y + 1, z: (lip.z + catchDeck.z) / 2 };
    assert.equal(race.floorBelow(mid, 3), undefined);
    for (const n of [plan.nodes[at - 1], plan.nodes[at + 2]]) {
      const center = point(n, 0, RADIUS + .5);
      const projection = race.floorBelow(center, 3);
      assert.ok(projection && projection.normal.y > .8);
      assert.ok(Math.abs(projection.point.y - n.y) < .002);
      assert.equal(race.floorBelow(center, RADIUS), undefined);
    }
  } finally {
    race.dispose();
  }
});

test('fallback bank traverses with all supported counts and selection handles extreme targets', () => {
  for (let count = 4; count <= 8; count++) {
    const s = settingsFrom({ track: 'classic', marbles: count });
    const bank = planFor(s, count - 3, 0, true);
    assert.ok(validatePlan(bank));
    assert.ok(simulate(bank, rosterFor(s, count - 3), 8).first);
  }
  for (const target of [60, 180]) {
    const s = settingsFrom({ track: 'classic', raceTarget: target });
    const result = selectPlan(s, 2, rosterFor(s, 2));
    assert.ok(result.forecast?.first && result.forecast.first >= 60 && result.forecast.first <= CAP);
  }
});

test('signature rotation is complete and repeatable across cycle boundaries', () => {
  assert.equal(settingsFrom({}).track, 'rotate');
  for (const seed of ['zeerush', 'mailroom', 'nightshift']) {
    const order = Array.from({ length: 50 }, (_, i) => signatureFor(seed, i + 1));
    for (let offset = 0; offset < order.length; offset += 10) {
      assert.deepEqual(order.slice(offset, offset + 10).sort(), [...TRACK_IDS].sort());
      if (offset) assert.notEqual(order[offset - 1], order[offset]);
    }
    const settings = settingsFrom({ seed });
    for (const round of [1, 2, 10, 11, 21]) {
      const course = planFor(settings, round);
      assert.equal(course.track, order[round - 1]);
      assert.equal(course.track, planFor(settings, round, 2, true).track);
      assert.ok(validatePlan(course));
    }
  }
});

test('signature challenge sections keep connected drops, bypasses and swept clearance even at the shortest target', () => {
  for (const track of TRACK_IDS) {
    for (const obstacles of ['standard', 'extra']) {
      const course = planFor(settingsFrom({ track, raceTarget: 60, obstacles }), 1);
      assert.ok(validatePlan(course));
      const brake = course.modules.find(module => module.kind === 'brake')!;
      assert.deepEqual(brake.bands?.slice(1).map(band => band.surface), ['grit', 'slide']);
      const cushions = course.modules.find(module => module.kind === 'cushions')!;
      assert.equal(cushions.devices.length, obstacles === 'extra' ? 5 : 3);
      const sweepers = course.modules.find(module => module.kind === 'sweepers')!;
      const spiral = course.modules.find(module => module.kind === 'terraces')!;
      const upper = course.nodes[spiral.from], lower = course.nodes[spiral.to];
      assert.ok(upper.y - lower.y > 8);
      assert.ok(Math.hypot(upper.x - lower.x, upper.z - lower.z) < upper.half * 2);
      assert.ok(Math.abs(Math.abs(upper.yaw - lower.yaw) - 2 * Math.PI) < 1e-8);
      assert.equal(sweepers.devices.length, obstacles === 'extra' ? 3 : 2);
      assert.ok(course.nodes.slice(sweepers.from + 1, sweepers.to).some(n => n.half < 2.85));
      for (const sweeper of sweepers.devices) {
        const node = nodeAt(course, sweeper.s);
        for (const dir of [-1, 1]) {
          const pose = devicePose(sweeper, dir * Math.PI / 2 / 1.25 - sweeper.phase);
          assert.ok(node.half - Math.abs(side(node, pose.p)) - sweeper.size.x / 2 > 2 * RADIUS);
        }
      }
    }
    assert.ok(!planFor(settingsFrom({ track, obstacles: 'original' }), 1).modules.some(module => module.kind === 'brake'));
  }
});

test('both signature lanes use equivalent legal checkpoints, including the stacked aquarium crossing', () => {
  for (const track of TRACK_IDS) {
    const p = planFor(settingsFrom({}, `?track=${track}&marbles=8&seed=check`), 1);
    const module = p.modules.find(m => m.track === track)!;
    assert.ok(module.bands && module.bands.length >= 1);
    assert.equal(p.track, track);
    for (const [index, nodeIndex] of p.checks.entries()) {
      if (nodeIndex <= module.from || nodeIndex > module.to) continue;
      const n = p.nodes[nodeIndex];
      const visit = (lane: number, lift: number) => {
        const q = branchPoint(n, module, lane, 0, RADIUS + lift);
        const move = (d: number) => ({ x: q.x + d * Math.sin(n.yaw), y: q.y, z: q.z + d * Math.cos(n.yaw) });
        const progress = { check: index - 1, segment: nodeIndex - 1, distance: n.s - .10, best: n.s - .10, branch: 0 };
        routeProgress(p, progress, move(-.1), move(.1));
        return progress.check;
      };
      assert.equal(visit(-1, 0), index);
      assert.equal(visit(1, 0), index);
      assert.equal(visit(1, 5), index - 1);
    }
  }
});

const places = [
  { id: 3, time: 92.01, distance: 500, recoveries: 0 }, { id: 2, time: 92.02, distance: 500, recoveries: 0 },
  { id: 4, time: 93.1, distance: 500, recoveries: 0 }, { id: 1, time: null, distance: 480, recoveries: 1 },
];

test('commit IDs, voids, points, DNF and five-race standings are consistent', () => {
  const s = freshSession(options, 'qa');
  for (let i = 1; i <= 5; i++) {
    const result = commitRound(s, i, 'test', places)!;
    assert.deepEqual(result.record.awards, { 1: 0, 2: 8, 3: 10, 4: 6 });
    assert.equal(result.record.winner, 3);
    assert.equal(commitRound(s, i, 'test', places), null);
    if (i === 5) assert.deepEqual(result.record.titles, [3]);
  }
  assert.equal(s.championship, 2);
  assert.equal(s.cupRound, 0);
  assert.equal(s.stats[2].wins, 5);
  assert.equal(s.stats[2].podiums, 5);
  assert.equal(s.stats[2].points, 50);
  assert.equal(s.cup[2].points, 0);
  const result = commitRound(s, 6, 'void', places.map(p => ({ ...p, time: null })))!;
  assert.equal(result.record.winner, null);
  assert.ok(result.record.void);
  assert.equal(s.stats[2].points, 50);
  assert.equal(s.cupRound, 0);
});

test('storage failure, corrupt data and interrupted race resume safely', () => {
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.equal(loadSession(broken, '?marbles=8').settings.marbles, 8);
  assert.equal(saveSession(broken, freshSession(options)), false);
  let value = '{malformed';
  const storage = { getItem: () => value, setItem: (_: string, raw: string) => { value = raw; } };
  const s = loadSession(storage);
  commitRound(s, 1, 'recorded', places);
  s.pending = 2;
  assert.equal(saveSession(storage, s), true);
  const resumed = loadSession(storage);
  assert.equal(resumed.next, 3);
  assert.equal(resumed.abandoned, 1);
  assert.equal(resumed.stats[2].points, 10);
  assert.equal(resumed.lastCommit, `${s.id}/1`);
  assert.equal(loadSession(storage, '?session=fresh').next, resumed.next);
});
