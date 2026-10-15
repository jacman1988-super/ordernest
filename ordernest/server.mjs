import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {reconcile,validateRecords,createChecklist} from './core.mjs';
import {makeReviewExport,formatReviewText} from './exports.mjs';
import {reasons,englishLabels} from './labels.mjs';
import {demoSnapshots} from './fixtures.mjs';
import {createSandboxReader} from './paypal.mjs';
import {runAssistant,createLocalDecider,localModelReady} from './assistant.mjs';

export function createHandler({port=8802,clientId,clientSecret,reader,decide=createLocalDecider(),modelReady=localModelReady,clock=Date.now}={}) {
  const origin=`http://127.0.0.1:${port}`;
  const configured=!!(clientId&&clientSecret);
  const sandboxReader=reader??(configured?createSandboxReader({clientId,clientSecret}):null);
  const assets=new Map([['/','index.html'],['/style.css','style.css'],['/browser-runtime.js','browser-runtime.js']]);
  const exportCache=new Map();
  function purgeExports(){for(const [key,value] of exportCache)if(value.expiresAt<clock())exportCache.delete(key);}
  function exportLinks(result,mode){
    purgeExports();while(exportCache.size>=16)exportCache.delete(exportCache.keys().next().value);
    const token=randomBytes(24).toString('hex');
    const content=makeReviewExport(result.report,result.checklist??createChecklist(result.report),result.trace,mode,{now:clock()});
    exportCache.set(token,{content,expiresAt:Date.parse(result.report.checkedAt)+600000});
    return Object.fromEntries(['pl','en'].map(lang=>[lang,{json:`/download/${token}/${lang}.json`,text:`/download/${token}/${lang}.txt`}]));
  }
  return async(req,res)=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
    function send(status,value,type='application/json; charset=utf-8',extra={}) {
      if(res.destroyed)return;
      res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(type.startsWith('application/json')?JSON.stringify(value):value);
    }
    try {
      if(req.headers.host!==`127.0.0.1:${port}`)return send(403,{error:'LOCAL_HOST_REQUIRED'});
      if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'LOCAL_ORIGIN_REQUIRED'});
      if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'LOCAL_ORIGIN_REQUIRED'});
      if(req.method==='GET'&&req.url.startsWith('/download/')){
        purgeExports();const match=/^\/download\/([a-f0-9]{48})\/(pl|en)\.(json|txt)$/.exec(req.url);
        const entry=match&&exportCache.get(match[1]);if(!entry)return send(404,{error:'EXPORT_EXPIRED_OR_UNKNOWN'});
        const [,token,lang,format]=match;const content=entry.content;
        const filename=`OrderNest-review-${content.illustrativeData?'DEMO':'SANDBOX'}.${format}`;
        if(format==='json')return send(200,content,'application/json; charset=utf-8',{'Content-Disposition':`attachment; filename="${filename}"`});
        const text=formatReviewText(content,{lang,reason:code=>reasons[lang][code],label:row=>lang==='en'&&row.paypalOrderId.startsWith('DEMOORDER')?englishLabels[row.id]??row.label:row.label});
        return send(200,text,'text/plain; charset=utf-8',{'Content-Disposition':`attachment; filename="${filename}"`});
      }
      if(req.method==='GET' && req.url==='/api/status')return send(200,{sandboxConfigured:!!sandboxReader,localModelReady:await modelReady(),provider:'PayPal sandbox',paymentActionsTaken:false});
      if(req.method==='GET' && assets.has(req.url)) {
        const file=assets.get(req.url),data=await readFile(new URL(`./dist/${file}`,import.meta.url));
        return send(200,data,file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
      }
      if(req.method!=='POST'||!['/api/reconcile','/api/assistant'].includes(req.url))return send(404,{error:'NOT_FOUND'});
      if(req.headers.origin!==origin)return send(403,{error:'LOCAL_ORIGIN_REQUIRED'});
      if(req.headers['content-type']!=='application/json')return send(415,{error:'JSON_REQUIRED'});
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>16384)return send(413,{error:'BODY_LIMIT'});chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'INVALID_JSON'});}
      if(!body || Array.isArray(body)||!['demo','sandbox'].includes(body.mode))return send(400,{error:'INVALID_REQUEST'});
      let records;try{records=validateRecords(body.records);}catch{return send(400,{error:'INVALID_RECORDS'});}
      if(body.mode==='sandbox'&&!sandboxReader)return send(409,{error:'PAYPAL_SANDBOX_NOT_CONFIGURED'});
      if(body.mode==='sandbox'&&records.some(r=>r.paypalOrderId.startsWith('DEMOORDER')))return send(400,{error:'DEMO_IDS_NOT_SANDBOX'});
      if(req.url==='/api/assistant'&&!(await modelReady()))return send(503,{error:'LOCAL_MODEL_UNAVAILABLE'});
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);
      const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
      try {
        const snapshots=body.mode==='demo'?demoSnapshots(new Date(clock()).toISOString()):{};
        if(body.mode==='sandbox')for(const id of new Set(records.map(r=>r.paypalOrderId)))snapshots[id]=await sandboxReader.getOrder(id,{signal:controller.signal});
        const result=req.url==='/api/assistant'?await runAssistant({records,snapshots,decide,goal:'checklist',signal:controller.signal,now:clock()}):{report:reconcile(records,snapshots,{now:clock()}),checklist:null,trace:[],paymentActionsTaken:false};
        return send(200,{...result,downloads:exportLinks(result,body.mode),mode:body.mode,providerReadPerformed:body.mode==='sandbox',modelUsed:req.url==='/api/assistant'});
      } finally {clearTimeout(timeout);res.off('close',disconnected);}
    } catch(error) {
      const code=String(error?.message??'');
      const safe=/^PAYPAL_HTTP_\d{3}$/.test(code)||['PAYPAL_INVALID_TOKEN','PAYPAL_INVALID_JSON','PAYPAL_RESPONSE_LIMIT','PAYPAL_INVALID_CAPTURE','INVALID_PROVIDER_ORDER','INVALID_MODEL_RESPONSE','INVALID_MODEL_ACTION','LOCAL_MODEL_UNAVAILABLE','AGENT_STEP_LIMIT'].includes(code)?code:'REQUEST_FAILED';
      send(502,{error:safe});
    }
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=8802;
  const server=http.createServer(createHandler({port,clientId:process.env.PAYPAL_SANDBOX_CLIENT_ID,clientSecret:process.env.PAYPAL_SANDBOX_CLIENT_SECRET}));
  server.requestTimeout=60000;server.headersTimeout=10000;
  server.listen(port,'127.0.0.1',()=>process.stdout.write(`OrderNest ready: http://127.0.0.1:${port}/\n`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
