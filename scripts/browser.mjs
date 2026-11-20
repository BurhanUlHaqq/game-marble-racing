import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { platform, release } from 'node:os';
import { chromium } from 'playwright-core';

const seconds = Math.max(5, Number(process.argv[2] ?? 1200));
const mode = process.argv[3] ?? 'clean';
const url = process.env.ZEERUSH_CAPTURE_URL ?? 'http://127.0.0.1:4287/';
const exe = [
  process.env.ZEERUSH_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(name => name && existsSync(name));
if (!exe) throw new Error('Set ZEERUSH_CHROME to a Chromium executable.');
const output = `verification-output/browser-${process.env.ZEERUSH_REPORT_TAG ?? mode}`;
await mkdir(output, { recursive: true });
const target = new URL(url);
target.searchParams.set('session', 'fresh');
target.searchParams.set('diagnostics', '1');
if (mode === 'audio') {
  target.searchParams.set('mode', 'operator');
  target.searchParams.set('pick', '5');
  target.searchParams.set('countdown', '3');
  target.searchParams.set('raceTarget', '60');
}
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const viewport = process.env.ZEERUSH_VIEWPORT === '4k' ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 };
const page = await browser.newPage({ viewport });
const errors = [], consoleMessages = [], resources = new Map(), failed = [], audioSamples = [], timeline = [];
const shots = new Set();
page.on('pageerror', error => errors.push(String(error)));
page.on('console', m => { if (['warning', 'error'].includes(m.type()) && consoleMessages.length < 60) consoleMessages.push(m.text()); });
page.on('requestfailed', request => failed.push({ url: request.url(), reason: request.failure()?.errorText }));
page.on('response', r => resources.set(r.url(), r.status()));
if (mode === 'audio') {
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
      const compressor = create.call(this);
      const analyser = this.createAnalyser();
      compressor.connect(analyser);
      compressor.connect = (destination, ...channels) => analyser.connect(destination, ...channels);
      globalThis.zeerushAnalysis = () => {
        const values = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(values);
        return { peak: Math.max(...values.map(Math.abs)), rms: Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length) };
      };
      return compressor;
    };
  });
}

let first, last, graphics, stopped, launchError;
const start = Date.now();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let previous;
let selectedAudio = 'balanced';
let resizeTest;
let restored;
let rosterChange;
try {
  await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.locator('#show[data-phase=prepare]').isVisible()) {
    await page.screenshot({ path: `${output}/prepare.png`, timeout: 10000 });
    shots.add('prepare');
  }
  await page.waitForFunction(() => window.__zeerush?.().phase === 'PICK_MARBLE', undefined, { timeout: 30000 });
  first = await page.evaluate(() => window.__zeerush());
  graphics = await page.evaluate(() => {
    const canvas = document.querySelector('.world canvas');
    const gl = canvas.getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), agent: navigator.userAgent };
  });
  if (mode === 'audio') {
    await page.getByRole('button', { name: 'Enable audio', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 3840, height: 2160 });
    await pause(500);
    resizeTest = await page.evaluate(() => {
      const width = document.querySelector('#show').clientWidth;
      const height = document.querySelector('#show').clientHeight;
      return { width, height, ...window.__zeerush().resources };
    });
    await page.setViewportSize(viewport);
  }
  while (Date.now() - start < seconds * 1000) {
    last = await page.evaluate(() => window.__zeerush());
    const signature = `${last.round}/${last.phase}`;
    if (previous !== signature) {
      previous = signature;
      timeline.push({
        wallSeconds: (Date.now() - start) / 1000, phase: last.phase, round: last.round,
        seed: last.seed, raceSeconds: last.elapsed, theme: last.theme, timing: last.timing, resources: last.resources,
      });
      console.log([last.round, last.phase, last.seed, last.timing.fps.toFixed(1), last.elapsed?.toFixed(2)].join(' '));
    }
    if (mode === 'audio') {
      const time = (Date.now() - start) / 1000;
      if (selectedAudio === 'balanced' && time > 29) {
        const before = last.racers.length;
        await page.keyboard.press('o');
        await page.locator('select[name=audio]').selectOption('asmr');
        await page.locator('input[name=marbles]').fill('8');
        await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
        await page.keyboard.press('Escape');
        rosterChange = { before, inFlight: await page.evaluate(() => window.__zeerush().racers.length) };
        selectedAudio = 'asmr';
      }
      if (rosterChange && last.round === 2) rosterChange.nextGrid = last.racers.length;
      audioSamples.push({ t: time, preset: selectedAudio, phase: last.phase, ...await page.evaluate(() => globalThis.zeerushAnalysis?.()) });
    }
    if (mode === 'restore' && !restored && last.phase === 'RACING') {
      await page.evaluate(() => {
        const ext = document.querySelector('.world canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
        if (!ext) return;
        ext.loseContext();
        setTimeout(() => ext.restoreContext(), 600);
      });
      restored = true;
    }
    const lead = last.racers?.[0];
    const completed = last.racers?.filter(r => r.time !== null);
    const close = completed?.length > 1 && completed[1].time - completed[0].time < 0.24;
    const racing = last.phase === 'RACING' || last.phase === 'FINISHING';
    const names = [
      last.phase === 'PREPARE' && 'prepare',
      last.phase === 'PICK_MARBLE' && last.phaseTime > 0.35 && `grid-${last.theme}`,
      last.phase === 'COUNTDOWN' && last.phaseTime > 0.5 && 'countdown',
      last.phase === 'RACING' && last.elapsed > 5 && `race-${last.theme}`,
      last.phase === 'FINISHING' && 'finishing',
      last.phase === 'CELEBRATION' && last.phaseTime > 2.1 && 'podium',
      last.phase === 'RESULTS' && last.phaseTime > 0.25 && 'results',
      last.phase === 'NEXT_ROUND' && 'next-round',
      racing && last.plan?.section === 'split' && 'split-merge',
      racing && last.plan?.section === 'helix' && 'helix',
      racing && last.recoveries?.length && last.elapsed - last.recoveries.at(-1).time < 2 && 'recovery',
      racing && close && 'close-finish',
      racing && lead?.distance > 10 && await page.locator('.callout').textContent().then(t => t?.includes('lead') || t?.includes('places')) && 'overtake',
    ].filter(Boolean);
    for (const name of names) {
      if (shots.has(name)) continue;
      shots.add(name);
      await page.screenshot({ path: `${output}/${name}.png`, timeout: 20000 }).catch(error => errors.push(`Screenshot ${name}: ${error.message}`));
    }
    await pause(mode === 'audio' ? 200 : 400);
  }
  stopped = Date.now();
} catch (error) {
  launchError = String(error);
  console.error(launchError);
} finally {
  const version = browser.version();
  await browser.close();
  const report = {
    url: target.href, seconds: ((stopped ?? Date.now()) - start) / 1000,
    environment: { os: platform(), release: release(), node: process.version, version, ...graphics }, viewport,
    launchError, first, last, timeline, errors, consoleMessages, requestsFailed: failed, requests: [...resources],
    screenshots: [...shots], resizeTest, rosterChange, audioSamples,
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Saved ${output}/report.json`);
  if (launchError || errors.length || failed.length || [...resources].some(([url, status]) => new URL(url).origin !== target.origin || status >= 400)) {
    process.exitCode = 1;
  }
  if (mode === 'clean' && seconds >= 1200 && last?.completed < 4) process.exitCode = 1;
  if (mode === 'restore' && (last?.contextLosses !== 1 || last?.contextRestores !== 1 || last.elapsed < 2)) process.exitCode = 1;
  if (mode === 'audio' && (resizeTest?.width !== 3840 || resizeTest.height !== 2160 || rosterChange?.inFlight !== 6 || rosterChange.nextGrid !== 8
    || !audioSamples.some(s => s.rms > 0.003 && s.preset === 'balanced')
    || !audioSamples.some(s => s.rms > 0.003 && s.preset === 'asmr') || audioSamples.some(s => s.peak > 1))) process.exitCode = 1;
}
