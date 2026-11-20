import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settingsFrom } from '../src/config';
import { ScenicTerrain, scenicSites } from '../src/scenic-terrain';
import { courseVignette, grandstand, roadsideModel, scenicPalette } from '../src/scenery-art';
import { TRACK_IDS } from '../src/signatures';
import { planFor, point } from '../src/track';

test('landscapes clear the racing surface, including stacked turns, on short and long courses', () => {
  for (const track of [...TRACK_IDS, 'classic'] as const) for (const raceTarget of [60, 180]) {
    const plan = planFor(settingsFrom({ track, raceTarget, obstacles: 'extra', seed: 'scenery-test' }), 1);
    const terrain = new ScenicTerrain(plan);
    Array.from(terrain.shape());
    for (const n of plan.nodes) for (const u of [-n.half, 0, n.half]) {
      const rail = point(n, u);
      assert.ok(terrain.height(rail.x, rail.z) < rail.y - 1.8, `${track} ground intersects deck at ${n.s}`);
    }
    const sites = scenicSites(plan, terrain);
    assert.deepEqual(scenicSites(plan, terrain), sites);
    for (const kind of ['stand', 'feature', 'cluster']) assert.ok(sites.some(site => site.kind === kind), track + ' missing ' + kind);
    for (const site of sites) {
      const radius = (site.kind === 'stand' ? 3.35 : 3.05) * site.scale;
      const ground = terrain.height(site.x, site.z);
      for (const n of plan.nodes) {
        if (n.y + 2.2 < ground - .6 || n.y - 1.35 > site.y + 5 * site.scale) continue;
        assert.ok(Math.hypot(n.x - site.x, n.z - site.z) > n.half + radius, track + ' scenery overlaps the racing lane');
      }
    }
  }
});

test('scenery footings sample the same triangles that appear on screen', () => {
  const plan = planFor(settingsFrom({ track: 'prism-aquarium', seed: 'steep-crossing' }), 1);
  const terrain = new ScenicTerrain(plan);
  Array.from(terrain.shape());
  for (const tile of terrain.tiles()) {
    const positions = tile.getAttribute('position'), indices = tile.getIndex()!;
    for (let i = 0; i < indices.count; i += 39) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
      const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
      const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
      assert.ok(Math.abs(terrain.height(x, z) - y) < .0001);
    }
    tile.dispose();
  }
});

test('painted models fit their surveyed footprints throughout the crowd and ambient animation', () => {
  for (const track of [...TRACK_IDS, 'classic']) {
    const paint = scenicPalette(planFor(settingsFrom({ track }), 1));
    const models = [grandstand(paint), roadsideModel(paint, false), roadsideModel(paint, true), courseVignette(paint,false), courseVignette(paint,true)];
    for (const [index, model] of models.entries()) {
      const position = model.getAttribute('position'), targets = model.morphAttributes.position ?? [];
      if (index === 0) assert.equal(targets.length, 3);
      if (index === 1 && (track === 'cloud-quilt' || track === 'prism-aquarium')) assert.equal(targets.length, 2);
      for (let i = 0; i < position.count; i++) {
        let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        for (const target of targets) { x += target.getX(i); y += target.getY(i); z += target.getZ(i); }
        assert.ok(Math.hypot(x, z) <= (index === 0 ? 3.35 : 3.05) && y <= 5, track + ' art exceeded its allotted space');
      }
      model.dispose();
    }
  }
});
