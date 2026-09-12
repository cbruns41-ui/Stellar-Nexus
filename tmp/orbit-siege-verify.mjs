import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9263;
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
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text || exceptionDetails.exception?.description || "eval failed");
  return result?.value;
}

async function shot(name, w, h, mobile) {
  await send("Page.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await sleep(350);
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(OUT, name), Buffer.from(data, "base64"));
  console.log("wrote", name);
}

await send("Page.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(200);

const started = await evalExpr(`(async () => {
  document.querySelector(".orbit-game")?.remove();
  const mod = await import("/js/orbit-siege.mjs?v=9");
  mod.startOrbitSiege({ planetName: "Probe" });
  return !!document.querySelector(".orbit-game");
})()`);
if (!started) throw new Error("orbit game did not start");
await sleep(500);

const state0 = await evalExpr(`(() => {
  const dock = document.querySelector("#build-dock");
  const go = document.querySelector("#build-go");
  const canvas = document.querySelector(".orbit-canvas");
  const r = canvas.getBoundingClientRect();
  const dr = dock.getBoundingClientRect();
  const TAU = Math.PI * 2;
  const W = r.width, H = r.height, cx = W / 2, cy = H * 0.42;
  const planetR = Math.min(W, H) * 0.058;
  const innerR = planetR * 2.55, outerR = planetR * 3.95;
  const slots = [];
  for (const [ring, n, rad, off] of [[0, 6, innerR, 0.5], [1, 8, outerR, 0]]) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i + off) * TAU / n;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      const covered = dr.width > 0 && x >= dr.left && x <= dr.right && y >= dr.top && y <= dr.bottom;
      slots.push({ ring, i, x, y, covered });
    }
  }
  return {
    salvage: document.querySelector("#salvage")?.textContent,
    dockHidden: !!dock.hidden,
    goHidden: !!go.hidden,
    goText: go?.textContent,
    shopItems: dock.querySelectorAll("[data-shop]").length,
    W, H, planetR,
    covered: slots.filter((s) => s.covered).length,
    slots,
  };
})()`);
console.log("state0", JSON.stringify(state0, null, 2));

await shot("phone-build-empty.png", 390, 844, true);

const target = state0.slots.find((s) => s.ring === 1 && s.i === 4) || state0.slots[0];
await evalExpr(`(() => {
  const canvas = document.querySelector(".orbit-canvas");
  const r = canvas.getBoundingClientRect();
  const x = ${target.x} + r.left;
  const y = ${target.y} + r.top;
  for (const type of ["pointerdown", "pointerup"]) {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch",
      clientX: x, clientY: y, buttons: type === "pointerdown" ? 1 : 0,
    }));
  }
  return true;
})()`);
await sleep(250);

const state1 = await evalExpr(`(() => {
  const dock = document.querySelector("#build-dock");
  const dr = dock.getBoundingClientRect();
  return {
    dockHidden: !!dock.hidden,
    dockTop: dock.classList.contains("dock-top"),
    shopItems: [...dock.querySelectorAll("[data-shop]")].map((b) => ({ id: b.dataset.shop, cost: b.querySelector("em")?.textContent })),
    dock: { top: dr.top, bottom: dr.bottom, height: dr.height },
  };
})()`);
console.log("state1", JSON.stringify(state1, null, 2));
await shot("phone-shop-open.png", 390, 844, true);

await evalExpr(`document.querySelector('[data-shop="mine"]')?.click(); true`);
await sleep(250);
const state2 = await evalExpr(`({
  dockHidden: !!document.querySelector("#build-dock").hidden,
  towers: document.querySelector("#towers")?.textContent,
  salvage: document.querySelector("#salvage")?.textContent,
})`);
console.log("state2", JSON.stringify(state2));

await evalExpr(`(() => {
  const canvas = document.querySelector(".orbit-canvas");
  const r = canvas.getBoundingClientRect();
  const root = document.querySelector(".orbit-game");
  for (let i = 0; i < 8; i++) {
    root.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY: -120,
      clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.42,
    }));
  }
  return true;
})()`);
await sleep(200);
await shot("phone-zoomed.png", 390, 844, true);

await send("Page.setDeviceMetricsOverride", { width: 900, height: 560, deviceScaleFactor: 2, mobile: false });
await sleep(400);
await evalExpr(`window.dispatchEvent(new Event("resize")); true`);
await sleep(200);
const wide = await evalExpr(`(() => {
  const dock = document.querySelector("#build-dock");
  const go = document.querySelector("#build-go");
  return { dockHidden: !!dock.hidden, goHidden: !!go.hidden, salvage: document.querySelector("#salvage")?.textContent };
})()`);
console.log("wide", JSON.stringify(wide));
await shot("wide-build.png", 900, 560, false);

const ok = {
  started,
  shopHiddenAtStart: state0.dockHidden === true,
  slotsUncoveredAtStart: state0.covered === 0,
  startSalvage: state0.salvage === "48",
  waveButtonVisible: state0.goHidden === false,
  shopOpensOnSlot: state1.dockHidden === false,
  mineCost: state1.shopItems.find((i) => i.id === "mine")?.cost,
  laserCost: state1.shopItems.find((i) => i.id === "laser")?.cost,
  shopClosesAfterPlace: state2.dockHidden === true,
  oneTower: state2.towers === "1",
  salvageAfterMine: state2.salvage === "3",
};
console.log("ok", JSON.stringify(ok, null, 2));
const failed = Object.entries(ok).filter(([, v]) => v !== true && v !== "45" && v !== "72" && v !== "3" && v !== "1" && v !== "48" && v !== false);
await writeFile(join(OUT, "verify.json"), JSON.stringify({ ok, state0, state1, state2, wide }, null, 2));

ws.close();
chrome.kill();
if (!ok.shopHiddenAtStart || !ok.slotsUncoveredAtStart || !ok.shopOpensOnSlot || !ok.shopClosesAfterPlace || !ok.oneTower) {
  process.exit(1);
}
process.exit(0);
