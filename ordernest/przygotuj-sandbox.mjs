import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {hidden} from './sandbox-local.mjs';
import {createUnpaidSandboxFixture} from './sandbox-fixture.mjs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {setupFailure} from './setup-errors.mjs';

const origin='http://127.0.0.1:8802';
const stateFile=new URL('../OrderNest-Sandbox-test-setup.json',import.meta.url);
const recordsFile=new URL('../OrderNest-Sandbox-records.json',import.meta.url);
const verificationFile=new URL('../OrderNest-Sandbox-live-verification.json',import.meta.url);
const save=(url,data)=>writeFile(url,JSON.stringify(data,null,2)+'\n');
export async function prepareSandbox({clientId,clientSecret,singleWindow=false}={}){
  process.stdout.write('OrderNest — pierwsze zamówienie testowe\nTylko PayPal Sandbox: 1,00 PLN, bez zatwierdzania lub pobierania płatności.\n'+(singleWindow?'Pozostaw TO okno otwarte.':'Pozostaw dotychczasowe okno OrderNest otwarte.')+'\n\n');
  const statusResponse=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(10000)});
  const status=await statusResponse.json();
  if(!statusResponse.ok||!status.sandboxConfigured)throw new Error('ORDERNEST_SANDBOX_NOT_RUNNING');
  let setup;
  try{setup=JSON.parse(await readFile(stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('SANDBOX_SETUP_FILE_INVALID');}
  if(!setup){setup={environment:'sandbox',requestId:randomUUID(),preparedAtUtc:new Date().toISOString(),createdOrder:null};await save(stateFile,setup);}
  if(setup.environment!=='sandbox'||!/^[a-f0-9-]{36}$/.test(setup.requestId))throw new Error('SANDBOX_SETUP_FILE_INVALID');
  if(!setup.createdOrder){
    if(setup.createAttemptedAtUtc)throw new Error('SANDBOX_SETUP_PREVIOUS_OUTCOME_UNKNOWN');
    clientId??=await hidden('Client ID Sandbox (ukryty): ');
    clientSecret??=await hidden('Secret Sandbox (ukryty): ');
    if(!clientId||!clientSecret)throw new Error('SANDBOX_SETUP_CREDENTIALS_REQUIRED');
    try{setup.createdOrder=await createUnpaidSandboxFixture({clientId,clientSecret,requestId:setup.requestId,beforeCreate:async()=>{setup.createAttemptedAtUtc=new Date().toISOString();await save(stateFile,setup);}});}
    finally{clientId='';clientSecret='';}
    setup.createdAtUtc=new Date().toISOString();await save(stateFile,setup);
  }else process.stdout.write('Używam już utworzonego zamówienia. Nie tworzę duplikatu.\n');
  const order=setup.createdOrder;
  if(!order||!/^[A-Z0-9]{1,36}$/.test(order.id)||order.amount!=='1.00'||order.currency!=='PLN'||order.environment!=='sandbox')throw new Error('SANDBOX_SETUP_FILE_INVALID');
  const records=[{id:'ON-SANDBOX-001',label:'Zamówienie testowe — 1 PLN',paypalOrderId:order.id,expectedAmount:'1.00',currency:'PLN'}];
  await save(recordsFile,records);
  process.stdout.write(`Zamówienie Sandbox: ${order.id}\nKwota: 1,00 PLN. Płatność nie została pobrana.\nSprawdzam rzeczywisty odczyt w OrderNest...\n`);
  const modelUsed=!!status.localModelReady;
  const response=await fetch(origin+(modelUsed?'/api/assistant':'/api/reconcile'),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({mode:'sandbox',records}),signal:AbortSignal.timeout(55000)});
  const result=await response.json();
  if(!response.ok)throw new Error(/^PAYPAL_HTTP_\d{3}$/.test(result.error??'')?result.error:'ORDERNEST_SANDBOX_READ_FAILED');
  const report=result.report;
  if(result.mode!=='sandbox'||!result.providerReadPerformed||report?.allLiveSandbox!==true||report.rows?.length!==1||report.rows[0].paypalOrderId!==order.id||report.rows[0].source!=='sandbox'||report.rows[0].category!=='waiting'||report.rows[0].paidMinor!==0||report.paymentActionsTaken!==false)throw new Error('ORDERNEST_SANDBOX_RESULT_UNEXPECTED');
  const evidence={verifiedAtUtc:new Date().toISOString(),environment:'sandbox',orderCreated:order,realSandboxOrderReadVerified:true,localModelUsed:result.modelUsed===true,
    summary:report.summary,toolTrace:result.trace,paymentCaptured:false,realMoneyUsed:false,credentialsStoredToDisk:false,report,checklist:result.checklist,downloads:result.downloads};
  await save(verificationFile,evidence);
  process.stdout.write('GOTOWE: PayPal Sandbox odczytany. Jedno zamówienie oczekujące, zero pobranych płatności.\n'+(result.modelUsed?'Lokalny AI również przygotował listę.\n':'Lokalny AI nie był dostępny; wykonano zwykły odczyt.\n')+'Zapisy i potwierdzenie zapisane obok katalogu aplikacji. Klucze nie zostały zapisane.\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareSandbox().catch(error=>{
  const failure=setupFailure(error);
  process.stdout.write('Nie ukończono testu: '+failure.code+'\n'+failure.message+'\nJeśli ID zostało utworzone, jest zachowane do ponownego odczytu.\n');process.exitCode=1;
});
