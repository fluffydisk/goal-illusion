import assert from 'node:assert/strict';
import {distribution, analyze} from '../web/math.mjs';
import {readFileSync} from 'node:fs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12, `${a} != ${b}`);
assert.deepEqual(distribution([]),[1]);
assert.deepEqual(distribution([0,1],2),[0,0,0,1,0]);
[.375,.5,.125].forEach((v,i)=>close(distribution([.25,.5])[i],v));
for(const p of [NaN,-.1,1.1,'0.5',true])assert.throws(()=>distribution([p]));
const fixtures=JSON.parse(readFileSync(new URL('./pages_reference.json',import.meta.url)));
for(const f of fixtures){const a=analyze(f.home,f.away,f.home_fixed,f.away_fixed);close(a.win,f.win);close(a.draw,f.draw);close(a.loss,f.loss);close(a.win+a.draw+a.loss,1);close(a.h.reduce((s,p,i)=>s+i*p,0),f.home.reduce((a,b)=>a+b,0)+f.home_fixed);const swap=analyze(f.away,f.home,f.away_fixed,f.home_fixed);close(a.win,swap.loss);}
console.log(`Browser math matches Python for ${fixtures.length} real matches.`);
