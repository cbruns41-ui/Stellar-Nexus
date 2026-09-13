import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9265;
const OUT = join("tmp", "orbit-siege-review");
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
  "--use-angle=d3d11",
  "--hide-scrollbars",
  "--window-size=1280,800",
  "about:blank",
], { stdio: "ignore" });
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitCdp() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error("cdp down");
}
await mkdir(OUT, { recursive: true });
await waitCdp();
const created = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
let n = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg); });
function send(method, params = {}) {
  const id = ++n;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => { pending.delete(id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result || {}); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalExpr(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text || exceptionDetails.exception?.description || "eval failed");
  return result?.value;
}
await send("Page.enable");
await send("Runtime.enable");
await send("Page.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:3000/" });
await send("Page.loadEventFired").catch(() => {});
await sleep(400);
await evalExpr(`(async () => {
  document.querySelector(".orbit-game")?.remove();
  document.querySelector(".orbit-backdrop")?.remove();
  const mod = await import("/js/orbit-siege.mjs?v=10");
  mod.startOrbitSiege({ planetName: "Probe" });
  return true;
})()`);
await sleep(600);
const info = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const cs = getComputedStyle(root);
  const r = root.getBoundingClientRect();
  const canvas = root.querySelector("canvas");
  return {
    className: root.className,
    onScreen: r.x >= -2 && r.y >= -2 && r.x + r.width <= 1282 && r.y + r.height <= 802,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    style: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, width: cs.width, height: cs.height, transform: cs.transform, position: cs.position },
    vars: { w: cs.getPropertyValue("--orbit-w"), h: cs.getPropertyValue("--orbit-h") },
    canvas: { w: canvas.width, h: canvas.height, styleW: canvas.style.width, styleH: canvas.style.height },
    view: root.orbitView(),
    children: root.children.length,
  };
})()`);
console.log(JSON.stringify(info, null, 2));
const dataUrl = await evalExpr(`document.querySelector(".orbit-canvas").toDataURL("image/png")`);
await writeFile(join(OUT, "canvas.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true });
await writeFile(join(OUT, "page.png"), Buffer.from(data, "base64"));
console.log("wrote canvas.png and page.png");
ws.close();
chrome.kill();
