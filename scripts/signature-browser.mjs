import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { URLSearchParams } from 'node:url';
import { chromium } from 'playwright-core';

const trackIds = ['paper-moon', 'cedar-creek', 'bellflower', 'clockmaker', 'aurora', 'cloud-quilt',
  'truck-art', 'fossil-canyon', 'prism-aquarium', 'midnight-record'];
const tracks = process.argv.slice(2).filter(track => trackIds.includes(track));
const all = tracks.length ? tracks : trackIds;
const base = process.env.ZEERUSH_CAPTURE_URL ?? 'http://127.0.0.1:4287/';
const captureSeeds = { 'paper-moon': 'switchback-71', bellflower: 'parcel-19', 'cloud-quilt': 'nightshift-43',
  'fossil-canyon': 'switchback-71', 'prism-aquarium': 'blue-hour-57' };
const output = 'verification-output/signature-browser';
const executablePath = [process.env.ZEERUSH_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
if (!executablePath) throw new Error('Set ZEERUSH_CHROME to a Chromium executable.');
await mkdir(output, { recursive: true });
const broadcast = { width: 1920, height: 1080 };
const phone = { width: 640, height: 360 };
const browser = await chromium.launch({ executablePath, headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function capture(track) {
  const page = await browser.newPage({ viewport: broadcast });
  const url = new URL(base);
  const seed = process.env.ZEERUSH_SAMPLE_SEED ?? captureSeeds[track] ?? 'postmark-26';
  url.search = new URLSearchParams({ track, seed, marbles: '6', session: 'fresh', diagnostics: '1', mode: 'operator' });
  const errors = [];
  const surfaces = new Set();
  const samples = [];
  const screenshots = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const now = globalThis.performance.now.bind(globalThis.performance);
    const raf = globalThis.requestAnimationFrame.bind(globalThis);
    let offset = 0, lastTime = 0;
    globalThis.qaFrameMs = 1000 / 60;
    globalThis.performance.now = () => now() + offset;
    globalThis.requestAnimationFrame = callback => raf(stamp => {
      if (lastTime && stamp > lastTime) offset += globalThis.qaFrameMs - (stamp - lastTime);
      if (stamp > lastTime) lastTime = stamp;
      callback(stamp + offset);
    });
    const create = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
      const compressor = create.call(this);
      const analyser = this.createAnalyser();
      compressor.connect(analyser);
      compressor.connect = (destination, ...channels) => analyser.connect(destination, ...channels);
      const buffer = new Float32Array(analyser.fftSize);
      globalThis.qaSignal = () => {
        analyser.getFloatTimeDomainData(buffer);
        const peak = Math.max(...buffer.map(Math.abs));
        const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
        return { peak, rms };
      };
      return compressor;
    };
  });

  const snapshot = () => page.evaluate(() => ({ ...window.__zeerush(), signal: globalThis.qaSignal?.() }));
  async function shot(name) {
    await page.evaluate(() => { globalThis.qaFrameMs = .5; });
    for (const [label, viewport] of [['1080p', broadcast], ['phone', phone]]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
      const filename = `${output}/${track}-${name}-${label}.png`;
      await page.screenshot({ path: filename, timeout: 20000 });
      screenshots.push(filename);
    }
    await page.setViewportSize(broadcast);
    await page.evaluate(() => { globalThis.qaFrameMs = 1000 / 9; });
  }

  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__zeerush?.().phase === 'PICK_MARBLE', undefined, { timeout: 30000 });
    await page.getByRole('button', { name: 'Enable audio', exact: true }).click();
    await page.keyboard.press('Escape');
    const lineup = await snapshot();
    await page.evaluate(() => { globalThis.qaFrameMs = 1000 / 9; });
    let current = lineup;
    let seen = 0;
    const started = Date.now();
    while (Date.now() - started < 180_000 && !['CELEBRATION', 'RESULTS'].includes(current.phase)) {
      current = await snapshot();
      for (const racer of current.racers ?? []) if (racer.grounded && racer.speed > 1) surfaces.add(racer.surface);
      if (current.signal && current.elapsed > 0) samples.push({ elapsed: current.elapsed, section: current.plan?.section,
        ...current.signal, impacts: current.impacts });
      if (seen === 0 && current.plan?.section === 'signature') {
        const mark = current.racers[0].distance;
        await page.waitForFunction(start => window.__zeerush().racers[0].distance > start + 34, mark, { timeout: 25000 });
        await shot('landmark');
        seen++;
      }
      if (seen === 1 && ['RACING', 'FINISHING'].includes(current.phase) && current.plan.length - current.racers[0].distance < 22) {
        await page.waitForFunction(() => {
          const state = window.__zeerush();
          if (!['RACING', 'FINISHING'].includes(state.phase) || state.plan.length - state.racers[0].distance >= 3.6) return false;
          globalThis.qaFrameMs = .5;
          return true;
        }, undefined, { timeout: 20000 });
        await shot('finish');
        seen++;
      }
      await page.waitForTimeout(98);
    }
    await page.waitForFunction(() => window.__zeerush().phaseTime > 1.28, undefined, { timeout: 15000 });
    await shot('podium');
    const final = await snapshot();
    if (screenshots.length !== 6 || !final.racers.some(r => r.time !== null) || errors.length) {
      throw new Error(`${track}: ${screenshots.length} captures, phase ${final.phase}, errors ${errors.join(', ')}`);
    }
    const result = { track, url: url.href, seed: lineup.seed, lineup: lineup.racers.map(r => r.id),
      screenshots, surfaces: [...surfaces], audioState: final.resources.audioState, samples,
      impactTotals: final.impacts,
      finishers: final.racers.filter(r => r.time !== null).map(r => ({ id: r.id, time: r.time })),
      errors, finalPhase: final.phase };
    await writeFile(`${output}/${track}.json`, JSON.stringify(result, null, 2));
    console.log(`${track} / ${lineup.seed} / ${result.finishers.length} finishers / ${samples.length} audio samples`);
  } finally { await page.close(); }
}

try {
  const workers = Math.min(all.length, Number(process.env.ZEERUSH_BROWSER_WORKERS ?? 2));
  await Promise.all(Array.from({ length: workers }, async (_, worker) => {
    for (let i = worker; i < all.length; i += workers) {
      try { await capture(all[i]); } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
    }
  }));
} finally { await browser.close(); }
