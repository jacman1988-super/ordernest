import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandboxReader} from './paypal.mjs';
import {reconcile} from './core.mjs';
const stamp=Date.parse('2026-10-15T19:00:00Z');
const record={id:'SHOP1',label:'Fictional test item',paypalOrderId:'ORDER1',expectedAmount:'1.00',currency:'PLN'};
const capture=(status='COMPLETED')=>({id:'CAPTURE1',status,amount:{value:'1.00',currency_code:'PLN'}});
const order=()=>({id:'ORDER1',status:'COMPLETED',purchase_units:[{payments:{captures:[capture()]}}]});
const response=data=>new Response(JSON.stringify(data));
function reader(detail,{raw=order(),status=200}={}){
 const calls=[];
 const api=createSandboxReader({clientId:'offline-dummy',clientSecret:'offline-only',clock:()=>stamp,fetchImpl:async(url,opts)=>{
  calls.push({url,method:opts.method,redirect:opts.redirect});
  if(url.endsWith('/token'))return response({access_token:'offline-token',token_type:'Bearer',expires_in:3600});
  if(url.includes('/checkout/orders/'))return response(raw);
  return new Response(JSON.stringify(detail),{status});
 }});return {api,calls};
}
test('capture refresh distinguishes completed, mismatched and refunded records using read-only endpoints',async()=>{
 for(const [status,expected,reason] of [['COMPLETED','1.00','capture_matches_record'],['COMPLETED','2.00','amount_mismatch'],['REFUNDED','1.00','refund_requires_review'],['PARTIALLY_REFUNDED','1.00','refund_requires_review']]){
  const {api,calls}=reader(capture(status));const snapshot=await api.getOrder('ORDER1');
  assert.equal(snapshot.captureDetailsChecked,1);
  assert.equal(reconcile([{...record,expectedAmount:expected}],{ORDER1:snapshot},{now:stamp}).rows[0].reason,reason);
  assert.deepEqual(calls.map(c=>c.method),['POST','GET','GET']);
  assert.ok(calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')&&c.redirect==='error'));
  assert.equal(calls[2].url,'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE1');
 }
});
test('capture identity, order relationship, currency and gross amount contradictions never become a match',async()=>{
 for(const detail of [{...capture(),id:'OTHER'},{...capture(),supplementary_data:{related_ids:{order_id:'OTHER'}}},{...capture(),amount:{value:'2.00',currency_code:'PLN'}},{...capture(),amount:{value:'1.00',currency_code:'USD'}},null]){
  await assert.rejects(reader(detail).api.getOrder('ORDER1'),e=>e.message==='PAYPAL_INVALID_CAPTURE');
 }
 const raw=order();raw.purchase_units[0].payments.captures[0].id='../../refund';
 const {api,calls}=reader(capture(),{raw});await assert.rejects(api.getOrder('ORDER1'),/PAYPAL_INVALID_CAPTURE/);assert.equal(calls.length,2);
});
test('capture read failure does not fall back to embedded completed status or leak provider content',async()=>{
 await assert.rejects(reader({private:'do not expose'},{status:403}).api.getOrder('ORDER1'),e=>e.message==='PAYPAL_HTTP_403');
});
test('refreshed capture strips personal data and provider links from the returned snapshot',async()=>{
 const detail={...capture('REFUNDED'),payee:{email_address:'private@example.invalid'},links:[{href:'https://private.invalid/refund'}],seller_receivable_breakdown:{secret:'private'}};
 const snapshot=await reader(detail).api.getOrder('ORDER1');
 assert.equal(snapshot.hasRefund,true);assert.ok(!JSON.stringify(snapshot).includes('private'));
});
