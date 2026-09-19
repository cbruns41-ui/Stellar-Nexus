import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "design/galaxy-archipelago-demo/review");
const profile = path.join(root, "tmp/archipelago-live-chrome");
await mkdir(out, { recursive: true });
await mkdir(profile, { recursive: true });
const dbDir = await mkdtemp(path.join(os.tmpdir(), "archipelago-live-"));
const dbFile = path.join(dbDir, "stellar-nexus.db");
const port = 3017;
const chromePort = 9478;
const env = {
  ...process.env,
  PORT: String(port),
  DATABASE_PATH: dbFile,
  ARCHIPELAGO_COMPACT: "1",
};
const server = spawn(process.execPath, [path.join(root, "server.js")], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
const serverLog = [];
server.stdout.on("data", (c) => serverLog.push(String(c)));
server.stderr.on("data", (c) => serverLog.push(String(c)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chrome;
try {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) break;
    } catch {
      /* wait */
    }
    if (i === 79) throw new Error("Server did not start: " + serverLog.join(""));
    await sleep(250);
  }
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "Admin", password: "Wurm4444" }),
  });
  assert.equal(login.status, 200, await login.text());
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie, "session cookie");
  const token = cookie.split(";")[0].split("=").slice(1).join("=");
  const galaxy = await fetch(`http://127.0.0.1:${port}/api/galaxy`, { headers: { cookie } }).then((r) => r.json());
  assert.ok(galaxy.regions.length >= 3, "three open galaxies");
  assert.ok(galaxy.systems.every((s) => Number.isFinite(s.galaxyId)));
  assert.ok(galaxy.layout[galaxy.self.homeSystemId]);
  const home = galaxy.systems.find((s) => s.id === galaxy.self.homeSystemId);
  assert.equal(home.galaxyId, 0);

  chrome = spawn(
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--no-first-run", `--user-data-dir=${profile}`, `--remote-debugging-port=${chromePort}`, "about:blank"],
    { stdio: "ignore", windowsHide: true }
  );
  let page;
  for (let i = 0; i < 80; i++) {
    try {
      page = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
      break;
    } catch {
      await sleep(150);
    }
  }
  assert.ok(page, "Chrome started");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const d = JSON.parse(ev.data);
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.description || a.value).join(" "));
    if (pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      clearTimeout(p.timer);
      d.error ? p.reject(Error(d.error.message)) : p.resolve(d.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(Error(method + " timeout"));
      }, 45000);
      pending.set(n, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", {
    name: "sn_session",
    value: token,
    url: `http://127.0.0.1:${port}/`,
    httpOnly: true,
    path: "/",
  });
  const run = async (w, h) => {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    for (let i = 0; i < 100; i++) {
      if (await ev(`document.body.dataset.mode==='play'`)) break;
      if (i === 8) {
        await ev(`(()=>{const f=document.querySelector('#hero-login');if(!f)return;f.username.value='Admin';f.password.value='Wurm4444';f.requestSubmit();})()`);
      }
      await sleep(200);
    }
    assert.equal(await ev(`document.body.dataset.mode`), "play", "entered play mode");
    await ev(`document.querySelector('#tabbar [data-view="galaxy"]').click()`);
    for (let i = 0; i < 80; i++) {
      if (await ev(`!!document.querySelector('#starmap') && document.querySelectorAll('.archipelago-regions button').length>=4`)) break;
      await sleep(150);
    }
    const names = await ev(`[...document.querySelectorAll('.archipelago-regions button')].map(b=>b.textContent)`);
    if (!names.length) {
      const snap = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(path.join(out, "live-failure.png"), Buffer.from(snap.data, "base64"));
      throw Error("no region chips: " + (await ev(`document.body.dataset.mode+' '+document.querySelector('#view')?.innerHTML?.slice(0,400)`)));
    }
    assert.deepEqual(names.slice(0, 4), ["Alle", "AURELIA", "VESPER", "SOLARA"]);
    assert.ok(await ev(`!!document.querySelector('.map-help-toggle')`));
    await ev(`document.querySelector('.map-help-toggle').click()`);
    assert.ok(await ev(`!document.querySelector('#map-travel-help').hidden && /Sprungtor/.test(document.querySelector('#map-travel-help').textContent)`));
    const helpShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(out, `live-travel-help-${w}-${h}.png`), Buffer.from(helpShot.data, "base64"));
    await ev(`document.querySelector('.map-help-toggle').click()`);
    assert.ok(await ev(`document.querySelector('.map-wrap').classList.contains('archipelago-map')`));
    await ev(`document.querySelector('.map-search-toggle').click()`);
    await ev(`{const s=document.querySelector('#map-search');s.value=${JSON.stringify(home.name)};s.dispatchEvent(new Event('input',{bubbles:true}));}`);
    for (let i = 0; i < 40; i++) {
      if (await ev(`!!document.querySelector('[data-search-system="${home.id}"]')`)) break;
      await sleep(100);
    }
    await ev(`document.querySelector('[data-search-system="${home.id}"]').click()`);
    for (let i = 0; i < 40; i++) {
      if (await ev(`!!document.querySelector('[data-sys-close]') && !document.querySelector('#map-tools.open')`)) break;
      await sleep(100);
    }
    assert.ok(await ev(`!!document.querySelector('.sys-panel')`));
    assert.equal(await ev(`!!document.querySelector('#map-tools.open')`), false);
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(out, `live-galaxy-${w}-${h}.png`), Buffer.from(shot.data, "base64"));
    await ev(`document.querySelector('[data-sys-close]').click()`);
    await ev(`document.querySelector('.archipelago-regions [data-region="all"]').click()`);
    await sleep(500);
    const overview = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(out, `live-overview-${w}-${h}.png`), Buffer.from(overview.data, "base64"));
    await ev(`document.querySelector('.archipelago-regions [data-region="1"]').click()`);
    await sleep(400);
    console.log("Live galaxy UI passed", w, h);
  };
  await run(1440, 900);
  await run(390, 844);
  assert.deepEqual(errors, []);
  ws.close();
  console.log("Archipelago live map: regions, search, system sheet and screenshots passed");
} finally {
  chrome?.kill();
  server.kill();
}
