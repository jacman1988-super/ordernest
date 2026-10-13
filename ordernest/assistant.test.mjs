import test from 'node:test';import assert from 'node:assert/strict';import {runAssistant,createLocalDecider} from './assistant.mjs';import {demoRecords,demoSnapshots} from './fixtures.mjs';
test('model-selected read-only steps produce canonical report and draft checklist',async()=>{
 const calls=[];const agent=await runAssistant({records:demoRecords,snapshots:demoSnapshots(),decide:async request=>{calls.push(request);return request.allowed[0];}});
 assert.deepEqual(agent.trace.map(t=>t.tool),['reconcile_orders','explain_exceptions','draft_checklist']);assert.equal(agent.checklist.items.length,5);assert.equal(agent.paymentActionsTaken,false);
 assert.ok(!JSON.stringify(calls).includes('DEMOORDER'));assert.ok(!JSON.stringify(calls).includes('129.00'));
});
test('unknown or payment actions and aborted calls cannot modify records',async()=>{
 const original=JSON.stringify(demoRecords);await assert.rejects(runAssistant({records:demoRecords,snapshots:demoSnapshots(),decide:async()=> 'capture_payment'}),/INVALID_AGENT_ACTION/);
 const controller=new AbortController();controller.abort();await assert.rejects(runAssistant({records:demoRecords,snapshots:demoSnapshots(),decide:async()=> 'reconcile_orders',signal:controller.signal}));assert.equal(JSON.stringify(demoRecords),original);
});
test('local completion schema validated; no invented model prose accepted',async()=>{
 const invoke=body=>createLocalDecider({fetchImpl:async()=>new Response(JSON.stringify(body))})({goal:'inspect',allowed:['reconcile_orders'],facts:null});
 assert.equal(await invoke({choices:[{finish_reason:'stop',message:{content:'{"action":"reconcile_orders"}'}}]}),'reconcile_orders');
 await assert.rejects(invoke({choices:[{finish_reason:'stop',message:{content:'{"action":"capture","paid":true}'}}]}),/INVALID_MODEL_ACTION/);
 await assert.rejects(invoke({choices:[{finish_reason:'length',message:{content:'{"action":"reconcile_orders"}'}}]}),/INVALID_MODEL_RESPONSE/);
});
