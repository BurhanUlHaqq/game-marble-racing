import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const root='verification-output/course-review/';
const url='http://127.0.0.1:4287/?diagnostics=1&session=fresh&track=cedar-creek&seed=postmark-26&pick=6&countdown=3&raceTarget=60';
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:640,height:360}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const start=window.AudioBufferSourceNode.prototype.start;
    window.AudioBufferSourceNode.prototype.start=function(...args){
      if(this.loop && this.buffer?.numberOfChannels===1 && !window.rollingTaps){
        const samples=this.buffer.getChannelData(0);
        let silent=0, run=0, longest=0;
        for(const value of samples){
          if(Math.abs(value)<1e-7){ silent++; run=0; }
          else { run++; longest=Math.max(longest,run); }
        }
        window.rollingTaps={silentFraction:silent/samples.length, longestTap:longest/this.buffer.sampleRate};
      }
      return start.apply(this,args);
    };
    const makeCompressor=window.AudioContext.prototype.createDynamicsCompressor;
    window.AudioContext.prototype.createDynamicsCompressor=function(){
      const compressor=makeCompressor.call(this), probe=this.createAnalyser();
      probe.fftSize=2048;
      compressor.connect(probe);
      const pcm=new Float32Array(probe.fftSize);
      window.outputRMS=()=>{
        probe.getFloatTimeDomainData(pcm);
        return Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);
      };
      return compressor;
    };
    const raf=window.requestAnimationFrame.bind(window), now=window.performance.now.bind(window.performance);
    let last=0, offset=0;
    window.performance.now=()=>now()+offset;
    window.requestAnimationFrame=cb=>raf(stamp=>{
      if(last && stamp>last) offset+=85-(stamp-last);
      if(stamp>last) last=stamp;
      cb(stamp+offset);
    });
  });
  await page.goto(url);
  await page.keyboard.press('a');
  const seen=[];
  for(const mood of ['intermission','race','chase','celebration']){
    await page.waitForFunction(m=>window.__zeerush?.().resources.musicMood===m && window.outputRMS?.()>.001,mood,{timeout:100000});
    const s=await page.evaluate(()=>window.__zeerush().resources);
    assert.equal(s.musicSource,'library');
    assert.ok(s.mediaLoaded<=2 && s.mediaPlaying>=1 && s.mediaPlaying<=2);
    seen.push({...s,outputRMS:await page.evaluate(()=>window.outputRMS())});
  }
  await page.locator('.settings-toggle').click();
  const download=page.waitForEvent('download');
  await page.locator('.export-credits').click();
  const file=await download;
  const credits=await readFile(await file.path(),'utf8');
  for(const s of seen) assert.ok(credits.includes(s.musicTitle));
  await page.locator('select[name=soundtrack]').selectOption('synth');
  await page.getByRole('button',{name:'Apply settings'}).click();
  await page.waitForFunction(()=>window.__zeerush().resources.musicSource==='synth' && window.__zeerush().resources.mediaLoaded===0);
  await page.locator('select[name=audio]').selectOption('asmr');
  await page.locator('select[name=soundtrack]').selectOption('library');
  await page.getByRole('button',{name:'Apply settings'}).click();
  await page.waitForFunction(()=>window.__zeerush().resources.musicSource==='library');
  await page.locator('select[name=mute]').selectOption('true');
  await page.getByRole('button',{name:'Apply settings'}).click();
  await page.waitForFunction(()=>window.__zeerush().resources.mediaPlaying===0 && window.__zeerush().resources.mediaLoaded===0 && window.outputRMS()<.0003);
  const fallback=await browser.newPage({viewport:{width:640,height:360}});
  fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.route('**/music/*.ogg',route=>route.abort());
  await fallback.goto(url);
  await fallback.keyboard.press('a');
  await fallback.waitForFunction(()=>window.__zeerush?.().resources.musicFailures>1 && window.__zeerush().resources.tracks>=1 &&
    window.__zeerush().resources.audioState==='running',undefined,{timeout:35000});
  const failure=await fallback.evaluate(()=>window.__zeerush().resources);
  assert.equal(failure.musicSource,'synth');
  const rollingTaps=await page.evaluate(()=>window.rollingTaps);
  assert.ok(rollingTaps.silentFraction>.85 && rollingTaps.silentFraction<1 && rollingTaps.longestTap<.04,
    'Rolling contact should sound in short taps with silence between them');
  await fallback.unroute('**/music/*.ogg');
  await fallback.waitForFunction(()=>window.__zeerush().resources.musicSource==='library',undefined,{timeout:50000});
  assert.deepEqual(errors,[]);
  await writeFile(root+'browser-music.json',JSON.stringify({seen,credits,failure,rollingTaps,errors},null,2));
  console.log('Four live moods; played credits, ASMR, mute, synth and missing-asset fallback passed');
} finally { await browser.close(); }

