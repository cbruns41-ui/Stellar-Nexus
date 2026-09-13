import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9264;
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
await send("Page.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:3000/" });
await send("Page.loadEventFired").catch(() => {});
await sleep(500);

async function evalExpr(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text || exceptionDetails.exception?.description || "eval failed");
  return result?.value;
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(OUT, name), Buffer.from(data, "base64"));
  console.log("wrote", name);
}

const started = await evalExpr(`(async () => {
  document.querySelector(".orbit-game")?.remove();
  document.querySelector(".orbit-backdrop")?.remove();
  const mod = await import("/js/orbit-siege.mjs?v=10");
  mod.startOrbitSiege({ planetName: "Probe" });
  return !!document.querySelector(".orbit-game");
})()`);
if (!started) throw new Error("orbit game did not start");
await sleep(400);

const view0 = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const r = root.getBoundingClientRect();
  return {
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    ...(root.orbitView?.() || {}),
  };
})()`);
console.log("view0", JSON.stringify(view0));
await shot("desktop-window.png");

await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const r = root.getBoundingClientRect();
  for (let i = 0; i < 10; i++) {
    root.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY: 180,
      clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.42,
    }));
  }
  return true;
})()`);
await sleep(250);
const view1 = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const r = root.getBoundingClientRect();
  return { box: { w: Math.round(r.width), h: Math.round(r.height) }, ...(root.orbitView?.() || {}) };
})()`);
console.log("view1", JSON.stringify(view1));
await shot("desktop-shrunk.png");

await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const r = root.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    root.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY: -180,
      clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.42,
    }));
  }
  return true;
})()`);
await sleep(250);
const view2 = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const r = root.getBoundingClientRect();
  return { box: { w: Math.round(r.width), h: Math.round(r.height) }, ...(root.orbitView?.() || {}) };
})()`);
console.log("view2", JSON.stringify(view2));

const placed = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const view = root.orbitView();
  const canvas = document.querySelector(".orbit-canvas");
  const r = canvas.getBoundingClientRect();
  const TAU = Math.PI * 2;
  const i = 4;
  const a = -Math.PI / 2 + (i + 0.5) * TAU / view.slotN;
  const x = r.left + view.W / 2 + Math.cos(a) * view.ringR;
  const y = r.top + view.H * 0.42 + Math.sin(a) * view.ringR;
  for (const type of ["pointerdown", "pointerup"]) {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse",
      clientX: x, clientY: y, buttons: type === "pointerdown" ? 1 : 0,
    }));
  }
  return { x, y, shop: !document.querySelector("#build-dock").hidden };
})()`);
await sleep(200);
const shopOpen = await evalExpr(`({
  hidden: !!document.querySelector("#build-dock").hidden,
  items: [...document.querySelectorAll("[data-shop]")].map((b) => ({ id: b.dataset.shop, cost: b.querySelector("em")?.textContent })),
  hint: document.querySelector("#build-hint")?.textContent,
})`);
console.log("shop", JSON.stringify({ placed, shopOpen }));
await evalExpr(`document.querySelector('[data-shop="laser"]')?.click(); true`);
await sleep(200);
const afterPlace = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const beforeBoost = root.orbitView();
  root.orbitGame.salvage = 200;
  return { ...beforeBoost, towersHud: document.querySelector("#towers")?.textContent, salvageHud: document.querySelector("#salvage")?.textContent };
})()`);
console.log("afterPlace", JSON.stringify(afterPlace));

const reopen = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const view = root.orbitView();
  const canvas = document.querySelector(".orbit-canvas");
  const r = canvas.getBoundingClientRect();
  const t = view.towers[0];
  const TAU = Math.PI * 2;
  const a = -Math.PI / 2 + (t.slot + 0.5) * TAU / view.slotN;
  const x = r.left + view.W / 2 + Math.cos(a) * view.ringR;
  const y = r.top + view.H * 0.42 + Math.sin(a) * view.ringR;
  for (const type of ["pointerdown", "pointerup"]) {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 8, pointerType: "mouse",
      clientX: x, clientY: y, buttons: type === "pointerdown" ? 1 : 0,
    }));
  }
  return true;
})()`);
await sleep(200);
await evalExpr(`document.querySelector('[data-shop="upgrade"]')?.click(); true`);
await sleep(200);
const afterUp = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  return {
    ...(root.orbitView?.() || {}),
    hint: document.querySelector("#build-hint")?.textContent,
    items: [...document.querySelectorAll("[data-shop]")].map((b) => b.dataset.shop),
  };
})()`);
console.log("afterUp", JSON.stringify(afterUp));
await shot("desktop-upgraded.png");

await send("Page.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(350);
await evalExpr(`window.dispatchEvent(new Event("resize")); true`);
await sleep(200);
const phone = await evalExpr(`(() => {
  const root = document.querySelector(".orbit-game");
  const r = root.getBoundingClientRect();
  return { box: { w: Math.round(r.width), h: Math.round(r.height) }, ...(root.orbitView?.() || {}) };
})()`);
console.log("phone", JSON.stringify(phone));
await shot("phone-window.png");

const ok = {
  started,
  oneRing: view0.slotN === 6,
  startSalvage: view0.salvage === 85,
  planetCapped: view0.planetR <= 52.1,
  onScreen: view0.box.x >= 0 && view0.box.y >= 0 && view0.box.x + view0.box.w <= 1280 && view0.box.y + view0.box.h <= 800,
  windowNotFull: view0.box.w < 1280 && view0.box.h < 800,
  shrinksWindow: view1.box.w < view0.box.w && view1.box.h < view0.box.h,
  planetSameAfterShrink: view1.planetR === view0.planetR,
  growsWindow: view2.box.w > view1.box.w,
  planetSameAfterGrow: view2.planetR === view0.planetR,
  placedLaser: afterPlace.towers?.[0]?.kind === "laser" && afterPlace.towers[0].level === 1,
  salvageAfterLaser: afterPlace.salvage === 5,
  upgraded: afterUp.towers?.[0]?.level === 2,
  shopHasUpgrade: afterUp.items?.includes("upgrade"),
  noSecondRing: view0.slotN === 6,
};
console.log("ok", JSON.stringify(ok, null, 2));
await writeFile(join(OUT, "balance-verify.json"), JSON.stringify({ ok, view0, view1, view2, afterPlace, afterUp, phone }, null, 2));

ws.close();
chrome.kill();
const failed = Object.entries(ok).filter(([, v]) => v !== true);
if (failed.length) {
  console.error("failed", failed);
  process.exit(1);
}
process.exit(0);
