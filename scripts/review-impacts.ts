import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { IDENTITIES, RADIUS } from '../src/identities';
import { initPhysics, RacePhysics } from '../src/physics';
import type { Device, V3 } from '../src/track';
import { calibrationDeck } from './calibration-deck';

await initPhysics();
type Motion = {v:V3; w:V3; energy:number};
type Components = {normal:number; tangent:number};
const rows: {kind:Device['kind']; speed:number; glancing:boolean; time:number; incoming:Components; outgoing:Components;
  before:Motion; after:Motion; memberVelocity:V3}[] = [];
const dot = (a:V3,b:V3) => a.x*b.x+a.y*b.y+a.z*b.z;
for (const kind of ['cushion','divider','paddle'] as const) for (const speed of [3,6,9]) for (const glancing of [false,true]) {
  const d: Device = {kind,p:{x:0,y:8+RADIUS,z:10},size:kind==='cushion'?{x:1.04,y:1.04,z:1.04}:{x:2.4,y:.7,z:.25},
    phase:0,yaw:0,grade:0,s:10,surface:kind==='cushion'?'rubber':'wood'};
  const race = new RacePhysics(calibrationDeck(0,'wood',[d]),IDENTITIES.slice(0,1));
  try {
    race.release();
    const r = race.racers[0], angle = glancing ? .48 : 0;
    const vx = speed*Math.sin(angle), vz=speed*Math.cos(angle);
    r.p=r.previous={x:glancing?-.48:0,y:8+RADIUS,z:8.65};
    r.body.setTranslation(r.p,true);
    r.body.setLinvel({x:vx,y:0,z:vz},true);
    r.body.setAngvel({x:vz/RADIUS,y:0,z:-vx/RADIUS},true);
    r.progress={segment:8,check:2,distance:r.p.z,best:r.p.z,branch:0};
    const state = () => {
      const v=r.body.linvel(), w=r.body.angvel();
      return {v:{...v},w:{...w},energy:.5*dot(v,v)+.2*RADIUS**2*dot(w,w)+9.81*(r.p.y-8)};
    };
    let found=false;
    for(let tick=0;tick<90 && !found;tick++) {
      const before=state();
      race.step();
      const after=state();
      race.world.contactPairsWith(r.collider,c=>{
        const member=c.parent();
        if (!member || found) return;
        race.world.contactPair(r.collider,c,(m,flipped)=>{
          if(found || !m.numSolverContacts() || !Array.from({length:m.numContacts()},(_,i)=>m.contactImpulse(i)).some(n=>n>.01)) return;
          const raw=m.normal(),sign=flipped?1:-1;
          const n={x:raw.x*sign,y:raw.y*sign,z:raw.z*sign};
          const memberVelocity=member.velocityAtPoint(m.solverContactPoint(0));
          const components=(v:V3)=>{
            const rel={x:v.x-memberVelocity.x,y:v.y-memberVelocity.y,z:v.z-memberVelocity.z};
            const normal=dot(rel,n);
            return {normal,tangent:Math.sqrt(Math.max(0,dot(rel,rel)-normal**2))};
          };
          const incoming=components(before.v), outgoing=components(after.v);
          assert.ok(incoming.normal<0 && outgoing.normal>incoming.normal);
          if(kind!=='paddle') assert.ok(after.energy <= before.energy+.002,kind+' added energy');
          rows.push({kind,speed,glancing,time:race.elapsed,incoming,outgoing,before,after,memberVelocity});
          found=true;
        });
      });
    }
    assert.ok(found, kind+' missed at '+speed);
  } finally { race.dispose(); }
}
const root='verification-output/course-review';
await mkdir(root,{recursive:true});
await writeFile(root+'/impact-traces.json',JSON.stringify(rows,null,2));
console.log(rows.length+' real impacts, '+rows.filter(r=>r.kind!=='paddle').length+' passive energy checks');

