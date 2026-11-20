import * as T from 'three';
import { ease, ELBOW, gridThrows, heldMarble, HIP, HOST_SCALE, neutralThrow, PAW, SHOULDER, throwPose } from './grid-launch';
import type { GridThrow, ThrowPose } from './grid-launch';
import { RADIUS } from './identities';
import type { Identity } from './identities';
import type { Racer } from './physics';
import { Random } from './random';
import { GRID_ANIMALS, throwerModel } from './scenery-art';
import type { Plan } from './track';

type Host = {
  launch: GridThrow; pose: ThrowPose; mesh: T.SkinnedMesh; feet: T.Bone; body: T.Bone; head: T.Bone;
  balance: T.Bone; upper: T.Bone; elbow: T.Bone; palm: T.Bone; hop: boolean; wave: boolean;
};
function joint(name: string, parent: T.Bone | undefined, x: number, y: number, z: number) {
  const bone = new T.Bone();
  bone.name = name;
  bone.position.set(x, y, z);
  parent?.add(bone);
  return bone;
}

export class GridCrew {
  readonly group = new T.Group();
  private readonly material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .66 });
  private readonly cast: Host[] = [];
  private readonly axis = new T.Vector3();

  *build(plan: Plan, roster: readonly Identity[]) {
    const animals = new Random(plan.seed + '/grid-crew').shuffle(GRID_ANIMALS);
    for (const [lane, launch] of gridThrows(plan, roster.length).entries()) {
      const animal = animals[lane], mesh = new T.SkinnedMesh(throwerModel(animal, roster[lane].color), this.material);
      const feet = joint('Feet', undefined, 0, 0, 0), body = joint('Hips', feet, 0, HIP, 0);
      const head = joint('Head', body, 0, 1.03 - HIP, 0);
      const balance = joint('Free paw', body, -.36, .88 - HIP, .06);
      const upper = joint('Throwing shoulder', body, SHOULDER.x, SHOULDER.y - HIP, SHOULDER.z);
      const elbow = joint('Elbow', upper, ELBOW.x, ELBOW.y, ELBOW.z);
      const palm = joint('Palm', elbow, PAW.x, PAW.y, PAW.z);
      mesh.add(feet);
      mesh.bind(new T.Skeleton([feet, body, head, balance, upper, elbow, palm]));
      mesh.name = animal;
      mesh.position.copy(launch.stand);
      mesh.rotation.y = launch.yaw;
      mesh.scale.set(HOST_SCALE * launch.hand, HOST_SCALE, HOST_SCALE);
      mesh.castShadow = true;
      mesh.boundingSphere = new T.Sphere(new T.Vector3(0, 1.08, .05), 1.6);
      this.group.add(mesh);
      this.cast.push({ launch, mesh, pose: neutralThrow(), feet, body, head, balance, upper, elbow, palm,
        hop: animal === 'rabbit' || animal === 'frog', wave: animal === 'koala' || animal === 'panda' || animal === 'bear' });
      yield;
    }
    this.pose(-Infinity, 0);
  }

  pose(t: number, clock = 0, racers?: readonly Racer[]) {
    for (const [lane, c] of this.cast.entries()) {
      const h = c.launch, p = throwPose(h, t, c.pose), racer = racers?.[lane];
      c.body.position.set(0, HIP + p.lift, p.shift);
      c.body.rotation.x = p.lean;
      c.upper.rotation.x = p.arm - p.lean;
      c.elbow.rotation.x = p.elbow;
      c.palm.rotation.x = -p.arm - p.elbow;
      const idle = 1 - ease((t + h.prepare + .45) / .45);
      const beat = clock * (2.2 + h.flair) + h.flair * 17;
      const landing = racer?.firstLanding === undefined ? -1 : (t - racer.firstLanding - .09 - .10 * h.flair) / .62;
      const cheer = landing > 0 && landing < 1 ? Math.sin(Math.PI * landing) ** 2 : 0;
      let lookUp = 0, lookSide = 0;
      if (racer && t >= 0) {
        const dx = racer.p.x - h.stand.x, dz = racer.p.z - h.stand.z;
        const across = dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw);
        const forward = dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw);
        const follow = ease(t / .22);
        lookUp = follow * T.MathUtils.clamp(Math.atan2(racer.p.y - h.stand.y - 1.15, Math.max(.55, Math.hypot(dx, dz))), -.38, .50);
        lookSide = follow * h.hand * T.MathUtils.clamp(Math.atan2(across, Math.max(.65, forward)), -.6, .6);
      }
      c.head.rotation.set(.16 * p.load - .55 * p.lean - lookUp + idle * .055 * Math.sin(beat),
        idle * .23 * Math.sin(.57 * beat) + lookSide, idle * .07 * Math.cos(beat) - .10 * p.load, 'YXZ');
      const freePaw = c.wave ? .95 + .42 * Math.sin(beat) : .15 + .14 * Math.sin(beat);
      c.balance.rotation.set(-.18 + .60 * p.load - .83 * p.drive - .60 * cheer, 0,
        -.12 - idle * freePaw - .70 * p.load - (c.hop ? .72 : 1.65) * cheer);
      c.feet.position.y = c.hop ? .23 * cheer : 0;
    }
  }

  ball(lane: number, out: T.Vector3, rotation?: T.Quaternion) {
    const {launch, pose} = this.cast[lane];
    heldMarble(launch, pose, out);
    if (rotation) rotation.setFromAxisAngle(this.axis.set(Math.cos(launch.yaw), 0, -Math.sin(launch.yaw)), HOST_SCALE * pose.roll / RADIUS);
  }

  dispose() {
    for (const {mesh} of this.cast) { mesh.skeleton.dispose(); mesh.geometry.dispose(); }
    this.material.dispose();
  }
}
