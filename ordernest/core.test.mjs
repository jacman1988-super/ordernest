import test from 'node:test';import assert from 'node:assert/strict';
import {moneyMinor,normalizeOrder,reconcile,validateRecords,createChecklist} from './core.mjs';
import {demoRecords,demoSnapshots} from './fixtures.mjs';
const now=Date.parse('2026-10-13T01:00:00Z');const snapshots=()=>demoSnapshots(new Date(now).toISOString());
test('fixture workflow finds one match, one waiting and four distinct review cases',()=>{
 const result=reconcile(demoRecords,snapshots(),{now});assert.deepEqual(result.summary,{matched:1,waiting:1,review:4,unknown:0});
 assert.deepEqual(result.rows.map(r=>r.reason),['capture_matches_record','not_captured','amount_mismatch','currency_mismatch','refund_requires_review','missing_capture_evidence']);
 assert.equal(result.allLiveSandbox,false);assert.equal(result.paymentActionsTaken,false);assert.equal(createChecklist(result).items.length,5);
});
test('decimal values are exact and invalid/unsupported amounts rejected',()=>{
 assert.equal(moneyMinor('0.29','PLN')+moneyMinor('0.01','PLN'),30);assert.equal(moneyMinor('12.3','EUR'),1230);
 for(const [value,currency] of [['01.00','PLN'],['1.001','PLN'],['-1','USD'],[12,'PLN'],['1e2','PLN'],['1','JPY'],['999999999','PLN']])assert.throws(()=>moneyMinor(value,currency));
});
test('APPROVED is never evidence of a captured payment',()=>assert.equal(reconcile([demoRecords[1]],snapshots(),{now}).rows[0].category,'waiting'));
test('a completed order without completed capture evidence remains held',()=>assert.equal(reconcile([demoRecords[5]],snapshots(),{now}).rows[0].category,'review'));
test('stale, future and absent snapshots never become matches',()=>{
 for(const stamp of ['2026-10-12T23:00:00Z','2026-10-14T01:00:00Z','bad']){const s=snapshots();s.DEMOORDER101.checkedAt=stamp;assert.equal(reconcile([demoRecords[0]],s,{now}).rows[0].reason,'stale_snapshot');}
 assert.equal(reconcile([demoRecords[0]],{}, {now}).rows[0].category,'unknown');
});
test('repeated merchant IDs are rejected and repeated PayPal references held',()=>{
 assert.throws(()=>validateRecords([demoRecords[0],demoRecords[0]]));
 const repeated=[demoRecords[0],{...demoRecords[0],id:'ON-999'}];assert.ok(reconcile(repeated,snapshots(),{now}).rows.every(r=>r.reason==='duplicate_order_reference'));
 assert.throws(()=>validateRecords([{...demoRecords[0],id:123}]));
});
test('currency, refunded and pending capture cases cannot be matches',()=>{
 const s=snapshots();s.DEMOORDER101.captures[0].status='PENDING';assert.equal(reconcile([demoRecords[0]],s,{now}).rows[0].reason,'capture_not_final');
 s.DEMOORDER101.captures[0].status='COMPLETED';s.DEMOORDER101.hasRefund=true;assert.equal(reconcile([demoRecords[0]],s,{now}).rows[0].reason,'refund_requires_review');
});
test('duplicate captures cannot count twice; multi-capture totals can match',()=>{
 const s=snapshots();s.DEMOORDER101.captures.push({...s.DEMOORDER101.captures[0]});assert.equal(reconcile([demoRecords[0]],s,{now}).rows[0].category,'unknown');
 s.DEMOORDER101.captures=[{id:'A',status:'COMPLETED',currency:'PLN',minor:10000},{id:'B',status:'COMPLETED',currency:'PLN',minor:2900}];assert.equal(reconcile([demoRecords[0]],s,{now}).rows[0].category,'matched');
 s.DEMOORDER101.captures[1].minor=3000;assert.equal(reconcile([demoRecords[0]],s,{now}).rows[0].reason,'amount_mismatch');
});
test('provider parsing drops customer information and validates exact order identity',()=>{
 const raw={id:'ABC',status:'COMPLETED',payer:{email_address:'private@example.invalid'},purchase_units:[{shipping:{address:{secret:true}},payments:{captures:[{id:'X',status:'COMPLETED',amount:{value:'1.00',currency_code:'PLN'}}]}}]};
 const result=normalizeOrder(raw,'ABC');assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('shipping'));assert.throws(()=>normalizeOrder(raw,'DEF'));
 raw.purchase_units[0].payments.captures.push(raw.purchase_units[0].payments.captures[0]);assert.throws(()=>normalizeOrder(raw,'ABC'));
});
