export function startOrbitSiege(opts = {}) {
const TAU = Math.PI * 2;
let session = opts.session || {};
const sessionReady = opts.sessionReady && typeof opts.sessionReady.then === "function"
  ? opts.sessionReady
  : Promise.resolve(session);
const onClaim = typeof opts.onClaim === "function" ? opts.onClaim : async () => ({});
const onExit = typeof opts.onExit === "function" ? opts.onExit : () => {};
const planetName = opts.planetName || "Kolonie";
if (document.querySelector(".orbit-game")) return;
const root = document.createElement("section");
root.className = "orbit-game";
root.setAttribute("role", "dialog");
root.setAttribute("aria-label", `Orbit-Belagerung über ${planetName}`);
root.innerHTML = `
  <canvas class="orbit-canvas" aria-label="Orbit-Belagerung"></canvas>
  <header class="hud">
    <div class="demo-tag">${escText(planetName)} · ORBIT-BELAGERUNG</div>
    <button class="orbit-pause" type="button" aria-label="Pause">II</button>
    <button class="orbit-exit" type="button" aria-label="Beenden">×</button>
    <div class="hud-top">
      <div class="chip wave-chip"><small>WELLE</small><b id="wave">1</b></div>
      <div class="hp-block">
        <div class="hp-lab"><span>SCHILD</span><b id="hp-n">100</b></div>
        <i class="hp-track" id="hp-track"><em id="hp"></em></i>
      </div>
      <div class="chip salvage-chip"><small>PUNKTE</small><b id="salvage">0</b></div>
    </div>
    <div class="hud-sub">
      <span>ABSCHÜSSE <b id="kills">0</b></span>
      <span>TÜRME <b id="towers">0</b></span>
      <span id="build-clock" hidden>AUFBAU <b id="build-t">0</b>s</span>
    </div>
  </header>
  <p class="wave-banner" id="banner" hidden></p>
  <div class="controls">
    <div id="stick" class="orbit-stick" aria-label="Zielen"><b></b><small>ZIELEN</small></div>
    <div class="fire-col">
      <button id="aa" type="button" aria-label="Abwehr" class="ready"><span class="aa-cd"></span><small>ABWEHR</small></button>
      <button id="fire" class="orbit-fire" type="button" aria-label="Feuer"><small>FEUER</small></button>
    </div>
  </div>
  <aside class="orbit-build" id="build-dock" hidden>
    <header>
      <b>STELLUNG</b>
      <small id="build-hint">Turm wählen, dann einen Ring antippen</small>
      <button type="button" id="build-go">Welle starten</button>
    </header>
    <div class="orbit-shop" id="shop"></div>
  </aside>
  <section class="overlay pause-overlay" id="pause" hidden>
    <div class="card">
      <small>PAUSE</small>
      <h2>Orbit gehalten</h2>
      <p>Die Belagerung steht still. Türme und Feinde warten.</p>
      <button type="button" id="pause-resume">Weiterkämpfen</button>
    </div>
  </section>
  <section class="overlay" id="dead" hidden>
    <div class="card">
      <small id="dead-label">RUNDE BEENDET</small>
      <h2 id="dead-title">0 Treffer</h2>
      <p id="dead-hits"></p>
      <p id="dead-detail"></p>
      <button id="again" type="button">Zurück zur Karte</button>
    </div>
  </section>`;
document.body.classList.add("orbit-siege-open");
document.body.append(root);
function escText(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const canvas = root.querySelector("canvas");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const stage = root;
const hpBar = root.querySelector("#hp");
const hpTrack = root.querySelector("#hp-track");
const hpN = root.querySelector("#hp-n");
const salvageEl = root.querySelector("#salvage");
const waveEl = root.querySelector("#wave");
const killsEl = root.querySelector("#kills");
const towersEl = root.querySelector("#towers");
const buildClock = root.querySelector("#build-clock");
const buildT = root.querySelector("#build-t");
const banner = root.querySelector("#banner");
const stick = root.querySelector("#stick");
const knob = stick.querySelector("b");
const fireBtn = root.querySelector("#fire");
const aaBtn = root.querySelector("#aa");
const shopEl = root.querySelector("#shop");
const buildDock = root.querySelector("#build-dock");
const buildHint = root.querySelector("#build-hint");

const ART = {
  bg: img("/assets/orbit-siege/arena.jpg"),
  planet: img("/assets/orbit-siege/planet.png"),
  battery: img("/assets/orbit-siege/battery.png"),
  sentinel: img("/assets/orbit-siege/sentinel.png"),
  silo: img("/assets/orbit-siege/silo.png"),
  interceptor: img("/assets/orbit-siege/interceptor.png"),
  frigate: img("/assets/orbit-siege/frigate.png"),
  rocket: img("/assets/orbit-siege/rocket.png"),
  missile: img("/assets/orbit-siege/missile.png"),
  icons: {
    laser: "/assets/orbit-siege/upgrade-tower.jpg",
    silo: "/assets/orbit-siege/upgrade-silo.jpg",
    flak: "/assets/orbit-siege/upgrade-flak.jpg",
    gauss: "/assets/orbit-siege/upgrade-gauss.jpg",
    tesla: "/assets/orbit-siege/upgrade-tesla.jpg",
    mine: "/assets/orbit-siege/upgrade-mine.jpg",
    repair: "/assets/orbit-siege/upgrade-repair.jpg",
    rate: "/assets/orbit-siege/upgrade-rate.jpg",
    dmg: "/assets/orbit-siege/upgrade-dmg.jpg",
    range: "/assets/orbit-siege/upgrade-range.jpg",
  },
};
function img(src) {
  const el = new Image();
  el.src = src;
  return el;
}
function ready(im) {
  return im.complete && im.naturalWidth > 0;
}

const TOWER_DEFS = [
  { id: "laser", title: "LASER", blurb: "Strahl · schnelle Jäger", cost: 28, kind: "laser" },
  { id: "silo", title: "SILO", blurb: "Fängt Raketen ab", cost: 36, kind: "silo" },
  { id: "flak", title: "FLAK", blurb: "Flächenschaden", cost: 32, kind: "flak" },
  { id: "gauss", title: "GAUSS", blurb: "Durchschlägt Reihen", cost: 48, kind: "gauss" },
  { id: "tesla", title: "TESLA", blurb: "Kettenblitz", cost: 54, kind: "tesla" },
  { id: "mine", title: "MINE", blurb: "Explodiert bei Nähe", cost: 18, kind: "mine" },
];
const BOOSTS = [
  { id: "repair", title: "SCHILD", blurb: "+28 HP", cost: 24, apply: (g) => { g.hp = Math.min(g.maxHp, g.hp + 28); } },
  { id: "rate", title: "KADENZ", blurb: "Kanone schneller", cost: 32, apply: (g) => { g.playerRate *= 0.84; } },
  { id: "dmg", title: "IONEN", blurb: "+1 Schaden", cost: 36, apply: (g) => { g.playerDmg += 1; } },
  { id: "range", title: "ORTUNG", blurb: "Türme weiter", cost: 28, apply: (g) => { g.range *= 1.16; } },
];

const INNER_N = 6;
const OUTER_N = 8;
let W = 1, H = 1, dpr = 1, cx = 0, cy = 0, planetR = 40, shieldR = 52, innerR = 90, outerR = 140;
let stars = [], dust = [];
const game = fresh();
let last = 0, dragging = false, firing = false, keys = new Set();
let bannerT = 0, shakeX = 0, shakeY = 0, stopped = false;

function fresh() {
  return {
    mode: "build",
    paused: false,
    time: 0,
    hp: 100, maxHp: 100, salvage: 40, wave: 0, kills: 0,
    playerRate: 0.18, playerDmg: 1, playerCd: 0, flak: 0, range: 1,
    playerMissiles: 0, shotN: 0,
    aim: -Math.PI / 2, recoil: 0, flash: 0,
    shake: 0, hitFlash: 0,
    heldWaves: 0,
    aaCd: 0, aaMax: 8.5,
    pick: null,
    buildTimer: 12,
    towers: [],
    enemies: [], rockets: [], interceptors: [],
    shots: [], sparks: [], smoke: [], rings: [], ripples: [], orbs: [], bolts: [],
    spawnLeft: 0, spawnWait: 0, waveLive: false,
  };
}
function slotAng(ring, i) {
  const n = ring === 0 ? INNER_N : OUTER_N;
  const off = ring === 0 ? 0.5 : 0;
  return -Math.PI / 2 + (i + off) * TAU / n;
}
function slotPos(ring, i) {
  const r = ring === 0 ? innerR : outerR;
  const a = slotAng(ring, i);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, ang: a, r };
}
function occupied(ring, i) {
  return game.towers.some((t) => t.ring === ring && t.slot === i);
}
function towerPos(t) {
  return slotPos(t.ring, t.slot);
}

function seedSky() {
  const reach = Math.hypot(W, H) * 0.62;
  stars = Array.from({ length: 96 }, () => ({
    a: Math.random() * TAU,
    r: 50 + Math.random() * reach,
    s: 0.35 + Math.random() * 1.55,
    tw: Math.random() * TAU,
  }));
  dust = Array.from({ length: 22 }, () => ({
    a: Math.random() * TAU,
    r: planetR * 1.7 + Math.random() * 200,
    s: 1.1 + Math.random() * 2.4,
    tw: Math.random() * TAU,
  }));
}

function resize() {
  const vv = window.visualViewport;
  const box = root.getBoundingClientRect();
  W = Math.round(box.width || vv?.width || window.innerWidth || 0);
  H = Math.round(box.height || vv?.height || window.innerHeight || 0);
  if (W < 48 || H < 48) {
    W = Math.round(window.innerWidth || 390);
    H = Math.round(window.innerHeight || 720);
  }
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = Math.max(2, Math.round(W * dpr));
  canvas.height = Math.max(2, Math.round(H * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2;
  cy = H * 0.42;
  planetR = Math.min(W, H) * 0.068;
  shieldR = planetR * 1.72;
  innerR = planetR * 2.55;
  outerR = planetR * 3.95;
  seedSky();
}
window.addEventListener("resize", resize);
vvListen();
function vvListen() {
  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener("resize", resize);
  vv.addEventListener("scroll", resize);
}
resize();
requestAnimationFrame(() => { resize(); requestAnimationFrame(resize); });

function setAimFrom(x, y, origin) {
  const r = origin.getBoundingClientRect();
  let dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy) || 1, cap = r.width * 0.28;
  if (len > cap) { dx *= cap / len; dy *= cap / len; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  if (Math.hypot(dx, dy) > 6) game.aim = Math.atan2(dy, dx);
}
stick.addEventListener("pointerdown", (e) => { dragging = true; stick.setPointerCapture(e.pointerId); setAimFrom(e.clientX, e.clientY, stick); });
stick.addEventListener("pointermove", (e) => { if (dragging) setAimFrom(e.clientX, e.clientY, stick); });
const stopAim = () => { dragging = false; knob.style.transform = ""; };
stick.addEventListener("pointerup", stopAim); stick.addEventListener("pointercancel", stopAim);

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function nearestSlot(x, y) {
  let best = null, bestD = 42;
  for (const ring of [0, 1]) {
    const n = ring === 0 ? INNER_N : OUTER_N;
    for (let i = 0; i < n; i++) {
      const p = slotPos(ring, i);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = { ring, i, ...p }; }
    }
  }
  return best;
}
function tryPlace(x, y) {
  if (game.mode !== "build" || game.paused) return false;
  const def = TOWER_DEFS.find((t) => t.id === game.pick);
  if (!def) { showBanner("TURM WÄHLEN"); return true; }
  const slot = nearestSlot(x, y);
  if (!slot) return false;
  if (occupied(slot.ring, slot.i)) { showBanner("BELEGT"); return true; }
  if (game.salvage < def.cost) { showBanner("ZU WENIG PUNKTE"); return true; }
  game.salvage -= def.cost;
  game.towers.push({
    ring: slot.ring, slot: slot.i, ang: slot.ang, kind: def.kind,
    cd: 0.2, lock: null, flash: 0, armed: 1,
  });
  burst(slot.x, slot.y, "#7fe7ff", 10);
  showBanner(def.title);
  paintShop();
  paintHud();
  return true;
}
canvas.addEventListener("pointerdown", (e) => {
  const p = canvasPoint(e);
  if (game.mode === "build") {
    tryPlace(p.x, p.y);
    return;
  }
  if (game.mode !== "play" || game.paused) return;
  game.aim = Math.atan2(p.y - cy, p.x - cx);
});
canvas.addEventListener("pointermove", (e) => {
  if (game.mode !== "play" || game.paused || e.buttons === 0) return;
  const p = canvasPoint(e);
  game.aim = Math.atan2(p.y - cy, p.x - cx);
});
fireBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); fireBtn.setPointerCapture(e.pointerId); firing = true; fireBtn.classList.add("pressed"); });
const stopFire = () => { firing = false; fireBtn.classList.remove("pressed"); };
fireBtn.addEventListener("pointerup", stopFire); fireBtn.addEventListener("pointercancel", stopFire);
aaBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); aaBurst(); });
function togglePause() {
  if (game.mode === "dead") return;
  game.paused = !game.paused;
  root.querySelector("#pause").hidden = !game.paused;
  root.querySelector(".orbit-pause").textContent = game.paused ? "▶" : "II";
}
root.querySelector(".orbit-pause").onclick = togglePause;
root.querySelector("#pause-resume").onclick = togglePause;
const onKeyDown = (e) => {
  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
  if (e.code === "KeyP" || e.code === "Escape") {
    if (e.code === "KeyP") { e.preventDefault(); togglePause(); }
  }
  if (e.code === "KeyE" || e.code === "KeyQ") { e.preventDefault(); aaBurst(); }
};
const onKeyUp = (e) => keys.delete(e.code);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

function begin() {
  Object.assign(game, fresh());
  root.querySelector("#dead").hidden = true;
  root.querySelector("#pause").hidden = true;
  openBuild(true);
}
function lootLine(wave) {
  const table = session.lootForWave || [];
  const loot = table[Math.max(0, wave - 1)] || {};
  const parts = Object.entries(loot).filter(([, n]) => Number(n) > 0).map(([id, n]) => `+${n} ${id.slice(0, 3).toUpperCase()}`);
  return parts.join(" · ");
}
let finishing = false, claimedOk = false, startFailed = null;
function paintResult({ lootText, error } = {}) {
  game.mode = "dead";
  game.paused = false;
  buildDock.hidden = true;
  root.querySelector("#pause").hidden = true;
  root.querySelector("#dead").hidden = false;
  root.querySelector("#dead-label").textContent = error ? "ABBRUCH" : "RUNDE BEENDET";
  root.querySelector("#dead-title").textContent = `${game.kills} Treffer`;
  const hits = root.querySelector("#dead-hits");
  if (hits) hits.textContent = `${game.heldWaves || game.wave} Wellen gehalten · ${game.kills} Abschüsse · ${game.salvage} Punkte`;
  const detail = root.querySelector("#dead-detail");
  if (detail) detail.textContent = error || lootText || "Keine Beute";
  const back = root.querySelector("#again");
  if (back) back.textContent = "Zurück zur Karte";
}
async function finishRun() {
  if (claimedOk) return;
  if (finishing) return;
  finishing = true;
  stopped = true;
  if (startFailed) {
    claimedOk = true;
    paintResult({ error: startFailed.message || "Orbit-Feuer konnte nicht gestartet werden." });
    return;
  }
  paintResult({ lootText: "Beute wird geborgen …" });
  try {
    const ready = await sessionReady;
    if (ready?.id) session = ready;
    if (!session.id) throw new Error("Orbit-Feuer konnte nicht gestartet werden.");
    const out = await onClaim({ waves: game.heldWaves, kills: game.kills, session });
    claimedOk = true;
    const loot = out?.loot || {};
    const text = Object.entries(loot).filter(([, n]) => Number(n) > 0).map(([id, n]) => `+${n} ${id.slice(0, 3).toUpperCase()}`).join(" · ");
    paintResult({ lootText: text || "Keine Beute" });
  } catch (err) {
    finishing = false;
    paintResult({ error: err.message || "Belohnung fehlgeschlagen" });
  }
}
function teardown() {
  stopped = true;
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("resize", resize);
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", resize);
    vv.removeEventListener("scroll", resize);
  }
  document.body.classList.remove("orbit-siege-open");
  root.remove();
  onExit();
}
root.querySelector("#again").onclick = async () => {
  await finishRun();
  teardown();
};
root.querySelector(".orbit-exit").onclick = async () => {
  if (game.mode === "dead") {
    await finishRun();
    teardown();
    return;
  }
  await finishRun();
};

function nextWave() {
  game.wave += 1;
  game.waveLive = true;
  game.mode = "play";
  game.pick = null;
  buildDock.hidden = true;
  const n = 4 + game.wave * 2;
  game.spawnLeft = n;
  game.spawnWait = 0.15;
  showBanner(`WELLE ${game.wave}`);
}
function showBanner(text) {
  banner.hidden = false; banner.textContent = text; bannerT = 1.6;
}
function waveDone() {
  return game.waveLive && game.spawnLeft <= 0 && game.enemies.length === 0 && game.rockets.length === 0;
}
function openBuild(first) {
  game.mode = "build";
  game.waveLive = false;
  game.pick = first ? "laser" : game.pick;
  game.buildTimer = first ? 12 : 10 + Math.min(8, game.wave);
  if (!first) game.heldWaves = game.wave;
  buildDock.hidden = false;
  const loot = first ? "" : lootLine(game.wave);
  showBanner(first ? "STELLUNG AUFBAUEN" : `WELLE ${game.wave} GEHALTEN`);
  buildHint.textContent = loot ? `${loot} · Turm wählen, Ring antippen` : "Turm wählen, dann einen Ring antippen";
  paintShop();
}
function startCombat() {
  if (game.mode !== "build") return;
  nextWave();
  paintHud();
}
root.querySelector("#build-go").onclick = startCombat;

function paintShop() {
  const items = [
    ...TOWER_DEFS.map((t) => ({ ...t, type: "tower" })),
    ...BOOSTS.map((t) => ({ ...t, type: "boost" })),
  ];
  shopEl.innerHTML = items.map((item) => {
    const on = game.pick === item.id ? " on" : "";
    const poor = game.salvage < item.cost ? " poor" : "";
    return `<button type="button" class="orbit-shop-item${on}${poor}" data-shop="${item.id}" data-kind="${item.type}">
      <img src="${ART.icons[item.id]}" alt="">
      <b>${item.title}</b>
      <em>${item.cost}</em>
      <small>${item.blurb}</small>
    </button>`;
  }).join("");
  shopEl.querySelectorAll("[data-shop]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.shop;
      const boost = BOOSTS.find((b) => b.id === id);
      if (boost) {
        if (game.salvage < boost.cost) { showBanner("ZU WENIG PUNKTE"); return; }
        game.salvage -= boost.cost;
        boost.apply(game);
        showBanner(boost.title);
        paintShop();
        paintHud();
        return;
      }
      game.pick = game.pick === id ? null : id;
      paintShop();
      const def = TOWER_DEFS.find((t) => t.id === game.pick);
      buildHint.textContent = def ? `${def.title} · ${def.cost} Punkte · inneren oder äußeren Ring antippen` : "Turm wählen, dann einen Ring antippen";
    };
  });
}

function die() {
  finishRun();
}

function edgePoint() {
  const ang = Math.random() * TAU;
  const dist = Math.hypot(W, H) * 0.62;
  return { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist, ang };
}
function spawnEnemy() {
  const rocketOdds = game.wave >= 2 ? Math.min(0.2 + game.wave * 0.035, 0.4) : 0.12;
  if (Math.random() < rocketOdds) {
    spawnRocket();
    return;
  }
  const heavy = game.wave >= 3 && Math.random() < Math.min(0.18 + game.wave * 0.03, 0.45);
  const p = edgePoint();
  const speed = (heavy ? 42 : 70 + game.wave * 6) * (0.85 + Math.random() * 0.3);
  game.enemies.push({
    x: p.x, y: p.y,
    r: heavy ? 22 : 14,
    hp: heavy ? 3 + Math.floor(game.wave / 3) : 1 + (game.wave > 5 ? 1 : 0),
    max: heavy ? 3 + Math.floor(game.wave / 3) : 1,
    heavy, flash: 0, speed,
    wobble: Math.random() * TAU,
    trail: [],
    launchCd: heavy ? 1.1 + Math.random() : 0,
  });
}
function spawnRocket(x, y) {
  const p = x == null ? edgePoint() : { x, y };
  const d = Math.hypot(cx - p.x, cy - p.y) || 1;
  const speed = 88 + game.wave * 7;
  game.rockets.push({
    x: p.x, y: p.y,
    vx: (cx - p.x) / d * speed,
    vy: (cy - p.y) / d * speed,
    hp: 1, r: 8, trail: [], warn: 1,
  });
}
function launchInterceptor(x, y, ang, target) {
  const speed = 340;
  game.interceptors.push({
    x, y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    speed, life: 1.85, target, trail: [], dmg: 1 + game.flak,
  });
}
function aaBurst() {
  if (game.mode !== "play" || game.paused || game.aaCd > 0) return;
  game.aaCd = game.aaMax;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * TAU / n;
    launchInterceptor(cx + Math.cos(a) * shieldR, cy + Math.sin(a) * shieldR, a, null);
  }
  showBanner("ABWEHR");
  burst(cx, cy, "#7fe7ff", 10);
}
function shootFrom(x, y, ang, dmg, speed = 640, kind = "tower", extra = {}) {
  game.shots.push({
    x, y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    life: extra.life || 1.05, dmg, kind,
    pierce: extra.pierce || 0,
    splash: extra.splash || 0,
    hit: [],
  });
}
function burst(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 40 + Math.random() * 140;
    game.sparks.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.32 + Math.random() * 0.28,
      color, size: 1.6 + Math.random() * 3.2,
    });
  }
}
function puff(x, y, color, n = 2) {
  for (let i = 0; i < n; i++) {
    game.smoke.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      life: 0.45 + Math.random() * 0.35,
      r: 3 + Math.random() * 5,
      color,
    });
  }
}
function boom(x, y, heavy) {
  burst(x, y, heavy ? "#ff8a4c" : "#7fe7ff", heavy ? 18 : 10);
  burst(x, y, "#fff6d0", heavy ? 8 : 4);
  game.rings.push({
    x, y, r: 6, vr: heavy ? 240 : 170,
    life: 0.38, color: heavy ? "255,120,60" : "110,230,255",
  });
}
function interceptBoom(x, y) {
  burst(x, y, "#b8fff4", 14);
  burst(x, y, "#fff", 8);
  game.rings.push({ x, y, r: 4, vr: 280, life: 0.28, color: "180,255,240" });
  game.rings.push({ x, y, r: 2, vr: 160, life: 0.2, color: "255,255,255" });
}
function splashAt(x, y, radius, dmg, color) {
  boom(x, y, true);
  game.rings.push({ x, y, r: 8, vr: 320, life: 0.32, color: color || "255,160,60" });
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - x, e.y - y) < radius + e.r) { e.hp -= dmg; e.flash = 1; }
  }
  for (const r of game.rockets) {
    if (r.hp <= 0) continue;
    if (Math.hypot(r.x - x, r.y - y) < radius + r.r) { r.hp -= dmg; r.flash = 1; }
  }
}
function zap(from, to) {
  const pts = [{ x: from.x, y: from.y }];
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({
      x: from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 18,
      y: from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 18,
    });
  }
  pts.push({ x: to.x, y: to.y });
  game.bolts.push({ pts, life: 0.16 });
}
function kill(e, salvage) {
  game.kills += 1;
  game.salvage += salvage;
  boom(e.x, e.y, e.heavy);
  const chip = salvageEl.getBoundingClientRect();
  const cr = canvas.getBoundingClientRect();
  game.orbs.push({
    x: e.x, y: e.y,
    tx: chip.left + chip.width / 2 - cr.left,
    ty: chip.top + chip.height / 2 - cr.top,
    t: 0, n: salvage,
  });
}

function playerMuzzle() {
  return shieldR + 12;
}
function nearest(list, x, y, maxD) {
  let best = null, bestD = maxD;
  for (const o of list) {
    if (o.hp <= 0) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
function steer(m, tx, ty, dt, turn = 9) {
  const desired = Math.atan2(ty - m.y, tx - m.x);
  let da = desired - Math.atan2(m.vy, m.vx);
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  const ang = Math.atan2(m.vy, m.vx) + Math.max(-turn * dt, Math.min(turn * dt, da));
  m.vx = Math.cos(ang) * m.speed;
  m.vy = Math.sin(ang) * m.speed;
}

function fireTower(t, p) {
  const reach = (t.ring === 1 ? 250 : 190) * game.range;
  t.lock = null;
  if (t.kind === "silo") {
    t.lock = nearest(game.rockets, p.x, p.y, reach * 1.4) || nearest(game.enemies, p.x, p.y, reach);
    if (!t.lock || t.cd > 0) return;
    t.cd = 0.72; t.flash = 1;
    launchInterceptor(p.x, p.y, Math.atan2(t.lock.y - p.y, t.lock.x - p.x), t.lock);
    return;
  }
  if (t.kind === "mine") {
    const prey = nearest(game.enemies, p.x, p.y, 56) || nearest(game.rockets, p.x, p.y, 56);
    if (!prey) return;
    splashAt(p.x, p.y, 70, 3 + game.flak, "255,70,70");
    t.spent = true;
    return;
  }
  t.lock = nearest(game.enemies, p.x, p.y, reach) || nearest(game.rockets, p.x, p.y, reach * 0.9);
  if (!t.lock || t.cd > 0) return;
  const ang = Math.atan2(t.lock.y - p.y, t.lock.x - p.x);
  t.flash = 1;
  if (t.kind === "laser") {
    t.cd = 0.32;
    t.lock.hp -= 1; t.lock.flash = 1;
    burst(t.lock.x, t.lock.y, "#7fe7ff", 3);
  } else if (t.kind === "flak") {
    t.cd = 0.55;
    shootFrom(p.x, p.y, ang, 1, 420, "flak", { splash: 48, life: 0.7 });
  } else if (t.kind === "gauss") {
    t.cd = 0.9;
    shootFrom(p.x, p.y, ang, 2, 900, "gauss", { pierce: 3, life: 0.85 });
  } else if (t.kind === "tesla") {
    t.cd = 0.7;
    const hits = [];
    let cur = t.lock;
    for (let n = 0; n < 3 && cur; n++) {
      hits.push(cur);
      cur.hp -= 1; cur.flash = 1;
      const from = n === 0 ? p : hits[n - 1];
      zap(from, cur);
      burst(cur.x, cur.y, "#9cf6ff", 5);
      const pool = game.enemies.concat(game.rockets).filter((o) => o.hp > 0 && !hits.includes(o));
      cur = nearest(pool, cur.x, cur.y, 110);
    }
  }
}

function step(dt) {
  if (game.paused) return;
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 26);
  game.hitFlash = Math.max(0, game.hitFlash - dt * 3.2);
  game.aaCd = Math.max(0, game.aaCd - dt);
  shakeX = Math.sin(game.time * 62) * game.shake * 0.4;
  shakeY = Math.cos(game.time * 51) * game.shake * 0.4;

  for (const p of game.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  game.sparks = game.sparks.filter((p) => p.life > 0);
  for (const s of game.smoke) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.r += 10 * dt; }
  game.smoke = game.smoke.filter((s) => s.life > 0);
  for (const r of game.rings) { r.r += r.vr * dt; r.life -= dt; }
  game.rings = game.rings.filter((r) => r.life > 0);
  for (const r of game.ripples) { r.r += 90 * dt; r.life -= dt; }
  game.ripples = game.ripples.filter((r) => r.life > 0);
  for (const o of game.orbs) { o.t += dt * 1.7; }
  game.orbs = game.orbs.filter((o) => o.t < 1);
  for (const b of game.bolts) b.life -= dt;
  game.bolts = game.bolts.filter((b) => b.life > 0);

  if (game.mode === "build") {
    game.buildTimer -= dt;
    if (game.buildTimer <= 0) startCombat();
    return;
  }
  if (game.mode !== "play") return;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) game.aim -= 2.4 * dt;
  if (keys.has("ArrowRight") || keys.has("KeyD")) game.aim += 2.4 * dt;
  const wantFire = firing || keys.has("Space");
  game.playerCd -= dt;
  game.recoil = Math.max(0, game.recoil - dt * 70);
  game.flash = Math.max(0, game.flash - dt * 6);
  if (wantFire && game.playerCd <= 0) {
    game.playerCd = game.playerRate;
    game.recoil = 10; game.flash = 1;
    game.shotN += 1;
    const muzzle = playerMuzzle();
    const mx = cx + Math.cos(game.aim) * muzzle;
    const my = cy + Math.sin(game.aim) * muzzle;
    shootFrom(mx, my, game.aim, game.playerDmg, 680, "player");
    if (game.playerMissiles > 0 && game.shotN % 2 === 0) {
      launchInterceptor(mx, my, game.aim, nearest(game.rockets, mx, my, 900) || nearest(game.enemies, mx, my, 900));
    }
  }
  if (game.spawnLeft > 0) {
    game.spawnWait -= dt;
    if (game.spawnWait <= 0) {
      spawnEnemy();
      game.spawnLeft -= 1;
      game.spawnWait = Math.max(0.22, 0.72 - game.wave * 0.04);
    }
  }
  for (const t of game.towers) {
    t.cd -= dt;
    t.flash = Math.max(0, t.flash - dt * 5);
    fireTower(t, towerPos(t));
  }
  game.towers = game.towers.filter((t) => !t.spent);
  for (const e of game.enemies) {
    const dx = cx - e.x, dy = cy - e.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    e.wobble += dt;
    const sway = Math.sin(e.wobble * 3.1) * (e.heavy ? 7 : 16);
    e.x += nx * e.speed * dt + -ny * sway * dt * 3.2;
    e.y += ny * e.speed * dt + nx * sway * dt * 3.2;
    e.flash = Math.max(0, e.flash - dt * 4);
    e.trail.push({ x: e.x, y: e.y });
    if (e.trail.length > 11) e.trail.shift();
    if (e.heavy) {
      e.launchCd -= dt;
      if (e.launchCd <= 0) {
        e.launchCd = 2.4;
        spawnRocket(e.x, e.y);
      }
    }
    if (d < shieldR + e.r * 0.4) {
      game.hp -= e.heavy ? 14 : 7;
      game.shake = Math.max(game.shake, e.heavy ? 11 : 7);
      game.hitFlash = 1;
      boom(e.x, e.y, true);
      game.ripples.push({ r: shieldR, life: 0.5 });
      e.hp = 0; e.hitPlanet = true;
    }
  }
  for (const r of game.rockets) {
    r.x += r.vx * dt; r.y += r.vy * dt;
    r.flash = Math.max(0, (r.flash || 0) - dt * 4);
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 14) r.trail.shift();
    if (game.smoke.length < 70 && Math.random() < 0.18) puff(r.x, r.y, "rgba(255,140,60,0.35)", 1);
    const d = Math.hypot(cx - r.x, cy - r.y);
    if (d < shieldR + r.r) {
      game.hp -= 11;
      game.shake = Math.max(game.shake, 9);
      game.hitFlash = 1;
      boom(r.x, r.y, true);
      game.ripples.push({ r: shieldR, life: 0.55 });
      r.hp = 0; r.hitPlanet = true;
    }
  }
  for (const s of game.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const strike = (o) => {
      if (o.hp <= 0 || (s.hit && s.hit.includes(o))) return false;
      const rad = (o.r || 8) + (s.kind === "gauss" ? 10 : 7);
      if (Math.hypot(s.x - o.x, s.y - o.y) >= rad) return false;
      const extra = !o.heavy ? game.flak : 0;
      o.hp -= s.dmg + extra; o.flash = 1;
      if (s.splash) splashAt(s.x, s.y, s.splash, 1 + game.flak, "255,150,50");
      else burst(s.x, s.y, s.kind === "gauss" ? "#ffe08a" : "#fff", 4);
      if (s.pierce) {
        s.hit = s.hit || [];
        s.hit.push(o);
        s.pierce -= 1;
        if (s.pierce < 0) s.life = 0;
      } else s.life = 0;
      return true;
    };
    for (const e of game.enemies) { if (s.life <= 0) break; strike(e); }
    if (s.life > 0) for (const r of game.rockets) { if (s.life <= 0) break; strike(r); }
  }
  for (const m of game.interceptors) {
    m.life -= dt;
    if (!m.target || m.target.hp <= 0) {
      m.target = nearest(game.rockets, m.x, m.y, 900) || nearest(game.enemies, m.x, m.y, 900);
    }
    if (m.target) steer(m, m.target.x, m.target.y, dt, 11);
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 10) m.trail.shift();
    if (game.smoke.length < 70 && Math.random() < 0.22) puff(m.x, m.y, "rgba(120,230,255,0.28)", 1);
    let hit = false;
    for (const r of game.rockets) {
      if (r.hp <= 0) continue;
      if (Math.hypot(m.x - r.x, m.y - r.y) < 14) {
        r.hp -= m.dmg; r.flash = 1; hit = true;
        interceptBoom(m.x, m.y);
        break;
      }
    }
    if (!hit) {
      for (const e of game.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(m.x - e.x, m.y - e.y) < e.r + 8) {
          e.hp -= m.dmg; e.flash = 1; hit = true;
          boom(m.x, m.y, false);
          break;
        }
      }
    }
    if (hit) m.life = 0;
  }
  for (const e of game.enemies) {
    if (e.hp <= 0 && !e.hitPlanet) kill(e, e.heavy ? 12 : 5);
  }
  for (const r of game.rockets) {
    if (r.hp <= 0 && !r.hitPlanet) kill(r, 3);
  }
  game.enemies = game.enemies.filter((e) => e.hp > 0);
  game.rockets = game.rockets.filter((r) => r.hp > 0);
  game.interceptors = game.interceptors.filter((m) => m.life > 0 && m.x > -60 && m.x < W + 60 && m.y > -60 && m.y < H + 60);
  game.shots = game.shots.filter((s) => s.life > 0 && s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40);
  if (game.sparks.length > 140) game.sparks.splice(0, game.sparks.length - 140);
  if (game.smoke.length > 80) game.smoke.splice(0, game.smoke.length - 80);
  if (game.hp <= 0) { game.hp = 0; die(); return; }
  if (waveDone()) openBuild(false);
}

function drawBg() {
  ctx.fillStyle = "#02060d";
  ctx.fillRect(0, 0, W, H);
  if (ready(ART.bg)) {
    const s = Math.max(W / ART.bg.naturalWidth, H / ART.bg.naturalHeight);
    const dw = ART.bg.naturalWidth * s, dh = ART.bg.naturalHeight * s;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(ART.bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }
  const rot = game.time * 0.018;
  for (const st of stars) {
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(game.time * 2.2 + st.tw));
    ctx.globalAlpha = tw;
    ctx.fillStyle = st.s > 1.4 ? "#e8fbff" : "#d7f4ff";
    ctx.fillRect(cx + Math.cos(st.a + rot) * st.r, cy + Math.sin(st.a + rot) * st.r, st.s, st.s);
  }
  ctx.globalAlpha = 1;
  for (const d of dust) {
    const a = 0.07 + 0.08 * (0.5 + 0.5 * Math.sin(game.time * 0.7 + d.tw));
    ctx.fillStyle = `rgba(120, 210, 255, ${a})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(d.a + rot * 0.4) * d.r, cy + Math.sin(d.a + rot * 0.4) * d.r, d.s, 0, TAU);
    ctx.fill();
  }
}

function hexPath(r, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + i * TAU / 6;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawSlots() {
  const building = game.mode === "build" && !game.paused;
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(game.time * 3.4));
  ctx.save();
  for (const [r, color] of [[innerR, "80,220,255"], [outerR, "255,186,80"]]) {
    ctx.strokeStyle = `rgba(${color},${building ? 0.28 + 0.18 * pulse : 0.12})`;
    ctx.lineWidth = building ? 2 : 1.2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const ring of [0, 1]) {
    const n = ring === 0 ? INNER_N : OUTER_N;
    for (let i = 0; i < n; i++) {
      const p = slotPos(ring, i);
      const taken = occupied(ring, i);
      const col = ring === 0 ? "90,230,255" : "255,190,80";
      ctx.fillStyle = taken ? `rgba(${col},0.12)` : `rgba(${col},${building ? 0.16 + 0.14 * pulse : 0.06})`;
      ctx.strokeStyle = `rgba(${col},${taken ? 0.2 : building ? 0.7 : 0.28})`;
      ctx.lineWidth = building && !taken ? 2 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, building ? 11 : 7, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPlanet() {
  const hp01 = Math.max(0, game.hp / game.maxHp);
  const pulse = 0.5 + 0.5 * Math.sin(game.time * 2.4);
  const atmo = ctx.createRadialGradient(cx, cy, planetR * 0.7, cx, cy, planetR * 1.85);
  atmo.addColorStop(0, "rgba(50, 210, 230, 0)");
  atmo.addColorStop(0.45, `rgba(40, 200, 230, ${0.07 + 0.04 * pulse})`);
  atmo.addColorStop(0.72, `rgba(40, 180, 220, ${0.16 + 0.05 * pulse})`);
  atmo.addColorStop(1, "rgba(20, 80, 120, 0)");
  ctx.fillStyle = atmo;
  ctx.beginPath(); ctx.arc(cx, cy, planetR * 1.85, 0, TAU); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, planetR * 1.22, 0, TAU); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(game.time * 0.035);
  const drawR = planetR * 1.2;
  if (ready(ART.planet)) ctx.drawImage(ART.planet, -drawR, -drawR, drawR * 2, drawR * 2);
  else {
    const g = ctx.createRadialGradient(-drawR * 0.25, -drawR * 0.3, drawR * 0.2, 0, 0, drawR);
    g.addColorStop(0, "#4aa7c9"); g.addColorStop(0.5, "#1a5e78"); g.addColorStop(1, "#0b2433");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, planetR, 0, TAU); ctx.fill();
  }
  ctx.restore();

  if (game.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 90, 50, ${game.hitFlash * 0.28})`;
    ctx.beginPath(); ctx.arc(cx, cy, planetR * 1.02, 0, TAU); ctx.fill();
  }

  const col = hp01 > 0.45 ? "62,232,196" : hp01 > 0.2 ? "255,186,70" : "255,78,70";
  hexPath(shieldR);
  ctx.fillStyle = `rgba(${col}, ${0.055 + 0.03 * pulse})`;
  ctx.fill();

  ctx.strokeStyle = `rgba(${col}, ${0.22 + 0.12 * pulse})`;
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.arc(cx, cy, shieldR, 0, TAU); ctx.stroke();
  hexPath(shieldR);
  ctx.strokeStyle = `rgba(${col}, ${0.62 + 0.2 * pulse})`;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = `rgba(${col}, 0.95)`;
  ctx.beginPath();
  ctx.arc(cx, cy, shieldR + 7, -Math.PI / 2, -Math.PI / 2 + TAU * hp01);
  ctx.stroke();
  if (hp01 < 1) {
    ctx.strokeStyle = "rgba(255,70,55,0.42)";
    ctx.beginPath();
    ctx.arc(cx, cy, shieldR + 7, -Math.PI / 2 + TAU * hp01, -Math.PI / 2 + TAU);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  for (const r of game.ripples) {
    ctx.strokeStyle = `rgba(255, 140, 90, ${Math.max(0, r.life * 1.4)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r.r, 0, TAU); ctx.stroke();
  }
}

function drawSprite(im, x, y, rot, w, h, ox = 0.5, oy = 0.5) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (ready(im)) ctx.drawImage(im, -w * ox, -h * oy, w, h);
  else {
    ctx.fillStyle = "#4ec8e4";
    ctx.fillRect(-w * 0.15, -h * oy, w * 0.3, h);
  }
  ctx.restore();
}

function drawAimGuide() {
  if (game.mode !== "play" || game.paused) return;
  const x0 = cx + Math.cos(game.aim) * (shieldR + 10);
  const y0 = cy + Math.sin(game.aim) * (shieldR + 10);
  const reach = Math.hypot(W, H) * 0.5;
  const x1 = cx + Math.cos(game.aim) * reach;
  const y1 = cy + Math.sin(game.aim) * reach;
  ctx.save();
  ctx.strokeStyle = "rgba(90, 230, 255, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 9]);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(180, 255, 255, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x0, y0, 7, 0, TAU); ctx.stroke();
  ctx.translate(x1, y1);
  ctx.rotate(game.aim);
  ctx.strokeStyle = "rgba(120, 240, 255, 0.7)";
  ctx.beginPath();
  ctx.moveTo(-8, -7); ctx.lineTo(6, 0); ctx.lineTo(-8, 7);
  ctx.stroke();
  ctx.restore();
}

function drawTurret(t, player) {
  const p = player ? { x: cx + Math.cos(game.aim) * shieldR * 0.96, y: cy + Math.sin(game.aim) * shieldR * 0.96, ang: game.aim } : towerPos(t);
  const kind = player ? "battery" : t.kind;
  const span = Math.min(W, H);
  const h = player ? span * 0.1 : kind === "mine" ? span * 0.055 : kind === "silo" ? span * 0.07 : span * 0.066;
  const spr = player || kind === "gauss" ? ART.battery : kind === "silo" ? ART.silo : kind === "mine" ? ART.missile : ART.sentinel;
  const aspect = player || kind === "gauss" ? 831 / 1002 : kind === "silo" ? 808 / 842 : kind === "mine" ? 479 / 1031 : 855 / 865;
  const w = h * aspect;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((player ? game.aim : t.ang) + Math.PI / 2);
  ctx.translate(0, player ? game.recoil * 0.35 : 0);
  if (kind === "tesla") ctx.filter = "hue-rotate(20deg) saturate(1.3)";
  if (kind === "flak") ctx.filter = "hue-rotate(-30deg) saturate(1.2)";
  if (kind === "gauss") ctx.filter = "saturate(0.6) brightness(1.2)";
  if (ready(spr)) ctx.drawImage(spr, -w / 2, -h * (kind === "silo" || kind === "mine" ? 0.5 : 0.62), w, h);
  else { ctx.fillStyle = "#4ec8e4"; ctx.fillRect(-3, -h * 0.6, 6, h * 0.6); }
  ctx.filter = "none";
  const flash = player ? game.flash : t.flash || 0;
  if (flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = flash;
    const muzzleY = kind === "silo" || kind === "mine" ? -h * 0.35 : -h * 0.6;
    const g = ctx.createRadialGradient(0, muzzleY, 1, 0, muzzleY, 26);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.35, kind === "gauss" ? "#ffe08a" : kind === "flak" ? "#ffb060" : "#7fe7ff");
    g.addColorStop(1, "rgba(70,220,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, muzzleY, 26, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawTrail(pts, color, width) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(e) {
  drawTrail(e.trail, e.heavy ? "rgba(255,110,50,0.28)" : "rgba(255,80,40,0.22)", e.heavy ? 5 : 3);
  const spr = e.heavy ? ART.frigate : ART.interceptor;
  const h = e.heavy ? planetR * 0.95 : planetR * 0.68;
  const aspect = e.heavy ? 712 / 1041 : 861 / 949;
  const w = h * aspect;
  const ang = Math.atan2(cy - e.y, cx - e.x);
  if (e.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,255,255,${e.flash * 0.55})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.1, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawSprite(spr, e.x, e.y, ang + Math.PI / 2, w, h, 0.5, 0.5);
  if (e.max > 1) {
    const bw = e.r * 2.1;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw, 3);
    ctx.fillStyle = "#ff5649";
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw * (e.hp / e.max), 3);
  }
}

function drawRocket(r) {
  drawTrail(r.trail, "rgba(255,120,40,0.45)", 3.5);
  const h = planetR * 0.64;
  const w = h * (361 / 1019);
  const ang = Math.atan2(r.vy, r.vx);
  drawSprite(ART.rocket, r.x, r.y, ang + Math.PI / 2, w, h, 0.5, 0.38);
}

function drawInterceptor(m) {
  drawTrail(m.trail, "rgba(90,230,255,0.5)", 2.4);
  const h = planetR * 0.54;
  const w = h * (479 / 1031);
  const ang = Math.atan2(m.vy, m.vx);
  drawSprite(ART.missile, m.x, m.y, ang + Math.PI / 2, w, h, 0.5, 0.38);
}

function drawShot(s) {
  const ang = Math.atan2(s.vy, s.vx);
  const player = s.kind === "player";
  const gauss = s.kind === "gauss";
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = "lighter";
  const len = gauss ? 72 : player ? 58 : 36;
  const grd = ctx.createLinearGradient(-len, 0, 8, 0);
  grd.addColorStop(0, "rgba(80,220,255,0)");
  grd.addColorStop(0.55, gauss ? "rgba(255,220,120,.85)" : player ? "rgba(180,255,255,.7)" : s.kind === "flak" ? "rgba(255,160,60,.6)" : "rgba(80,220,255,.45)");
  grd.addColorStop(1, "#fff");
  ctx.fillStyle = grd;
  const thick = gauss ? 3.6 : player ? 3.2 : 1.8;
  ctx.beginPath();
  ctx.moveTo(-len, -thick * 0.45);
  ctx.lineTo(8, -thick);
  ctx.lineTo(8, thick);
  ctx.lineTo(-len, thick * 0.45);
  ctx.fill();
  ctx.restore();
}

function drawFx() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of game.bolts) {
    ctx.strokeStyle = `rgba(160,255,255,${Math.max(0, b.life * 6)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(b.pts[0].x, b.pts[0].y);
    for (const p of b.pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, b.life * 4)})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
  for (const s of game.smoke) {
    ctx.globalAlpha = Math.max(0, s.life * 1.4);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const r of game.rings) {
    ctx.strokeStyle = `rgba(${r.color},${Math.max(0, r.life * 2.2)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  for (const p of game.sparks) {
    ctx.globalAlpha = Math.max(0, p.life * 3);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const o of game.orbs) {
    const u = o.t;
    const e = 1 - (1 - u) * (1 - u);
    const x = o.x + (o.tx - o.x) * e;
    const y = o.y + (o.ty - o.y) * e - Math.sin(u * Math.PI) * 28;
    ctx.globalAlpha = 1 - u * 0.2;
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawIncoming() {
  if (game.mode !== "play") return;
  const pad = 18, padT = 92, padB = 250;
  const marks = game.enemies.map((e) => ({ e, rocket: false })).concat(game.rockets.map((e) => ({ e, rocket: true })));
  for (const m of marks) {
    const e = m.e;
    if (e.x > pad && e.x < W - pad && e.y > padT && e.y < H - padB) continue;
    const ang = Math.atan2(e.y - cy, e.x - cx);
    const x = Math.min(W - pad, Math.max(pad, e.x));
    const y = Math.min(H - padB, Math.max(padT, e.y));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = m.rocket ? "rgba(255,170,50,.95)" : e.heavy ? "rgba(255,120,60,.9)" : "rgba(255,80,70,.88)";
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-7, -6); ctx.lineTo(-7, 6);
    ctx.fill();
    ctx.restore();
  }
}

function drawLocks() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const t of game.towers) {
    if (!t.lock || t.kind === "silo" || t.kind === "mine") continue;
    const p = towerPos(t);
    const flash = t.flash || 0;
    ctx.strokeStyle = `rgba(${t.kind === "gauss" ? "255,210,90" : t.kind === "flak" ? "255,150,60" : "80,230,255"}, ${0.22 + flash * 0.45})`;
    ctx.lineWidth = 2.2 + flash * 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.lock.x, t.lock.y); ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBg();
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawPlanet();
  drawSlots();
  drawAimGuide();
  drawLocks();
  for (const t of game.towers) drawTurret(t, false);
  drawTurret({ ang: game.aim, kind: "battery", flash: game.flash }, true);
  for (const e of game.enemies) drawEnemy(e);
  for (const r of game.rockets) drawRocket(r);
  for (const m of game.interceptors) drawInterceptor(m);
  for (const s of game.shots) drawShot(s);
  drawFx();
  drawIncoming();
  ctx.restore();
  const vig = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.18, cx, cy, Math.hypot(W, H) * 0.62);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.72, "rgba(0,4,10,0.12)");
  vig.addColorStop(1, "rgba(0,3,8,0.58)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function paintHud() {
  const hp01 = Math.max(0, game.hp / game.maxHp);
  hpBar.style.width = `${hp01 * 100}%`;
  hpN.textContent = String(Math.max(0, Math.ceil(game.hp)));
  salvageEl.textContent = String(game.salvage);
  waveEl.textContent = String(Math.max(1, game.wave));
  killsEl.textContent = String(game.kills);
  towersEl.textContent = String(game.towers.length);
  const building = game.mode === "build";
  buildClock.hidden = !building;
  if (building) buildT.textContent = String(Math.max(0, Math.ceil(game.buildTimer)));
  root.classList.toggle("is-build", building);
  hpTrack.classList.toggle("danger", hp01 < 0.28);
  stage.classList.toggle("hurt", game.mode === "play" && hp01 < 0.28);
  const readyAa = game.aaCd <= 0 && game.mode === "play" && !game.paused;
  aaBtn.classList.toggle("ready", readyAa || game.mode !== "play");
  aaBtn.classList.toggle("cool", game.mode === "play" && !readyAa);
  const pct = game.mode === "play" ? (1 - game.aaCd / game.aaMax) * 100 : 100;
  aaBtn.style.setProperty("--cd", String(Math.max(0, Math.min(100, pct))));
  if (bannerT <= 0) banner.hidden = true;
}

function loop(now) {
  if (stopped) return;
  try {
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    bannerT -= dt;
    if (!document.hidden) {
      step(game.paused ? 0 : dt);
      draw();
      paintHud();
    } else {
      last = now;
    }
  } catch (err) {
    console.error("Orbit-Feuer:", err);
  }
  if (!stopped) requestAnimationFrame(loop);
}
begin();
requestAnimationFrame(loop);
sessionReady.then((ready) => {
  if (ready?.id) session = ready;
}).catch((err) => {
  startFailed = err;
  stopped = true;
  paintResult({ error: err.message || "Orbit-Feuer konnte nicht gestartet werden." });
});

}
