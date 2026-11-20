import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { IDENTITIES, RADIUS, rosterFor } from '../src/identities';
import { CAP, initPhysics, RacePhysics, STEP } from '../src/physics';
import { selectPlan } from '../src/calibration';
import { calibrationDeck } from './calibration-deck';
import { settingsFrom } from '../src/config';
import { planFor, point } from '../src/track';

await initPhysics();
const traces: { grade: number; surface: 'slide'|'wood'|'grit'; samples: {t:number; distance:number; speed:number}[] }[] = [];
for (const grade of [6,12,18]) for (const surface of ['slide','wood','grit'] as const) {
  const plan = calibrationDeck(grade, surface);
  const race = new RacePhysics(plan, IDENTITIES.slice(0,1));
  try {
    race.release();
    const r = race.racers[0], angle = grade * Math.PI / 180;
    r.p = r.previous = point(plan.nodes[1], 0, RADIUS / Math.cos(angle));
    r.body.setTranslation(r.p, true);
    r.progress = { segment:1, check:0, distance:1, best:1, branch:0 };
    r.body.setLinvel({x:0, y:-3 * Math.sin(angle), z:3 * Math.cos(angle)},true);
    r.body.setAngvel({x:3/RADIUS,y:0,z:0},true);
    const samples = [{ t:0, distance:0, speed:3 }];
    for (let tick = 1; tick <= 360; tick++) {
      race.step();
      if (tick % 6 === 0) samples.push({t:tick*STEP, distance:(r.p.z-1)/Math.cos(angle), speed:r.speed});
    }
    assert.equal(r.recoveries,0);
    traces.push({ grade,surface,samples });
  } finally { race.dispose(); }
}
const speed = (grade: number, surface: string) => traces.find(t => t.grade === grade && t.surface === surface)!.samples.at(-1)!.speed;
for (const grade of [6,12,18]) assert.ok(speed(grade,'slide') > speed(grade,'wood') && speed(grade,'wood') > speed(grade,'grit'));
for (const surface of ['slide','wood','grit']) assert.ok(speed(18,surface) > speed(12,surface) && speed(12,surface) > speed(6,surface));
const root = 'verification-output/course-review';
await mkdir(root,{recursive:true});
const liveRuns = [];
for (const track of ['cedar-creek','classic']) {
  const plan = planFor(settingsFrom({track,seed:'postmark-26'}),1);
  const m = plan.modules.find(section => section.speedRun)!;
  const index = m.from + Math.round((m.to-m.from)*.22), n = plan.nodes[index];
  const race = new RacePhysics(plan, IDENTITIES.slice(0,1));
  try {
    race.release();
    const r = race.racers[0];
    r.p = r.previous = point(n,0,RADIUS+.02);
    r.body.setTranslation(r.p,true);
    r.body.setLinvel({x:4*Math.sin(n.yaw),y:-.75,z:4*Math.cos(n.yaw)},true);
    r.body.setAngvel({x:4*Math.cos(n.yaw)/RADIUS,y:0,z:-4*Math.sin(n.yaw)/RADIUS},true);
    r.progress = {segment:index, check:plan.checks.findIndex(i=>i>index)-1, distance:n.s,best:n.s,branch:0};
    const readings = [];
    for (let tick=0; tick<300 && r.progress.segment < m.from + (m.to-m.from)*.54; tick++) {
      race.step();
      readings.push({t:race.elapsed,fraction:(r.progress.distance-plan.nodes[m.from].s)/m.length,speed:r.speed,surface:r.surface});
    }
    const chute = Math.max(...readings.filter(x=>x.fraction>.32 && x.fraction<.42).map(x=>x.speed));
    const exit = readings.at(-1)!;
    assert.ok(chute>4.25 && exit.speed<chute && exit.fraction>.5, track+' '+chute+' '+JSON.stringify(exit));
    liveRuns.push({track,chute,exit,readings});
  } finally { race.dispose(); }
}
await writeFile(root+'/course-speed-traces.json',JSON.stringify(liveRuns));
// Follow the normal eight-marble grid through each generated pitch. Compare the
// same entrant at all three stations and omit crossings interrupted by a rescue.
const plungeSpeeds = [];
for (const track of ['cedar-creek', 'classic']) for (const obstacles of ['standard', 'extra']) {
  const settings = settingsFrom({track, obstacles, marbles:8, seed:'postmark-26'});
  const roster = rosterFor(settings, 1);
  const {plan} = selectPlan(settings, 1, roster);
  const sections = plan.modules.flatMap(m => {
    const base = plan.nodes[m.from].s;
    if (m.dropDegrees) {
      const valley = plan.nodes.slice(m.from, m.from + Math.floor(.86 * (m.to - m.from))).reduce((a,b) => a.y < b.y ? a : b);
      const climb = plan.nodes[m.from + Math.round(.80 * (m.to - m.from))].pitch!;
      return [{name:m.name, downhillDegrees:m.dropDegrees, uphillDegrees:-climb*180/Math.PI,
        stations:[base+.08*m.length, valley.s, base+.94*m.length]}];
    }
    return (m.descents ?? []).map(drop => {
      const start = base + m.length * drop.start, span = m.length * drop.span;
      return {name:m.name, downhillDegrees:Math.atan(drop.downhill)*180/Math.PI, uphillDegrees:Math.atan(drop.uphill)*180/Math.PI,
        stations:[start, start+.65*span, start+.92*span]};
    });
  }).map(section => ({...section, racers:roster.map(() => ({speeds:[] as number[], rescues:-1}))}));
  const race = new RacePhysics(plan,roster);
  try {
    race.release();
    while (race.elapsed < CAP && race.racers.some(r => r.finish === null && !r.dnf)) {
      race.step();
      for (const section of sections) for (const [i,r] of race.racers.entries()) {
        const sample = section.racers[i], station = section.stations[sample.speeds.length];
        if (station === undefined || r.progress.distance < station || r.dnf) continue;
        if (!sample.speeds.length) sample.rescues = r.recoveries;
        if (r.recoveries === sample.rescues) sample.speeds.push(r.speed);
      }
      const first = race.finishers[0]?.finish;
      if (first != null && race.elapsed >= first+settings.grace) break;
    }
    for (const section of sections) {
      const complete = section.racers.filter(r => r.speeds.length === 3);
      assert.ok(complete.length >= 4, `${track} ${obstacles} ${section.name} had ${complete.length} uninterrupted passes`);
      const median = (index:number) => {
        const speeds = complete.map(r => r.speeds[index]).sort((a,b) => a-b);
        return (speeds[Math.floor((speeds.length-1)/2)] + speeds[Math.floor(speeds.length/2)]) / 2;
      };
      const entry = median(0), bottom = median(1), exit = median(2);
      assert.ok(bottom > entry && bottom > exit, track+' '+section.name+' '+[entry,bottom,exit].join('/'));
      plungeSpeeds.push({track, obstacles, seed:plan.seed, section:section.name, entrants:complete.length,
        downhillDegrees:section.downhillDegrees, uphillDegrees:section.uphillDegrees, entry, bottom, exit});
    }
  } finally { race.dispose(); }
}
await writeFile(root+'/plunge-speeds.json',JSON.stringify(plungeSpeeds,null,2));
await writeFile(root+'/incline-traces.json',JSON.stringify(traces));
const colors = {slide:'#6de4dd',wood:'#ffd598',grit:'#f49c91'};
const maximum = Math.max(...traces.map(r => r.samples.at(-1)!.distance));
const lanes = traces.map(({grade,surface,samples}, i) => {
  const x = 18 + 306 * Math.floor(i / 3), y = 119 + (i % 3) * 43;
  const positions = samples.map(s => (x + 51 + 160*s.distance/maximum).toFixed(2));
  return (i % 3 === 0 ? '<text x="'+x+'" y="87" font-size="20">'+grade+'° slope</text>' : '') +
    '<text x="'+x+'" y="'+(y+5)+'" fill="'+colors[surface]+'">'+surface+'</text>'+
    '<path d="M '+(x+50)+' '+y+' h 166" stroke="#91a7aa"/><circle cy="'+y+'" r="6" fill="'+colors[surface]+'">'+
    '<animate attributeName="cx" values="'+positions.join(';')+'" dur="6s" repeatCount="indefinite"/></circle>'+
    '<text x="'+(x+222)+'" y="'+(y+5)+'">'+samples.at(-1)!.speed.toFixed(2)+' m/s</text>';
}).join('');
await writeFile(root+'/incline-replay.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 930 233"><rect width="930" height="233" fill="#142832"/>'+
  '<g fill="white" font-family="Segoe UI, sans-serif" font-size="15"><text x="18" y="28" font-size="22">ZeeRush / Incline replay</text>'+
  '<text x="18" y="53">Shared distance scale · Rolling entry 3.00 m/s · Replay and final speeds at six seconds</text>'+lanes+'</g></svg>');
console.table(traces.map(r=>({angle:r.grade,surface:r.surface, speedAfter6s:r.samples.at(-1)!.speed.toFixed(2)})));
