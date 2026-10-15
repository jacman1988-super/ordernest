import test from 'node:test';import assert from 'node:assert/strict';
import {verifySandboxCases} from './verify-sandbox.mjs';
const json=data=>new Response(JSON.stringify(data));
function simulated({demo=false}={}){const calls=[];return {calls,fetchImpl:async(url,opts)=>{
 calls.push({url,opts});if(url.endsWith('/status'))return json({sandboxConfigured:true,provider:'PayPal sandbox'});
 const body=JSON.parse(opts.body),r=body.records[0];const reason=r.paypalOrderId==='WAIT1'?'not_captured':r.paypalOrderId==='REFUND1'?'refund_requires_review':r.expectedAmount==='2.00'?'amount_mismatch':'capture_matches_record';
 const category=reason==='not_captured'?'waiting':reason==='capture_matches_record'?'matched':'review';
 return json({mode:demo?'demo':'sandbox',providerReadPerformed:!demo,report:{allLiveSandbox:!demo,paymentActionsTaken:false,rows:[{paypalOrderId:r.paypalOrderId,source:demo?'demo':'sandbox',category,reason,paidMinor:category==='matched'?100:0,checkedAt:'2026-10-15T19:00:00Z'}]}});
}};}
test('acceptance checker distinguishes all four real-route cases without provider write or AI calls',async()=>{
 const fake=simulated(),result=await verifySandboxCases({waiting:'WAIT1',completed:'PAID1',refunded:'REFUND1',...fake});
 assert.equal(result.allCasesPassed,true);assert.equal(result.results.length,4);
 assert.ok(fake.calls.every(c=>c.url.startsWith('http://127.0.0.1:8802/api/')));
 assert.ok(fake.calls.slice(1).every(c=>JSON.parse(c.opts.body).mode==='sandbox'));
 assert.equal(JSON.parse(fake.calls[3].opts.body).records[0].expectedAmount,'2.00');
});
test('omitted actual IDs remain not run and demo data cannot pass as provider evidence',async()=>{
 const result=await verifySandboxCases({waiting:'WAIT1',...simulated()});assert.equal(result.allCasesPassed,false);assert.equal(result.results.filter(r=>r.state==='not_run').length,3);
 await assert.rejects(verifySandboxCases({waiting:'WAIT1',...simulated({demo:true})}),/SANDBOX_PROVENANCE_REQUIRED/);
});
test('invalid, fictional or duplicate IDs make no request',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error('unexpected');};
 for(const ids of [{},{waiting:'DEMOORDER1'},{waiting:'../x'},{waiting:'SAME',completed:'SAME'}])await assert.rejects(verifySandboxCases({...ids,fetchImpl}),/INVALID_SANDBOX_CASE_IDS/);
 assert.equal(calls,0);
});
