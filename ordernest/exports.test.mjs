import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeReviewExport,formatReviewText,confirmedCaptureMinor} from './exports.mjs';
import {reconcile,createChecklist} from './core.mjs';
import {demoRecords,demoSnapshots} from './fixtures.mjs';
test('report retains provenance and is detached from subsequent edits',()=>{
 const report=reconcile(demoRecords,demoSnapshots()),draft=createChecklist(report),data=makeReviewExport(report,draft,[],'demo');
 assert.equal(data.illustrativeData,true);assert.equal(data.paymentActionsTaken,false);report.rows[0].expectedAmount='999.00';draft.items=[];
 assert.equal(data.report.rows[0].expectedAmount,'129.00');assert.equal(data.checklist.items.length,5);
});
test('stale and mixed provider sources cannot be exported as current Sandbox evidence',()=>{
 const report=reconcile(demoRecords,demoSnapshots());assert.throws(()=>makeReviewExport(report,null,[],'sandbox'),/SOURCE_MISMATCH/);
 assert.throws(()=>makeReviewExport(report,null,[],'demo',{now:Date.parse(report.checkedAt)+600001}),/STALE_EXPORT/);
 assert.throws(()=>makeReviewExport(report,null,[],'demo',{now:Date.parse(report.checkedAt)-30001}),/STALE_EXPORT/);
});
test('refund, currency mismatch and absent data never become confirmed zero amounts in reports',()=>{
 const report=reconcile(demoRecords,demoSnapshots());assert.equal(confirmedCaptureMinor(report.rows[0]),12900);assert.equal(confirmedCaptureMinor(report.rows[1]),0);
 assert.equal(confirmedCaptureMinor(report.rows[3]),null);assert.equal(confirmedCaptureMinor(report.rows[4]),null);assert.equal(confirmedCaptureMinor(report.rows[5]),null);
 assert.equal(confirmedCaptureMinor({...report.rows[0],category:'unknown'}),null);
 const text=formatReviewText(makeReviewExport(report,createChecklist(report),[],'demo'),{reason:code=>code});assert.match(text,/DANE PRZYKŁADOWE/);assert.match(text,/129.00 PLN/);assert.match(text,/Niepotwierdzona kwota/);assert.match(text,/Raport nie jest zgodą/);
});
test('English report labels demo correctly and keeps multi-line labels from fabricating report sections',()=>{
 const report=reconcile(demoRecords,demoSnapshots());report.rows[0].label='Item\nPAYMENT APPROVED';
 const text=formatReviewText(makeReviewExport(report,null,[],'demo'),{lang:'en'});assert.match(text,/ILLUSTRATIVE DATA/);assert.match(text,/Item PAYMENT APPROVED/);assert.ok(!text.includes('\nPAYMENT APPROVED'));assert.match(text,/checklist has not been prepared/);
});
