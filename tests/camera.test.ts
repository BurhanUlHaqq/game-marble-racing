import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { Vector3 } from 'three';
import { ShowCamera } from '../src/camera';
import { settingsFrom } from '../src/config';
import { bayOffset, finishPoint, finishRack } from '../src/finish-runout';
import { heldMarble, neutralThrow } from '../src/grid-launch';
import { RADIUS, rosterFor } from '../src/identities';
import { CAP, initPhysics, RacePhysics, STEP } from '../src/physics';
import { pathPoseAt, planFor } from '../src/track';
import type { V3 } from '../src/track';

before(initPhysics);

// Bounds of the physical marble on a 640 x 360 player, independent of its number tag.
function bounds(camera: ShowCamera, position: V3, radius = RADIUS) {
  const p = new Vector3().copy(position);
  const depth = -p.applyMatrix4(camera.value.matrixWorldInverse).z;
  const r = 180 * camera.value.projectionMatrix.elements[5] * radius / depth;
  p.copy(position).project(camera.value);
  const x = 320 * (1 + p.x), y = 180 * (1 - p.y);
  return { left:x-r, right:x+r, top:y-r, bottom:y+r, diameter:2*r };
}

test('the full cast, finish bays and podium fit beside the broadcast graphics', () => {
  for (const count of [4, 5, 6, 7, 8]) {
    const settings = settingsFrom({ track:'cedar-creek', seed:'cast-camera', marbles:count });
    const plan = planFor(settings, 1), race = new RacePhysics(plan, rosterFor(settings, 1));
    const camera = new ShowCamera(), podium = new Vector3();
    camera.course(plan);
    try {
      camera.update(plan, race.racers, 'PICK_MARBLE', 0, 1, podium);
      camera.value.updateMatrixWorld();
      for (const racer of race.racers) {
        const b = bounds(camera, heldMarble(racer.launch, neutralThrow(), new Vector3()));
        assert.ok(b.left > 254 && b.right < 624 && b.top > 30 && b.bottom < 295 && b.diameter > 23,
          'Held marble must fit beside the pick prompt: ' + JSON.stringify(b));
      }
      const rack = finishRack(plan, count);
      camera.cut();
      camera.update(plan, [], 'FINISHING', 0, 4, podium);
      camera.value.updateMatrixWorld();
      for (let rank=0; rank<count; rank++) for (const forward of [0, rack.depth]) {
        const b = bounds(camera, finishPoint(rack, bayOffset(rack, rank), forward, RADIUS+.035));
        assert.ok(b.left > 16 && b.right < 490 && b.top > 32 && b.bottom < 334 && b.diameter > 20,
          'Stripe and parking bay must fit: ' + JSON.stringify(b));
      }
      camera.cut();
      camera.update(plan, [], 'RESULTS', 0, 2, podium);
      camera.value.updateMatrixWorld();
      const places = [[0, 2.17, 0, .55], [-1.85, 1.72, 0, .55], [1.85, 1.39, 0, .55]];
      for (let i=3; i<count; i++) places.push([(i-(count+2)/2)*1.02, .83, 1.98, .40]);
      for (const [x,y,z,r] of places) {
        const b = bounds(camera, {x,y,z}, r);
        assert.ok(b.left > 237 && b.right < 491 && b.top > 27 && b.bottom < 334,
          'Every finisher must fit between both result tables: ' + JSON.stringify(b));
      }
    } finally { race.dispose(); }
  }
});

test('the wide shot brings the trailing pack into frame, then returns to a close lead shot', () => {
  const settings = settingsFrom({track: 'cedar-creek', marbles: 8, seed: 'camera-review'});
  const plan = planFor(settings, 1), race = new RacePhysics(plan, rosterFor(settings, 1));
  const camera = new ShowCamera(), podium = new Vector3();
  try {
    camera.course(plan);
    const field = race.racers;
    for (const [i, racer] of field.entries()) {
      const distance = 21 - 2.35 * i;
      const pos = pathPoseAt(plan, distance, {x: 0, y: 0, z: 0, yaw: 0});
      racer.progress.distance = distance;
      Object.assign(racer.p, {x: pos.x, y: pos.y + RADIUS, z: pos.z});
      Object.assign(racer.previous, racer.p);
    }
    const frame = (time: number) => {
      for (let i = 0; i < 180; i++) camera.update(plan, field, 'RACING', STEP, time, podium);
      camera.value.updateMatrixWorld();
      const silhouettes = field.map(racer => bounds(camera, racer.p));
      return { amount: camera.wide, size: silhouettes[0].diameter,
        visible: silhouettes.filter(b => b.left > 16 && b.right < 490 && b.top > 32 && b.bottom < 334).length };
    };
    const close = frame(17), wide = frame(8), back = frame(17);
    assert.ok(wide.amount > .95 && back.amount < .05);
    assert.equal(wide.visible, field.length);
    assert.ok(wide.visible > close.visible && back.size > wide.size * 1.25);
  } finally { race.dispose(); }
});

test('a full race keeps a close challenge on camera through the chutes and the finish', () => {
  const settings = settingsFrom({ track:'paper-moon', seed:'camera-review', marbles:8 });
  const plan = planFor(settings, 1), race = new RacePhysics(plan, rosterFor(settings, 1));
  const camera = new ShowCamera(), podium = new Vector3();
  const inPicture = (p: V3) => {
    const b = bounds(camera, p);
    return b.left > 16 && b.right < 490 && b.top > 32 && b.bottom < 335;
  };
  let leadFrames=0, leadVisible=0, duels=0, bothVisible=0;
  const dropSizes: number[] = [];
  try {
    camera.course(plan);
    camera.update(plan, race.ranked(), 'COUNTDOWN', 0, 3, podium);
    race.release();
    for (let tick=0; !race.finishers.length && race.elapsed<CAP; tick++) {
      race.step();
      const field = race.ranked(), [lead,chaser] = field;
      camera.update(plan, field, 'RACING', STEP, race.elapsed, podium);
      if (tick%6 || race.elapsed<1.15 || lead.finish !== null) continue;
      camera.value.updateMatrixWorld();
      leadFrames++;
      if (inPicture(lead.p)) leadVisible++;
      const module = plan.modules[plan.nodes[lead.progress.segment].module];
      if (module.dropDegrees === 80) dropSizes.push(bounds(camera, lead.p).diameter);
      if (lead.progress.distance-chaser.progress.distance <= 4 && new Vector3().copy(lead.p).distanceTo(chaser.p) <= 5) {
        duels++;
        if (inPicture(lead.p) && inPicture(chaser.p)) bothVisible++;
      }
    }
    assert.ok(race.finishers.length && leadFrames > 400 && duels > 30 && dropSizes.length > 8);
    assert.ok(leadVisible / leadFrames > .99 && bothVisible / duels > .98);
    dropSizes.sort((a,b)=>a-b);
    assert.ok(dropSizes[Math.floor(dropSizes.length/2)] > 32);
  } finally { race.dispose(); }
});
