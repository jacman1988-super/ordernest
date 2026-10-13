import {reconcile,createChecklist,validateRecords,explainExceptions} from './core.mjs';
export async function runAssistant({records,snapshots,decide,goal='checklist',signal,now=Date.now()}={}) {
  if(!['inspect','checklist'].includes(goal)||typeof decide!=='function')throw new Error('INVALID_AGENT_REQUEST');
  const input=validateRecords(records);const trace=[];let report,checklist,explanation;
  for(let step=0;step<4;step++) {
    signal?.throwIfAborted();
    const needsExplanation=report&&(report.summary.review+report.summary.unknown)>0&&!explanation;
    const allowed=!report?['reconcile_orders']:(!checklist&&goal==='checklist'?[...(needsExplanation?['explain_exceptions']:[]),'draft_checklist']:(needsExplanation&&goal==='inspect'?['explain_exceptions','finish']:['finish']));
    // Only aggregate verified facts go to a model; no customer/order IDs or amounts.
    const action=await decide({goal,allowed:[...allowed],facts:report?structuredClone(report.summary):null,signal});
    signal?.throwIfAborted();
    if(typeof action!=='string'||!allowed.includes(action))throw new Error('INVALID_AGENT_ACTION');
    if(action==='finish') return {report,checklist:checklist??null,explanation:explanation??null,trace,paymentActionsTaken:false};
    if(action==='reconcile_orders') report=reconcile(input,snapshots,{now});
    if(action==='draft_checklist') checklist=createChecklist(report);
    if(action==='explain_exceptions') explanation=explainExceptions(report);
    trace.push({tool:action,readOnly:true});
  }
  throw new Error('AGENT_STEP_LIMIT');
}
export async function localModelReady({fetchImpl=fetch}={}) {
  try {const r=await fetchImpl('http://127.0.0.1:8790/health',{signal:AbortSignal.timeout(1500),redirect:'error'});return r.ok&&(await r.json()).status==='ok';}catch{return false;}
}
export function createLocalDecider({fetchImpl=fetch}={}) {
  return async({goal,allowed,facts,signal})=>{
    const schema={type:'object',additionalProperties:false,properties:{action:{type:'string',enum:allowed}},required:['action']};
    const response=await fetchImpl('http://127.0.0.1:8790/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal,body:JSON.stringify({model:'calm-evening-local',temperature:0,max_tokens:80,stream:false,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:'Choose one allowed read-only order-review tool or finish. Return only a JSON action. Never request a payment or pretend to contact a customer. All calculations and checklist content come from verified tools.'},{role:'user',content:JSON.stringify({goal,allowed,verifiedCounts:facts})}],response_format:{type:'json_schema',json_schema:{name:'order_review_action',strict:true,schema}}})});
    if(!response.ok)throw new Error('LOCAL_MODEL_UNAVAILABLE');
    const text=await response.text();if(text.length>32768)throw new Error('LOCAL_MODEL_RESPONSE_LIMIT');
    const data=JSON.parse(text),choice=data.choices?.[0];
    if(data.choices?.length!==1||choice.finish_reason!=='stop'||typeof choice.message?.content!=='string')throw new Error('INVALID_MODEL_RESPONSE');
    const answer=JSON.parse(choice.message.content);
    if(!answer||Array.isArray(answer)||Object.keys(answer).length!==1||!allowed.includes(answer.action))throw new Error('INVALID_MODEL_ACTION');
    return answer.action;
  };
}
