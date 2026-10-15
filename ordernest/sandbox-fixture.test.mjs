import test from 'node:test';import assert from 'node:assert/strict';
import {createUnpaidSandboxFixture} from './sandbox-fixture.mjs';
const requestId='adf30161-5311-483a-93dd-1e8ddcdb5d65';
const options={clientId:'test-id',clientSecret:'test-secret',requestId};
test('fixture setup creates exactly one unpaid Sandbox order without customer/payment-source data',async()=>{
  const calls=[];
  const result=await createUnpaidSandboxFixture({...options,fetchImpl:async(url,opts)=>{
    calls.push({url,opts});return new Response(JSON.stringify(url.endsWith('/token')?{access_token:'test-token',token_type:'Bearer'}:{id:'TESTORDER1',status:'CREATED',links:[{href:'https://private.invalid'}],payer:{email_address:'private@example.invalid'}}),{status:200});
  }});
  assert.deepEqual(calls.map(c=>c.url),['https://api-m.sandbox.paypal.com/v1/oauth2/token','https://api-m.sandbox.paypal.com/v2/checkout/orders']);
  assert.ok(calls.every(c=>c.opts.method==='POST'&&c.opts.redirect==='error'));
  assert.deepEqual(JSON.parse(calls[1].opts.body),{intent:'CAPTURE',purchase_units:[{amount:{currency_code:'PLN',value:'1.00'}}]});
  assert.equal(calls[1].opts.headers['PayPal-Request-Id'],requestId);
  assert.deepEqual(result,{id:'TESTORDER1',status:'CREATED',amount:'1.00',currency:'PLN',environment:'sandbox',paymentCaptured:false});
  assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('test-token'));
});
test('missing credentials or idempotency ID do not make any outbound calls',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw new Error('unexpected');};
  await assert.rejects(createUnpaidSandboxFixture({...options,clientSecret:'',fetchImpl}),/CREDENTIALS_REQUIRED/);
  await assert.rejects(createUnpaidSandboxFixture({...options,requestId:'',fetchImpl}),/REQUEST_ID_REQUIRED/);assert.equal(calls,0);
});
test('provider errors and unexpected captured orders never return private content or success',async()=>{
  await assert.rejects(createUnpaidSandboxFixture({...options,fetchImpl:async()=>new Response('private-token-and-payer',{status:401})}),e=>e.message==='SANDBOX_SETUP_AUTH_HTTP_401');
  await assert.rejects(createUnpaidSandboxFixture({...options,fetchImpl:async url=>new Response(JSON.stringify(url.endsWith('/token')?{access_token:'t',token_type:'Bearer'}:{id:'TESTORDER1',status:'COMPLETED'}))}),/UNEXPECTED_ORDER/);
  await assert.rejects(createUnpaidSandboxFixture({...options,fetchImpl:async()=>new Response('x'.repeat(262145))}),/RESPONSE_LIMIT/);
});

test('failed authentication never marks order creation as attempted; order rejection is a separate stage',async()=>{
 let marked=0,calls=0;
 await assert.rejects(createUnpaidSandboxFixture({...options,beforeCreate:async()=>{marked++;},fetchImpl:async()=>{calls++;return new Response('not logged',{status:401});}}),/AUTH_HTTP_401/);
 assert.equal(marked,0);assert.equal(calls,1);
 await assert.rejects(createUnpaidSandboxFixture({...options,beforeCreate:async()=>{marked++;},fetchImpl:async url=>url.endsWith('/token')?new Response(JSON.stringify({access_token:'offline',token_type:'Bearer'})):new Response('not logged',{status:401})}),/ORDER_HTTP_401/);
 assert.equal(marked,1);
});
