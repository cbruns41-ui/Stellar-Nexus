import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'};
export function createPreviewServer(){return http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    const relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
    const file=(await stat(target)).isDirectory()?path.join(target,'index.html'):target;
    const data=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Nicht gefunden');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.WERFT_PREVIEW_PORT||3120);
  createPreviewServer().listen(port,'127.0.0.1',()=>console.log(`Werft-Vorschau: http://localhost:${port}/`));
}
