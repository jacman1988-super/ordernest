import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createHandler} from './server.mjs';
import {demoRecords,demoSnapshots} from './fixtures.mjs';
// In-memory HTTP request streams. These checks do not establish socket, browser,
// PayPal or model availability.
async function call(handler,{url='/api/reconcile',method='POST',host='127.0.0.1:8802',origin='http://127.0.0.1:8802',type='application/json',body={mode:'demo',records:demoRecords},raw}={}){
 const req=Readable.from([Buffer.from(raw??JSON.stringify(body))]);req.url=url;req.method=method;req.headers={host,...(origin?{origin}:{}),'content-type':type};
 const res=new EventEmitter();res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};res.end=data=>{res.body=data;res.writableEnded=true;};
 await handler(req,res);return {...res,json:res.headers['Content-Type'].startsWith('application/json')?JSON.parse(res.body):null};
}
test('local boundaries reject cross origin/host, non-JSON and oversized inputs',async()=>{
 const h=createHandler({modelReady:async()=>false});
 assert.equal((await call(h,{host:'evil.example:8802'})).status,403);
 assert.equal((await call(h,{origin:'https://evil.example'})).status,403);
 assert.equal((await call(h,{origin:null})).status,403);
 assert.equal((await call(h,{type:'text/plain'})).status,415);
 assert.equal((await call(h,{raw:'x'.repeat(17000)})).status,413);
 assert.equal((await call(h,{raw:'{'})).status,400);
});
test('demo review uses fixture provenance and status exposes no secrets',async()=>{
 const h=createHandler({clientId:'test-id',clientSecret:'TEST-SECRET',modelReady:async()=>false});
 const result=await call(h);assert.deepEqual(result.json.report.summary,{matched:1,waiting:1,review:4,unknown:0});assert.equal(result.json.providerReadPerformed,false);assert.equal(result.json.report.allLiveSandbox,false);
 const status=await call(h,{url:'/api/status',method:'GET'});assert.equal(status.json.sandboxConfigured,true);assert.equal(status.json.localModelReady,false);assert.ok(!JSON.stringify(status.json).includes('TEST-SECRET'));
});
test('unconfigured sandbox and absent model are blocked, never replaced by demo',async()=>{
 const h=createHandler({modelReady:async()=>false});
 assert.equal((await call(h,{body:{mode:'sandbox',records:demoRecords}})).status,409);
 assert.equal((await call(h,{url:'/api/assistant'})).status,503);
});
test('sandbox failures clear the result; injected read normalizes the actual selected ID set',async()=>{
 const records=[{...demoRecords[0],paypalOrderId:'SANDBOX123'}];let calls=[];
 const h=createHandler({reader:{async getOrder(id){calls.push(id);return {...demoSnapshots().DEMOORDER101,id,source:'sandbox'};}},modelReady:async()=>false});
 assert.equal((await call(h,{body:{mode:'sandbox',records:demoRecords}})).status,400);assert.equal(calls.length,0);
 const r=await call(h,{body:{mode:'sandbox',records}});assert.equal(r.json.report.summary.matched,1);assert.deepEqual(calls,['SANDBOX123']);assert.equal(r.json.providerReadPerformed,true);
 const broken=createHandler({reader:{async getOrder(){throw new Error('secret provider payload');}}});
 const fail=await call(broken,{body:{mode:'sandbox',records}});assert.equal(fail.status,502);assert.deepEqual(fail.json,{error:'REQUEST_FAILED'});
});
test('AI route uses bounded canonical tools and labels demo provenance despite injected model',async()=>{
 const h=createHandler({modelReady:async()=>true,decide:async({allowed})=>allowed[0]});
 const result=await call(h,{url:'/api/assistant'});assert.equal(result.status,200);assert.equal(result.json.checklist.items.length,5);assert.deepEqual(result.json.trace.map(x=>x.tool),['reconcile_orders','explain_exceptions','draft_checklist']);assert.equal(result.json.providerReadPerformed,false);assert.equal(result.json.modelUsed,true);assert.equal(result.json.paymentActionsTaken,false);
});
test('only static allowlisted resources are served with a restrictive policy',async()=>{
 const h=createHandler();assert.equal((await call(h,{method:'GET',url:'/paypal.mjs'})).status,404);
 const page=await call(h,{method:'GET',url:'/'});assert.equal(page.status,200);assert.match(page.headers['Content-Security-Policy'],/connect-src 'self'/);assert.match(page.body.toString(),/OrderNest/);
});
test('download endpoints return immutable canonical report and readable localized checklist',async()=>{
 const h=createHandler({modelReady:async()=>false});const reviewed=await call(h);const paths=reviewed.json.downloads;
 assert.match(paths.pl.json,/^\/download\/[a-f0-9]{48}\/pl\.json$/);
 const json=await call(h,{method:'GET',url:paths.pl.json});assert.equal(json.status,200);assert.equal(json.json.illustrativeData,true);assert.equal(json.json.checklist.items.length,5);assert.match(json.headers['Content-Disposition'],/attachment; filename="OrderNest-review-DEMO.json"/);
 const text=await call(h,{method:'GET',url:paths.en.text});assert.equal(text.status,200);assert.match(text.body,/ILLUSTRATIVE DATA/);assert.match(text.body,/Linen notebook/);assert.match(text.body,/Amount unconfirmed/);assert.match(text.headers['Content-Type'],/text\/plain; charset=utf-8/);
 reviewed.json.report.rows[0].expectedAmount='999';assert.equal((await call(h,{method:'GET',url:paths.pl.json})).json.report.rows[0].expectedAmount,'129.00');
});
test('expired, invented and malformed download references cannot expose a report',async()=>{
 let now=Date.now();const h=createHandler({clock:()=>now,modelReady:async()=>false});const result=await call(h);const path=result.json.downloads.pl.json;
 assert.equal((await call(h,{method:'GET',url:path,origin:'https://evil.example'})).status,403);
 assert.equal((await call(h,{method:'GET',url:'/download/'+'a'.repeat(48)+'/pl.json'})).status,404);
 assert.equal((await call(h,{method:'GET',url:path.replace('.json','.html')})).status,404);
 now+=600001;assert.equal((await call(h,{method:'GET',url:path})).status,404);
});
