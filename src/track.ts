import type { ObstacleLevel, Settings, Theme } from './config';
import { THEMES } from './config';
import { Random } from './random';
import { RESERVE_SEEDS, SIGNATURES, signatureFor } from './signatures';
import type { TrackId } from './signatures';
import type { Surface } from './surfaces';
export type { Surface } from './surfaces';

export type V3 = { x: number; y: number; z: number };
export const MECHANISMS = [
  'bank', 'slalom', 'waves', 'bowl', 'helix', 'tunnel', 'split', 'pegs',
  'funnel', 'paddle', 'gates', 'tilt', 'conveyor', 'jump', 'chime',
] as const;
export type Mechanism = typeof MECHANISMS[number] | 'start' | 'finish' | 'signature' | 'brake' | 'cushions' | 'sweepers' | 'terraces' | 'chute';
export type Sample = V3 & { yaw: number; half: number; bank: number; s: number; t: number; module: number; pitch?: number };
export type ColliderGeometry = { points: number[]; triangles: number[] };
type Descent = { start: number; span: number; downhill: number; uphill: number };
type NarrowPass = { entry: number; first: number; last: number; exit: number; width: number };
export type Device = {
  kind: 'bumper' | 'peg' | 'divider' | 'paddle' | 'gate' | 'tilt' | 'belt' | 'chime' | 'scoop' | 'platter' | 'cushion' | 'sweeper' | 'roller' | 'fin' | 'swing';
  p: V3; yaw: number; size: V3; phase: number; surface: Surface; s: number; grade: number;
  sweep?: { amplitude: number; bank: number };
};
export type Module = {
  kind: Mechanism; name: string; surface: Surface; from: number; to: number;
  length: number; floor: ColliderGeometry; rails: ColliderGeometry; devices: Device[];
  gap: [number, number] | null; lean: number;
  bridge?: { width: number; first: number; last: number };
  speedRun?: boolean;
  dropDegrees?: number;
  descents?: Descent[]; passes?: NarrowPass[];
  track?: TrackId; feed?: boolean; forkNose?: boolean; bands?: { surface: Surface; geometry: ColliderGeometry }[];
};
export type Plan = {
  seed: string; theme: Theme; nodes: Sample[]; modules: Module[]; checks: number[];
  length: number; finish: number; finalSection: number; signature: string; gradeFactor: number;
  track?: TrackId; obstacles?: Exclude<ObstacleLevel, 'original'>; level: ObstacleLevel;
};

export const HALF = 3.62;
const TAU = Math.PI * 2;
const metadata: Record<Mechanism, { name: string; len: number; surface: Surface }> = {
  start: { name: 'Starting grid', len: 24, surface: 'wood' },
  bank: { name: 'Banked sweep', len: 31, surface: 'wood' },
  slalom: { name: 'Slalom ramps', len: 24, surface: 'rubber' },
  waves: { name: 'Roller waves', len: 30, surface: 'wood' },
  bowl: { name: 'Spiral bowl', len: 36, surface: 'plastic' },
  helix: { name: 'Helix descent', len: 45, surface: 'acrylic' },
  tunnel: { name: 'Crystal tunnel', len: 25, surface: 'acrylic' },
  split: { name: 'Split & merge', len: 34, surface: 'wood' },
  pegs: { name: 'Pegboard', len: 26, surface: 'rubber' },
  funnel: { name: 'The funnel', len: 27, surface: 'plastic' },
  paddle: { name: 'Turntable paddles', len: 26, surface: 'plastic' },
  gates: { name: 'Swing gates', len: 28, surface: 'metal' },
  tilt: { name: 'Tilting deck', len: 24, surface: 'wood' },
  conveyor: { name: 'Conveyor belt', len: 26, surface: 'rubber' },
  jump: { name: 'Air bridge', len: 29, surface: 'wood' },
  chime: { name: 'Chime alley', len: 27, surface: 'metal' },
  brake: { name: 'Grip strips and drop slides', len: 32, surface: 'wood' },
  cushions: { name: 'Bumper chicane', len: 30, surface: 'wood' },
  sweepers: { name: 'Narrow sweeper run', len: 30, surface: 'wood' },
  terraces: { name: 'Stacked spiral basin', len: 44, surface: 'wood' },
  chute: { name: 'Drop chute', len: 36, surface: 'wood' },
  signature: { name: '', len: 0, surface: 'wood' },
  finish: { name: 'Finish straight', len: 28, surface: 'wood' },
};

const surfaceT = (t: number) => Math.sin(Math.PI * t) ** 2;
export const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
export const side = (node: Sample, p: V3) => (p.x - node.x) * Math.cos(node.yaw) - (p.z - node.z) * Math.sin(node.yaw);
export const along = (node: Sample, p: V3) => (p.x - node.x) * Math.sin(node.yaw) + (p.z - node.z) * Math.cos(node.yaw);

export function point(n: Sample, u: number, height = 0): V3 {
  return { x: n.x + Math.cos(n.yaw) * u, y: n.y + n.bank * u + height, z: n.z - Math.sin(n.yaw) * u };
}

// Chute stations run along the deck. Their clearance and checkpoint planes rotate with it.
export function stationAlong(n: Sample, p: V3) {
  const forward = along(n, p);
  return n.pitch === undefined ? forward : Math.cos(n.pitch) * forward - Math.sin(n.pitch) * (p.y - n.y);
}

export function chuteClearance(n: Sample, p: V3) {
  const pitch = n.pitch ?? 0;
  return Math.cos(pitch) * (p.y - n.y) + Math.sin(pitch) * along(n, p);
}

export function chutePoint(n: Sample, across: number, height: number) {
  const pitch = n.pitch ?? 0;
  const p = point(n, across, height * Math.cos(pitch));
  const forward = height * Math.sin(pitch);
  p.x += forward * Math.sin(n.yaw);
  p.z += forward * Math.cos(n.yaw);
  return p;
}

export function chuteRailTop(n: Sample, side: number) {
  const height = .94 + .40 * smooth(n.t / .10) * smooth((1 - n.t) / .12);
  return chutePoint(n, side * n.half, height);
}

export function gridSurface(plan: Plan) {
  const [start, grid] = plan.nodes;
  const grade = (start.y - grid.y) / (grid.s - start.s);
  const y = 1 / Math.hypot(1, grade);
  return { point: grid, normal: { x: y * grade * Math.sin(grid.yaw), y, z: y * grade * Math.cos(grid.yaw) } };
}

export function tunnelPoint(n: Sample, j: number) {
  const theta = Math.PI * j / 12;
  return point(n, Math.cos(theta) * n.half, 0.94 + 1.51 * Math.sin(theta));
}

function profile(kind: Mechanism, t: number, sign: number, curve: number) {
  const f = surfaceT(t);
  const width = kind === 'pegs' ? 1.65 : kind === 'split' ? 1.2 : kind === 'funnel' ? -1.35 : 0;
  let yaw = (kind === 'start' || kind === 'finish' ? 0 : curve) * f;
  if (kind === 'helix') yaw = sign * TAU * t;
  if (kind === 'bowl') yaw = sign * 2.85 * (t - 0.1 * Math.sin(TAU * t));
  if (kind === 'bank') yaw = sign * 1.42 * (t - 0.16 * Math.sin(TAU * t));
  if (kind === 'slalom') yaw = sign * 0.38 * Math.sin(TAU * t) * f;
  const bank = kind === 'bank' || kind === 'helix' || kind === 'bowl' ? sign * 0.15 * f : kind === 'slalom' ? 0.13 * Math.sin(TAU * t) * f : 0;
  const elevate = kind === 'waves' ? 0.27 * Math.sin(3 * TAU * t) * f : kind === 'jump' ? 0.10 * Math.sin(TAU * t) * f : 0;
  return { yaw, half: HALF + f * width, bank, elevate };
}

function floorPoint(n: Sample, u: number, kind: Mechanism, feed = false) {
  let shape = 0;
  if (kind === 'bowl') shape = 0.048 * u * u * surfaceT(n.t);
  if (kind === 'split') shape = 0.10 * Math.sin(n.t * TAU) * surfaceT(n.t) * u / n.half;
  if (kind === 'slalom') shape = 0.04 * Math.sin(u + n.t * 4 * Math.PI) * surfaceT(n.t);
  if (feed) shape = .082 * u * u * surfaceT(n.t);
  if (kind === 'terraces' || kind === 'brake' || kind === 'cushions' || kind === 'sweepers') {
    const lip = (Math.abs(u) / n.half) ** 3;
    shape += (kind === 'terraces' ? .47 : .17) * lip * surfaceT(n.t);
  }
  return point(n, u, shape);
}

export const deckPoint = (n: Sample, m: Module, u: number) => floorPoint(n, u, m.kind, m.feed);

function addQuad(mesh: ColliderGeometry, a: V3, b: V3, c: V3, d: V3) {
  const i = mesh.points.length / 3;
  for (const p of [a, b, c, d]) mesh.points.push(p.x, p.y, p.z);
  mesh.triangles.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

const smooth = (t: number) => clamp(t, 0, 1) ** 2 * (3 - 2 * clamp(t, 0, 1));
const opening = (t: number) => smooth((t - 0.09) / 0.20) * smooth((0.92 - t) / 0.21);
const drumSteps = [0.33, 0.48, 0.63];

// Integral of a grade that eases from zero to one. Neighboring pitches meet with
// continuous height, slope and curvature, including at the bottom of a plunge.
function easedGradeDistance(t: number, transition: number) {
  if (t <= 0) return 0;
  if (t >= transition) return t - transition / 2;
  const u = t / transition;
  return transition * u ** 3 * (1 - u / 2);
}

function descentOffset(t: number, drop: Descent, length: number, baseGrade: number) {
  const u = (t - drop.start) / drop.span;
  return -length * drop.span * (
    (drop.downhill - baseGrade) * easedGradeDistance(u, .24)
    - (drop.downhill + drop.uphill) * easedGradeDistance(u - .44, .27)
    + (drop.uphill + baseGrade) * easedGradeDistance(u - .81, .19)
  );
}

function descentPasses(m: Module, rng: Random, extra: boolean) {
  const starts = m.speedRun ? [.036, .531] : [.082];
  const span = m.speedRun ? .45 : .82;
  const descents: Descent[] = [], passes: NarrowPass[] = [];
  const node = (t: number) => m.from + Math.round((m.to - m.from) * t);
  for (const [i, at] of starts.entries()) {
    const start = at + rng.float(-.012, .012);
    const downhill = rng.float(extra ? .68 : .58, extra ? .76 : .66) - (m.speedRun ? 0 : .055);
    const uphill = rng.float(extra ? .13 : .10, extra ? .17 : .145);
    descents.push({ start, span, downhill, uphill });
    if (i === 0 || extra) passes.push({
      entry: node(start - .022), first: node(start + .34 * span), last: node(start + .64 * span),
      exit: node(start + span), width: rng.float(extra ? 1.51 : 1.61, extra ? 1.68 : 1.82),
    });
  }
  m.descents = descents;
  m.passes = passes;
}

function appendChute(nodes: Sample[], index: number, degrees: number, rng: Random, grade: number, surface: Surface): Module {
  const from = nodes.length - 1, first = nodes[from], previous = nodes[from - 1];
  const length = metadata.chute.len + rng.float(-1.4, 2.4), steps = Math.ceil(length / .50), ds = length / steps;
  const entry = Math.atan2(previous.y - first.y, Math.hypot(first.x - previous.x, first.z - previous.z));
  const peak = degrees * Math.PI / 180, climb = -rng.float(.26, .34), exit = Math.atan(grade);
  const pitch = (t: number) => entry + (peak - entry) * smooth((t - .08) / .24)
    + (climb - peak) * smooth((t - .46) / .27) + (exit - climb) * smooth((t - .89) / .11);
  let forward = 0, y = first.y;
  for (let j = 1; j <= steps; j++) {
    const t = j / steps, mid = pitch((j - .5) / steps);
    forward += ds * Math.cos(mid);
    y -= ds * Math.sin(mid);
    nodes.push({ x: first.x + forward * Math.sin(first.yaw), z: first.z + forward * Math.cos(first.yaw), y,
      yaw: first.yaw, pitch: j === steps ? undefined : pitch(t), s: first.s + j * ds, t, bank: 0,
      half: HALF - .62 * smooth(t / .24) * smooth((1 - t) / .32), module: index });
  }
  return { kind: 'chute', name: degrees + '° drop chute', surface, from, to: from + steps, length, dropDegrees: degrees,
    floor: { points: [], triangles: [] }, rails: { points: [], triangles: [] }, devices: [], gap: null, lean: 1 };
}

function spiralProgress(t: number) {
  const shoulder = .09;
  if (t < shoulder) return t ** 2 / (2 * shoulder * (1 - shoulder));
  if (t > 1 - shoulder) return 1 - (1 - t) ** 2 / (2 * shoulder * (1 - shoulder));
  return (t - shoulder / 2) / (1 - shoulder);
}

function challengeProfile(kind: Mechanism, t: number, sign: number) {
  const blend = surfaceT(t);
  if (kind === 'terraces') return {
    yaw: sign * TAU * spiralProgress(t), half: HALF - .22 * blend, bank: -sign * .215 * blend,
    elevate: -.63 * smooth((t - .12) / .095) - .67 * smooth((t - .77) / .11),
  };
  const chicane = kind !== 'brake';
  const zigzag = Math.sin(2 * TAU * t);
  const yaw = sign * (chicane ? (zigzag * .39 + Math.sin(TAU * t) * .18) * blend : .36 * smooth(t));
  const bank = sign * (chicane ? .09 * zigzag * blend : -.058 * blend);
  const taper = kind === 'sweepers'
    ? Math.max(1 - smooth(Math.abs(t - .13) / .13), 1 - smooth(Math.abs(t - .87) / .13)) : 0;
  const half = HALF + (chicane ? .68 : .18) * blend - 1.06 * taper;
  return { yaw, bank, half, elevate: 0 };
}

export function branchFrame(n: Sample, m: Module, lane: number) {
  const t = n.t;
  const open = opening(t);
  // Keep both decks joined under the nose until the divider can guide the field.
  const spread = m.forkNose ? smooth((t - .215) / .14) * smooth((.83 - t) / .14) : open;
  const crown = m.forkNose ? .38 * smooth((t - .02) / .11) * smooth((.32 - t) / .11) : 0;
  const inner = lane === m.lean;
  let center = lane * (n.half / 2 + 0.44 * spread);
  let height = 0;
  let camber = 0;
  const width = n.half / 2;
  switch (m.track) {
    case 'prism-aquarium': {
      const cross = Math.sin(Math.PI * smooth((t - .21) / .58)) ** 2;
      center *= 1 - 1.67 * cross;
      const level = smooth((t - .035) / .24) * smooth((.965 - t) / .24);
      height = (inner ? -1.73 : 1.32) * level;
      if (!inner) height -= .82 * smooth((t - .46) / .33) * smooth((.94 - t) / .16);
      break;
    }
    case 'bellflower':
      height = (inner ? -.68 : .28) * open;
      camber = .29 * open;
      break;
    case 'cloud-quilt':
      if (inner) {
        height = drumSteps.reduce((sum, drum) => sum + .38 * Math.cos(Math.PI / 2 * clamp((t - drum) / .045, -1, 1)) ** 2, 0);
        camber = .19 * open;
      } else center -= lane * .40 * Math.sin(t * TAU * 2) * spread;
      break;
    case 'fossil-canyon':
      height = inner ? .16 * Math.sin(t * TAU * 8) * open - .35 * open : .32 * open;
      camber = .18 * open;
      break;
    case 'aurora':
      if (!inner) camber = .26 * open;
      break;
    case 'paper-moon':
      if (inner) height = .047 * Math.sin(t * TAU * 19) * open;
      else center += lane * .48 * spread;
      break;
    case 'midnight-record':
    case 'cedar-creek':
      if (!inner) center += lane * .46 * spread;
      break;
  }
  return { center, height, width, camber, crown };
}

const branchHeight = (f: ReturnType<typeof branchFrame>, lane: number, span: number) =>
  f.height + f.camber * span ** 2 + f.crown * Math.max(0, -lane * span) ** 2;

export function branchPoint(n: Sample, m: Module, lane: number, span = 0, offset = 0) {
  const f = branchFrame(n, m, lane);
  return point(n, f.center + span * f.width, branchHeight(f, lane, span) + offset);
}

export function branchContact(n: Sample, m: Module, u: number, y: number, tolerance: number) {
  let nearest: { lane: number; dy: number; excess: number } | undefined;
  for (const lane of [-1, 1]) {
    const f = branchFrame(n, m, lane);
    const span = clamp((u - f.center) / f.width, -1, 1);
    const dy = y - (point(n, u).y + branchHeight(f, lane, span));
    const excess = Math.abs(u - f.center) - f.width;
    if (excess <= tolerance && (!nearest || Math.abs(dy) < Math.abs(nearest.dy))) nearest = { lane, dy, excess };
  }
  return nearest;
}

function signatureGeometry(nodes: Sample[], m: Module, rng: Random, grade: number) {
  const track = m.track!;
  const spec = SIGNATURES[track];
  const bands = new Map<Surface, ColliderGeometry>();
  const band = (surface: Surface) => {
    let geometry = bands.get(surface);
    if (!geometry) {
      geometry = { points: [], triangles: [] };
      bands.set(surface, geometry);
    }
    return geometry;
  };
  for (let i = m.from; i < m.to; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const t = (i - m.from + 0.5) / (m.to - m.from);
    for (const lane of [-1, 1]) {
      const inner = lane === m.lean;
      let surface = inner ? spec.inside : spec.outside;
      if (t < .10 || t > .91) surface = m.surface;
      if (inner && track === 'aurora' && [0.33, 0.50, 0.67].some(x => Math.abs(t - x) < .053)) surface = 'snow';
      if (inner && track === 'bellflower' && t >= .57 && t <= .76) surface = 'clay';
      if (inner && track === 'cloud-quilt' && !drumSteps.some(x => Math.abs(t - x) < .032)) surface = 'felt';
      for (let k = -2; k < 2; k++) {
        const corners = [branchPoint(a, m, lane, k / 2), branchPoint(b, m, lane, k / 2),
          branchPoint(b, m, lane, (k + 1) / 2), branchPoint(a, m, lane, (k + 1) / 2)] as const;
        addQuad(m.floor, ...corners);
        addQuad(band(surface), ...corners);
      }
      for (const edge of [-1, 1]) {
        const outer = edge === lane;
        const nose = m.forkNose ? .85 * smooth((t - .07) / .12) * smooth((.90 - t) / .12) : 0;
        const lift = outer ? 1.03 : Math.max(opening(t), nose) * .79;
        if (lift < .09) continue;
        const a0 = branchPoint(a, m, lane, edge), b0 = branchPoint(b, m, lane, edge);
        const a1 = { ...a0, y: a0.y + lift }, b1 = { ...b0, y: b0.y + lift };
        if (edge === -1) addQuad(m.rails, a0, a1, b1, b0);
        else addQuad(m.rails, b0, b1, a1, a0);
      }
    }
  }
  m.bands = [...bands].map(([surface, geometry]) => ({ surface, geometry }));
  const insert = (kind: Device['kind'], t: number, span: number, size: V3, surface: Surface, offset: number) => {
    const n = nodes[m.from + Math.round(t * (m.to - m.from))];
    if (kind === 'gate' && m.forkNose) {
      const width = branchFrame(n, m, m.lean).width;
      const safeSpan = Math.max(0, 1 - (.84 + Math.hypot(size.x, size.z) / 2) / width);
      span = clamp(span, -safeSpan, safeSpan);
    }
    m.devices.push({ kind, p: branchPoint(n, m, m.lean, span, offset), yaw: n.yaw, size, surface,
      phase: rng.float(0, TAU), s: n.s, grade });
  };
  if (track === 'cedar-creek') {
    const size = m.forkNose ? { x: 3.65, y: .12, z: 4.2 } : { x: 4.55, y: .12, z: 4.9 };
    insert('scoop', .49, 0, size, 'cork', m.forkNose ? -.225 : -.17);
  }
  if (track === 'clockmaker') {
    insert('gate', .31, .97, { x: .62, y: .27, z: .15 }, 'brass', .16);
    for (const [i, t] of [.43, .53, .63].entries()) {
      insert('chime', t, i % 2 ? -.85 : .83, { x: .27, y: .19, z: .27 }, 'brass', .065);
    }
  }
  if (track === 'fossil-canyon') for (const [i, t] of [.37, .46, .54, .62].entries()) {
    insert('peg', t, i % 2 ? -.71 : .53, { x: .53, y: .14, z: .53 }, 'sandstone', .025);
  }
  if (track === 'midnight-record') {
    insert('platter', .51, 0, { x: 4.3, y: .16, z: 4.3 }, 'vinyl', -.012);
    insert('gate', .40, .88, { x: 1.09, y: .24, z: .12 }, 'felt', .13);
  }
}

function geometry(nodes: Sample[], m: Module, obstacles: ObstacleLevel) {
  const grip = { points: [], triangles: [] } as ColliderGeometry;
  const bypass = { points: [], triangles: [] } as ColliderGeometry;
  const slides = { points: [], triangles: [] } as ColliderGeometry;
  for (let i = m.from; i < m.to; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const t = (i - m.from + .5) / (m.to - m.from);
    const dropIndex = m.descents?.findIndex(d => t >= d.start && t <= d.start + d.span) ?? -1;
    const drop = m.descents?.[dropIndex];
    const u = drop ? (t - drop.start) / drop.span : -1;
    const polished = u >= .16 && u < .60;
    const gripSide = m.lean * (dropIndex % 2 ? -1 : 1);
    for (let lane = 0; lane < 4; lane++) {
      if (m.gap && i > m.from && a.t >= m.gap[0] - 1e-8 && b.t <= m.gap[1] + 1e-8) continue;
      const left = lane / 2 - 1;
      const right = (lane + 1) / 2 - 1;
      const corners = [deckPoint(a, m, left * a.half), deckPoint(b, m, left * b.half),
        deckPoint(b, m, right * b.half), deckPoint(a, m, right * a.half)] as const;
      addQuad(m.floor, ...corners);
      if (m.dropDegrees) {
        addQuad(t < .10 || t > .94 ? bypass : t < .62 ? slides : grip, ...corners);
      } else if (m.descents) {
        const side = lane < 2 ? -1 : 1;
        const recoveryStrip = u >= .68 && u < .93 && side === gripSide;
        const entryStrip = (dropIndex === 0 || obstacles === 'extra') && u >= .045 && u < .15 && side !== gripSide;
        addQuad(polished ? slides : recoveryStrip || entryStrip ? grip : bypass, ...corners);
      }
    }
    for (const s of [-1, 1]) {
      const a0 = floorPoint(a, a.half * s, m.kind, m.feed);
      const b0 = floorPoint(b, b.half * s, m.kind, m.feed);
      const a1 = m.dropDegrees ? chuteRailTop(a, s) : { ...a0, y: a0.y + 0.94 };
      const b1 = m.dropDegrees ? chuteRailTop(b, s) : { ...b0, y: b0.y + 0.94 };
      if (s < 0) addQuad(m.rails, a0, a1, b1, b0);
      else addQuad(m.rails, b0, b1, a1, a0);
    }
    if (m.dropDegrees && t >= .07 && t <= .79) {
      addQuad(m.rails, chuteRailTop(a, -1), chuteRailTop(a, 1), chuteRailTop(b, 1), chuteRailTop(b, -1));
    }
    if (m.kind === 'tunnel') {
      for (let j = 0; j < 12; j++) {
        addQuad(m.rails, tunnelPoint(a, j), tunnelPoint(b, j), tunnelPoint(b, j + 1), tunnelPoint(a, j + 1));
      }
    }
  }
  if (m.descents || m.dropDegrees) m.bands = [{ surface: m.surface, geometry: bypass },
    { surface: m.dropDegrees ? 'brakepad' : 'grit', geometry: grip }, { surface: 'slide', geometry: slides }];
}

function populateChallenge(nodes: Sample[], module: Module, rng: Random, extra: boolean) {
  const moving = module.kind === 'sweepers';
  const positions = moving ? extra ? [.20, .49, .78] : [.30, .70]
    : extra ? [.18, .34, .50, .66, .82] : [.25, .50, .75];
  for (const [i, at] of positions.entries()) {
    const t = at + rng.float(-.023, .023);
    const n = nodes[Math.round(module.from + t * (module.to - module.from))];
    const side = module.lean * (-1) ** i;
    const radius = moving ? .54 : .49;
    const edge = n.half - radius - .78;
    const x = clamp(side * (moving ? 1.36 : 1.69) + rng.float(-.25, .25), -edge + .16, edge - .16);
    const amplitude = Math.min(extra ? 1.35 : 1.15, edge - Math.abs(x));
    module.devices.push({ kind: moving ? 'sweeper' : 'cushion', p: deckPoint(n, module, x), yaw: n.yaw,
      size: { x: 2 * radius, y: 2 * radius, z: 2 * radius }, phase: rng.float(0, TAU), surface: 'rubber', s: n.s, grade: 0,
      sweep: moving ? { amplitude, bank: n.bank } : undefined,
    });
    module.devices[module.devices.length - 1].p.y -= radius * .56;
  }
}

function addHurdles(nodes: Sample[], modules: Module[], seed: string, extra: boolean) {
  const rng = new Random(seed + '/hurdles');
  const sites = modules.filter(m => !m.track && !m.bridge && !m.passes && !m.devices.length &&
    ['bank', 'waves', 'bowl', 'tunnel', 'brake', 'funnel'].includes(m.kind) && !m.feed);
  if (sites.length < 3) {
    const openTurn = modules.find(m => m.kind === 'terraces' || m.kind === 'helix')!;
    sites.push(openTurn);
    sites.sort((a, b) => a.from - b.from);
  }
  const chosen = [sites[0], sites[Math.floor(sites.length / 2)], sites.at(-1)];
  const families = rng.shuffle(['roller', 'fin', 'swing'] as const);
  for (const [i, m] of chosen.entries()) {
    if (!m) continue;
    const family = families[i];
    const positions = extra ? [.22, .72] : [.46];
    for (const [j, station] of positions.entries()) {
      const kind = j === 0 ? family : families[(i + 1) % 3];
      const marks = kind === 'fin' ? [-.07, .07] : [0];
      const stationT = station + rng.float(-.025, .025);
      for (const [k, offset] of marks.entries()) {
        const index = m.from + Math.round((m.to - m.from) * (stationT + offset));
        const n = nodes[index], next = nodes[index + 1];
        const hand = m.lean * (-1) ** (j + k);
        const u = hand * Math.min(kind === 'swing' ? 1.22 : 1.78, n.half * (kind === 'swing' ? .33 : .47));
        const p = deckPoint(n, m, u);
        const size = kind === 'roller' ? { x: 2.12, y: .36, z: .36 } :
          kind === 'fin' ? { x: .22, y: .43, z: 1.50 } : { x: .32, y: .43, z: 1.68 };
        p.y += kind === 'roller' ? -.065 : size.y * .46;
        m.devices.push({ kind, p, size, yaw: n.yaw + (kind === 'fin' ? hand * .38 : 0),
          grade: Math.atan2(n.y - next.y, next.s - n.s), s: n.s, surface: kind === 'swing' ? 'rubber' : 'wood',
          phase: rng.float(0, TAU) });
      }
    }
  }
}

function populate(nodes: Sample[], m: Module, rng: Random, gradeFactor: number, obstacles: ObstacleLevel) {
  const insert = (kind: Device['kind'], t: number, u: number, x: number, y: number, z: number, surface: Surface, height = y / 2) => {
    const node = nodes[Math.round(m.from + t * (m.to - m.from))];
    m.devices.push({
      kind, p: floorPoint(node, u, m.kind), yaw: node.yaw, size: { x, y, z },
      phase: rng.float(0, TAU), surface, s: node.s, grade: 0.195 * gradeFactor,
    });
    m.devices[m.devices.length - 1].p.y += height;
  };
  switch (m.kind) {
    case 'slalom':
      for (let i = 0; i < 5; i++) insert('bumper', 0.18 + i * 0.16, (i % 2 ? -1 : 1) * m.lean * 1.78, 0.95, 0.50, 1.3, 'rubber');
      break;
    case 'split':
      for (let i = 0; i < 8; i++) insert('divider', 0.25 + 0.071 * i, 0, 0.19, 0.74, m.length * 0.075, 'acrylic');
      break;
    case 'pegs':
      for (let row = 0; row < 4; row++) {
        for (const x of [-2.55, 0, 2.55]) insert('peg', 0.23 + row * 0.16, x + (row % 2 ? 0.75 : -0.3), 0.27, 0.66, 0.27, 'rubber');
      }
      break;
    case 'paddle':
      for (const t of [0.36, 0.68]) insert('paddle', t, (t < 0.5 ? -1 : 1) * m.lean * 0.98, 1.68, 0.36, 0.19, 'plastic');
      break;
    case 'gates':
      for (const t of [0.3, 0.52, 0.74]) insert('gate', t, (t === 0.52 ? -1 : 1) * m.lean * (obstacles === 'original' ? 2.12 : 1.77), 1.82, 0.48, 0.16, 'metal');
      break;
    case 'tilt':
      for (const t of [0.34, 0.64]) insert('tilt', t, (t < 0.5 ? -1 : 1) * 1.38, 2.65, 0.12, 3.2, 'wood', -0.035);
      break;
    case 'conveyor':
      insert('belt', 0.48, 0, HALF * 1.86, 0.08, m.length * 0.53, 'rubber', 0.015);
      break;
    case 'chime':
      for (let i = 0; i < 8; i++) {
        insert('chime', 0.18 + i * 0.09, ((i * 7) % 11 - 5) * 0.53, 0.23, 0.70, 0.23, 'metal');
      }
      break;
  }
}

export function makePlan(seed: string, theme: Theme, target: number, fallback = false, track?: TrackId, obstacles: ObstacleLevel = 'standard'): Plan {
  const rng = new Random(seed);
  const spec = track ? SIGNATURES[track] : undefined;
  const approaches = spec && rng.shuffle(spec.approach);
  const challenge = spec && obstacles !== 'original' ? obstacles : undefined;
  const kinds: Mechanism[] = !approaches ? ['start', ...rng.shuffle(MECHANISMS), 'finish']
    : challenge ? ['start', ...approaches, 'brake', 'funnel', 'signature', 'cushions', 'bank', 'sweepers', 'terraces', 'bank', 'finish']
      : ['start', ...approaches, 'bank', 'funnel', 'signature', 'waves', 'slalom', 'bank', 'waves', 'bank', 'finish'];
  const chuteRandom = new Random(seed + '/drop-chutes');
  if (obstacles !== 'original') {
    kinds.splice(spec ? kinds.indexOf('terraces') : 12, 0, 'chute');
    kinds.splice(3, 0, 'chute');
  }
  const signatureIndex = kinds.indexOf('signature');
  const bridgeIndex = obstacles === 'original' ? -1 : kinds.lastIndexOf('bank');
  const returnPass = obstacles === 'original' ? -1 : spec ? kinds.indexOf('bank', signatureIndex + 1) : kinds.indexOf('funnel');
  const bridgeRandom = new Random(seed + '/bridge');
  const descentRandom = new Random(seed + '/descents');
  const modules: Module[] = [];
  const nodes: Sample[] = [];
  let x = 0, z = 0, y = 64, yaw = 0, s = 0;
  const scale = clamp(target / 120, 0.70, 1.44) * (spec ? 1.24 : 1);
  // Short courses retain room for the helix and catch deck. Long courses use gentler slopes.
  const gradeFactor = 1 + clamp((100 - target) / 40, 0, 1) * (spec ? .12 : .42) - clamp((target - 145) / 35, 0, 1) * .12;
  for (const [idx, kind] of kinds.entries()) {
    if (kind === 'chute') {
      const degrees = idx === kinds.indexOf('chute') ? (obstacles === 'extra' ? chuteRandom.int(66, 74) : chuteRandom.int(55, 65)) : 80;
      const chute = appendChute(nodes, idx, degrees, chuteRandom, .19 * gradeFactor, spec?.deck ?? 'wood');
      geometry(nodes, chute, obstacles);
      modules.push(chute);
      ({ x, y, z, yaw, s } = nodes[chute.to]);
      continue;
    }
    const sig = kind === 'signature' ? spec : undefined;
    const feed = Boolean(spec && kind === 'funnel');
    const challengeModule = kind === 'brake' || kind === 'cushions' || kind === 'sweepers' || kind === 'terraces';
    const { len, name, surface } = sig ? { len: sig.length, name: sig.landmark, surface: sig.deck } : metadata[kind];
    const speedRun = kind === 'brake' || (!spec && obstacles !== 'original' && kind === 'waves');
    const hasDescent = speedRun || idx === returnPass;
    const nominalLength = len * scale * (fallback ? 1 : rng.float(0.91, 1.09));
    const length = Math.max(nominalLength, speedRun ? 40 : hasDescent ? 29 : 0);
    const steps = Math.ceil(length / (hasDescent ? .65 : 1.02));
    const sign = rng.pick([-1, 1]);
    const baseYaw = yaw;
    const curve = ['split', 'tilt', 'conveyor', 'jump'].includes(kind) ? 0 : rng.float(-0.38, 0.38);
    const slope = ((kind === 'helix' ? 0.26 : kind === 'finish' || kind === 'terraces' ? 0.215 : spec ? 0.185 : 0.195)
      + (fallback ? 0 : rng.float(-0.009, 0.009))) * gradeFactor;
    const from = Math.max(0, nodes.length - 1);
    const painted = kind === 'finish' || track === 'bellflower' && idx > signatureIndex;
    const wear = spec ? painted ? spec.finishSurface : surface === 'acrylic' ? 'acrylic' : spec.deck : surface;
    const m: Module = { kind, name: kind === 'finish' && spec ? spec.finish : feed ? 'Branch approach' : name,
      surface: wear,
      from, to: from + steps, length, floor: { points: [], triangles: [] },
      rails: { points: [], triangles: [] }, devices: [], lean: sign,
      track: sig && track, feed, forkNose: Boolean(sig && challenge),
      speedRun,
      gap: kind === 'jump' ? [Math.floor(steps * 0.52) / steps, (Math.floor(steps * 0.52) + 1) / steps] : null,
    };
    const startY = y;
    const ds = length / steps;
    if (hasDescent) {
      descentPasses(m, descentRandom, obstacles === 'extra');
      m.name = speedRun ? 'Twin plunge chutes' : 'The narrows & uphill runout';
    }
    if (idx === bridgeIndex) {
      const spans = Math.ceil(bridgeRandom.float(5.45, 6.95) / ds);
      const first = from + Math.floor((steps - spans) * .49);
      m.bridge = { width: bridgeRandom.float(1.51, 1.61), first, last: first + spans };
      m.name = 'Two-wide bridge & passing turn';
    }
    const drop = kind === 'jump' ? 0.46 : 0;
    const bridge = m.bridge;
    const bend = (f: number) => {
      if (bridge) {
        const at = from + f * steps;
        const exit = smooth((at - bridge.last) / (m.to - bridge.last));
        const narrow = smooth((at - from) / (bridge.first - from)) * (1 - exit);
        return { yaw: sign * .72 * exit, half: HALF - (HALF - bridge.width / 2) * narrow,
          bank: -sign * .12 * surfaceT(exit), elevate: 0 };
      }
      if (sig) return {
        yaw: sign * sig.turn * smooth((f - .05) / .90),
        half: f === 1 ? HALF : HALF + (sig.width - HALF) * surfaceT(f),
        bank: -.126 * sign * surfaceT(f), elevate: 0,
      };
      if (challengeModule) return challengeProfile(kind, f, sign);
      if (spec && kind === 'bank') return {
        yaw: sign * .96 * smooth(f), half: HALF, bank: -.10 * sign * surfaceT(f), elevate: 0,
      };
      return profile(kind, f, sign, feed ? 0 : spec ? curve * .53 : curve);
    };
    if (idx === 0) nodes.push({ x, y, z, yaw, s, t: 0, half: HALF, bank: 0, module: idx });
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const p = bend(t);
      const mid = bend((j - 0.5) / steps);
      yaw = baseYaw + p.yaw;
      x += Math.sin(baseYaw + mid.yaw) * ds;
      z += Math.cos(baseYaw + mid.yaw) * ds;
      s += ds;
      const terraces = track === 'fossil-canyon' && idx === 1
        ? .48 * [.22, .48, .72].reduce((sum, edge) => sum + smooth((t - edge) / .07), 0) : 0;
      let half = p.half;
      for (const pass of m.passes ?? []) {
        const at = from + j;
        const taper = smooth((at - pass.entry) / (pass.first - pass.entry)) * smooth((pass.exit - at) / (pass.exit - pass.last));
        half += (pass.width / 2 - half) * taper;
      }
      const elevation = m.descents ? m.descents.reduce((sum, drop) => sum + descentOffset(t, drop, length, slope), 0) : p.elevate;
      y = startY - slope * length * t + elevation - terraces
        - (m.gap && t >= m.gap[1] - 1e-8 ? drop : 0);
      nodes.push({ x, y, z, yaw, s, t, half, bank: p.bank, module: idx });
    }
    if (sig) signatureGeometry(nodes, m, rng, slope);
    else {
      geometry(nodes, m, obstacles);
      if (kind === 'sweepers' || kind === 'cushions') populateChallenge(nodes, m, rng, obstacles === 'extra');
      else populate(nodes, m, rng, gradeFactor, obstacles);
      if (spec && kind === 'slalom') {
        m.devices = m.devices.filter((_d, i) => i % 2 === 0 && (track !== 'bellflower' || idx < signatureIndex));
      }
    }
    modules.push(m);
  }
  if (obstacles !== 'original') addHurdles(nodes, modules, seed, obstacles === 'extra');
  const end = modules[modules.length - 1];
  const finish = end.to - Math.max(5, Math.round((end.to - end.from) * 0.24));
  const checks = [0];
  for (const m of modules) {
    for (let i = m.from + 4; i < Math.min(m.to, finish); i += 4) checks.push(i);
    if (m.to < finish) checks.push(m.to);
  }
  checks.push(finish);
  return { seed, theme, nodes, modules, checks, length: nodes[finish].s, finish, gradeFactor, track, obstacles: challenge, level: obstacles,
    finalSection: end.from, signature: track ? `${track}/${obstacles}/${seed}` : kinds.slice(1, -1).join('/') };
}

export function planFor(settings: Settings, round: number, attempt = 0, fallback = false, obstacles = settings.obstacles) {
  const themeChoice = settings.theme === 'random' ? new Random(`${settings.seed}/lighting/${round}`).pick(THEMES) : settings.theme;
  if (settings.track !== 'classic') {
    const track = settings.track === 'rotate' ? signatureFor(settings.seed, round) : settings.track;
    const theme = themeChoice === 'rotate' ? SIGNATURES[track].music : themeChoice;
    const seed = fallback ? `${RESERVE_SEEDS[track]}/1/${attempt}/${track}` : `${settings.seed}/${round}/${attempt}/${track}`;
    return makePlan(seed, theme, settings.raceTarget, false, track, obstacles);
  }
  const theme = themeChoice === 'rotate' ? THEMES[(round - 1) % THEMES.length] : themeChoice;
  return makePlan(fallback ? `bank/${(round - 1) % 5}` : `${settings.seed}/${round}/${attempt}`, theme, settings.raceTarget, fallback, undefined, obstacles);
}

function segmentAt(plan: Plan, s: number) {
  let low = 0, high = plan.nodes.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (plan.nodes[middle].s <= s) low = middle;
    else high = middle;
  }
  return low;
}

export function nodeAt(plan: Plan, s: number) {
  return plan.nodes[segmentAt(plan, s)];
}

export function pathPoseAt(plan: Plan, s: number, pose: V3 & { yaw: number }) {
  const index = segmentAt(plan, s);
  const a = plan.nodes[index], b = plan.nodes[index + 1];
  const t = clamp((s - a.s) / (b.s - a.s), 0, 1);
  pose.x = a.x + (b.x - a.x) * t;
  pose.y = a.y + (b.y - a.y) * t;
  pose.z = a.z + (b.z - a.z) * t;
  pose.yaw = a.yaw + (b.yaw - a.yaw) * t;
  return pose;
}

export function validatePlan(plan: Plan) {
  return (plan.track ? plan.modules.filter(m => m.track === plan.track && m.bands?.length).length === 1
    : MECHANISMS.every(kind => plan.modules.some(m => m.kind === kind)))
    && plan.modules.every((m, i) => m.to > m.from && (i === 0 || m.from === plan.modules[i - 1].to)
      && plan.nodes[m.from].half === HALF && Math.abs(plan.nodes[m.from].bank) < 1e-8
      && m.floor.points.every(Number.isFinite) && (!m.gap || m.gap[0] < m.gap[1]))
    && plan.checks.every((n, i) => i === 0 || n > plan.checks[i - 1]);
}
