import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsFrom } from '../src/config';
import { RADIUS } from '../src/identities';
import { devicePose } from '../src/physics';
import { TRACK_IDS } from '../src/signatures';
import { branchFrame, nodeAt, planFor, side } from '../src/track';

test('hurdles leave passing space throughout each gate cycle and recovery room between combinations', () => {
  for (const track of [...TRACK_IDS, 'classic']) for (const obstacles of ['standard', 'extra', 'original']) {
    const plan = planFor(settingsFrom({track, obstacles, raceTarget: 60, seed: 'hurdle-clearance'}), 1);
    const devices = plan.modules.flatMap(m => m.devices).filter(d => ['roller', 'fin', 'swing'].includes(d.kind));
    assert.equal(devices.length, obstacles === 'original' ? 0 : obstacles === 'extra' ? 8 : 4, track);
    for (const m of plan.modules) {
      const hurdles = m.devices.filter(d => devices.includes(d));
      if (!hurdles.length) continue;
      assert.ok(!m.bridge && !m.gap && !m.track);
      const stations = hurdles.filter((d,i) => !i || d.kind !== 'fin' || hurdles[i-1].kind !== 'fin');
      if (stations.length === 2) assert.ok(stations[1].s - stations[0].s >= 6, track);
    }
    for (const d of devices.filter(d => d.kind === 'swing')) {
      const n = nodeAt(plan, d.s);
      for (let i = 0; i < 96; i++) {
        const p = devicePose(d, i / 96 * Math.PI * 2 / .78 - d.phase).p;
        const pivot = side(n, d.p), tip = 2 * side(n, p) - pivot;
        assert.ok(n.half - Math.max(Math.abs(pivot), Math.abs(tip)) - d.size.x / 2 > 2 * RADIUS);
        assert.ok(Math.max(n.half + Math.min(pivot, tip), n.half - Math.max(pivot, tip)) - d.size.x / 2 >= 4 * RADIUS);
      }
    }
    if (obstacles !== 'original') {
      for (const d of plan.modules.flatMap(m => m.devices).filter(d => d.kind === 'gate' || d.kind === 'paddle')) {
        const n = nodeAt(plan, d.s);
        const module = plan.modules[n.module];
        const lane = module.track ? branchFrame(n, module, module.lean) : { center: 0, width: n.half };
        const radius = Math.hypot(d.size.x, d.size.z) / 2;
        assert.ok(lane.width - Math.abs(side(n, d.p) - lane.center) - radius > 2 * RADIUS, track);
      }
    }
  }
});
