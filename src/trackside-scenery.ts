import * as T from 'three';
import type { Racer } from './physics';
import { courseVignette, foundation, grandstand, landscapeMap, playmat, roadsideModel, scenicPalette } from './scenery-art';
import { ScenicTerrain, scenicSites } from './scenic-terrain';
import type { ScenicSite } from './scenic-terrain';
import type { Plan } from './track';

type Placement = { matrix: T.Matrix4; bounds: T.Sphere };
type SceneryBatch = { mesh: T.InstancedMesh; placements: Placement[]; drawn: number[]; pose?: T.Mesh };

export class TracksideScenery {
  readonly terrain: ScenicTerrain;
  private readonly paint: ReturnType<typeof scenicPalette>;
  private readonly material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .77, envMapIntensity: .46 });
  private readonly assets: { dispose(): void }[] = [this.material];
  private readonly stands: { mesh: T.Mesh; distance: number; podium: boolean }[] = [];
  private readonly batches: SceneryBatch[] = [];
  private readonly frustum = new T.Frustum();
  private readonly projection = new T.Matrix4();
  private sites: ScenicSite[] = [];

  constructor(private readonly plan: Plan, environment: T.Texture) {
    this.terrain = new ScenicTerrain(plan);
    this.paint = scenicPalette(plan);
    this.material.envMap = environment;
  }

  *buildGround(route: T.Group, podium: T.Group) {
    yield* this.terrain.shape();
    this.sites = scenicSites(this.plan, this.terrain);
    const tile = playmat(this.paint);
    this.assets.push(tile);
    yield;
    const map = landscapeMap(this.plan, this.paint, tile, this.terrain, this.sites);
    const ground = new T.MeshStandardMaterial({ map, roughness: .98, envMap: this.material.envMap, envMapIntensity: .24 });
    const stageFloor = new T.MeshStandardMaterial({ map: tile, roughness: .98, envMap: this.material.envMap, envMapIntensity: .24 });
    this.assets.push(map, ground, stageFloor);
    yield;
    for (const geometry of this.terrain.tiles()) {
      this.assets.push(geometry);
      const mesh = new T.Mesh(geometry, ground);
      mesh.receiveShadow = true;
      route.add(mesh);
      yield;
    }
    const floor = new T.PlaneGeometry(256, 256);
    const uv = floor.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 8);
    this.assets.push(floor);
    const stage = new T.Mesh(floor, stageFloor);
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = -1.2;
    stage.receiveShadow = true;
    podium.add(stage);
  }

  *buildStandsAndModels(route: T.Group, podium: T.Group) {
    const seating = grandstand(this.paint);
    this.assets.push(seating);
    yield;
    const feature = roadsideModel(this.paint, false);
    this.assets.push(feature);
    yield;
    const cluster = roadsideModel(this.paint, true);
    this.assets.push(cluster);
    yield;
    const approach = courseVignette(this.paint, false), exit = courseVignette(this.paint, true);
    this.assets.push(approach, exit);
    yield;
    const trestle = foundation(this.paint, true), bank = foundation(this.paint, false);
    this.assets.push(trestle, bank);
    const pieces = new Map<T.BufferGeometry, Placement[]>();
    const transform = new T.Object3D();
    const place = (geometry: T.BufferGeometry, x: number, y: number, z: number, yaw: number, scale: number, height: number) => {
      transform.position.set(x, y, z);
      transform.rotation.y = yaw;
      transform.scale.set(scale, height, scale);
      transform.updateMatrix();
      const placements = pieces.get(geometry) ?? [];
      placements.push({ matrix: transform.matrix.clone(), bounds: geometry.boundingBox!.clone().applyMatrix4(transform.matrix).getBoundingSphere(new T.Sphere()) });
      pieces.set(geometry, placements);
    };
    for (const site of this.sites) {
      const { x, y, z, kind, scale, yaw, distance } = site;
      const stand = kind === 'stand';
      // Sink the footing below the lowest corner of this patch of hillside.
      const extent = 3.05 * scale;
      const low = this.terrain.onStartTable(x, z, distance) ? this.terrain.startTable.y :
        Math.min(this.terrain.height(x - extent, z), this.terrain.height(x + extent, z), this.terrain.height(x, z - extent), this.terrain.height(x, z + extent));
      const baseY = y - (stand ? .34 : .02) * scale;
      place(stand ? trestle : bank, x, baseY, z, yaw, scale, Math.max(.3, baseY - low + .65));
      if (stand) {
        const mesh = new T.Mesh(seating, this.material);
        mesh.scale.setScalar(scale);
        mesh.rotation.y = yaw;
        mesh.position.set(x, y, z);
        route.add(mesh);
        this.stands.push({ mesh, distance, podium: false });
      } else {
        const fraction = distance / this.plan.length;
        const art = kind === 'cluster' ? cluster : fraction < .33 ? approach : fraction > .68 ? exit : feature;
        place(art, x, y, z, yaw, scale, scale);
      }
    }
    for (const [geometry, placements] of pieces) {
      const mesh = new T.InstancedMesh(geometry, this.material, placements.length);
      const pose = geometry.morphAttributes.position ? new T.Mesh(geometry, this.material) : undefined;
      if (pose) mesh.setMorphAt(0, pose);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      route.add(mesh);
      this.batches.push({ mesh, placements, drawn: [], pose });
    }
    for (const side of [-1, 1]) {
      const seats = new T.Mesh(seating, this.material);
      seats.position.set(side * 5.75, -.77, -4.6);
      seats.rotation.y = -side * .52;
      seats.scale.setScalar(.9);
      podium.add(seats);
      const foot = new T.Mesh(trestle, this.material);
      foot.position.set(seats.position.x, -1.07, seats.position.z);
      foot.rotation.y = seats.rotation.y;
      foot.scale.set(.9, .19, .9);
      podium.add(foot);
      this.stands.push({ mesh: seats, distance: 0, podium: true });
    }
  }

  frameCamera(camera: T.PerspectiveCamera, time: number) {
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    for (const { mesh, placements, drawn, pose } of this.batches) {
      let count = 0, changed = false;
      for (let i = 0; i < placements.length; i++) {
        if (!this.frustum.intersectsSphere(placements[i].bounds)) continue;
        if (drawn[count] !== i) {
          mesh.setMatrixAt(count, placements[i].matrix);
          drawn[count] = i;
          changed = true;
        }
        if (pose) {
          const weights = pose.morphTargetInfluences!;
          for (let j = 0; j < weights.length; j++) weights[j] = .5 + .5 * Math.sin(time * 1.45 + i * 1.72 - j * 1.38);
          mesh.setMorphAt(count, pose);
        }
        count++;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (changed) mesh.instanceMatrix.needsUpdate = true;
      if (pose && count) mesh.morphTexture!.needsUpdate = true;
    }
  }

  cheer(racers: readonly Racer[], time: number, podium: boolean, onGrid: boolean) {
    for (const stand of this.stands) {
      if (stand.podium !== podium) continue;
      let energy = podium ? 1 : onGrid && stand.distance < 3 ? .44 : 0;
      if (!podium && !onGrid) for (const r of racers) {
        if (!r.dnf) energy = Math.max(energy, 1 - T.MathUtils.smoothstep(Math.abs(r.progress.distance - stand.distance), 3, 17));
      }
      const waves = stand.mesh.morphTargetInfluences!;
      for (let i = 0; i < waves.length; i++) waves[i] = energy * (.5 + .5 * Math.sin(time * 5.4 - i * 1.38 + stand.distance * .17));
    }
  }

  dispose() { for (const asset of this.assets) asset.dispose(); }
}
