import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { settingsFrom } from '../src/config';
import { IDENTITIES, RADIUS } from '../src/identities';
import { initPhysics, RacePhysics } from '../src/physics';
import { TRACK_IDS } from '../src/signatures';
import { planFor, point, side, validatePlan } from '../src/track';

before(initPhysics);
test('two-wide rail clearance and connected tapers hold on every course and difficulty', () => {
  for (const track of [...TRACK_IDS, 'classic'] as const) for (const obstacles of ['original', 'standard', 'extra']) {
    for (const raceTarget of [60, 120, 180]) {
      const plan = planFor(settingsFrom({ track, obstacles, raceTarget, seed: 'bridge-audit' }), 1);
      const module = plan.modules.find(m => m.bridge);
      assert.ok(validatePlan(plan));
      if (obstacles === 'original') { assert.equal(module, undefined); continue; }
      assert.ok(module?.bridge);
      const { first, last, width } = module.bridge;
      const throat = plan.nodes.slice(first, last + 1);
      assert.ok(width >= 1.51 && width <= 1.61 && width >= 4 * RADIUS && width < 6 * RADIUS);
      assert.ok(throat.every(n => Math.abs(n.half * 2 - width) < 1e-7 && n.bank === 0));
      const length = plan.nodes[last].s - plan.nodes[first].s;
      assert.ok(length >= 16 * RADIUS && length <= 24 * RADIUS);
      assert.equal(module.devices.length, 0);
      assert.ok(plan.nodes[module.to - 2].half > 2 * width);
    }
  }
});

test('two real balls travel abreast and an eight-ball grid clears the bridge without rescue', () => {
  const plan = planFor(settingsFrom({ track: 'cedar-creek', seed: 'postmark-26' }), 1);
  const bridge = plan.modules.find(m => m.bridge)!.bridge!;
  for (const count of [2, 8]) {
    const race = new RacePhysics(plan, IDENTITIES.slice(0, count));
    try {
      race.release();
      const passed = new Set<number>();
      for (const [i, r] of race.racers.entries()) {
        const index = bridge.first - 2 - Math.floor(i / 2) * 2;
        const n = plan.nodes[index];
        r.p = r.previous = point(n, (i % 2 ? 1 : -1) * .35, RADIUS + .02);
        r.body.setTranslation(r.p, true);
        r.body.setLinvel({ x: 4 * Math.sin(n.yaw), y: -.7, z: 4 * Math.cos(n.yaw) }, true);
        r.progress = { segment: index, check: plan.checks.findIndex(v => v > index) - 1, distance: n.s, best: n.s, branch: 0 };
      }
      let parallel = false;
      for (let t = 0; t < 900 && passed.size < count; t++) {
        race.step();
        const n = plan.nodes[bridge.first];
        const [a, b] = race.racers;
        if (a.progress.segment >= bridge.first && b.progress.segment <= bridge.last && b.progress.segment >= bridge.first) {
          parallel ||= Math.abs(a.progress.distance - b.progress.distance) < .15 && Math.abs(side(n, a.p) - side(n, b.p)) >= 2 * RADIUS - .015;
        }
        for (const r of race.racers) if (r.progress.segment > bridge.last) passed.add(r.id);
      }
      assert.ok(parallel);
      assert.equal(passed.size, count);
      assert.equal(race.recoveries.length, 0);
    } finally { race.dispose(); }
  }
});
