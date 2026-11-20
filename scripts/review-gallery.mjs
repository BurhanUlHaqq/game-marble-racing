import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const courses=[
  ['cedar-creek','Cedar Creek'],['paper-moon','Paper Moon'],['bellflower','Bellflower'],['clockmaker','Clockmaker'],
  ['aurora','Aurora'],['cloud-quilt','Cloud Quilt'],['truck-art','Truck Art'],['fossil-canyon','Fossil Canyon'],
  ['prism-aquarium','Prism Aquarium'],['midnight-record','Midnight Record'],['classic','Procedural Classic']
];
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,args:['--enable-unsafe-swiftshader','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
const sheets=[];
try {
  for(let i=0;i<courses.length;i+=2) {
    const shots=await Promise.all(courses.slice(i,i+2).map(async ([track,name])=>{
      const page=await browser.newPage({viewport:{width:640,height:360}});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try {
        await page.addInitScript(()=>{
          const clock=window.performance.now.bind(window.performance),raf=window.requestAnimationFrame.bind(window);
          let previous=0,offset=0;
          window.step=115;
          window.performance.now=()=>clock()+offset;
          window.requestAnimationFrame=f=>raf(stamp=>{
            if(previous && stamp>previous)offset+=window.step-(stamp-previous);
            if(stamp>previous)previous=stamp;
            f(stamp+offset);
          });
        });
        await page.goto('http://127.0.0.1:4287/?track='+track+'&seed=postmark-26&raceTarget=60&diagnostics=1&mute=true');
        await page.waitForFunction(t=>{
          const s=window.__zeerush?.();
          if(s?.phase!=='RACING')return false;
          const hit=t==='classic'?s.racers[0].distance>s.plan.bridge.start+2:
            s.plan.section==='signature'&&s.racers[0].distance>s.plan.length*.42;
          if(hit)window.step=.001;
          return hit;
        },track,{timeout:130000});
        assert.deepEqual(errors,[]);
        return '<figure><img src="data:image/png;base64,'+(await page.screenshot()).toString('base64')+'"><figcaption>'+name+'</figcaption></figure>';
      } finally {await page.close();}
    }));
    sheets.push(...shots);
  }
  const sheet=await browser.newPage({viewport:{width:1260,height:1130},deviceScaleFactor:1});
  await sheet.setContent('<style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#16262d;color:#fff2d9;font:16px system-ui}h1{font-size:26px;margin:0 0 12px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}figure{margin:0}img{width:100%;display:block}figcaption{padding:4px 0}</style><h1>ZeeRush · Broadcast camera review</h1><main>'+sheets.join('')+'</main>');
  await sheet.locator('main').waitFor();
  await sheet.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
  await sheet.screenshot({path:'verification-output/course-review/course-gallery.png',fullPage:true});
  console.log('Captured '+sheets.length+' live courses');
} finally { await browser.close(); }

