// Separate, opt-in test-data setup. Not imported by the read-only application.
// Fixed Sandbox destination, a single unpaid 1.00 PLN order, no payment source.
const origin='https://api-m.sandbox.paypal.com';
async function boundedJson(response,stage='ORDER'){
  if(!response.ok)throw new Error(`SANDBOX_SETUP_${stage}_HTTP_${response.status}`);
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>262144)throw new Error('SANDBOX_SETUP_RESPONSE_LIMIT');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('SANDBOX_SETUP_INVALID_JSON');}
}
export async function authenticateSandboxFixture({clientId,clientSecret,fetchImpl=fetch,signal=AbortSignal.timeout(20000)}={}){
  if(typeof clientId!=='string'||!clientId||typeof clientSecret!=='string'||!clientSecret)throw new Error('SANDBOX_SETUP_CREDENTIALS_REQUIRED');
  const token=await boundedJson(await fetchImpl(origin+'/v1/oauth2/token',{method:'POST',redirect:'error',signal,
    headers:{Authorization:'Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:'grant_type=client_credentials'}),'AUTH');
  if(typeof token.access_token!=='string'||!token.access_token||token.token_type!=='Bearer')throw new Error('SANDBOX_SETUP_INVALID_TOKEN');
  return token.access_token;
}
export async function createUnpaidSandboxFixture({clientId,clientSecret,requestId,fetchImpl=fetch,signal=AbortSignal.timeout(20000),beforeCreate=async()=>{}}={}){
  if(typeof clientId!=='string'||!clientId||typeof clientSecret!=='string'||!clientSecret)throw new Error('SANDBOX_SETUP_CREDENTIALS_REQUIRED');
  if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('SANDBOX_SETUP_REQUEST_ID_REQUIRED');
  const token=await authenticateSandboxFixture({clientId,clientSecret,fetchImpl,signal});
  await beforeCreate();
  const order=await boundedJson(await fetchImpl(origin+'/v2/checkout/orders',{method:'POST',redirect:'error',signal,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','PayPal-Request-Id':requestId,Prefer:'return=minimal'},
    body:JSON.stringify({intent:'CAPTURE',purchase_units:[{amount:{currency_code:'PLN',value:'1.00'}}]})}));
  if(typeof order.id!=='string'||!/^[A-Z0-9]{1,36}$/.test(order.id)||!['CREATED','PAYER_ACTION_REQUIRED'].includes(order.status))throw new Error('SANDBOX_SETUP_UNEXPECTED_ORDER');
  // Never return tokens, customer data, provider links or approval URLs.
  return {id:order.id,status:order.status,amount:'1.00',currency:'PLN',environment:'sandbox',paymentCaptured:false};
}
