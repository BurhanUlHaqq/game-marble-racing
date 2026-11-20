import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {musicMood,Soundtrack} from '../src/soundtrack';
import type {Phase} from '../src/lifecycle';

const rows: {id:string;title:string;file:string;duration:number;integratedLUFS:number;cueIn:number}[] = JSON.parse(await readFile('public/music/catalog.json','utf8'));
const byFile = new Map(rows.map(r=>[r.file,r]));
const byTitle = new Map(rows.map(r=>[r.title,r]));
const media: ClockedMedia[] = [];
class ClockedMedia {
  static HAVE_FUTURE_DATA = 3;
  currentTime=0; duration=0; paused=true; ended=false; readyState=0; src=''; error=null;
  constructor(){media.push(this);}
  load(){this.currentTime=0; this.ended=false; this.paused=true; this.readyState=this.src?4:0;
    this.duration=byFile.get(this.src.split('/').at(-1)!)?.duration??0; }
  async play(){this.paused=false;}
  pause(){this.paused=true;}
  removeAttribute(){this.src='';}
  advance(dt:number){ if(!this.paused){this.currentTime+=dt;if(this.currentTime>=this.duration){this.ended=true;this.paused=true;}} }
}
let interval: (()=>void)|undefined;
const win={setInterval:(fn:()=>void)=>{interval=fn;return 1;},clearInterval:()=>{interval=undefined;}};
for(const [name,value] of Object.entries({window:win,document:{baseURI:'http://localhost/'},Audio:ClockedMedia,HTMLMediaElement:ClockedMedia,
  fetch:async()=>({ok:true,json:async()=>rows})})) Object.defineProperty(globalThis,name,{configurable:true,value});
const node=()=>({connect(){return this;},disconnect(){},gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},cancelAndHoldAtTime(){},cancelScheduledValues(){}}});
const ctx={currentTime:0,state:'running',createGain:node,createMediaElementSource:node};
const history: {at:number;file:string;mood:string;trim:number;cueIn:number}[]=[];
const director=new Soundtrack(ctx as unknown as AudioContext,node() as unknown as AudioNode,'broadcast-soak',()=>{
  const r=director.resources(), row=byTitle.get(r.musicTitle??'');
  if(row && r.musicMood) history.push({at:ctx.currentTime,file:row.file,mood:r.musicMood,cueIn:row.cueIn,trim:Math.min(1.18,Math.pow(10,(-19-row.integratedLUFS)/20))});
});
let peakLoaded=0,peakPlaying=0,empty=0,round=0;
async function advance(phase:Phase,duration:number,chase=false){
  if (ctx.currentTime>7199.999) return;
  director.configure(true,musicMood(phase,chase));
  const end=Math.min(7200,ctx.currentTime+duration);
  while(ctx.currentTime<end-1e-7){
    const dt=Math.min(.18,end-ctx.currentTime);
    ctx.currentTime+=dt;
    for(const d of media)d.advance(dt);
    interval?.();
    await Promise.resolve();
    const r=director.resources();
    peakLoaded=Math.max(peakLoaded,r.mediaLoaded); peakPlaying=Math.max(peakPlaying,r.mediaPlaying);
    if(ctx.currentTime>2 && r.mediaPlaying===0)empty+=dt;
  }
}
while(ctx.currentTime<7199.99){
  round++;
  await advance('PICK_MARBLE',round%14===0?295:12);
  await advance('COUNTDOWN',5);await advance('RACING',round%7===0?135:77);await advance('RACING',24,true);
  await advance('FINISHING',8);await advance('CELEBRATION',8);await advance('RESULTS',5);
}
const unique=new Set(history.map(h=>h.file)).size;
assert.equal(peakLoaded,2);assert.equal(peakPlaying,2);assert.ok(empty<.5);assert.equal(unique,56);
assert.ok(history.every((h,i)=>i===0 || h.file!==history[i-1].file));
const report={seconds:ctx.currentTime,rounds:round,transitions:history.length,unique,peakLoaded,peakPlaying,empty,history};
await writeFile('verification-output/course-review/broadcast-schedule.json',JSON.stringify(report,null,2));
console.log({...report,history:undefined});
director.dispose();assert.ok(media.every(d=>d.paused&&!d.src));

