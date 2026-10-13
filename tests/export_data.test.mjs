import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {csvCell,analysisDocument,shotsCsv,summaryCsv} from '../web/export-data.mjs';
const record=JSON.parse(readFileSync(new URL('../web/data/matches.json',import.meta.url))).matches[0];
test('export preserves shots, conditional model and source without changing input',()=>{
 const before=JSON.stringify(record),document=analysisDocument(record,{fingerprint:'fp',exportedAt:'now',datasetUpdatedAt:'updated'});
 assert.deepEqual(document.shots,record.shots);assert.equal(document.fingerprint,'fp');assert.equal(document.source.url,record.source_url);assert.equal(document.model.penalty_shootouts_included,false);assert.equal(JSON.stringify(record),before);
 assert.ok(shotsCsv(record).startsWith('\uFEFFmatch_id,date'));assert.equal(shotsCsv(record).split('\r\n').length,record.shots.length+2);assert.equal(summaryCsv(record).split('\r\n').length,4);
});
test('CSV quotes text and separates empty values from numeric zero',()=>{
 assert.equal(csvCell('A,"B"'),'"A,""B"""');assert.equal(csvCell(null),'');assert.equal(csvCell(0),'0');assert.equal(csvCell(-.5),'-0.5');
 assert.equal(csvCell('=SUM(1)'),"'=SUM(1)");assert.equal(csvCell(' @formula'),"' @formula");assert.equal(csvCell('Ümit Öz'), 'Ümit Öz');
});
