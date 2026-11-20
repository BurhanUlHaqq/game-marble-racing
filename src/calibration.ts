import type { Settings } from './config';
import type { Identity } from './identities';
import { CAP, RacePhysics, STEP } from './physics';
import { planFor, validatePlan } from './track';
import type { Plan } from './track';

export function simulate(plan: Plan, roster: readonly Identity[], grace: number) {
  const race = new RacePhysics(plan, roster);
  try {
    race.release();
    let limit = CAP;
    while (race.elapsed + STEP / 2 < limit && race.racers.some(r => !r.dnf && r.finish === null)) {
      race.step();
      const first = race.finishers[0]?.finish;
      if (first !== null && first !== undefined) limit = Math.min(CAP, first + grace);
    }
    const placements = race.resolve(race.elapsed >= CAP - STEP ? 'Time limit' : 'Finishing window expired');
    return {
      seed: plan.seed, theme: plan.theme, entrants: roster.length, duration: race.elapsed,
      obstacles: plan.level, gripSeconds: race.gripTicks * STEP,
      first: race.finishers[0]?.finish ?? null, last: race.finishers.at(-1)?.finish ?? null,
      overtakes: race.overtakes, recoveries: race.recoveries.length, recoveryLog: [...race.recoveries], jams: race.jams,
      dnf: placements.filter(p => p.time === null).length, void: race.finishers.length === 0,
      visited: [...race.visited].map(i => plan.modules[i].kind),
      branches: [...new Set(race.racers.map(r => r.progress.branch).filter(Boolean))],
      winnerBranch: race.finishers[0]?.progress.branch ?? null,
      splits: race.racers.filter(r => r.splitIn !== undefined && r.splitOut !== undefined)
        .map(r => ({ id: r.id, branch: r.progress.branch, entry: r.splitIn!, exit: r.splitOut!, finished: r.finish !== null })),
      results: placements, resources: race.resources(),
    };
  } finally {
    race.dispose();
  }
}

export function selectPlan(settings: Settings, number: number, roster: readonly Identity[], previousSignature = '') {
  let reserve: { plan: Plan; forecast: ReturnType<typeof simulate> } | undefined;
  let bestScore = Infinity;
  const accept = (plan: Plan) => {
    const forecast = simulate(plan, roster, Math.max(2, settings.grace));
    const valid = forecast.first !== null && forecast.first >= 60 && forecast.first < 174
      && forecast.dnf <= Math.max(2, roster.length / 2) && forecast.recoveries <= roster.length;
    if (!valid) return false;
    const branchPenalty = plan.track && forecast.branches.length !== 2 ? 1 : 0;
    const score = forecast.dnf * 12 + forecast.recoveries * 2 + forecast.jams * 5 + branchPenalty;
    if (score < bestScore) {
      bestScore = score;
      reserve = { plan, forecast };
    }
    if (!plan.track) return score <= 2;
    return score <= (settings.track === 'rotate' ? 0 : 1);
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const plan = planFor(settings, number, attempt);
    if (plan.signature === previousSignature || !validatePlan(plan)) continue;
    if (accept(plan)) return reserve!;
  }
  if (reserve && bestScore < 12 && (reserve.plan.track || reserve.forecast.jams === 0)) return reserve;
  for (let offset = 0; offset < 5; offset++) {
    const plan = settings.track === 'classic' ? planFor(settings, number + offset, 0, true) : planFor(settings, number, offset, true);
    if (!plan.track && (settings.theme === 'rotate' || settings.theme === 'random')) plan.theme = planFor(settings, number).theme;
    if (plan.signature === previousSignature || !validatePlan(plan)) continue;
    if (accept(plan)) return reserve!;
  }
  return reserve ?? { plan: planFor(settings, number, 0, true), forecast: null };
}
