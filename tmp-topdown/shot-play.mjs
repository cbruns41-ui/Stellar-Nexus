import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9230;
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
  "--use-angle=d3d11",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--hide-scrollbars",
  "--window-size=1400,900",
  "about:blank",
], { stdio: "ignore" });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitCdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error("cdp down");
}

await waitCdp();
const login = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "Admin", password: "Wurm4444" }),
});
const setCookie = login.headers.get("set-cookie") || "";
const token = /sn_session=([^;]+)/.exec(setCookie)?.[1];
if (!token) throw new Error("no session cookie");

const created = await fetch(`http://127.0.0.1:${PORT}/json/new?http://localhost:3000/play.html`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});

let n = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
});
function send(method, params = {}) {
  const id = ++n;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => {
      pending.delete(id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result || {});
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");
await send("Network.setCookie", {
  name: "sn_session",
  value: token,
  url: "http://localhost:3000/",
});
await send("Page.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/play.html" });

const start = Date.now();
let ready = false;
while (Date.now() - start < 50000) {
  const { result } = await send("Runtime.evaluate", {
    expression: `!!(document.querySelector('.city-view.diorama .city-vista')?.complete && document.querySelectorAll('.city-plot').length > 10)`,
    returnByValue: true,
  });
  if (result?.value) { ready = true; break; }
  await sleep(500);
}
await sleep(2000);
let shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile("C:/Users/cbrun/Desktop/Stellar Nexus/tmp-topdown/play-shot.png", Buffer.from(shot.data, "base64"));

await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 430, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 430, button: "left", clickCount: 1 });
await sleep(800);
shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile("C:/Users/cbrun/Desktop/Stellar Nexus/tmp-topdown/play-click.png", Buffer.from(shot.data, "base64"));
const dock = await send("Runtime.evaluate", {
  expression: `{ hidden: !!document.getElementById('city-actions')?.hidden, html: document.getElementById('city-actions')?.innerText || '' }`,
  returnByValue: true,
});
console.log(JSON.stringify({ ready, dock: dock.result?.value }));
ws.close();
chrome.kill();
process.exit(ready ? 0 : 2);
