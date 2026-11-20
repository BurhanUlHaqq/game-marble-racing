import { mkdir, writeFile } from 'node:fs/promises';
import { selectPlan, simulate } from '../src/calibration';
import { settingsFrom } from '../src/config';
import { rosterFor } from '../src/identities';
import { initPhysics } from '../src/physics';
import { TRACK_IDS } from '../src/signatures';
import { planFor } from '../src/track';

await initPhysics();
const rows = [];
const seed = process.argv.find(arg => arg.startsWith('--seed='))?.slice(7) ?? 'postmark-26';
const raceTarget = Number(process.argv.find(arg => arg.startsWith('--target='))?.slice(9) ?? 120);
for (const track of [...TRACK_IDS, 'classic']) {
  for (const obstacles of ['standard', 'extra']) {
    const settings = settingsFrom({ track, obstacles, seed, marbles: 8, raceTarget });
    const roster = rosterFor(settings, 1);
    const selected = process.argv.includes('--selected') ? selectPlan(settings, 1, roster) : undefined;
    const plan = selected?.plan ?? planFor(settings, 1);
    const { first, last, dnf, jams, overtakes, recoveries } = selected?.forecast ?? simulate(plan, roster, settings.grace);
    rows.push({track, obstacles, seed: plan.seed, first, last, dnf, jams, overtakes, recoveries});
  }
}
const root = 'verification-output/course-review';
await mkdir(root, {recursive: true});
await writeFile(root + '/' + (process.argv[2] ?? 'race-review') + '.json', JSON.stringify(rows, null, 2));
console.log({ races: rows.length, finishers: 8 * rows.length - rows.reduce((n,r) => n + r.dnf, 0),
  jams: rows.reduce((n,r) => n + r.jams, 0), recoveries: rows.reduce((n,r) => n + r.recoveries, 0),
  overtakes: rows.reduce((n,r) => n + r.overtakes, 0) });
