import {normalizeOrder} from './core.mjs';
const origin='https://api-m.sandbox.paypal.com';
async function boundedJson(response) {
  if(!response.ok) throw new Error(`PAYPAL_HTTP_${response.status}`);
  let size=0;const chunks=[];
  for await(const chunk of response.body) {size+=chunk.length;if(size>262144)throw new Error('PAYPAL_RESPONSE_LIMIT');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('PAYPAL_INVALID_JSON');}
}
export function createSandboxReader({clientId,clientSecret,fetchImpl=fetch,clock=Date.now}={}) {
  if(typeof clientId!=='string'||!clientId||typeof clientSecret!=='string'||!clientSecret)throw new Error('PAYPAL_SANDBOX_NOT_CONFIGURED');
  let token,expiresAt=0;
  async function authenticate(signal) {
    if(token && expiresAt>clock()+30000)return token;
    const response=await fetchImpl(origin+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:'grant_type=client_credentials',signal,redirect:'error'});
    const data=await boundedJson(response);
    if(typeof data.access_token!=='string'||!data.access_token||data.token_type!=='Bearer'||!Number.isFinite(data.expires_in)||data.expires_in<1)throw new Error('PAYPAL_INVALID_TOKEN');
    token=data.access_token;expiresAt=clock()+Math.min(data.expires_in,3600)*1000;return token;
  }
  return Object.freeze({
    async getOrder(id,{signal=AbortSignal.timeout(10000)}={}) {
      if(typeof id!=='string'||!/^[A-Z0-9]{1,36}$/.test(id))throw new Error('INVALID_PAYPAL_ORDER_ID');
      const bearer=await authenticate(signal);
      const response=await fetchImpl(origin+'/v2/checkout/orders/'+id,{method:'GET',headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},signal,redirect:'error'});
      const raw=await boundedJson(response);
      // Validate the bounded order before following capture identifiers. Never
      // follow provider-supplied URLs or assume an embedded capture is current.
      const initial=normalizeOrder(raw,id,{source:'sandbox',checkedAt:new Date(clock()).toISOString()});
      const details=new Map();
      for(const capture of initial.captures){
        if(!/^[A-Z0-9]{1,36}$/.test(capture.id))throw new Error('PAYPAL_INVALID_CAPTURE');
        const r=await fetchImpl(origin+'/v2/payments/captures/'+capture.id,{method:'GET',headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},signal,redirect:'error'});
        const detail=await boundedJson(r);
        if(!detail||detail.id!==capture.id||typeof detail.status!=='string'||detail.amount?.currency_code!==capture.currency)throw new Error('PAYPAL_INVALID_CAPTURE');
        const related=detail.supplementary_data?.related_ids?.order_id;
        if(related!==undefined&&related!==id)throw new Error('PAYPAL_INVALID_CAPTURE');
        // Gross capture amounts must agree; refunds are represented by status,
        // not by silently substituting a smaller net amount.
        let normalized;
        try{normalized=normalizeOrder({id,status:raw.status,purchase_units:[{payments:{captures:[detail]}}]},id).captures[0];}
        catch{throw new Error('PAYPAL_INVALID_CAPTURE');}
        if(normalized.minor!==capture.minor)throw new Error('PAYPAL_INVALID_CAPTURE');
        details.set(capture.id,{id:detail.id,status:detail.status,amount:{currency_code:detail.amount.currency_code,value:detail.amount.value}});
      }
      const refreshed={id:raw.id,status:raw.status,purchase_units:raw.purchase_units.map(unit=>({payments:{captures:(unit.payments?.captures??[]).map(c=>details.get(c.id)),refunds:unit.payments?.refunds??[]}}))};
      return {...normalizeOrder(refreshed,id,{source:'sandbox',checkedAt:new Date(clock()).toISOString()}),captureDetailsChecked:details.size};
    }
  });
}
// The fixed sandbox origin and GET order/capture operations intentionally provide
// no creation, capture, refund, transfer, tracking or live-money endpoint.
