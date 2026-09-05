import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9334;
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
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
const token = /sn_session=([^;]+)/.exec(login.headers.get("set-cookie") || "")?.[1];
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
await send("Network.setCookie", { name: "sn_session", value: token, url: "http://localhost:3000/" });

async function shot(width, height, mobile, name) {
  await send("Page.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Page.navigate", { url: "http://localhost:3000/play.html" });
  const start = Date.now();
  let info = null;
  while (Date.now() - start < 25000) {
    const { result } = await send("Runtime.evaluate", {
      expression: `(() => {
        const v = document.querySelector('video.city-vista');
        return {
          hasVideo: !!v,
          ready: v ? v.readyState : 0,
          src: v ? v.currentSrc : '',
          unity: !!document.querySelector('.city-view.is-unity'),
          plots: document.querySelectorAll('.city-plot').length,
        };
      })()`,
      returnByValue: true,
    });
    info = result?.value;
    if (info?.hasVideo && info?.ready >= 2) break;
    await sleep(400);
  }
  await sleep(1800);
  const cap = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(new URL(`./${name}`, import.meta.url), Buffer.from(cap.data, "base64"));
  console.log(name, JSON.stringify(info));
}

await shot(1400, 900, false, "living-desktop.png");
await shot(390, 844, true, "living-mobile.png");
ws.close();
chrome.kill();
process.exit(0);
