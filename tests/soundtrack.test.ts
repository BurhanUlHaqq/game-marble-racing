import assert from 'node:assert/strict';
import {test} from 'node:test';
import {broadcastSettings} from '../src/config';
import {Random} from '../src/random';
import {musicMood,MusicRotation} from '../src/soundtrack';

test('broadcast sound starts enabled, URL mute silences it and the score follows each phase',()=>{
  const defaults=broadcastSettings('');
  assert.equal(defaults.mute,false);
  assert.equal(defaults.soundtrack,'library');
  assert.equal(broadcastSettings('?mute=1').mute,true);
  assert.equal(broadcastSettings('?soundtrack=synth').soundtrack,'library');
  assert.deepEqual([musicMood('PICK_MARBLE',false),musicMood('COUNTDOWN',false),musicMood('RACING',false),
    musicMood('RACING',true),musicMood('FINISHING',false),musicMood('RESULTS',false)],['intermission','intermission','race','chase','chase','celebration']);
});

test('seeded music rotation covers a mood before reusing a recording and skips failed assets',()=>{
  const rows=Array.from({length:12},(_,i)=>({id:String(i),title:String(i),mood:'race' as const,file:String(i),integratedLUFS:-19,cueIn:0,cueOut:120}));
  const run=()=>{
    const rotation=new MusicRotation(new Random('repeat'));
    const plays:string[]=[];
    for(let i=0;i<36;i++){
      const track=rotation.choose(rows,'race',new Set(['5']))!;
      assert.ok(!plays.slice(-8).includes(track.id));
      rotation.played(track);
      plays.push(track.id);
    }
    return plays;
  };
  const plays=run();
  assert.deepEqual(plays,run());
  assert.equal(new Set(plays.slice(0,11)).size,11);
  assert.ok(!plays.includes('5'));
});
