import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {reconcile} from './core.mjs';
import {demoRecords,demoSnapshots} from './fixtures.mjs';

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.handlers={};this._text='';this.attributes={};this.value='';}
 set textContent(text){this._text=String(text);this.children=[];}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this._text='';this.children=nodes;}
 addEventListener(name,handler){this.handlers[name]=handler;}
 fire(name){return this.handlers[name]?.({preventDefault:()=>{this.prevented=true;}});}
 click(){return this.fire('click');}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];if(['href','download'].includes(key))delete this[key];}
 get classList(){return {toggle:(name,on)=>{const values=new Set((this.className??'').split(' ').filter(Boolean));on?values.add(name):values.delete(name);this.className=[...values].join(' ');}};}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
 querySelectorAll(selector){return this.all().filter(n=>selector==='[data-filter]'?n.dataset.filter!==undefined:selector==='[data-t]'?n.dataset.t!==undefined:selector==='.badge'?(n.className??'').split(' ').includes('badge'):selector==='option[value="sandbox"]'?n.tag==='option'&&n.value==='sandbox':n.tag===selector);}
 querySelector(selector){return this.querySelectorAll(selector)[0];}
}
// Execute the shipped classic bundle with an in-memory DOM. This is event-flow
// evidence, not a screenshot, real-browser, real-PayPal or real-model test.
function setup({server=false,fetchImpl}={}){
 const html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8'),runtime=readFileSync(new URL('./dist/browser-runtime.js',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/^\s*(import|export)\s/m);
 const root=new Element('body');
 for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)){const [_,tag,attrs]=match;if(!/\bid=|data-t=|data-filter=/.test(attrs))continue;const el=new Element(tag);for(const a of attrs.matchAll(/([a-z-]+)="([^"]*)"/g)){if(a[1]==='id')el.id=a[2];if(a[1]==='data-t')el.dataset.t=a[2];if(a[1]==='data-filter')el.dataset.filter=a[2];}root.append(el);}
 const get=id=>root.all().find(n=>n.id===id);get('mode').value='demo';const option=new Element('option');option.value='sandbox';option.disabled=true;get('mode').append(option);
 const document={documentElement:{lang:'pl'},getElementById:get,querySelectorAll:s=>root.querySelectorAll(s),createElement:tag=>new Element(tag)};
 const timers=[],exports=[],revoked=[];const timeout=(fn,ms)=>{const entry={fn,ms};timers.push(entry);return entry;};
 vm.runInNewContext(runtime,{document,location:{protocol:server?'http:':'file:',hostname:server?'127.0.0.1':'',port:server?'8802':''},structuredClone,AbortController,Date,Blob,URL:{createObjectURL:blob=>{exports.push(blob);return 'blob:local/'+(exports.length-1);},revokeObjectURL:url=>revoked.push(url)},setTimeout:timeout,clearTimeout:timer=>{if(timer)timer.cancelled=true;},fetch:fetchImpl??(()=>{throw new Error('Unexpected outbound request');})});
 return {get,document,root,timers,exports,revoked,blobFor:id=>exports[Number(get(id).href?.split('/').pop())],edit(id,value){get(id).value=value;get(id).fire('input');}};
}
test('standalone event flow: visible fixture counts, bilingual details, checklist and honest export',async()=>{
 const p=setup();assert.equal(p.get('count-matched').textContent,'1');assert.equal(p.get('count-waiting').textContent,'1');assert.equal(p.get('count-review').textContent,'4');assert.equal(p.get('ask').disabled,true);assert.match(p.get('source').textContent,/przykładowe/);
 p.get('draft').click();assert.equal(p.get('checklist').children.length,5);p.get('export').click();const report=JSON.parse(await p.blobFor('export').text());assert.equal(report.illustrativeData,true);assert.equal(report.report.allLiveSandbox,false);assert.equal(report.paymentActionsTaken,false);assert.equal(report.checklist.items.length,5);assert.equal(p.get('export').download,'OrderNest-review-DEMO.json');assert.match(await p.blobFor('export-text').text(),/DANE PRZYKŁADOWE/);
 p.get('language').click();assert.equal(p.document.documentElement.lang,'en');assert.equal(p.get('detail-title').textContent,'Ceramic mug');assert.match(p.get('source').textContent,/PayPal not connected/);assert.match(p.get('detail-text').textContent,/differ from the shop record/);
});
test('editing clears results/export, valid correction changes the classification, invalid amount is held',()=>{
 const p=setup();p.get('draft').click();const old=p.get('export').href;p.edit('amount-ON-103','60.00');assert.equal(p.get('export').attributes['aria-disabled'],'true');assert.equal(p.get('export').href,undefined);assert.ok(p.revoked.includes(old));assert.equal(p.get('checklist').children.length,0);assert.equal(p.get('count-matched').textContent,'—');p.get('review').click();assert.equal(p.get('count-matched').textContent,'2');assert.equal(p.get('count-review').textContent,'3');
 p.edit('amount-ON-103','60e3');p.get('review').click();assert.equal(p.get('export').attributes['aria-disabled'],'true');assert.match(p.get('notice').textContent,/format/);
});
test('freshness expiry and missing import evidence cannot retain old verified counts',()=>{
 const p=setup();p.get('draft').click();p.timers.find(t=>t.ms===600001&&!t.cancelled).fn();assert.equal(p.get('export').attributes['aria-disabled'],'true');p.get('export').click();assert.equal(p.get('export').prevented,true);assert.match(p.get('notice').textContent,/aktualność/);
 p.get('record-json').value=JSON.stringify([{...demoRecords[0],label:'<img src=x onerror=attack()>',paypalOrderId:'DEMOORDER999'}]);p.get('import').click();p.get('review').click();assert.equal(p.get('count-unknown').textContent,'1');assert.equal(p.get('count-matched').textContent,'0');assert.match(p.get('rows').textContent,/<img src=x onerror=attack\(\)>/);
});
test('a delayed server response is discarded after editing the input',async()=>{
 let release;const p=setup({server:true,fetchImpl:async(url)=>url==='/api/status'?{ok:true,json:async()=>({sandboxConfigured:false,localModelReady:false})}:new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({report:reconcile(demoRecords,demoSnapshots()),trace:[],mode:'demo'})});})});
 p.edit('amount-ON-103','60.00');release();await new Promise(resolve=>setImmediate(resolve));assert.equal(p.get('count-matched').textContent,'—');assert.equal(p.get('export').attributes['aria-disabled'],'true');assert.match(p.get('notice').textContent,/ponownie/);
});
test('report links track language, keep refunds unconfirmed, and clear after the list changes',async()=>{
 const p=setup();p.get('draft').click();p.get('language').click();assert.match(await p.blobFor('export-text').text(),/ILLUSTRATIVE DATA/);const refund=p.get('rows').children.find(row=>row.textContent.includes('ON-105'));refund.children[0].children[0].click();assert.match(p.get('facts').textContent,/Amount unconfirmed/);assert.ok(!p.get('facts').textContent.includes('0.00 PLN'));
 p.get('clear-records').click();assert.equal(p.get('export-text').href,undefined);assert.equal(p.get('export-text').attributes['aria-disabled'],'true');
});
test('manual entry supports a comma amount, clears examples and never invents provider evidence',()=>{
 const p=setup();p.get('clear-records').click();assert.equal(p.get('count-all').textContent,'0');assert.equal(p.get('review').disabled,true);
 p.get('new-label').value='Notes';p.get('new-paypal').value='  example123  ';p.get('new-amount').value='49,90';p.get('new-currency').value='PLN';p.get('add-record').click();assert.equal(p.get('count-all').textContent,'1');assert.equal(p.get('review').disabled,false);assert.match(p.get('facts').textContent,/EXAMPLE123/);assert.match(p.get('facts').textContent,/49.90 PLN/);
 p.get('review').click();assert.equal(p.get('count-unknown').textContent,'1');assert.equal(p.get('count-matched').textContent,'0');
 p.get('new-label').value='Bad';p.get('new-paypal').value='invalid/id';p.get('new-amount').value='1.00';p.get('add-record').click();assert.equal(p.get('count-all').textContent,'1');assert.match(p.get('notice').textContent,/format/);
});
test('server report links stay on the approved download route and disappear after editing',async()=>{
 const route='/download/'+'a'.repeat(48)+'/pl.json',textRoute=route.replace('.json','.txt');
 const p=setup({server:true,fetchImpl:async(url)=>({ok:true,json:async()=>url==='/api/status'?{sandboxConfigured:false,localModelReady:false}:{report:reconcile(demoRecords,demoSnapshots()),checklist:null,trace:[],downloads:{pl:{json:route,text:textRoute}}}})});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(p.get('export').href,route);assert.equal(p.get('export-text').href,textRoute);p.edit('amount-ON-103','60.00');assert.equal(p.get('export').href,undefined);
});
