import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Interactive local entry only. Credentials are never sent to the chat,
// echoed, logged or saved to a credential file by this launcher.
export function hidden(prompt) {
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Otwórz ten program w zwykłym oknie konsoli.');
  return new Promise((resolve,reject)=>{
    let value='';const previousRaw=process.stdin.isRaw;
    readline.emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write(prompt);
    function finish(){process.stdin.off('keypress',key);process.stdin.setRawMode(!!previousRaw);process.stdin.pause();process.stdout.write('\n');}
    function key(text,info={}) {
      if(info.ctrl&&['c','z'].includes(info.name)){finish();reject(new Error('Anulowano.'));return;}
      if(info.name==='return'||info.name==='enter'){finish();resolve(value);return;}
      if(info.name==='backspace'){if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b');}return;}
      if(info.ctrl||info.meta)return;
      for(const char of text??''){if(/[\x21-\x7e]/.test(char)&&value.length<1024){value+=char;process.stdout.write('*');}}
    }
    process.stdin.on('keypress',key);
  });
}
async function main(){
  process.stdout.write('OrderNest — prywatne podłączenie PayPal Sandbox\nWpisz lub wklej klucze z Default Application w trybie Sandbox.\nKlucze pozostaną w pamięci lokalnego procesu. Nie wpisuj ich do czatu.\n\n');
  let clientId=await hidden('Client ID (ukryty): ');
  let clientSecret=await hidden('Secret (ukryty): ');
  if(!clientId||!clientSecret)throw new Error('Potrzebne są obie wartości.');
  const cwd=fileURLToPath(new URL('./',import.meta.url));
  const build=spawn(process.execPath,['build.mjs'],{cwd,stdio:'inherit'});
  const buildCode=await new Promise(resolve=>{build.once('error',()=>resolve(1));build.once('exit',resolve);});
  if(buildCode!==0)throw new Error('Nie udało się przygotować strony.');
  const args=['start-local.mjs',...(process.argv.includes('--with-ai')?['--with-ai']:[])];
  const child=spawn(process.execPath,args,{cwd,stdio:'inherit',env:{...process.env,PAYPAL_SANDBOX_CLIENT_ID:clientId,PAYPAL_SANDBOX_CLIENT_SECRET:clientSecret}});
  clientId='';clientSecret='';
  process.once('SIGINT',()=>child.kill('SIGINT'));
  const code=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',resolve);});
  process.exitCode=code??1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{process.stdout.write(String(error.message)+'\n');process.exitCode=1;});
