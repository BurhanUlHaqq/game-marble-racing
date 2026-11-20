import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { calibrationDeck } from '../scripts/calibration-deck';
import { settingsFrom } from '../src/config';
import { IDENTITIES, RADIUS } from '../src/identities';
import { initPhysics, RacePhysics } from '../src/physics';
import { deckPoint, planFor, side } from '../src/track';

before(initPhysics);

test('reversing turns raise their outside edge and change bank gradually', () => {
  const plan = planFor(settingsFrom({ track: 'classic', seed: 'shoulder-roll', raceTarget: 90 }), 1);
  const slalom = plan.modules.find(m => m.kind === 'slalom')!;
  const directions = new Set<number>();
  for (let i = slalom.from + 1; i <= slalom.to; i++) {
    const a = plan.nodes[i - 1], b = plan.nodes[i];
    assert.ok(Math.abs(b.bank - a.bank) < .033 * (b.s - a.s));
    const turn = b.yaw - a.yaw;
    if (Math.abs(turn) < .02 || Math.abs(b.bank) < .04) continue;
    directions.add(Math.sign(turn));
    const outside = -Math.sign(turn) * b.half;
    assert.ok(deckPoint(b, slalom, outside).y > deckPoint(b, slalom, -outside).y);
  }
  assert.deepEqual([...directions].sort(), [-1, 1]);
});

test('both shoulders return a rolling marble to the open deck while a straight middle lane holds its line', () => {
  const plan = planFor(settingsFrom({ track: 'cedar-creek', seed: 'shoulder-roll', raceTarget: 120 }), 1);
  const grid = plan.modules[0];
  const i = Math.round(grid.to * .53);
  const n = plan.nodes[i];
  for (const across of [-n.half + RADIUS + .05, .85, n.half - RADIUS - .05]) {
    const race = new RacePhysics(plan, IDENTITIES.slice(0, 1));
    try {
      race.release();
      race.step();
      const [r] = race.racers;
      const p = deckPoint(n, grid, across);
      const floor = race.floorBelow({ ...p, y: p.y + 2 }, 3)!;
      p.y = floor.point.y + RADIUS / floor.normal.y;
      const speed = 4, downhill = (plan.nodes[i + 1].y - n.y) / (plan.nodes[i + 1].s - n.s);
      r.p = r.previous = p;
      r.progress = { check: plan.checks.findIndex(at => at > i) - 1, segment: i, distance: n.s, best: n.s, branch: 0 };
      r.body.setTranslation(p, true);
      r.body.setLinvel({ x: 0, y: speed * downhill, z: speed }, true);
      r.body.setAngvel({ x: speed * Math.hypot(1, downhill) / RADIUS, y: 0, z: 0 }, true);
      for (let tick = 0; tick < 78; tick++) race.step();
      const lateral = side(plan.nodes[r.progress.segment], r.p);
      if (across === .85) assert.ok(Math.abs(lateral - across) < .025, `middle lane drifted to ${lateral}`);
      else assert.ok((across - lateral) * Math.sign(across) > .65, `edge lane only reached ${lateral}`);
      assert.ok(r.grounded && r.recoveries === 0 && r.progress.distance > n.s + 4);
    } finally {
      race.dispose();
    }
  }
});

test('a glancing impact on either guard rebounds inward and retains forward momentum', () => {
  for (const direction of [-1, 1]) {
    const race = new RacePhysics(calibrationDeck(0, 'wood'), IDENTITIES.slice(0, 1));
    try {
      race.release();
      const [r] = race.racers;
      const n = race.plan.nodes[16];
      // Start above the flat deck to isolate guard contact from floor friction.
      r.p = r.previous = { x: direction * (n.half - RADIUS - .06), y: n.y + .64, z: n.z };
      r.progress = { check: 4, segment: 16, distance: 16, best: 16, branch: 0 };
      r.body.setTranslation(r.p, true);
      r.body.setLinvel({ x: direction * 3, y: 0, z: 6 }, true);
      r.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      for (let tick = 0; tick < 6 && direction * r.body.linvel().x > 0; tick++) race.step();
      const v = r.body.linvel();
      assert.ok(-direction * v.x > .4 && -direction * v.x < 2, `normal rebound ${v.x}`);
      assert.ok(v.z > 5.4 && v.z <= 6.01, `forward speed ${v.z}`);
      assert.ok(!r.grounded && r.recoveries === 0);
    } finally {
      race.dispose();
    }
  }
});
