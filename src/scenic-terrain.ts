import * as T from 'three';
import { Random } from './random';
import { nodeAt } from './track';
import type { Plan } from './track';

const cell = 3.5;
export type Tabletop = { x: number; y: number; z: number; width: number; depth: number };
function bankRise(distance: number) { return .48 * distance + .086 * Math.max(0, distance - 7) ** 2; }

// The same surface supports the artwork and the trestles. At a crossing the lower
// deck sets the terrain height, including the full footprint of the spiral table.
export class ScenicTerrain {
  readonly startTable: Tabletop;
  readonly spiralTable?: Tabletop;
  private readonly x: number;
  private readonly z: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly heights: Float32Array;

  constructor(private readonly plan: Plan) {
    this.startTable = { x: 0, y: plan.nodes[0].y - 4.12, z: .85, width: 29, depth: 29.1 };
    const xs = plan.nodes.map(n => n.x), zs = plan.nodes.map(n => n.z);
    this.x = Math.floor((Math.min(...xs) - 100) / cell) * cell;
    this.z = Math.floor((Math.min(...zs) - 100) / cell) * cell;
    this.columns = Math.ceil((Math.max(...xs) + 100 - this.x) / cell) + 1;
    this.rows = Math.ceil((Math.max(...zs) + 100 - this.z) / cell) + 1;
    this.heights = new Float32Array(this.columns * this.rows);
    const spiral = plan.modules.find(m => m.kind === 'terraces');
    if (spiral) {
      const ring = plan.nodes.slice(spiral.from, spiral.to + 1);
      const left = Math.min(...ring.map(n => n.x - n.half)), right = Math.max(...ring.map(n => n.x + n.half));
      const front = Math.min(...ring.map(n => n.z - n.half)), back = Math.max(...ring.map(n => n.z + n.half));
      this.spiralTable = { x: (left + right) / 2, z: (front + back) / 2, y: plan.nodes[spiral.to].y - 4.4,
        width: right - left + 2.35, depth: back - front + 2.35 };
    }
  }

  get bounds() { return { x: this.x, z: this.z, width: (this.columns - 1) * cell, depth: (this.rows - 1) * cell }; }

  onStartTable(x: number, z: number, distance: number) {
    const table = this.startTable;
    return distance < 18 && Math.abs(x - table.x) < table.width / 2 && Math.abs(z - table.z) < table.depth / 2;
  }

  *shape() {
    const { plan } = this;
    const guides = plan.nodes.filter((_, i) => i % 3 === 0 || i === plan.nodes.length - 1).map(n => ({
      x: n.x, z: n.z, y: n.y - (plan.obstacles ? 6.05 : 4.45), width: n.half + .9,
    }));
    const table = this.spiralTable;
    for (let row = 0; row < this.rows; row++) {
      const z = this.z + row * cell;
      for (let column = 0; column < this.columns; column++) {
        const x = this.x + column * cell;
        let y = Infinity, nearest = Infinity, area = 0, elevation = 0;
        for (const guide of guides) {
          const dx = x - guide.x, dz = z - guide.z;
          const squared = dx * dx + dz * dz;
          const margin = Math.max(0, Math.sqrt(squared) - guide.width);
          y = Math.min(y, guide.y + bankRise(margin));
          nearest = Math.min(nearest, margin);
          const weight = 1 / (squared + 36) ** 2;
          area += weight; elevation += weight * guide.y;
        }
        // A low finish across the room must not hollow out the woods at the grid.
        // Blend local elevations, then cut away only enough ground for nearby decks.
        y = Math.min(y, elevation / area + Math.min(5, nearest * .29));
        const relief = Math.sin(x * .094 + z * .035) + .72 * Math.cos(z * .15 - x * .046);
        y += T.MathUtils.smoothstep(nearest, 2, 19) * relief;
        const start = this.startTable;
        const sx = Math.max(0, Math.abs(x - start.x) - start.width / 2 - .5);
        const sz = Math.max(0, Math.abs(z - start.z) - start.depth / 2 - .5);
        y = Math.min(y, start.y - 1.33 + bankRise(Math.hypot(sx, sz)));
        if (table) {
          const dx = Math.max(0, Math.abs(x - table.x) - table.width / 2 - .24);
          const dz = Math.max(0, Math.abs(z - table.z) - table.depth / 2 - .24);
          y = Math.min(y, table.y - 1.25 + bankRise(Math.hypot(dx, dz)));
        }
        this.heights[row * this.columns + column] = y;
      }
      yield;
    }
  }

  height(x: number, z: number) {
    const gx = T.MathUtils.clamp((x - this.x) / cell, 0, this.columns - 1);
    const gz = T.MathUtils.clamp((z - this.z) / cell, 0, this.rows - 1);
    const col = Math.min(Math.floor(gx), this.columns - 2), row = Math.min(Math.floor(gz), this.rows - 2);
    const i = row * this.columns + col, u = gx - col, v = gz - row;
    const a = this.heights[i], b = this.heights[i + 1], c = this.heights[i + this.columns], d = this.heights[i + this.columns + 1];
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  *tiles() {
    const span = 20;
    for (let row = 0; row < this.rows - 1; row += span) for (let col = 0; col < this.columns - 1; col += span) {
      const width = Math.min(span + 1, this.columns - col), depth = Math.min(span + 1, this.rows - row);
      const vertices: number[] = [], normals: number[] = [], uv: number[] = [], triangles: number[] = [];
      for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) {
        const c = col + i, r = row + j, index = r * this.columns + c;
        const x = this.x + c * cell, z = this.z + r * cell;
        vertices.push(x, this.heights[index], z);
        const dx = this.heights[index - Number(c > 0)] - this.heights[index + Number(c + 1 < this.columns)];
        const dz = this.heights[index - (r > 0 ? this.columns : 0)] - this.heights[index + (r + 1 < this.rows ? this.columns : 0)];
        const length = Math.hypot(dx, 2 * cell, dz);
        normals.push(dx / length, 2 * cell / length, dz / length);
        uv.push(c / (this.columns - 1), 1 - r / (this.rows - 1));
        if (i + 1 < width && j + 1 < depth) {
          const a = j * width + i;
          triangles.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
        }
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geometry.setIndex(triangles);
      geometry.computeBoundingSphere();
      yield geometry;
    }
  }
}

export type ScenicSite = { x: number; z: number; y: number; yaw: number; scale: number; distance: number; kind: 'stand' | 'feature' | 'cluster' };

export function scenicSites(plan: Plan, terrain: ScenicTerrain) {
  const sites: ScenicSite[] = [];
  const rng = new Random(`${plan.seed}/trackside`);
  const add = (s: number, side: number, offset: number, kind: ScenicSite['kind'], scale: number) => {
    const n = nodeAt(plan, s);
    const radius = (kind === 'stand' ? 3.35 : 3.05) * scale;
    const direction = n.yaw + side * Math.PI / 2;
    for (const extra of [0, 3.5, 7]) {
      const across = n.half + offset + extra;
      const behind = Math.min(0, s);
      const x = n.x + Math.sin(direction) * across + Math.sin(n.yaw) * behind;
      const z = n.z + Math.cos(direction) * across + Math.cos(n.yaw) * behind;
      const ground = terrain.height(x, z);
      const shelf = kind === 'stand' ? Math.max(ground + .32, n.y - 2.35) : ground + .22;
      const y = terrain.onStartTable(x, z, n.s) ? Math.max(shelf, terrain.startTable.y + .21) : shelf;
      const top = y + 5.0 * scale;
      if (plan.nodes.some(p => p.y + 2.2 >= ground - .6 && p.y - 1.35 <= top &&
        (x - p.x) ** 2 + (z - p.z) ** 2 < (p.half + radius + (plan.modules[p.module].track ? 5.5 : .8)) ** 2)) continue;
      if (sites.some(p => Math.abs(p.y - y) < 10 && (x - p.x) ** 2 + (z - p.z) ** 2 < (radius + p.scale * 3.35 + 1.5) ** 2)) continue;
      sites.push({ x, z, y, scale, kind, distance: n.s, yaw: Math.atan2(n.x - x, n.z - z) + (kind === 'stand' ? 0 : rng.float(-.32, .32)) });
      return;
    }
  };
  // Give the grid and finish first choice of a clear sightline. The chase camera
  // usually looks across the left rail, so lower, farther scenery fills the reverse angle.
  add(-7.8, -1, 4.6, 'stand', .94);
  add(-11.5, 1, -2.2, 'feature', 1.19);
  add(-19, -1, 7.7, 'cluster', 1.24);
  add(plan.length - 7, -1, 5.6, 'stand', 1.07);
  let i = 0;
  for (let s = 12; s < plan.length - 10; s += rng.float(13.5, 18.5)) {
    const kind = i % 4 === 2 ? 'stand' : i % 4 === 1 ? 'cluster' : 'feature';
    add(s, -1, rng.float(4.9, 7.2), kind, rng.float(.89, 1.12));
    if (i % 3 !== 1) add(s + 3, 1, rng.float(8, 12.5), 'cluster', rng.float(.72, 1));
    if (i % 3 === 0) add(s - 6, -1, rng.float(15, 20), 'cluster', rng.float(1.12, 1.4));
    i++;
  }
  return sites;
}
