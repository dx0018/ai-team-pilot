// QA probe (outside repo): same listener pattern as t01.spike.js openSpike(); logs every request URL seen.
const path=require('path');const {chromium}=require('/workspace/qa-t01/repo/node_modules/playwright');
(async()=>{for(const ch of ['chrome','msedge']){const b=await chromium.launch({channel:ch,headless:true});const c=await b.newContext();const p=await c.newPage();const seen=[];
p.on('request',r=>seen.push(r.url()));
await p.goto('file:///workspace/qa-t01/repo/spikes/t01/index.html?phase=write&role=release',{waitUntil:'load'});
await p.waitForFunction(()=>window.SPIKE_DONE===true);
const r=await p.evaluate(()=>window.SPIKE_RESULT);
console.log(JSON.stringify({channel:ch,requestsSeenByListener:seen,font:r.checks.font}));
await p.screenshot({path:'/workspace/qa-t01/evidence/screenshot-'+ch+'-write.png',fullPage:true});
await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
