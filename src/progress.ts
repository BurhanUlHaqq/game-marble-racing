import { branchContact, chuteClearance, clamp, deckPoint, point, side, stationAlong } from './track';
import type { Module, Plan, Sample, V3 } from './track';

export type Progress = { check: number; segment: number; distance: number; best: number; branch: number };

export function crossing(node: Sample, from: V3, to: V3, module?: Module) {
  const a = stationAlong(node, from), b = stationAlong(node, to);
  if (a >= 0 || b < 0 || b - a < 1e-8) return null;
  const t = -a / (b - a);
  const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
  const u = side(node, p);
  if (module?.track) {
    const contact = branchContact(node, module, u, p.y, .25);
    return contact && contact.dy > -.30 && contact.dy < 1.85 ? t : null;
  }
  const height = node.pitch !== undefined ? chuteClearance(node, p) : p.y - (module ? deckPoint(node, module, u) : point(node, u)).y;
  return Math.abs(u) < node.half + 0.15 && Math.abs(height) < 2.05 ? t : null;
}

export function routeProgress(plan: Plan, progress: Progress, from: V3, to: V3) {
  const next = plan.checks[progress.check + 1];
  if (next === undefined) return null;
  const node = plan.nodes[next];
  const t = crossing(node, from, to, plan.modules[node.module]);
  if (t !== null) progress.check++;
  if (next === plan.finish && t !== null) {
    progress.distance = progress.best = plan.length;
    return t;
  }
  const lo = Math.max(0, plan.checks[progress.check] - 2);
  const hi = plan.checks[progress.check + 1];
  let i = clamp(progress.segment, lo, hi - 1);
  for (; i < hi - 1 && stationAlong(plan.nodes[i + 1], to) >= 0; i++);
  for (; i > lo && stationAlong(plan.nodes[i], to) < 0; i--);
  progress.segment = i;
  const n = plan.nodes[i];
  const u = side(n, to);
  const module = plan.modules[n.module];
  const contact = module.track ? branchContact(n, module, u, to.y, .48) : undefined;
  const onRoute = module.track ? contact && Math.abs(contact.dy) < 2 : Math.abs(u) < n.half + .36
    && Math.abs(n.pitch === undefined ? to.y - deckPoint(n, module, u).y : chuteClearance(n, to)) < 2;
  if (onRoute) {
    const d = clamp(n.s + stationAlong(n, to), plan.nodes[lo].s, plan.nodes[hi].s - 0.001);
    progress.distance = d;
    progress.best = Math.max(d, progress.best);
    if (n.t > .31 && n.t < .69 && progress.branch === 0) {
      if (contact) progress.branch = contact.lane * module.lean;
      else if (module.kind === 'split') progress.branch = u < 0 ? -1 : 1;
    }
  }
  return null;
}

export type Arrival = { id: number; time: number; tie: number };

export function compareArrivals(a: Arrival, b: Arrival) {
  // Quantize only genuinely indistinguishable times, then use the pre-race tie draw.
  return Math.round(a.time * 1e6) - Math.round(b.time * 1e6) || a.tie - b.tie;
}
