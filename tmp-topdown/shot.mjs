import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9229;
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
  "--disable-gpu-sandbox",
  "--use-angle=d3d11",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--hide-scrollbars",
  "--window-size=1600,900",
  "about:blank",
], { stdio: "ignore" });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function version() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  if (!res.ok) throw new Error("cdp not up");
  return res.json();
}

for (let i = 0; i < 40; i++) {
  try { await version(); break; } catch { await sleep(250); }
}

const created = await fetch(`http://127.0.0.1:${PORT}/json/new?http://localhost:3000/unity-preview.html`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});

let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
});
function send(method, params = {}) {
  const n = ++id;
  return new Promise((resolve, reject) => {
    pending.set(n, (msg) => {
      pending.delete(n);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result || {});
    });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: "http://localhost:3000/unity-preview.html" });
await send("Page.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

const start = Date.now();
let ready = false;
while (Date.now() - start < 50000) {
  const { result } = await send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
  if (result?.value === "colony-ready") { ready = true; break; }
  await sleep(500);
}
await sleep(2500);
const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile("C:/Users/cbrun/Desktop/Stellar Nexus/tmp-topdown/unity-shot.png", Buffer.from(shot.data, "base64"));
console.log(ready ? "READY" : "TIMEOUT");
ws.close();
chrome.kill();
process.exit(ready ? 0 : 2);
