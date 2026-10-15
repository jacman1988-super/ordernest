// Actual read-only acceptance checks against the separately running application.
// No credentials, provider writes, payment approval or fictional snapshots.
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const origin='http://127.0.0.1:8802';
const valid=id=>typeof id==='string'&&/^[A-Z0-9]{1,36}$/.test(id)&&!id.startsWith('DEMOORDER');
export async function verifySandboxCases({waiting,completed,refunded,fetchImpl=fetch}={}){
 const chosen=[waiting,completed,refunded].filter(Boolean);
 if(!chosen.length||chosen.some(id=>!valid(id))||new Set(chosen).size!==chosen.length)throw new Error('INVALID_SANDBOX_CASE_IDS');
 const statusResponse=await fetchImpl(origin+'/api/status',{signal:AbortSignal.timeout(10000)});
 const status=await statusResponse.json();
 if(!statusResponse.ok||status.sandboxConfigured!==true||status.provider!=='PayPal sandbox')throw new Error('SANDBOX_SERVER_REQUIRED');
 const cases=[
  {name:'waiting',id:waiting,amount:'1.00',reason:'not_captured',category:'waiting'},
  {name:'completed',id:completed,amount:'1.00',reason:'capture_matches_record',category:'matched'},
  {name:'mismatched',id:completed,amount:'2.00',reason:'amount_mismatch',category:'review'},
  {name:'refunded',id:refunded,amount:'1.00',reason:'refund_requires_review',category:'review'}
 ];
 const results=[];
 for(const item of cases){
  if(!item.id){results.push({name:item.name,state:'not_run',why:'Actual Sandbox order ID not supplied'});continue;}
  const record={id:'VERIFY1',label:'Sandbox acceptance check',paypalOrderId:item.id,expectedAmount:item.amount,currency:'PLN'};
  const response=await fetchImpl(origin+'/api/reconcile',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({mode:'sandbox',records:[record]}),signal:AbortSignal.timeout(55000)});
  let result;try{result=await response.json();}catch{throw new Error('INVALID_SANDBOX_RESPONSE');}
  if(!response.ok)throw new Error('SANDBOX_CASE_READ_FAILED');
  const row=result.report?.rows?.[0];
  if(result.mode!=='sandbox'||result.providerReadPerformed!==true||result.report?.allLiveSandbox!==true||result.report?.paymentActionsTaken!==false||result.report.rows.length!==1||row.paypalOrderId!==item.id||row.source!=='sandbox')throw new Error('SANDBOX_PROVENANCE_REQUIRED');
  const passed=row.category===item.category&&row.reason===item.reason;
  results.push({name:item.name,state:passed?'passed':'failed',orderId:item.id,expectedAmount:item.amount,currency:'PLN',expectedCategory:item.category,expectedReason:item.reason,actualCategory:row.category,actualReason:row.reason,paidMinor:row.paidMinor,checkedAt:row.checkedAt,source:row.source});
 }
 return {atUtc:new Date().toISOString(),environment:'sandbox',kind:'Actual local HTTP route to PayPal Sandbox; no model call',paymentActionsTaken:false,realMoneyUsed:false,allCasesPassed:results.every(r=>r.state==='passed'),results};
}
async function main(){
 console.log('OrderNest — rzeczywiste odczyty Sandbox. Bez płatności, capture, zwrotów i kluczy w tym narzędziu.');
 console.log('Opcjonalne zamówienia muszą być w PLN: opłacone na 1,00 PLN oraz osobne zwrócone na 1,00 PLN.');
 console.log('Niezgodność sprawdzamy lokalnie: porównamy rzeczywisty capture 1,00 PLN z zapisem sklepu 2,00 PLN.');
 let waiting='';try{const saved=JSON.parse(await readFile(new URL('../OrderNest-Sandbox-test-setup.json',import.meta.url),'utf8'));if(valid(saved.createdOrder?.id))waiting=saved.createdOrder.id;}catch{}
 const rl=createInterface({input:process.stdin,output:process.stdout});let completed,refunded;
 try{
  waiting=(await rl.question(`ID oczekującego zamówienia [${waiting||'brak'}]: `)).trim()||waiting;
  completed=(await rl.question('ID opłaconego zamówienia (Enter = pomiń): ')).trim();
  refunded=(await rl.question('ID osobnego zwróconego zamówienia (Enter = pomiń): ')).trim();
 }finally{rl.close();}
 const report=await verifySandboxCases({waiting,completed,refunded});
 await writeFile(new URL('../OrderNest-Sandbox-acceptance-latest.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 for(const item of report.results)console.log(`${item.name}: ${item.state}${item.actualReason?' / '+item.actualReason:''}`);
 console.log(report.allCasesPassed?'Wszystkie cztery rzeczywiste scenariusze przeszły.':'Sprawdzono tylko podane scenariusze; brakujących nie zaliczamy.');
 if(report.results.some(r=>r.state==='failed'))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Nie ukończono odczytu. Uruchom OrderNest z kluczami Sandbox i sprawdź podane testowe ID. Nie wklejaj kluczy do czatu.');process.exitCode=1;});
