import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism, arch, platform, release } from 'node:os';
import { selectPlan, simulate } from '../src/calibration';
import { settingsFrom, THEMES } from '../src/config';
import { rosterFor } from '../src/identities';
import { initPhysics } from '../src/physics';
import { planFor, validatePlan } from '../src/track';

await initPhysics();
const count = Number(process.argv[2] ?? 100);
const base = process.argv[3] ?? 'zeerush-stress';
const target = Number(process.argv[4] ?? 120);
const fallback = process.argv.includes('--fallback');
const preflight = process.argv.includes('--preflight');
const start = performance.now();
const rows = [];
for (let i = 0; i < count; i++) {
  const settings = settingsFrom({ track: 'classic', seed: `${base}-${i + 1}`, marbles: 4 + i % 5, theme: THEMES[i % 4], raceTarget: target });
  const number = fallback ? 1 + Math.floor(i / 5) : i + 1;
  const roster = rosterFor(settings, number);
  const plan = preflight ? selectPlan(settings, number, roster).plan : planFor(settings, number, 0, fallback);
  if (!validatePlan(plan)) throw new Error(`Invalid connectors at ${plan.seed}`);
  const row = simulate(plan, roster, settings.grace);
  rows.push(row);
  if (i < 8 || row.void || (i + 1) % 10 === 0) {
    console.log(`${i + 1}/${count} ${row.seed} first=${row.first?.toFixed(2)} last=${row.last?.toFixed(2)} DNF=${row.dnf} recoveries=${row.recoveries}`);
  }
}
const distribution = (values: (number | null)[]) => {
  const valid = values.filter(v => v !== null).sort((a, b) => a - b);
  if (!valid.length) return null;
  const at = (p: number) => Number(valid[Math.floor((valid.length - 1) * p)].toFixed(3));
  return { min: at(0), p10: at(0.1), median: at(0.5), p90: at(0.9), max: at(1) };
};
const report = {
  environment: { platform: platform(), version: release(), arch: arch(), logicalCPUs: availableParallelism(), node: process.version },
  count, base, target, fallback, preflight, seconds: (performance.now() - start) / 1000,
  first: distribution(rows.map(r => r.first)), last: distribution(rows.map(r => r.last)), resolution: distribution(rows.map(r => r.duration)),
  overtakes: rows.reduce((sum, row) => sum + row.overtakes, 0),
  recoveries: rows.reduce((sum, row) => sum + row.recoveries, 0),
  dnfs: rows.reduce((sum, row) => sum + row.dnf, 0), voids: rows.filter(row => row.void).length,
  branches: rows.filter(row => row.branches.length === 2).length,
  outOfWindow: rows.filter(row => row.first === null || row.first < 60 || row.first > 180).length,
  peakBodies: Math.max(...rows.map(row => row.resources.bodies)),
  peakColliders: Math.max(...rows.map(row => row.resources.colliders)),
  mechanisms: [...new Set(rows.flatMap(row => row.visited))].sort(),
};
console.log(report);
await mkdir('verification-output', { recursive: true });
await writeFile(`verification-output/physics-${count}-${target}${fallback ? '-fallback' : preflight ? '-preflight' : ''}.json`, JSON.stringify({ ...report, races: rows }, null, 2));
