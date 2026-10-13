import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));await page.goto('http://127.0.0.1:8765/?lang=en');await page.locator('#analysis').waitFor();
 for(const theme of ['light','dark']){
  await page.locator('#theme').selectOption(theme);
  const failures=await page.evaluate(()=>{
   const rgb=s=>s.match(/[\d.]+/g).map(Number),luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   return [...document.querySelectorAll('.legend span,.metric span,.metric small,.muted,.browser-note,.row-status')].filter(e=>e.getBoundingClientRect().height&&e.textContent.trim()).flatMap(e=>{
    const style=getComputedStyle(e);let parent=e,bg;
    while(parent){const color=rgb(getComputedStyle(parent).backgroundColor);if(color.length===3||color[3]===1){bg=color;break;}parent=parent.parentElement;}
    if(!bg)return [];const a=luminance(rgb(style.color)),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    return ratio>=4.5?[]:[{text:e.textContent.slice(0,45),ratio,color:style.color,bg}];
   });
  });
  assert.deepEqual([...new Map(failures.map(f=>[`${f.text}:${f.color}:${f.bg}`,f])).values()],[],`${theme} small text must reach 4.5:1`);
 }
 console.log('PASS visible small metric/legend/note/list text contrast in light and dark themes');
}finally{await browser.close();}
