import { START_SALVAGE, WORK_PER_WAVE, TOWER_BASE, WEAPON_DEFS, weaponCost as passiveCost, weaponLimit as passiveLimit, applyWeaponStats, killPayout, waveClearBonus, waveSpawnCount, waveHp as enemyHp, waveSpawnGap } from "./orbit-economy.mjs?v=2";
import { createGpuScene } from "./orbit-gpu.mjs?v=2";
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
  <div class="orbit-toolbar"><span>${escText(planetName)}</span><div class="orbit-camera-actions">
    <button type="button" data-zoom="out" aria-label="Aus dem gesamten Spielfeld herauszoomen">−</button>
    <button type="button" data-zoom="in" aria-label="In das gesamte Spielfeld hineinzoomen">+</button>
    <button class="orbit-pause" type="button" aria-label="Pause">II</button>
    <button class="orbit-exit" type="button" aria-label="Beenden">×</button>
  </div></div>
  <header class="hud">
    <div class="demo-tag">${escText(planetName)} · ORBIT-BELAGERUNG</div>
    <div class="hud-top">
      <div class="chip wave-chip"><small>WELLE</small><b id="wave">1</b></div>
      <div class="hp-block">
        <div class="hp-lab"><span>SCHILD</span><b id="hp-n">100</b></div>
        <i class="hp-track" id="hp-track"><em id="hp"></em></i>
      </div>
      <div class="chip salvage-chip"><small>BAUPUNKTE</small><b id="salvage">0</b></div>
    </div>
    <div class="hud-sub">
      <span>ABSCHÜSSE <b id="kills">0</b></span>
      <span>TÜRME <b id="towers">0</b></span>
      <span id="work-status" title="Zwei Bau- oder Ausbauaufträge pro Welle. Waffe und Schild kosten nur Punkte.">AUFTRAG 0/2</span>
      <span id="build-clock" hidden>AUFBAU <b id="build-t">0</b>s</span>
      <button type="button" id="build-open">BAUEN</button>
      <button type="button" id="build-go" hidden>Welle starten</button>
    </div>
  </header>
  <p class="wave-banner" id="banner" hidden></p>
  <button type="button" id="weapon-open" aria-label="Eigene Kanone passiv verbessern">WAFFE <span id="weapon-levels">0 · 0 · 0 · 0</span></button>
  <div class="controls">
    <div id="stick" class="orbit-stick" aria-label="Zielen"><b></b><small>ZIELEN</small></div>
    <div class="fire-col">
      <button id="aa" type="button" aria-label="Abwehr" class="ready"><span class="aa-cd"></span><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 27 7v8c0 7-6 12-11 15C11 27 5 22 5 15V7Z"/><path d="M16 8v15"/></svg><small>ABWEHR</small></button>
      <button id="fire" class="orbit-fire" type="button" aria-label="Feuer"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 0v14m0 20v14M0 24h14m20 0h14"/><circle cx="24" cy="24" r="2" fill="currentColor"/></svg><small>FEUER</small></button>
    </div>
  </div>
  <aside class="orbit-build" id="build-dock" hidden>
    <header>
      <b>STELLUNG</b>
      <small id="build-hint">Turm für diesen Bauplatz wählen</small>
      <button type="button" id="build-close" aria-label="Schließen">×</button>
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
const backdrop = document.createElement("div");
backdrop.className = "orbit-backdrop";
document.body.append(backdrop, root);
function escText(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const canvas = root.querySelector("canvas");
const ctx = canvas.getContext("2d", { alpha: true, desynchronized: false });
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
  battery: img("/assets/orbit-siege/turret-battery.png"),
  interceptor: img("/assets/orbit-siege/fighter-v3.png"),
  frigate: img("/assets/orbit-siege/frigate.png"),
  rocket: img("/assets/orbit-siege/rocket.png"),
  missile: img("/assets/orbit-siege/missile.png"),
  turrets: {
    laser: img("/assets/orbit-siege/turret-laser-v7.png"),
    silo: img("/assets/orbit-siege/turret-silo-v7.png"),
    flak: img("/assets/orbit-siege/turret-flak-v7.png"),
    gauss: img("/assets/orbit-siege/turret-gauss-v7.png"),
    tesla: img("/assets/orbit-siege/turret-tesla-v7.png"),
    mine: img("/assets/orbit-siege/turret-mine-v7.png"),
  },
  icons: {
    laser: "/assets/orbit-siege/turret-laser-v7.png",
    silo: "/assets/orbit-siege/turret-silo-v7.png",
    flak: "/assets/orbit-siege/turret-flak-v7.png",
    gauss: "/assets/orbit-siege/turret-gauss-v7.png",
    tesla: "/assets/orbit-siege/turret-tesla-v7.png",
    mine: "/assets/orbit-siege/turret-mine-v7.png",
    repair: "/assets/orbit-siege/upgrade-repair.jpg",
    rate: "/assets/orbit-siege/upgrade-rate.jpg",
    dmg: "/assets/orbit-siege/upgrade-dmg.jpg",
    range: "/assets/orbit-siege/upgrade-range.jpg",
    missiles: "/assets/orbit-siege/upgrade-missiles.jpg",
  },
};
function img(src) {
  const el = new Image();
  el.src = src;
  return el;
}
function ready(im) {
  return im && im.complete && im.naturalWidth > 0;
}
function keyed(im) {
  if (!ready(im)) return im;
  if (im._key) return im._key;
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const kr = p[0], kg = p[1], kb = p[2];
  const greenKey = kg > 80 && kg > kr + 28 && kg > kb + 28;
  if (!greenKey) {
    im._key = im;
    return im;
  }
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gc = p[i + 1], b = p[i + 2];
    const dom = gc - Math.max(r, b);
    if (dom > 16 && gc > 64) {
      p[i + 3] = Math.round(p[i + 3] * Math.max(0, 1 - dom / 88));
      if (p[i + 3] && gc > r) p[i + 1] = Math.min(gc, Math.round((r + b) * 0.5 + 10));
    }
  }
  g.putImageData(d, 0, 0);
  im._key = c;
  return c;
}

const TOWER_DEFS = [
  { id: "laser", title: "LASER", blurb: "Strahl · schnelle Jäger", cost: TOWER_BASE.laser, kind: "laser" },
  { id: "silo", title: "SILO", blurb: "Fängt Raketen ab", cost: TOWER_BASE.silo, kind: "silo" },
  { id: "flak", title: "FLAK", blurb: "Flächenschaden", cost: TOWER_BASE.flak, kind: "flak" },
  { id: "gauss", title: "GAUSS", blurb: "Durchschlägt Reihen", cost: TOWER_BASE.gauss, kind: "gauss" },
  { id: "tesla", title: "TESLA", blurb: "Kettenblitz", cost: TOWER_BASE.tesla, kind: "tesla" },
  { id: "mine", title: "MINE", blurb: "Explodiert bei Nähe", cost: TOWER_BASE.mine, kind: "mine" },
];
let shopMode='tower';
function weaponCost(def){return passiveCost(def, game.weaponLevels[def.id]);}
function weaponLimit(def){return passiveLimit(def, game.heldWaves);}
function syncWeapon(){
  const stats=applyWeaponStats(game.weaponLevels);
  game.playerDmg=stats.playerDmg;
  game.playerRate=stats.playerRate;
  game.playerPierce=stats.playerPierce;
  game.playerMissiles=stats.playerMissiles;
}
function buyWeapon(id){
  const def=WEAPON_DEFS.find(d=>d.id===id);if(!def)return;
  const level=game.weaponLevels[id]||0,cost=weaponCost(def);
  if(level>=weaponLimit(def)){showBanner(level>=def.max?'MAXIMALE WAFFENSTUFE':`NÄCHSTE STUFE AB ${level*2} GEHALTENEN WELLEN`);return;}
  if(game.salvage<cost){showBanner('ZU WENIG BAUPUNKTE');return;}
  game.salvage-=cost;game.weaponLevels[id]=level+1;syncWeapon();
  showBanner(`${def.title} STUFE ${level+1} · PASSIV`);paintShop();paintHud();
}

const SLOT_N = 6;
const TOWER_MAX = 8;
const PLANET_PX = 68;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 5;
const ARENA_RADIUS = 850;
let W = 1, H = 1, dpr = 1, cx = 0, cy = 0, planetR = PLANET_PX, shieldR = 90, ringR = 140;
let stars = [], dust = [], skyImage = null;
let zoom = 1, cameraScale = 1, screenCx = 0, screenCy = 0;
const pointers = new Map();
let pinch = null, tapIgnore = false;
const game = fresh();
root.orbitGame = game;
root.orbitView = () => ({
  W, H, cx, cy, planetR, shieldR, ringR, zoom, cameraScale, screenCx, screenCy,
  shakeX, shakeY, planetSpin: planetSpin(),
  arenaRadius: ARENA_RADIUS,
  slotN: SLOT_N, towerMax: TOWER_MAX,
  salvage: game.salvage,
  towers: game.towers.map((t) => ({ slot: t.slot, kind: t.kind, level: t.level || 1 })),
});
let last = 0, dragging = false, firing = false, keys = new Set();
let bannerT = 0, shakeX = 0, shakeY = 0, stopped = false;

function fresh() {
  return {
    mode: "build",
    paused: false,
    time: 0,
    hp: 100, maxHp: 100, salvage: START_SALVAGE, earned: 0, workUsed: 0, wave: 0, kills: 0,
    playerRate: 0.18, playerDmg: 1, playerPierce: 0, playerCd: 0, flak: 0, range: 1,
    playerMissiles: 0, weaponLevels:{dmg:0,rate:0,pierce:0,missiles:0}, shotN: 0, repairs: 0,
    aim: -Math.PI / 2, recoil: 0, flash: 0,
    shake: 0, hitFlash: 0,
    heldWaves: 0,
    aaCd: 0, aaMax: 8.5,
    pick: null,
    pendingSlot: null,
    buildTimer: 12,
    towers: [],
    enemies: [], rockets: [], interceptors: [],
    shots: [], sparks: [], smoke: [], rings: [], ripples: [], orbs: [], bolts: [], flashes: [], numbers: [],
    spawnLeft: 0, spawnWait: 0, waveLive: false,
  };
}
function towerLevel(t) {
  return Math.max(1, Math.min(TOWER_MAX, t?.level || 1));
}
function towerReach(t) {
  return (440 + 20 * (towerLevel(t) - 1)) * game.range;
}
function upgradeCost(def, level) {
  return Math.ceil((def?.cost || 80) * (0.8 + 0.35 * Math.max(1,level)**1.5)/5)*5;
}
function towerCost(def) {return Math.ceil(def.cost*(def.kind==='mine'?1:1+game.towers.filter(t=>t.kind!=='mine').length*.08)/5)*5;}
function availableLevel(){return Math.min(TOWER_MAX,1+Math.floor(game.heldWaves/3));}
function workReason(){return game.workUsed>=WORK_PER_WAVE?`BAUAUFTRÄGE VERBRAUCHT (${WORK_PER_WAVE}/${WORK_PER_WAVE}) · NÄCHSTE WELLE`:'';}
function planetSpin(){return game.time * 0.035;}
function repairCost() {
  return 50 + game.repairs * 25;
}
function slotAng(i) {
  return -Math.PI / 2 + (i + 0.5) * TAU / SLOT_N + planetSpin();
}
function slotPos(i) {
  const a = slotAng(i);
  return { x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR, ang: a, r: ringR, ring: 0, i };
}
function occupied(i) {
  return game.towers.some((t) => t.slot === i);
}
function occupying(slot) {
  if (!slot) return null;
  return game.towers.find((t) => t.slot === slot.i) || null;
}
function cheapestTower() {
  return TOWER_DEFS.filter((t) => towerCost(t) <= game.salvage).sort((a, b) => towerCost(a)-towerCost(b))[0] || null;
}
function canAffordTower() {
  if (game.towers.length >= SLOT_N || workReason()) return false;
  return TOWER_DEFS.some((t) => towerCost(t) <= game.salvage);
}
function canUpgradeAny() {
  return game.towers.some((t) => {
    if (t.level >= availableLevel() || t.buildLeft>0 || workReason()) return false;
    const def = TOWER_DEFS.find((d) => d.kind === t.kind);
    return def && game.salvage >= upgradeCost(def, t.level);
  });
}
function towerPos(t) {
  return slotPos(t.slot);
}

function seedSky() {
  const reach = 7000;
  stars = Array.from({ length: 500 }, () => ({
    a: Math.random() * TAU,
    r: 50 + Math.random() * reach,
    s: 1 + Math.random() * 5,
    tw: Math.random() * TAU,
  }));
  dust = Array.from({ length: 22 }, () => ({
    a: Math.random() * TAU,
    r: planetR * 1.7 + Math.random() * 2200,
    s: 1.1 + Math.random() * 2.4,
    tw: Math.random() * TAU,
  }));
}

function viewportSize() {
  const vv = window.visualViewport;
  return {
    vw: Math.round(vv?.width || window.innerWidth || 390),
    vh: Math.round(vv?.height || window.innerHeight || 720),
  };
}
function applyWindowSize() {
  const { vw, vh } = viewportSize();
  const vv = window.visualViewport;
  const left = Math.round(vv?.offsetLeft || 0);
  const top = Math.round(vv?.offsetTop || 0);
  root.style.setProperty("--orbit-w", `${vw}px`);
  root.style.setProperty("--orbit-h", `${vh}px`);
  root.style.setProperty("left", `${left}px`, "important");
  root.style.setProperty("top", `${top}px`, "important");
  root.style.setProperty("right", "auto", "important");
  root.style.setProperty("bottom", "auto", "important");
  root.classList.add("is-max");
  root.classList.toggle('is-short',vh<500);
  backdrop.style.setProperty("left", `${vv?.offsetLeft || 0}px`, "important");
  backdrop.style.setProperty("top", `${vv?.offsetTop || 0}px`, "important");
  backdrop.style.setProperty("width", `${vw}px`, "important");
  backdrop.style.setProperty("height", `${vh}px`, "important");
  resize();
}
function resize() {
  W = parseFloat(root.style.getPropertyValue('--orbit-w')) || root.clientWidth;
  H = parseFloat(root.style.getPropertyValue('--orbit-h')) || root.clientHeight;
  if (W < 48 || H < 48) {
    W = Math.round(window.innerWidth || 390);
    H = Math.round(window.innerHeight || 720);
  }
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = Math.max(2, Math.round(W * dpr));
  canvas.height = Math.max(2, Math.round(H * dpr));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // World geometry never depends on the viewport or camera zoom.
  cx = 0;
  cy = 0;
  planetR = PLANET_PX;
  shieldR = planetR * 1.72;
  ringR = planetR * 1.22;
  updateCamera();
  if (!stars.length) seedSky();
}
function updateCamera() {
  const top = Math.max(184, root.querySelector('.orbit-toolbar').getBoundingClientRect().bottom - root.getBoundingClientRect().top + 130);
  const bottom = H < 500 ? 82 : 160;
  const space = Math.max(100, H - top - bottom);
  screenCx = W / 2;
  screenCy = top + space / 2;
  cameraScale = Math.min(W - 36, space) / (ARENA_RADIUS * 2 + 160) * zoom;
}
window.addEventListener("resize", applyWindowSize);
vvListen();
function vvListen() {
  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener("resize", applyWindowSize);
  vv.addEventListener("scroll", applyWindowSize);
}
applyWindowSize();
requestAnimationFrame(() => { applyWindowSize(); requestAnimationFrame(applyWindowSize); });
let gpu = null;
try { gpu = createGpuScene(root, () => root.orbitView()); }
catch (err) { console.warn("Orbit-Feuer 3D:", err); gpu = null; }

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
  return { x: (e.clientX - r.left)*W/r.width, y: (e.clientY - r.top)*H/r.height };
}
function screenToWorld(sx, sy) {
  return { x: cx + (sx - screenCx) / cameraScale, y: cy + (sy - screenCy) / cameraScale };
}
function worldToScreen(wx, wy) {
  return { x: screenCx + (wx - cx) * cameraScale, y: screenCy + (wy - cy) * cameraScale };
}
function setZoom(next) {
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
  updateCamera();
  root.querySelector('[data-zoom="out"]').disabled = zoom <= ZOOM_MIN;
  root.querySelector('[data-zoom="in"]').disabled = zoom >= ZOOM_MAX;
  if (!buildDock.hidden && game.pendingSlot) shopDockSide(game.pendingSlot);
}
function resetCamera() {
  setZoom(1);
}
function nearestSlot(x, y) {
  let best = null, bestD = Math.max(56, 42 / cameraScale);
  for (let i = 0; i < SLOT_N; i++) {
    const p = slotPos(i);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
function placeOn(slot, def) {
  if (!slot || !def) return false;
  if (occupied(slot.i)) { openShop(slot); return false; }
  if(workReason()){showBanner(workReason());return false;}
  const cost=towerCost(def);
  if (game.salvage < cost) { showBanner("ZU WENIG BAUPUNKTE"); return false; }
  game.salvage -= cost;game.workUsed++;
  game.pick = def.id;
  game.towers.push({
    ring: 0, slot: slot.i, ang: slot.ang, kind: def.kind,
    cd: 0.2, lock: null, flash: 0, armed: 1, level: 1, buildLeft:4,
  });
  const p = slotPos(slot.i);
  burst(p.x, p.y, "#7fe7ff", 12);
  showBanner(def.title);
  closeShop();
  paintHud();
  return true;
}
function upgradeOn(slot) {
  const t = occupying(slot);
  if (!t) return false;
  if(workReason() || t.buildLeft>0){showBanner(workReason() || 'TURM WIRD GEBAUT');return false;}
  if(t.level>=availableLevel()){showBanner(`STUFE ${t.level+1} AB ${t.level*3} GEHALTENEN WELLEN`);return false;}
  if (t.level >= TOWER_MAX) { showBanner("MAX STUFE"); return false; }
  const def = TOWER_DEFS.find((d) => d.kind === t.kind);
  const cost = upgradeCost(def, t.level);
  if (game.salvage < cost) { showBanner("ZU WENIG PUNKTE"); return false; }
  game.salvage -= cost;
  game.workUsed++;t.buildLeft=3;t.level += 1;
  t.flash = 1;
  const p = slotPos(t.slot);
  burst(p.x, p.y, "#ffe08a", 10);
  showBanner(`${def.title} ${t.level}`);
  paintShop();
  paintHud();
  return true;
}
function shopDockSide(slot) {
  const p = slotPos(slot.i);
  const s = worldToScreen(p.x, p.y);
  buildDock.classList.toggle("dock-top", s.y > H * 0.46);
}
function openShop(slot) {
  if (game.paused || game.mode === "dead") return;
  shopMode='tower';buildDock.classList.remove('is-weapon-shop');
  game.pendingSlot = { ring: 0, i: slot.i, ang: slot.ang };
  const tower = occupying(slot);
  if (!tower && !TOWER_DEFS.some((t) => t.id === game.pick && t.cost <= game.salvage)) {
    game.pick = cheapestTower()?.id || "laser";
  }
  buildDock.hidden = false;
  shopDockSide(slot);
  const title = root.querySelector(".orbit-build header b");
  if (title) title.textContent = tower ? "AUSBAU" : "STELLUNG";
  if (tower) {
    const def = TOWER_DEFS.find((d) => d.kind === tower.kind);
    buildHint.textContent = tower.level >= TOWER_MAX
      ? `${def.title} Stufe ${tower.level} · Maximum`
      : `${def.title} Stufe ${tower.level} · Ausbau ${upgradeCost(def, tower.level)} Punkte`;
  } else {
    const def = TOWER_DEFS.find((t) => t.id === game.pick);
    buildHint.textContent = def
      ? `${def.title} · ${towerCost(def)} Baupunkte · Bauzeit 4 s`
      : "Turm wählen";
  }
  paintShop();
}
function closeShop() {
  game.pendingSlot = null;
  buildDock.hidden = true;
}
function onCanvasDown(e) {
  if (game.mode === "dead") return;
  const p = canvasPoint(e);
  pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  if (pointers.size >= 2) {
    tapIgnore = true;
    const pts = [...pointers.values()];
    const a = pts[0], b = pts[1];
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      scale: zoom,
    };
  }
}
function onCanvasMove(e) {
  const p = canvasPoint(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
  if (pointers.size >= 2) {
    const pts = [...pointers.values()];
    const a = pts[0], b = pts[1];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    if (!pinch) pinch = { dist, scale: zoom };
    setZoom(pinch.scale * (dist / pinch.dist));
    tapIgnore = true;
    return;
  }
  if (pointers.size !== 1) return;
  if (tapIgnore || game.mode !== "play" || game.paused) return;
  const w = screenToWorld(p.x, p.y);
  game.aim = Math.atan2(w.y - cy, w.x - cx);
}
function onCanvasUp(e) {
  const p = canvasPoint(e);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (tapIgnore) {
    if (pointers.size === 0) tapIgnore = false;
    return;
  }
  if (e.type==='pointercancel' || game.paused || game.mode === "dead") return;
  const w = screenToWorld(p.x, p.y);
  const slot = nearestSlot(w.x, w.y);
  if (slot) {
    openShop(slot);
    return;
  }
  if (!buildDock.hidden) { closeShop(); return; }
  if (game.mode === "play") game.aim = Math.atan2(w.y - cy, w.x - cx);
}
function onWheel(e) {
  if (game.mode === "dead") return;
  if (e.target?.closest?.(".overlay, .orbit-build, .controls")) return;
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  const factor = Math.exp(-(e.deltaY || 0) * 0.0022);
  setZoom(zoom * Math.max(0.82, Math.min(1.22, factor)));
}
canvas.addEventListener("pointerdown", onCanvasDown);
canvas.addEventListener("pointermove", onCanvasMove);
canvas.addEventListener("pointerup", onCanvasUp);
canvas.addEventListener("pointercancel", onCanvasUp);
canvas.addEventListener("wheel", onWheel, { passive: false });
root.addEventListener("wheel", onWheel, { passive: false });
root.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>setZoom(zoom*(b.dataset.zoom==='in'?1.25:0.8)));
fireBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); fireBtn.setPointerCapture(e.pointerId); firing = true; fireBtn.classList.add("pressed"); });
const stopFire = () => { firing = false; fireBtn.classList.remove("pressed"); };
fireBtn.addEventListener("pointerup", stopFire); fireBtn.addEventListener("pointercancel", stopFire);
aaBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); aaBurst(); });
function togglePause() {
  if (game.mode === "dead") return;
  game.paused = !game.paused;
  if (game.paused) {closeShop();stopFire();stopAim();keys.clear();pointers.clear();pinch=null;}
  root.querySelector("#pause").hidden = !game.paused;
  root.querySelector(".orbit-pause").textContent = game.paused ? "▶" : "II";
}
root.querySelector(".orbit-pause").onclick = togglePause;
root.querySelector("#pause-resume").onclick = togglePause;
const onKeyDown = (e) => {
  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
  if (e.code === "Escape" && !buildDock.hidden) { e.preventDefault(); closeShop(); return; }
  if (e.code === "KeyP" || e.code === "Escape") {
    if (e.code === "KeyP") { e.preventDefault(); togglePause(); }
  }
  if (e.code === "KeyE" || e.code === "KeyQ") { e.preventDefault(); aaBurst(); }
  if (e.code === "Equal" || e.code === "NumpadAdd") { e.preventDefault(); setZoom(zoom * 1.1); }
  if (e.code === "Minus" || e.code === "NumpadSubtract") { e.preventDefault(); setZoom(zoom / 1.1); }
  if (e.code === "Digit0" || e.code === "Numpad0") { e.preventDefault(); resetCamera(); }
};
const onKeyUp = (e) => keys.delete(e.code);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

function begin() {
  Object.assign(game, fresh());
  resetCamera();
  closeShop();
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
  closeShop();
  root.querySelector("#pause").hidden = true;
  root.querySelector("#dead").hidden = false;
  root.querySelector("#dead-label").textContent = error ? "ABBRUCH" : "RUNDE BEENDET";
  root.querySelector("#dead-title").textContent = `${game.kills} Treffer`;
  const hits = root.querySelector("#dead-hits");
  if (hits) hits.textContent = `${game.heldWaves} Wellen gehalten · ${game.kills} Abschüsse · ${game.earned} Baupunkte verdient · ${game.salvage} übrig`;
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
  try { gpu?.dispose(); } catch {}
  gpu = null;
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("resize", applyWindowSize);
  canvas.removeEventListener("pointerdown", onCanvasDown);
  canvas.removeEventListener("pointermove", onCanvasMove);
  canvas.removeEventListener("pointerup", onCanvasUp);
  canvas.removeEventListener("pointercancel", onCanvasUp);
  canvas.removeEventListener("wheel", onWheel);
  root.removeEventListener("wheel", onWheel);
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", applyWindowSize);
    vv.removeEventListener("scroll", applyWindowSize);
  }
  document.body.classList.remove("orbit-siege-open");
  backdrop.remove();
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
  closeShop();
  root.querySelector("#build-go").hidden = true;
  const n = waveSpawnCount(game.wave);
  game.spawnLeft = n;
  game.spawnWait = 0.18;
  showBanner(`WELLE ${game.wave}`);
}
function showBanner(text) {
  banner.hidden = false; banner.textContent = text; bannerT = 1.6;
}
function waveDone() {
  return game.waveLive && game.spawnLeft <= 0 && game.enemies.length === 0 && game.rockets.length === 0;
}
function openBuildShop() {
  if (game.paused || game.mode === "dead") return;
  for (let i = 0; i < SLOT_N; i++) {
    if (!occupied(i)) { openShop(slotPos(i)); return; }
  }
  const up = game.towers.find((t) => !t.buildLeft && t.level < availableLevel());
  if (up) openShop(slotPos(up.slot));
  else openShop(slotPos(0));
}
function openBuild(first) {
  game.mode = "build";
  game.waveLive = false;
  game.buildTimer = first ? 14 : 10 + Math.min(8, game.wave);
  if (!first){game.heldWaves = game.wave;const bonus=waveClearBonus(game.wave);game.salvage+=bonus;game.earned+=bonus;}
  game.workUsed=0;
  root.querySelector("#build-go").hidden = false;
  const loot = first ? "" : lootLine(game.wave);
  closeShop();
  showBanner(first ? "2 AUFTRÄGE · BAUEN" : (loot ? `WELLE ${game.wave} GEHALTEN · ${loot}` : `WELLE ${game.wave} GEHALTEN`));
}
function startCombat() {
  if (game.mode !== "build") return;
  nextWave();
  paintHud();
}
root.querySelector("#build-go").onclick = startCombat;
root.querySelector("#build-open").onclick = openBuildShop;
root.querySelector("#build-close").onclick = closeShop;
root.querySelector('#weapon-open').onclick=()=>{
  if(game.paused||game.mode==='dead')return;
  shopMode='weapon';game.pendingSlot=null;buildDock.hidden=false;
  buildDock.classList.remove('dock-top');buildDock.classList.add('is-weapon-shop');paintShop();
};

function paintShop() {
  if (buildDock.hidden) return;
  const slot = game.pendingSlot;
  const tower = occupying(slot);
  const title = root.querySelector(".orbit-build header b");
  if (title) title.textContent = tower ? "AUSBAU" : "STELLUNG";
  if (tower) {
    const def = TOWER_DEFS.find((d) => d.kind === tower.kind);
    buildHint.textContent = tower.level >= TOWER_MAX
      ? `${def.title} Stufe ${tower.level} · Maximum`
      : `${def.title} Stufe ${tower.level} · Ausbau ${upgradeCost(def, tower.level)} Punkte`;
  } else {
    const def = TOWER_DEFS.find((t) => t.id === game.pick);
    buildHint.textContent = def
      ? `${def.title} · ${towerCost(def)} Baupunkte · Bauzeit 4 s`
      : "Turm wählen";
  }
  const items = [];
  const locked=workReason();
  if(locked)buildHint.textContent=locked;
  else if(tower?.buildLeft>0)buildHint.textContent=`Im Bau · ${Math.ceil(tower.buildLeft)} s`;
  else if(tower && tower.level>=availableLevel() && tower.level<TOWER_MAX)buildHint.textContent=`Nächste Stufe ab ${tower.level*3} gehaltenen Wellen`;
  if(shopMode==='weapon'){
    title.textContent='KANONE · PASSIV';buildHint.textContent='Kostet nur Baupunkte, keinen Bauauftrag. Gilt bis zum Rundenende.';
    for(const def of WEAPON_DEFS){
      const level=game.weaponLevels[def.id]||0,maxed=level>=def.max,gated=level>=weaponLimit(def);
      const next=applyWeaponStats({...game.weaponLevels,[def.id]:level+1});
      const value=def.id==='dmg'?`${game.playerDmg.toFixed(2)} → ${next.playerDmg.toFixed(2)} Schaden`:def.id==='rate'?`${(1/game.playerRate).toFixed(1)} → ${(1/next.playerRate).toFixed(1)} Schuss/s`:def.id==='pierce'?`Durchschlag ${level} → ${level+1}`:`Begleitrakete bei jedem ${Math.max(4,6-level)}. Schuss`;
      items.push({...def,id:'weapon-'+def.id,type:'weapon',icon:def.icon||def.id,title:`${def.title} ${level}/${def.max}`,cost:weaponCost(def),maxed,gated,blurb:maxed?'Voll verbessert':gated?`Ab ${level*2} gehaltenen Wellen`:value});
    }
  } else {
  if (tower) {
    const def = TOWER_DEFS.find((d) => d.kind === tower.kind);
    const maxed = tower.level >= TOWER_MAX;
    items.push({
      id: "upgrade",
      type: "upgrade",
      title: maxed ? "MAX" : `STUFE ${tower.level + 1}`,
      blurb: maxed ? `${def.title} voll ausgebaut` : `${def.title} ausbauen`,
      cost: maxed ? 0 : upgradeCost(def, tower.level),
      icon: def.id,
      maxed,
    });
  } else {
    for (const t of TOWER_DEFS) items.push({ ...t, cost:towerCost(t), type: "tower", icon: t.id });
  }
  items.push({
    id: "repair",
    type: "boost",
    title: "SCHILD",
    blurb: "+28 HP",
    cost: repairCost(),
    icon: "repair",
  });
  }
  const signature=JSON.stringify([shopMode,game.weaponLevels,slot?.i,tower?.level,!!locked,(tower?.buildLeft||0)>0,availableLevel(),game.hp>=game.maxHp,items.map(i=>[i.id,i.cost,i.gated,game.salvage>=i.cost])]);
  if(shopEl.dataset.signature===signature)return;
  shopEl.dataset.signature=signature;
  shopEl.innerHTML = items.map((item) => {
    const on = game.pick === item.id || item.type === "upgrade" ? " on" : "";
    const poor = item.maxed || game.salvage < item.cost ? " poor" : "";
    const cost = item.maxed ? "—" : item.cost;
    const blocked=(item.type!=='weapon'&&item.id!=='repair'&&locked) || item.maxed || item.gated || game.salvage<item.cost || item.id==='repair'&&game.hp>=game.maxHp || item.id==='upgrade'&&(tower.buildLeft>0 || tower.level>=availableLevel());
    return `<button type="button" class="orbit-shop-item${on}${poor}" data-shop="${item.id}" data-kind="${item.type}" ${blocked?'disabled':''}>
      <img src="${ART.icons[item.icon]}" alt="">
      <b>${item.title}</b>
      <em>${cost}</em>
      <small>${item.blurb}</small>
    </button>`;
  }).join("");
  shopEl.querySelectorAll("[data-shop]").forEach((btn) => {
    btn.onclick = () => {
      if(game.paused || game.mode==='dead')return;
      const id = btn.dataset.shop;
      if(id.startsWith('weapon-')){buyWeapon(id.slice(7));return;}
      if (id === "upgrade") {
        upgradeOn(game.pendingSlot);
        return;
      }
      if (id === "repair") {
        if(game.hp>=game.maxHp){showBanner('SCHILD BEREITS VOLL');return;}
        const cost = repairCost();
        if (game.salvage < cost) { showBanner("ZU WENIG PUNKTE"); return; }
        game.salvage -= cost;
        game.hp = Math.min(game.maxHp, game.hp + 28);
        game.repairs += 1;
        showBanner("SCHILD");
        paintShop();
        paintHud();
        return;
      }
      const def = TOWER_DEFS.find((t) => t.id === id);
      if (!def) return;
      game.pick = id;
      if (game.pendingSlot) {
        if (game.salvage < towerCost(def)) {
          showBanner("ZU WENIG PUNKTE");
          paintShop();
          return;
        }
        placeOn(game.pendingSlot, def);
        return;
      }
      paintShop();
      buildHint.textContent = `${def.title} · ${towerCost(def)} Baupunkte · Bauplatz antippen`;
    };
  });
}

function die() {
  finishRun();
}

function spawnDist() {
  return ARENA_RADIUS;
}
function edgePoint() {
  const ang = Math.random() * TAU;
  const dist = spawnDist();
  return { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist, ang };
}
function waveHp(wave, heavy) {
  return enemyHp(wave, heavy);
}
function spawnEnemy() {
  const rocketOdds = game.wave >= 3 ? Math.min(0.1 + game.wave * 0.016, 0.3) : 0.07;
  if (Math.random() < rocketOdds) {
    spawnRocket();
    return;
  }
  const heavy = game.wave >= 2 && Math.random() < Math.min(0.1 + game.wave * 0.022, 0.48);
  const p = edgePoint();
  const hp = waveHp(game.wave, heavy);
  const speed = (heavy ? 34 + game.wave * 1.5 : 50 + game.wave * 3.1) * (0.88 + Math.random() * 0.24);
  game.enemies.push({
    x: p.x, y: p.y,
    r: heavy ? 13 : 9,
    hp, max: hp,
    heavy, flash: 0, speed,
    wobble: Math.random() * TAU,
    trail: [],
    launchCd: heavy ? Math.max(1.35, 2.8 - game.wave * 0.05) : 0,
  });
}
function spawnRocket(x, y) {
  const p = x == null ? edgePoint() : { x, y };
  const d = Math.hypot(cx - p.x, cy - p.y) || 1;
  const speed = 68 + game.wave * 4.2;
  game.rockets.push({
    x: p.x, y: p.y,
    vx: (cx - p.x) / d * speed,
    vy: (cy - p.y) / d * speed,
    hp: 1 + Math.floor(game.wave / 5), r: 5, trail: [], warn: 1,
  });
}
function launchInterceptor(x, y, ang, target, dmg) {
  const speed = 340;
  game.interceptors.push({
    x, y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    speed, life: target ? Math.max(1.85,Math.hypot(target.x-x,target.y-y)/speed+.75) : 1.85, target, trail: [], dmg: dmg != null ? dmg : 1 + game.flak,
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
  if (game.flashes.length < 28) game.flashes.push({ x, y, life: 0.38, radius: heavy ? 26 : 14 });
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
    if (Math.hypot(e.x - x, e.y - y) < radius + e.r) { e.hp -= dmg;e.lastHitByPlayer=false; e.flash = 1; }
  }
  for (const r of game.rockets) {
    if (r.hp <= 0) continue;
    if (Math.hypot(r.x - x, r.y - y) < radius + r.r) { r.hp -= dmg;r.lastHitByPlayer=false; r.flash = 1; }
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
  salvage = killPayout({ heavy: !!e.heavy, rocket: !e.heavy && e.warn != null, wave: game.wave, player: !!e.lastHitByPlayer });
  game.salvage += salvage;game.earned+=salvage;
  paintShop();
  boom(e.x, e.y, e.heavy);
  const chip = salvageEl.getBoundingClientRect();
  const cr = canvas.getBoundingClientRect();
  const from = worldToScreen(e.x, e.y);
  game.orbs.push({
    x: from.x, y: from.y,
    tx: (chip.left + chip.width / 2 - cr.left)*W/cr.width,
    ty: (chip.top + chip.height / 2 - cr.top)*H/cr.height,
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
  if(t.buildLeft>0)return;
  const L = towerLevel(t);
  const reach = towerReach(t);
  const cdMul = Math.pow(0.97, L - 1);
  const shotDmg = (t.kind === "gauss" ? 2 : 1) + (L-1)*(t.kind==='gauss'?.35:.18);
  t.lock = null;
  if (t.kind === "silo") {
    t.lock = nearest(game.rockets, p.x, p.y, reach * 1.4) || nearest(game.enemies, p.x, p.y, reach);
    if (!t.lock || t.cd > 0) return;
    t.cd = 0.72 * cdMul; t.flash = 1;
    const ang = Math.atan2(t.lock.y - p.y, t.lock.x - p.x);
    t.shotVisual = { at: game.time, angle: ang, x: t.lock.x, y: t.lock.y };
    launchInterceptor(p.x, p.y, ang, t.lock, shotDmg);
    return;
  }
  if (t.kind === "mine") {
    const prey = nearest(game.enemies, p.x, p.y, 52 + L * 4) || nearest(game.rockets, p.x, p.y, 52 + L * 4);
    if (!prey) return;
    splashAt(p.x, p.y, 62 + L * 8, 3 + L, "255,70,70");
    t.spent = true;
    return;
  }
  t.lock = nearest(game.enemies, p.x, p.y, reach) || nearest(game.rockets, p.x, p.y, reach * 0.9);
  if (!t.lock || t.cd > 0) return;
  const ang = Math.atan2(t.lock.y - p.y, t.lock.x - p.x);
  t.flash = 1;
  t.shotVisual = { at: game.time, angle: ang, x: t.lock.x, y: t.lock.y };
  if (t.kind === "laser") {
    t.cd = 0.34 * cdMul;
    t.lock.hp -= shotDmg; t.lock.lastHitByPlayer=false;t.lock.flash = 1;
    burst(t.lock.x, t.lock.y, "#7fe7ff", 3);
  } else if (t.kind === "flak") {
    t.cd = 0.58 * cdMul;
    shootFrom(p.x, p.y, ang, shotDmg, 420, "flak", { splash: 42 + L * 6, life: reach / 420 + 0.25 });
  } else if (t.kind === "gauss") {
    t.cd = 0.95 * cdMul;
    shootFrom(p.x, p.y, ang, shotDmg, 900, "gauss", { pierce: 3 + Math.floor(L / 3), life: Math.max(.85,reach/900+.2) });
  } else if (t.kind === "tesla") {
    t.cd = 0.74 * cdMul;
    const hits = [];
    let cur = t.lock;
    const chains = 3 + Math.floor((L - 1) / 3);
    for (let n = 0; n < chains && cur; n++) {
      hits.push(cur);
      cur.hp -= shotDmg;cur.lastHitByPlayer=false;cur.flash = 1;
      const from = n === 0 ? p : hits[n - 1];
      zap(from, cur);
      burst(cur.x, cur.y, "#9cf6ff", 5);
      const pool = game.enemies.concat(game.rockets).filter((o) => o.hp > 0 && !hits.includes(o));
      cur = nearest(pool, cur.x, cur.y, 100 + L * 6);
    }
  }
}

function step(dt) {
  if (game.paused) return;
  game.time += dt;
  for(const t of game.towers)t.buildLeft=Math.max(0,(t.buildLeft||0)-dt);
  if(!buildDock.hidden)paintShop();
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
  for (const f of game.flashes) f.life -= dt;
  game.flashes = game.flashes.filter((f) => f.life > 0);
  for (const n of game.numbers) n.life -= dt;
  game.numbers = game.numbers.filter((n) => n.life > 0);

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
    shootFrom(mx, my, game.aim, game.playerDmg, 680, "player", { pierce: game.playerPierce || 0 });
    if (game.playerMissiles > 0 && game.shotN % (7-game.playerMissiles) === 0) {
      launchInterceptor(mx, my, game.aim, nearest(game.rockets, mx, my, 900) || nearest(game.enemies, mx, my, 900),1+.5*game.playerMissiles);
    }
  }
  if (game.spawnLeft > 0) {
    game.spawnWait -= dt;
    if (game.spawnWait <= 0) {
      spawnEnemy();
      game.spawnLeft -= 1;
      game.spawnWait = waveSpawnGap(game.wave);
    }
  }
  for (const t of game.towers) {
    t.cd -= dt;
    t.flash = Math.max(0, t.flash - dt * 5);
    fireTower(t, towerPos(t));
  }
  game.towers = game.towers.filter((t) => !t.spent);
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    const dx = cx - e.x, dy = cy - e.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    e.wobble += dt;
    const sway = Math.sin(e.wobble * 3.1) * (e.heavy ? 7 : 16);
    e.x += nx * e.speed * dt + -ny * sway * dt * 3.2;
    e.y += ny * e.speed * dt + nx * sway * dt * 3.2;
    e.flash = Math.max(0, e.flash - dt * 4);
    e.trail.push({ x: e.x, y: e.y });
    if (e.trail.length > 22) e.trail.shift();
    if (e.heavy) {
      e.launchCd -= dt;
      if (e.launchCd <= 0) {
        e.launchCd = Math.max(1.35, 2.8 - game.wave * 0.05);
        spawnRocket(e.x, e.y);
      }
    }
    if (d < shieldR + e.r * 0.4) {
      game.hp -= e.heavy ? 18 : 8;
      game.shake = Math.max(game.shake, e.heavy ? 11 : 7);
      game.hitFlash = 1;
      boom(e.x, e.y, true);
      game.ripples.push({ r: shieldR, life: 0.5 });
      e.hp = 0; e.hitPlanet = true;
    }
  }
  for (const r of game.rockets) {
    if (r.hp <= 0) continue;
    r.x += r.vx * dt; r.y += r.vy * dt;
    r.flash = Math.max(0, (r.flash || 0) - dt * 4);
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 20) r.trail.shift();
    if (game.smoke.length < 70 && Math.random() < 0.18) puff(r.x, r.y, "rgba(255,140,60,0.35)", 1);
    const d = Math.hypot(cx - r.x, cy - r.y);
    if (d < shieldR + r.r) {
      game.hp -= 14;
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
      o.hp -= s.dmg + extra;o.lastHitByPlayer=s.kind==='player';o.flash = 1;
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
    if (m.trail.length > 16) m.trail.shift();
    if (game.smoke.length < 70 && Math.random() < 0.22) puff(m.x, m.y, "rgba(120,230,255,0.28)", 1);
    let hit = false;
    for (const r of game.rockets) {
      if (r.hp <= 0) continue;
      if (Math.hypot(m.x - r.x, m.y - r.y) < 14) {
        r.hp -= m.dmg;r.lastHitByPlayer=false;r.flash = 1; hit = true;
        interceptBoom(m.x, m.y);
        break;
      }
    }
    if (!hit) {
      for (const e of game.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(m.x - e.x, m.y - e.y) < e.r + 8) {
          e.hp -= m.dmg;e.lastHitByPlayer=false;e.flash = 1; hit = true;
          boom(m.x, m.y, false);
          break;
        }
      }
    }
    if (hit) m.life = 0;
  }
  for (const e of game.enemies) {
    if (e.hp <= 0 && !e.hitPlanet) kill(e);
  }
  for (const r of game.rockets) {
    if (r.hp <= 0 && !r.hitPlanet) kill(r);
  }
  game.enemies = game.enemies.filter((e) => e.hp > 0);
  game.rockets = game.rockets.filter((r) => r.hp > 0);
  game.interceptors = game.interceptors.filter((m) => m.life > 0 && Math.hypot(m.x - cx, m.y - cy) < ARENA_RADIUS + 300);
  game.shots = game.shots.filter((s) => s.life > 0 && Math.hypot(s.x - cx, s.y - cy) < ARENA_RADIUS + 300);
  if (game.sparks.length > 140) game.sparks.splice(0, game.sparks.length - 140);
  if (game.smoke.length > 80) game.smoke.splice(0, game.smoke.length - 80);
  if (game.hp <= 0) { game.hp = 0; die(); return; }
  if (waveDone()) openBuild(false);
}

function drawBg() {
  ctx.fillStyle = "#02060d";
  ctx.fillRect(cx - 8000, cy - 8000, 16000, 16000);
  if (ready(ART.bg)) {
    if (!skyImage) {
      // Fade the artwork into deep space, so a wide camera has no rectangular image edges.
      skyImage = document.createElement('canvas');
      skyImage.width = ART.bg.naturalWidth;
      skyImage.height = ART.bg.naturalHeight;
      const sky = skyImage.getContext('2d');
      sky.drawImage(ART.bg, 0, 0);
      sky.globalCompositeOperation = 'destination-in';
      for (const vertical of [false, true]) {
        const fade = sky.createLinearGradient(0, 0, vertical ? 0 : skyImage.width, vertical ? skyImage.height : 0);
        fade.addColorStop(0, 'transparent');
        fade.addColorStop(.16, '#000');
        fade.addColorStop(.84, '#000');
        fade.addColorStop(1, 'transparent');
        sky.fillStyle = fade;
        sky.fillRect(0, 0, skyImage.width, skyImage.height);
      }
    }
    const s = 4400 / Math.min(ART.bg.naturalWidth, ART.bg.naturalHeight);
    const dw = ART.bg.naturalWidth * s, dh = ART.bg.naturalHeight * s;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(skyImage, cx - dw / 2, cy - dh / 2, dw, dh);
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
  const lit = (canAffordTower() || canUpgradeAny()) && !game.paused && game.mode !== "dead";
  const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(game.time * 4.2));
  ctx.save();
  ctx.strokeStyle = `rgba(80,220,255,${lit ? 0.32 + 0.22 * pulse : 0.12})`;
  ctx.lineWidth = lit ? 2.2 : 1.2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < SLOT_N; i++) {
    const p = slotPos(i);
    const taken = occupied(i);
    const pending = game.pendingSlot && game.pendingSlot.i === i;
    const tower = occupying(p);
    const up = taken && tower && !workReason() && !tower.buildLeft && tower.level < availableLevel() && game.salvage >= upgradeCost(TOWER_DEFS.find((d) => d.kind === tower.kind), tower.level);
    const hot = lit && (!taken || up);
    const col = pending ? "255,240,140" : up ? "255,210,90" : "90,230,255";
    if (hot || pending) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, pending ? 28 : 22);
      g.addColorStop(0, `rgba(255,255,210,${0.55 * pulse})`);
      g.addColorStop(0.45, `rgba(${col},${0.45 * pulse})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, pending ? 28 : 22, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = taken ? `rgba(${col},0.1)` : `rgba(${col},${hot || pending ? 0.22 + 0.18 * pulse : 0.07})`;
    ctx.strokeStyle = `rgba(${col},${taken && !up ? 0.18 : pending ? 1 : hot ? 0.85 : 0.28})`;
    ctx.lineWidth = pending ? 3 : hot ? 2.4 : 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, pending ? 14 : hot ? 12 : 7, 0, TAU); ctx.fill(); ctx.stroke();
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

function sprAspect(im, fallback) {
  return ready(im) && im.naturalHeight ? im.naturalWidth / im.naturalHeight : fallback;
}
function drawSprite(im, x, y, rot, w, h, ox = 0.5, oy = 0.5) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (ready(im)) ctx.drawImage(keyed(im), -w * ox, -h * oy, w, h);
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
  const reach = spawnDist();
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
  const size = player ? 22 : kind === "mine" ? 16 : 24;
  const spr = player ? ART.battery : ART.turrets[kind] || ART.turrets.laser;
  const glowCol = kind === "gauss" ? "255,210,90" : kind === "flak" || kind === "mine" ? "255,150,70" : kind === "silo" ? "255,180,70" : kind === "tesla" ? "120,240,255" : "80,230,255";
  ctx.save();
  ctx.translate(p.x, p.y);
  const aim = player ? game.aim : (t.lock ? Math.atan2(t.lock.y - p.y, t.lock.x - p.x) : (t.shotVisual?.angle ?? p.ang));
  const kick = player ? game.recoil * 0.35 : (t.flash || 0) * 4;
  ctx.rotate(aim + Math.PI / 2);
  ctx.translate(0, kick);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(0, 0, size * 0.12, 0, 0, size * 0.62);
  halo.addColorStop(0, `rgba(${glowCol},0.28)`);
  halo.addColorStop(0.45, `rgba(${glowCol},0.08)`);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, size * 0.62, 0, TAU); ctx.fill();
  ctx.restore();
  if (ready(spr)) ctx.drawImage(keyed(spr), -size / 2, -size / 2, size, size);
  else { ctx.fillStyle = "#4ec8e4"; ctx.fillRect(-3, -size * 0.5, 6, size * 0.7); }
  const flash = player ? game.flash : t.flash || 0;
  if (flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = flash;
    const g = ctx.createRadialGradient(0, -size * 0.32, 1, 0, -size * 0.32, size * 0.42);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.35, kind === "gauss" ? "#ffe08a" : kind === "flak" || kind === "mine" ? "#ffb060" : "#7fe7ff");
    g.addColorStop(1, "rgba(70,220,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -size * 0.32, size * 0.42, 0, TAU); ctx.fill();
  }
  ctx.restore();
  if (!player && t.level) {
    ctx.save();
    ctx.font = `800 ${Math.max(9, Math.round(planetR * 0.32))}px Rajdhani,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(4,12,20,0.72)";
    ctx.beginPath(); ctx.arc(p.x + size * 0.28, p.y + size * 0.28, Math.max(7, planetR * 0.22), 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.fillText(t.buildLeft>0?`${Math.ceil(t.buildLeft)}s`:String(t.level), p.x + size * 0.28, p.y + size * 0.28 + 0.5);
    ctx.restore();
  }
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
  const h = e.heavy ? 36 : 24;
  const w = h * sprAspect(spr, e.heavy ? 0.67 : 0.68);
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
  const h = 11;
  const w = h * sprAspect(ART.rocket, 0.34);
  const ang = Math.atan2(r.vy, r.vx);
  drawSprite(ART.rocket, r.x, r.y, ang + Math.PI / 2, w, h, 0.5, 0.38);
}

function drawInterceptor(m) {
  drawTrail(m.trail, "rgba(90,230,255,0.5)", 2.4);
  const h = 10;
  const w = h * sprAspect(ART.missile, 0.31);
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
  ctx.restore();
}
function drawOrbs() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
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
  const pad = 18, padT = 174, padB = H < 500 ? 80 : 160;
  const marks = game.enemies.map((e) => ({ e, rocket: false })).concat(game.rockets.map((e) => ({ e, rocket: true })));
  for (const m of marks) {
    const e = m.e;
    const s = worldToScreen(e.x, e.y);
    if (s.x > pad && s.x < W - pad && s.y > padT && s.y < H - padB) continue;
    const ang = Math.atan2(e.y - cy, e.x - cx);
    const x = Math.min(W - pad, Math.max(pad, s.x));
    const y = Math.min(H - padB, Math.max(padT, s.y));
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (gpu) {
    ctx.clearRect(0, 0, W, H);
    gpu.render(game);
    ctx.save();
    drawIncoming();
    drawOrbs();
    ctx.translate(screenCx + shakeX, screenCy + shakeY);
    ctx.scale(cameraScale, cameraScale);
    ctx.translate(-cx, -cy);
    for (const e of game.enemies) drawTrail(e.trail, e.heavy ? "rgba(255,110,40,0.35)" : "rgba(255,70,50,0.28)", e.heavy ? 2.4 : 1.5);
    for (const r of game.rockets) drawTrail(r.trail, "rgba(255,130,40,0.55)", 2);
    for (const m of game.interceptors) drawTrail(m.trail, "rgba(90,230,255,0.55)", 1.6);
    drawAimGuide();
    drawSlots();
    ctx.textAlign = "center";
    ctx.font = `${11 / cameraScale}px Sora,sans-serif`;
    for (const n of game.numbers) {
      ctx.globalAlpha = Math.min(1, n.life * 2);
      ctx.fillStyle = n.player ? "#ffce95" : "#b5eeff";
      ctx.fillText(n.text, n.x, n.y - (1 - n.life) * 40);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#02060d";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(screenCx + shakeX, screenCy + shakeY);
  ctx.scale(cameraScale, cameraScale);
  ctx.translate(-cx, -cy);
  drawBg();
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
  ctx.restore();
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawIncoming();
  drawOrbs();
  ctx.restore();
  const vig = ctx.createRadialGradient(screenCx, screenCy, Math.min(W, H) * 0.18, screenCx, screenCy, Math.hypot(W, H) * 0.62);
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
  root.querySelector('#work-status').textContent=`AUFTRAG ${game.workUsed}/${WORK_PER_WAVE}`;
  const buildOpen = root.querySelector("#build-open");
  if (buildOpen) buildOpen.hidden = game.mode === "dead" || game.paused;
  const lv=root.querySelector('#weapon-levels');
  if(lv) lv.textContent=`${game.weaponLevels.dmg} · ${game.weaponLevels.rate} · ${game.weaponLevels.pierce} · ${game.weaponLevels.missiles}`;
  const building = game.mode === "build";
  buildClock.hidden = !building;
  if (building) buildT.textContent = String(Math.max(0, Math.ceil(game.buildTimer)));
  const go = root.querySelector("#build-go");
  if (go) go.hidden = !building || game.paused || !buildDock.hidden;
  root.classList.toggle("is-build", building);
  root.classList.toggle("shop-open", !buildDock.hidden);
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
