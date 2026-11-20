import { mkdir, writeFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { ShowCamera } from '../src/camera';
import { settingsFrom } from '../src/config';
import { RADIUS, rosterFor } from '../src/identities';
import { CAP, initPhysics, RacePhysics, STEP } from '../src/physics';
import { TRACK_IDS } from '../src/signatures';
import { planFor } from '../src/track';
import type { V3 } from '../src/track';

// Replay the same physical races for each camera revision. Pixel sizes use a 640 x 360 broadcast frame.
await initPhysics();
const samples = () => ({ sizes: [] as number[], safe: 0, pairs: 0, pairsSafe: 0 });
type Samples = ReturnType<typeof samples>;
const sectors = new Map<string, Samples>(), all = samples(), courses = [];
const percentile = (sorted: number[], fraction: number) => +sorted[Math.floor((sorted.length - 1) * fraction)].toFixed(1);
function summarize(group: Samples) {
  const sizes = group.sizes.sort((a, b) => a-b);
  return { samples: sizes.length, medianPx: percentile(sizes, .5), fifthPercentilePx: percentile(sizes, .05),
    inMainPicture: +(100 * group.safe / sizes.length).toFixed(2),
    closePairsInPicture: group.pairs ? +(100 * group.pairsSafe / group.pairs).toFixed(2) : null };
}

const variants = process.argv.includes('--alternate')
  ? [{count: 5, seconds: 90, obstacles: 'original'}, {count: 7, seconds: 180, obstacles: 'extra'}]
  : [{count: 4, seconds: 60, obstacles: 'standard'}, {count: 8, seconds: 120, obstacles: 'standard'}];
for (const track of [...TRACK_IDS, 'classic']) for (const {count, seconds, obstacles} of variants) {
  const settings = settingsFrom({ track, seed: 'camera-review', marbles: count, raceTarget: seconds, obstacles });
  const plan = planFor(settings, 1), race = new RacePhysics(plan, rosterFor(settings, 1)), camera = new ShowCamera();
  const local = samples(), podium = new Vector3(), projection = new Vector3();
  const project = (p: V3) => {
    const depth = -projection.copy(p).applyMatrix4(camera.value.matrixWorldInverse).z;
    const size = 360 * RADIUS / (Math.tan(camera.value.fov * Math.PI / 360) * Math.max(.001, depth));
    projection.copy(p).project(camera.value);
    const x = (1 + projection.x) * .5, y = (1 - projection.y) * .5;
    const safe = depth > 0 && x-size/1280 > .025 && x+size/1280 < .765 && y-size/720 > .09 && y+size/720 < .93;
    return { size, safe };
  };
  try {
    camera.course(plan);
    camera.update(plan, race.ranked(), 'COUNTDOWN', 0, 2.99, podium);
    race.release();
    for (let tick=0; race.elapsed<CAP && race.finishers.length===0; tick++) {
      race.step();
      const field = race.ranked(), lead = field[0];
      camera.update(plan, field, 'RACING', STEP, race.elapsed, podium);
      if (tick%6 || race.elapsed < 1.15 || lead.finish !== null || lead.dnf) continue;
      camera.value.updateMatrixWorld();
      const {size,safe} = project(lead.p), second = field[1];
      const closePair = second && !second.dnf && lead.progress.distance-second.progress.distance <= 4 &&
        Math.hypot(lead.p.x-second.p.x, lead.p.y-second.p.y, lead.p.z-second.p.z) <= 5;
      const both = closePair && safe && project(second.p).safe;
      const module = plan.modules[plan.nodes[lead.progress.segment].module];
      const section = module.dropDegrees ? 'covered drop' : module.bridge ? 'bridge' : module.kind;
      if (!sectors.has(section)) sectors.set(section, samples());
      for (const group of [all, local, sectors.get(section)!]) {
        group.sizes.push(size);
        group.safe += Number(safe);
        group.pairs += Number(Boolean(closePair));
        group.pairsSafe += Number(Boolean(both));
      }
    }
    courses.push({track, count, seconds, obstacles, winner:race.finishers[0]?.id, ...summarize(local)});
  } finally { race.dispose(); }
}
const root = 'verification-output/camera-review';
await mkdir(root, {recursive:true});
const report = {overall:summarize(all), sectors:Object.fromEntries([...sectors].map(([name,s]) => [name,summarize(s)])), courses};
await writeFile(root+'/'+(process.argv[2] ?? 'current')+'.json', JSON.stringify(report,null,2));
console.log(JSON.stringify({overall:report.overall,drop:report.sectors['covered drop'],signature:report.sectors.signature,finish:report.sectors.finish}));
