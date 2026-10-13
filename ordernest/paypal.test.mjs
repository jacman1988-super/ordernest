import test from 'node:test';import assert from 'node:assert/strict';import {createSandboxReader} from './paypal.mjs';
const json=data=>new Response(JSON.stringify(data),{status:200});
const raw={id:'ABC123',status:'APPROVED',purchase_units:[]};
test('sandbox reader obtains token once, then only GETs bounded order details',async()=>{
 const calls=[];const reader=createSandboxReader({clientId:'dummy',clientSecret:'test-only',clock:()=>1000,fetchImpl:async(url,options)=>{calls.push({url,options});return url.endsWith('/token')?json({access_token:'fake-test-token',token_type:'Bearer',expires_in:3600}):json(raw);}});
 assert.equal((await reader.getOrder('ABC123')).source,'sandbox');await reader.getOrder('ABC123');
 assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>c.options.method),['POST','GET','GET']);assert.ok(calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')&&c.options.redirect==='error'));
 assert.ok(calls.every(c=>!c.url.includes('/capture')&&!c.url.includes('/refund')));
});
test('invalid IDs and missing credentials cause no outbound request',async()=>{
 assert.throws(()=>createSandboxReader({}));let calls=0;const reader=createSandboxReader({clientId:'x',clientSecret:'y',fetchImpl:async()=>{calls++;throw new Error('called');}});
 for(const id of ['../capture','https://other.invalid','ABC/REFUND',123])await assert.rejects(reader.getOrder(id),/INVALID_PAYPAL_ORDER_ID/);assert.equal(calls,0);
});
test('provider error is sanitized and never exposes raw content or credentials',async()=>{
 const reader=createSandboxReader({clientId:'x',clientSecret:'SECRET',fetchImpl:async()=>new Response('raw-private-provider-message',{status:401})});await assert.rejects(reader.getOrder('ABC'),e=>e.message==='PAYPAL_HTTP_401');
});
test('identity mismatches and unbounded bodies are rejected',async()=>{
 let token=true;const reader=createSandboxReader({clientId:'x',clientSecret:'y',fetchImpl:async()=>token?(token=false,json({access_token:'t',token_type:'Bearer',expires_in:60})):json(raw)});
 await assert.rejects(reader.getOrder('WRONG'),/INVALID_PROVIDER_ORDER/);
 const huge=createSandboxReader({clientId:'x',clientSecret:'y',fetchImpl:async()=>new Response('x'.repeat(262145))});await assert.rejects(huge.getOrder('ABC'),/PAYPAL_RESPONSE_LIMIT/);
});
