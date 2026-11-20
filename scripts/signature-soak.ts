import { mkdir, writeFile } from 'node:fs/promises';
import { selectPlan, simulate } from '../src/calibration';
import { settingsFrom } from '../src/config';
import { IDENTITIES, RADIUS, rosterFor } from '../src/identities';
import { initPhysics, RacePhysics } from '../src/physics';
import { RESERVE_SEEDS, TRACK_IDS } from '../src/signatures';
import { SURFACES } from '../src/surfaces';
import type { Surface } from '../src/surfaces';
import { branchPoint, makePlan, planFor, validatePlan } from '../src/track';

await initPhysics();
const rows = [];
const lanes = [];
const reserve = process.argv.includes('--reserve');
const preflight = process.argv.includes('--preflight');
const seedOption = process.argv.find(arg => arg.startsWith('--seeds='));
const trackOption = process.argv.find(arg => arg.startsWith('--tracks='))?.slice(9).split(',');
const raceTarget = Number(process.argv.find(arg => arg.startsWith('--target='))?.slice(9) ?? 120);
const obstacleOption = process.argv.find(arg => arg.startsWith('--obstacles='))?.slice(12);
const tag = process.argv.find(arg => arg.startsWith('--tag='))?.slice(6).replace(/[^a-z0-9-]/gi, '');
const seeds = seedOption?.slice(8).split(',') ?? (process.argv.includes('--quick') || reserve ? ['postmark-26'] : ['postmark-26', 'nightshift-43']);
const counts = process.argv.includes('--quick') ? [6] : [4, 5, 6, 7, 8];
for (const track of TRACK_IDS.filter(track => !trackOption || trackOption.includes(track))) {
  for (const seed of seeds) for (const marbles of counts) {
    const previewSeed = reserve ? RESERVE_SEEDS[track] : seed;
    const settings = settingsFrom({ track, seed: previewSeed, marbles, raceTarget, obstacles: obstacleOption });
    const roster = rosterFor(settings, 1);
    const plan = preflight ? selectPlan(settings, 1, roster).plan : planFor(settings, 1, 0, reserve);
    if (!validatePlan(plan)) throw new Error(`Invalid geometry for ${plan.seed}`);
    rows.push({ track, previewSeed, ...simulate(plan, roster, settings.grace) });
    if (marbles === counts[0]) for (const branch of [-1, 1]) {
      const m = plan.modules.find(item => item.track)!;
      const index = m.from + Math.round((m.to - m.from) * .24);
      const n = plan.nodes[index];
      const race = new RacePhysics(plan, IDENTITIES.slice(0, 1));
      try {
        race.release();
        const entrant = race.racers[0];
        const position = branchPoint(n, m, branch * m.lean, 0, RADIUS + .055);
        entrant.body.setTranslation(position, true);
        entrant.body.setLinvel({ x: 4.5 * Math.sin(n.yaw), y: -.70, z: 4.5 * Math.cos(n.yaw) }, true);
        entrant.p = entrant.previous = position;
        entrant.progress = { segment: index, check: plan.checks.findIndex(i => i > index) - 1,
          distance: n.s, best: n.s, branch };
        while (race.elapsed < 40 && !entrant.dnf && entrant.splitOut === undefined) race.step();
        lanes.push({ track, previewSeed, branch, seconds: entrant.splitOut ?? null, recoveries: entrant.recoveries });
      } finally { race.dispose(); }
    }
  }
  const group = rows.filter(row => row.track === track);
  console.log(track, group.map(r => `${r.entrants}:${r.first?.toFixed(1) ?? '-'}-${r.last?.toFixed(1) ?? '-'} ${r.recoveries}R/${r.dnf}D/${r.jams}J ${r.winnerBranch ?? '?'}`).join(', '));
}

const samplePlan = makePlan('same-incline', 'workshop', 120, true);
const sample = Object.keys(SURFACES).map(key => {
  const surface = key as Surface;
  samplePlan.modules[0].surface = surface;
  const race = new RacePhysics(samplePlan, IDENTITIES.slice(0, 1));
  try {
    race.release();
    for (let i = 0; i < 300; i++) race.step();
    return { surface, speed: race.racers[0].speed, distance: race.racers[0].progress.distance, ...SURFACES[surface] };
  } finally { race.dispose(); }
});
await mkdir('verification-output', { recursive: true });
const name = reserve ? 'reserve' : preflight ? 'selected' : trackOption ? 'search' : 'soak';
await writeFile(`verification-output/signature-${name}-${rows.length}${raceTarget === 120 ? '' : `-${raceTarget}`}${tag ? `-${tag}` : ''}.json`,
  JSON.stringify({ raceTarget, rows, lanes, sameIncline: sample }, null, 2));
