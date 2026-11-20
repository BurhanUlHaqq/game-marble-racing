import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIGNATURES } from './signatures';
import type { TrackId } from './signatures';
import { Random } from './random';
import { ELBOW, PAW, PAD_HEIGHT, SHOULDER } from './grid-launch';
import type { ScenicSite, ScenicTerrain } from './scenic-terrain';
import type { Plan } from './track';

const landscapes: Record<TrackId, readonly [floor: string, earth: string, top: string]> = {
  'paper-moon': ['#374661', '#607183', '#90a2a2'], 'cedar-creek': ['#5b7966', '#896f55', '#97ac78'],
  bellflower: ['#668675', '#a67658', '#a5bb8f'], clockmaker: ['#665454', '#865b43', '#be9565'],
  aurora: ['#44677b', '#739cad', '#c4dfdf'], 'cloud-quilt': ['#847394', '#ab8090', '#e0b9a9'],
  'truck-art': ['#64817a', '#8d7663', '#b6b08b'], 'fossil-canyon': ['#a07b64', '#a45e4d', '#d9a376'],
  'prism-aquarium': ['#366b76', '#567e82', '#93b9a6'], 'midnight-record': ['#4b465f', '#675260', '#ac8a81'],
};

export function scenicPalette(plan: Plan) {
  const classic = { workshop: 'cedar-creek', rainbow: 'cloud-quilt', crystal: 'aurora', night: 'paper-moon' } as const;
  const id = plan.track ?? classic[plan.theme];
  const [floor, earth, top] = landscapes[id];
  const [, wood, trim, accent, detail] = SIGNATURES[id].colors;
  return { id, floor, earth, top, wood, trim, accent, detail, classic: !plan.track };
}
type Paint = ReturnType<typeof scenicPalette>;
const ivory = '#f3dfb7', ink = '#36494e', brass = '#dcaa57', red = '#c85e53';

// Low-contrast screen-printed marks on the tabletop, drawn as a seamless tile.
export function playmat(p: Paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 384;
  const c = canvas.getContext('2d')!;
  c.fillStyle = p.floor;
  c.fillRect(0, 0, 384, 384);
  const quilt = p.id === 'cloud-quilt';
  const drafting = p.id === 'clockmaker' || p.id === 'midnight-record';
  const stars = p.id === 'paper-moon';
  const water = p.id === 'prism-aquarium' || p.id === 'aurora';
  c.lineCap = 'round';
  if (quilt) {
    c.fillStyle = '#fad8c315';
    c.fillRect(0, 0, 192, 192); c.fillRect(192, 192, 192, 192);
    c.strokeStyle = '#f8e1cd48'; c.lineWidth = 1.8; c.setLineDash([5, 5]);
    for (const edge of [4, 188, 196, 380]) { c.beginPath(); c.moveTo(edge, 0); c.lineTo(edge, 384); c.moveTo(0, edge); c.lineTo(384, edge); c.stroke(); }
    c.setLineDash([]);
  } else if (drafting) {
    c.strokeStyle = '#f2d8af21'; c.lineWidth = 1.6;
    for (let i = 0; i < 384; i += 48) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 384); c.moveTo(0, i); c.lineTo(384, i); c.stroke(); }
  }
  for (const dx of [-384, 0, 384]) for (const dy of [-384, 0, 384]) {
    c.save(); c.translate(dx, dy);
    if (drafting || stars || quilt) {
      for (const [x, y, r] of [[88, 74, 27], [297, 248, 19]]) {
        c.strokeStyle = '#f7dfbb31'; c.lineWidth = 2;
        if (stars) {
          c.fillStyle = '#f7dfbb4d'; c.beginPath();
          for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = k % 2 ? r * .08 : r * .36; c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
          c.closePath(); c.fill();
        } else {
          for (const size of [r, r * .72, r * .23]) { c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.stroke(); }
        }
      }
    } else {
      // Periodic, irregular contours read as ripples, growth rings or elevation lines.
      for (const [cx, cy, r] of [[32, 66, 50], [238, 273, 41]]) for (let layer = 0; layer < 3; layer++) {
        c.strokeStyle = layer === 1 ? '#f7ead52b' : '#202e3b22'; c.lineWidth = layer === 1 ? 2.5 : 1.6;
        c.beginPath();
        for (let i = 0; i <= 72; i++) {
          const a = i * Math.PI / 36, radius = (r + layer * 12) * (1 + .14 * Math.sin(3 * a + cx) + .065 * Math.cos(5 * a));
          const x = cx + Math.cos(a) * radius * 1.27, y = cy + Math.sin(a) * radius * (water ? .45 : .77);
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath(); c.stroke();
      }
    }
    c.fillStyle = '#f3e3cb32';
    for (let i = 0; i < 17; i++) { c.beginPath(); c.ellipse((i * 89 + 28) % 384, (i * i * 13 + 34) % 384, water ? 3.2 : 1.8, 1.3, -.3, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Print the creek, footpath or stitched ribbon into a single world-anchored map.
// The ink follows the hills, including the ground visible beneath an overpass.
export function landscapeMap(plan: Plan, p: Paint, tile: T.CanvasTexture, terrain: ScenicTerrain, sites: readonly ScenicSite[]) {
  const bounds = terrain.bounds;
  const canvas = document.createElement('canvas');
  const density = Math.min(4, 1536 / Math.max(bounds.width, bounds.depth));
  canvas.width = Math.ceil(bounds.width * density);
  canvas.height = Math.ceil(bounds.depth * density);
  const c = canvas.getContext('2d')!;
  c.scale(canvas.width / bounds.width, canvas.height / bounds.depth);
  c.translate(-bounds.x, -bounds.z);
  const print = c.createPattern(tile.image, 'repeat')!;
  print.setTransform(new DOMMatrix().scale(32 / tile.image.width));
  c.fillStyle = print;
  c.fillRect(bounds.x, bounds.z, bounds.width, bounds.depth);
  const rng = new Random(`${plan.seed}/landscape-ink`);
  const water = p.id === 'cedar-creek' || p.id === 'aurora' || p.id === 'prism-aquarium';
  const ribbon = p.id === 'cloud-quilt', road = p.id === 'truck-art';
  const a = plan.nodes[0], end = plan.nodes.at(-1)!;
  const bridge = plan.modules.find(m => m.bridge)?.bridge;
  const crossing = bridge ? (plan.nodes[bridge.first].s + plan.nodes[bridge.last].s) / 2 : plan.length * .7;
  const landmark = plan.modules.find(m => m.track);
  const mill = landmark ? plan.nodes[Math.floor((landmark.from + landmark.to) / 2)].s : plan.length * .45;
  const banks: {x:number;z:number;yaw:number}[] = [];
  const trail = new Path2D();
  trail.moveTo(a.x - 20, a.z - 46);
  trail.bezierCurveTo(a.x + 4, a.z - 28, a.x - 19, a.z - 13, a.x - 14, a.z - 3);
  for (let i = 0; i < plan.nodes.length; i += 3) {
    const n = plan.nodes[i];
    let verge = n.half + 9 + 2.6 * Math.sin(n.s * .051) + 1.6 * Math.sin(n.s * .119);
    if (p.id === 'cedar-creek') {
      // Follow one bank through the mill, then cross beneath the actual two-wide span.
      verge *= Math.tanh((n.s - crossing) / 12) * Math.tanh((n.s - mill) / 14);
    }
    const x = n.x - Math.cos(n.yaw) * verge, z = n.z + Math.sin(n.yaw) * verge;
    trail.lineTo(x, z);
    if (water && i % 6 === 0) banks.push({x,z,yaw:n.yaw});
    if (i % 9 === 0) {
      const bx = x + rng.float(-8, 8), bz = z + rng.float(-6, 6), radius = rng.float(6, 14);
      const tint = c.createRadialGradient(bx, bz, 0, bx, bz, radius);
      tint.addColorStop(0, p.top + '68'); tint.addColorStop(1, p.top + '00');
      c.fillStyle = tint; c.fillRect(bx - radius, bz - radius, radius * 2, radius * 2);
    }
  }
  trail.lineTo(end.x - Math.cos(end.yaw) * 11 + Math.sin(end.yaw) * 42, end.z + Math.sin(end.yaw) * 11 + Math.cos(end.yaw) * 42);
  c.lineJoin = c.lineCap = 'round';
  c.strokeStyle = water ? '#a4b79c' : ribbon ? '#e3b691' : p.top;
  c.globalAlpha = .72; c.lineWidth = water ? 4.1 : 2.6; c.stroke(trail);
  c.strokeStyle = water ? '#64a4ac' : ribbon ? '#c793a1' : road ? '#687577' : p.earth;
  c.lineWidth = water ? 3.38 : 2.14; c.stroke(trail);
  c.setLineDash(water ? [1.35, 3.7, .65, 8] : [.69, 1.21]);
  c.strokeStyle = water ? '#e1e8d0' : '#f1ddba'; c.lineWidth = water ? .16 : .12; c.stroke(trail);
  c.setLineDash([]);
  c.globalAlpha = .80;
  for (const [i, bank] of banks.entries()) {
    const side = i % 2 ? -1 : 1;
    const u = side * rng.float(1.8, 2.25);
    const x = bank.x + Math.cos(bank.yaw)*u, z = bank.z - Math.sin(bank.yaw)*u;
    c.fillStyle = i % 4 ? '#72966b' : '#a7aca1';
    c.beginPath(); c.ellipse(x,z,.70,.29,bank.yaw,0,Math.PI*2); c.fill();
    c.strokeStyle = '#c1d8c0'; c.lineWidth = .07;
    for (let j=0;j<3;j++) { c.beginPath(); c.moveTo(x+j*.21,z); c.lineTo(x+j*.21+.13,z-.45-j*.10); c.stroke(); }
  }
  const shadow = new Path2D();
  for (let i = 0; i < plan.nodes.length; i += 3) {
    const n = plan.nodes[i], h = n.y - terrain.height(n.x, n.z);
    const x = n.x + .48 * h, z = n.z - .52 * h;
    if (i === 0) shadow.moveTo(x, z); else shadow.lineTo(x, z);
  }
  c.strokeStyle = '#35414a';
  for (const [width, alpha] of [[8.7, .052], [7.7, .065], [6.7, .08]]) {
    c.lineWidth = width; c.globalAlpha = alpha; c.stroke(shadow);
  }
  c.globalAlpha = 1;
  for (const site of sites) {
    c.save();
    c.translate(site.x + .55, site.z - .46);
    c.rotate(-site.yaw); c.scale(4.2 * site.scale, 2.9 * site.scale);
    const shade = c.createRadialGradient(0, 0, .36, 0, 0, 1);
    shade.addColorStop(0, '#2c393f8a'); shade.addColorStop(.70, '#2c393f52'); shade.addColorStop(1, '#2c393f00');
    c.fillStyle = shade; c.fillRect(-1, -1, 2, 2);
    c.restore();
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

const box = new T.BoxGeometry(1, 1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 16);
const slope = new T.CylinderGeometry(.83, 1, 1, 12);
const cone = new T.ConeGeometry(1, 1, 9);
const ball = new T.SphereGeometry(1, 10, 7);
const plush = new T.SphereGeometry(1, 20, 14);
const gem = new T.SphereGeometry(1, 6, 4);
const flag = new T.BufferGeometry();
flag.setAttribute('position', new T.Float32BufferAttribute([0, .5, .03, 1, .22, .03, 0, -.5, .03, 0, .5, -.03, 1, .22, -.03, 0, -.5, -.03], 3));
flag.setIndex([0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]);
flag.computeVertexNormals();

// Bake each miniature once. Every copy then costs one draw and is culled independently.
class Model {
  private readonly parts: T.BufferGeometry[] = [];
  private readonly transform = new T.Object3D();
  private readonly tint = new T.Color();
  private readonly motions: { from: number; to: number; lane: number; offset: (y: number, out: T.Vector3) => void }[] = [];
  private vertices = 0;

  add(shape: T.BufferGeometry, color: string, x: number, y: number, z: number, w: number, h: number, d: number, roll = 0, pitch = 0, yaw = 0) {
    const part = shape.clone();
    this.transform.position.set(x, y, z);
    this.transform.rotation.set(pitch, yaw, roll, 'YXZ');
    this.transform.scale.set(w, h, d);
    this.transform.updateMatrix();
    part.applyMatrix4(this.transform.matrix);
    part.deleteAttribute('uv');
    const count = part.getAttribute('position').count;
    const rgb = new Float32Array(count * 3);
    this.tint.set(color);
    for (let i = 0; i < count; i++) this.tint.toArray(rgb, i * 3);
    part.setAttribute('color', new T.BufferAttribute(rgb, 3));
    this.vertices += count;
    this.parts.push(part);
  }

  moving(lane: number, offset: (y: number, out: T.Vector3) => void, paint: () => void) {
    const from = this.vertices;
    paint();
    this.motions.push({ from, to: this.vertices, lane, offset });
  }

  finish() {
    const geometry = mergeGeometries(this.parts)!;
    if (this.motions.length) {
      const positions = geometry.getAttribute('position');
      const count = 1 + Math.max(...this.motions.map(m => m.lane));
      const targets = Array.from({ length: count }, () => new Float32Array(positions.count * 3));
      const delta = new T.Vector3();
      for (const { from, to, lane, offset } of this.motions) for (let i = from; i < to; i++) {
        offset(positions.getY(i), delta);
        delta.toArray(targets[lane], i * 3);
      }
      geometry.morphAttributes.position = targets.map(target => new T.BufferAttribute(target, 3));
      geometry.morphTargetsRelative = true;
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    for (const part of this.parts) part.dispose();
    return geometry;
  }
}

function pennant(m: Model, x: number, y: number, z: number, h: number, color: string) {
  m.add(cylinder, brass, x, y + h / 2, z, .043, h, .043);
  m.add(flag, color, x, y + h - .16, z, h * .46, h * .27, 1);
}

export const GRID_ANIMALS = ['fox', 'frog', 'penguin', 'rabbit', 'bear', 'panda', 'koala', 'raccoon'] as const;
type GridAnimal = typeof GRID_ANIMALS[number];

export function throwerModel(animal: GridAnimal, scarf: string) {
  const feet = new Model(), body = new Model(), head = new Model(), balance = new Model();
  const upper = new Model(), lower = new Model(), palm = new Model();
  const fur = { fox: '#e77a36', frog: '#78bb55', penguin: '#354966', rabbit: '#c4a0d2',
    bear: '#c58952', panda: '#fff2df', koala: '#879eae', raccoon: '#7e828a' }[animal];
  const cream = '#fff0cb', eye = '#242b3a';
  const limb = animal === 'panda' || animal === 'raccoon' ? '#424656' : fur;
  body.add(plush, fur, 0, .66, 0, .40, .54, .33);
  body.add(plush, cream, 0, .66, .23, .29, .41, .14);
  for (const s of [-1, 1]) feet.add(plush, animal === 'penguin' ? '#e6a342' : limb, s*.22, .12, .09, .22, .13, .28);
  head.add(plush, fur, 0, 1.33, 0, .51, .44, .39);
  body.add(plush, scarf, 0, .99, .015, .41, .10, .34);
  body.add(plush, scarf, -.19, .87, .29, .085, .17, .045, -.25);
  balance.add(plush, limb, -.43, .69, .09, .13, .27, .15, -.39);
  balance.add(plush, limb, -.52, .48, .10, .13, .13, .14);
  for (const s of [-1, 1]) {
    if (animal === 'fox' || animal === 'raccoon') {
      head.add(cone, fur, s*.31, 1.74, -.025, .23, .49, .18, -s*.19);
      head.add(cone, animal === 'fox' ? '#673e48' : eye, s*.31, 1.77, .075, .135, .30, .095, -s*.19);
      head.add(plush, cream, s*.18, 1.23, .31, .23, .14, .12, s*.12);
      if (animal === 'raccoon') head.add(plush, eye, s*.21, 1.44, .30, .27, .16, .11, s*.32);
    } else if (animal === 'frog') {
      head.add(plush, fur, s*.268, 1.64, .015, .235, .22, .23);
    } else if (animal === 'penguin') {
      head.add(plush, cream, s*.16, 1.34, .28, .235, .28, .15);
    } else if (animal === 'rabbit') {
      head.add(plush, fur, s*.22, 1.86, -.035, .14, .43, .12, -s*.16);
      head.add(plush, '#eaa9b0', s*.23, 1.88, .047, .077, .31, .055, -s*.16);
      head.add(plush, cream, s*.10, 1.22, .34, .145, .11, .095);
    } else if (animal === 'koala') {
      head.add(plush, fur, s*.45, 1.53, -.02, .24, .24, .15);
      head.add(plush, '#efd4c4', s*.48, 1.54, .057, .15, .16, .10);
    } else {
      head.add(plush, limb, s*.345, 1.68, -.05, .18, .18, .12);
      if (animal === 'panda') head.add(plush, limb, s*.19, 1.42, .31, .18, .205, .105, -s*.35);
      else head.add(plush, '#efd3a0', s*.35, 1.69, .018, .105, .10, .070);
    }
    const y = animal === 'frog' ? 1.67 : 1.44, x = s*(animal === 'frog' ? .268 : .192);
    const z = animal === 'frog' ? .21 : .365;
    head.add(plush, '#fffae8', x, y, z, .123, .14, .08);
    head.add(plush, eye, x + .012, y, z + .066, .070, .089, .033);
    head.add(plush, '#ffffff', x - .009, y + .030, z + .096, .021, .024, .012);
    head.add(plush, '#e8a58a', s*.315, 1.23, .29, .083, .044, .048);
  }
  if (animal === 'bear' || animal === 'panda') head.add(plush, cream, 0, 1.22, .33, .225, .155, .12);
  if (animal === 'koala') head.add(plush, eye, 0, 1.30, .389, .115, .167, .11);
  else if (animal !== 'penguin' && animal !== 'frog') {
    head.add(plush, animal === 'rabbit' ? '#c67689' : eye, 0, 1.28, .453, .105, .070, .075);
  }
  if (animal === 'penguin') head.add(cone, '#f6b33f', 0, 1.27, .42, .15, .27, .105, 0, Math.PI/2);
  if (animal === 'frog') {
    for (let i = -3; i <= 3; i++) head.add(plush, '#395d3e', i*.055, 1.235 + .008*i*i, .374 - .006*i*i, .037,.016,.018);
  }
  const pawColor = animal === 'frog' ? '#94cc64' : animal === 'panda' || animal === 'raccoon' ? limb : cream;
  upper.add(plush, limb, .006, -.119, .034, .12, .18, .115, 0, -.27);
  lower.add(plush, limb, .006, -.104, .112, .115, .19, .115, 0, -.81);
  palm.add(plush, pawColor, 0, 0, .035, .15, PAD_HEIGHT, .19);
  palm.add(plush, pawColor, -.10, .045, .064, .062, .06, .10);
  // Rigid vertex weights let the whole articulated character share one draw call.
  const parts = [feet.finish(), body.finish(), head.finish(), balance.finish(),
    upper.finish().translate(SHOULDER.x, SHOULDER.y, SHOULDER.z),
    lower.finish().translate(SHOULDER.x + ELBOW.x, SHOULDER.y + ELBOW.y, SHOULDER.z + ELBOW.z),
    palm.finish().translate(SHOULDER.x + ELBOW.x + PAW.x, SHOULDER.y + ELBOW.y + PAW.y, SHOULDER.z + ELBOW.z + PAW.z)];
  for (const [bone, part] of parts.entries()) {
    const count = part.getAttribute('position').count, indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = bone; weights[i * 4] = 1; }
    part.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
    part.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}

export function grandstand(p: Paint) {
  const m = new Model();
  m.add(box, p.trim, 0, -.18, 0, 6.04, .38, 2.65);
  m.add(box, ivory, 0, -.16, 1.34, 5.88, .09, .05);
  for (let row = 0; row < 2; row++) {
    const z = row ? -.69 : .43, feet = row ? .68 : .22;
    m.add(box, p.wood, 0, feet / 2, z, 5.72, feet, 1.0);
    m.add(box, p.detail, 0, feet - .036, z + .48, 5.8, .085, .13);
    for (let i = 0; i < 4 - row; i++) {
      const x = (i - (3 - row) / 2) * 1.37;
      const coat = [p.accent, '#478b88', red, '#b78849'][(i + row * 2) % 4];
      const face = ['#e9c18f', '#bd8661', '#976749'][(i + row) % 3];
      m.moving((i + row) % 3, (y, out) => {
        const lift = Math.max(0, y - feet);
        out.set(.14 * lift, Math.min(.48, .48 * lift), 0);
      }, () => {
        m.add(slope, coat, x, feet + .29, z, .33, .58, .29);
        m.add(ball, face, x, feet + .80, z, .285, .30, .28);
        m.add(ball, coat, x, feet + 1.0, z - .014, .312, .149, .306);
        m.add(cylinder, coat, x, feet + .96, z + .055, .32, .055, .32);
        for (const side of [-1, 1]) m.add(gem, ink, x + side * .102, feet + .835, z + .253, .032, .044, .029);
        if ((i + row) % 2 === 0) {
          m.add(ball, coat, x + .30, feet + .43, z + .025, .105, .26, .11, -.55);
          pennant(m, x + .40, feet + .50, z + .055, .82, row ? ivory : p.detail);
        }
      });
    }
  }
  for (const x of [-2.91, 2.91]) {
    m.add(cylinder, p.trim, x, 1.18, -.98, .07, 2.38, .07);
    m.add(ball, brass, x, 2.4, -.98, .12, .12, .12);
  }
  for (let i = 0; i < 8; i++) {
    const x = -2.91 + (i + .5) * .7275, sag = .28 * (1 - (x / 2.91) ** 2);
    m.add(box, ivory, x, 2.28 - sag, -.98, .75, .043, .049, .066 * x);
    m.add(flag, [p.accent, ivory, p.detail, red][i % 4], x, 2.26 - sag, -.98, .40, .53, .8, -Math.PI / 2);
  }
  return m.finish();
}

export function foundation(p: Paint, stand: boolean) {
  const m = new Model();
  if (stand) {
    for (const x of [-2.57, 0, 2.57]) for (const z of [-.97, .97]) m.add(box, p.trim, x, -.5, z, .29, 1, .29);
    m.add(box, p.earth, 0, -.18, 1.01, 5.65, .075, .16);
    m.add(box, p.earth, 0, -.64, 1.01, 5.65, .055, .16);
  } else {
    m.add(gem, p.earth, -.37, -.71, .09, 2.71, .83, 1.84, 0, 0, .12);
    m.add(gem, p.top, .65, -.48, -.07, 2.27, .51, 1.53, 0, 0, -.23);
  }
  return m.finish();
}

function fir(m: Model, x: number, z: number, size: number, green: string, light: string) {
  m.add(cylinder, '#815d48', x, .71 * size, z, .18 * size, 1.42 * size, .18 * size);
  m.add(cone, green, x, 1.67 * size, z, 1.04 * size, 1.84 * size, 1.04 * size);
  m.add(cone, light, x, 2.38 * size, z, .80 * size, 1.65 * size, .80 * size);
  m.add(cone, green, x, 2.99 * size, z, .56 * size, 1.31 * size, .56 * size);
}

function flowers(m: Model, x: number, z: number, size: number, color: string) {
  m.add(slope, '#ae6754', x, .43 * size, z, .59 * size, .84 * size, .59 * size, Math.PI);
  m.add(cylinder, ivory, x, .78 * size, z, .63 * size, .13 * size, .63 * size);
  m.add(cylinder, '#477a68', x, 1.44 * size, z, .083 * size, 1.27 * size, .083 * size);
  for (const side of [-1, 1]) m.add(ball, '#5f9276', x + side * .21 * size, 1.42 * size, z, .13 * size, .35 * size, .09 * size, -side * .7);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    m.add(ball, color, x + Math.sin(a) * .38 * size, (2.12 + Math.cos(a) * .38) * size, z, .235 * size, .415 * size, .14 * size, -a);
  }
  m.add(ball, brass, x, 2.12 * size, z + .14 * size, .26 * size, .26 * size, .16 * size);
}

function roof(m: Model, x: number, y: number, z: number, w: number, d: number, color: string) {
  for (const sign of [-1, 1]) m.add(box, color, x + sign * w * .235, y, z, w * .57, .18, d, -sign * .47);
}

function fish(m: Model, x: number, y: number, z: number, size: number, color: string) {
  m.add(ball, color, x, y, z, .70 * size, .315 * size, .24 * size);
  m.add(flag, color, x - 1.02 * size, y, z, .52 * size, .65 * size, 1);
  m.add(ball, ink, x + .40 * size, y + .05 * size, z + .19 * size, .056 * size, .056 * size, .037 * size);
}

function coral(m: Model, x: number, z: number, size: number, color: string) {
  m.add(ball, color, x, .94 * size, z, .22 * size, 1.17 * size, .19 * size);
  for (const sign of [-1, 1]) {
    m.add(ball, color, x + sign * .36 * size, .91 * size, z, .17 * size, .64 * size, .16 * size, -sign * .68);
    m.add(ball, color, x + sign * .66 * size, 1.44 * size, z, .15 * size, .49 * size, .14 * size, -sign * .13);
  }
}

// Low foreground silhouettes bookend the taller, animated signature landmark.
export function courseVignette(p: Paint, exit: boolean) {
  const m = new Model();
  const stone = '#9b9e8d', leaf = '#648261';
  const pile = (x:number, z:number, color:string, count:number) => {
    for (let i=0;i<count;i++) m.add(box,color,x+(i%2)*.70,.28+Math.floor(i/2)*.53,z,.68,.54,.72,0,0,i%2?.08:-.04);
  };
  if (p.classic) {
    // Painted marble bins and a rack of cut maple stock.
    for (let i=0;i<3;i++) {
      const x=-1.36+i*1.30;
      m.add(box,p.wood,x,.26,0,1.18,.47,.94);
      if (exit) m.add(ball,[red,brass,p.accent][i],x,.66,0,.44,.44,.44);
      else for (let k=0;k<3;k++) m.add(box,k%2?ivory:p.detail,x,.56+k*.19,0,.98,.16,1.13);
    }
  } else switch (p.id) {
    case 'cedar-creek':
      if (exit) {
        for (let i=0;i<5;i++) m.add(box,i%2?stone:'#b5b4a2',-1.44+i*.72,.30,.56,.77,.61,.69,0,0,.04*i);
        for (const x of [-1.34,1.34]) { m.add(cylinder,p.wood,x,.66,.69,.16,1.25,.16); m.add(cylinder,ivory,x,1.10,.69,.18,.09,.18); }
        for (let i=0;i<9;i++) m.add(cone, i%2?leaf:'#99a05d',-.99+i*.26,.54,-.59,.095,1.08+i%3*.14,.10,.13*Math.sin(i));
      } else for (const [x,z,s] of [[-.84,-.24,1],[1.15,.26,.63]]) {
        m.add(box,ivory,x,.82*s,z,1.52*s,1.62*s,1.24*s);
        roof(m,x,1.72*s,z,1.90*s,1.58*s,'#795c4c');
        for (const u of [-.66,0,.66]) m.add(box,p.wood,x+u*s,.81*s,z+.63*s,.10*s,1.6*s,.08);
        m.add(box,p.trim,x,.53*s,z+.66*s,.38*s,1.07*s,.05);
        m.add(box,'#bd805b',x+.48*s,1.99*s,z-.24*s,.23,.65,.26);
      }
      break;
    case 'paper-moon':
      if (exit) { pile(-1.15,0,p.detail,4); pile(.65,.28,p.wood,2); }
      else { m.add(cylinder,ink,0,.88,0,.27,1.73,.27); m.add(box,ivory,0,1.85,0,2.66,.32,.65,-.18); m.add(ball,brass,.92,2.10,0,.42,.41,.43); }
      break;
    case 'clockmaker':
      for (let i=0;i<3;i++) {
        const x=-1.28+i*1.25, h=exit?.56+i%2*.33:1.30+i%2*.61;
        m.add(box,p.wood,x,h/2,0,.60,h,.62);
        m.add(cylinder,brass,x,h+.24,0,exit?.42:.63,.17,exit?.42:.63,0,Math.PI/2);
        m.add(box,ink,x+.08,h+.30,.12,.05,.45,.045,-.38);
      }
      break;
    case 'bellflower':
      if (exit) { for (const x of [-1.35,-.48,.45,1.30]) flowers(m,x,.12,.60,x>0?p.accent:ivory); }
      else { for (const x of [-.94,.94]) m.add(box,p.wood,x,.90,0,.14,1.8,.16); m.add(box,leaf,0,1.84,0,2.20,.18,.28); flowers(m,-1.28,.23,.69,p.detail); }
      break;
    case 'aurora':
      for (const [i,x] of [-1.40,-.26,1.14].entries()) {
        if (exit) fir(m,x,i*.12,.55+i*.09,'#69939b','#d9e5da');
        else { m.add(gem,'#c0dadb',x,.62+i*.18,0,.62,1.30+i*.35,.56,i*.15); m.add(gem,'#8ab1ba',x+.37,.41,.25,.38,.81,.32,-.18); }
      }
      break;
    case 'cloud-quilt':
      for (const [i,x] of [-1.24,0,1.20].entries()) {
        if (exit) { m.add(ball,i%2?p.accent:p.detail,x,.55,0,.59,.56,.57); m.add(box,ivory,x,.6,0,.09,1.12,.10,-.37); }
        else { m.add(cylinder,p.wood,x,.59,0,.34,1.17,.34); for (const y of [.12,1.10]) m.add(cylinder,ivory,x,y,0,.46,.13,.46); m.add(cylinder,i%2?p.detail:p.accent,x,.60,0,.42,.82,.42); }
      }
      break;
    case 'truck-art':
      if (exit) { pile(-1.28,0,brass,3); pile(.54,-.14,p.accent,4); }
      else { for (const x of [-1.30,1.30]) m.add(box,p.wood,x,.9,0,.13,1.8,.14); for(let i=0;i<7;i++) m.add(box,i%2?p.detail:ivory,-1.32+i*.44,1.81,0,.45,.15,1.66,-.03); m.add(box,p.wood,0,.65,0,2.77,.23,.83); }
      break;
    case 'fossil-canyon':
      if (exit) for(let i=0;i<7;i++) m.add(gem,ivory,-1.48+i*.45,.31+Math.sin(i*.51)*.47,0,.25,.32,.24,i*.22);
      else { for (const x of [-1.32,1.32]) m.add(slope,p.earth,x,.72,0,.52,1.45,.5); m.add(gem,p.detail,0,1.47,0,1.84,.49,.69); }
      break;
    case 'prism-aquarium':
      if (exit) { for(let i=0;i<3;i++) fish(m,-1.15+i*.96,.66+i*.34,0,.56,i%2?p.detail:brass); }
      else { coral(m,-.96,0,.81,'#b97d80'); for(let i=0;i<6;i++) m.add(cone,leaf,.34+i*.23,.65,0,.13,1.38+i%2*.26,.11,.12*Math.sin(i)); }
      break;
    case 'midnight-record':
      if (exit) { for(let i=0;i<6;i++) m.add(cylinder,i%2?ink:p.accent,0,.12+i*.15,0,1.21,.13,1.21); m.add(cylinder,brass,0,.93,0,.36,.05,.36); }
      else { m.add(box,p.wood,0,.49,0,2.78,.96,1.13); for(let i=0;i<7;i++){ m.add(box,ivory,-1.14+i*.38,1,0,.14,.03,.70); m.add(box,p.accent,-1.14+i*.38,1.06,.21*Math.sin(i),.22,.10,.16); } }
      break;
  }
  return m.finish();
}

export function roadsideModel(p: Paint, cluster: boolean) {
  const m = new Model();
  m.add(gem, p.earth, -.28, -.01, -.1, 2.49, .33, 1.79);
  m.add(gem, p.top, .29, .10, .06, 2.63, .24, 1.68, 0, 0, .17);
  switch (p.id) {
    case 'cedar-creek':
      fir(m, cluster ? -.65 : -1.35, -.32, cluster ? 1.25 : .94, '#477260', '#72906a');
      if (cluster) { fir(m, .94, .29, .81, '#658766', '#95a778'); fir(m, -1.80, .42, .56, '#4c7468', '#85a077'); }
      else {
        m.add(box, '#b88556', .78, 1.02, .06, 2.15, 1.57, 1.64);
        m.add(box, ink, .77, .84, .90, .48, 1.0, .065);
        for (const x of [.05, 1.49]) m.add(box, '#f9cb7a', x, 1.17, .91, .44, .42, .06);
        roof(m, .79, 1.99, .05, 2.57, 2.06, '#587e75');
        m.add(box, '#8e6048', 1.47, 2.14, -.36, .33, .93, .33);
      }
      break;
    case 'paper-moon':
      if (!cluster) {
        m.add(box, '#954e47', -.65, 1.37, -.06, 1.56, 2.16, 1.39);
        m.add(ball, red, -.65, 2.36, -.06, .80, .48, .71);
        m.add(box, ivory, -.65, 1.98, .65, 1.23, .37, .065);
        m.add(box, ink, -.65, 2.0, .70, .93, .12, .065);
        pennant(m, -.03, 2.33, -.40, 1.35, p.accent);
      }
      for (const [i, x] of (cluster ? [-1.13, .91] : [1.28]).entries()) {
        const y = cluster ? 1.08 : .95;
        m.add(box, '#cfaa78', x, y - .23, .10, 1.60, y, 1.24);
        m.add(box, p.accent, x, y - .21, .10, .24, y + .045, 1.28);
        m.add(box, ivory, x + .13, y * 1.48, .08, 1.61, .32, 1.21, i ? .08 : -.06);
        m.add(box, '#c58967', x + .62, y * 1.48 + .18, .38, .34, .035, .35);
      }
      break;
    case 'bellflower':
      flowers(m, -.64, -.35, cluster ? 1.01 : 1.48, p.accent);
      flowers(m, 1.12, .30, cluster ? .69 : .87, cluster ? '#bf789d' : '#e6d5bb');
      if (cluster) flowers(m, -1.72, .40, .54, ivory);
      break;
    case 'clockmaker':
      if (!cluster) {
        m.add(box, p.trim, -.50, 1.7, 0, 1.54, 3.05, 1.04);
        m.add(cylinder, brass, -.50, 2.74, .14, .96, .85, .96, 0, Math.PI / 2);
        m.add(cylinder, ivory, -.50, 2.74, .59, .78, .08, .78, 0, Math.PI / 2);
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; m.add(box, ink, -.50 + .61 * Math.sin(a), 2.74 + .61 * Math.cos(a), .64, .055, .14, .035, -a); }
        m.add(box, ink, -.62, 2.90, .68, .077, .47, .05, .62); m.add(box, ink, -.29, 2.80, .69, .073, .51, .05, -1.31);
      }
      for (let i = 0; i < 3; i++) {
        const x = cluster ? -1.41 + i * 1.19 : .62 + i * .48, h = (cluster ? 2.2 : 1.38) * (1 + i * .18);
        m.add(cylinder, i % 2 ? '#ba795b' : brass, x, .30 + h / 2, -.22, cluster ? .31 : .17, h, cluster ? .31 : .17);
        m.add(cylinder, ivory, x, .30 + h, -.22, cluster ? .37 : .22, .14, cluster ? .37 : .22);
        m.add(cylinder, ink, x, .385 + h, -.22, cluster ? .235 : .13, .025, cluster ? .235 : .13);
      }
      break;
    case 'aurora':
      if (!cluster) {
        m.add(slope, ivory, -.44, 1.46, 0, .90, 2.46, .90);
        m.add(slope, '#558a99', -.44, 1.7, 0, .83, .55, .83);
        m.add(cylinder, p.trim, -.44, 2.75, 0, .87, .19, .87);
        m.add(cylinder, '#f1c873', -.44, 3.13, 0, .49, .63, .49);
        m.add(cone, p.trim, -.44, 3.65, 0, .78, .58, .78);
        for (const side of [-1, 1]) m.add(box, p.trim, -.44 + side * .44, 3.14, .16, .08, .70, .08);
      }
      for (let i = 0; i < (cluster ? 4 : 2); i++) {
        const x = cluster ? -1.52 + i * .90 : 1.03 + i * .56, h = [1.02, 1.67, .91, .70][i];
        m.add(gem, i % 2 ? '#bbdedb' : '#78b9c0', x, .27 + h * .68, i % 2 ? -.30 : .36, .48, h, .58, (i - 1.2) * .20);
      }
      break;
    case 'cloud-quilt': {
      if (!cluster) {
        m.add(cylinder, ivory, -.36, 1.0, -.14, 1.33, 1.47, 1.33);
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; m.add(box, '#c46e78', -.36 + Math.sin(a) * 1.30, 1.03, -.14 + Math.cos(a) * 1.30, .40, 1.5, .065, 0, 0, a); }
        m.add(cone, p.accent, -.36, 2.34, -.14, 1.63, 1.27, 1.63);
        pennant(m, -.36, 2.91, -.14, .90, '#9d677f');
      }
      for (let i = 0; i < (cluster ? 4 : 2); i++) {
        const x = cluster ? (i - 1.5) * .85 : 1.36 + i * .56, h = 1.82 + (i % 3) * .47, z = i % 2 ? -.32 : .35;
        m.moving(i % 2, (y, out) => out.set(y * .12, 0, y * .045), () => {
          m.add(cylinder, p.trim, x, h / 2, z, .037, h, .037);
          m.add(ball, [p.accent, '#85b4ad', '#c87b9f', ivory][i], x, h + .29, z, .43, .53, .43);
        });
      }
      break;
    }
    case 'truck-art':
      if (cluster) {
        for (const [x, z, h] of [[-.72, -.35, 3.64], [.97, .08, 2.45], [-1.77, .31, 1.44]]) { m.add(cone, '#718980', x, h * .48, z, h * .40, h, h * .35); m.add(cone, '#d8c6a6', x, h * .82, z, h * .14, h * .33, h * .122); }
      } else {
        m.add(box, p.trim, 0, .92, 0, 3.77, .53, 1.38);
        m.add(box, '#da8658', -.49, 1.68, 0, 2.60, 1.36, 1.4);
        m.add(box, '#62a995', 1.34, 1.45, 0, .99, 1.31, 1.34);
        m.add(box, '#8cb6b5', 1.35, 1.73, .686, .68, .43, .036);
        m.add(box, p.trim, -.47, 2.39, 0, 2.71, .16, 1.53);
        for (let i = 0; i < 5; i++) { const x = -1.49 + i * .51; m.add(box, i % 2 ? ivory : p.detail, x, 1.72, .715, .31, .31, .046, Math.PI / 4); }
        for (const x of [-1.13, 1.19]) for (const z of [-.70, .70]) { m.add(cylinder, ink, x, .75, z, .43, .18, .43, 0, Math.PI / 2); m.add(cylinder, brass, x, .75, z * 1.14, .21, .053, .21, 0, Math.PI / 2); }
      }
      break;
    case 'fossil-canyon':
      for (const [x, z, size] of (cluster ? [[-.73, -.27, .72], [1.28, .31, .58]] : [[-.85, -.28, 1.37], [1.26, .23, .77]])) {
        let y = .26;
        for (const [radius, h, color] of [[1.08, .75, '#b87959'], [.84, .29, '#edbe86'], [.72, .74, '#a65e50'], [.77, .19, '#e0a16c']] as const) {
          m.add(slope, color, x, y + h * size / 2, z, radius * size, h * size, radius * size * .77); y += h * size;
        }
      }
      break;
    case 'prism-aquarium':
      coral(m, -.78, -.15, cluster ? 1.13 : 1.42, '#ce8192'); coral(m, 1.03, .27, .86, '#6eb5a0');
      if (!cluster) {
        m.moving(0, (_, out) => out.set(.58, .18, .12), () => fish(m, .38, 3.18, -.11, 1.10, '#e9b46a'));
        m.moving(1, (_, out) => out.set(.43, .22, -.09), () => fish(m, 1.22, 2.57, .18, .68, '#80c3c7'));
      }
      break;
    case 'midnight-record':
      for (const [x, z, size] of (cluster ? [[-1.10, -.26, .78], [.88, .24, .64]] : [[-.68, -.27, 1.12], [1.16, .16, .73]])) {
        m.add(box, p.earth, x, .27 + 1.31 * size, z, 1.52 * size, 2.62 * size, 1.0 * size);
        m.add(box, ink, x, .27 + 1.31 * size, z + .49 * size, 1.38 * size, 2.43 * size, .087);
        for (const [height, r] of [[.85, .57], [1.99, .36]]) {
          m.add(cylinder, p.detail, x, .27 + height * size, z + .55 * size, r * size, .075, r * size, 0, Math.PI / 2);
          m.add(cylinder, '#514555', x, .27 + height * size, z + .60 * size, r * size * .84, .059, r * size * .84, 0, Math.PI / 2);
          m.add(ball, p.accent, x, .27 + height * size, z + .65 * size, r * size * .34, r * size * .34, .09);
        }
      }
      break;
  }
  return m.finish();
}
