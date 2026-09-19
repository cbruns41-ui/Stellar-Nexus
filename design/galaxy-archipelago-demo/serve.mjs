import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const shared=new Map(['archipelago-map.mjs','archipelago-model.mjs','archipelago-integration.mjs','map.js','ui.js'].map(name=>['/integration/'+name,fileURLToPath(new URL('../../public/js/'+name,import.meta.url))]));
shared.set('/css/archipelago-map.css',fileURLToPath(new URL('../../public/css/archipelago-map.css',import.meta.url)));
shared.set('/css/style.css',fileURLToPath(new URL('../../public/css/style.css',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.json':'application/json','.md':'text/plain; charset=utf-8'};
export function createDemoServer(){return http.createServer(async(req,res)=>{
  try {
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://localhost');
    if(shared.has(url.pathname)){const file=shared.get(url.pathname),data=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:data);return;}
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    const relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
    let file;
    try{file=(await stat(target)).isDirectory()?path.join(target,'index.html'):target;}catch{
      if(!url.pathname.startsWith('/assets/'))throw Error('Not found');
      const assetRoot=fileURLToPath(new URL('../../public/assets/',import.meta.url));
      file=path.resolve(assetRoot,decodeURIComponent(url.pathname.slice('/assets/'.length)));
      const assetRelative=path.relative(assetRoot,file);if(assetRelative.startsWith('..')||path.isAbsolute(assetRelative))throw Error('Not found');
    }
    const data=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
  } catch {res.writeHead(404);res.end('Nicht gefunden');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.ARCHIPELAGO_DEMO_PORT||3122);
  createDemoServer().listen(port,'127.0.0.1',()=>console.log(`Archipel-Demo: http://localhost:${port}/`));
}
