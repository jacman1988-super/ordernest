import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHandler} from './server.mjs';
import {localModelReady} from './assistant.mjs';

const port=8802;let child;
async function portFree(number){await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(new Error(`Port ${number} is busy or unavailable. Existing services were left running.`)));probe.listen(number,'127.0.0.1',()=>probe.close(resolve));});}
await portFree(port);
if(process.argv.includes('--with-ai')&&!(await localModelReady())) {
  const ownRuntime=fileURLToPath(new URL('.local-ai/llama-b11552/llama-server.exe',import.meta.url));
  const ownModel=fileURLToPath(new URL('.local-ai/Qwen3-1.7B-Q8_0.gguf',import.meta.url));
  const ownAvailable=existsSync(ownRuntime)&&existsSync(ownModel);
  const runtime=ownAvailable?ownRuntime:fileURLToPath(new URL('../calm-evening-mcp/.local-ai/llama-b11552/llama-server.exe',import.meta.url));
  const model=ownAvailable?ownModel:fileURLToPath(new URL('../calm-evening-mcp/.local-ai/Qwen3-1.7B-Q8_0.gguf',import.meta.url));
  if(!existsSync(runtime)||!existsSync(model))throw new Error('Existing local Qwen runtime is missing. Start without --with-ai for ordinary review. No model is downloaded automatically.');
  await portFree(8790);
  child=spawn(runtime,['-m',model,'--host','127.0.0.1','--port','8790','--alias','calm-evening-local','-c','4096','-t','4','-tb','4','--jinja','--no-webui','--log-disable','--offline'],{windowsHide:true,stdio:'ignore'});
  let exited=false;child.on('error',()=>{exited=true;});child.on('exit',()=>{exited=true;});
  const until=Date.now()+45000;let ready=false;
  while(!exited&&Date.now()<until){if(await localModelReady()){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready){child.kill();throw new Error('Local model readiness could not be verified. No existing model was stopped.');}
}
const server=createServer(createHandler({port,clientId:process.env.PAYPAL_SANDBOX_CLIENT_ID,clientSecret:process.env.PAYPAL_SANDBOX_CLIENT_SECRET}));
server.requestTimeout=60000;server.headersTimeout=10000;
server.once('error',()=>{child?.kill();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>process.stdout.write(`OrderNest: http://127.0.0.1:${port}/\nClose this process to stop the application.\n`));
function stop(){child?.kill();server.closeAllConnections();server.close(()=>process.exit(0));}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
