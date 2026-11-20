import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const [stage = 'bridge', track = 'cedar-creek', entrants = '8'] = process.argv.slice(2);
const root = 'verification-output/course-review';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({viewport: {width: 640, height: 360}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), now = window.performance.now.bind(window.performance);
    let last = 0, offset = 0;
    window.reviewStep = 105;
    window.performance.now = () => now() + offset;
    window.requestAnimationFrame = cb => raf(stamp => {
      if (last && stamp > last) offset += window.reviewStep - (stamp - last);
      if (stamp > last) last = stamp;
      cb(stamp + offset);
    });
  });
  await page.goto('http://127.0.0.1:4287/?seed=postmark-26&track=' + track + '&marbles=' + entrants + '&raceTarget=60&pick=3&countdown=3&session=fresh&diagnostics=1');
  await page.waitForFunction(stage => {
    const state = window.__zeerush?.();
    if (stage === 'grid-hold' || stage === 'grid-toss') {
      const hold = stage === 'grid-hold';
      if (state?.phase !== (hold ? 'PICK_MARBLE' : 'RACING') || state.phaseTime < (hold ? .54 : .25)) return false;
      window.reviewStep = .005;
      return true;
    }
    if (state?.phase !== 'RACING' || !state.plan.bridge) return false;
    const distance = state.racers[0].distance;
    const chute = state.plan.narrowPasses?.find(p => p.section === 'Twin plunge chutes');
    const cliff = state.plan.dropChutes?.find(d => d.degrees === 80);
    if (stage === 'plunge' && !chute) return false;
    if (stage === 'steep-drop' && !cliff) return false;
    const target = stage === 'bridge' ? state.plan.bridge.start + 2 :
      stage === 'plunge' && chute ? (chute.start + chute.end) / 2 :
      stage === 'steep-drop' && cliff ? cliff.start + .40 * (cliff.end - cliff.start) : state.plan.length * .42;
    if (distance < target) return false;
    window.reviewStep = .005;
    return true;
  }, stage, { timeout: 150000 });
  const capture = root + '/' + stage + '-' + track + (entrants === '8' ? '' : '-' + entrants);
  for (const [width, height] of [[640, 360], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
    await page.screenshot({path: capture + '-' + width + '.png'});
  }
  const snapshot = await page.evaluate(() => window.__zeerush());
  if (stage === 'grid-hold' || stage === 'grid-toss') {
    assert.equal(snapshot.racers.length, Number(entrants));
    assert.ok(snapshot.racers.every(r => !r.grounded && (stage === 'grid-hold' ? r.speed === 0 : r.speed > 1)));
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(capture + '.json', JSON.stringify(snapshot, null, 2));
  if (stage === 'scenery-after') {
    await page.setViewportSize({width:640,height:360});
    await page.evaluate(() => { window.reviewStep = 105; });
    await page.waitForFunction(() => window.__zeerush().round === 2 && window.__zeerush().phase === 'RACING', undefined, {timeout:150000});
    const next = await page.evaluate(() => window.__zeerush());
    assert.equal(next.contextLosses,0);
    assert.equal(errors.length,0,errors.join('\n'));
    await writeFile(root + '/round-handoff.json',JSON.stringify(next,null,2));
  }
  console.log(stage, track, snapshot.plan.section, snapshot.plan.bridge, snapshot.racers[0].distance);
} finally { await browser.close(); }
