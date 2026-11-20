import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Settings } from './config';
import { IDENTITIES, lineupOffset, RADIUS } from './identities';
import type { Identity } from './identities';
import type { Phase } from './lifecycle';
import { devicePose, STEP } from './physics';
import type { Place, Racer, RacePhysics } from './physics';
import { Random } from './random';
import { PALETTES } from './themes';
import { along, branchPoint, chutePoint, chuteRailTop, deckPoint, gridSurface, nodeAt, point, side, tunnelPoint } from './track';
import type { ColliderGeometry, Device, Module, Plan, Sample, Surface, V3 } from './track';
import { ShowCamera } from './camera';
import { GridCrew } from './grid-crew';
import { bayOffset, finishPoint, finishRack, ROLLOUT_SECONDS, rolloutPosition } from './finish-runout';
import type { FinishRack } from './finish-runout';
import { SIGNATURES } from './signatures';
import { SignatureArt } from './signature-art';
import { SURFACES } from './surfaces';
import { TracksideScenery } from './trackside-scenery';
import type { Tabletop } from './scenic-terrain';

type Palette = Record<keyof typeof PALETTES.workshop, string>;
type Materials = ReturnType<typeof materials>;
const V = (p: V3) => new T.Vector3(p.x, p.y, p.z);
const box = new T.BoxGeometry(1, 1, 1);
const roller = new T.CapsuleGeometry(.18, 1.76, 5, 12);
const fin = new RoundedBoxGeometry(.22, .43, 1.50, 2, .085);
const swing = new RoundedBoxGeometry(.32, .43, 1.68, 2, .085);
const post = new T.CylinderGeometry(1, 1, 1, 18);
const orb = new T.SphereGeometry(1, 24, 18);
const disc = new T.CylinderGeometry(1, 1, 1, 40);
const torus = new T.TorusGeometry(1, 0.10, 8, 32);
const plane = new T.PlaneGeometry(1, 1);
const planeNormal = new T.Vector3(0, 0, 1);
const shadowFalloff = 3 * RADIUS;
type ContactShadow = T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;

function texture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (context) paint(context);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function woodgrain() {
  const rng = new Random('hand-cut maple');
  const tex = texture(256, 512, ctx => {
    ctx.fillStyle = '#fff4e2';
    ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 160; i++) {
      const x = rng.float(0, 256), y = rng.float(-80, 500), length = rng.float(35, 485);
      ctx.strokeStyle = `rgba(120,67,31,${rng.float(0.025, 0.14)})`;
      ctx.lineWidth = rng.float(0.35, 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 4, y + length * 0.28, x + 4, y + length * 0.65, x, y + length);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  return tex;
}

function marbleTexture(identity: Identity) {
  return texture(512, 256, ctx => {
    ctx.fillStyle = identity.color;
    ctx.fillRect(0, 0, 512, 256);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#fff7ec';
    for (const [i, width] of [12, 27, 4, 11].entries()) {
      const y = 42 + i * 51;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(-45, y);
      ctx.bezierCurveTo(128, y + 84, 268, y - 105, 556, y + 14);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Face a numbered patch toward the grid camera while the ball is in its hand.
    for (const x of [128, 384]) {
      ctx.fillStyle = identity.id === 8 || identity.id === 3 ? '#26354b' : '#fff9e9';
      ctx.beginPath();
      ctx.arc(x, 112, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 48px Arial';
      ctx.fillStyle = identity.id === 8 || identity.id === 3 ? '#fff5d9' : '#213044';
      ctx.fillText(String(identity.id), x, 113);
      ctx.fillStyle = '#ffffffd9';
      ctx.font = 'bold 37px Arial';
      ctx.fillText(identity.mark, x + 115, 150);
    }
  });
}

function titleTexture(title: string, sub: string, ink: string, bg: string) {
  return texture(512, 160, ctx => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    const rank = /^\d+$/.test(title);
    ctx.font = rank ? '900 108px Arial' : '900 61px Arial';
    ctx.fillText(title, 256, sub ? 88 : rank ? 116 : 101, 475);
    if (sub) {
      ctx.globalAlpha = 0.7;
      ctx.font = 'bold 21px Arial';
      ctx.fillText(sub, 256, 126);
    }
  });
}

function materials(p: Palette, grain: T.Texture) {
  const standard = (color: T.ColorRepresentation, roughness = 0.55, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const wood = new T.MeshStandardMaterial({ color: p.wood, map: grain, roughness: 0.54, side: T.DoubleSide });
  const acrylic = new T.MeshPhysicalMaterial({ color: p.second, metalness: 0.13, roughness: 0.21, transparent: true,
    opacity: 0.28, depthWrite: false, side: T.DoubleSide, clearcoat: 1 });
  const surface = Object.fromEntries(Object.entries(SURFACES).map(([key, s]) => [key, key === 'wood' ? wood
    : standard(key === 'acrylic' ? p.second : key === 'plastic' ? p.wood : s.tint, s.rough, s.metal)])) as Record<Surface, T.MeshStandardMaterial>;
  for (const material of Object.values(surface)) material.side = T.DoubleSide;
  return {
    surface, acrylic, trim: standard(p.trim), pop: standard(p.pop, 0.38), second: standard(p.second, 0.38),
    deck: standard(p.deck), cream: standard('#ffe5b7', 0.43),
    dark: standard('#253442', 0.64), gold: standard('#e8ab4a', 0.24, 0.64), softGold: standard('#fbce77', 0.41, 0.27),
    check: standard('#f6f0d9'), blinker: new T.MeshStandardMaterial({ color: p.pop, emissive: p.pop, emissiveIntensity: 0.35 }),
  };
}

function surfaceGrain(surface: Surface) {
  return texture(96, 96, ctx => {
    const rng = new Random(`texture/${surface}`);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 96, 96);
    const woven = surface === 'felt' || surface === 'cloth';
    const jointed = surface === 'bamboo' || surface === 'cardboard' || surface === 'slate';
    ctx.strokeStyle = jointed ? '#5c493c43' : '#36496928';
    ctx.lineWidth = 1;
    for (let x = 0; x < 96; x += jointed ? 9 : 5) {
      ctx.beginPath();
      ctx.moveTo(x - .25, 0);
      ctx.lineTo(x + (jointed ? 0 : 4), 96);
      ctx.stroke();
    }
    if (jointed || woven) for (let y = woven ? 0 : 16; y < 96; y += woven ? 6 : 32) {
      ctx.fillStyle = woven ? '#3d344b26' : '#534b5855';
      ctx.fillRect(0, y, 96, woven ? 1.2 : .82);
    }
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = i % 2 ? '#3b404825' : '#ffffff65';
      ctx.fillRect(rng.float(0, 96), rng.float(0, 96), rng.float(.5, 2.2), rng.float(.5, 1.4));
    }
  });
}

function geo(data: ColliderGeometry) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(data.points, 3));
  const uv: number[] = [];
  for (let i = 0; i < data.points.length; i += 3) uv.push((data.points[i] + data.points[i + 2]) / 7, (data.points[i + 2] - data.points[i]) / 13);
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(data.triangles);
  g.computeVertexNormals();
  return g;
}

class Details {
  private readonly batches = new Map<T.Material, Map<T.BufferGeometry, T.Matrix4[]>>();
  private readonly dummy = new T.Object3D();
  constructor(readonly group: T.Group) {}
  add(g: T.BufferGeometry, m: T.Material, p: V3, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) {
    const map = this.batches.get(m) ?? new Map();
    this.batches.set(m, map);
    const items = map.get(g) ?? [];
    map.set(g, items);
    this.dummy.position.set(p.x, p.y, p.z);
    this.dummy.rotation.set(pitch, yaw, roll, 'YXZ');
    this.dummy.scale.set(x, y, z);
    this.dummy.updateMatrix();
    items.push(this.dummy.matrix.clone());
  }
  *flush() {
    for (const [mat, shapes] of this.batches) {
      for (const [shape, matrix] of shapes) {
        const instance = new T.InstancedMesh(shape, mat, matrix.length);
        matrix.forEach((m, i) => instance.setMatrixAt(i, m));
        instance.receiveShadow = true;
        instance.computeBoundingSphere();
        this.group.add(instance);
        yield;
      }
    }
    this.batches.clear();
  }
}

function mesh<M extends T.Material>(parent: T.Object3D, g: T.BufferGeometry, m: M, p: V3, scale?: V3) {
  const value = new T.Mesh(g, m);
  value.position.set(p.x, p.y, p.z);
  if (scale) value.scale.set(scale.x, scale.y, scale.z);
  parent.add(value);
  return value;
}

function bar(details: Details, a: V3, b: V3, height: number, thickness: number, mat: T.Material, pitch = true) {
  const d = V(b).sub(V(a));
  const at = V(a).addScaledVector(d, 0.5);
  details.add(box, mat, at, thickness, height, d.length() + 0.025, Math.atan2(d.x, d.z),
    pitch ? -Math.atan2(d.y, Math.hypot(d.x, d.z)) : 0);
}

const nudged = (v: V3, y: number) => ({ ...v, y: v.y + y });
const zero = { x: 0, y: 0, z: 0 };

class CourseScene {
  readonly scene = new T.Scene();
  readonly camera = new ShowCamera();
  private readonly sun = new T.DirectionalLight();
  private readonly fill = new T.HemisphereLight();
  private readonly scenery: TracksideScenery;
  private readonly marbleMats: T.MeshPhysicalMaterial[];
  private readonly grid: ReturnType<typeof gridSurface>;
  private readonly meshes = new Map<number, { marble: T.Mesh; shadow: ContactShadow; ring: T.Mesh; label: T.Vector3 }>();
  private readonly particles = new T.InstancedMesh(box, new T.MeshBasicMaterial({ color: '#ffffff' }), 80);
  private readonly scratch = new T.Object3D();
  private readonly disposable: { dispose(): void }[] = [];
  private readonly route = new T.Group();
  private startGate?: T.Mesh;
  private gridCrew?: GridCrew;
  private signatureArt?: SignatureArt;
  private readonly deckLights: T.Mesh[] = [];
  private readonly podium = new T.Group();
  private readonly podiumRacers: T.Mesh[] = [];
  private rack!: FinishRack;
  private readonly rollouts = new Map<number, { rank: number; start: number }>();
  private readonly parked = new Set<number>();
  private readonly rollTarget = new T.Vector3();
  private readonly rollAxis = new T.Vector3();
  private readonly rollRotation = new T.Quaternion();
  private readonly movers: { device: Device; mesh: T.Object3D }[] = [];
  private readonly belts: { device: Device; mesh: T.InstancedMesh }[] = [];
  private readonly podiumAt = new T.Vector3();
  private visualTime = 0;
  private showingPodium = false;
  private readonly lightOffset = new T.Vector3(-8, 15, 9);
  private readonly projected = new T.Vector3();

  constructor(readonly plan: Plan, environment: T.Texture, private readonly grain: T.Texture, marbleMats: readonly T.MeshPhysicalMaterial[], private readonly blob: T.MeshBasicMaterial) {
    this.camera.course(plan);
    this.scene.environment = environment;
    this.marbleMats = marbleMats.map(material => material.clone());
    this.grid = gridSurface(plan);
    this.disposable.push(...this.marbleMats);
    this.sun.intensity = 2.15;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 66, near: 0.5 });
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.03;
    this.fill.intensity = 1.28;
    this.scene.add(this.sun, this.sun.target, this.fill, this.route, this.podium);
    this.scenery = new TracksideScenery(plan, environment);
    this.disposable.push(this.scenery);
    this.particles.frustumCulled = false;
    const rng = new Random('podium confetti');
    for (let i = 0; i < this.particles.count; i++) this.particles.setColorAt(i, new T.Color(rng.pick(['#ffc45e', '#ffffff', '#6de0ca', '#fc7967', '#aa89ff'])));
    this.scene.add(this.particles);
  }

  *build(roster: readonly Identity[]) {
    const plan = this.plan;
    const base = PALETTES[plan.theme];
    const sig = plan.track ? SIGNATURES[plan.track] : undefined;
    const p = sig ? { ...base, sky: sig.colors[0], fog: sig.colors[0], deck: sig.colors[1],
      wood: sig.colors[1], trim: sig.colors[2], pop: sig.colors[3], second: sig.colors[4] } : base;
    const m = materials(p, this.grain);
    if (sig) {
      const patterned = ['cardboard', 'bamboo', 'clay', 'felt', 'cloth', 'sandstone', 'slate', 'vinyl', 'snow', 'grit'];
      const floors = new Set(plan.modules.flatMap(module => [module.surface, ...(module.bands?.map(b => b.surface) ?? [])]));
      for (const material of floors) if (patterned.includes(material)) {
        const map = surfaceGrain(material);
        map.wrapS = map.wrapT = T.RepeatWrapping;
        m.surface[material].map = map;
        this.disposable.push(map);
      }
    }
    this.disposable.push(...new Set([...Object.values(m.surface),
      m.acrylic, m.trim, m.pop, m.second, m.deck, m.cream, m.dark, m.gold, m.softGold, m.check, m.blinker]));
    this.scene.background = new T.Color(p.sky);
    this.scene.fog = new T.FogExp2(p.fog, sig ? 0.014 : 0.023);
    this.fill.color.set(p.ambient);
    this.fill.groundColor.set('#c29371');
    this.sun.color.set(p.light);
    const details = new Details(this.route);
    yield* this.scenery.buildGround(this.route, this.podium);
    const timber = plan.obstacles ? new T.MeshStandardMaterial({ color: '#ce9c65', map: this.grain, roughness: .56 }) : m.deck;
    if (plan.obstacles) this.disposable.push(timber);
    const spiral = this.scenery.terrain.spiralTable;
    if (spiral) this.buildSpiralBase(details, spiral, timber, m);
    for (const module of plan.modules) {
      const rails = geo(module.rails);
      for (const { surface, geometry } of module.bands ?? [{ surface: module.surface, geometry: module.floor }]) {
        const slab = geo(geometry);
        mesh(this.route, slab, m.surface[surface], zero).receiveShadow = true;
        this.disposable.push(slab);
      }
      const wall = mesh(this.route, rails, m.acrylic, zero);
      wall.renderOrder = 2;
      this.disposable.push(rails);
      for (let i = module.from; i < module.to; i++) {
        const a = plan.nodes[i], b = plan.nodes[i + 1];
        for (const s of [-1, 1]) {
          const left = module.track ? branchPoint(a, module, s, s) : deckPoint(a, module, a.half * s);
          const right = module.track ? branchPoint(b, module, s, s) : deckPoint(b, module, b.half * s);
          if (module.dropDegrees) {
            const top = chuteRailTop(a, s);
            bar(details, chutePoint(a, a.half * s, -.17), chutePoint(b, b.half * s, -.17), .28, .18, timber);
            bar(details, top, chuteRailTop(b, s), .065, .075, m.gold);
            if ((i - module.from) % 7 === 0) bar(details, left, top, .09, .09, m.trim);
            continue;
          }
          if (plan.obstacles) {
            bar(details, nudged(left, -.25), nudged(right, -.25), .51, .25, timber);
            bar(details, nudged(left, -.46), nudged(right, -.46), .11, .27, m.trim);
          } else bar(details, nudged(left, -.13), nudged(right, -.13), .31, .24, m.trim);
          bar(details, nudged(left, 0.94), nudged(right, 0.94), 0.085, 0.11, m.second);
          if (i % 3 === 0) details.add(box, m.pop, nudged(left, 0.42), 0.13, 1.05, 0.13, a.yaw);
          if ((module.bridge || module.passes || module.kind === 'sweepers') && a.half < 3.03) {
            bar(details, nudged(left, .89), nudged(right, .89), .15, .14, m.gold);
          }
          if (module.track && a.t > .23 && a.t < .77) bar(details, branchPoint(a, module, s, -s, .42),
            branchPoint(b, module, s, -s, .42), .09, .11, m.second);
        }
        if (module.dropDegrees) {
          if (i % 12 === 0 && (a.t < .17 || a.t > .75)) this.buildBent(details, module, a, timber, m);
        } else if (plan.obstacles && !module.track && i % 7 === 0) this.buildBent(details, module, a, timber, m);
        else if (!plan.obstacles && !module.track && i % 6 === 0) {
          details.add(box, m.deck, nudged(a, -0.33), a.half * 2 + 0.42, 0.45, 0.68, a.yaw);
          for (const s of [-1, 1]) {
            const leg = point(a, (a.half - .6) * s, -.25);
            const base = this.scenery.terrain.height(leg.x, leg.z) - .10;
            if (this.pierCrossesDeck(leg, base, leg.y)) continue;
            details.add(box, m.trim, { ...leg, y: (leg.y + base) / 2 }, .38, leg.y - base, .38, a.yaw);
            details.add(box, m.dark, { ...leg, y: base + .12 }, .66, .30, .66, a.yaw);
          }
        }
        if (module.kind === 'tunnel' && i % 4 === 0) {
          // Open, translucent ribs leave the rolling surface visible from above.
          for (let j = 0; j <= 12; j++) {
            const angle = Math.PI * j / 12;
            details.add(box, m.second, tunnelPoint(a, j), 0.80, 0.085, 0.15, a.yaw, 0, angle - Math.PI / 2);
          }
        }
      }
      for (const d of module.devices) this.device(d, details, m);
      if (module.kind === 'split') {
        const entry = plan.nodes[module.from + 3];
        const left = point(entry, -1.7, 0.015), right = point(entry, 1.7, 0.015);
        for (const [i, p] of [left, right].entries()) {
          const mark = this.sign(i === 0 ? 'A' : 'B', '', '#fff4da', i === 0 ? '#ad4a37' : '#357d78', this.route, p, 0.8, 0.8);
          mark.rotation.set(-Math.PI / 2 + Math.atan(0.195 * plan.gradeFactor), entry.yaw, 0, 'YXZ');
        }
      }
      yield;
    }
    this.start(details, m, roster.length);
    this.gridCrew = new GridCrew();
    this.route.add(this.gridCrew.group);
    this.disposable.push(this.gridCrew);
    yield* this.gridCrew.build(plan, roster);
    this.finish(details, m, plan);
    this.buildRack(details, m, roster.length);
    yield;
    yield* this.buildPodium(m, p, roster.length);
    if (plan.track) {
      const art = this.signatureArt = new SignatureArt(plan.track);
      this.disposable.push(art);
      art.buildStart(this.route, plan.nodes[0]);
      yield* art.buildLandmark(this.route, plan);
      art.buildFinish(this.route, this.podium, plan.nodes[plan.finish]);
    }
    yield* this.scenery.buildStandsAndModels(this.route, this.podium);
    const table = this.scenery.terrain.startTable;
    const worktop = mesh(this.route, box, m.deck, nudged(table, -.33), { x: table.width, y: .66, z: table.depth });
    worktop.receiveShadow = true;
    const deckBase = mesh(this.route, box, m.trim, nudged(table, -.83), { x: table.width + .15, y: .38, z: table.depth + .15 });
    deckBase.receiveShadow = true;
    for (const s of [-1, 1]) for (const end of [-1, 1]) {
      const foot = { x: table.x + s * (table.width / 2 - 1.2), y: table.y - .98, z: table.z + end * (table.depth / 2 - 1.2) };
      const base = this.scenery.terrain.height(foot.x, foot.z) - .12;
      if (base < foot.y && !this.pierCrossesDeck(foot, base, foot.y)) details.add(box, m.trim, nudged(foot, (base - foot.y) / 2), 1.12, foot.y - base, 1.12);
    }
    yield* details.flush();
    for (const [lane, identity] of roster.entries()) {
      const position = point(this.grid.point, lineupOffset(lane, roster.length), RADIUS / this.grid.normal.y);
      const marble = mesh(this.route, orb, this.marbleMats[identity.id - 1], position, { x: RADIUS, y: RADIUS, z: RADIUS });
      marble.castShadow = true;
      this.gridCrew.ball(lane, marble.position);
      const shadow = mesh(this.route, plane, this.blob.clone(), position);
      this.disposable.push(shadow.material);
      this.placeContactShadow(shadow, marble.position, this.grid);
      const ring = mesh(this.route, torus, m.cream, position, { x: 0.39, y: 0.39, z: 0.16 });
      ring.rotation.x = -Math.PI / 2;
      ring.position.y -= RADIUS - .02;
      this.meshes.set(identity.id, { marble, shadow, ring, label: new T.Vector3() });
    }
  }

  private buildSpiralBase(d: Details, table: Tabletop, timber: T.Material, m: Materials) {
    const { x, y, z, width, depth } = table;
    d.add(box, m.trim, { x, y: y - .76, z }, width + .25, .26, depth + .25);
    d.add(box, timber, { x, y: y - .34, z }, width, .68, depth);
    for (const s of [-1, 1]) {
      d.add(box, m.second, { x: x + s * (width * .5 - .94), y: y + .002, z }, .17, .025, depth - 1.45);
      for (const edge of [-1, 1]) {
        const foot = { x: x + s * (width * .5 - 1.39), y: y - .89, z: z + edge * (depth * .5 - 1.37) };
        const h = Math.max(.40, foot.y - this.scenery.terrain.height(foot.x, foot.z) + .18);
        if (!this.pierCrossesDeck(foot, foot.y - h, foot.y)) d.add(box, m.dark, nudged(foot, -h / 2), 1.5, h, 1.5);
      }
    }
  }

  private buildBent(d: Details, module: Module, n: Sample, timber: T.Material, m: Materials) {
    const spiral = module.kind === 'terraces';
    if (spiral && (n.t < .11 || n.t > .92)) return;
    const table = this.scenery.terrain.spiralTable;
    const top = n.y - .61;
    const depth = spiral ? .86 : .72;
    d.add(box, timber, nudged(n, -.45), n.half * 2 + .18, .56, depth, n.yaw, 0, Math.atan(n.bank));
    const outer = -module.lean;
    const posts = spiral && (n.t < .23 || n.t > .78) ? [outer] : [-1, 1];
    for (const s of posts) {
      const leg = point(n, s * (n.half - .57));
      const localTop = top + n.bank * s * (n.half - .57);
      const onTable = table && table.y < localTop - .5 &&
        Math.abs(leg.x - table.x) < table.width / 2 && Math.abs(leg.z - table.z) < table.depth / 2;
      const base = onTable ? table.y : this.scenery.terrain.height(leg.x, leg.z) - .16;
      if (this.pierCrossesDeck(leg, base, localTop)) continue;
      d.add(box, m.trim, { ...leg, y: base + .23 }, 1.41, .46, 1.28, n.yaw);
      const layers = Math.ceil((localTop - base - .46) / 2.35);
      const height = (localTop - base - .46) / layers;
      for (let i = 0; i < layers; i++) {
        const width = i % 2 ? .96 : 1.10;
        d.add(box, timber, { ...leg, y: base + .46 + (i + .5) * height }, width, height - .035, .99, n.yaw);
      }
      d.add(box, m.trim, { ...leg, y: localTop - .18 }, 1.10, .31, 1.02, n.yaw);
    }
  }

  private pierCrossesDeck(leg: V3, base: number, top: number) {
    return this.plan.nodes.some(lower => lower.y > base && lower.y < top - 1.6
      && Math.abs(along(lower, leg)) < 1.10 && Math.abs(side(lower, leg)) < lower.half + .63);
  }

  private start(d: Details, m: Materials, entrants: number) {
    const a = this.plan.nodes[0], b = this.plan.nodes[2];
    d.add(box, m.deck, { x: 0, y: a.y - .075, z: -.99 }, 7.50, .28, 2.04);
    d.add(box, m.trim, { x: 0, y: a.y + .060, z: -.15 }, 6.68, .12, .44);
    const gateGlass = m.acrylic.clone();
    gateGlass.opacity = 0.15;
    this.disposable.push(gateGlass);
    this.startGate = mesh(this.route, box, gateGlass, { ...b, y: b.y + 0.45 }, { x: a.half * 2, y: 0.96, z: 0.18 });
    for (const s of [-1, 1]) {
      mesh(this.startGate, box, m.second, { x: s * 0.463, y: 0.46, z: 0 }, { x: 0.078, y: 0.092, z: 1.31 });
    }
    for (const s of [-1, 1]) {
      d.add(box, m.dark, { x: s * 4.15, y: a.y + 0.95, z: -0.66 }, 0.32, 3.55, 0.43);
      d.add(box, m.pop, { x: s * 4.15, y: a.y - 0.22, z: -0.66 }, 0.7, 0.55, 0.64);
      d.add(box, m.cream, { x: s * 4.34, y: a.y + 2.67, z: -0.66 }, 0.21, 0.23, 0.37);
      d.add(box, m.deck, { x: s * 3.4, y: a.y - 0.42, z: 0.12 }, 1.4, 0.55, 5.0);
    }
    d.add(box, m.dark, { x: 0, y: a.y + 2.60, z: -0.66 }, 8.63, 0.91, 0.36);
    d.add(box, m.pop, { x: 0, y: a.y + 3.08, z: -0.65 }, 8.76, 0.10, 0.43);
    this.sign(this.plan.track ? SIGNATURES[this.plan.track].name.toUpperCase() : 'ZEERUSH RACEWAY', '', '#fff1d5', '#283b4a',
      this.route, { x: 0, y: a.y + 2.62, z: -0.467 }, this.plan.track ? 6.7 : 5.0, 0.76);
    for (let j = 0; j < 5; j++) {
      this.deckLights.push(mesh(this.route, orb, m.blinker, { x: 2.86 + (j % 3) * 0.26, y: a.y + 2.57 + Math.floor(j / 3) * 0.18, z: -0.43 },
        { x: 0.068, y: 0.068, z: 0.07 }));
    }
    for (let lane = 0; lane < entrants; lane++) {
      const x = lineupOffset(lane, entrants);
      const n = this.plan.nodes[1];
      d.add(disc, m.dark, { x, y: n.y, z: n.z }, 0.37, 0.006, 0.37, 0, Math.atan2(this.grid.normal.z, this.grid.normal.y));
      d.add(box, m.second, { x, y: n.y - 0.005, z: n.z + 0.39 }, 0.06, 0.035, 1.04, 0, 0.19 * this.plan.gradeFactor);
    }
  }

  private finish(d: Details, m: Materials, plan: Plan) {
    const n = plan.nodes[plan.finish], last = plan.nodes[plan.finalSection];
    for (const [index, node] of [last, n].entries()) {
      for (const s of [-1, 1]) {
        const base = point(node, (node.half + 0.22) * s, 1.32);
        d.add(box, index ? m.dark : m.pop, base, 0.36, 2.85, 0.42, node.yaw);
        d.add(box, m.second, nudged(base, -1.33), 0.62, 0.42, 0.54, node.yaw);
      }
      d.add(box, m.dark, point(node, 0, 2.83), node.half * 2 + 0.8, 0.66, 0.34, node.yaw);
      const sign = this.sign(index ? 'FINISH' : 'FINAL SECTOR', 'Z E E R U S H', '#fff2d9', '#263645', this.route,
        { x: node.x + Math.sin(node.yaw) * 0.18, y: node.y + 2.85, z: node.z + Math.cos(node.yaw) * 0.18 }, 3.2, 0.6);
      sign.rotation.y = node.yaw;
      const back = this.sign(index ? 'FINISH' : 'FINAL SECTOR', 'Z E E R U S H', '#fff2d9', '#263645', this.route,
        { x: node.x - Math.sin(node.yaw) * 0.18, y: node.y + 2.85, z: node.z - Math.cos(node.yaw) * 0.18 }, 3.2, 0.6);
      back.rotation.y = node.yaw + Math.PI;
    }
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      const tile = point(n, (i + 0.5) * n.half / 8 - n.half, 0.015 + 0.08 * j * plan.gradeFactor);
      tile.x += Math.sin(n.yaw) * (0.21 - j * 0.42);
      tile.z += Math.cos(n.yaw) * (0.21 - j * 0.42);
      d.add(box, (i + j) % 2 ? m.dark : m.check, tile, n.half / 8, 0.025, 0.42, n.yaw, 0.215 * plan.gradeFactor);
    }
  }

  private buildRack(d: Details, m: Materials, entrants: number) {
    const rack = this.rack = finishRack(this.plan, entrants);
    const yaw = rack.line.yaw;
    const pitch = Math.atan(rack.slope);
    const width = entrants * .88 + .17;
    d.add(box, m.trim, finishPoint(rack, 0, rack.depth - .13, .012), width, .055, 1.22, yaw, pitch);
    d.add(box, m.dark, finishPoint(rack, 0, rack.depth + .42, .22), width, .39, .18, yaw);
    for (let i = 0; i < entrants; i++) {
      const across = bayOffset(rack, i);
      d.add(disc, i === 0 ? m.gold : m.deck, finishPoint(rack, across, rack.depth, .030), .36, .030, .35, yaw, pitch);
      const sign = this.sign(String(i + 1), '', '#fff1d5', '#263645', this.route,
        finishPoint(rack, across, rack.depth - .60, .053), .62, .38);
      sign.rotation.set(pitch - Math.PI / 2, yaw, 0, 'YXZ');
    }
  }

  private device(d: Device, details: Details, m: Materials) {
    if (d.kind === 'roller' || d.kind === 'fin' || d.kind === 'swing') {
      const pose = devicePose(d, 0);
      if (d.kind === 'swing') {
        const arm = new T.Group();
        arm.position.copy(pose.p);
        arm.quaternion.copy(pose.q);
        mesh(arm, swing, m.pop, zero);
        mesh(arm, box, m.cream, { x: 0, y: .214, z: .28 }, { x: .15, y: .012, z: .48 });
        this.route.add(arm);
        this.movers.push({ device: d, mesh: arm });
        details.add(post, m.gold, d.p, .13, .46, .13);
      } else if (d.kind === 'roller') {
        details.add(roller, m.gold, d.p, 1, 1, 1, d.yaw + Math.PI / 2, Math.PI / 2);
      } else details.add(fin, m.second, d.p, 1, 1, 1, d.yaw, d.grade);
      return;
    }
    if (d.kind === 'cushion' || d.kind === 'sweeper') {
      const radius = d.size.x / 2;
      const body = m.surface.rubber;
      const cap = d.kind === 'sweeper' ? m.gold : m.second;
      if (d.sweep) {
        const assembly = new T.Group();
        assembly.position.copy(devicePose(d, 0).p);
        mesh(assembly, orb, body, zero, { x: radius, y: radius, z: radius });
        mesh(assembly, disc, cap, { x: 0, y: radius * .83, z: 0 }, { x: radius * .58, y: .037, z: radius * .58 });
        details.add(box, m.gold, nudged(d.p, radius * .56 + .022), d.sweep.amplitude * 2.25, .023, .17,
          d.yaw, 0, Math.atan(d.sweep.bank));
        this.route.add(assembly);
        this.movers.push({ device: d, mesh: assembly });
      } else {
        details.add(orb, body, d.p, radius, radius, radius);
        details.add(disc, cap, nudged(d.p, radius * .83), radius * .58, .036, radius * .58);
      }
      return;
    }
    const round = d.kind === 'peg' || d.kind === 'chime' || d.kind === 'bumper' || d.kind === 'platter';
    const mat = d.kind === 'divider' ? m.second : d.kind === 'chime' ? m.gold : d.kind === 'peg' ? m.cream : m.pop;
    if (d.kind === 'belt') {
      const mesh = new T.InstancedMesh(box, m.second, 22);
      mesh.frustumCulled = false;
      this.route.add(mesh);
      this.belts.push({ device: d, mesh });
      return;
    }
    const scale = { ...d.size, x: round ? d.size.x / 2 : d.size.x, z: round ? d.size.x / 2 : d.size.z };
    if (d.kind === 'paddle' || d.kind === 'gate' || d.kind === 'tilt' || d.kind === 'scoop' || d.kind === 'platter') {
      const assembly = new T.Group();
      const pose = devicePose(d, 0);
      assembly.position.copy(V(pose.p));
      assembly.quaternion.copy(pose.q);
      this.route.add(assembly);
      mesh(assembly, round ? disc : box, this.plan.track ? m.surface[d.surface] : d.kind === 'tilt' ? m.surface.wood : mat, zero, scale);
      mesh(assembly, box, m.cream, { x: 0, y: scale.y * 0.54, z: 0 }, { x: scale.x * 0.65, y: 0.027, z: scale.z * (round ? .13 : .73) });
      this.movers.push({ device: d, mesh: assembly });
      details.add(post, m.dark, nudged(d.p, -0.17), 0.12, 0.31, 0.12);
    } else {
      details.add(round ? post : box, mat, d.p, scale.x, scale.y, scale.z, d.yaw);
      if (round) details.add(post, m.pop, nudged(d.p, scale.y * 0.49), scale.x * 1.06, 0.035, scale.z * 1.06, d.yaw);
    }
  }

  private sign(title: string, sub: string, color: string, background: string, parent: T.Object3D, p: V3, w: number, h: number) {
    const map = titleTexture(title, sub, color, background);
    const mat = new T.MeshBasicMaterial({ map, toneMapped: false });
    this.disposable.push(mat, map);
    return mesh(parent, plane, mat, p, { x: w, y: h, z: 1 });
  }

  private *buildPodium(m: Materials, p: Palette, entrants: number) {
    const finish = this.plan.nodes[this.plan.finish];
    this.podiumAt.set(finish.x + 14, finish.y + 1.0, finish.z + 2.0);
    this.podium.position.copy(this.podiumAt);
    this.podium.visible = false;
    const d = new Details(this.podium);
    d.add(disc, m.trim, { x: 0, y: -.92, z: 0 }, 4.12, .60, 2.82);
    d.add(disc, m.dark, { x: 0, y: -0.33, z: 0 }, 4.45, 0.65, 3.12);
    d.add(disc, m.pop, { x: 0, y: -0.03, z: 0 }, 4.5, 0.13, 3.17);
    d.add(disc, m.deck, { x: 0, y: 0.04, z: 0 }, 4.35, 0.15, 3.04);
    for (const [i, x, h] of [[1, 0, 1.62], [2, -1.85, 1.17], [3, 1.85, 0.84]]) {
      d.add(box, i === 1 ? m.softGold : i === 2 ? m.second : m.pop, { x, y: h / 2, z: 0 }, 1.75, h, 1.28);
      d.add(box, m.cream, { x, y: h + 0.025, z: 0 }, 1.84, 0.08, 1.42);
      this.sign(String(i), '', '#ffebcc', '#293c49', this.podium, { x, y: h * 0.58, z: 0.653 }, 0.62, 0.44);
      const r = mesh(this.podium, orb, this.marbleMats[0], { x, y: h + 0.55, z: 0 }, { x: 0.55, y: 0.55, z: 0.55 });
      r.castShadow = true;
      this.podiumRacers[i - 1] = r;
    }
    d.add(box, m.trim, { x: 0, y: .22, z: 1.99 }, (entrants - 3) * 1.02 + .22, .28, .99);
    for (let i = 3; i < entrants; i++) {
      const x = (i - (entrants + 2) / 2) * 1.02;
      d.add(disc, m.dark, { x, y: .36, z: 1.98 }, .43, .14, .43);
      this.sign(String(i + 1), '', '#ffebcc', '#293c49', this.podium, { x, y: .23, z: 2.49 }, .46, .23);
      const r = mesh(this.podium, orb, this.marbleMats[0], { x, y: .83, z: 1.98 }, { x: .40, y: .40, z: .40 });
      r.castShadow = true;
      this.podiumRacers[i] = r;
    }
    if (!this.plan.track) {
      d.add(post, m.gold, { x: 0, y: 2.17, z: -1.55 }, 0.1, 0.61, 0.1);
      d.add(disc, m.dark, { x: 0, y: 1.92, z: -1.55 }, 0.57, 0.27, 0.49);
      const cup = new T.LatheGeometry([new T.Vector2(0.06, 0), new T.Vector2(0.24, 0.1), new T.Vector2(0.42, 0.28),
        new T.Vector2(0.52, 0.63), new T.Vector2(0.46, 0.61), new T.Vector2(0.37, 0.3), new T.Vector2(0.06, 0.14)], 24);
      this.disposable.push(cup);
      mesh(this.podium, cup, m.gold, { x: 0, y: 2.35, z: -1.55 });
      for (const s of [-1, 1]) d.add(torus, m.gold, { x: s * 0.48, y: 2.76, z: -1.55 }, 0.29, 0.31, 0.31);
    }
    for (const s of [-1, 1]) {
      d.add(box, m.trim, { x: s * 3.4, y: 1.21, z: -1.2 }, 0.22, 2.42, 0.22);
      d.add(orb, m.blinker, { x: s * 3.4, y: 2.65, z: -1.2 }, 0.26, 0.26, 0.26);
    }
    this.sign('ZEERUSH', 'P O D I U M', '#ffe8ba', p.trim, this.podium, { x: 0, y: 0.15, z: 3.07 }, 2.30, 0.41);
    for (const [i, radius] of [3.30, 3.67].entries()) {
      d.add(torus, i ? m.trim : m.softGold, { x: 0, y: 0.85, z: -2.55 }, radius, radius, 0.58);
    }
    const spot = new T.SpotLight(p.light, 32, 11, 0.54, 0.65, 2);
    spot.position.set(-1.15, 6, 3.0);
    spot.target.position.set(0, 1.6, 0);
    this.podium.add(spot, spot.target);
    yield* d.flush();
  }

  setShadows(enabled: boolean) {
    this.sun.castShadow = enabled;
  }

  resize(aspect: number) {
    this.camera.value.aspect = aspect;
    this.camera.value.updateProjectionMatrix();
  }

  warmShot(podium: boolean) {
    this.route.visible = !podium;
    this.podium.visible = this.particles.visible = podium;
    this.camera.cut();
    this.camera.update(this.plan, [], podium ? 'CELEBRATION' : 'PICK_MARBLE', 0, 0, this.podiumAt);
    if (!podium) this.scenery.frameCamera(this.camera.value, this.visualTime);
    this.placeLighting(podium ? this.podiumAt : this.plan.nodes[0]);
  }

  update(race: RacePhysics, ranked: readonly Racer[], phase: Phase, phaseTime: number, dt: number, alpha: number, places: readonly Place[], countdownLeft: number) {
    this.visualTime += dt;
    const postRace = phase === 'CELEBRATION' || phase === 'RESULTS';
    const queued = phase === 'PICK_MARBLE' || phase === 'COUNTDOWN' || phase === 'PREPARE' || phase === 'NEXT_ROUND';
    for (const [rank, r] of race.finishers.entries()) {
      if (!this.rollouts.has(r.id)) this.rollouts.set(r.id, { rank, start: this.visualTime });
    }
    const finishHold = phase === 'CELEBRATION' && phaseTime < ROLLOUT_SECONDS + .12
      && (phaseTime < .65 || this.rollouts.size !== this.parked.size);
    const hasPodium = postRace && !finishHold && race.finishers.length > 0;
    if (hasPodium !== this.showingPodium) this.camera.cut();
    this.showingPodium = hasPodium;
    this.podium.visible = hasPodium;
    this.route.visible = !hasPodium;
    const cameraPhase = hasPodium ? phase : postRace ? race.finishers.length ? 'FINISHING' : 'PICK_MARBLE' : phase;
    this.camera.update(this.plan, ranked, cameraPhase, dt, phaseTime, this.podiumAt);
    const interpolated = Math.max(0, race.elapsed - STEP * (1 - alpha));
    if (this.gridCrew) {
      this.gridCrew.group.visible = !hasPodium && (!race.released || (ranked[0]?.progress.distance ?? 0) < 26);
      if (this.gridCrew.group.visible) this.gridCrew.pose(race.released ? interpolated : -countdownLeft);
    }
    if (!hasPodium) this.scenery.frameCamera(this.camera.value, this.visualTime);
    if (this.startGate) this.startGate.position.y = this.plan.nodes[2].y + 0.45 - (race.released ? Math.min(1.3, race.elapsed * 3) : 0);
    this.deckLights.forEach((lamp, i) => { lamp.visible = phase === 'COUNTDOWN' ? i < Math.ceil(countdownLeft) : !race.released; });
    for (const r of race.racers) {
      const group = this.meshes.get(r.id)!;
      const { marble, shadow, ring, label } = group;
      marble.visible = shadow.visible = !r.dnf && !hasPodium;
      ring.visible = queued && marble.visible;
      if (!marble.visible) continue;
      const rollout = this.rollouts.get(r.id);
      if (rollout) {
        if (!this.parked.has(r.id)) {
          const seconds = this.visualTime - rollout.start;
          rolloutPosition(this.rack, r.p, rollout.rank, seconds, this.rollTarget);
          if (seconds === 0) marble.quaternion.copy(r.q);
          else {
            this.rollAxis.set(this.rollTarget.z - marble.position.z, 0, marble.position.x - this.rollTarget.x);
            const distance = this.rollAxis.length();
            if (distance > 1e-6) marble.quaternion.premultiply(this.rollRotation.setFromAxisAngle(this.rollAxis.multiplyScalar(1 / distance), distance / RADIUS));
          }
          marble.position.copy(this.rollTarget);
          if (seconds >= ROLLOUT_SECONDS) this.parked.add(r.id);
        }
      } else {
        if (!race.released && this.gridCrew) this.gridCrew.ball(r.lane, marble.position);
        else marble.position.copy(r.previous).lerp(r.p, alpha);
        marble.quaternion.copy(r.previousQ).slerp(this.scratch.quaternion.copy(r.q), alpha);
      }
      label.copy(marble.position);
      label.y += 0.58;
      const support = queued ? this.grid : rollout ? undefined : r.ground;
      const receiver = support ?? race.floorBelow(marble.position, 3);
      this.placeContactShadow(shadow, marble.position, receiver);
    }
    for (const mover of this.movers) {
      const pose = devicePose(mover.device, race.released ? interpolated : 0);
      mover.mesh.quaternion.copy(pose.q);
      mover.mesh.position.copy(pose.p);
    }
    this.signatureArt?.frame(race.racers, race.finishers, this.visualTime, race.elapsed, this.plan, postRace ? phaseTime : 0);
    this.scenery.cheer(race.racers, this.visualTime, hasPodium, queued);
    for (const { device, mesh } of this.belts) {
      const lead = ranked[0]?.progress.distance ?? 0;
      mesh.visible = Math.abs(device.s - lead) < 65;
      if (!mesh.visible) continue;
      const run = device.size.z;
      for (let i = 0; i < mesh.count; i++) {
        const s = device.s - run / 2 + (i * run / mesh.count + this.visualTime * 1.3) % run;
        const a = nodeAt(this.plan, s), b = nodeAt(this.plan, s + 1.3);
        const fraction = (s - a.s) / (b.s - a.s);
        this.scratch.position.copy(a).lerp(b, fraction);
        this.scratch.position.y += 0.013;
        this.scratch.rotation.set(device.grade, a.yaw, 0, 'YXZ');
        this.scratch.scale.set(a.half * 1.78, 0.016, 0.12);
        this.scratch.updateMatrix();
        mesh.setMatrixAt(i, this.scratch.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < this.podiumRacers.length; i++) {
      const racer = this.podiumRacers[i];
      const place = places[i];
      racer.visible = Boolean(hasPodium && place && place.time !== null);
      if (racer.visible) {
        racer.material = this.marbleMats[place.id - 1];
        racer.rotation.set(0.15 * Math.sin(this.visualTime), this.visualTime * 0.64 + i * 0.6, 0.10);
      }
    }
    this.particles.visible = hasPodium && phase === 'CELEBRATION';
    if (this.particles.visible) {
      for (let i = 0; i < this.particles.count; i++) {
        const t = (phaseTime + i * 0.09) % 4.7;
        this.scratch.position.set(this.podiumAt.x + Math.cos(i * 5.3 + t) * (2.6 + 0.025 * i),
          this.podiumAt.y + 7 - t * 1.62, this.podiumAt.z + Math.sin(i * 2.3 + t * 0.6) * 3.25);
        this.scratch.rotation.set(t * 3 + i, t * 2, i);
        this.scratch.scale.set(0.12, 0.055, 0.025);
        this.scratch.updateMatrix();
        this.particles.setMatrixAt(i, this.scratch.matrix);
      }
      this.particles.instanceMatrix.needsUpdate = true;
    }
    const focus = hasPodium ? this.podiumAt : queued ? this.plan.nodes[0] : ranked[0]?.p ?? this.plan.nodes[0];
    this.placeLighting(focus);
  }

  private placeContactShadow(shadow: ContactShadow, center: V3, receiver?: { normal: V3; point: V3 }) {
    shadow.visible = Boolean(receiver);
    if (!receiver) return;
    const normal = this.scratch.position.copy(receiver.normal);
    const height = this.rollAxis.copy(center).sub(receiver.point).dot(normal);
    const fade = T.MathUtils.smoothstep(height - RADIUS, 0, shadowFalloff);
    shadow.visible = fade < 1;
    shadow.material.opacity = this.blob.opacity * (1 - fade);
    shadow.scale.set(1.45 * (1 + .45 * fade), 1.03 * (1 + .45 * fade), 1);
    shadow.position.copy(center).addScaledVector(normal, .019 - height);
    shadow.quaternion.setFromUnitVectors(planeNormal, normal);
  }

  private placeLighting(focus: V3) {
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.lightOffset);
  }

  screen(p: V3) {
    const v = this.projected.copy(p).project(this.camera.value);
    return { x: (v.x + 1) * 0.5, y: (1 - v.y) * 0.5, visible: v.z >= -1 && v.z <= 1 && Math.abs(v.x) < 0.91 && Math.abs(v.y) < 0.81 };
  }

  racerScreen(id: number) {
    const group = this.meshes.get(id);
    return group?.marble.visible ? this.screen(group.label) : undefined;
  }

  finishDisplay() {
    return { onTrack: this.route.visible ? [...this.rollouts.keys()] : [], parked: [...this.parked],
      podium: this.podium.visible ? this.podiumRacers.filter(racer => racer.visible).length : 0 };
  }

  get inPodiumShot() { return this.showingPodium; }

  dispose() {
    this.route.traverse(obj => { if (obj instanceof T.InstancedMesh) obj.dispose(); });
    this.podium.traverse(obj => { if (obj instanceof T.InstancedMesh) obj.dispose(); });
    for (const resource of this.disposable) resource.dispose();
    this.particles.dispose();
    this.particles.material.dispose();
    this.sun.shadow.dispose();
  }
}

type PendingCourse = {
  course: CourseScene;
  build: Generator<void, void, unknown>;
  phase: 'build' | 'compileCourse' | 'drawCourse' | 'compilePodium' | 'drawPodium' | 'ready';
  compilingSince: number;
};

export class ShowScene {
  readonly renderer: T.WebGLRenderer;
  private readonly env: T.WebGLRenderTarget;
  private readonly grain = woodgrain();
  private readonly marbleMats = IDENTITIES.map(r => new T.MeshPhysicalMaterial({
    map: marbleTexture(r), color: '#ffffff', metalness: 0.19, roughness: 0.19, clearcoat: 1,
    clearcoatRoughness: 0.16, envMapIntensity: 0.88,
  }));
  private readonly blob = new T.MeshBasicMaterial({ color: '#302a31', map: texture(64, 64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
    g.addColorStop(0, '#aaa9a9a9');
    g.addColorStop(1, '#77777700');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }), transparent: true, depthWrite: false, opacity: 0.65 });
  private readonly savedScissor = new T.Vector4();
  private active?: CourseScene;
  private pending?: PendingCourse;
  private frameWidth = 1;
  private frameHeight = 1;
  private scale = 1;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#435c64');
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    host.append(this.renderer.domElement);
    const room = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(room, 0.035);
    room.dispose();
    pmrem.dispose();
  }

  stage(plan: Plan, roster: readonly Identity[]) {
    this.discardPending();
    const course = new CourseScene(plan, this.env.texture, this.grain, this.marbleMats, this.blob);
    course.resize(this.frameWidth / this.frameHeight);
    course.setShadows(this.renderer.shadowMap.enabled);
    this.pending = { course, build: course.build(roster), phase: 'build', compilingSince: 0 };
  }

  discardPending() {
    this.pending?.build.return();
    this.pending?.course.dispose();
    this.pending = undefined;
  }

  prepareFrame(allowWarmup: boolean) {
    const pending = this.pending;
    if (!pending || pending.phase === 'ready') return;
    if (pending.phase === 'build') {
      const deadline = performance.now() + 2;
      do {
        if (pending.build.next().done) {
          pending.phase = 'compileCourse';
          return;
        }
      } while (performance.now() < deadline);
      return;
    }
    if (!allowWarmup) return;
    const { course } = pending;
    if (pending.phase === 'compileCourse' || pending.phase === 'compilePodium') {
      const podium = pending.phase === 'compilePodium';
      course.warmShot(podium);
      this.renderer.compile(course.scene, course.camera.value);
      pending.compilingSince = performance.now();
      pending.phase = podium ? 'drawPodium' : 'drawCourse';
      return;
    }
    if (!this.shadersReady() && performance.now() - pending.compilingSince < 2000) return;
    // Use the live framebuffer's shader variants, including shadow passes, without writing to it.
    this.renderer.getScissor(this.savedScissor);
    const wasScissored = this.renderer.getScissorTest();
    this.renderer.setScissor(0, 0, 0, 0);
    this.renderer.setScissorTest(true);
    try {
      this.renderer.render(course.scene, course.camera.value);
    } finally {
      this.renderer.setScissor(this.savedScissor);
      this.renderer.setScissorTest(wasScissored);
    }
    pending.phase = pending.phase === 'drawCourse' ? 'compilePodium' : 'ready';
  }

  private shadersReady() {
    const gl = this.renderer.getContext();
    const extension: { COMPLETION_STATUS_KHR: number } | null = gl.getExtension('KHR_parallel_shader_compile');
    return !extension || (this.renderer.info.programs ?? []).every(({ program }) =>
      gl.getProgramParameter(program, extension.COMPLETION_STATUS_KHR));
  }

  ready(plan: Plan, contextLost: boolean) {
    const pending = this.pending;
    return pending?.course.plan === plan && (pending.phase === 'ready' || contextLost && pending.phase !== 'build');
  }

  activate(plan: Plan) {
    const pending = this.pending;
    if (pending?.course.plan !== plan) throw new Error('Queued course does not match the selected plan');
    this.active?.dispose();
    this.active = pending.course;
    this.active.camera.reset();
    this.pending = undefined;
  }

  restore() {
    if (this.pending && this.pending.phase !== 'build') this.pending.phase = 'compileCourse';
  }

  setQuality(quality: Settings['quality']) {
    const shadows = quality === 'high';
    if (this.renderer.shadowMap.enabled === shadows) return;
    this.renderer.shadowMap.enabled = shadows;
    this.active?.setShadows(shadows);
    this.pending?.course.setShadows(shadows);
    this.restore();
  }

  setScale(scale: number) {
    this.scale = scale;
    this.resizeBuffer();
  }

  resize(w: number, h: number) {
    this.frameWidth = Math.max(1, w);
    this.frameHeight = Math.max(1, h);
    this.resizeBuffer();
    const aspect = this.frameWidth / this.frameHeight;
    this.active?.resize(aspect);
    this.pending?.course.resize(aspect);
  }

  private resizeBuffer() {
    const ratio = this.scale * Math.min(window.devicePixelRatio || 1, 1.25);
    const size = this.renderer.getSize(this.bufferSize);
    if (size.x !== this.frameWidth || size.y !== this.frameHeight || ratio !== this.renderer.getPixelRatio()) {
      this.renderer.setDrawingBufferSize(this.frameWidth, this.frameHeight, ratio);
    }
  }

  private readonly bufferSize = new T.Vector2();

  draw(race: RacePhysics, ranked: readonly Racer[], phase: Phase, phaseTime: number, dt: number, alpha: number, places: readonly Place[], countdownLeft: number) {
    const course = this.active;
    if (!course) return;
    course.update(race, ranked, phase, phaseTime, dt, alpha, places, countdownLeft);
    const shot = course.inPodiumShot ? 'podium' : 'course';
    if (this.host.dataset.shot !== shot) this.host.dataset.shot = shot;
    this.renderer.render(course.scene, course.camera.value);
  }

  screen(p: V3) { return this.active?.screen(p) ?? { x: 0, y: 0, visible: false }; }
  racerScreen(id: number) { return this.active?.racerScreen(id); }
  finishDisplay() { return this.active?.finishDisplay(); }

  resources() {
    const { memory, render } = this.renderer.info;
    return { geometries: memory.geometries, textures: memory.textures, calls: render.calls, triangles: render.triangles,
      renderWidth: this.renderer.domElement.width, renderHeight: this.renderer.domElement.height, scale: this.scale, queuedScene: this.pending?.phase };
  }

  dispose() {
    this.discardPending();
    this.active?.dispose();
    this.env.dispose();
    this.grain.dispose();
    this.blob.map?.dispose();
    this.blob.dispose();
    for (const m of this.marbleMats) { m.map?.dispose(); m.dispose(); }
    for (const g of [box, post, orb, disc, torus, plane]) g.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
