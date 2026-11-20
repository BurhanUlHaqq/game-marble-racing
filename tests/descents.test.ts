import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { calibrationDeck } from '../scripts/calibration-deck';
import { settingsFrom } from '../src/config';
import { IDENTITIES, RADIUS } from '../src/identities';
import { initPhysics, RacePhysics } from '../src/physics';
import type { Racer } from '../src/physics';
import { crossing } from '../src/progress';
import { TRACK_IDS } from '../src/signatures';
import { chutePoint, deckPoint, planFor, validatePlan } from '../src/track';
import type { Plan } from '../src/track';

before(initPhysics);

function enterRolling(plan: Plan, racer: Racer, index: number, across: number, speed: number) {
  const n = plan.nodes[index], next = plan.nodes[index + 1];
  const grade = (n.y - next.y) / Math.hypot(next.x - n.x, next.z - n.z);
  const forward = speed / Math.hypot(1, grade);
  const p = n.pitch === undefined ? deckPoint(n, plan.modules[n.module], across) : chutePoint(n, across, RADIUS + .006);
  if (n.pitch === undefined) p.y += RADIUS * Math.hypot(1, grade, n.bank) + .006;
  racer.p = racer.previous = p;
  racer.body.setTranslation(p, true);
  racer.body.setLinvel({ x: forward * Math.sin(n.yaw), y: -forward * grade, z: forward * Math.cos(n.yaw) }, true);
  racer.body.setAngvel({ x: speed / RADIUS * Math.cos(n.yaw), y: 0, z: -speed / RADIUS * Math.sin(n.yaw) }, true);
  racer.progress = { segment: index, check: plan.checks.findIndex(i => i > index) - 1, distance: n.s, best: n.s, branch: 0 };
}

test('every upgraded layout has two-wide passes, three rolling descents and two covered drops with uphill exits', () => {
  for (const track of [...TRACK_IDS, 'classic']) for (const raceTarget of [60, 120, 180]) {
    for (const obstacles of ['original', 'standard', 'extra']) {
      const course = planFor(settingsFrom({ track, raceTarget, obstacles, seed: 'ravine-survey' }), 1);
      assert.ok(validatePlan(course), track);
      const chutes = course.modules.filter(m => m.dropDegrees);
      assert.equal(chutes.length, obstacles === 'original' ? 0 : 2);
      if (chutes.length) assert.equal(chutes[1].dropDegrees, 80);
      for (const m of chutes) {
        const nodes = course.nodes.slice(m.from, m.to + 1);
        const face = nodes.slice(1).map((b, i) => Math.atan2(nodes[i].y - b.y, Math.hypot(b.x - nodes[i].x, b.z - nodes[i].z)) * 180 / Math.PI);
        assert.ok(Math.abs(Math.max(...face) - m.dropDegrees!) < 1e-7);
        assert.ok(face.filter(a => Math.abs(a - m.dropDegrees!) < 1e-7).length >= 8);
        assert.ok(nodes[0].y - Math.min(...nodes.map(n => n.y)) > 10);
        assert.ok(Math.min(...face) < -8 && m.devices.length === 0);
      }
      const modules = course.modules.filter(m => m.descents);
      const passes = modules.flatMap(m => m.passes!);
      assert.equal(passes.length, obstacles === 'original' ? 0 : obstacles === 'extra' ? 3 : 2);
      assert.equal(modules.reduce((n,m) => n + m.descents!.length, 0), obstacles === 'original' ? 0 : 3);
      for (const m of modules) {
        assert.equal(m.devices.length, 0);
        for (const p of m.passes!) {
          const throat = course.nodes.slice(p.first, p.last + 1);
          assert.ok(p.width > 4 * RADIUS + .13 && p.width < 6 * RADIUS);
          assert.ok(throat.every(n => Math.abs(n.half * 2 - p.width) < 1e-7));
          assert.ok(throat.at(-1)!.s - throat[0].s > 4.2);
          assert.ok(course.nodes[p.entry].half > 2 && course.nodes[p.exit].half > 2);
          assert.ok(p.first > p.entry && p.last < p.exit);
        }
        for (const drop of m.descents!) {
          const at = (u: number) => m.from + Math.round((drop.start + u * drop.span) * (m.to - m.from));
          const grades: number[] = [];
          for (let i = at(0); i < at(1); i++) {
            const a = course.nodes[i], b = course.nodes[i + 1];
            grades.push((a.y - b.y) / (b.s - a.s));
          }
          assert.ok(Math.max(...grades) > .51 && Math.max(...grades) < .77);
          assert.ok(Math.min(...grades) < -.088);
          assert.ok(course.nodes[at(0)].y - course.nodes[at(.68)].y > 3.3);
          assert.ok(course.nodes[at(.91)].y - course.nodes[at(.68)].y > .17);
        }
      }
    }
  }
});

test('the 80-degree face supports a rolling ball and scores crossings in the plane of the chute', () => {
  const plan = planFor(settingsFrom({ track: 'cedar-creek', seed: 'face-contact' }), 1);
  const chute = plan.modules.find(m => m.dropDegrees === 80)!;
  const i = chute.from + Math.round(.34 * (chute.to - chute.from)), n = plan.nodes[i];
  const center = chutePoint(n, 0, RADIUS);
  const delta = { x: .2 * Math.sin(n.yaw) * Math.cos(n.pitch!), y: -.2 * Math.sin(n.pitch!), z: .2 * Math.cos(n.yaw) * Math.cos(n.pitch!) };
  const traverse = (p: typeof center) => crossing(n, { x:p.x-delta.x, y:p.y-delta.y, z:p.z-delta.z },
    { x:p.x+delta.x, y:p.y+delta.y, z:p.z+delta.z }, chute);
  assert.ok(Math.abs(traverse(center)! - .5) < 1e-6);
  assert.equal(traverse(chutePoint(n, n.half + RADIUS * 2, RADIUS)), null);
  assert.equal(traverse(chutePoint(n, 0, 3)), null);
  const race = new RacePhysics(plan, IDENTITIES.slice(0, 1));
  try {
    race.release();
    const racer = race.racers[0];
    enterRolling(plan, racer, i, 0, 2);
    let supported = 0;
    while (race.elapsed < 1.5 && racer.progress.segment < chute.from + .45 * (chute.to - chute.from)) {
      race.step();
      if (racer.ground && Math.abs(racer.ground.normal.y - Math.cos(n.pitch!)) < .025) supported++;
    }
    assert.ok(supported >= 3 && racer.speed > 5);
    assert.equal(racer.recoveries, 0);
  } finally { race.dispose(); }
});

test('a four-abreast pack merges through each plunge and clears its climb without rescue', () => {
  for (const track of ['cedar-creek', 'classic']) for (const obstacles of ['standard', 'extra']) {
    const plan = planFor(settingsFrom({ track, obstacles, raceTarget: 60, seed: 'pack-plunge' }), 1);
    for (const m of plan.modules.filter(m => m.descents || m.dropDegrees)) {
      const race = new RacePhysics(plan, IDENTITIES.slice(0, 8));
      try {
        race.release();
        for (const [i, r] of race.racers.entries()) {
          enterRolling(plan, r, m.from + (i < 4 ? 4 : 2), ((i % 4) - 1.5) * .85, m.dropDegrees ? 8 : 4);
        }
        while (race.elapsed < 18 && race.racers.some(r => r.progress.segment < m.to)) race.step();
        assert.ok(race.racers.every(r => r.progress.segment >= m.to), track + ' ' + m.name);
        assert.equal(race.recoveries.length, 0, track + ' ' + m.name);
        assert.equal(race.jams, 0);
      } finally { race.dispose(); }
    }
  }
});

test('gravity accelerates a rolling marble downhill and reverses one that runs out of momentum uphill', () => {
  const outcomes = [];
  for (const degrees of [-12, 0, 12]) {
    const plan = calibrationDeck(degrees, 'wood');
    const race = new RacePhysics(plan, IDENTITIES.slice(0, 1));
    try {
      race.release();
      const r = race.racers[0];
      enterRolling(plan, r, 18, 0, 2);
      const energy = () => {
        const v = r.body.linvel(), w = r.body.angvel();
        return .5 * (v.x*v.x + v.y*v.y + v.z*v.z) + .2 * RADIUS**2 * (w.x*w.x + w.y*w.y + w.z*w.z) + 9.81 * r.p.y;
      };
      const before = energy();
      for (let tick = 0; tick < 48; tick++) race.step();
      outcomes.push(r.speed);
      for (let tick = 48; tick < 135; tick++) race.step();
      assert.ok(energy() < before);
      assert.equal(r.recoveries, 0);
      if (degrees < 0) assert.ok(r.body.linvel().z < -.2);
    } finally { race.dispose(); }
  }
  const [uphill, level, downhill] = outcomes;
  assert.ok(uphill < level && level < 2 && downhill > 2);
});
