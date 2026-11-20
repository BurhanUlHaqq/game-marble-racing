import type { ColliderGeometry, Device, Plan, Sample, Surface } from '../src/track';

// A surveyed, straight test deck with the same floor triangles, ball and solver as a live race.
export function calibrationDeck(degrees: number, surface: Surface, devices: Device[] = []): Plan {
  const slope = Math.tan(degrees * Math.PI / 180), length = 96, half = 5;
  const nodes: Sample[] = Array.from({length: length + 1}, (_, i) => ({
    x: 0, y: 8 - i * slope, z: i, half, yaw: 0, bank: 0, module: 0, s: i, t: i / length,
  }));
  const floor: ColliderGeometry = {points: [], triangles: []}, rails: ColliderGeometry = {points: [], triangles: []};
  for (const n of nodes) {
    floor.points.push(-half,n.y,n.z, half,n.y,n.z);
    rails.points.push(-half,n.y,n.z,-half,n.y+1,n.z,half,n.y,n.z,half,n.y+1,n.z);
    if (n.s === length) continue;
    const a = n.s * 2, b = n.s * 4;
    floor.triangles.push(a,a+2,a+3,a,a+3,a+1);
    rails.triangles.push(b,b+1,b+5,b,b+5,b+4,b+2,b+6,b+7,b+2,b+7,b+3);
  }
  return { seed: 'calibration', theme: 'workshop', level: 'standard', nodes, checks: nodes.filter(n => n.s % 4 === 0).map(n => n.s),
    finish: length, length, gradeFactor: 1, signature: 'calibration', finalSection: length - 4,
    modules: [{kind:'start', name:'Calibration deck', surface, from:0, to:length, length, floor, rails, devices, gap:null, lean:1}] };
}
