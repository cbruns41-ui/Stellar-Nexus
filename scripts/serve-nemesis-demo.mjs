import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp'};
export function createDemoServer(){return http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(publicRoot,'.'+pathname),relative=path.relative(publicRoot,target);if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}let file=target;if((await stat(file)).isDirectory())file=path.join(file,'index.html');const data=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.DEMO_PORT||3110);createDemoServer().listen(port,'127.0.0.1',()=>console.log(`NEMESIS demo: http://localhost:${port}/demos/nemesis/`));}
