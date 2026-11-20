import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../public/music/',import.meta.url);
const tracks = JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page = await browser.newPage();
  await page.goto(new URL('credits.html',root).href);
  assert.equal(await page.getByRole('button').count(),56);
  const audition = [];
  for (const row of tracks.filter(r=>r.featured)) {
    await page.getByRole('button',{name:'Play '+row.title,exact:true}).click();
    await page.waitForFunction(filename=>{
      const audio=document.querySelector('audio');
      return audio.currentSrc.endsWith(filename) && !audio.paused && audio.currentTime > .25 && audio.readyState >=3;
    },row.file,{timeout:12000});
    const duration=await page.locator('audio').evaluate(a=>a.duration);
    audition.push({title:row.title,mood:row.mood,duration});
  }
  await writeFile('verification-output/course-review/listening-shortlist.json',JSON.stringify(audition,null,2));
  console.log(audition.length+' previews played from local files');
} finally { await browser.close(); }

