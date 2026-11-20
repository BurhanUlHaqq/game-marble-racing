import * as T from 'three';
import { gridThrows, heldMarble, HOLD_ANGLE, HOST_SCALE, SHOULDER, throwingArm } from './grid-launch';
import type { GridThrow } from './grid-launch';
import type { Identity } from './identities';
import { Random } from './random';
import { GRID_ANIMALS, throwerModel } from './scenery-art';
import type { Plan } from './track';

export class GridCrew {
  readonly group = new T.Group();
  private readonly material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .66 });
  private throws: GridThrow[] = [];
  private readonly arms: T.Mesh[] = [];

  *build(plan: Plan, roster: readonly Identity[]) {
    const animals = new Random(plan.seed + '/grid-crew').shuffle(GRID_ANIMALS);
    this.throws = gridThrows(plan, roster.length);
    for (const [lane, host] of this.throws.entries()) {
      const model = throwerModel(animals[lane], roster[lane].color);
      const body = new T.Mesh(model.body, this.material), arm = new T.Mesh(model.arm, this.material);
      body.name = animals[lane];
      body.position.copy(host.stand);
      body.rotation.y = host.yaw;
      body.scale.setScalar(HOST_SCALE);
      arm.position.copy(SHOULDER);
      arm.rotation.x = HOLD_ANGLE;
      body.castShadow = arm.castShadow = true;
      body.add(arm);
      this.group.add(body);
      this.arms.push(arm);
      yield;
    }
  }

  pose(timeFromGo: number) {
    for (let lane = 0; lane < this.arms.length; lane++) {
      this.arms[lane].rotation.x = throwingArm(this.throws[lane], timeFromGo);
    }
  }

  ball(lane: number, out: T.Vector3) {
    heldMarble(this.throws[lane], this.arms[lane].rotation.x, out);
  }

  dispose() {
    this.group.traverse(part => { if (part instanceof T.Mesh) part.geometry.dispose(); });
    this.material.dispose();
  }
}
