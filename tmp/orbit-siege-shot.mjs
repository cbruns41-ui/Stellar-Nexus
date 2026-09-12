import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9251;
const OUT = join("tmp", "orbit-siege-review");
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
  "--use-angle=d3d11",
  "--hide-scrollbars",
  "--window-size=390,844",
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

await mkdir(OUT, { recursive: true });
await waitCdp();
const created = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/demos/orbit-siege/index.html`, { method: "PUT" }).then((r) => r.json());
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

await send("Page.enable");
await send("Runtime.enable");

async function shot(name, w, h, mobile) {
  await send("Page.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await sleep(400);
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(OUT, name), Buffer.from(data, "base64"));
  console.log("wrote", name);
}

async function evalExpr(expression) {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result?.value;
}

await send("Page.navigate", { url: "http://127.0.0.1:3000/demos/orbit-siege/index.html" });
await send("Page.loadEventFired").catch(() => {});
const t0 = Date.now();
while (Date.now() - t0 < 8000) {
  const ok = await evalExpr(`document.querySelector("canvas") && document.querySelector("#intro") && !document.querySelector("#intro").hidden`);
  if (ok) break;
  await sleep(200);
}
await sleep(700);
await shot("phone-intro.png", 390, 844, true);

await evalExpr(`document.getElementById("start").click(); true`);
const t1 = Date.now();
while (Date.now() - t1 < 6000) {
  const n = await evalExpr(`document.querySelector("#intro").hidden && document.getElementById("wave")?.textContent`);
  if (n) break;
  await sleep(150);
}
await sleep(900);
await evalExpr(`document.getElementById("aa").click(); true`);
await sleep(500);
await shot("phone-play.png", 390, 844, true);
await shot("wide-play.png", 900, 700, false);

const errs = await evalExpr(`window.__demoErrs || []`);
console.log("errs", JSON.stringify(errs));
ws.close();
chrome.kill();
process.exit(0);
