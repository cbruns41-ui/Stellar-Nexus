import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=fileURLToPath(new URL('./',import.meta.url));
const port=Number(process.env.ORBIT_DEMO_PORT||3121);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Ungueltiger Demo-Port.');
const url=`http://127.0.0.1:${port}/`;
async function available(){
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(1000)});
    const html=await response.text();
    if(!response.ok||!html.includes('id="launch"')||!html.includes('Orbit-Feuer'))
      throw Error(`Port ${port} wird von einem anderen Dienst verwendet.`);
    return true;
  } catch(error){if(error.message.includes('anderen Dienst'))throw error;return false;}
}
try {
  if(!await available()){
    const child=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url))],{
      cwd:here,detached:true,windowsHide:true,stdio:'ignore',env:process.env,
    });
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){
      if(await available()){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    if(!ready)throw Error('Demo-Server konnte nicht gestartet werden. Node.js und Port pruefen.');
    console.log('Demo-Server gestartet.');
  } else console.log('Demo-Server laeuft bereits.');
  console.log(url);
  if(!process.argv.includes('--no-browser')){
    const browser=spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'});
    browser.once('error',error=>console.error('Browser bitte selbst oeffnen: '+error.message));
    browser.unref();
  }
} catch(error){console.error(error.message);process.exitCode=1;}
