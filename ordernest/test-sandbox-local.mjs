// One private prompt session; the same keys start the application and create
// its single unpaid test order. No key file, card, capture or refund operation.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {hidden} from './sandbox-local.mjs';
import {prepareSandbox} from './przygotuj-sandbox.mjs';
import {setupFailure} from './setup-errors.mjs';
import {authenticateSandboxFixture} from './sandbox-fixture.mjs';
const origin='http://127.0.0.1:8802';let child;
async function main(){
 await new Promise((ok,fail)=>{const probe=createServer();probe.once('error',()=>fail(new Error('ORDERNEST_PORT_ALREADY_USED')));probe.listen(8802,'127.0.0.1',()=>probe.close(ok));});
 console.log('OrderNest — aplikacja i test w jednym oknie\nTylko Sandbox: jedno nieopłacone zamówienie 1 PLN. Żadnych prawdziwych pieniędzy.\nPozostaw TO okno otwarte. Klucze wpisujesz tylko raz i nie są zapisywane.\n');
 let clientId='',clientSecret='';
 for(let attempt=0;attempt<3;attempt++){
  clientId=await hidden('Client ID Sandbox (ukryty): ');
  clientSecret=await hidden('Secret Sandbox (ukryty): ');
  try{await authenticateSandboxFixture({clientId,clientSecret});break;}
  catch(error){clientId='';clientSecret='';if(error.message!=='SANDBOX_SETUP_AUTH_HTTP_401'||attempt===2)throw error;console.log('PayPal odrzucił tę parę kluczy. Skopiuj Client ID i Secret z TEJ SAMEJ aplikacji w zakładce Sandbox. Spróbuj ponownie poniżej. Klucze pozostają ukryte.');}
 }
 console.log('PayPal Sandbox: uwierzytelnienie potwierdzone. Uruchamiam aplikację...');
 child=spawn(process.execPath,['start-local.mjs','--with-ai'],{cwd:fileURLToPath(new URL('./',import.meta.url)),windowsHide:true,stdio:'inherit',env:{...process.env,PAYPAL_SANDBOX_CLIENT_ID:clientId,PAYPAL_SANDBOX_CLIENT_SECRET:clientSecret}});
 let exited=false;const finished=new Promise(resolve=>{child.once('error',()=>{exited=true;resolve(1);});child.once('exit',code=>{exited=true;resolve(code??1);});});
 const deadline=Date.now()+65000;let ready=false;
 try{
  while(Date.now()<deadline&&!exited){
   try{const response=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(2500)});const status=await response.json();if(response.ok&&status.sandboxConfigured===true&&status.provider==='PayPal sandbox'){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('ORDERNEST_SERVER_START_FAILED');
  try{await prepareSandbox({clientId,clientSecret,singleWindow:true});}
  catch(error){const failure=setupFailure(error);console.log('Nie ukończono testu: '+failure.code+'\n'+failure.message+'\nAplikacja nadal działa; nie zamykaj tego okna.');process.exitCode=1;}
 }finally{clientId='';clientSecret='';}
 if(ready){console.log('\nAPLIKACJA DZIAŁA: '+origin+'/\nPozostaw to okno otwarte. Zatrzymanie: Ctrl+C.');process.exitCode=await finished;}
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child?.kill(signal));
main().catch(error=>{child?.kill();const failure=setupFailure(error);console.log('Nie uruchomiono testu: '+failure.code+'\n'+(failure.code==='ORDERNEST_PORT_ALREADY_USED'?'Port 8802 jest zajęty. Istniejąca aplikacja nie została zatrzymana.':failure.message));process.exitCode=1;});
