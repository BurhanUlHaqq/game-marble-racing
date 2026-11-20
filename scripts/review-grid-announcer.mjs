import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const output = 'verification-output/course-review';
const url = 'http://127.0.0.1:4287/?diagnostics=1&session=fresh&seed=postmark-26&track=cedar-creek&raceTarget=60&countdown=3';
const errors = [];

async function gridPage(browser, options) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const phase = () => document.querySelector('#show')?.dataset.phase;
    let outputRms = () => 0;
    const compressor = window.AudioContext.prototype.createDynamicsCompressor;
    window.AudioContext.prototype.createDynamicsCompressor = function () {
      const limiter = compressor.call(this), analyser = this.createAnalyser();
      limiter.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      outputRms = () => {
        analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      };
      return limiter;
    };
    const recordings = new WeakSet();
    const decode = window.BaseAudioContext.prototype.decodeAudioData;
    window.BaseAudioContext.prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args);
      recordings.add(buffer);
      return buffer;
    };
    window.gridCalls = [];
    const start = window.AudioBufferSourceNode.prototype.start;
    window.AudioBufferSourceNode.prototype.start = function (...args) {
      if (recordings.has(this.buffer)) {
        const call = { started: phase(), ended: null, duration: args[2], rms: 0 };
        window.gridCalls.push(call);
        const meter = window.setInterval(() => {
          call.rms = Math.max(call.rms, outputRms());
        }, 40);
        this.addEventListener('ended', () => {
          call.ended = phase();
          window.clearInterval(meter);
        }, { once: true });
      }
      return start.apply(this, args);
    };
    // Keep the selection window and audio on real time, then advance to the next grid.
    const raf = window.requestAnimationFrame.bind(window), clock = window.performance.now.bind(window.performance);
    let last = 0, offset = 0;
    window.performance.now = () => clock() + offset;
    window.requestAnimationFrame = callback => raf(stamp => {
      if (last && stamp > last && phase() !== 'pick_marble') offset += Math.max(0, 100 - (stamp - last));
      last = stamp;
      callback(stamp + offset);
    });
  });
  await page.goto(url + options);
  await page.waitForSelector('.grid-invitation', { timeout: 45000 });
  return page;
}

async function completedCall(page, expected) {
  await page.waitForFunction(() => window.gridCalls[0]?.ended);
  const { calls, take } = await page.evaluate(() => ({
    calls: window.gridCalls, take: window.__zeerush().resources.gridCall,
  }));
  assert.equal(calls.length, 1);
  assert.equal(take, expected);
  assert.equal(calls[0].started, 'pick_marble');
  assert.equal(calls[0].ended, 'pick_marble');
  assert.ok(calls[0].rms > .025);
  return calls[0].duration;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
try {
  const full = await gridPage(browser, '&pick=12&marbles=8');
  for (const [width, height] of [[640, 360], [1920, 1080]]) {
    await full.setViewportSize({ width, height });
    await full.screenshot({ path: output + '/grid-announcement-' + width + '.png' });
  }
  const fullDuration = await completedCall(full, 'full');
  await full.waitForFunction(() => window.__zeerush().round === 2 && window.gridCalls.length >= 2, undefined, { timeout: 90000 });
  assert.equal(await full.evaluate(() => window.gridCalls.length), 2);
  await full.close();
  const quick = await gridPage(browser, '&pick=3&music=0');
  const shortDuration = await completedCall(quick, 'short');
  assert.ok(shortDuration < fullDuration);
  await quick.close();
  const controls = await gridPage(browser, '&pick=20');
  await controls.waitForFunction(() => window.__zeerush().resources.gridSpeaking);
  await controls.keyboard.press('o');
  const voiceSwitch = controls.locator('select[name=announcer]');
  await voiceSwitch.selectOption('false');
  await controls.getByRole('button', { name: 'Apply settings' }).click();
  assert.equal(await controls.evaluate(() => window.__zeerush().resources.gridSpeaking), false);
  await voiceSwitch.selectOption('true');
  await controls.getByRole('button', { name: 'Apply settings' }).click();
  assert.equal(await controls.evaluate(() => window.gridCalls.length), 1);
  await controls.close();
  for (const option of ['announcer=0', 'mute=1']) {
    const quiet = await gridPage(browser, '&pick=3&' + option);
    await quiet.waitForFunction(() => window.__zeerush().phase === 'RACING');
    assert.equal(await quiet.evaluate(() => window.gridCalls.length), 0, option);
    await quiet.close();
  }
  console.log('Full and short cues, repeat rounds, announcer off and master mute passed.');
} finally { await browser.close(); }

const locked = await chromium.launch({ executablePath, args: ['--autoplay-policy=document-user-activation-required', '--enable-unsafe-swiftshader'] });
try {
  const late = await gridPage(locked, '&pick=8');
  await late.waitForFunction(() => document.querySelector('.timer-number')?.textContent === '02');
  assert.equal(await late.evaluate(() => window.gridCalls.length), 0);
  await late.keyboard.press('a');
  await completedCall(late, 'short');
  await late.close();
  const after = await gridPage(locked, '&pick=3');
  await after.waitForSelector('.countdown-big');
  await after.keyboard.press('a');
  await after.waitForFunction(() => window.__zeerush().phase === 'RACING' && window.__zeerush().resources.audioState === 'running');
  assert.equal(await after.evaluate(() => window.gridCalls.length), 0);
  assert.deepEqual(errors, []);
  console.log('Late audio unlock plays only a fitting cue. Countdown unlock skips the expired invitation.');
} finally { await locked.close(); }
