import * as T from 'three';
import type { Racer } from './physics';
import { SIGNATURES } from './signatures';
import type { TrackId } from './signatures';
import { branchPoint, point } from './track';
import type { Plan, Sample, V3 } from './track';

const box = new T.BoxGeometry(1, 1, 1);
const disc = new T.CylinderGeometry(1, 1, 1, 40);
const pot = new T.CylinderGeometry(1, .61, 1, 28, 1, true);
const cone = new T.ConeGeometry(1, 1, 6);
const oval = new T.SphereGeometry(1, 16, 10);
const flat = new T.PlaneGeometry(1, 1);
const ring = new T.TorusGeometry(1, .073, 6, 40);
const TAU = 2 * Math.PI;

function shape(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material,
  x: number, y: number, z: number, w: number, h: number, depth: number) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, depth);
  parent.add(mesh);
  return mesh;
}

function group(parent: T.Object3D, p: V3, yaw = 0) {
  const anchor = new T.Group();
  anchor.position.copy(p);
  anchor.rotation.y = yaw;
  parent.add(anchor);
  return anchor;
}

function mounted(parent: T.Object3D, n: Sample, x: number, y: number) {
  return group(parent, point(n, x, y), n.yaw);
}

type Palette = { deck: T.MeshStandardMaterial; dark: T.MeshStandardMaterial; accent: T.MeshStandardMaterial;
  light: T.MeshStandardMaterial; ivory: T.MeshStandardMaterial; gold: T.MeshStandardMaterial; water: T.MeshStandardMaterial };

function petalFan(root: T.Object3D, paint: Palette, peacock: boolean) {
  const count = peacock ? 13 : 10;
  return Array.from({ length: count }, (_, i) => {
    const mount = group(root, { x: 0, y: peacock ? .12 : .61, z: -.14 });
    const angle = peacock ? -1.28 + i * 2.56 / (count - 1) : i * TAU / count;
    mount.rotation.z = angle;
    shape(mount, oval, i % 2 ? paint.accent : paint.light, 0, .78, 0, .25, .86, .10);
    shape(mount, oval, i % 2 ? paint.gold : paint.ivory, 0, 1.26, .082, .12, .24, .045);
    return { mount, angle };
  });
}

const digits = ['111101101101111', '010110010010111', '111001111100111', '111001111001111',
  '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111'];

class FinishProp {
  private readonly banner: T.Group;
  private readonly parts: T.Object3D[] = [];
  private readonly lanterns: T.MeshStandardMaterial[] = [];
  private readonly updateMotion: (amount: number, count: number, winner: number | undefined) => void;
  private readonly number: T.Mesh;
  private lastWinner?: number;

  constructor(root: T.Object3D, private readonly track: TrackId, paint: Palette, art: SignatureArt, podium: boolean) {
    const p = paint;
    const stamp = track === 'paper-moon';
    const fish = track === 'prism-aquarium';
    const peacock = track === 'truck-art';
    const rosette = track === 'cloud-quilt';
    const record = track === 'midnight-record';
    this.banner = group(root, { x: 0, y: stamp ? .56 : .71, z: .12 });
    this.number = shape(this.banner, flat, art.numbers[0], 0, 0, .29, fish ? .40 : 1.18, fish ? .40 : .68, 1);
    shape(root, box, p.dark, 0, -.11, 0, 2.55, .23, .81);
    if (stamp) {
      shape(root, box, p.deck, 0, .44, 0, 2.36, .85, .69);
      const head = group(root, { x: 0, y: 1.9, z: 0 });
      shape(head, box, p.dark, 0, 0, 0, 1.95, .35, .62);
      shape(head, disc, p.accent, 0, .46, 0, .26, .65, .26);
      this.updateMotion = t => { head.position.y = 1.9 - Math.sin(Math.min(1, t * 1.65) * Math.PI) * .99; };
    } else if (track === 'cedar-creek') {
      shape(root, disc, p.dark, -.87, 1.05, 0, .07, 2.28, .07);
      shape(root, box, p.deck, 0, .34, 0, 2.20, .69, .56);
      const flag = shape(root, box, p.accent, -.14, .73, 0, 1.38, .56, .055);
      this.updateMotion = t => { flag.position.y = .73 + t * 1.17; flag.rotation.y = t * Math.sin(6 * t) * .15; };
    } else if (track === 'bellflower') {
      const bell = group(root, { x: 0, y: 1.55, z: 0 });
      shape(bell, pot, p.ivory, 0, 0, 0, .78, .82, .78).rotateZ(Math.PI);
      shape(bell, disc, p.gold, 0, -.44, 0, .10, .26, .10);
      petalFan(bell, p, false).forEach(({ mount }) => mount.scale.setScalar(.59));
      this.updateMotion = t => { bell.rotation.z = Math.sin(t * 19) * (1 - t) * .42; };
    } else if (track === 'clockmaker' || track === 'aurora') {
      const keys = track === 'clockmaker';
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * .77;
        shape(root, box, p.dark, x, 1.22, 0, .51, .80, .50);
        const material = keys ? p.ivory : art.own(p.light.clone());
        if (!keys) this.lanterns.push(material);
        this.parts.push(shape(root, keys ? box : oval, material, x, 1.30, .27, .36, .52, .24));
      }
      this.updateMotion = (_t, count) => this.parts.forEach((part, i) => { part.scale.y = i < count ? .48 : .28; });
    } else if (peacock || rosette) {
      if (peacock) shape(root, box, art.enamel, 0, .32, 0, 2.52, .79, .56);
      const fan = petalFan(root, p, peacock);
      shape(root, oval, p.dark, 0, .61, .043, .23, .34, .14);
      if (peacock) shape(root, oval, p.accent, 0, 1.02, .073, .12, .22, .095);
      this.updateMotion = t => fan.forEach(({ mount, angle }) => {
        mount.scale.setScalar(.22 + t * .78);
        mount.rotation.z = angle * (.07 + t * .93);
      });
    } else if (record) {
      shape(root, box, p.dark, 0, .89, -.04, 2.18, 1.78, .21);
      shape(root, ring, p.gold, 0, .86, .12, .64, .64, .53);
      const arm = group(root, { x: .95, y: 1.7, z: .27 });
      shape(arm, box, p.ivory, -.53, 0, 0, 1.12, .08, .09);
      shape(arm, box, p.accent, -1.07, -.06, 0, .23, .14, .12);
      this.updateMotion = t => { arm.rotation.z = .93 * (1 - t) + .22; };
    } else if (fish) {
      shape(root, box, p.water, 0, .94, -.08, 2.60, 1.92, .14);
      const school = Array.from({ length: 15 }, (_, i) => {
        const f = group(root, { x: 0, y: 0, z: .12 });
        shape(f, oval, i % 2 ? p.accent : p.light, 0, 0, 0, .13, .073, .041);
        shape(f, cone, p.gold, -.14, 0, 0, .065, .09, .035).rotateZ(-Math.PI / 2);
        return f;
      });
      this.updateMotion = (t, _count, winner) => school.forEach((f, i) => {
        const index = digits[winner ?? 0]?.[i] === '1';
        const x = (i % 3 - 1) * .44, y = 1.56 - Math.floor(i / 3) * .27;
        f.position.set(T.MathUtils.lerp(Math.cos(i * 13.1) * 1.06, x, t), T.MathUtils.lerp(.88 + Math.sin(i * 3) * .70, y, t), .17);
        f.scale.setScalar(index ? 1 : 1 - t);
        f.visible = index || t < .99;
      });
      this.banner.position.set(1.01, .26, .20);
    } else {
      shape(root, box, p.deck, 0, .88, 0, 2.54, 1.76, .31);
      const fossil = art.dinosaur(root, 0, 1.36, .17, .75);
      this.updateMotion = t => { fossil.scale.setScalar(.05 + .95 * t); };
      this.banner.position.y = .43;
    }
    root.scale.setScalar(podium ? 1.24 : 1.52);
    this.update([], 0, 0);
  }

  update(finishers: readonly Racer[], elapsed: number, podiumTime: number, numbers?: readonly T.Material[]) {
    const winner = finishers[0];
    const amount = winner ? Math.min(1, Math.max(0, (elapsed - winner.finish! + podiumTime) / 1.25)) : 0;
    const id = winner?.id;
    if (numbers && this.lastWinner !== id) {
      this.number.material = numbers[id ?? 0];
      this.lastWinner = id;
    }
    this.banner.visible = Boolean(winner && (this.track !== 'paper-moon' || amount >= .29));
    this.updateMotion(amount, Math.min(3, finishers.length), id);
    this.lanterns.forEach((lamp, i) => {
      lamp.emissive.set(finishers[i]?.identity.color ?? '#234459');
      lamp.emissiveIntensity = finishers[i] ? .68 : .04;
    });
  }
}

export class SignatureArt {
  private readonly resources: { dispose(): void }[] = [];
  private readonly animated: ((seconds: number, check: number) => void)[] = [];
  private finish?: FinishProp;
  private podium?: FinishProp;
  private readonly paint: Palette;
  readonly numbers: readonly T.Material[];
  readonly enamel: T.Material;

  own<TResource extends { dispose(): void }>(resource: TResource) {
    this.resources.push(resource);
    return resource;
  }

  constructor(private readonly track: TrackId) {
    const [, deck, dark, accent, light] = SIGNATURES[track].colors;
    const color = (value: string, roughness = .53, metalness = .10) => {
      const m = new T.MeshStandardMaterial({ color: value, roughness, metalness, side: T.DoubleSide });
      this.resources.push(m);
      return m;
    };
    this.paint = { deck: color(deck), dark: color(dark), accent: color(accent, .31), light: color(light, .40),
      ivory: color('#fff4d8', .36), gold: color('#e6ac59', .27, .58), water: color('#256c86', .13, .58) };
    this.enamel = track === 'truck-art' ? this.print(512, 256, ctx => truckPanel(ctx)) : this.paint.deck;
    this.numbers = Array.from({ length: 9 }, (_, i) => this.print(256, 128, ctx => {
      ctx.fillStyle = track === 'paper-moon' ? '#e2b886' : '#2b3044';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = track === 'paper-moon' ? '#8f423a' : '#eec37c';
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 9, 240, 110);
      ctx.fillStyle = track === 'paper-moon' ? '#94392f' : '#fff3d4';
      ctx.font = '900 83px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (i) ctx.fillText(`#${i}`, 128, 68);
    }));
  }

  private print(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d')!);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    const material = new T.MeshBasicMaterial({ map, side: T.DoubleSide });
    this.resources.push(map, material);
    return material;
  }

  private tube(root: T.Object3D, points: number[][], radius: number, mat: T.Material) {
    const curve = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
    const geometry = new T.TubeGeometry(curve, 24, radius, 7, false);
    this.resources.push(geometry);
    shape(root, geometry, mat, 0, 0, 0, 1, 1, 1);
  }

  private lantern(root: T.Object3D, x: number, y: number, z: number) {
    const p = this.paint;
    shape(root, box, p.dark, x, y - .40, z, .14, .94, .14);
    shape(root, box, p.light, x, y + .16, z, .40, .49, .40);
    shape(root, cone, p.dark, x, y + .51, z, .36, .30, .36);
  }

  buildStart(root: T.Group, n: Sample) {
    const p = this.paint;
    const a = mounted(root, n, 0, 0);
    const sideX = [-4.75, 4.75];
    switch (this.track) {
      case 'paper-moon':
        shape(a, box, p.deck, 0, -.69, 0, 9.1, 1.12, 5.8);
        shape(a, disc, p.dark, -4, .04, 1.7, .89, .16, .89).rotateX(Math.PI / 2);
        shape(a, box, p.ivory, -4, .25, 1.83, .052, .48, .08).rotateZ(-.50);
        for (const x of sideX) shape(a, box, p.light, x, -.10, 2.05, 1.3, 1.38, 1.45);
        break;
      case 'cedar-creek':
        for (const x of sideX) {
          shape(a, box, p.deck, x, -1.4, 0, .45, 3, 4.8);
          shape(a, box, p.dark, x, -1.3, .24, .37, .33, 5.43).rotateX(.46);
        }
        break;
      case 'bellflower':
        for (const x of sideX) {
          shape(a, pot, p.deck, x, .57, .9, .82, 1.23, .82);
          shape(a, ring, p.ivory, x, .84, .9, .76, .76, .70).rotateX(Math.PI / 2);
          shape(a, oval, p.accent, x, 1.3, .9, .48, .27, .48);
        }
        break;
      case 'clockmaker':
        shape(a, disc, p.gold, -4.89, 1.02, .52, .22, 1.88, .22).rotateZ(.52);
        for (const x of [-5.7, -4.51]) shape(a, ring, p.gold, x, 2.07, .60, .73, .64, .72);
        break;
      case 'aurora':
        for (const x of sideX) this.lantern(a, x, .85, 1.4);
        break;
      case 'cloud-quilt':
        for (const x of sideX) for (let i = 0; i < 3; i++) {
          shape(a, disc, i % 2 ? p.light : p.accent, x, .29 + i * .50, .6, .43, .49, .43);
          shape(a, disc, p.ivory, x, .06 + i * .50, .6, .55, .11, .55);
        }
        break;
      case 'truck-art':
        shape(a, box, p.accent, 0, -.67, -.45, 9.45, 1.05, 4.8);
        shape(a, box, this.enamel, 0, .4, -2.18, 8.70, 1.86, .55);
        shape(a, box, this.enamel, -4.17, .18, -.55, .41, 1.25, 3.5);
        shape(a, box, p.light, 0, 2.47, -2.23, 9.28, .34, 1.02);
        for (const x of sideX) shape(a, disc, p.dark, x, -1.33, .9, .83, .44, .83).rotateZ(Math.PI / 2);
        break;
      case 'fossil-canyon':
        shape(a, cone, p.light, -5.7, .93, 0, 1.69, 2.42, 1.51).rotateY(.22);
        shape(a, box, p.deck, -5.7, .02, 0, 2.77, .17, 2.7);
        break;
      case 'prism-aquarium':
        shape(a, box, p.water, 0, -.92, 1, 9.77, 1.48, 4.48);
        for (const x of sideX) shape(a, ring, p.light, x, .48, .85, .72, .55, .83);
        break;
      case 'midnight-record':
        shape(a, box, p.dark, 0, -.76, 0, 9.28, .92, 6.42);
        shape(a, box, p.dark, -4.61, 1.15, -.05, 1.85, 2.77, .24).rotateZ(-.18);
        shape(a, ring, p.gold, -4.57, 1.27, .095, .70, .84, .94);
        break;
    }
  }

  *buildLandmark(root: T.Group, plan: Plan) {
    const m = plan.modules.find(item => item.track)!;
    const p = this.paint;
    const at = (t: number) => plan.nodes[m.from + Math.round((m.to - m.from) * t)];
    const outside = -m.lean;
    const center = at(.50);
    const next = at(.83);
    const anchor = mounted(root, center, m.lean * (center.half + 5.48), -.72);
    const apron = mounted(root, next, outside * (next.half + 1.05), -1.07);
    switch (this.track) {
      case 'paper-moon': {
        const mail = mounted(root, at(.46), m.lean * 9.57, -1.3);
        shape(mail, box, p.ivory, 0, 1.56, 0, 6.7, 3.75, .23).rotateY(outside * .60);
        shape(mail, cone, p.accent, 0, 3.87, -.06, 3.78, 1.89, .20).rotateY(Math.PI / 6 + outside * .60);
        this.tube(mail, [[-2.75, 2.72, .39], [0, .86, .49], [2.75, 2.72, .39]], .095, p.deck);
        for (const t of [.11, .16, .22]) {
          const roof = mounted(root, at(t), outside * 4.81, -.83);
          for (const s of [-1, 1]) shape(roof, box, s < 0 ? p.deck : p.dark, s * .68, .32, 0, 1.59, .11, 2.6).rotateZ(-s * .46);
        }
        shape(apron, box, p.deck, outside * -2.5, .04, 0, 12.9, .40, 6.3);
        break;
      }
      case 'cedar-creek': {
        const house = 2.85 * m.lean;
        shape(anchor, box, p.ivory, house, .99, 0, 5.72, 3.61, 5.12);
        shape(anchor, box, p.dark, house, -.54, 0, 5.91, .61, 5.27);
        // Half-timber both gables so the building reads from either course direction.
        for (const side of [-1,1]) {
          const z = side * 2.58;
          for (const x of [-2.68,0,2.68]) shape(anchor,box,p.deck,house+x,1.31,z,.17,2.98,.14);
          shape(anchor,box,p.deck,house,1.02,z,5.60,.16,.14);
          for (const x of [-1.36,1.36]) {
            shape(anchor,box,p.dark,house+x,1.73,z+side*.09,.91,.86,.12);
            shape(anchor,box,p.light,house+x,1.73,z+side*.16,.66,.62,.08);
            shape(anchor,box,p.deck,house+x,1.73,z+side*.21,.08,.66,.06);
          }
          shape(anchor,box,p.deck,house,-.04,z+side*.10,.81,1.18,.18);
          shape(anchor,box,p.deck,house,2.62,z,5.63,.16,.14);
        }
        shape(anchor,box,p.dark,house+1.42,3.38,-1.34,.57,1.48,.62);
        shape(anchor,box,p.deck,house+1.42,4.13,-1.34,.73,.16,.75);
        for (const s of [-1, 1]) shape(anchor, box, p.dark, 2.85 * m.lean + s * 1.48, 3.11, 0, 3.54, .23, 5.70).rotateZ(-s * .46);
        const millpond = p.water.clone();
        millpond.transparent = true;
        millpond.opacity = .69;
        this.resources.push(millpond);
        const water = shape(anchor, box, millpond, -m.lean * .72, -1.80, 0, 9.33, .07, 11.0);
        water.receiveShadow = true;
        const wheel = group(anchor, { x: 0, y: .61, z: 0 });
        const reflection = group(anchor, { x: 0, y: -3.68, z: 0 });
        reflection.scale.set(1, -.53, 1);
        for (const wheelFace of [wheel, reflection]) for (let i = 0; i < 10; i++) {
          const a = i * TAU / 10;
          const station = group(wheelFace, { x: 0, y: 0, z: 0 });
          station.rotation.z = a;
          shape(station, box, wheelFace === wheel ? p.deck : p.water, 0, 1.37, 0, .29, 2.36, .37);
          shape(station, box, wheelFace === wheel ? p.dark : p.water, 0, 2.34, 0, 1.19, .23, .66);
        }
        shape(wheel, ring, p.dark, 0, 0, .29, 2.34, 2.34, 1.88);
        this.animated.push(t => { wheel.rotation.z = t * .71; reflection.rotation.z = t * .71; });
        break;
      }
      case 'bellflower':
        for (let i = 0; i < 11; i++) {
          const t = .24 + i * .046;
          const n = at(t);
          const petal = group(root, branchPoint(n, m, outside, outside * 1.27, -.84), n.yaw);
          shape(petal, oval, i % 2 ? p.ivory : p.accent, outside * .68, 0, 0, 1.44, .72, 2.15).rotateZ(outside * .19);
        }
        shape(anchor, pot, p.accent, 0, -.69, 0, 3.13, 1.86, 3.13);
        shape(anchor, ring, p.ivory, 0, .19, 0, 3.03, 3.03, 2.55).rotateX(Math.PI / 2);
        break;
      case 'clockmaker': {
        const rotor = group(anchor, { x: 0, y: .56, z: 0 });
        rotor.rotation.x = -Math.PI / 2;
        for (const [i, size] of [3.65, 2.31, .91].entries()) {
          shape(rotor, ring, i === 1 ? p.deck : p.gold, 0, 0, i * .20, size, size, .97);
        }
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12;
          shape(rotor, box, p.gold, 3.41 * Math.cos(a), 3.41 * Math.sin(a), 0, .91, .61, .37).rotateZ(a);
        }
        shape(anchor, box, p.dark, 0, -.78, 0, 8.01, .58, 7.64);
        this.animated.push(t => { rotor.rotation.z = t * .36; });
        break;
      }
      case 'aurora': {
        for (const t of [.22, .38, .55, .70, .88]) {
          const n = at(t);
          const a = group(root, branchPoint(n, m, outside, outside * 1.13, -.52), n.yaw);
          this.lantern(a, 0, .55, 0);
        }
        const sky = group(anchor, { x: m.lean * 4.5, y: 2.8, z: 0 });
        for (let i = 0; i < 4; i++) this.tube(sky,
          [[-10, 5.6 + i * .30, -10], [-6, 7.2 + i * .44, -13], [0, 7.1 + i * .47, -14],
            [7, 6.52 + i * .31, -13], [13, 8.12 + i * .43, -10]], .13 + i * .039, i % 2 ? p.accent : p.light);
        break;
      }
      case 'cloud-quilt':
        for (const [i, t] of [.33, .48, .63].entries()) {
          const n = at(t);
          const drum = group(root, branchPoint(n, m, m.lean, 0, -.88), n.yaw);
          shape(drum, disc, i % 2 ? p.accent : p.deck, 0, 0, 0, 2.7, 1.25, 2.26).rotateX(.20);
          shape(drum, ring, p.ivory, 0, .44, 0, 2.75, 2.13, .65).rotateX(Math.PI / 2);
          for (const x of [-1, 1]) shape(drum, box, p.light, x * 1.87, -.28, .8, .11, .61, .084).rotateZ(x * .37);
        }
        shape(apron, box, p.dark, -outside * 2.55, .2, 0, 11.9, .33, 5.4).rotateX(.18);
        break;
      case 'truck-art': {
        for (const t of [.23, .43, .67, .87]) {
          const n = at(t);
          const frame = group(root, branchPoint(n, m, outside, outside * 1.10, -.54), n.yaw);
          shape(frame, box, this.enamel, outside * .13, .13, 0, .35, 1.02, 3.15);
          shape(frame, box, p.accent, 0, .72, 0, .44, .14, 3.19);
          for (let i = 0; i < 6; i++) shape(frame, disc, p.gold, outside * .15, -.53, i * .48 - 1.2, .07, .39, .07);
        }
        shape(anchor, box, this.enamel, 0, 1.55, 0, 5.35, 2.73, .39);
        shape(anchor, box, p.accent, 0, .95, -.39, 5.71, 1.49, 3.62);
        shape(anchor, box, p.accent, -2.0, 2.60, -.35, 1.68, 1.24, 3.69);
        for (const x of [-1.80, 1.80]) shape(anchor, disc, p.dark, x, .12, 1.18, .57, .26, .57).rotateX(Math.PI / 2);
        const tail = group(anchor, { x: 0, y: 2.43, z: .03 });
        petalFan(tail, p, true);
        break;
      }
      case 'fossil-canyon': {
        for (let i = 0; i < 7; i++) {
          const n = at(.29 + i * .061);
          const rib = mounted(root, n, 0, -.34);
          this.tube(rib, [[0, -.55, 0], [.12, .63, 0], [.51, 1.92, 0], [1.2, 2.25, 0]], .20 - i * .009, p.ivory);
        }
        for (let i = 0; i < 3; i++) shape(anchor, box, i % 2 ? p.dark : p.deck,
          0, -1.5 + i * .55, 0, 8 - i * 1.41, .72, 6 - i * .94);
        const mural = this.dinosaur(anchor, 0, .46, 3.2, 2.6);
        const milestones = [.31, .44, .58, .72].map(t => at(t).s);
        this.animated.push((_t, distance) => mural.children.forEach((part, i) => { part.visible = distance >= milestones[i % 4]; }));
        break;
      }
      case 'prism-aquarium': {
        const tower = mounted(root, center, 0, -3.15);
        shape(tower, disc, p.water, 0, -.65, 0, 10.9, .19, 8.1);
        for (const x of [-3.72, 3.72]) this.tube(tower, [[x, -.63, 0], [x, .26, 0], [x * .90, .78, -.22]], .23, p.accent);
        for (let i = 0; i < 7; i++) {
          const a = i * TAU / 7;
          const x = 1.52 * Math.cos(a), z = 1.52 * Math.sin(a);
          this.tube(anchor, [[x, -1.31, z], [x * .51, .15, z * .65], [x, 2.80 + i % 3 * .60, z],
            [x * 1.43, 3.12 + i % 3 * .63, z * 1.41]], .18, i % 2 ? p.accent : p.light);
        }
        break;
      }
      case 'midnight-record': {
        shape(anchor, box, p.deck, 0, -1.83, 0, 12.6, .90, 11.5);
        const platter = group(anchor, { x: 0, y: -1.13, z: 0 });
        shape(platter, disc, p.dark, 0, 0, 0, 5.6, .37, 5.6);
        for (const radius of [2.22, 2.65, 3.62, 4.35, 5.2]) shape(platter, ring, p.deck, 0, .205, 0, radius, radius, .16).rotateX(Math.PI / 2);
        shape(platter, disc, p.accent, 0, .21, 0, 1.61, .06, 1.61);
        shape(platter, box, p.light, -.29, .27, 1.18, .33, .025, .57);
        for (let i = 0; i < 3; i++) shape(platter, box, p.gold, 4.22, .24, i * .40 - .40, .70, .021, .09);
        this.animated.push(t => { platter.rotation.y = t * .36; });
        break;
      }
    }
    yield;
  }

  dinosaur(root: T.Object3D, x: number, y: number, z: number, scale: number) {
    const fossil = group(root, { x, y, z });
    const p = this.paint;
    const body = group(fossil, { x: 0, y: 0, z: 0 });
    shape(body, oval, p.ivory, -.15, .03, 0, .58, .29, .059).rotateZ(.26);
    const head = group(fossil, { x: .59, y: .30, z: 0 });
    shape(head, oval, p.ivory, .10, 0, 0, .41, .23, .06);
    shape(head, oval, p.dark, .19, .04, .05, .052, .052, .021);
    const tail = group(fossil, { x: 0, y: 0, z: 0 });
    this.tube(tail, [[-.4, -.04, 0], [-.86, -.03, 0], [-1.17, .19, 0]], .094, p.ivory);
    const legs = group(fossil, { x: 0, y: 0, z: 0 });
    for (const u of [-.29, .08]) this.tube(legs, [[u, .02, 0], [u + .11, -.24, 0], [u - .02, -.48, 0]], .081, p.ivory);
    fossil.scale.setScalar(scale);
    return fossil;
  }

  buildFinish(route: T.Group, podium: T.Group, n: Sample) {
    const p = this.paint;
    const a = mounted(route, n, -4.93, -.27);
    a.position.x += Math.sin(n.yaw) * 2.05;
    a.position.z += Math.cos(n.yaw) * 2.05;
    a.rotateY(Math.PI * .18);
    this.finish = new FinishProp(a, this.track, p, this, false);
    this.podium = new FinishProp(group(podium, { x: 0, y: 1.92, z: -2.46 }), this.track, p, this, true);
    if (this.track === 'aurora' || this.track === 'truck-art') {
      const arch = mounted(route, n, 0, 0);
      this.tube(arch, [[-4.1, 0, 0], [-3.85, 2.11, 0], [-2.6, 3.65, 0], [0, 4.24, 0],
        [2.6, 3.65, 0], [3.85, 2.11, 0], [4.1, 0, 0]], .31, p.accent);
      if (this.track === 'truck-art') shape(arch, box, this.enamel, 0, 3.77, 0, 6.45, .72, .29);
    }
    if (this.track === 'clockmaker') {
      const keys = mounted(route, n, 0, .023);
      for (let i = 0; i < 12; i++) {
        const key = shape(keys, box, i % 3 === 1 ? p.dark : p.ivory, i * .59 - 3.24, 0, -.77, .55, .028, i % 3 === 1 ? .62 : 1.2);
        key.rotation.x = .22;
      }
    }
  }

  frame(racers: readonly Racer[], finishers: readonly Racer[], seconds: number, elapsed: number, plan: Plan, podiumTime: number) {
    const distance = Math.max(0, ...racers.map(r => plan.nodes[plan.checks[r.progress.check]].s));
    for (const move of this.animated) move(seconds, distance);
    this.finish?.update(finishers, elapsed, 0, this.numbers);
    this.podium?.update(finishers, elapsed, podiumTime, this.numbers);
  }

  dispose() { this.resources.forEach(resource => resource.dispose()); }
}

function truckPanel(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#174f6d'; ctx.fillRect(0, 0, 512, 256);
  for (const [inset, ink] of [[5, '#f29553'], [15, '#ffde8a'], [23, '#4be4ab']] as const) {
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.strokeRect(inset, inset, 512 - inset * 2, 256 - inset * 2);
  }
  const ellipse = (x: number, y: number, rx: number, ry: number, a: number, fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, TAU); ctx.fill();
  };
  for (const x of [78, 434]) for (const y of [70, 184]) {
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      ellipse(x + 18 * Math.cos(a), y + 18 * Math.sin(a), 13, 7, a, i % 2 ? '#ef605c' : '#fda76c');
    }
    ellipse(x, y, 8, 8, 0, '#ffe591');
  }
  for (let i = 0; i < 11; i++) {
    const a = -1.34 + i * .268;
    const x = 250 + Math.sin(a) * 115, y = 166 - Math.cos(a) * 100;
    ellipse(x, y, 11, 44, a, i % 2 ? '#41be8f' : '#7bd89c');
    ellipse(x, y - 13, 7, 12, a, '#edaf50');
    ellipse(x, y - 15, 4, 6, a, '#215382');
  }
  ellipse(252, 170, 55, 23, -.26, '#40c4be');
  ellipse(287, 136, 15, 41, .41, '#3babe0');
  ellipse(309, 105, 15, 13, .14, '#60e9e6');
  ellipse(314, 102, 3, 3, 0, '#163351');
  ellipse(328, 107, 13, 3.5, .12, '#fed771');
}
