import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progressText} from '../web/ai-client.mjs';
test('quota wait shows real provider retry time, not fabricated completion',()=>{
 const result=progressText({status:'waiting_provider',started_at:0,updated_at:0,retry_at:180000},60000);
 assert.match(result.remaining,/2 dk/);assert.match(result.remaining,/otomatik/);assert.ok(!result.remaining.includes('%'));
});
test('repair and independent review describe the actual operation',()=>{
 assert.match(progressText({status:'generating',attempt:1,started_at:0},1000).remaining,/düzeltiliyor/);
 assert.match(progressText({status:'reviewing',started_at:0},1000).remaining,/dakikalar/);
});
