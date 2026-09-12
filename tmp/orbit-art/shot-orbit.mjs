import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9277;
const OUT = join("tmp", "orbit-art", "shots");
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
const created = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/`, { method: "PUT" }).then((r) => r.json());
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
await send("Page.navigate", { url: "http://127.0.0.1:3000/" });
await send("Page.loadEventFired").catch(() => {});
await sleep(400);

async function evalExpr(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || exceptionDetails.exception?.description || "eval failed");
  return result?.value;
}

async function shot(name, w, h, mobile) {
  await send("Page.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await sleep(280);
  await evalExpr(`window.dispatchEvent(new Event("resize")); true`);
  await sleep(220);
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(OUT, name), Buffer.from(data, "base64"));
  console.log("wrote", name);
}

await send("Page.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(200);

const started = await evalExpr(`(async () => {
  document.querySelector(".orbit-game")?.remove();
  const mod = await import("/js/orbit-siege.mjs?v=" + Date.now());
  mod.startOrbitSiege({ planetName: "Grafik" });
  const root = document.querySelector(".orbit-game");
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const g = root?.orbitGame;
    if (g) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !!root;
})()`);
if (!started) throw new Error("orbit did not start");
await sleep(900);

const planted = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const g = root.orbitGame;
  const TAU = Math.PI * 2;
  const angOf = (ring, i) => {
    const n = ring === 0 ? 6 : 8;
    const off = ring === 0 ? 0.5 : 0;
    return -Math.PI / 2 + (i + off) * TAU / n;
  };
  const mk = (ring, slot, kind) => ({ ring, slot, ang: angOf(ring, slot), kind, cd: 0, lock: null, flash: 0, armed: 1 });
  g.salvage = 900;
  g.towers = [
    mk(0, 0, "laser"),
    mk(0, 2, "tesla"),
    mk(0, 4, "mine"),
    mk(1, 1, "silo"),
    mk(1, 3, "flak"),
    mk(1, 5, "gauss"),
  ];
  const canvas = document.querySelector(".orbit-canvas");
  const r = canvas.getBoundingClientRect();
  const W = r.width, H = r.height, cx = W/2, cy = H*0.42;
  g.enemies = [
    { x: cx + 90, y: cy - 130, r: 14, hp: 1, max: 1, heavy: false, flash: 0, speed: 0, wobble: 0, trail: [], launchCd: 9 },
    { x: cx - 110, y: cy + 40, r: 22, hp: 3, max: 3, heavy: true, flash: 0, speed: 0, wobble: 0, trail: [], launchCd: 9 },
  ];
  g.rockets = [{ x: cx + 70, y: cy + 110, vx: 0, vy: -40, hp: 1, r: 8, trail: [], warn: 0 }];
  g.mode = "play";
  g.aim = -Math.PI / 2;
  document.querySelector("#build-dock").hidden = true;
  return { towers: g.towers.length, enemies: g.enemies.length };
})()`);
console.log("planted", JSON.stringify(planted));
await sleep(400);

await shot("phone-combat.png", 390, 844, true);
await shot("wide-combat.png", 960, 620, false);

await evalExpr(`(() => {
  const g = document.querySelector(".orbit-game").orbitGame;
  g.mode = "build";
  g.pendingSlot = { ring: 1, i: 2 };
  document.querySelector("#build-dock").hidden = false;
  document.querySelector("#build-hint").textContent = "Turm für diesen Bauplatz wählen";
  const shop = document.querySelector("#shop");
  shop.innerHTML = "";
  return true;
})()`);

await evalExpr(`(() => {
  const g = document.querySelector(".orbit-game").orbitGame;
  const items = [
    ...["laser","silo","flak","gauss","tesla","mine"].map((id) => ({ id, type: "tower" })),
  ];
  const shop = document.querySelector("#shop");
  shop.innerHTML = items.map((item) => {
    const src = {
      laser: "/assets/orbit-siege/turret-laser.png",
      silo: "/assets/orbit-siege/turret-silo.png",
      flak: "/assets/orbit-siege/turret-flak.png",
      gauss: "/assets/orbit-siege/turret-gauss.png",
      tesla: "/assets/orbit-siege/turret-tesla.png",
      mine: "/assets/orbit-siege/turret-mine.png",
    }[item.id];
    return '<button type="button" class="orbit-shop-item" data-shop="'+item.id+'"><img src="'+src+'" alt=""><b>'+item.id.toUpperCase()+'</b><em>70</em></button>';
  }).join("");
  return shop.querySelectorAll("img").length;
})()`);
await sleep(500);
await shot("phone-shop.png", 390, 844, true);

chrome.kill();
ws.close();
console.log("ok");
process.exit(0);
