import { api, getState, getCatalog, getPreview as fetchBuildingPreview, getGalaxy, getSystem, getReports, getRanks, getEmpire, combatPreview, combatSim, getAlliances, getAlliance, getAllianceActivity } from "./api.js?v=5";
import { esc, fmt, eta, when, costHtml, planetCss, planetGlobeUrl, planetColonyUrl, mediaTag, bindMediaFallbacks, toast, showModal as showModalEl, hideModal as hideModalEl, shipList, starfield, resourceIcon, icon, beep, notify, tickEta, ticksOf, tickMsFrom } from "./ui.js?v=2";
import { createMap, systemHtml } from "./map.js?v=69";
import { battleReplayHtml, bindBattleReplays } from "./battle.js?v=2";
import { startAllianceBossEncounter } from "./alliance-boss-game.js?v=16";
import { CITY_PLOTS } from "./city.mjs?v=11";
import { shipBudget } from "./ship-budget.mjs?v=1";
import { colonyRows, colonyHudHtml, paintColonyMarkers, paintColonyFrame } from "./colony-hud.mjs?v=8";
import { createColonyUnity, setUnityColonyVisible } from "./colony-unity.js?v=14";
import { startOrbitSiege } from "./orbit-siege.mjs?v=9";


const $ = (id) => document.getElementById(id);
async function getPreview(planetId) {
  return { ...await fetchBuildingPreview(planetId), planetId: String(planetId) };
}

const state = {
  catalog: null,
  snap: null,
  preview: null,
  view: "command",
  baseView: "command",
  focusPending: false,
  galaxy: null,
  map: null,
  chatChannel: "global",
  mailPeer: null,
  newsTab: "messages",
  openReports: new Set(),
  highlightBuilding: null,
  cityBuilding: null,
  citySheet: null,
  cityScene: null,
  cityCam: { x: 0, y: 0, scale: 1, tilt: 0, ready: false, planetId: 0 },
  colonizeMode: null, // { sourcePlanetId, targetSystemId, targetPlanetId } bei Kolonie-Auswahl
  lastInteractionAt: 0,
  lastBusyToastAt: 0,
  activityDurations: {},
  allianceResearchChoice: "",
  allianceQuickMessage: "",
};

const TUTORIAL = [
  {
    id: "move",
    title: "Schau dir deine Kolonie an",
    text: "Ziehe mit einem Finger oder gedrückter Maustaste, um die Basis zu verschieben. Zoome mit zwei Fingern oder dem Mausrad. Über Gebäude erreichst du auch entfernte Bauplätze.",
  },
  {
    id: "mine",
    title: "Baue die Metall-Mine",
    text: "Öffne die Metall-Mine in der Basis oder der Gebäudeliste und wähle Aufleveln. Metall ist der Grundstoff für alles.",
    plot: "matter_mine",
    done: (s) => (s.planet?.buildings?.matter_mine || 0) >= 1,
  },
  {
    id: "upgrade",
    title: "Baue die Mine aus",
    text: "Eine Stufe reicht nicht. Baue die Metall-Mine auf Stufe 2 — sonst bleibt die Werft leer.",
    plot: "matter_mine",
    done: (s) => (s.planet?.buildings?.matter_mine || 0) >= 2,
  },
  {
    id: "energy",
    title: "Energie einschalten",
    text: "Als Nächstes das Energie-Array. Ohne Strom stehen Schilde und Labor still.",
    plot: "energy_array",
    done: (s) => (s.planet?.buildings?.energy_array || 0) >= 1,
  },
  {
    id: "yard", title: "Deine ersten Schiffe", text: "Öffne die Werft und wähle Schiffe produzieren. Prüfe Voraussetzungen und Kosten, wähle die Anzahl und starte den Auftrag. Fertige Schiffe stehen auf diesem Planeten bereit.", plot: "shipyard",
  },
  { id: "defense", title: "Schütze deine Basis", text: "Im Verteidigungszentrum führt Verteidigung bauen zur Produktion. Voraussetzungen zeigt der Tech-Tree. Baue zuerst die nötigen Gebäude und Forschung aus.", plot: "defense_hub" },
  { id: "daily", title: "Tägliche Aufgaben und Nex", text: "Unter Aufgaben findest du Ziele und abholbare Belohnungen. Kommando → Nexus bietet täglich kostenlose Nex. Dort löst du auch Schiffe und den Pass ausschließlich mit Nex ein." },
  { id: "mail", title: "Kontakt und Hilfe", text: "Kommando → Funk → Postfach öffnet private Nachrichten. Unter Orden findest du die Kampagne; Hilfe erklärt die Grundlagen. Diese Einführung kannst du mit Erste Schritte jederzeit erneut öffnen." },
  {
    id: "galaxy",
    title: "Raus in die Galaxie",
    text: "Unten in der Leiste: Karte. Dort fliegst du, spionierst und holst Trümmer. Die Kolonie bleibt dein Zuhause.",
    tab: "map",
  },
];

try {
  starfield($("stars"));
} catch (err) {
  console.error(err);
}

function show(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.remove("hidden");
}
function hide(el) {
  if (!el) return;
  el.hidden = true;
  el.classList.add("hidden");
}

function resourceIds() {
  return state.catalog?.resourceIds || ["metal", "helium", "titan", "energy", "crystal", "diamond"];
}

const RESOURCE_VIEWS = new Set(["command", "infra", "research", "yard", "defense", "alliance"]);
let focusEpoch=0,focusChain=Promise.resolve();
const rootView=()=>state.baseView||"command";
const hasCommandPanel=()=>!["command","galaxy"].includes(state.view);
const activeViewRoot=()=>hasCommandPanel()?$("panel-view"):$("view");

function chromeResourceIds() {
  const ids = resourceIds();
  const primary = ["metal", "energy", "crystal"].filter((id) => ids.includes(id));
  return [...primary, ...ids.filter((id) => !primary.includes(id))];
}

function applyResourceChrome() {
  const shell = $("game");
  const show = RESOURCE_VIEWS.has(state.view);
  shell?.classList.toggle("show-resources", show);
  if (show) return;
  const el = $("resources");
  if (!el?.classList.contains("expanded")) return;
  el.classList.remove("expanded");
  const toggle = el.querySelector(".resource-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "⌄";
  }
}

function resourceCardHtml(model, extraClass) {
  const { k, def, value: v, cap, prod, pct, full } = model;
  return `<div class="res ${extraClass}${full ? " full" : ""}" data-k="${k}" title="${esc(def.name)}: ${fmt(v)} / ${fmt(cap)} · +${fmt(prod)}/h">
        <img class="res-art" src="/assets/resources/${k}.jpg" alt="" />
        <div class="res-meta">
          <em>${esc(def.short || def.name)}</em>
          <b style="color:${full ? "var(--danger)" : def.color}">${fmt(v)}</b>
          <small>${prod > 0 ? `+${fmt(prod)}/h` : "kein Gebäude"}</small>
        </div>
        <i class="fill" style="width:${pct}%;background:${def.color}"></i>
      </div>`;
}

function have() {
  const p = state.snap?.planet;
  const out = {};
  for (const k of resourceIds()) out[k] = p ? liveRes(k) : 0;
  return out;
}

function canAfford(cost) {
  const res = have();
  for (const k in cost) {
    if ((res[k] || 0) < (cost[k] || 0)) return false;
  }
  return true;
}

function currentShipBudget(info) {
  const p=state.snap.planet;
  return shipBudget(info.cost,have(),{unlocked:info.unlocked,cap:p.shipCap,stationed:p.shipCount,
    queued:state.snap.queue.filter(q=>q.kind==='ship' && q.planetId===p.id).reduce((n,q)=>n+q.qty,0)});
}
function clampYardQty(input, max) {
  if (!input) return 0;
  const cap = Math.min(50, Math.max(1, Number(max) || 50));
  const raw = String(input.value || "").trim();
  if (raw === "") return 0;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) {
    input.value = "1";
    return 1;
  }
  if (n > cap) {
    input.value = String(cap);
    return cap;
  }
  return n;
}
function updateShipBudgets() {
  const root=document.querySelector('.yard-sheet');
  if(!root || state.preview?.planetId!==String(state.snap?.planet?.id)) return;
  for(const info of state.preview.ships || []) {
    const budget=currentShipBudget(info),label=root.querySelector(`[data-ship-budget="${info.id}"]`);
    if(label) label.textContent=`Mit Ressourcen bezahlbar: ${budget.affordable.toLocaleString('de-DE')} · Jetzt baubar: ${budget.buildable.toLocaleString('de-DE')}`;
    const input=root.querySelector(`[data-qty="${info.id}"]`),button=root.querySelector(`[data-ship="${info.id}"]`);
    const max=String(Math.max(1, budget.buildable || 1));
    if(input && input.max!==max) input.max=max;
    const qty=clampYardQty(input, budget.buildable || 1);
    if(button) button.disabled=!!root.dataset.submitting || !budget.buildable || qty<1 || qty>budget.buildable;
  }
}

function liveRes(k) {
  const p = state.snap.planet;
  if (!p) return 0;
  const dt = (Date.now() - p.lastTick) / 3_600_000;
  const cap = typeof p.storage === "object" ? p.storage[k] : p.storage;
  return Math.min(Math.max(cap ?? 9000,p[k] || 0), (p[k] || 0) + (p.production?.[k] || 0) * Math.max(0,dt));
}

function renderResources() {
  const p = state.snap?.planet;
  const el = $("resources");
  if (!el) return;
  if (!p) {
    el.innerHTML = "";
    delete el.dataset.signature;
    return;
  }
  const models = resourceIds().map((k) => {
    const def = state.catalog.resources[k];
    const value = liveRes(k);
    const cap = typeof p.storage === "object" ? p.storage[k] : p.storage;
    const prod = p.production[k] || 0;
    const pct = Math.min(100, Math.round((value / Math.max(1, cap)) * 100));
    return { k, def, value, cap, prod, pct, full: pct >= 92 };
  });
  const structure = JSON.stringify([p.id, models.map((m) => [m.k, m.cap, m.prod]), !!state.snap.empire.nexDailyReady]);
  if (el.dataset.signature === structure) {
    for (const model of models) {
      const card = el.querySelector(`[data-k="${model.k}"]`);
      if (!card) continue;
      card.classList.toggle("full", model.full);
      card.title = `${model.def.name}: ${fmt(model.value)} / ${fmt(model.cap)} · +${fmt(model.prod)}/h`;
      const value = card.querySelector("b");
      if (value) { value.textContent = fmt(model.value); value.style.color = model.full ? "var(--danger)" : model.def.color; }
      const fill = card.querySelector(".fill");
      if (fill) fill.style.width = `${model.pct}%`;
    }
    const nex = el.querySelector('[data-k="nex"] b');
    if (nex) nex.textContent = fmt(state.snap.empire.nex || 0);
    const clock = $("clock");
    if (clock) clock.textContent = new Date().toLocaleTimeString("de-DE");
    return;
  }
  el.dataset.signature = structure;
  const ids = chromeResourceIds();
  const primary = ids.slice(0, 3).map((k) => resourceCardHtml(models.find((model) => model.k === k), "res-primary")).join("");
  const secondary = ids.slice(3).map((k) => resourceCardHtml(models.find((model) => model.k === k), "res-secondary")).join("");
  const e = state.snap.empire;
  el.innerHTML = `${primary}<button type="button" class="resource-toggle" aria-expanded="false" aria-label="Weitere Ressourcen anzeigen" title="Weitere Ressourcen">⌄</button>
    <div class="res-more">${secondary}<div class="res nex res-secondary" data-k="nex" data-goto="nexus" title="Nex — Premium-Währung für Spezieswechsel und Spezialangebote">
      <img class="res-art" src="/assets/nex.jpg" alt="" />
      <div class="res-meta">
        <em>Nex</em>
        <b>${fmt(e.nex || 0)}</b>
        <small>${e.nexDailyReady ? "Tagesbonus bereit" : "Premium"}</small>
      </div>
    </div></div>`;
  const clock = $("clock");
  if (clock) clock.textContent = new Date().toLocaleTimeString("de-DE");
  applyResourceChrome();
  el.querySelector("[data-goto]")?.addEventListener("click", () => setView("nexus"));
  el.querySelector(".resource-toggle")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const expanded = el.classList.toggle("expanded");
    const toggle = el.querySelector(".resource-toggle");
    toggle?.setAttribute("aria-expanded", String(expanded));
    if (toggle) toggle.textContent = expanded ? "⌃" : "⌄";
  });
  if (!el.dataset.outsideBound) {
    el.dataset.outsideBound = "1";
    document.addEventListener("click", (ev) => {
      if (!el.classList.contains("expanded") || el.contains(ev.target)) return;
      el.classList.remove("expanded");
      const toggle = el.querySelector(".resource-toggle");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "⌄";
      }
    });
  }
}

function showModal(html) {
  showModalEl(html);
  const modal = $("modal");
  if (modal) modal.onclick = (e) => { if (e.target === modal) hideModal(); };
  syncColonyPointerEvents();
}
function hideModal() {
  hideModalEl();
  syncColonyPointerEvents();
}

function overlayBlocksColony() {
  const modal = $("modal");
  const cityActions = document.querySelector("#city-actions");
  return !!(
    $("command-panel") ||
    $("game")?.classList.contains("nav-open") ||
    $("orders")?.open ||
    document.querySelector(".orbit-game") ||
    document.body.classList.contains("orbit-siege-open") ||
    (cityActions && !cityActions.hidden) ||
    (modal && !modal.hidden && !modal.classList.contains("hidden"))
  );
}
function syncColonyPointerEvents() {
  const block = overlayBlocksColony();
  for (const id of ["colony-unity-layer", "colony-unity-canvas"]) {
    const el = $(id);
    if (el) el.style.pointerEvents = block ? "none" : "";
  }
}

function renderDock() {
  const dock = $("dock-items");
  if (!dock) return;
  const q = state.snap?.queue || [];
  const f = state.snap?.fleets || [];
  const acts = (state.snap?.activities || []).filter((a) => a.running);
  const count=q.length+f.length+acts.length;
  const planetId=state.snap?.planet?.id;
  const jobs=[
    ...q.map((x)=>({end:x.completesAt,label:`${x.planetName || "Welt"} · ${x.name}${x.qty>1?" ×"+x.qty:""}`,local:x.planetId===planetId})),
    ...f.map((x)=>({end:x.arrivesAt,label:`${x.originName} → ${x.targetName}`,local:x.originPlanetId===planetId||x.targetPlanetId===planetId})),
    ...acts.map((x)=>({end:x.readyAt,label:[x.planetName,x.name].filter(Boolean).join(" · "),local:x.planetId===planetId})),
  ].filter((x)=>x.end);
  jobs.sort((a,b)=>a.end-b.end);
  const next=jobs.find((x)=>x.local) || jobs[0];
  const countEl=$("orders-count"), nextEl=$("orders-next"), etaEl=$("orders-eta");
  if(countEl)countEl.textContent=`Aufträge · ${count}`;
  if(nextEl)nextEl.textContent=next ? next.label : "Keine aktiven Aufträge";
  if(etaEl){
    if(next){etaEl.dataset.liveEta=String(next.end);etaEl.textContent=eta(next.end-Date.now());}
    else{delete etaEl.dataset.liveEta;etaEl.textContent="";}
  }
  const signature = JSON.stringify([
    q.map((x) => [x.id, x.startedAt, x.completesAt, x.qty, x.planetId, x.planetName, x.name]),
    f.map((x) => [x.id, x.departedAt, x.arrivesAt, x.returning]),
    acts.map((x) => [x.id, x.startedAt, x.readyAt, x.durationName]),
  ]);
  const updateTimes = () => {
    const nowAt = Date.now();
    const timed = [
      ...q.map((x) => ({ start: x.startedAt, end: x.completesAt })),
      ...f.map((x) => ({ start: x.departedAt, end: x.arrivesAt })),
      ...acts.map((x) => ({ start: x.startedAt || nowAt - x.wait, end: x.readyAt || nowAt })),
    ];
    [...dock.children].forEach((card, index) => {
      const start = Number(timed[index]?.start || nowAt);
      const end = Number(timed[index]?.end || nowAt);
      const pct = clamp(((nowAt - start) / Math.max(1, end - start)) * 100, 0, 100);
      const fill = card.querySelector(".bar > i");
      const label = card.querySelector("[data-dock-eta]");
      if (fill) fill.style.width = `${pct}%`;
      if (label) label.textContent = eta(end - nowAt);
    });
  };
  if (dock.dataset.signature === signature) {
    updateTimes();
    return;
  }
  dock.dataset.signature = signature;
  if (!q.length && !f.length && !acts.length) {
    dock.innerHTML = `<div class="muted" style="align-self:center">Keine aktiven Aufträge.</div>`;
    return;
  }
  const t = Date.now();
  const queueHtml = q
    .map((item) => {
      const pct = clamp(((t - item.startedAt) / Math.max(1, item.completesAt - item.startedAt)) * 100, 0, 100);
      const kind =
        item.kind === "building" ? "BAU" : item.kind === "ship" ? "WERFT" : item.kind === "defense" ? "ABWEHR" : "FORSCHUNG";
      const view = queueViewOf(item.kind);
      return `<div class="queue-item panel dock-jump" role="button" tabindex="0" data-dock-view="${view}" data-dock-planet="${item.planetId || ""}" title="${esc(kind)} öffnen">
          <b>${kind}</b>
          <span><strong class="queue-planet">${esc(item.planetName || "Welt")}</strong> · ${esc(item.name)}${item.qty > 1 ? " ×" + item.qty : ""}${item.levelTo ? " → " + item.levelTo : ""}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="row"><span data-dock-eta>${eta(item.completesAt - t)}</span>
            <button class="btn ghost small" data-cancel="${item.id}">Abbruch</button></div>
        </div>`;
    })
    .join("");
  const fleetHtml = f
    .map((fl) => {
      const pct = clamp(((t - fl.departedAt) / Math.max(1, fl.arrivesAt - fl.departedAt)) * 100, 0, 100);
      const label = fl.returning ? "RÜCKFLUG" : (state.catalog.missions[fl.mission]?.name || fl.mission).toUpperCase();
      return `<div class="fleet-item panel dock-jump" role="button" tabindex="0" data-dock-view="galaxy" data-dock-planet="${fl.originPlanetId || ""}" title="Auf der Karte zeigen">
          <b>${label}</b>
          <span>${esc(fl.originName)} → ${esc(fl.targetName)}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <span data-dock-eta>${eta(fl.arrivesAt - t)}</span>
        </div>`;
    })
    .join("");
  const actHtml = acts
    .map((a) => {
      const pct = clamp(((Date.now() - (a.startedAt || Date.now() - a.wait)) / Math.max(1, (a.readyAt || Date.now()) - (a.startedAt || Date.now() - a.wait))) * 100, 0, 100);
      return `<div class="queue-item panel dock-jump" role="button" tabindex="0" data-dock-view="activity" data-dock-planet="${a.planetId || ''}" title="Zur Einsatzzentrale">
          <b>EINSATZ</b>
          <span>${esc(a.planetName || '')} · ${esc(a.name)} · ${esc(a.durationName || "")}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <span data-dock-eta>${eta((a.readyAt || Date.now()) - t)}</span>
        </div>`;
    })
    .join("");
  dock.innerHTML = queueHtml + fleetHtml + actHtml;
  updateTimes();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function queueViewOf(kind) {
  if (kind === "building") return "infra";
  if (kind === "ship") return "yard";
  if (kind === "defense") return "defense";
  if (kind === "research" || kind === "ally_research") return "research";
  return "command";
}

function isViewEditing() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || "").toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select" && !a.isContentEditable) return false;
  const view = activeViewRoot();
  const modal = $("modal");
  return !!(view?.contains(a) || (modal && !modal.hidden && modal.contains(a)));
}

function formFieldKey(el) {
  if (el.id) return "#" + el.id;
  const ds = Object.keys(el.dataset || {})
    .sort()
    .map((k) => `${k}=${el.dataset[k]}`)
    .join("&");
  if (ds) return "d:" + ds;
  if (el.name) return "n:" + el.name + ":" + (el.type || "");
  return "";
}

function snapshotViewForm() {
  const root = activeViewRoot();
  if (!root) return null;
  const data = {};
  root.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.type === "file" || el.type === "hidden" || el.type === "password") return;
    const key = formFieldKey(el);
    if (!key) return;
    data[key] = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
  });
  return { view: state.view, planetId:state.snap?.planet?.id, data };
}

function restoreViewForm(draft) {
  const root = activeViewRoot();
  if (!root || !draft || draft.view !== state.view || draft.planetId!==state.snap?.planet?.id) return;
  root.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.type === "file" || el.type === "hidden" || el.type === "password") return;
    const key = formFieldKey(el);
    if (!key || !(key in draft.data)) return;
    const val = draft.data[key];
    if (el.type === "checkbox" || el.type === "radio") el.checked = !!val;
    else el.value = val;
  });
}

async function switchPlanet(planetId) {
  const pid=Number(planetId);if(!pid||pid===state.snap?.planet?.id&&!state.focusPending)return true;
  const epoch=++focusEpoch;state.focusPending=true;hideModal();closeNavSheet();
  if($('view'))$('view').inert=true;
  const panel=$('command-panel');if(panel)panel.inert=true;
  $('game')?.classList.add('focus-pending');
  try {
    // Serialize focus mutations so a slower older request cannot win on the server.
    const request=focusChain.catch(()=>{}).then(()=>api('/focus',{method:'POST',body:{planetId:pid}}));focusChain=request;
    const snap=await request,preview=await getPreview(pid).catch(()=>null);
    if(epoch!==focusEpoch)return false;
    state.snap=snap;state.preview=preview;state.cityCam.ready=false;state.cityBuilding=null;state.citySheet=null;
    paintChrome();renderView({preserveForm:false});syncCityLive();return true;
  }catch(err){if(epoch===focusEpoch){toast(err.message,true);paintChrome();}return false;}
  finally{if(epoch===focusEpoch){state.focusPending=false;$('game')?.classList.remove('focus-pending');if($('view'))$('view').inert=false;if($('command-panel'))$('command-panel').inert=false;paintChrome();}}
}

async function jumpTo(view, planetId) {
  const pid=Number(planetId);
  if(pid&&pid!==state.snap?.planet?.id&&!await switchPlanet(pid))return;
  if(view==='galaxy'&&pid){const p=(state.snap?.planets||[]).find(p=>p.id===pid)||state.snap?.planet;state.mapFocus={planetId:pid,systemId:p?.systemId||p?.system_id};}
  setView(view,{routed:true});
}

function bindJumps(root) {
  if (!root) return;
  root.querySelectorAll("[data-view-jump]").forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (b.dataset.highlightBuilding) state.highlightBuilding = b.dataset.highlightBuilding;
      jumpTo(b.dataset.viewJump, b.dataset.jumpPlanet);
    });
  });
}

function reportJumps(r) {
  const b = r.body || {};
  if (Array.isArray(b.jumps) && b.jumps.length) {
    return b.jumps.map((j) => ({
      view: j.view,
      label: j.label || "Öffnen",
      planetId: j.planetId || b.planetId,
    }));
  }
  if (b.view) return [{ view: b.view, label: b.viewLabel || "Öffnen", planetId: b.planetId }];
  const out = [];
  const add = (view, label, planetId) => {
    if (!view || out.some((j) => j.view === view && j.label === label)) return;
    out.push({ view, label, planetId: planetId || b.planetId });
  };
  if (b.activity) add("activity", "Einsatzzentrale");
  const blob = `${r.title || ""} ${b.text || ""}`;
  switch (r.kind) {
    case "alert":
      add("galaxy", "Zur Galaxie");
      add("defense", "Verteidigung verstärken");
      add("fleets", "Zur Flotte");
      break;
    case "build":
      if (/Jäger|Fregatte|Kreuzer|Zerstörer|Sonde|Bomber|Frachter|Träger|Kolonieschiff|Schlachtschiff|Dreadnought|Aeon|Interceptor|Werft/i.test(blob) || b.itemKind === "ship")
        add("yard", "Zur Werft");
      else if (/Batterie|Flak|Rakete|Ion|Gauss|Orbital|Mine|Plasma|Laser|Disruptor|Verteidigung/i.test(blob) || b.itemKind === "defense")
        add("defense", "Zur Verteidigung");
      else add("infra", "Zu den Gebäuden");
      break;
    case "research":
      add("research", "Zur Forschung");
      break;
    case "fleet":
      add("fleets", "Zur Flotte");
      add("galaxy", "Zur Galaxie");
      break;
    case "combat":
      add("fleets", "Zur Flotte");
      add("galaxy", "Zur Galaxie");
      break;
    case "spy":
      if (!b.planetId) add("galaxy", "Zur Galaxie");
      break;
    case "expedition":
    case "salvage":
      add("galaxy", "Zur Galaxie");
      add("activity", "Einsatzzentrale");
      break;
    case "event":
      if (/Echo|Orbit|Sonde|Jäger|Piratenfunk|Piraten/i.test(blob)) {
        add("galaxy", "Sonde senden");
        add("yard", "Jäger verstärken");
        add("fleets", "Zur Flotte");
      } else if (!b.activity) add("command", "Zur Übersicht");
      break;
    case "colony":
      add("command", "Zur Übersicht");
      break;
    default:
      break;
  }
  return out;
}

function jumpButtonsHtml(jumps) {
  if (!jumps?.length) return "";
  return `<div class="report-jumps">${jumps
    .map(
      (j) =>
        `<button type="button" class="btn ghost small" data-view-jump="${esc(j.view)}"${j.planetId ? ` data-jump-planet="${j.planetId}"` : ""}>${esc(j.label)}</button>`
    )
    .join("")}</div>`;
}

function closeNavSheet() {
  const shell = $("game");
  const backdrop = $("nav-backdrop");
  if (shell) shell.classList.remove("nav-open");
  hide(backdrop);
  syncColonyPointerEvents();
  const more = $("tabbar")?.querySelector("[data-tab='more']");
  if (more) more.classList.toggle("on", tabIdFor(state.view) === "more");
}

function openNavSheet() {
  const shell = $("game");
  const backdrop = $("nav-backdrop");
  const nav = $("nav");
  if (nav) nav.scrollTop = 0;
  if (shell) shell.classList.add("nav-open");
  if (nav) nav.scrollTop = 0;
  show(backdrop);
  syncColonyPointerEvents();
  $("tabbar")?.querySelector("[data-tab='more']")?.classList.add("on");
}

function tabIdFor(view) {
  if (view === "command") return "home";
  if (view === "galaxy") return "map";
  return "cmd";
}

function setView(name,opts={}) {
  const next=name==='fleets'?'galaxy':name||'command';
  if(!views[next])return;
  if(!opts.routed)state.highlightBuilding=null;
  hideModal();closeNavSheet();stopChatPoll();
  if(['command','galaxy'].includes(next)){state.baseView=next;state.citySheet=null;state.cityBuilding=null;}
  state.view=next;
  try{localStorage.setItem('sn-view',rootView());}catch{}
  renderView({preserveForm:false});
  if(['infra','yard','research','defense'].includes(next)&&state.preview?.planetId!==String(state.snap?.planet?.id)) {
    const id=state.snap.planet.id,epoch=focusEpoch;
    getPreview(id).then(p=>{if(epoch===focusEpoch&&id===state.snap.planet.id&&state.view===next){state.preview=p;syncCityLive();renderView();}}).catch(err=>toast(err.message,true));
  }
}
function closeCommandPanel(){setView(rootView());}

let snapshotRevision=0;
function acceptMissionSnapshot(snap,epoch) {
  if(epoch!==focusEpoch || state.focusPending || !snap?.empire)return;
  snapshotRevision++;
  const focus=state.snap.planet.id;
  // /fleet may return its source planet. Keep the user's current focus.
  if(snap.planet.id!==focus)snap.planet={...state.snap.planet,...snap.planets.find(p=>p.id===focus)};
  state.snap=snap;
  paintChrome();syncCityLive();renderDock();renderAlerts();
  if (rootView() === "galaxy") state.refreshSystemSheet?.();
}
async function refresh(planetId, { rerender = true, afterAction = false } = {}) {
  const epoch=focusEpoch,id=planetId||state.snap?.planet?.id;
  const revision=++snapshotRevision;
  if(state.focusPending || actionPending && !afterAction)return false;
  const before=panelStateSignature();
  const snap=await getState(id);
  const preview=snap.planet?await getPreview(snap.planet.id).catch(()=>null):null;
  if(epoch!==focusEpoch||state.focusPending||revision!==snapshotRevision)return false;
  state.snap=snap;state.preview=preview;
  syncCityLive();
  paintChrome();
  watchEvents(state.snap);
  if (state.snap.daily) {
    toast(`Tagesbonus · Serie ${state.snap.daily.streak}`);
    beep("done");
  }
  for (const m of state.snap.newMedals || []) {
    toast(`Medaille: ${m.title}`);
    notify("Medaille", m.title);
    beep("done");
  }
  if ((rerender && liveRerender()) || (['infra','yard','research','defense','activity'].includes(state.view) && before!==panelStateSignature())) renderView();
  if (rootView() === "galaxy" && state.map) {
    try {
      state.galaxy = await getGalaxy();
      state.map.setData(state.galaxy);
      syncMapPlanetOptions();
      state.refreshSystemSheet?.();
    } catch {
      /* map stays */
    }
  }
  return true;
}

function panelStateSignature(){const s=state.snap;return JSON.stringify([s?.planet?.id,s?.planet?.buildings,s?.planet?.ships,s?.planet?.defenses,s?.planet?.shipCap,s?.techs,s?.queue,s?.fleets,s?.activities?.map(a=>[a.id,a.running,a.readyAt]),s?.alliance?.research]);}
let actionPending=0;
function updateBuildActions(){
 if(actionPending || state.focusPending)return;
 const root=$('panel-view');if(!root)return;
 for(const [attr,list,kind] of [['build','buildings','building'],['tech','techs','research']])for(const b of root.querySelectorAll(`[data-${attr}]`)){
  const info=state.preview?.[list]?.find(i=>i.id===b.dataset[attr]);if(!info)continue;
  const job=state.snap.queue.find(q=>q.kind===kind && (kind==='research' || q.planetId===state.snap.planet.id));
  const homeOnlyBldg = kind==='building' && (b.dataset.build==='archive' || b.dataset.build==='quantum_lab') && !state.snap.planet.isHome;
  const reason=job ? `${kind==='research'?'Labor':'Bauschleife'} belegt: ${job.name} · ${job.planetName} · ${eta(job.completesAt-Date.now())}` : kind==='research' && !state.snap.planet.isHome ? 'Forschung nur auf dem Hauptplaneten. Die Stufen gelten für alle Kolonien.' : kind==='research' && !(state.snap.planet.buildings.archive>=1) ? 'Forschungsarchiv Stufe 1 auf dem Hauptplaneten benötigt.' : homeOnlyBldg ? 'Forschungsarchiv und Quantenlabor stehen nur auf dem Hauptplaneten.' : !info.unlocked ? 'Voraussetzungen fehlen; siehe Gebäude- und Forschungsstufen.' : !canAfford(info.nextCost || {}) ? 'Nicht genug Ressourcen auf diesem Planeten.' : '';
  b.disabled=!!reason || !!info.max;
  const hint=b.parentElement.querySelector('[data-action-reason]');if(hint)hint.textContent=reason;
 }
}

function markUserInteraction() {
  state.lastInteractionAt = Date.now();
}

document.addEventListener("pointerdown", markUserInteraction, { passive: true });
document.addEventListener("keydown", markUserInteraction, { passive: true });

function liveRerender() {
  if (isViewEditing()) return false;
  if (Date.now() - state.lastInteractionAt < 750) return false;
  const skip = new Set(["galaxy", "chat", "reports", "sim", "alliance", "settings", "moderation", "command", "infra", "yard", "defense", "research", "activity"]);
  return !skip.has(state.view);
}

function updateAllianceBadge(n) {
  const count = Math.max(0, Number(n) || 0);
  document.querySelectorAll("[data-badge='alliance']").forEach((el) => {
    el.hidden = count <= 0;
    el.textContent = count > 9 ? "9+" : String(count);
  });
}

function allianceActivityRows() {
  const act = state.snap?.allianceActivity || { attacks: [], defenses: [] };
  return [
    ...(act.defenses || []).map((d) => ({ ...d, dir: "defense" })),
    ...(act.attacks || []).map((a) => ({ ...a, dir: "attack" })),
  ].sort((a, b) => a.arrivesAt - b.arrivesAt);
}

function allianceActivityTableHtml(rows) {
  if (!rows.length) {
    return `<h3 style="font-size:13px;margin:0 0 8px">Allianz-Aktivität</h3>
      <p class="muted">Keine laufenden Angriffe oder Verteidigungen von Verbündeten.</p>`;
  }
  const tbody = rows
    .map(
      (r) => `<tr class="ally-act-row" role="button" tabindex="0" data-goto-planet="${r.targetId}" data-system-id="${r.systemId}" title="In der Galaxie zeigen">
        <td>${r.dir === "attack" ? "Angriff" : "Verteidigen"}</td>
        <td>${esc(r.actor || r.attacker || r.defender || "—")}</td>
        <td>${esc(r.target)}</td>
        <td>${when(r.arrivesAt)}</td>
        <td>${forceCount(r.ships)}</td>
      </tr>`
    )
    .join("");
  return `<h3 style="font-size:13px;margin:0 0 8px">Allianz-Aktivität <i class="page-badge">${rows.length > 9 ? "9+" : rows.length}</i></h3>
    <p class="hint">Nur Aktionen von Verbündeten. Klick öffnet den Planeten in der Galaxie.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Art</th><th>Verbündeter</th><th>Planet</th><th>Ankunft</th><th>Schiffe</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>`;
}

function bindAllianceActivityClicks(root) {
  if (!root) return;
  const go = (el) => {
    const planetId = Number(el.dataset.gotoPlanet);
    const systemId = Number(el.dataset.systemId);
    if (!planetId || !systemId) return;
    jumpToGalaxyPlanet(planetId, systemId);
  };
  root.querySelectorAll("[data-goto-planet]").forEach((el) => {
    el.addEventListener("click", () => go(el));
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        go(el);
      }
    });
  });
}

function jumpToGalaxyPlanet(planetId, systemId) {
  state.mapFocus = { planetId: Number(planetId), systemId: Number(systemId) };
  if (state.view === "galaxy") {
    applyMapFocus();
    return;
  }
  setView("galaxy");
}

function applyMapFocus() {
  const focus = state.mapFocus;
  if (!focus || !state.map) return;
  let systemId = focus.systemId;
  if (!systemId && focus.planetId) {
    const pl = (state.snap?.planets || []).find((p) => p.id === focus.planetId);
    systemId = pl?.systemId;
  }
  if (!systemId) return;
  state.map.focusPlanet(focus.planetId, systemId);
  state.mapFocus = null;
}

function paintAllianceActivityFromSnap() {
  const host = $("ally-activity");
  if (!host) return;
  const rows = allianceActivityRows();
  host.innerHTML = allianceActivityTableHtml(rows);
  bindAllianceActivityClicks(host);
}

function paintChrome() {
  const s = state.snap;
  if (!s?.empire) return;
  $("empire-name").textContent = s.user.isAdmin
    ? `${s.empire.name} · ADMIN`
    : s.user.isMod
      ? `${s.empire.name} · MOD`
      : s.empire.name;
  document.querySelectorAll("#nav-staff").forEach((sec) => {
    sec.hidden = !(s.user.isAdmin || s.user.isMod);
  });
  document.querySelectorAll("#nav-staff [data-view='moderation']").forEach((b) => {
    b.textContent = s.user.isAdmin ? "Admin" : "Moderation";
  });
  $("empire-name").style.color = s.empire.color;
  const av = $("brand-avatar");
  if (av && s.empire.avatar) av.src = s.empire.avatar;
  localStorage.setItem("sn-sound", s.empire.sound === false ? "0" : "1");
  localStorage.setItem("sn-notify", s.empire.notify ? "1" : "0");
  const sel = $("planet-select");
  if (sel) {
    const cur = String(s.planet?.id || "");
    const options=(s.planets||[]).map(p=>`<option value="${p.id}">${p.isAlliance?`[${esc(s.alliance?.tag||"ALLY")}] `:""}${esc(p.name)}</option>`).join("");
    if(sel.dataset.options!==options){sel.innerHTML=options;sel.dataset.options=options;}
    if(!state.focusPending)sel.value=cur;
  }
  const hints = s.hints || {};
  const moreKeys = ["economy", "nexus", "activity", "reports", "chat", "infra", "yard", "defense", "research", "alliance"];
  const moreN = moreKeys.reduce((n, k) => n + (Number(hints[k]) || 0), 0);
  const badgeMap = { ...hints, more: moreN, reports: hints.reports || s.unread || 0, chat: hints.chat || s.unreadChat || 0 };
  for (const el of document.querySelectorAll("[data-badge]")) {
    if (el.dataset.badge === "alliance") continue;
    const n = Number(badgeMap[el.dataset.badge] || 0);
    el.hidden = n <= 0;
    el.textContent = n > 9 ? "9+" : String(n);
  }
  updateAllianceBadge(hints.alliance || 0);
  paintAllianceActivityFromSnap();
  renderResources();
  renderDock();
  renderAlerts();
  renderNotice();
  paintOrbitButton();
}

function renderNotice() {
  let el = $("notice-strip");
  const msg = state.snap?.world?.announcement;
  if (!msg) {
    if (el) {
      el.hidden = true;
      el.classList.add("hidden");
    }
    $("game")?.classList.remove("has-notice");
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "notice-strip";
    el.className = "notice-strip";
    const view = $("view");
    view?.parentNode?.insertBefore(el, view);
  }
  el.hidden = false;
  el.classList.remove("hidden");
  el.textContent = msg;
  $("game")?.classList.add("has-notice");
}

let lastQueue = {};
let lastIncoming = new Set();
let eventsReady = false;

function watchEvents(snap) {
  const nextQ = {};
  for (const q of snap.queue || []) nextQ[q.id] = q;
  const nextIn = new Set((snap.incoming || []).map((x) => x.id));
  if (eventsReady) {
    for (const [id, q] of Object.entries(lastQueue)) {
      if (!nextQ[id]) {
        toast(`${q.name} fertig`);
        beep("done");
      }
    }
    for (const id of nextIn) {
      if (!lastIncoming.has(id)) {
        const hit = (snap.incoming || []).find((x) => x.id === id);
        toast(`Eingehend: ${hit?.from || "Feind"} → ${hit?.planet || ""}`, true);
        beep("alert");
        notify("Stellar Nexus", `Eingehender ${hit?.kind === "spy" ? "Scan" : "Angriff"} auf ${hit?.planet || "Kolonie"}`);
      }
    }
  }
  lastQueue = nextQ;
  lastIncoming = nextIn;
  eventsReady = true;
}

function renderAlerts() {
  const globalAlert = $("alert-strip");
  if (globalAlert) {
    globalAlert.hidden = true;
    globalAlert.classList.add("hidden");
    globalAlert.innerHTML = "";
  }
  $("game")?.classList.remove("has-alert");
  const el = $("map-raid-banner");
  if (!el) return;
  const threat = (state.snap?.incoming || [])
    .find((hit) => hit.kind === "attack" || hit.kind === "raid") ||
    (state.snap?.incoming || [])[0] || null;

  if (!threat) {
    el.hidden = true;
    el.classList.add("hidden");
    el.innerHTML = "";
    delete el.dataset.signature;
    el.onclick = null;
    el.onkeydown = null;
    return;
  }

  const kind = threat.kind === "raid" ? "Piraten-Raid" : threat.kind === "spy" ? "Scan" : "Angriff";
  const etaLabel = threat.kind === 'raid' && !threat.defending && threat.arrivesAt <= Date.now() ? (threat.expiresAt > Date.now() ? `Freigabe offen · Abzug in ${eta(threat.expiresAt - Date.now())}` : 'Piraten ziehen ab …') : `${threat.defending ? 'Verstärkung in ' : ''}${eta(Math.max(0, threat.arrivesAt - Date.now()))}`;
  const whenLabel = new Date(threat.arrivesAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const planetName = threat.planet || "Zielplanet";
  const defendSystem = Number(threat.systemId || 0);
  const defendPlanet = Number(threat.planetId || 0);

  el.hidden = false;
  el.classList.remove("hidden");
  const signature = JSON.stringify([threat.id,threat.planetId,threat.systemId,threat.kind,threat.defending]);
  if (el.dataset.signature === signature) {
    const timer=el.querySelector("[data-raid-time]"); if(timer) timer.textContent=etaLabel;
    el.parentElement.style.setProperty('--raid-height',`${el.offsetHeight}px`);
    return;
  }
  el.dataset.signature=signature;
  el.innerHTML = `
    <div class="alert-copy">
      <b>${esc(kind)}</b>
      <span>${esc(threat.from || "Feind")} → ${esc(planetName)} · <span data-raid-time>${esc(etaLabel)}</span> · ${esc(whenLabel)}</span>
    </div>
    <div class="alert-actions">
      <button type="button" class="btn small primary" data-alert-defend="${defendPlanet}" data-alert-system="${defendSystem}" ${threat.defending ? 'disabled' : ''}>${threat.defending ? 'Verteidigung unterwegs' : 'Verteidigen'}</button>
    </div>
  `;

  el.parentElement.style.setProperty('--raid-height',`${el.offsetHeight}px`);
  el.onclick = async (ev) => {
    const defend = ev.target.closest("[data-alert-defend]");
    if (defend) {
      if (defend.disabled) return;
      const planetId = Number(defend.dataset.alertDefend || 0);
      const systemId = Number(defend.dataset.alertSystem || 0);
      if (planetId && systemId) openDefenseMission(planetId, systemId, threat);
      return;
    }
  };

}

function renderView({preserveForm=true}={}) {
 const v=$('view');if(!v||!state.snap)return;
 const draft=preserveForm?snapshotViewForm():null,active=state.view,base=rootView();
 const signature=JSON.stringify([base,state.snap.planet?.id,state.citySheet]);
 try {
  const shell=$('game');shell.dataset.view=base;shell.dataset.panel=hasCommandPanel()?active:'';
  shell.classList.toggle('view-galaxy',base==='galaxy');shell.classList.toggle('view-home',base==='command');shell.classList.toggle('alliance-planet-open',base==='command'&&!!state.snap.planet?.isAlliance);
  if(v.dataset.rootSignature!==signature){
   if(state.map){state.map.destroy();state.map=null;}
   if(state.cityScene&&state.cityScene.kind!=='unity'){state.cityScene.destroy();state.cityScene=null;}
   state.view=base;v.innerHTML=(views[base]||views.command)();v.dataset.rootSignature=signature;v.scrollTop=0;bindView(v);bindMediaFallbacks(v);state.view=active;
  }
  let panel=$('command-panel');
  if(hasCommandPanel()){
   if(!panel){panel=document.createElement('section');panel.id='command-panel';panel.className='command-panel';panel.setAttribute('role','region');shell.append(panel);}
   const titles={infra:'Gebäude',yard:'Hangar / Werft',research:state.snap.planet?.isAlliance?'Allianz-Labor':'Imperiums-Labor',activity:'Einsatz',alliance:'Allianz',reports:'Funk',defense:'Verteidigung'};
   const scroll=panel.querySelector('#panel-view')?.scrollTop||0;
   panel.dataset.planetId=state.snap.planet.id;panel.dataset.panel=active;
   const tools=alliancePanelTools(active);
   panel.innerHTML='<header class="command-panel-head"><div><h2>'+esc(titles[active]||$('nav')?.querySelector('[data-view="'+active+'"]')?.textContent||'Kommando')+'</h2><span>Bauen / Verwalten auf: '+esc(state.snap.planet.name)+'</span></div><button type="button" class="btn" data-panel-close '+(active==='yard'?'data-yard-close':'')+' aria-label="Panel schließen">✕</button></header>'+tools+'<div id="panel-view" class="panel-view '+(active==='yard'?'yard-sheet':'')+'">'+views[active]()+'</div>';
   panel.querySelector('[data-panel-close]').onclick=closeCommandPanel;
   if(tools)bindAllianceQuickActions(panel);
   const content=$('panel-view');bindView(content);bindMediaFallbacks(content);if(draft)restoreViewForm(draft);content.scrollTop=preserveForm?scroll:0;
   if(active==='yard'){content.addEventListener('input',updateShipBudgets);updateShipBudgets();}
  }else panel?.remove();
  for(const el of $('tabbar').querySelectorAll('[data-tab]'))el.classList.toggle('on',el.dataset.tab===(hasCommandPanel()?'cmd':tabIdFor(base)));
  for(const el of $('nav').querySelectorAll('[data-view]'))el.classList.toggle('on',el.dataset.view===active);
  applyResourceChrome();setUnityColonyVisible(base==='command'&&!state.snap.planet?.isAlliance&&!hasCommandPanel()&&!document.querySelector('.orbit-game'));syncColonyPointerEvents();syncCityLive();updateBuildActions();
 }catch(err){state.view=active;console.error(err);toast('Ansicht fehlgeschlagen: '+err.message,true);}
}

function opCard(o, kind) {
  const status = o.claimed ? "claimed" : o.complete ? "ready" : "open";
  const claimAttr = kind === "weekly" ? `data-weekly="${o.id}"` : `data-op="${o.id}"`;
  return `<article class="contract ${status}">
    <div>
      <h3>${esc(o.title)}${o.complete && !o.claimed ? `<i class="page-badge">${kind === "weekly" ? "!" : "1"}</i>` : !o.claimed ? `<i class="page-badge">${kind === "weekly" ? "W" : "!"}</i>` : ""}</h3>
      <p>${esc(o.blurb)}</p>
      <div class="cost">${costHtml(o.reward, null, state.catalog)}
        ${o.ships ? Object.entries(o.ships).map(([id, n]) => `${n}× ${esc(state.catalog.ships[id]?.name || id)}`).join(" · ") : ""}
        · +${o.xp} XP</div>
    </div>
    <div class="og-act">
      ${o.claimed ? `<span class="ok">${kind === "weekly" ? "Diese Woche erledigt" : "Heute erledigt"}</span>` : ""}
      ${o.complete && !o.claimed ? `<button class="btn primary" ${claimAttr}>Abholen</button>` : ""}
      ${!o.complete && !o.claimed ? `<button class="btn ghost small" data-view-jump="${o.view}">Los</button>` : ""}
    </div>
  </article>`;
}

function actionBoard() {
  const h = state.snap.hints || {};
  const tiles = [];
  const push = (view, title, text, n) => {
    if (!n) return;
    tiles.push(`<button type="button" class="action-tile" data-view-jump="${view}">
      <i class="page-badge">${n > 9 ? "9+" : n}</i>
      <b>${esc(title)}</b>
      <span>${esc(text)}</span>
    </button>`);
  };
  const dailyOpen = (state.snap.ops || []).filter((o) => !o.claimed).length;
  const dailyReady = (state.snap.ops || []).filter((o) => o.complete && !o.claimed).length;
  const weeklyOpen = (state.snap.weekly || []).filter((o) => !o.claimed).length;
  const weeklyReady = (state.snap.weekly || []).filter((o) => o.complete && !o.claimed).length;
  const campaignReady = (state.snap.contracts || []).filter((c) => c.complete && !c.claimed).length;
  if (dailyReady) push("command", "Tagesorder", "Belohnung abholen", dailyReady);
  else if (dailyOpen) push("command", "Tagesorder", "Heute noch offen — hier auf der Übersicht", dailyOpen);
  if (weeklyReady) push("command", "Wochenorder", "Wochenbelohnung abholen", weeklyReady);
  else if (weeklyOpen) push("command", "Wochenorder", "Diese Woche noch offen", weeklyOpen);
  if (campaignReady) push("command", "Kampagne", "Auftrag abholen", campaignReady);
  else if ((state.snap.contracts || []).some((c) => !c.claimed && !c.locked) && state.snap.nextAction?.view) {
    push(state.snap.nextAction.view, "Kampagne", state.snap.nextAction.text || "Nächster Auftrag", 1);
  }
  if (h.nexus) push("nexus", "Nex-Tagesbonus", "Premium-Nex abholen", 1);
  if (h.activity) push("activity", "Einsatz bereit", "Patrouille, Scan oder Funknetz", h.activity);
  if (h.infra) push("infra", "Bauschleife frei", "Ein Ausbau ist bezahlbar", 1);
  if (h.research) push("research", "Labor frei", "Forschung kann starten", 1);
  if (h.yard) push("yard", "Werft frei", "Ein Schiff ist finanzierbar", 1);
  if (h.defense) push("defense", "Stellung frei", "Batterien können gebaut werden", 1);
  if (h.economy) push("economy", "Lager fast voll", "Rohstoffe ausgeben oder handeln", h.economy);
  if (h.reports) push("reports", "Nachrichten", "Ungelesene Berichte", h.reports);
  if (h.chat) push("chat", "Funk", "Ungelesene Nachrichten", h.chat);
  if (h.fleets) push("fleets", "Eingehend", "Feindliche Flotte im Anflug — Klick öffnet die Flotte", h.fleets);
  else if (h.galaxy) push("galaxy", "Trümmer", "Debris kann geborgen werden", h.galaxy);
  if (!tiles.length) return "";
  return `<section class="action-board">
    <div class="section-title"><h2>Jetzt tun</h2><span class="muted">rote Markierungen = sofort machbar</span></div>
    <div class="action-tiles">${tiles.join("")}</div>
  </section>`;
}

function contractsPanel() {
  const list = state.snap.contracts || [];
  const next = state.snap.nextAction;
  const readyContracts = list.filter((c) => c.complete && !c.claimed).length;
  const dailyOpen = (state.snap.ops || []).filter((o) => !o.claimed).length;
  const weeklyOpen = (state.snap.weekly || []).filter((o) => !o.claimed).length;
  let lastChapter = "";
  const rows = list
    .map((c) => {
      let status = "locked";
      if (c.claimed) status = "claimed";
      else if (c.complete) status = "ready";
      else if (!c.locked) status = "open";
      const head =
        c.chapter && c.chapter !== lastChapter
          ? ((lastChapter = c.chapter), `<div class="chapter-label">${esc(c.chapter)}</div>`)
          : "";
      return `${head}<article class="contract ${status}">
        <div>
          <h3>${esc(c.title)}${c.complete ? `<i class="page-badge">1</i>` : ""}</h3>
          <p>${esc(c.blurb)}</p>
          <div class="muted">${esc(c.hint || "")}</div>
          <div class="cost">${c.reward ? costHtml(c.reward, null, state.catalog) : ""}
            ${c.ships ? Object.entries(c.ships).map(([id, n]) => `${n}× ${esc(state.catalog.ships[id]?.name || id)}`).join(" · ") : ""}</div>
        </div>
        <div class="og-act">
          ${c.claimed ? `<span class="ok">Erledigt</span>` : ""}
          ${c.complete ? `<button class="btn primary" data-claim="${c.id}">Abholen</button>` : ""}
          ${status === "open" ? `<button class="btn ghost small" data-view-jump="${c.view}">Los</button>` : ""}
          ${c.locked ? `<span class="lock">Gesperrt</span>` : ""}
        </div>
      </article>`;
    })
    .join("");
  const ops = (state.snap.ops || []).map((o) => opCard(o, "daily")).join("");
  const weekly = (state.snap.weekly || []).map((o) => opCard(o, "weekly")).join("");
  const threat = state.snap.pirates?.level || 1;
  const claimedContracts = list.filter((c) => c.claimed).length;
  const activeContract = list.find((c) => !c.claimed && !c.locked);
  const chapters = [...new Set(list.map((c) => c.chapter).filter(Boolean))];
  const currentChapter = activeContract?.chapter || chapters.at(-1) || "Nexus";
  const campaignPct = list.length ? Math.round((claimedContracts / list.length) * 100) : 0;
  const audit = state.snap.fleetAudit || { stationed: 0, inTransit: 0, colonies: [], recent: [] };
  const fleetRows = (audit.colonies || []).map((p) => `<div><span><b>${esc(p.name)}</b><small>${Object.entries(p.ships || {}).filter(([, n]) => n > 0).map(([id, n]) => `${n}× ${esc(state.catalog.ships[id]?.name || id)}`).join(" · ") || "Hangar leer"}</small></span><strong>${p.total}</strong></div>`).join("");
  const auditRows = (audit.ledger || []).map((event) => {
    const delta = Number(event.afterCount) - Number(event.beforeCount);
    const ship = state.catalog.ships[event.shipId]?.name || event.shipId;
    return `<li class="${delta < 0 ? "has-loss" : delta > 0 ? "has-gain" : ""}"><span><b>${esc(event.cause)}</b><small>${esc(event.planetName)} · ${esc(ship)} · ${event.beforeCount} → ${event.afterCount}</small></span><strong>${delta > 0 ? "+" : ""}${delta}</strong><time>${when(event.createdAt)}</time>${event.reportId ? `<button type="button" class="btn ghost small" data-ledger-report="${event.reportId}">Bericht</button>` : `<i class="ledger-system">System</i>`}</li>`;
  }).join("");
  const commanderRows = (state.snap.commanders || []).map((c) => {
    const bonus = c.attack ? `+${Math.round(c.attack * 100)}% Angriff` : c.travel ? `-${Math.round(c.travel * 100)}% Flugzeit` : `+${Math.round(c.loot * 100)}% Beute`;
    return `<article class="commander-card ${c.active ? "active" : ""} ${c.unlocked ? "" : "locked"}"><i>${esc(c.name.split(" ").map((part) => part[0]).join(""))}</i><div><em>${esc(c.role)}</em><b>${esc(c.name)}</b><p>${esc(c.blurb)}</p><strong>${bonus}</strong></div>${c.active ? `<span>AKTIV</span>` : `<button type="button" class="btn small" data-commander="${c.id}" ${c.unlocked ? "" : "disabled"}>${c.unlocked ? "Zuweisen" : `Stufe ${c.level}`}</button>`}</article>`;
  }).join("");
  return `<section class="contracts">
    <section class="journey-card panel"><div><em>KAPITELREISE</em><h2>${esc(currentChapter)}</h2><p>${esc(activeContract?.title || "Die Galaxie wartet auf deinen nächsten Zug.")}</p></div><strong>${campaignPct}%</strong><i><span style="width:${campaignPct}%"></span></i><small>${claimedContracts} / ${list.length} Etappen abgeschlossen</small></section>
    <div class="section-title"><h2>Tagesorder${dailyOpen ? `<i class="page-badge">${dailyOpen}</i>` : ""}</h2><span class="muted">wechselt um Mitternacht · skaliert mit deinem Fortschritt · Piratenstufe ${threat}</span></div>
    <div class="radar-grid">${ops}</div>
    <div class="section-title" style="margin-top:16px"><h2>Flotten-Commander</h2><span class="muted">Ein aktiver Bonus gilt imperiumsweit</span></div><div class="commander-grid">${commanderRows}</div>
    <div class="section-title" style="margin-top:16px"><h2>Wochenorder${weeklyOpen ? `<i class="page-badge">${weeklyOpen}</i>` : ""}</h2><span class="muted">eine größere Aufgabe pro ISO-Woche</span></div>
    <div class="contract-list">${weekly}</div>
    <div class="section-title" style="margin-top:16px"><h2>Kampagne${readyContracts ? `<i class="page-badge">${readyContracts}</i>` : ""}</h2><span class="muted">${readyContracts ? `${readyContracts} abholbereit · ` : ""}${esc(next?.text || "")}</span></div>
    <div class="contract-list">${rows}</div>
    <details class="fleet-ledger panel"><summary><span><em>FLOTTENBUCH</em><b>${audit.stationed + audit.inTransit + (audit.reserve||0)} Schiffe verbucht</b></span><i>${audit.stationed} Hangar · ${audit.reserve||0} Reserve · ${audit.inTransit} unterwegs</i></summary><div class="fleet-ledger-grid">${fleetRows}</div><h3>Lückenloses Bestandsjournal</h3><ul>${auditRows || `<li><span>Noch keine Bestandsänderung protokolliert</span></li>`}</ul><p>Jede Änderung enthält Zeitpunkt, Planet, Ursache und Bestand vorher/nachher. „System“ markiert eine technisch garantierte Änderung ohne separaten Bericht.</p></details>
  </section>`;
}

function colonyOverview(p) {
  const constructing = (state.snap.queue || []).filter((q) => q.kind === "building" && q.planetId === p.id);
  const built = Object.values(state.catalog.buildings).filter((b) => (p.buildings[b.id] || 0) > 0);
  const tiles = built
    .map((b) => {
      const lvl = p.buildings[b.id];
      const res = b.resource ? state.catalog.resources[b.resource] : null;
      const prod = b.resource && p.production ? p.production[b.resource] : 0;
      return `<article class="colony-tile panel" data-res="${b.resource || ""}" data-open-infra="${b.id}">
        <img class="og-art" src="/assets/buildings/${b.id}.jpg" alt="" />
        <div>
          <h3>${esc(b.name)} <span class="lvl">Stufe ${lvl}</span></h3>
          <p>${res ? `${esc(res.name)} · ${prod > 0 ? `+${fmt(prod)}/h` : "kein Gebäude"}` : esc(b.blurb)}</p>
        </div>
      </article>`;
    })
    .join("");
  const pending = constructing
    .map(
      (q) => `<article class="colony-tile panel constructing">
        <img class="og-art" src="/assets/buildings/${q.itemId}.jpg" alt="" />
        <div>
          <h3>${esc(q.name)} <span class="lvl">→ S${q.levelTo}</span></h3>
          <p>Im Bau · ${eta(q.completesAt - Date.now())}</p>
        </div>
      </article>`
    )
    .join("");
  const hangar = Object.entries(p.ships || {})
    .filter(([, n]) => n > 0)
    .map(([id, n]) => {
      const s = state.catalog.ships[id];
      return `<article class="hangar-card panel">
        <img class="ship-art" src="/assets/ships/${id}.jpg" alt="" onerror="this.style.opacity=0" />
        <div>
          <h3>${esc(s?.name || id)}</h3>
          <p class="muted">×${n} · Tempo ${s?.speed ?? "—"} · ${s?.strongVs ? "stark vs " + esc(s.strongVs) : "stationiert"}</p>
        </div>
      </article>`;
    })
    .join("");
  return `
    <section class="colony desk-only">
      <div class="section-title"><h2>Kolonie-Übersicht</h2><span class="muted">${built.length} Module errichtet</span></div>
      <div class="colony-grid">
        ${tiles || `<div class="muted">Noch keine Module. Unter Infrastruktur bauen.</div>`}
        ${pending}
      </div>
      <div class="section-title" style="margin-top:18px"><h2>Hangar</h2><span class="muted">stationierte Flotte</span></div>${p.reserveCount ? `<p class="hint">Reserve: ${p.reserveCount} Schiffe sicher verwahrt. Freie Hangarplätze werden automatisch aufgefüllt. ${shipList(p.reserveShips,state.catalog)}</p>` : ""}
      <div class="hangar-row">${hangar || `<div class="muted">Keine Schiffe vor Ort.</div>`}</div>
      ${defenseHangar(p)}
    </section>`;
}

function defenseHangar(p) {
  const defs = Object.entries(p.defenses || {}).filter(([, n]) => n > 0);
  const cards = defs
    .map(([id, n]) => {
      const d = state.catalog.defenses?.[id];
      return `<article class="hangar-card panel">
        <img class="ship-art" src="/assets/defenses/${id}.jpg" alt="" />
        <div>
          <h3>${esc(d?.name || id)}</h3>
          <p class="muted">×${n} · ${esc(d?.strongVs || "")}</p>
        </div>
      </article>`;
    })
    .join("");
  return `<div class="section-title" style="margin-top:18px"><h2>Orbitale Batterien</h2><span class="muted">stationierte Verteidigung</span></div>
    <div class="hangar-row">${cards || `<div class="muted">Keine Batterien. Unter Verteidigung bauen.</div>`}</div>`;
}

function artFor(kind, id) {
  const folder = { building: "buildings", tech: "techs", ship: "ships", defense: "defenses" }[kind];
  return `/assets/${folder}/${id}.jpg`;
}

function specFor(kind, id) {
  const bag = { building: "buildings", tech: "techs", ship: "ships", defense: "defenses" }[kind];
  return state.catalog[bag]?.[id];
}

function reqHtml(req) {
  if (!req || (!req.buildings && !req.techs)) return "";
  const bHave = state.snap.planet?.buildings || {};
  const tHave = state.snap.techs || {};
  const bits = [];
  for (const [id, lvl] of Object.entries(req.buildings || {})) {
    const have = bHave[id] || 0;
    bits.push(
      `<span class="req ${have >= lvl ? "ok" : "need"}">${esc(state.catalog.buildings[id]?.name || id)} ${have}/${lvl}</span>`
    );
  }
  for (const [id, lvl] of Object.entries(req.techs || {})) {
    const have = tHave[id] || 0;
    bits.push(
      `<span class="req ${have >= lvl ? "ok" : "need"}">${esc(state.catalog.techs[id]?.name || id)} ${have}/${lvl}</span>`
    );
  }
  return `<div class="reqs">${bits.join("")}</div>`;
}

function unlockHtml(kind, id) {
  const list = state.catalog.unlocks?.[`${kind}:${id}`] || [];
  if (!list.length) return "";
  const seen = new Set();
  const uniq = [];
  for (const u of list) {
    const k = `${u.kind}:${u.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(u);
  }
  const viewOf = { building: "infra", tech: "research", ship: "yard", defense: "defense" };
  return `<div class="unlocks"><span class="muted">gibt frei</span> ${uniq
    .map(
      (u) =>
        `<span class="chip unlock-chip" data-view-jump="${viewOf[u.kind] || "tree"}">${esc(u.name)}${u.need ? " S" + u.need : ""}</span>`
    )
    .join("")}</div>`;
}

function nodeLevel(kind, id) {
  const p = state.snap.planet || {};
  if (kind === "building") return p.buildings?.[id] || 0;
  if (kind === "tech") return state.snap.techs?.[id] || 0;
  if (kind === "ship") return p.ships?.[id] || 0;
  if (kind === "defense") return p.defenses?.[id] || 0;
  return 0;
}

function nodeUnlocked(kind, id) {
  const spec = specFor(kind, id);
  if (!spec) return false;
  const b = state.snap.planet?.buildings || {};
  const t = state.snap.techs || {};
  const req = spec.requires;
  if (!req) return true;
  if (req.buildings) {
    for (const [k, lvl] of Object.entries(req.buildings)) if ((b[k] || 0) < lvl) return false;
  }
  if (req.techs) {
    for (const [k, lvl] of Object.entries(req.techs)) if ((t[k] || 0) < lvl) return false;
  }
  return true;
}

function vsPills(vs) {
  if (!vs) return "";
  const ships = state.catalog.ships || {};
  const good = [];
  const bad = [];
  for (const [id, m] of Object.entries(vs)) {
    const name = ships[id]?.name || id;
    if (m >= 1.5) good.push(name);
    else if (m <= 0.5) bad.push(name);
  }
  return `<div class="vs-pills">
    ${good.map((n) => `<span class="vs-pill good">stark vs ${esc(n)}</span>`).join("")}
    ${bad.map((n) => `<span class="vs-pill bad">schwach vs ${esc(n)}</span>`).join("")}
  </div>`;
}

function medalPin(m, earned) {
  const on = earned || m.earned;
  return `<button type="button" class="medal-pin ${on ? "earned" : "locked"} tier-${esc(m.tier || "")}" data-medal-tip="${esc(m.id)}" title="${esc(m.title)}">
    <img src="${esc(m.image)}" alt="${esc(m.title)}" />
  </button>`;
}

function medalCard(m) {
  return `<article class="medal-card ${m.earned ? "earned" : "locked"} tier-${esc(m.tier || "")}">
    <img src="${esc(m.image)}" alt="" />
    <div>
      <h3>${esc(m.title)}</h3>
      <p>${esc(m.blurb)}</p>
      <small>${esc(m.tierName || m.tier)}${m.earned ? " · erhalten" : " · noch offen"}</small>
    </div>
  </article>`;
}

function medalTinyRow(medals) {
  if (!medals?.length) return `<span class="muted">—</span>`;
  return `<span class="medal-tiny-row">${medals
    .map((m) => `<img class="medal-tiny" src="${esc(m.image)}" alt="" title="${esc(m.title)}" />`)
    .join("")}</span>`;
}

function profileHeroHtml(e, p) {
  const pct = Math.max(0, Math.min(100, p?.xpPct || 0));
  const next = Math.min(60, (p?.level || e.level || 1) + 1);
  return `<section class="progress-hero panel">
    <img class="avatar-xl" src="${esc(e.avatar || "/assets/avatars/a1.jpg")}" alt="" />
    <div class="progress-hero-copy">
      <h2>${esc(e.name)}</h2>
      <div class="muted">${esc(p?.title || e.title || "Neuer Kommandant")} · ${esc(state.snap.user?.username || "")}</div>
      <div class="xp-bar" title="${fmt(p?.xp || e.xp || 0)} XP"><i style="width:${pct}%"></i></div>
      <div class="muted">Stufe ${p?.level || e.level || 1} · ${fmt(p?.xp || e.xp || 0)} XP · ${pct}% bis Stufe ${next}${e.streak ? " · Login " + e.streak + " Tage" : ""}</div>
    </div>
  </section>`;
}

async function openEmpireProfile(id) {
  try {
    const { empire } = await getEmpire(id);
    const species = (state.catalog?.species || []).find((s) => s.id === empire.species);
    const medals = empire.medals || [];
    const self = empire.id === state.snap.empire.id;
    const since = empire.createdAt ? new Date(empire.createdAt).toLocaleDateString("de-DE") : "—";
    showModal(`<div class="sheet panel empire-sheet">
      <div class="profile-head">
        <img class="avatar-xl" src="${esc(empire.avatar)}" alt="" />
        <div>
          <h2 style="margin:0;color:${esc(empire.color || "var(--text)")}">${esc(empire.name)}</h2>
          <div class="muted">${esc(empire.username)} · ${esc(empire.title || "Neuer Kommandant")}</div>
          <div class="muted">${esc(species?.glyph || "")} ${esc(species?.name || empire.species)}</div>
        </div>
      </div>
      <dl class="profile-kv">
        <dt>Stufe</dt><dd>${empire.level} · ${fmt(empire.xp || 0)} XP</dd>
        <dt>Punkte</dt><dd>${fmt(empire.score)}</dd>
        <dt>Welten</dt><dd>${empire.planets}</dd>
        <dt>Allianz</dt><dd>${empire.alliance ? `<button type="button" class="linkish" id="prof-ally" style="color:${esc(empire.alliance.color || "var(--cyan)")}">[${esc(empire.alliance.tag)}] ${esc(empire.alliance.name)}</button>` : "keine"}</dd>
        <dt>Im Nexus seit</dt><dd>${esc(since)}</dd>
      </dl>
      <h3 class="battle-data-title">Medaillen</h3>
      ${
        medals.length
          ? `<div class="medal-rack">${medals.map((m) => medalPin(m, true)).join("")}</div>`
          : `<p class="muted">Noch keine Medaillen.</p>`
      }
      <div class="progress-stats" style="margin-top:12px">
        <div class="stat-chip"><b>${fmt(empire.stats?.combatWins || 0)}</b><span>Siege</span></div>
        <div class="stat-chip"><b>${fmt(empire.stats?.expeditions || 0)}</b><span>Expeditionen</span></div>
        <div class="stat-chip"><b>${fmt(empire.stats?.spy || 0)}</b><span>Spionage</span></div>
        <div class="stat-chip"><b>${fmt(empire.stats?.research || 0)}</b><span>Forschung</span></div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn ghost" type="button" id="m-cancel">Schließen</button>
        ${self ? "" : `<button class="btn primary" type="button" id="prof-pm">Nachricht</button>`}
      </div>
    </div>`);
    $("m-cancel").onclick = hideModal;
    $("prof-pm")?.addEventListener("click", () => {
      hideModal();
      openMailCompose(empire.id, empire.username);
    });
    $("prof-ally")?.addEventListener("click", () => {
      hideModal();
      openAllianceProfile(empire.alliance.id);
    });
  } catch (err) {
    toast(err.message || "Profil unbekannt.", true);
  }
}

function allianceDeskHtml(detail) {
  const planet = detail.planet;
  const access = new Set(detail.planetAccess || []);
  const grants =
    detail.perms?.planetAccess && planet
      ? detail.members
          .filter((m) => m.rank !== "leader" && m.rank !== "coleader")
          .map(
            (m) => `<label class="row" style="gap:8px">
              <input type="checkbox" data-planet-access="${m.empireId}" ${access.has(m.empireId) ? "checked" : ""}>
              <span>${esc(m.username)} · ${esc(m.rankName || m.rank)}</span>
            </label>`
          )
          .join("")
      : "";
  const planetBlock = planet
    ? `<div class="ally-planet-card panel">
        <div class="section-title"><h2>Allianz-Planet</h2><span class="muted">${esc(planet.systemName || "")}</span></div>
        <p><b>${esc(planet.name)}</b> · Gemeinsames Lager, Allianzforschung, Orbit-Verteidigung und Flottenstützpunkt.</p>
        ${detail.canManagePlanet ? `<button class="btn primary" type="button" id="ally-open-planet">Planet öffnen</button>` : `<p class="muted">Kein Zugang. Anführer kann dich freischalten.</p>`}
        ${grants ? `<div style="margin-top:12px"><h3 style="font-size:13px;margin:0 0 6px">Zugang</h3><p class="muted">Anführer und Co-Leader haben immer Zugang.</p>${grants}</div>` : ""}
      </div>`
    : `<div class="ally-planet-card panel">
        <div class="section-title"><h2>Allianz-Planet</h2><span class="muted">noch unbesiedelt</span></div>
        <p>Die Führung kann einen freien Planeten als Allianz-Hauptquartier kolonisieren. Dort entstehen Lager, Forschung, Verteidigung und ein gemeinsamer Flottenstützpunkt.</p>
        ${detail.perms?.planet ? `<button class="btn primary" id="ally-colonize">Freien Planeten zum Kolonisieren wählen</button><p class="hint">Benötigt ein Kolonieschiff in einem persönlichen Hangar und ein freies Ziel in Reichweite.</p>` : '<p class="hint">Nur Anführer, Co-Leader oder Offiziere können den Allianzplaneten gründen.</p>'}
      </div>`;
  const research = (detail.research || [])
    .map((r) => {
      const pct = Math.round((r.progress || 0) * 100);
      const done = r.level >= r.max;
      const remaining = r.remaining || {};
      return `<div class="intel-block">
        <h4>${esc(r.name)} · Stufe ${r.level}/${r.max}</h4>
        <p class="muted">${esc(r.blurb)}</p>
        ${!done && !planet ? `<p class="hint">Einzahlungen bleiben erhalten. Zum Finanzieren und Starten muss zuerst der Allianzplanet gegründet werden.</p>${detail.perms?.planet ? '<button type="button" class="btn small" data-ally-found>Allianzplanet gründen</button>' : '<p class="hint">Die Allianzführung muss den Planeten gründen.</p>'}` : ''}
        ${!done && planet && !detail.canManagePlanet ? '<p class="hint">Zum Einzahlen und Starten braucht dein Rang Zugang zum Allianzplaneten. Die Führung kann ihn freigeben.</p>' : ""}
        ${done ? `<span class="chip ok">Max</span>` : `<div class="ally-progress"><i style="width:${pct}%"></i></div><div class="muted">${pct}% finanziert · Lagerbedarf: ${costHtml(remaining, null, state.catalog)}</div>`}
      </div>`;
    })
    .join("");
  return `${planetBlock}
    <div class="ally-planet-card panel">
      <div class="section-title"><h2>Allianzforschung</h2><span class="muted">Boni für alle · Zahlung aus dem Allianzlager</span></div>
      ${allianceBoostChips()}
      ${planet && detail.canManagePlanet ? allianceQuickActionsHtml(detail.research || [], planet.id, true) : ""}
      ${research}
      ${detail.canManagePlanet && planet ? `<button class="btn ghost small" type="button" id="ally-goto-research">Allianz-Labor öffnen</button>` : `<p class="muted">Ressourcen werden per Transport ins Allianzlager geliefert. Forschungsaufträge starten berechtigte Mitglieder direkt am Allianz-Planeten.</p>`}
    </div>`;
}

function allianceBoostChips() {
  const b = state.snap.alliance?.bonuses || {};
  const bits = [
    ["Produktion", b.prod],
    ["Bau/Werft", b.build],
    ["Forschung", b.research],
    ["Reise", b.travel],
    ["Hülle", b.hull],
  ].filter(([, v]) => v);
  if (!bits.length) return `<span class="muted">Noch keine Allianz-Boni.</span>`;
  return `<div class="ally-boosts">${bits.map(([n, v]) => `<span class="chip ok">${esc(n)} +${Math.round(v * 100)}%</span>`).join("")}</div>`;
}

function alliancePanelTools(active) {
  const ally = state.snap?.alliance;
  if (!ally) return "";
  if (active === "research" && state.snap.planet?.isAlliance) {
    return allianceQuickActionsHtml(ally.research || [], state.snap.planet.id, true);
  }
  if (active === "alliance") {
    return allianceQuickActionsHtml(ally.research || [], ally.planet?.id, !!ally.canManagePlanet);
  }
  return "";
}
function allianceQuickActionsHtml(rows,planetId,canManage) {
  const available=rows.filter(r=>r.level<r.max);
  const chosen=available.some(r=>r.id===state.allianceResearchChoice)?state.allianceResearchChoice:available[0]?.id;
  return `<section class="ally-quick-actions panel" data-alliance-quick-planet="${planetId || ''}">
    <label>Allianzforschung · Zahlung aus dem Allianzlager<select data-alliance-project aria-label="Allianzforschung auswählen" ${!available.length?'disabled':''}>${available.map(r=>`<option value="${r.id}" ${r.id===chosen?'selected':''}>${esc(r.name)} · ${Math.round((r.progress||0)*100)} % finanziert</option>`).join('')}</select></label>
    ${!planetId ? '<p class="hint">Zuerst einen Allianzplaneten gründen. Gespeicherte Einzahlungen bleiben erhalten.</p>' : !canManage ? '<p class="hint">Die Allianzführung muss deinen Zugang zum Allianzplaneten freigeben.</p>' : !available.length ? '<p class="hint">Alle Allianzforschungen sind abgeschlossen.</p>' : `<div class="ally-quick-buttons"><button type="button" class="btn small" data-alliance-quick="fund">Einzahlen</button><button type="button" class="btn primary small" data-alliance-quick="start">Finanzieren & starten</button></div>`}
    <p class="ally-quick-message" role="status" ${state.allianceQuickMessage?'':'hidden'}>${esc(state.allianceQuickMessage || '')}</p>
  </section>`;
}
function bindAllianceQuickActions(root) {
  root.querySelectorAll('[data-alliance-project]').forEach(s=>s.addEventListener('change',()=>{state.allianceResearchChoice=s.value;}));
  root.querySelectorAll('[data-alliance-quick]').forEach(button=>button.addEventListener('click',async()=>{
    const bar=button.closest('[data-alliance-quick-planet]');if(bar.dataset.pending)return;
    const id=bar.querySelector('[data-alliance-project]').value,planetId=Number(bar.dataset.allianceQuickPlanet),focusId=state.snap.planet.id;
    if(!id||!planetId)return;
    state.allianceResearchChoice=id;state.allianceQuickMessage='';bar.dataset.pending='1';
    bar.querySelectorAll('button,select').forEach(b=>b.disabled=true);
    const message=bar.querySelector('.ally-quick-message');message.hidden=false;message.textContent='Wird verarbeitet …';
    await act(async()=>{
      try {
        await api('/alliances/research',{method:'POST',body:{id,planetId,donate:button.dataset.allianceQuick==='fund'}});
        toast(button.dataset.allianceQuick==='fund'?'Aus dem Allianzlager eingezahlt.':'Allianzforschung gestartet. Fortschritt unter Aufträge.');
        return await getState(focusId);
      }catch(err){state.allianceQuickMessage=err.message;message.textContent=err.message;throw err;}
    });
    if(bar.isConnected){delete bar.dataset.pending;bar.querySelectorAll('button,select').forEach(b=>b.disabled=false);}
  }));
}

function allianceResearchHtml() {
  const rows = state.snap.alliance?.research || [];
  const busy = (state.snap.queue || []).some((q) => q.kind === "ally_research" && q.planetId === state.snap.planet?.id);
  const canQueue = !!state.snap.planet?.isAlliance;
  const cards = rows
    .map((r) => {
      const pct = Math.round((r.progress || 0) * 100);
      const done = r.level >= r.max;
      const cost = r.cost || {};
      const remaining = r.remaining || {};
      const job=(state.snap.queue || []).find(q=>q.kind==='ally_research' && q.itemId===r.id && q.planetId===state.snap.planet.id);
      const affordable=canAfford(remaining),partial=Object.entries(remaining).some(([id,n])=>n>0 && liveRes(id)>=1);
      const action = done
        ? `<div class="ok">Abgeschlossen</div>`
        : canQueue ? `<button class="btn primary small" data-ally-tech="${r.id}" ${busy || !affordable ? "disabled" : ""}>${r.progress>=1 ? 'Forschung starten' : 'Aus Lager finanzieren & starten'}</button>${!busy && r.progress<1 ? `<button class="btn small" data-ally-fund="${r.id}" ${!partial ? 'disabled' : ''}>Aus Lager einzahlen</button>` : ''}<p class="hint">${job ? `Forschung läuft · Stufe ${job.levelTo} · <span data-live-eta="${job.completesAt}">${eta(job.completesAt-Date.now())}</span>` : busy ? 'Allianz-Labor belegt.' : !affordable ? 'Im Allianzlager fehlen Ressourcen. Teilbeträge bleiben gespeichert.' : ''}</p>` : `<span class="muted">Allianzplanet fokussieren</span>`;
      return `<article class="og-row panel ally-research-row">
        <div class="og-act">${action}</div>
        <div class="og-body">
          <h3>${esc(r.name)} <span class="lvl">Stufe ${r.level} / ${r.max}</span></h3>
          <p>${esc(r.blurb)}</p>
          ${done ? "" : `<div class="ally-progress" title="${pct}%"><i style="width:${pct}%"></i></div>
            <div class="muted">Finanziert ${pct}% · Zahlung aus dem Allianzlager</div>
            ${costHtml(remaining, have(), state.catalog)}`}
        </div>
        <img class="og-art" src="${esc(r.art || "/assets/techs/ai.jpg")}" alt="" />
      </article>`;
    })
    .join("");
  return `<div class="section-title"><h2>Allianzforschung</h2><span class="muted">Boni für alle Mitglieder</span></div>
    ${allianceBoostChips()}
    <button class="btn" data-alliance-transport="${state.snap.planet.id}">Allianzlager per Transport finanzieren</button>
    <p class="hint">Ressourcen werden per Transportflug im Allianzlager gesammelt. Forschungsaufträge bezahlen ausschließlich aus diesem gemeinsamen Bestand.</p>
    <div class="og-list">${cards || `<div class="muted">Keine Allianzforschung.</div>`}</div>`;
}

function hangarSummaryHtml(p) {
  const audit=state.snap.fleetAudit?.colonies?.find(c=>c.id===p.id);
  if(!audit)return '';
  const construction=(state.snap.queue || []).filter(q=>q.kind==='ship' && q.planetId===p.id);
  const movements=(state.snap.fleets || []).filter(f=>f.originPlanetId===p.id || f.targetPlanetId===p.id);
  const count=bag=>Object.values(bag || {}).reduce((n,v)=>n+Number(v),0);
  const hangarMoving=movements.reduce((n,f)=>n+count(f.ships),0);
  const events=new Map();
  for(const event of state.snap.fleetAudit?.ledger || []){
    if(event.planetId!==p.id)continue;
    const key=`${event.reportId || 'entry:'+event.id}:${event.shipId}:${event.cause}`;
    const existing=events.get(key);
    if(existing)existing.delta+=event.afterCount-event.beforeCount;
    else events.set(key,{...event,delta:event.afterCount-event.beforeCount});
  }
  const journal=[...events.values()].filter(e=>e.delta).slice(0,15).map(e=>`<p>${when(e.createdAt)} · ${esc(e.cause)} · ${esc(state.catalog.ships[e.shipId]?.name || e.shipId)} ${e.delta>0?'+':''}${e.delta} ${e.reportId ? `<button type="button" class="btn small" data-ledger-report="${e.reportId}">Bericht</button>` : ''}</p>`).join('');
  return `<section class="panel hangar-summary"><h3>Hangar · ${esc(p.name)}</h3><p><b>Bestand ${audit.total} / ${audit.cap}</b> · Im Bau ${construction.reduce((n,q)=>n+q.qty,0)} · Reserve ${count(audit.reserve)}</p><p>${unitList(audit.ships,state.catalog.ships)}</p><details><summary>Unterwegs von/zu ${esc(p.name)}: ${hangarMoving} Schiffe · ${movements.length} Flottenbewegungen</summary>${movements.map(f=>`<p>${esc(f.originName)} → ${esc(f.targetName)}: ${unitList(f.ships,state.catalog.ships)} · <span data-live-eta="${f.arrivesAt}">${eta(f.arrivesAt-Date.now())}</span></p>`).join('') || '<p>Keine Flotte unterwegs.</p>'}</details><details class="hangar-journal"><summary>Bestandsjournal dieses Planeten</summary>${journal || '<p>Noch keine Änderungen erfasst.</p>'}<p class="hint">Starts verlassen den Hangar; Rückkehr und Bau füllen ihn auf. Ein Kolonieschiff wird erst bei erfolgreicher Gründung verbraucht. Reserve bleibt erhalten.</p></details>${audit.lastLossReportId ? `<button class="btn small" data-ledger-report="${audit.lastLossReportId}">Letzter Verlustbericht</button>` : '<p class="hint">Kein Verlustbericht für diesen Hangar vorhanden.</p>'}</section>`;
}

function buildRailHtml() {
  return "";
}

function tutorialSaved() {
  try {
    const t = localStorage.getItem("sn-tut-v1");
    if (t != null && t !== "") return t;
    if (localStorage.getItem("sn-nux-city") === "1") return "done";
    return "0";
  } catch {
    return "done";
  }
}
function tutorialIndex() {
  const v = tutorialSaved();
  if (v === "done") return TUTORIAL.length;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : TUTORIAL.length;
}
function setTutorialIndex(n) {
  try {
    if (n >= TUTORIAL.length) localStorage.setItem("sn-tut-v1", "done");
    else localStorage.setItem("sn-tut-v1", String(n));
  } catch {
    /* ignore */
  }
}
function tutorialActive() {
  const e = state.snap?.empire;
  if (!e) return false;
  if (tutorialIndex() >= TUTORIAL.length) return false;
  return true;
}
function advanceTutorial() {
  let i = tutorialIndex();
  while (i < TUTORIAL.length && TUTORIAL[i].done?.(state.snap)) i += 1;
  if (i !== tutorialIndex()) setTutorialIndex(i);
  return i;
}

function plotNeedText(buildingId, buildings) {
  const spec = state.catalog?.buildings?.[buildingId];
  const req = spec?.requires?.buildings || {};
  for (const [id, n] of Object.entries(req)) {
    if ((buildings[id] || 0) < n) return `${state.catalog.buildings[id]?.name || id} ${n}`;
  }
  if (spec?.requires?.techs && Object.keys(spec.requires.techs).length) return "Forschung fehlt";
  return "Gesperrt";
}

let cityStateSignature = "";
function unityColonyState() {
  return colonyRows(state.snap, state.catalog, state.preview, state.cityBuilding);
}
function syncCityLive() {
  if (rootView() !== "command" || state.snap?.planet?.isAlliance) return;
  const root = $("view");
  if (!root?.querySelector(".living-colony")) return;
  const rows = unityColonyState();
  paintColonyMarkers(root, rows);
  const signature = JSON.stringify(rows);
  if (signature !== cityStateSignature) {
    state.cityScene?.setData(rows);
    cityStateSignature = signature;
  }
  paintCityDock(root, state.cityBuilding);
  paintCityQuest(root);
}

function recommendedPlotId() {
  const next = state.snap?.nextAction;
  const quest = (state.snap?.contracts || []).find(c => !c.claimed && !c.locked);
  for (const text of [quest?.blurb, quest?.hint, next?.text]) {
    const match = CITY_PLOTS.map(p => ({ plot: p, index: text?.indexOf(state.catalog?.buildings?.[p.id]?.name || p.short) ?? -1 }))
      .filter(p => p.index >= 0).sort((a, b) => a.index - b.index)[0]?.plot;
    if (match) return match.id;
  }
  const blob = `${next?.title || ""} ${next?.text || ""} ${next?.view || ""}`;
  if (/Werft|Jäger|Schiff|Schwarm|Trockendock/i.test(blob) || next?.view === "yard") return "shipyard";
  if (/Labor|Archiv|Forschung/i.test(blob) || next?.view === "research") return "archive";
  if (/Schild|Orbit|Batterie|Verteidigung|Abwehr|Flak|Stellung/i.test(blob) || next?.view === "defense") return "defense_hub";
  if (/Helium|Treibstoff/i.test(blob)) return "helium_well";
  if (/Energie-Array|Array/i.test(blob)) return "energy_array";
  if (/Kommando/i.test(blob)) return "command";
  if (next?.view && next.view !== "infra") return null;
  return "matter_mine";
}

function cityQuestReward(quest) {
  if (!quest) return "";
  const rewards = Object.entries(quest.reward || {}).filter(([, n]) => n > 0)
    .map(([id, n]) => `${fmt(n)} ${state.catalog.resources?.[id]?.short || id}`);
  for (const [id, n] of Object.entries(quest.ships || {})) {
    if (n > 0) rewards.push(`${n}× ${state.catalog.ships?.[id]?.name || id}`);
  }
  if (quest.xp) rewards.push(`${quest.xp} XP`);
  return rewards.length ? `<small class="city-quest-reward">Belohnung: ${esc(rewards.join(" · "))}</small>` : "";
}

function cityQuestCard() {
  const t = Date.now();
  const hit = (state.snap.incoming || [])[0];
  if (hit) {
    return `<button type="button" class="city-quest hostile" data-view-jump="galaxy" data-jump-planet="${hit.planetId || ""}">
      <img src="/assets/buildings/shield.jpg" alt="" />
      <div>
        <div class="k">ALARM</div>
        <h3>${esc(hit.from)} greift an</h3>
        <p>${hit.kind==='raid' && !hit.defending && hit.arrivesAt<=t ? `Freigabe offen · Abzug in <span data-live-eta="${hit.expiresAt}"></span>` : `${hit.defending ? 'Verstärkung in ' : ''}<span data-live-eta="${hit.arrivesAt}"></span>`} · zur Galaxie</p>
      </div>
      <span class="go">ÖFFNEN</span>
    </button>`;
  }
  const readyOp = (state.snap.ops || []).find((o) => o.complete && !o.claimed);
  const activeQuest = (state.snap.contracts || []).find(c => !c.claimed && !c.locked);
  if (readyOp && !activeQuest) {
    return `<button type="button" class="city-quest" data-op="${readyOp.id}">
      <img src="/assets/buildings/command.jpg" alt="" />
      <div>
        <div class="k">TAGESORDER FERTIG</div>
        <h3>${esc(readyOp.title)}</h3>
        <p>Belohnung abholen</p>
        ${cityQuestReward(readyOp)}
      </div>
      <span class="go">ABHOLEN</span>
    </button>`;
  }
  const readyQuest = (state.snap.contracts || []).find((c) => c.complete && !c.claimed);
  if (readyQuest) {
    return `<button type="button" class="city-quest" data-claim="${readyQuest.id}">
      <img src="/assets/buildings/matter_mine.jpg" alt="" />
      <div>
        <div class="k">KAMPAGNE</div>
        <h3>${esc(readyQuest.title)}</h3>
        <p>Auftrag abholen</p>
        ${cityQuestReward(readyQuest)}
      </div>
      <span class="go">ABHOLEN</span>
    </button>`;
  }
  const next = state.snap.nextAction;
  const quest = (state.snap.contracts || []).find(c => !c.claimed && !c.locked);
  const rec = CITY_PLOTS.find((p) => p.id === recommendedPlotId());
  const thumb = rec?.building ? `/assets/buildings/${rec.building}.jpg` : "/assets/buildings/matter_mine.jpg";
  const jumpView = next?.view === "command" && rec ? "infra" : next?.view || rec?.view || "infra";
  const jumpBldg = jumpView === "infra" ? rec?.building || "" : "";
  return `<button type="button" class="city-quest" data-view-jump="${esc(jumpView)}" data-highlight-building="${esc(jumpBldg)}">
    <img src="${thumb}" alt="" />
    <div>
      <div class="k">NÄCHSTER AUFTRAG</div>
      <h3>${esc(next?.title || "Kolonie ausbauen")}</h3>
      <p>${esc(quest?.blurb || next?.text || "Baue deine Kolonie über die Gebäude aus.")}</p>
      ${cityQuestReward(quest)}
    </div>
    <span class="go">LOS</span>
  </button>`;
}

function cityCommanderRail() {
  return `<div class="city-commander" aria-label="Nächster Auftrag"></div>`;
}

function paintCityQuest(root) {
  const rail = root.querySelector(".city-commander");
  if (!rail) return;
  rail.hidden = !!state.cityBuilding;
  const html = cityQuestCard();
  if (rail.dataset.content === html) return;
  const focused = rail.contains(document.activeElement);
  rail.innerHTML = html;
  rail.dataset.content = html;
  bindJumps(rail);
  bindQuestClaims(rail);
  if (focused) rail.querySelector("button")?.focus({ preventScroll: true });
}

function colonyCityHtml() {
  return `<section class="city-view diorama living-colony" aria-label="Lebende Planetenbasis">
    <div class="colony-preview" aria-hidden="true"></div>
    ${colonyHudHtml(state.citySheet === "quests")}
    ${state.citySheet === "quests" ? `<section class="city-sheet colony-quests" id="colony-quests" aria-labelledby="colony-quests-title">
      <header><h2 id="colony-quests-title">Aufgaben</h2><button type="button" class="city-sheet-close" data-city-sheet="" aria-label="Aufgaben schließen">Schließen</button></header>
      <div class="colony-quests-content" tabindex="0" aria-label="Aufgabenübersicht">${cityCommanderRail()}${contractsPanel()}</div>
    </section>` : ""}
  </section>`;
}

function alliancePlanetCommandHtml() {
  const p = state.snap.planet;
  const ids = ["metal", "helium", "titan", "energy", "crystal", "diamond"];
  const stocks = ids.map((id) => {
    const res = state.catalog.resources[id];
    const cap = p.storage?.[id] || 0;
    const pct = cap ? Math.min(100, Math.round(((p[id] || 0) / cap) * 100)) : 0;
    return `<article><i style="color:${res?.color || "#55dfff"}">${esc(res?.short || id.slice(0, 3).toUpperCase())}</i><span><b>${fmt(p[id] || 0)}</b><small>${fmt(cap)} Kapazität</small></span><em><u style="width:${pct}%"></u></em></article>`;
  }).join("");
  const fleet = Object.entries(p.ships || {}).filter(([, n]) => n > 0).map(([id, n]) => `<span><img src="/assets/ships/${id}.jpg" alt="">${n} ${esc(state.catalog.ships[id]?.name || id)}</span>`).join("") || `<span class="muted">Noch keine Allianzschiffe stationiert.</span>`;
  const defenseCount = Object.values(p.defenses || {}).reduce((sum, n) => sum + Number(n || 0), 0);
  return `<section class="alliance-world"><header class="panel"><em>[${esc(p.allianceTag || "ALLY")}] ALLIANZ-HAUPTQUARTIER</em><h1>${esc(p.name)}</h1><p>${esc(p.systemName)} · gemeinsamer Stützpunkt · kein normaler Kolonieausbau</p></header><div class="alliance-world-grid"><section class="alliance-store panel"><div class="section-title"><h2>Allianzlager</h2><span class="muted">Ressourcen per Transportflug einlagern</span></div><div>${stocks}</div><button class="btn primary" data-view-jump="galaxy">Transport auf der Karte starten</button></section><section class="alliance-fleet panel"><div class="section-title"><h2>Flottenstützpunkt</h2><span class="muted">${p.shipCount || 0} / ${p.shipCap || 0}</span></div><div class="alliance-fleet-list">${fleet}</div><button class="btn primary" data-view-jump="galaxy">Schiffe stationieren</button></section><section class="alliance-world-actions panel"><button data-view-jump="alliance"><i>◎</i><span><b>ALLIANZ</b><small>Boss, Mitglieder und Lagerzugang</small></span></button><button data-view-jump="research"><i>⌬</i><span><b>FORSCHUNG</b><small>Aus dem Allianzlager finanzieren</small></span></button><button data-view-jump="defense"><i>⬡</i><span><b>VERTEIDIGUNG</b><small>${defenseCount} Orbit-Batterien</small></span></button></section></div></section>`;
}

const views = {
  command() {
    if (!state.snap.planet) return `<p>Kein Planet.</p>`;
    if (state.snap.planet.isAlliance) return alliancePlanetCommandHtml();
    return colonyCityHtml();
  },

  infra() {
    const p = state.snap.planet;
    if (p.isAlliance) return `<div class="alliance-restricted panel"><h2>Kein Kolonieausbau</h2><p>Der Allianzplanet besitzt ausschließlich Allianzlager, Forschung, Verteidigung und den gemeinsamen Flottenstützpunkt.</p><button class="btn primary" data-view-jump="command">Zum Allianz-Hauptquartier</button></div>`;
    const prev = Object.fromEntries((state.preview?.buildings || []).map((b) => [b.id, b]));
    const runningBuilding = new Set(state.snap.queue.filter((q) => q.kind === "building" && q.planetId === p.id).map((q) => q.itemId));
    const homeName = (state.snap.planets || []).find((x) => x.isHome)?.name || "dem Hauptplaneten";
    const rows = Object.values(state.catalog.buildings)
      .map((b) => {
        const info = prev[b.id] || { level: p.buildings[b.id] || 0, unlocked: true };
        const homeOnly = !p.isHome && (b.id === "archive" || b.id === "quantum_lab");
        let action = "";
        if (homeOnly) action = `<div class="lock">Nur Hauptplanet</div><p class="hint">Forschung auf ${esc(homeName)} gilt für alle Kolonien.</p>`;
        else if (!info.unlocked) action = `<div class="lock">Voraussetzungen fehlen</div>`;
        else if (info.max) action = `<div class="ok">Maximalstufe</div>`;
        else {
          const isRunning = runningBuilding.size > 0;
          const job=state.snap.queue.find(q=>q.kind==="building" && q.planetId===p.id && q.itemId===b.id);
          const canBuild = !!prev[b.id] && !isRunning && canAfford(info.nextCost || {});
          action = `<button class="btn primary" data-build="${b.id}" ${!canBuild ? "disabled" : ""}>Ausbau auf Stufe ${(info.level || 0) + 1}</button>
            <p class="hint" data-action-reason></p>
            <div class="muted">${job ? `IM BAU · <span data-live-eta="${job.completesAt}">${eta(job.completesAt-Date.now())}</span>` : info.nextTime ? eta(info.nextTime * 1000) : ""}</div>`;
        }
        const focus = state.highlightBuilding === b.id;
        return `<article class="og-row panel${focus ? " focus-row" : ""}" id="bldg-${b.id}">
          <img class="og-art" src="/assets/buildings/${b.id}.jpg" alt="" />
          <div class="og-body">
            <h3>${esc(b.name)} <span class="lvl">Stufe ${info.level || 0}</span></h3>
            <p>${esc(b.blurb)}</p>
            ${reqHtml(b.requires)}
            ${unlockHtml("building", b.id)}
            ${info.max || !info.unlocked || homeOnly ? "" : costHtml(info.nextCost, have(), state.catalog)}
          </div>
          <div class="og-act">${action}</div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Gebäude</h2><span class="muted">${p.isAlliance ? "Allianz-Planet · " : ""}${esc(p.name)} · <button type="button" class="btn ghost small" data-view-jump="command">Kolonie</button></span></div>${p.isAlliance ? `<p class="hint">Bauten hier nutzen Allianz-Ressourcen und helfen der ganzen Allianz.</p>` : `<p class="hint">Tippe Ausbauen. Der Rest der Kolonie erreichst du über die Pins auf der Karte.</p>`}<div class="og-list">${rows}</div>`;
  },

  yard() {
    const p = state.snap.planet;
    if (p.isAlliance) return `<div class="alliance-restricted panel"><h2>Keine Allianzwerft</h2><p>Schiffe werden auf persönlichen Planeten gebaut und anschließend über die Karte am Allianzstützpunkt stationiert.</p><button class="btn primary" data-view-jump="galaxy">Schiffe stationieren</button></div>`;
    const prev = Object.fromEntries((state.preview?.ships || []).map((s) => [s.id, s]));
    const queuedShips = state.snap.queue.filter((q) => q.kind === "ship" && q.planetId === p.id);
    const rows = Object.values(state.catalog.ships)
      .map((s) => {
        const info = prev[s.id] || { unlocked: false, cost: s.cost, time: s.time };
        const haveN = p.ships[s.id] || 0;
        const jobs=queuedShips.filter(q=>q.itemId===s.id);
        const jobQty=jobs.reduce((n,q)=>n+q.qty,0);
        const jobEnd=jobs.reduce((t,q)=>Math.max(t,Number(q.completesAt)||0),0);
        const budget = currentShipBudget(info);
        const canBuild = budget.buildable > 0;
        const buildingHtml=jobs.length
          ? `<b>IM BAU · ${jobQty} Schiffe</b> · <span data-live-eta="${jobEnd}">${eta(jobEnd-Date.now())}</span>`
          : "";
        const action = !info.unlocked
          ? `<div class="lock">Voraussetzungen fehlen</div>`
          : `<label class="muted">Anzahl <input data-qty="${s.id}" type="number" min="1" max="${Math.max(1, budget.buildable)}" value="1" inputmode="numeric" enterkeyhint="done" step="1" style="width:64px;margin-left:6px"></label>
             <button class="btn small" data-ship-max="${s.id}">Max</button><button class="btn primary" data-ship="${s.id}" ${!canBuild ? "disabled" : ""}>Bauen</button>
             <p class="hint" data-action-reason></p>
             <div class="muted"${jobs.length ? ` data-ship-building="${s.id}"` : ""}>${jobs.length ? buildingHtml : eta((info.time || s.time) * 1000)}</div>`;
        return `<article class="og-row panel${jobs.length ? " is-building" : ""}" id="ship-${s.id}">
          ${mediaTag(`/assets/ships/${s.id}.jpg`, "og-art og-art-ship")}
          ${jobs.length ? `<div class="og-build-flag" data-ship-building="${s.id}" aria-live="polite">${buildingHtml}</div>` : ""}
          <div class="og-body">
            <h3>${esc(s.name)} <span class="lvl">vorhanden: ${haveN}</span></h3>
            ${jobs.length ? `<p class="build-now">${buildingHtml}</p>` : ""}
            <p class="ship-budget" data-ship-budget="${s.id}">Mit Ressourcen bezahlbar: ${budget.affordable.toLocaleString('de-DE')} · Jetzt baubar: ${budget.buildable.toLocaleString('de-DE')}</p>
            <p>${esc(s.blurb)}</p>
            ${reqHtml(s.requires)}
            ${vsPills(state.catalog.shipVs?.[s.id])}
            <div class="meta"><span>Angriff ${s.attack}</span><span>Hülle ${s.hull + s.shield}</span><span>Tempo ${s.speed}</span><span>Laderaum ${s.cargo}</span>${s.fuel ? `<span>Treibstoff ${s.fuel} Helium-3</span>` : ""}${s.strongVs ? `<span>stark vs ${esc(s.strongVs)}</span>` : ""}</div>
            ${info.unlocked ? costHtml(info.cost, have(), state.catalog) : ""}
          </div>
          <div class="og-act">${action}</div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Schiffswerft</h2><span class="muted">${p.isAlliance ? "Allianz-Planet · " : ""}${esc(p.name)} · <button type="button" class="btn ghost small" data-view-jump="command">Kolonie</button></span></div>
      ${hangarSummaryHtml(p)}
      ${queuedShips.length ? `<p class="queue-slot-note"><b>${queuedShips.length} Werftauftrag${queuedShips.length === 1 ? "" : "e"}</b> aktiv · weitere Aufträge können angehängt werden. ${queuedShips.map(q=>`${esc(q.name)}: <span data-live-eta="${q.completesAt}">${eta(q.completesAt-Date.now())}</span>`).join(" · ")}</p>` : ""}
      <p class="hint">Jetzt baubar berücksichtigt Ressourcen, Freischaltung, Hangarplätze und bereits bestellte Schiffe. Maximal 50 Schiffe je Auftrag. Die Mengen gelten jeweils für diesen Schiffstyp; alle Schiffe teilen sich dieselben Ressourcen.</p>
      <p class="hint">Tempo = Reisegeschwindigkeit. Eine gemischte Flotte fliegt so schnell wie das langsamste Schiff. Weite Systeme brauchen länger.</p>
      ${p.reserveCount ? `<p class="hint">Reserve: ${p.reserveCount} Schiffe · wird bei freien Plätzen automatisch übernommen.</p>` : ""}<p class="hint">20 Grundplätze + 30 je Werftstufe. Schiffslimit: ${p.shipCount || 0} / ${p.shipCap || 0}${state.snap.empire?.shipCapBonus ? " · Werft-Turbine +" + state.snap.empire.shipCapBonus : ""}${(state.snap.empire?.shipCapBoostUntil && state.snap.empire.shipCapBoostUntil > Date.now()) ? " · +20 % bis " + new Date(state.snap.empire.shipCapBoostUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
      <div class="og-list">${rows}</div>`;
  },

  defense() {
    const p = state.snap.planet;
    const prev = Object.fromEntries((state.preview?.defenses || []).map((d) => [d.id, d]));
    const busy = state.snap.queue.some((q) => q.kind === "defense" && q.planetId === p.id);
    const rows = Object.values(state.catalog.defenses || {})
      .map((d) => {
        const info = prev[d.id] || { unlocked: false, cost: d.cost, time: d.time, have: p.defenses?.[d.id] || 0 };
        const unlocked = p.isAlliance || info.unlocked;
        const haveN = p.defenses?.[d.id] || info.have || 0;
        const canBuild = !busy && canAfford(info.cost || {});
        const job=state.snap.queue.find(q=>q.kind==="defense" && q.planetId===p.id && q.itemId===d.id);
        const action = !unlocked
          ? `<div class="lock">Voraussetzungen fehlen</div>`
          : `<label class="muted">Anzahl <input data-dqty="${d.id}" type="number" min="1" max="20" value="1" style="width:64px;margin-left:6px"></label>
             <button class="btn primary" data-defense="${d.id}" ${!canBuild ? "disabled" : ""}>Bauen</button>
             <div class="muted">${job ? `IM BAU · <span data-live-eta="${job.completesAt}">${eta(job.completesAt-Date.now())}</span>` : eta((info.time || d.time) * 1000)}</div>`;
        return `<article class="og-row panel">
          <img class="og-art" src="/assets/defenses/${d.id}.jpg" alt="" />
          <div class="og-body">
            <h3>${esc(d.name)} <span class="lvl">vorhanden: ${haveN}</span></h3>
            ${job ? `<p class="ship-building" data-defense-building="${d.id}"><b>IM BAU · ${job.qty} ${esc(d.name)}</b> · ${esc(p.name)} · <time data-live-eta="${job.completesAt}">${eta(job.completesAt-Date.now())}</time></p>` : ""}
            <p>${esc(d.blurb)}</p>
            ${reqHtml(d.requires)}
            ${vsPills(d.vs)}
            <div class="meta"><span>Angriff ${d.attack}</span><span>Hülle ${d.hull + d.shield}</span><span>${esc(d.strongVs || "")}</span></div>
            ${unlocked ? costHtml(info.cost, have(), state.catalog) : ""}
          </div>
          <div class="og-act">${action}</div>
        </article>`;
      })
      .join("");
    const hubLvl = p.buildings?.defense_hub || 0;
    const defCount = Object.values(p.defenses || {}).reduce((s, n) => s + (Number(n) || 0), 0);
    const hubBusy = state.snap.queue.some((q) => q.kind === "building" && q.planetId === p.id);
    const hubInfo = (state.preview?.buildings || []).find((b) => b.id === "defense_hub");
    const hubCanBuild = !hubBusy && canAfford(hubInfo?.nextCost || {});
    const hubCta = p.isAlliance ? "" : hubLvl
      ? ""
      : `<article class="og-row panel focus-row">
          <img class="og-art" src="/assets/buildings/defense_hub.jpg" alt="" />
          <div class="og-body">
            <h3>Verteidigungszentrum <span class="lvl">fehlt</span></h3>
            <p>Die Stellung am Kamm muss stehen, bevor neue Batterien gebaut werden können.</p>
            ${hubInfo?.nextCost ? costHtml(hubInfo.nextCost, have(), state.catalog) : ""}
          </div>
          <div class="og-act">
            <button class="btn primary" data-build="defense_hub" ${!hubCanBuild ? "disabled" : ""}>Errichten</button>
            <button class="btn ghost" data-view-jump="command">Auf der Karte</button>
          </div>
        </article>`;
    return `<div class="def-hero">
        <img src="/assets/buildings/defense_hub.jpg" alt="" />
        <div>
          <em>STELLUNG</em>
          <h2>Verteidigungszentrum</h2>
          <p>${esc(p.name)} · ${hubLvl ? `Stufe ${hubLvl}` : "nicht errichtet"} · ${defCount} Batterien</p>
        </div>
        <button type="button" class="btn ghost small" data-view-jump="command">Kolonie</button>
      </div>
      <p class="hint">Flak frisst Jäger, Raketen Fregatten, Ionen Kreuzer, Gauss Zerstörer. Schildkuppeln puffern alles, schießen aber nicht. Höhere Stufen des Verteidigungszentrums beschleunigen den Bau.</p>
      <div class="og-list">${hubCta}${rows}</div>`;
  },

  research() {
    if (state.snap.planet?.isAlliance) return allianceResearchHtml();
    const home = (state.snap.planets || []).find((p) => p.isHome);
    if (!state.snap.planet.isHome) {
      return `<div class="alliance-restricted panel">
        <h2>Labor nur auf dem Hauptplaneten</h2>
        <p>Forschung läuft ausschließlich auf <b>${esc(home?.name || "dem Hauptplaneten")}</b>. Die Stufen gelten für alle Kolonien, auch für ${esc(state.snap.planet.name)}.</p>
        <p class="hint">Forschungsarchiv und Quantenlabor können nur dort gebaut werden. Ein zweites Labor auf dieser Kolonie gibt es nicht.</p>
        ${home ? `<button class="btn primary" data-view-jump="research" data-jump-planet="${home.id}">Zum Labor auf ${esc(home.name)}</button>` : ""}
      </div>`;
    }
    const prev = Object.fromEntries((state.preview?.techs || []).map((t) => [t.id, t]));
    const busy = state.snap.queue.some((q) => q.kind === "research");
    const rows = Object.values(state.catalog.techs)
      .map((t) => {
        const job = state.snap.queue.find(q => q.kind === "research" && q.itemId === t.id);
        const info = prev[t.id] || {
          level: state.snap.techs[t.id] || 0,
          unlocked: nodeUnlocked("tech", t.id),
        };
        const canResearch = !busy && canAfford(info.nextCost || {});
        const action = !info.unlocked
          ? `<div class="lock">Voraussetzungen fehlen</div>`
          : info.max
            ? `<div class="ok">Abgeschlossen</div>`
            : `<button class="btn primary" data-tech="${t.id}" ${!canResearch ? "disabled" : ""}>Forschen auf Stufe ${(info.level || 0) + 1}</button>
             <p class="hint" data-action-reason></p>
             <div class="muted">${job ? `IM BAU · <span data-live-eta="${job.completesAt}">${eta(job.completesAt-Date.now())}</span>` : info.nextTime ? eta(info.nextTime * 1000) : ""}</div>`;
        return `<article class="og-row panel">
          <img class="og-art" src="/assets/techs/${t.id}.jpg" alt="" />
          <div class="og-body">
            <h3>${esc(t.name)} <span class="lvl">Stufe ${info.level || 0} / ${t.max}</span></h3>
            <p>${esc(t.blurb)}</p>
            ${reqHtml(t.requires)}
            ${unlockHtml("tech", t.id)}
            ${info.max || !info.unlocked ? "" : costHtml(info.nextCost, have(), state.catalog)}
          </div>
          <div class="og-act">${action}</div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Imperiums-Labor</h2><span class="muted">Hauptplanet · Stufen gelten auf allen Kolonien · <button type="button" class="btn ghost small" data-view-jump="command">Kolonie</button></span></div><p class="hint">Forschung hier auf ${esc(state.snap.planet.name)} gilt für jede Kolonie. Weitere Planeten haben kein eigenes Labor.</p><div class="og-list">${rows}</div>`;
  },

  tree() {
    const cols = state.catalog.tree || {};
    const kindMap = { infra: "building", research: "tech", fleet: "ship", orbit: "defense" };
    const html = Object.entries(cols)
      .map(([key, col]) => {
        const kind = kindMap[key];
        const tiers = (col.tiers || [])
          .map((ids, i) => {
            const cards = ids
              .map((id) => {
                const spec = specFor(kind, id);
                if (!spec) return "";
                const lvl = nodeLevel(kind, id);
                const open = nodeUnlocked(kind, id);
                const cls = !open ? "locked" : lvl > 0 ? "owned" : "ready";
                const lvlLabel = kind === "ship" || kind === "defense" ? `×${lvl}` : `S${lvl}`;
                return `<button type="button" class="tree-node panel ${cls}" data-view-jump="${col.view}">
                  <img src="${artFor(kind, id)}" alt="" />
                  <div>
                    <h3>${esc(spec.name)} <span class="lvl">${lvlLabel}</span></h3>
                    ${reqHtml(spec.requires)}
                    ${unlockHtml(kind, id)}
                  </div>
                </button>`;
              })
              .join("");
            return `<div class="tree-tier">${i ? `<div class="tree-link" aria-hidden="true"></div>` : ""}<div class="tree-row">${cards}</div></div>`;
          })
          .join("");
        return `<section class="tree-col"><h2>${esc(col.title)}</h2>${tiers}</section>`;
      })
      .join("");
    const hideOwned = (() => {
      try { return localStorage.getItem("sn-tree-hide-owned") === "1"; } catch { return false; }
    })();
    return `<div class="section-title tree-head"><h2>Technologie-Tree</h2>
        <label class="tree-hide-known"><input type="checkbox" id="tree-hide-owned" ${hideOwned ? "checked" : ""}><span>Bekannte ausblenden</span></label></div>
      <div class="tree-legend">
        <span class="lg ready">verfügbar</span>
        <span class="lg owned">im Besitz</span>
        <span class="lg locked">gesperrt</span>
      </div>
      <p class="hint">Von oben nach unten. Rot = fehlt noch, Grün = erfüllt. „gibt frei“ zeigt, was die Stufe entsperrt. Klick öffnet Gebäude, Forschung, Werft oder Verteidigung.</p>
      <div class="tree${hideOwned ? " hide-owned" : ""}">${html}</div>`;
  },

  nexus() {
    const rel = state.snap.relics || { catalog: {}, inventory: [], equipped: [] };
    const market = state.snap.market || { offers: [], until: 0 };
    const inv = rel.inventory || [];
    const eq = new Set(rel.equipped || []);
    const cards = inv
      .map((id) => {
        const d = rel.catalog[id];
        if (!d) return "";
        const on = eq.has(id);
        return `<article class="relic-card panel ${on ? "on" : ""}">
          <h3>${esc(d.name)}</h3>
          <p>${esc(d.blurb)}</p>
          <button class="btn ${on ? "ghost" : "primary"} small" data-toggle-relic="${id}">${on ? "Ablegen" : "Ausrüsten (max 3)"}</button>
        </article>`;
      })
      .join("");
    const offers = (market.offers || [])
      .map(
        (o, i) => `<article class="og-row panel">
          <div class="og-body" style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:12px">
            <div>Du gibst <b>${fmt(o.giveAmt)} ${esc(state.catalog.resources[o.give]?.name || o.give)}</b>
              für <b>${fmt(o.getAmt)} ${esc(state.catalog.resources[o.get]?.name || o.get)}</b></div>
            <button class="btn primary" data-trade="${i}">Handeln</button>
          </div>
        </article>`
      )
      .join("");
    const shop = state.snap.nexShop || state.catalog?.nex || {};
    const e = state.snap.empire;
    const vip = e.vip || {};
    const legal = shop.legal || {};
    const kindLabel = { cosmetic: "Kosmetik", comfort: "Komfort", supply: "Nachschub", fleet: "Flotte" };
    const shopCards = (shop.items || [])
      .map((it) => {
        const loot = it.loot
          ? Object.entries(it.loot)
              .map(([k, n]) => `${n} ${esc(state.catalog.resources[k]?.name || k)}`)
              .join(" · ")
          : "";
        const ships = it.ships
          ? Object.entries(it.ships)
              .map(([id, n]) => `${n}× ${esc(state.catalog.ships[id]?.name || id)}`)
              .join(" · ")
          : "";
        const unlocked = { aeon_unlock: e.aeonUnlock, helix_unlock: e.helixUnlock };
        const locked =
          (it.needUnlock && !unlocked[it.needUnlock]) ||
          (it.id === "ship_cap_boost" && (e.shipCapBonus || 0) >= 10);
        return `<article class="nex-card panel">
          <h3>${esc(it.name)}</h3>
          <p class="hint">${esc(it.blurb)}</p>
          <div class="muted">${esc(kindLabel[it.kind] || it.kind)}${it.unlock ? " · schaltet Werft-Baureihe frei" : ""}</div>
          ${loot || ships ? `<p class="ok" style="margin:6px 0 0;font-size:12px">Inhalt: ${loot}${loot && ships ? " · " : ""}${ships}</p>` : ""}
          <div class="row" style="margin-top:8px">
            <span class="nex-cost">${it.cost} Nex</span>
            <button class="btn primary small" data-nex="${it.id}" ${locked ? "disabled" : it.id === "recall" && vip.freeRecallReady ? "" : e.nex >= it.cost ? "" : "disabled"}>${it.id === "ship_cap_boost" && (e.shipCapBonus || 0) >= 10 ? "Bereits eingebaut" : locked ? "Erst freischalten" : it.id === "recall" && vip.freeRecallReady ? "Pass: kostenlos" : "Einlösen"}</button>
          </div>
        </article>`;
      })
      .join("");
    const spec = state.snap.species || {};
    return `<div class="section-title"><h2>Nexus</h2><span class="muted">${fmt(e.nex || 0)} Nex${vip.active ? " · Nexus-Pass aktiv" : ""}</span></div>
      <div class="panel" style="padding:14px;margin-bottom:14px;max-width:1100px">
        <div class="species-now">
          <img src="/assets/species/${esc(spec.id || "terran")}.jpg" alt="" />
          <div>
            <h3 style="margin:0 0 6px">${esc(spec.glyph || "")} ${esc(spec.name || "Terraner")}${vip.active ? ` <span class="vip-pill">Pass</span>` : ""}</h3>
            <p class="hint">${esc(spec.blurb || "")}</p>
            <div class="perk">${esc(spec.perk || "")}</div>
            <div class="flaw">${esc(spec.flaw || "")}</div>
            <p class="muted" style="margin-top:8px">Wechsel in den Einstellungen für ${shop.changeCost || 80} Nex (${vip.speciesCdHours || 48} Std. Cooldown).</p>
          </div>
        </div>
      </div>
      <div class="section-title"><h2>Nexus-Pass</h2><span class="muted">Mit Nex · Komfort + Tagespaket</span></div>
      <p class="hint">${vip.active ? `Aktiv bis ${when(vip.until)}${vip.cancelAtEnd ? " · gekündigt, läuft aus" : ""} · täglich 10 Nex und ein Versorger-Paket auf der Heimatwelt.` : "Pass = mehr Tages-Nex (10 statt 5), kleines tägliches Ressourcen-Paket, Komfort. Kein Kampfbonus."}</p>
      <p class="hint">Keine automatische Verlängerung. Die Laufzeit endet von selbst.</p>
      <ul class="vip-perks">${(vip.perks || []).map(perk => `<li>${esc(perk)}</li>`).join("")}</ul>
      <div class="section-title" style="margin-top:18px"><h2>Nex</h2><span class="muted">nur Tagesbonus</span></div>
      <p class="hint">${esc(legal.currencyNote || "")} F2P ${shop.daily || 5} Nex / Tag, Pass ${shop.dailyVip || 10} Nex / Tag${vip.active ? " plus Versorger-Paket" : ""}.</p>
      <div class="row" style="gap:8px;margin-bottom:12px">
        <button class="btn primary" id="nex-daily" ${e.nexDailyReady ? "" : "disabled"}>${e.nexDailyReady ? (vip.active ? `+${vip.dailyNex || 10} Nex + Versorger-Paket` : `+${vip.dailyNex || shop.daily || 5} Nex abholen`) : "Heute bereits abgeholt"}</button>
        ${state.snap.user.isAdmin ? `<button class="btn ghost" id="nex-grant">Admin +100 Nex</button><button class="btn ghost" id="vip-grant">Admin +30 Tage Pass</button>` : ""}
      </div>
      <div class="nex-shop">${shopCards}</div>
      <section class="panel" style="padding:14px;margin-top:18px"><h3>Serverkosten unterstützen</h3><p class="hint">Freiwillige Spenden helfen beim Betrieb der Server. Dafür gibt es keine Nex, Schiffe oder sonstigen Spielvorteile.</p>${shop.donationText ? `<p>${esc(shop.donationText)}</p>` : ""}${shop.donationUrl ? `<a class="btn primary" href="${esc(shop.donationUrl)}" target="_blank" rel="noopener noreferrer">Für Serverkosten spenden</a>` : `<p class="muted">Der Spendenlink wird noch eingerichtet.</p>`}</section>
      <div class="section-title" style="margin-top:18px"><h2>Relikte</h2></div>
      <p class="hint">Relikte findest du auf Expeditionen und bei Warlords (goldener Ring in der Galaxie). Maximal 3 ausgerüstet.</p>
      <div class="relic-grid">${cards || `<div class="muted">Noch keine Relikte. Starte eine Expedition.</div>`}</div>
      <div class="section-title" style="margin-top:18px"><h2>Schwarzmarkt</h2><span class="muted">wechselt alle 12 Minuten</span></div>
      ${offers}
      <div class="section-title" style="margin-top:18px"><h2>Chrono-Riss</h2></div>
      <p class="hint">6 Diamanten: aktuellen Bau/Werft/Forschung sofort abschließen. 8 Minuten Abklingzeit.</p>
      <button class="btn primary" id="rush-btn">Jetzt beschleunigen (6 Dia)</button>`;
  },

  galaxy() {
    const bookmarks = (state.snap.bookmarks || []).map((b) => `<span class="map-bookmark"><button type="button" data-bookmark-focus="${b.planetId}">${esc(b.label || "Gespeicherter Planet")}</button><button type="button" data-bookmark-delete="${b.planetId}" aria-label="Gespeichertes Ziel löschen">×</button></span>`).join("");
    const season = state.snap.sectorSeason;
    const nextTier = season?.tiers?.find((tier) => !tier.claimed);
    const seasonPct = nextTier ? Math.min(100, Math.round((season.score / nextTier.score) * 100)) : 100;
    const seasonPanel = season ? `<section class="map-season panel"><header><span>SEKTOR-SAISON ${esc(season.id)}</span><time>${Math.max(0, Math.ceil((season.end - Date.now()) / 86400000))}T</time></header><strong>${fmt(season.score)} SP</strong><div><i style="width:${seasonPct}%"></i></div><small>${nextTier ? `${fmt(nextTier.score)} SP · Meilenstein ${nextTier.tier}` : "Alle Meilensteine erreicht"}</small>${nextTier?.ready ? `<button type="button" class="btn primary small" data-season-claim="${nextTier.tier}">Abholen</button>` : ""}<details><summary>Wertung</summary><p>${season.combat} Siege · ${season.expeditions} Expeditionen · ${season.colonies} Kolonien · ${fmt(season.bossDamage)} Boss-Schaden</p></details></section>` : "";
    return `<div class="map-wrap"><canvas id="starmap"></canvas>
      <button type="button" class="map-search-toggle" aria-expanded="false" aria-controls="map-tools" aria-label="System suchen" title="System suchen">⌕</button>
      <button type="button" class="map-filter-toggle" aria-expanded="false" aria-controls="map-filters" aria-label="Kartenfilter" title="Kartenfilter">☷</button>
      <div class="map-status"><i></i><span id="map-view-title">SYSTEMNETZ</span><small>Alle Systeme sichtbar</small></div>
      ${seasonPanel}
      <div class="map-tools panel" id="map-tools"><div class="map-search-wrap"><span aria-hidden="true">⌕</span><input id="map-search" type="search" autocomplete="off" placeholder="System oder Planet suchen…"><div id="map-search-results" class="map-search-results" hidden></div></div><select id="planet-focus"><option value="">— Planet springen —</option></select>${bookmarks ? `<div class="map-bookmarks"><b>Gespeicherte Ziele</b>${bookmarks}</div>` : ""}</div>
      <div class="map-quick-filters" id="map-filters" hidden aria-label="Kartenfilter"><label><input type="checkbox" data-map-filter="own"> Eigen</label><label><input type="checkbox" data-map-filter="alliance"> Allianz</label><label><input type="checkbox" data-map-filter="hostile"> Feind</label><label><input type="checkbox" data-map-filter="free"> Frei</label><label><input type="checkbox" data-map-filter="special"> Spezial</label></div>
      <div id="map-raid-banner" class="map-raid-banner hidden" hidden></div>
      <button type="button" id="map-orbit-fire" class="map-orbit-fire" ><i>◎</i><span><b>ORBIT-FEUER</b><small id="map-orbit-fire-sub">Einsatz heute</small></span></button>
      <div class="map-legend panel">Ziehen: Schwenken · Rad: Zoom · Klick: System
        <div>Großer Punkt + weißer Ring + Kreuz = dein System · Teal-Puls = dein System · Cyan-Strichring = Allianzmitglied · Rotbogen = Piratenbesatzungen · Orange-Ring = Piratenhorst · Goldbogen = Warlord · Cyan-Halo = Nexus-Riss</div></div>
      <div class="map-flight-note">Eigene Flüge: farbige Route mit bewegtem Marker · gestrichelt = Rückflug</div>
      <div id="sysbox"></div></div>`;
  },

  fleets() {
    const p = state.snap.planet;
    const stationed = p?.ships || {};
    const defs = p?.defenses || {};
    const moving = {};
    const localFleets=(state.snap.fleets || []).filter(f=>f.originPlanetId===p.id || f.targetPlanetId===p.id);
    for (const f of localFleets) {
      for (const [id, n] of Object.entries(f.ships || {})) if (n) moving[id] = (moving[id] || 0) + n;
    }
    const shipCards = Object.values(state.catalog.ships || {})
      .map((s) => {
        const here = stationed[s.id] || 0;
        const fly = moving[s.id] || 0;
        const n = here + fly;
        return `<article class="force-card panel ${n ? "" : "empty"}">
          <div class="force-art">
            ${mediaTag(`/assets/ships/${s.id}.jpg`)}
            <span class="force-count">×${n}</span>
          </div>
          <div class="force-body">
            <h3>${esc(s.name)}</h3>
            <p>${esc(s.blurb)}</p>
            ${vsPills(state.catalog.shipVs?.[s.id])}
            <div class="meta"><span>ATK ${s.attack}</span><span>Hülle ${s.hull + s.shield}</span><span>Fracht ${fmt(s.cargo)}</span></div>
            <div class="muted">${here} vor Ort${fly ? " · " + fly + " unterwegs" : ""}</div>
          </div>
        </article>`;
      })
      .join("");
    const defCards = Object.values(state.catalog.defenses || {})
      .map((d) => {
        const n = defs[d.id] || 0;
        return `<article class="force-card panel ${n ? "" : "empty"}">
          <div class="force-art">
            ${mediaTag(`/assets/defenses/${d.id}.jpg`)}
            <span class="force-count">×${n}</span>
          </div>
          <div class="force-body">
            <h3>${esc(d.name)}</h3>
            <p>${esc(d.blurb)}</p>
            ${vsPills(d.vs)}
            <div class="meta"><span>ATK ${d.attack}</span><span>Hülle ${d.hull + d.shield}</span><span>${esc(d.strongVs || "")}</span></div>
            <div class="muted">${n ? n + " im Orbit" : "nicht gebaut"}</div>
          </div>
        </article>`;
      })
      .join("");
    const missionCards = localFleets
      .map((f) => {
        const arts = Object.entries(f.ships || {})
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `<span class="force-chip"><img src="/assets/ships/${id}.jpg" alt="" /> ×${n}</span>`)
          .join("");
        const pct = Math.max(
          0,
          Math.min(100, ((Date.now() - f.departedAt) / Math.max(1, f.arrivesAt - f.departedAt)) * 100)
        );
        return `<article class="mission-card panel">
          <div>
            <b>${esc(f.returning ? "Rückflug" : state.catalog.missions[f.mission]?.name || f.mission)}</b>
            <div class="muted">${esc(f.originName)} → ${esc(f.targetName)} · <span data-live-eta="${f.arrivesAt}">${eta(f.arrivesAt-Date.now())}</span>${f.holdMs ? " · Halt " + ticksOf(f.holdMs, state.catalog) + " Ticks" : ""}</div>
          </div>
          <div class="force-chips">${arts}</div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          ${f.returning ? `<div class="muted">Rückruf nicht nötig – Flotte kehrt bereits zurück.</div>` : `<button class="btn ghost small" data-recall-fleet="${f.id}">Rückruf einleiten</button>`}
        </article>`;
      })
      .join("");
    const incoming = (state.snap.incoming || []).filter((h)=>h.planetId===p.id)
      .map((h) => {
        const arts = Object.entries(h.ships || {})
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `<span class="force-chip"><img src="/assets/ships/${id}.jpg" alt="" /> ×${n}</span>`)
          .join("");
        return `<article class="mission-card panel hostile">
          <div>
            <b>${esc(h.kind === "raid" ? "Raid" : h.kind === "spy" ? "Scan" : "Angriff")}</b>
            <div class="muted">${esc(h.from)} → ${esc(h.planet)} · <span data-live-eta="${h.arrivesAt}">${eta(h.arrivesAt-Date.now())}</span></div>
          </div>
          <div class="force-chips">${arts}</div>
        </article>`;
      })
      .join("");
    const atk = Object.entries(stationed).reduce((s, [id, n]) => s + (state.catalog.ships[id]?.attack || 0) * n, 0);
    const defAtk = Object.entries(defs).reduce((s, [id, n]) => s + (state.catalog.defenses[id]?.attack || 0) * n, 0);
    return `<div class="section-title"><h2>Flotte & Orbit</h2>
        <span class="muted">${esc(p?.name || "")} · Feuerkraft Schiffe ${fmt(atk)} · Batterien ${fmt(defAtk)} · Schiffe ${p?.shipCount || 0} / ${p?.shipCap || 0}${state.snap.empire?.shipCapBonus ? " · Turbine +" + state.snap.empire.shipCapBonus : ""}${(state.snap.empire?.shipCapBoostUntil && state.snap.empire.shipCapBoostUntil > Date.now()) ? " (+20 % bis " + new Date(state.snap.empire.shipCapBoostUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + ")" : ""}</span></div>
      ${incoming ? `<div class="section-title"><h2>Eingehend</h2></div><div class="mission-list">${incoming}</div>` : ""}
      <div class="section-title"><h2>Unterwegs</h2><span class="muted">Missionen über die Sternenkarte</span></div>
      <div class="mission-list">${missionCards || `<div class="muted panel" style="padding:14px">Keine Flotten unterwegs.</div>`}</div>
      <div class="section-title" style="margin-top:18px"><h2>Hangar</h2>
        <span class="muted"><button class="btn ghost small" data-view-jump="yard">Zur Werft</button></span></div>
      <div class="force-grid">${shipCards}</div>
      <div class="section-title" style="margin-top:22px"><h2>Verteidigungsanlagen</h2>
        <span class="muted"><button class="btn ghost small" data-view-jump="defense">Batterien bauen</button></span></div>
      <div class="force-grid">${defCards}</div>`;
  },

  economy() {
    const planets = state.snap.planets || [];
    const ids = resourceIds();
    const totals = { stock: {}, prod: {} };
    for (const k of ids) {
      totals.stock[k] = planets.reduce((s, p) => s + (p[k] || 0), 0);
      totals.prod[k] = planets.reduce((s, p) => s + (p.production?.[k] || 0), 0);
    }
    const cards = ids
      .map((k) => {
        const def = state.catalog.resources[k];
        const best = [...planets].sort((a, b) => (b.production?.[k] || 0) - (a.production?.[k] || 0))[0];
        return `<div class="stat panel eco-stat">
          <em>${resourceIcon(k)} ${esc(def.name)}</em>
          <strong style="color:${def.color}">${fmt(totals.stock[k])}</strong>
          <small>+${fmt(totals.prod[k])}/h empireweit</small>
          <div class="muted">${best ? "stärkste Quelle: " + esc(best.name) : "keine Förderung"}</div>
        </div>`;
      })
      .join("");
    const head = `<tr><th>Planet</th><th>Biom</th>${ids.map((k) => `<th style="color:${state.catalog.resources[k].color}">${esc(state.catalog.resources[k].short)}</th>`).join("")}<th></th></tr>`;
    const rows = planets
      .map((p) => {
        const cells = ids
          .map((k) => {
            const prod = p.production?.[k] || 0;
            const stock = p[k] || 0;
            const maxProd = Math.max(1, ...planets.map((x) => x.production?.[k] || 0));
            const pct = Math.round((prod / maxProd) * 100);
            return `<td>
              <div class="eco-cell" style="--c:${state.catalog.resources[k].color}">
                <b>${fmt(stock)}</b>
                <small>+${fmt(prod)}/h</small>
                <i style="width:${pct}%"></i>
              </div>
            </td>`;
          })
          .join("");
        const mines = (p.extractors || [])
          .filter((x) => x.level > 0)
          .map((x) => `${x.name} S${x.level}`)
          .join(" · ");
        return `<tr>
          <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.systemName)} · ${esc(mines || "keine Extraktoren")}</div></td>
          <td class="muted">${esc(p.typeName)}</td>
          ${cells}
          <td><button class="btn small" data-focus="${p.id}">Fokus</button></td>
        </tr>`;
      })
      .join("");
    const rates = state.snap.prices?.rates || {};
    const rateRow = ids
      .map((k) => {
        const def = state.catalog.resources[k];
        const v = Number(rates[k] || 1);
        return `<div class="stat panel eco-stat">
          <em>${resourceIcon(k)} Kurs ${esc(def.short)}</em>
          <strong style="color:${def.color}">${v.toFixed(2)}</strong>
          <small>galaktischer Tauschwert</small>
        </div>`;
      })
      .join("");
    const spec = planets
      .map((p) => {
        const focus = state.catalog.planetTypes?.[p.type]?.focus;
        const fname = focus ? state.catalog.resources[focus]?.name : "";
        const mine = (p.extractors || []).find((x) => x.resource === focus);
        const on = (mine?.level || 0) >= 2;
        return `<div class="chip ${on ? "ok" : ""}">${esc(p.name)}: ${esc(p.typeName)} → ${esc(fname || "—")}${on ? " · Spezial +14%" : " · Mine S2 für Bonus"}</div>`;
      })
      .join("");
    return `<div class="section-title"><h2>Wirtschaft</h2><span class="muted">${planets.length} Welten · Biom-Spezial + Börse</span></div>
      <div class="stats eco-totals">${cards}</div>
      <div class="section-title"><h2>Börsenkurse</h2><span class="muted">driften alle 8 Minuten · Spread 10%</span></div>
      <div class="stats eco-totals">${rateRow}</div>
      <div class="panel" style="padding:14px;margin:12px 0;max-width:720px">
        <h3 style="margin:0 0 8px;font-size:13px">Tausch</h3>
        <p class="hint">Du gibst eine Ressource zum Kurs, bekommst eine andere. Verkäufe drücken den eigenen Kurs.</p>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <label class="muted">Gib
            <select id="ex-give">${ids.map((k) => `<option value="${k}">${esc(state.catalog.resources[k].name)}</option>`).join("")}</select>
          </label>
          <label class="muted">Menge <input id="ex-amt" type="number" min="1" value="200" style="width:90px"></label>
          <label class="muted">für
            <select id="ex-get">${ids.map((k) => `<option value="${k}" ${k === "helium" ? "selected" : ""}>${esc(state.catalog.resources[k].name)}</option>`).join("")}</select>
          </label>
          <button class="btn primary" id="ex-go">Tauschen</button>
        </div>
        <div id="ex-quote" class="muted" style="margin-top:8px"></div>
      </div>
      <p class="hint">Spezialisierung: Mine des Biom-Fokus ab Stufe 2 gibt +14% auf diese Ressource. Extraktions-Direktive stapelt extra.</p>
      <div class="chips" style="margin-bottom:12px">${spec}</div>
      <div class="panel table-wrap"><table class="table eco-table">
        <thead>${head}</thead>
        <tbody>${rows || `<tr><td class="muted">Keine Kolonien.</td></tr>`}</tbody>
      </table></div>`;
  },

  reports() {
    const mailN = state.snap.unreadMail || 0;
    const news = state.newsTab || "messages";
    const hints = {
      messages: "Bauten, Forschung, Flotten und Ereignisse.",
      combat: "Nur Kampfberichte. Die Sequenz spielt oben, die Zahlen darunter.",
      spy: "Nur Spionageberichte von Sonden.",
    };
    return `<div class="section-title">
        <h2>Funk</h2>
        <div class="filters" id="news-tabs">
          <button class="tab ${news === "messages" ? "on" : ""}" data-news="messages" type="button">Nachrichten</button>
          <button class="tab ${news === "combat" ? "on" : ""}" data-news="combat" type="button">Kampfberichte</button>
          <button class="tab ${news === "spy" ? "on" : ""}" data-news="spy" type="button">Spionageberichte</button>
          <button class="tab ${news === "mail" ? "on" : ""}" data-news="mail" type="button">Postfach${mailN ? ` (${mailN})` : ""}</button>
        </div>
      </div>
      <div id="news-reports" ${news === "mail" ? "hidden" : ""}>
        <div class="row" style="gap:8px;margin-bottom:10px">
          <button class="btn small" id="mark-read">Alle gelesen</button>
        </div>
        <p class="hint">${hints[news] || hints.messages}</p>
        <div id="report-list" class="report-list muted">Lade Kanal…</div>
      </div>
      <div id="news-mail" ${news === "mail" ? "" : "hidden"}>
        <p class="hint">Private Funksprüche. Andere Sprachen werden automatisch in deine Sprache übersetzt (Einstellungen).</p>
        <div id="mail-root" class="mail-layout muted">Lade Postfach…</div>
      </div>`;
  },

  chat() {
    return `<div id="chat-root"><p class="muted">Lade Funk…</p></div>`;
  },

  empire() {
    const e = state.snap.empire;
    const prog = state.snap.progress || {};
    const ids = resourceIds();
    const earned = prog.earned || (prog.medals || []).filter((m) => m.earned);
    const rows = state.snap.planets
      .map(
        (p) => `<tr>
          <td>${esc(p.name)}</td>
          <td class="muted">${esc(p.typeName || state.catalog.planetTypes[p.type]?.name || p.type)}</td>
          ${ids.map((k) => `<td style="color:${state.catalog.resources[k].color}">${fmt(p[k] || 0)}</td>`).join("")}
          <td><button class="btn small" data-focus="${p.id}">Fokus</button></td>
        </tr>`
      )
      .join("");
    return `${profileHeroHtml(e, prog)}
      <div class="section-title"><h2>Medaillen</h2><span class="muted">${earned.length}/${prog.total || earned.length} · sichtbar für andere Commander</span></div>
      ${
        earned.length
          ? `<div class="medal-rack">${earned.map((m) => medalPin(m, true)).join("")}</div>`
          : `<p class="hint">Noch keine Medaille. Aufträge und Schlachten unter <button class="btn ghost small" data-view-jump="progress">Fortschritt</button>.</p>`
      }
      <div class="section-title" style="margin-top:18px"><h2>Welten</h2><span class="muted">${e.planetCount}/${e.planetCap}</span></div>
      <div class="panel table-wrap"><table class="table">
        <thead><tr><th>Planet</th><th>Typ</th>${ids.map((k) => `<th>${esc(state.catalog.resources[k].short)}</th>`).join("")}<th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin-top:14px">Als App: im Browser-Menü „Zum Home-Bildschirm / App installieren“ wählen.</p>
      <button class="btn danger" type="button" id="logout-mobile">Abmelden</button>`;
  },

  ranks() {
    return `<div class="section-title"><h2>Ranglisten</h2><span class="muted">Gesamt, Kampf, Wirtschaft, Forschung und Orbit-Feuer</span></div>
      <div class="filters rank-tabs" id="rank-tabs">
        <button class="tab on" data-rank="all" type="button">Gesamt</button>
        <button class="tab" data-rank="combat" type="button">Kampf</button>
        <button class="tab" data-rank="economy" type="button">Wirtschaft</button>
        <button class="tab" data-rank="research" type="button">Forschung</button>
        <button class="tab" data-rank="orbit" type="button">Orbit-Feuer</button>
      </div>
      <div id="rank-box" class="panel rank-box"><p class="muted">Lade Rangliste…</p></div>`;
  },

  progress() {
    const p = state.snap.progress || { tutorial: { steps: [] }, medals: [], stats: {}, cats: {} };
    const e = state.snap.empire;
    const medals = p.medals || [];
    const steps = (p.tutorial?.steps || [])
      .map(
        (s) =>
          `<li class="progress-step ${s.done ? "done" : s.current ? "current" : ""}"><b>${s.number}</b><span><strong>${esc(s.title)}</strong><small>${esc(s.text)}</small></span><i>${s.done ? "Erledigt" : s.current ? "Aktuell" : "Offen"}</i></li>`
      )
      .join("");
    const catOrder = Object.keys(p.cats || { combat: 1, explore: 1, expand: 1, fleet: 1, science: 1, command: 1 });
    const walls = catOrder
      .map((cat) => {
        const list = medals.filter((m) => m.cat === cat);
        if (!list.length) return "";
        return `<section class="medal-cat">
          <h3>${esc(p.cats[cat] || cat)}</h3>
          <div class="medal-wall">${list.map((m) => medalCard(m)).join("")}</div>
        </section>`;
      })
      .join("");
    const st = p.stats || {};
    return `${profileHeroHtml(e, p)}
      <div class="progress-stats">
        <div class="stat-chip"><b>${fmt(st.combatWins || 0)}</b><span>Siege</span></div>
        <div class="stat-chip"><b>${fmt(st.expeditions || 0)}</b><span>Expeditionen</span></div>
        <div class="stat-chip"><b>${fmt(st.planets || 0)}</b><span>Welten</span></div>
        <div class="stat-chip"><b>${fmt(st.spy || 0)}</b><span>Spionage</span></div>
        <div class="stat-chip"><b>${fmt(st.fighters || 0)}</b><span>Jäger</span></div>
        <div class="stat-chip"><b>${p.earnedCount || 0}/${p.total || 0}</b><span>Medaillen</span></div>
      </div>
      <div class="section-title"><h2>Medaillenwand</h2><span class="muted">Automatisch verliehen · erscheinen im Profil</span></div>
      ${walls}
      <div class="progress-layout" style="margin-top:18px"><section class="panel progress-tutorial"><h3>Kampagne ${p.tutorial?.completed || 0}/${p.tutorial?.total || 0}</h3><ol>${steps}</ol></section></div>`;
  },

  alliance() {
    return `<div id="alliance-root"><p class="muted">Lade Allianzen…</p></div>`;
  },

  activity() {
    const acts = state.snap.activities || [];
    const occupiedSlots = acts.filter((a) => a.running).length;
    const cards = acts
      .map((a) => {
        const ready = a.ready;
        const running = a.running;
        const choiceKey=`${state.snap.planet.id}:${a.id}`;
        const chosen = running ? a.duration : state.activityDurations[choiceKey] || a.duration || "short";
        const durs = (a.durations || [])
          .map(
            (d) => `<button type="button" class="duration-btn ${d.id === chosen ? "on" : ""}" aria-pressed="${d.id === chosen}" data-duration-choice="${d.id}" data-activity-card="${a.id}" ${running ? "disabled" : ""}>
              <b>${esc(d.name)}</b>
              <span>${eta(d.ms)} · ${esc(d.blurb)}${d.energy ? ` · ${d.energy} E` : ""}</span>
            </button>`
          )
          .join("");
        const statusText = running ? eta(a.wait) : ready ? "BEREIT" : eta(a.wait);
        const statusClass = running ? "running" : ready ? "ready" : "waiting";
        const startButton = running
          ? `<button type="button" class="btn ghost" disabled>Aktiv · ${esc(a.durationName || "Einsatz")}</button>`
          : `<button type="button" class="btn primary" data-activity="${a.id}" data-duration="${chosen}">Start</button>`;
        return `<article class="force-card panel ${statusClass}">
          <div class="force-art">
            ${mediaTag(a.art)}
            ${ready
              ? `<button type="button" class="force-count force-ready-action" data-activity="${a.id}" data-duration="${chosen}" title="Einsatz starten">${statusText}</button>`
              : `<span class="force-count" ${running ? `data-live-eta="${a.readyAt}"` : ''} title="${running ? "Rückkehr in" : "Fertig in"}">${statusText}</span>`}
          </div>
          <div class="force-body">
            <h3>${esc(a.name)}</h3>
            <p>${esc(a.blurb)}</p>
            ${a.reward ? `<p class="activity-reward">Belohnung: ${esc(a.reward)}</p>` : ""}
            <div class="duration-row">${durs}</div>
            ${running ? `<div class="activity-slot occupied">Slot belegt · Unterwegs (${esc(a.durationName || "Einsatz")}) · Beute bei Rückkehr</div>` : `<div class="activity-start-row">${startButton}</div>`}
          </div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Einsatzzentrale</h2>
        <span class="muted">Kurz wenig Beute · mittel solide Beute · lang reiche Beute</span></div>
      <p class="activity-slot-summary"><b>${occupiedSlots}/${acts.length} Einsatz-Slots belegt</b><span>Jede Missionsart besitzt einen eigenen Slot.</span></p>
      <p class="hint">Wähle die Dauer, dann starte den Einsatz. Kurz/Mittel/Lang bestimmen nur die Laufzeit, nicht die Art des Einsatzes.</p>
      <div class="force-grid">${cards}</div>`;
  },

  sim() {
    const p = state.snap.planet;
    const ships = Object.values(state.catalog.ships || {});
    const defs = Object.values(state.catalog.defenses || {});
    const shipRows = (side) =>
      ships
        .map(
          (s) => `<label class="sim-row">
            <img src="/assets/ships/${s.id}.jpg" alt="" />
            <span>${esc(s.name)}</span>
            <input type="number" min="0" max="99999" value="0" data-${side}="${s.id}">
          </label>`
        )
        .join("");
    const defRows = defs
      .map(
        (d) => `<label class="sim-row">
          <img src="/assets/defenses/${d.id}.jpg" alt="" />
          <span>${esc(d.name)}</span>
          <input type="number" min="0" max="99999" value="0" data-ddef="${d.id}">
        </label>`
      )
      .join("");
    const b = p?.buildings || {};
    const platformHint = (b.shield || 0) * 55 + (b.citadel || 0) * 110;
    return `<div class="section-title"><h2>Kampfsimulator</h2><span class="muted">Was-wäre-wenn · keine echten Verluste</span></div>
      <p class="hint">Setze Angreifer-Flotte gegen Verteidiger-Flotte und Orbit-Batterien. Die Rechnung nutzt dieselbe Kampfmatrix wie echte Angriffe (Typen-Vorteil, Forschung, Schild/Zitadelle als Plattform-HP).</p>
      <div class="sim-toolbar panel">
        <label class="row"><span>Eigene Forschung einrechnen</span><input id="sim-techs" type="checkbox" checked></label>
        <label>Plattform-HP <input id="sim-platform" type="number" min="0" max="50000" value="${platformHint}" style="width:88px">
          <span class="muted">Schild ${b.shield || 0} + Zitadelle ${b.citadel || 0} = ${platformHint}</span></label>
        <div class="sim-actions">
          <button class="btn ghost" type="button" id="sim-fill-atk">Meine Flotte → Angriff</button>
          <button class="btn ghost" type="button" id="sim-fill-def">Meine Flotte → Verteidigung</button>
          <button class="btn ghost" type="button" id="sim-fill-bat">Meine Batterien</button>
          <button class="btn ghost" type="button" id="sim-clear">Leeren</button>
          <button class="btn primary" type="button" id="sim-run">Simulieren</button>
        </div>
      </div>
      <div class="sim-grid">
        <section class="panel sim-col">
          <h3>Angreifer</h3>
          <div class="sim-list">${shipRows("atk")}</div>
        </section>
        <section class="panel sim-col">
          <h3>Verteidiger · Schiffe</h3>
          <div class="sim-list">${shipRows("def")}</div>
          <h3 style="margin-top:14px">Verteidiger · Orbit</h3>
          <div class="sim-list">${defRows}</div>
        </section>
      </div>
      <div id="sim-out" class="preview-box" hidden></div>`;
  },

  moderation() {
    if (!state.snap.user.isAdmin && !state.snap.user.isMod) {
      return `<p class="danger">Keine Berechtigung.</p>`;
    }
    return `<div id="mod-root"><p class="muted">Lade Moderation…</p></div>`;
  },

  settings() {
    const e = state.snap.empire;
    const presets = state.snap.avatars || ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
    const faces = presets
      .map(
        (id) => `<button type="button" class="avatar-pick ${e.avatarKey === id ? "on" : ""}" data-avatar="${id}">
          <img src="/assets/avatars/${id}.jpg" alt="" />
        </button>`
      )
      .join("");
    const spec = state.snap.species || {};
    const list = state.snap.speciesList || state.catalog?.species || [];
    const shop = state.snap.nexShop || {};
    const cdHours = e.vip?.speciesCdHours || shop.changeCdHours || 48;
    const cdLeft = Math.max(0, cdHours * 3600000 - (Date.now() - (e.lastSpecies || 0)));
    const raceCards = list
      .map(
        (s) => `<button type="button" class="species-card ${e.species === s.id ? "on" : ""}" data-species="${s.id}">
          <img src="/assets/species/${s.id}.jpg" alt="" />
          <div class="sp-body">
            <h3>${esc(s.glyph)} ${esc(s.name)}</h3>
            <p>${esc(s.blurb)}</p>
            <p class="perk">${esc(s.perk)}</p>
            <p class="flaw">${esc(s.flaw)}</p>
          </div>
        </button>`
      )
      .join("");
    return `<div class="section-title"><h2>Einstellungen</h2><span class="muted">${esc(state.snap.user.username)}</span></div>
      <div class="settings-grid">
        <section class="panel" style="padding:16px;grid-column:1/-1">
          <h3 style="margin:0 0 10px;font-size:13px">Spezies</h3>
          <p class="hint">Aktuell: <b>${esc(spec.name)}</b>. Wechsel kostet ${shop.changeCost || 80} Nex
            ${cdLeft && e.lastSpecies ? ` · Cooldown noch ${eta(cdLeft)}` : ""} · du hast ${fmt(e.nex || 0)} Nex.</p>
          <div class="species-pick">${raceCards}</div>
        </section>
        <section class="panel" style="padding:16px">
          <h3 style="margin:0 0 10px;font-size:13px">Commander-Avatar</h3>
          <div class="avatar-row">
            <img class="avatar-xl" src="${esc(e.avatar)}" alt="" />
            <div>
              <div class="avatar-grid">${faces}</div>
              <label class="btn ghost small" style="margin-top:10px;display:inline-block">Eigenes Bild
                <input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
              </label>
              <div class="muted" style="margin-top:6px">JPEG/PNG, max. 450 KB.</div>
            </div>
          </div>
        </section>
        <section class="panel" style="padding:16px">
          <h3 style="margin:0 0 10px;font-size:13px">Imperium</h3>
          <form id="settings-form" class="stack">
            <label>Name<input name="empireName" maxlength="24" value="${esc(e.name)}" required></label>
            <label>Farbe<input name="color" type="color" value="${esc(e.color)}"></label>
            <label>Sprache
              <select name="locale">${Object.entries(state.snap.langs || { de: "Deutsch", en: "English", it: "Italiano" })
                .map(([k, n]) => `<option value="${k}" ${e.locale === k ? "selected" : ""}>${esc(n)}</option>`)
                .join("")}</select>
            </label>
            <label class="row"><span>Chat/PMs automatisch übersetzen</span><input name="translate" type="checkbox" ${e.translate !== false ? "checked" : ""}></label>
            <label class="row"><span>Sound</span><input name="sound" type="checkbox" ${e.sound ? "checked" : ""}></label>
            <label class="row"><span>Desktop-Hinweise</span><input name="notify" type="checkbox" ${e.notify ? "checked" : ""}></label>
            <label>Neues Passwort (optional, mind. 8 Zeichen)<input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password"></label>
            <label>Aktuelles Passwort (nur bei Änderung)<input name="oldPassword" type="password" autocomplete="current-password"></label>
            <button class="btn primary" type="submit">Speichern</button>
          </form>
        </section>
        <section class="panel" style="padding:16px">
          <h3 style="margin:0 0 8px;font-size:13px">App aufs Handy</h3>
          <p class="hint">Ohne Store: als PWA auf den Startbildschirm. Geht nur über HTTPS (z. B. Vercel) oder localhost.</p>
          <button class="btn primary" type="button" data-pwa-install onclick="stellarInstallApp()">App installieren</button>
          <p class="muted" style="margin:10px 0 0;font-size:12px">
            <b>Android:</b> Chrome-Menü ⋮ → „App installieren“.<br>
            <b>iPhone:</b> Safari → Teilen → „Zum Home-Bildschirm“.
          </p>
        </section>
        <section class="panel settings-danger" style="padding:16px">
          <h3 style="margin:0 0 8px;font-size:13px">Account löschen</h3>
          <p class="hint">Dein Account, Imperium und alle zugehörigen Spieldaten werden dauerhaft gelöscht.</p>
          <button class="btn danger" type="button" id="delete-account">Account dauerhaft löschen</button>
        </section>
      </div>`;
  },
};

function readSimMap(root, attr) {
  const out = {};
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    const n = Math.max(0, Math.min(99999, Number(el.value || 0) | 0));
    if (n) out[el.getAttribute(attr)] = n;
  });
  return out;
}

function fillSimMap(root, attr, map) {
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    el.value = String(map[el.getAttribute(attr)] || 0);
  });
}

function unitList(map, catalog) {
  const parts = [];
  for (const [id, n] of Object.entries(map || {})) {
    if (!n) continue;
    parts.push(`${n}× ${esc(catalog?.[id]?.name || id)}`);
  }
  return parts.join(", ") || "—";
}

function bindSim(root) {
  const p = state.snap.planet;
  const out = root.querySelector("#sim-out");
  root.querySelector("#sim-fill-atk")?.addEventListener("click", () => fillSimMap(root, "data-atk", p.ships || {}));
  root.querySelector("#sim-fill-def")?.addEventListener("click", () => fillSimMap(root, "data-def", p.ships || {}));
  root.querySelector("#sim-fill-bat")?.addEventListener("click", () => fillSimMap(root, "data-ddef", p.defenses || {}));
  root.querySelector("#sim-clear")?.addEventListener("click", () => {
    fillSimMap(root, "data-atk", {});
    fillSimMap(root, "data-def", {});
    fillSimMap(root, "data-ddef", {});
    if (out) {
      out.hidden = true;
      out.innerHTML = "";
    }
  });
  root.querySelector("#sim-run")?.addEventListener("click", async () => {
    const atk = readSimMap(root, "data-atk");
    const def = readSimMap(root, "data-def");
    const defenses = readSimMap(root, "data-ddef");
    if (!Object.keys(atk).length) {
      toast("Angreifer-Flotte ist leer.", true);
      return;
    }
    try {
      const data = await combatSim({
        atk,
        def,
        defenses,
        useOwnTechs: !!root.querySelector("#sim-techs")?.checked,
        platformHp: Number(root.querySelector("#sim-platform")?.value || 0),
      });
      const win = data.winner === "attacker";
      out.hidden = false;
      out.className = "preview-box " + (win ? "win" : "loss");
      const matrixRows = (data.matrix || [])
        .map((row) => {
          const bits = [
            ...Object.values(row.vsDef || {}).map(
              (v) =>
                `<span class="${v.mul >= 1.4 ? "mul-good" : v.mul <= 0.6 ? "mul-bad" : "mul-mid"}">${esc(v.name)} ×${v.mul.toFixed(2)}</span>`
            ),
            ...Object.values(row.vsShips || {}).map(
              (v) =>
                `<span class="${v.mul >= 1.4 ? "mul-good" : v.mul <= 0.6 ? "mul-bad" : "mul-mid"}">${esc(v.name)} ×${v.mul.toFixed(2)}</span>`
            ),
          ];
          return `<tr><td>${esc(row.name)} ×${row.n}</td><td>${bits.join(" · ") || "—"}</td></tr>`;
        })
        .join("");
      out.innerHTML = `<b>${win ? "Sieg Angreifer" : "Sieg Verteidiger"}</b>
        <div class="muted">Feuerkraft ${fmt(data.atkPower)} vs ${fmt(data.defPower)}${data.platformHp ? ` · Plattform ${fmt(data.platformHp)} HP` : ""}${data.techs ? " · inkl. Forschung" : ""}</div>
        <div class="sim-result">
          <div><em>Angreifer verloren</em><div>${unitList(data.atkLost, state.catalog.ships)}</div>
            <span class="muted">übrig: ${unitList(data.atkSurvivors, state.catalog.ships)}</span></div>
          <div><em>Verteidiger verloren</em><div>${unitList(data.defLost, state.catalog.ships)}</div>
            <span class="muted">übrig: ${unitList(data.defSurvivors, state.catalog.ships)}</span></div>
          <div><em>Batterien verloren</em><div>${unitList(data.defLostDefense, state.catalog.defenses)}</div>
            <span class="muted">übrig: ${unitList(data.defSurvivorsDefense, state.catalog.defenses)}</span></div>
        </div>
        <table class="vs-matrix"><tbody>${matrixRows}</tbody></table>`;
    } catch (err) {
      out.hidden = false;
      out.className = "preview-box";
      out.innerHTML = `<span class="danger">${esc(err.message)}</span>`;
    }
  });
}

function bindCity(root) {
  if (!root.querySelector(".living-colony")) return;
  const view = root.querySelector(".living-colony");
  if (state.cityCam.planetId !== state.snap?.planet?.id) {
    state.cityCam.planetId = state.snap?.planet?.id;
    state.cityBuilding = null;
  }
  const select = (id, sync = true) => {
    if (!view.isConnected) return;
    state.cityBuilding = id || null;
    paintColonyMarkers(root, unityColonyState());
    paintCityDock(root, id);
    paintCityQuest(root);
    if (sync) state.cityScene?.setSelected(id || "");
  };
  view.querySelectorAll("[data-city-building]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      select(button.dataset.cityBuilding);
    });
  });
  view.querySelector("[data-guide]").addEventListener("click", () => { if (tutorialIndex() >= TUTORIAL.length) setTutorialIndex(0); openGuide(); });
  view.querySelectorAll("[data-colony-focus]").forEach(button => button.addEventListener("click", () => {
    view.querySelector(".colony-directory").open = false;
    state.cityScene?.focus(button.dataset.colonyFocus);
    select(button.dataset.colonyFocus);
  }));
  const setQuestsOpen = open => {
    state.citySheet = open ? "quests" : null;
    select("");
    renderView();
    root.querySelector(open ? ".colony-quests .city-sheet-close" : ".colony-orders")?.focus({ preventScroll: true });
  };
  view.querySelectorAll("[data-city-sheet]").forEach(button => button.addEventListener("click", () => {
    setQuestsOpen(button.dataset.citySheet === "quests" && state.citySheet !== "quests");
  }));
  view.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (state.citySheet === "quests") { event.preventDefault(); event.stopPropagation(); setQuestsOpen(false); }
      else { select(""); view.querySelector(".colony-directory").open = false; }
    }
  });
  view.querySelector("[data-colony-retry]").addEventListener("click", () => bootUnityCity());
  syncCityLive();
  bootUnityCity();

  async function bootUnityCity() {
    const canvas = $("colony-unity-canvas");
    const error = view.querySelector(".colony-load-error");
    if (!canvas) return;
    error.hidden = true;
    setUnityColonyVisible(true);
    try {
      const scene = await createColonyUnity(canvas, {
        state: unityColonyState(), selectedId: state.cityBuilding,
        onSelect: id => select(id, false),
        onFrame: frame => {
          if (!view.isConnected || rootView() !== "command") return;
          paintColonyFrame(root, frame, state.cityBuilding);
          view.classList.add("is-unity");
        },
      });
      if (!view.isConnected || rootView() !== "command") return;
      setUnityColonyVisible(true);
      state.cityScene = scene;
      cityStateSignature = "";
      syncCityLive();
    } catch (err) {
      if (!view.isConnected) return;
      console.error("Unity-Basis:", err);
      view.classList.remove("is-unity");
      setUnityColonyVisible(false);
      error.hidden = false;
      error.querySelector("p").textContent = "Die Basis konnte nicht gestartet werden. Erneut versuchen oder über die Gebäudeliste fortfahren.";
    }
  }
}

function paintCityDock(root, id) {
  const dock = root.querySelector("#city-actions");
  const p = state.snap?.planet;
  const plot = CITY_PLOTS.find(item => item.id === id);
  if (!dock) return;
  if (!p || !plot) { dock.hidden = true; dock.innerHTML = ""; dock.dataset.version = ""; syncColonyPointerEvents(); return; }
  const info = state.preview?.planetId === String(p.id) ? state.preview.buildings?.find(b => b.id === id) : null;
  const row = unityColonyState().plots.find(b => b.id === id);
  const q = (state.snap.queue || []).find(item => item.kind === "building" && item.itemId === id && item.planetId === p.id && item.completesAt > Date.now());
  const unlocked = info?.unlocked === true;
  const affordable = !!info && canAfford(info.nextCost || {});
  const busyJob=(state.snap.queue || []).find(item=>item.kind==='building' && item.planetId===p.id);
  const homeLocked = !p.isHome && (id === "archive" || id === "quantum_lab");
  const canUpgrade = unlocked && !busyJob && !info?.max && affordable && !homeLocked;
  const reason = homeLocked ? "Nur auf dem Hauptplaneten. Forschung gilt für alle Kolonien." : !info ? "Ausbaudaten werden geladen" : !unlocked ? plotNeedText(id, p.buildings || {}) : info.max ? "Maximalstufe erreicht" : busyJob ? `IM BAU: ${busyJob.name} · ${p.name}` : !affordable ? "Rohstoffe fehlen" : "";
  const signature = JSON.stringify([p.id, id, row.level, row.status, row.statusLabel, canUpgrade, reason, info?.nextCost, info?.nextTime, q?.id]);
  if (dock.dataset.version !== signature) {
    dock.dataset.version = signature;
    dock.hidden = false;
    dock.innerHTML = `<div class="colony-card-heading"><div><small>PLANETENBASIS</small><strong>${esc(row.name)}</strong></div><button type="button" class="colony-card-close" aria-label="Gebäudeauswahl schließen">×</button></div>
      <div class="colony-card-state"><b>Stufe ${row.level}</b><span data-status="${row.status}"><i></i>${esc(row.statusLabel)}</span></div>
      <div class="colony-job" ${!row.completesAt ? "hidden" : ""}><div class="colony-job-track"><i style="width:${Math.round(row.progress * 100)}%"></i></div><span data-colony-job-time></span></div>
      ${info?.nextCost && !info.max && !q ? `<div class="colony-upgrade-cost">${costHtml(info.nextCost, have(), state.catalog)}<small>${info.nextTime ? eta(info.nextTime * 1000) : ""}</small></div>` : ""}
      <div class="colony-card-buttons"><button type="button" class="city-info" data-colony-info="${id}"><i>i</i><b>Info</b></button><button type="button" class="city-upgrade" data-colony-upgrade="${id}" ${!canUpgrade ? "disabled" : ""}><i>↑</i><b>Aufleveln</b><small>Stufe ${row.level + 1}</small></button></div>
      ${reason ? `<p class="colony-card-reason">${esc(reason)}</p>` : ""}
      ${["yard", "research", "defense"].includes(plot.view) ? `<button type="button" class="colony-work-link" data-colony-work="${plot.view}">${plot.view === "yard" ? "Schiffe produzieren" : plot.view === "research" ? "Forschung öffnen" : "Verteidigung bauen"} <span>↗</span></button>` : ""}`;
    dock.querySelector(".colony-card-close").addEventListener("click", () => {
      state.cityBuilding = null;
      state.cityScene?.setSelected("");
      syncCityLive();
    });
    dock.querySelector("[data-colony-info]").addEventListener("click", () => {
      state.highlightBuilding = id;
      setView("infra", { routed: true });
    });
    dock.querySelector("[data-colony-upgrade]").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      dock.dataset.pending = "1";
      await act(() => api("/build", { method: "POST", body: { id, planetId: p.id } }));
      if (dock.isConnected) { delete dock.dataset.pending; dock.dataset.version = ""; syncCityLive(); }
    });
    dock.querySelector("[data-colony-work]")?.addEventListener("click", () => setView(plot.view));
  }
  syncColonyPointerEvents();
  if (dock.dataset.pending) dock.querySelector("[data-colony-upgrade]").disabled = true;
  const time = dock.querySelector("[data-colony-job-time]");
  if (time && row.completesAt) {
    time.textContent = eta(Math.max(0, row.completesAt - Date.now()));
    dock.querySelector(".colony-job-track i").style.width = `${Math.round(row.progress * 100)}%`;
  }
}

function bindQuestClaims(root) {
  for (const kind of ["claim", "op", "weekly"]) {
    root.querySelectorAll(`[data-${kind}]`).forEach(button => button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      try { await act(() => api(`/quest/${kind}`, { method: "POST", body: { id: button.dataset[kind] } })); }
      finally { if (button.isConnected) button.disabled = false; }
    }));
  }
}

function bindView(root) {
  const hideOwned = root.querySelector("#tree-hide-owned");
  hideOwned?.addEventListener("change", () => {
    try { localStorage.setItem("sn-tree-hide-owned", hideOwned.checked ? "1" : "0"); } catch { /* ignore */ }
    root.querySelector(".tree")?.classList.toggle("hide-owned", hideOwned.checked);
  });
  root.querySelectorAll("[data-ledger-report]").forEach((button) => {
    button.addEventListener("click", () => {
      state.openReports.add(String(button.dataset.ledgerReport));
      state.newsTab="combat";
      setView("reports");
    });
  });
  root.querySelectorAll("[data-build]").forEach((b) => {
    b.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = b.dataset.build;
      const planetId = state.snap.planet.id;
      b.disabled = true;
      act(() => api("/build", { method: "POST", body: { id, planetId } }));
    });
  });
  root.querySelectorAll("[data-ship]").forEach((b) =>
    b.addEventListener("click", async () => {
      const input = root.querySelector(`[data-qty="${b.dataset.ship}"]`);
      const info=state.preview?.ships?.find(s=>s.id===b.dataset.ship);
      const qty = clampYardQty(input, currentShipBudget(info || {cost:{},unlocked:false}).buildable || 1);
      if(root.dataset.submitting)return;
      if(qty<1){updateShipBudgets();return;}
      root.dataset.submitting='1';
      b.disabled = true;
      const shipId=b.dataset.ship,planetId=state.snap.planet.id;
      await act(async () => {const snap=await api("/ship", { method: "POST", body: { id: shipId, qty, planetId } });if(input)input.value='1';const job=snap.queue?.filter(q=>q.kind==='ship'&&q.itemId===shipId&&q.planetId===planetId).at(-1);toast(`${qty} × ${state.catalog.ships[shipId]?.name || shipId} im Bau${job?' · '+eta(job.completesAt-Date.now()):''}. Aufträge zeigt den Fortschritt.`);return snap;});
      delete root.dataset.submitting;updateShipBudgets();
    })
  );
  root.querySelectorAll('[data-ship-max]').forEach(b=>b.addEventListener('click',()=>{
    const info=state.preview?.ships?.find(s=>s.id===b.dataset.shipMax);if(!info)return;
    const budget=currentShipBudget(info),input=root.querySelector(`[data-qty="${info.id}"]`);
    if(input)input.value=String(Math.max(1,budget.buildable));updateShipBudgets();
    toast(`Jetzt baubar: ${budget.buildable}. Ressourcen, freie Hangarplätze und maximal 50 Schiffe je Auftrag sind berücksichtigt.`);
  }));
  root.querySelectorAll("[data-defense]").forEach((b) =>
    b.addEventListener("click", () => {
      const qty = Number(root.querySelector(`[data-dqty="${b.dataset.defense}"]`)?.value || 1);
      act(() => api("/defense", { method: "POST", body: { id: b.dataset.defense, qty, planetId: state.snap.planet.id } }));
    })
  );
  if (state.view === "ranks") loadRanks();
  if (state.view === "alliance") bootAlliance();
  if (state.view === "settings") bindSettings(root);
  if (state.view === "moderation") bootModeration();
  if (state.view === "chat") bootChat();
  if (state.view === "reports") bindNews(root);
  if (state.view === "sim") bindSim(root);
  root.querySelectorAll("[data-duration-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".force-card");
      state.activityDurations[`${state.snap.planet.id}:${button.dataset.activityCard}`]=button.dataset.durationChoice;
      card?.querySelectorAll("[data-duration-choice]").forEach((item) => {item.classList.toggle("on", item === button);item.setAttribute('aria-pressed',String(item===button));});
      card?.querySelectorAll("[data-activity]").forEach(start=>{start.dataset.duration=button.dataset.durationChoice;});
    });
  });
  bindAllianceQuickActions(root);
  root.querySelectorAll("[data-activity]").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const kind = b.dataset.activity;
      const duration = state.activityDurations[`${state.snap.planet.id}:${kind}`] || b.dataset.duration || "short";
      if (!kind) return;
      root.querySelectorAll(`[data-activity="${kind}"]`).forEach((button) => { button.disabled = true; });
      act(() => api("/activity", { method: "POST", body: { kind, duration, planetId: state.snap.planet.id } }));
    });
  });
  root.querySelectorAll("[data-ally-tech]").forEach((b) =>
    b.addEventListener("click", () =>
      act(() => api("/alliances/research", { method: "POST", body: { id: b.dataset.allyTech, planetId: state.snap.planet.id } }))
    )
  );
  root.querySelectorAll('[data-ally-fund]').forEach(b=>b.addEventListener('click',()=>{b.disabled=true;act(()=>api('/alliances/research',{method:'POST',body:{id:b.dataset.allyFund,planetId:state.snap.planet.id,donate:true}}));}));
  root.querySelectorAll('[data-alliance-transport]').forEach(b=>b.addEventListener('click',async()=>{
    try { const p=state.snap.planet,sys=await getSystem(p.systemId);openMission(Number(b.dataset.allianceTransport),sys,'transport'); } catch(err){toast(err.message,true);}
  }));
  root.querySelectorAll("[data-ally-profile]").forEach((b) =>
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openAllianceProfile(Number(b.dataset.allyProfile));
    })
  );
  root.querySelectorAll("[data-tech]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/research", { method: "POST", body: { id: b.dataset.tech, planetId: state.snap.planet.id } })))
  );
  root.querySelectorAll("[data-focus]").forEach((b) =>
    b.addEventListener("click", () => switchPlanet(Number(b.dataset.focus)))
  );
  root.querySelectorAll("[data-open-infra]").forEach((b) => {
    // Validiere Gebäude-ID vor Handler - verhindere Fehler bei leeren/ungültigen IDs
    const buildingId = b.dataset.openInfra || "";
    const view = b.dataset.viewJump || "infra";
    if (!buildingId && view === "infra") {
      // Ungültiges Element - verstecke es
      b.style.display = "none";
      return;
    }
    b.addEventListener("click", () => {
      if (buildingId) state.highlightBuilding = buildingId;
      setView(view, { routed: true });
    });
  });
  bindQuestClaims(root);
  root.querySelectorAll("[data-commander]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/commander/activate", { method: "POST", body: { id: b.dataset.commander } })))
  );
  root.querySelectorAll("[data-recall-fleet]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Flotte wirklich zurückrufen? Sie kehrt entlang der bereits geflogenen Strecke um.")) return;
      act(() => api(`/fleet/${Number(b.dataset.recallFleet)}/recall`, { method: "POST", body: {} }));
    })
  );
  const exGo = root.querySelector("#ex-go");
  if (exGo) {
    const quoteEl = root.querySelector("#ex-quote");
    const paintQuote = () => {
      const give = root.querySelector("#ex-give")?.value;
      const get = root.querySelector("#ex-get")?.value;
      const amount = Number(root.querySelector("#ex-amt")?.value || 0);
      const rates = state.snap.prices?.rates || {};
      if (!give || !get || give === get || amount < 1) {
        quoteEl.textContent = "Zwei verschiedene Ressourcen wählen.";
        return;
      }
      const got = Math.max(1, Math.floor((amount * (rates[give] || 1) * 0.9) / (rates[get] || 1)));
      quoteEl.innerHTML = `${fmt(amount)} ${esc(state.catalog.resources[give].short)} → <b>${fmt(got)} ${esc(state.catalog.resources[get].short)}</b>`;
    };
    root.querySelector("#ex-give").onchange = paintQuote;
    root.querySelector("#ex-get").onchange = paintQuote;
    root.querySelector("#ex-amt").oninput = paintQuote;
    paintQuote();
    exGo.onclick = () =>
      act(() =>
        api("/market/exchange", {
          method: "POST",
          body: {
            planetId: state.snap.planet.id,
            give: root.querySelector("#ex-give").value,
            get: root.querySelector("#ex-get").value,
            amount: Number(root.querySelector("#ex-amt").value || 0),
          },
        })
      );
  }
  bindJumps(root);
  if (state.view === "command") bindCity(root);
  if (state.highlightBuilding) {
    const row = root.querySelector(`#bldg-${state.highlightBuilding}`);
    state.highlightBuilding = null;
    if (row) setTimeout(() => row.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
  }
  const dir = root.querySelector("#directive-select");
  if (dir) {
    dir.onchange = () =>
      act(() =>
        api("/directive", { method: "POST", body: { planetId: Number(dir.dataset.planet), directive: dir.value } })
      );
  }
  root.querySelectorAll("[data-toggle-relic]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.toggleRelic;
      const eq = new Set(state.snap.relics?.equipped || []);
      if (eq.has(id)) eq.delete(id);
      else {
        if (eq.size >= 3) {
          toast("Maximal 3 Relikte.", true);
          return;
        }
        eq.add(id);
      }
      act(() => api("/relics/equip", { method: "POST", body: { ids: [...eq] } }));
    })
  );
  root.querySelectorAll("[data-trade]").forEach((b) =>
    b.addEventListener("click", () =>
      act(() => api("/market/trade", { method: "POST", body: { index: Number(b.dataset.trade), planetId: state.snap.planet.id } }))
    )
  );
  const rush = root.querySelector("#rush-btn");
  if (rush)
    rush.onclick = () => act(() => api("/rush", { method: "POST", body: { planetId: state.snap.planet.id } }));
  root.querySelectorAll("[data-nex]").forEach((b) =>
    b.addEventListener("click", () => {
      const extra = { id: b.dataset.nex, planetId: state.snap.planet.id };
      if (b.dataset.nex === "rename") {
        const name = window.prompt("Neuer Name für den Fokus-Planeten:", state.snap.planet?.name || "");
        if (!name) return;
        extra.name = name;
      }
      act(() => api("/nex/buy", { method: "POST", body: extra }));
    })
  );

  const daily = root.querySelector("#nex-daily");
  if (daily)
    daily.onclick = () => act(() => api("/nex/daily", { method: "POST", body: { planetId: state.snap.planet.id } }));
  const grant = root.querySelector("#nex-grant");
  if (grant)
    grant.onclick = () => act(() => api("/nex/grant", { method: "POST", body: { amount: 100, planetId: state.snap.planet.id } }));
  const vipGrant = root.querySelector("#vip-grant");
  if (vipGrant)
    vipGrant.onclick = () => act(() => api("/nex/vip/grant", { method: "POST", body: { days: 30, planetId: state.snap.planet.id } }));
  const vipCancel = root.querySelector("#vip-cancel");
  if (vipCancel)
    vipCancel.onclick = () => {
      if (confirm("Pass zum Ende der Laufzeit kündigen? Bereits bezahlte Tage bleiben.")) {
        act(() => api("/nex/vip/cancel", { method: "POST", body: {} }));
      }
    };
  root.querySelectorAll("[data-report-attack]").forEach((b) =>
    b.addEventListener("click", async () => {
      const targetId = Number(b.dataset.reportAttack);
      try {
        const sysId = state.snap.planets?.[0]?.systemId;
        const detail = await getSystem(Number(b.dataset.system) || sysId);
        openGroupMission(targetId, detail, "attack");
      } catch {
        setView("galaxy");
      }
    })
  );
  const lo = root.querySelector("#logout-mobile");
  if (lo) lo.onclick = () => logoutNow();
  if (state.view === "galaxy") bootMap();
  renderAlerts();
}

function bindNews(root) {
  root.querySelectorAll("#news-tabs [data-news]").forEach((tab) => {
    tab.onclick = () => {
      state.newsTab = tab.dataset.news;
      root.querySelectorAll("#news-tabs .tab").forEach((t) => t.classList.toggle("on", t === tab));
      const reportsBox = root.querySelector("#news-reports");
      const mailBox = root.querySelector("#news-mail");
      if (reportsBox) reportsBox.hidden = state.newsTab === "mail";
      if (mailBox) mailBox.hidden = state.newsTab !== "mail";
      if (state.newsTab === "mail") bootMail();
      else loadReports(state.newsTab);
    };
  });
  const mark = root.querySelector("#mark-read");
  if (mark) {
    mark.onclick = async () => {
      await api("/reports/read", { method: "POST", body: {} });
      await refresh();
      if (state.newsTab !== "mail") loadReports(state.newsTab);
    };
  }
  if (state.newsTab === "mail") bootMail();
  else loadReports(state.newsTab);
}

function rankScoreLabel(r, cat) {
  if (cat === "orbit") {
    if (!r.orbitScore) return { value: "—", unit: "kein Lauf" };
    return { value: String(r.orbitWaves || 0), unit: `Welle · ${r.orbitKills || 0} Kills` };
  }
  if (cat === "combat") return { value: fmt(r.combatScore), unit: "Siege" };
  if (cat === "economy") return { value: fmt(r.economyScore), unit: "Vorrat" };
  if (cat === "research") return { value: fmt(r.researchScore), unit: "Tech" };
  return { value: fmt(r.score), unit: "Punkte" };
}

function rankCardHtml(r, i, selfId, cat) {
  const score = rankScoreLabel(r, cat);
  const ally = r.alliance ? `<button type="button" class="rank-ally" data-open-ally="${r.alliance.id}">[${esc(r.alliance.tag)}]</button>` : "";
  return `<article class="rank-card${r.id === selfId ? " self" : ""}">
    <b class="rank-pos">${i + 1}</b>
    <button type="button" class="rank-avatar linkish" data-profile="${r.id}" aria-label="Profil"><img class="avatar-sm" src="${esc(r.avatar)}" alt="" /></button>
    <div class="rank-copy">
      <strong><button type="button" class="linkish" data-profile="${r.id}">${esc(r.username)}</button>${r.vip ? ` <span class="vip-pill">Pass</span>` : ""}</strong>
      <small><span style="color:${esc(r.color)}">●</span> ${esc(r.name)}${ally ? ` · ${ally}` : ""} · S${r.level} · ${r.planets} Welten</small>
    </div>
    <div class="rank-score"><b>${score.value}</b><small>${esc(score.unit)}</small></div>
    ${r.id === selfId ? "" : `<button type="button" class="btn ghost small rank-pm" data-pm="${r.id}" data-pm-name="${esc(r.username)}">PM</button>`}
  </article>`;
}

async function loadRanks() {
  const host = $("rank-box");
  if (!host) return;
  try {
    const data = await getRanks();
    const cat = state.rankCategory || "all";
    const ranks = cat === "all" ? (data.ranks || []) : (data.categories?.[cat] || data.ranks || []);
    const selfId = state.snap.empire.id;
    const selfIndex = ranks.findIndex((r) => r.id === selfId);
    const self = selfIndex >= 0 ? ranks[selfIndex] : null;
    const pin = self && selfIndex > 2 ? `<div class="rank-you">${rankCardHtml(self, selfIndex, selfId, cat)}</div>` : "";
    host.innerHTML = `${pin}<div class="rank-list">${ranks.map((r, i) => rankCardHtml(r, i, selfId, cat)).join("") || `<p class="muted">Noch keine Einträge.</p>`}</div>`;
    rootRankTabs(host);
    host.querySelectorAll("[data-open-ally]").forEach((b) =>
      b.addEventListener("click", () => {
        openAllianceProfile(Number(b.dataset.openAlly));
      })
    );
    host.querySelectorAll("[data-profile]").forEach((b) =>
      b.addEventListener("click", () => openEmpireProfile(Number(b.dataset.profile)))
    );
    host.querySelectorAll("[data-pm]").forEach((b) =>
      b.addEventListener("click", () => openMailCompose(Number(b.dataset.pm), b.dataset.pmName))
    );
  } catch (err) {
    host.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

function rootRankTabs(host) {
  document.querySelectorAll("#rank-tabs [data-rank]").forEach((tab) => {
    tab.classList.toggle("on", tab.dataset.rank === (state.rankCategory || "all"));
    tab.onclick = () => {
      state.rankCategory = tab.dataset.rank;
      document.querySelectorAll("#rank-tabs .tab").forEach((item) => item.classList.toggle("on", item === tab));
      loadRanks();
    };
  });
}

function bubbleHtml(m, selfId, canMod) {
  const mine = m.fromId === selfId || m.empireId === selfId;
  const orig =
    m.translated && m.original && m.original !== m.body
      ? `<div class="chat-orig">Original (${esc((m.lang || "").toUpperCase())}): ${esc(m.original)}</div>`
      : m.failed
        ? `<div class="chat-orig">Übersetzung nicht verfügbar</div>`
        : "";
  const tools =
    canMod && !mine && m.id
      ? `<div class="chat-mod">
          <button type="button" class="btn ghost small" data-chat-del="${m.id}">Löschen</button>
          <button type="button" class="btn ghost small" data-mod-empire="${m.empireId || m.fromId}">Sperren</button>
        </div>`
      : "";
  return `<article class="chat-msg ${mine ? "mine" : ""}">
    <img class="avatar-sm" src="${esc(m.avatar)}" alt="" />
    <div>
      <header><b style="color:${esc(m.color || "#3ee8c4")}">${esc(m.username || m.name)}</b>${m.vip ? ` <span class="vip-pill">Pass</span>` : ""}${m.signet ? ` <span class="signet-pill">◆</span>` : ""} <time>${when(m.createdAt)}</time>${m.translated ? ` <span class="tag-pill">übersetzt</span>` : ""}</header>
      <p>${esc(m.body)}</p>
      ${orig}
      ${tools}
    </div>
  </article>`;
}

let chatPoll = 0;
function stopChatPoll() {
  if (chatPoll) clearInterval(chatPoll);
  chatPoll = 0;
}

async function loadChatLog() {
  const log = $("chat-log");
  if (!log) return;
  const data = await api("/chat?channel=" + encodeURIComponent(state.chatChannel || "global"));
  const selfId = state.snap.empire.id;
  const canMod = !!(data.canMod || state.snap.user.canMod);
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  log.innerHTML = data.messages.length
    ? data.messages.map((m) => bubbleHtml(m, selfId, canMod)).join("")
    : `<p class="muted">Noch keine Funksprüche auf diesem Kanal.</p>`;
  log.querySelectorAll("[data-chat-del]").forEach((b) => {
    b.onclick = async () => {
      try {
        await api("/mod/chat/delete", { method: "POST", body: { id: Number(b.dataset.chatDel) } });
        await loadChatLog();
      } catch (err) {
        toast(err.message, true);
      }
    };
  });
  log.querySelectorAll("[data-mod-empire]").forEach((b) => {
    b.onclick = () => openSanctionSheet(Number(b.dataset.modEmpire));
  });
  if (near || log.dataset.boot === "1") {
    log.scrollTop = log.scrollHeight;
    log.dataset.boot = "0";
  }
  if (data.unreadChat != null) {
    /* keep */
  }
  return data;
}

async function bootChat() {
  const host = $("chat-root");
  if (!host) return;
  stopChatPoll();
  try {
    const data = await api("/chat?channel=" + encodeURIComponent(state.chatChannel || "global"));
    const ch = data.channel || "global";
    state.chatChannel = ch;
    const tabs = (data.channels || [])
      .map(
        (c) =>
          `<button class="tab ${c.id === ch ? "on" : ""}" data-chat-ch="${c.id}" ${c.locked ? "disabled" : ""} type="button">${esc(c.name)}</button>`
      )
      .join("");
    const hint = (data.channels || []).find((c) => c.id === ch)?.blurb || "";
    host.innerHTML = `<div class="section-title"><h2>Funknetz</h2>
        <span class="muted">${data.translate ? "Auto-Übersetzung an" : "Originalsprache"} · ${esc((data.langs || {})[data.lang] || data.lang)}</span></div>
      <div class="filters" id="chat-tabs">${tabs}</div>
      <p class="hint">${esc(hint)} ${data.alliance && ch === "alliance" ? "· [" + esc(data.alliance.tag) + "]" : ""} Nachrichten in einer anderen Sprache werden in deine Sprache übersetzt.</p>
      <div id="chat-log" class="chat-log panel" data-boot="1"></div>
      <form id="chat-form" class="chat-form">
        <input id="chat-input" maxlength="240" autocomplete="off" placeholder="Funkspruch…">
        <button class="btn primary" type="submit">Senden</button>
      </form>`;
    await loadChatLog();
    host.querySelectorAll("[data-chat-ch]").forEach((tab) => {
      tab.onclick = () => {
        if (tab.disabled) return;
        state.chatChannel = tab.dataset.chatCh;
        bootChat();
      };
    });
    const form = host.querySelector("#chat-form");
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const input = host.querySelector("#chat-input");
      const body = input.value.trim();
      if (!body) return;
      try {
        await api("/chat", { method: "POST", body: { channel: state.chatChannel, body } });
        input.value = "";
        await loadChatLog();
        const log = $("chat-log");
        if (log) log.scrollTop = log.scrollHeight;
      } catch (err) {
        toast(err.message, true);
      }
    };
    chatPoll = setInterval(() => {
      if (state.view === "chat") loadChatLog().catch(() => {});
      else stopChatPoll();
    }, 2800);
  } catch (err) {
    host.innerHTML = `<p class="danger">${esc(err.message)}</p>`;
  }
}

function sanctionFormHtml(opts = {}) {
  const durations = [
    ["1h", "1 Stunde"],
    ["6h", "6 Stunden"],
    ["1d", "1 Tag"],
    ["3d", "3 Tage"],
    ["7d", "7 Tage"],
    ["30d", "30 Tage"],
    ["perm", "Dauerhaft"],
  ];
  return `<div class="stack">
      <label>Art
        <select id="mod-kind">
          <option value="mute">Funk-Sperre (Chat + PN)</option>
          <option value="ban">Account-Sperre (Login)</option>
        </select>
      </label>
      <label>Dauer
        <select id="mod-dur">${durations.map(([id, n]) => `<option value="${id}" ${id === "1d" ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>
      <label>Grund<input id="mod-reason" maxlength="180" placeholder="Regelverstoß…" value="${esc(opts.reason || "")}"></label>
    </div>`;
}

function openSanctionSheet(empireId, userId) {
  showModal(`<div class="sheet panel" style="max-width:420px">
    <h2 style="margin:0 0 10px;font-size:14px">Sperre verhängen</h2>
    ${sanctionFormHtml()}
    <div class="row" style="margin-top:14px">
      <button class="btn ghost" id="mod-cancel" type="button">Abbrechen</button>
      <button class="btn danger" id="mod-go" type="button">Sperren</button>
    </div>
  </div>`);
  document.getElementById("mod-cancel").onclick = hideModal;
  document.getElementById("mod-go").onclick = async () => {
    try {
      const out = await api("/mod/sanction", {
        method: "POST",
        body: {
          empireId: empireId || 0,
          userId: userId || 0,
          kind: document.getElementById("mod-kind").value,
          duration: document.getElementById("mod-dur").value,
          reason: document.getElementById("mod-reason").value,
        },
      });
      hideModal();
      toast(`${out.username}: ${out.kind === "mute" ? "Funk" : "Account"} gesperrt (${out.label})`);
      if (state.view === "moderation") bootModeration();
      if (state.view === "chat") loadChatLog().catch(() => {});
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function playerRow(p) {
  const flags = [
    p.isAdmin ? "Admin" : "",
    p.isMod ? "Mod" : "",
    p.banned ? `Ban ${p.banLabel}` : "",
    p.muted ? `Mute ${p.muteLabel}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<tr>
    <td><b>${esc(p.username)}</b><div class="muted">${esc(p.empireName || "—")}</div></td>
    <td>${fmt(p.score)}</td>
    <td class="muted">${esc(flags || "—")}</td>
    <td class="mod-actions">
      ${p.banned ? `<button class="btn ghost small" data-lift="ban" data-user="${p.userId}">Ban aufheben</button>` : `<button class="btn danger small" data-sanction="${p.userId}">Sperren</button>`}
      ${p.muted ? `<button class="btn ghost small" data-lift="mute" data-user="${p.userId}">Funk frei</button>` : ""}
      ${state.snap.user.isAdmin && !p.isAdmin ? `<button class="btn ghost small" data-staff="${p.userId}" data-on="${p.isMod ? 0 : 1}">${p.isMod ? "Mod entziehen" : "Zum Mod machen"}</button>` : ""}
      ${state.snap.user.isAdmin ? `
        <button class="btn ghost small" data-grant="nex" data-user="${p.userId}" data-amt="100">+100 Nex</button>
        <button class="btn ghost small" data-grant="vip" data-user="${p.userId}" data-amt="7">+7d Pass</button>
        <button class="btn ghost small" data-grant="kit" data-user="${p.userId}">Kit</button>
        <button class="btn ghost small" data-grant="fighters" data-user="${p.userId}" data-amt="5">+5 Jäger</button>` : ""}
    </td>
  </tr>`;
}

async function bootModeration() {
  const host = $("mod-root");
  if (!host) return;
  try {
    const data = await api("/mod/overview");
    const isAdmin = !!state.snap.user.isAdmin;
    const adminData = isAdmin ? await api("/admin/overview").catch(() => null) : null;
    const staff = (data.staff || []).map(playerRow).join("");
    const sanctions = (data.sanctions || []).map(playerRow).join("");
    const chatRows = (data.chat || [])
      .map(
        (m) => `<tr>
          <td class="muted">${esc(m.channel)}</td>
          <td><b>${esc(m.username)}</b></td>
          <td>${esc(m.body)}</td>
          <td><button class="btn ghost small" data-chat-del="${m.id}">Löschen</button></td>
        </tr>`
      )
      .join("");
    const logRows = (data.log || [])
      .map(
        (l) => `<tr>
          <td class="muted">${when(l.created_at)}</td>
          <td>${esc(l.actor)}</td>
          <td>${esc(l.action)}</td>
          <td>${esc(l.target || "—")} · ${esc(l.detail || "")}</td>
        </tr>`
      )
      .join("");
    const st = adminData?.stats || {};
    const groups = adminData?.settings?.groups || [];
    const settingsHtml = groups
      .map((g) => {
        const fields = (g.fields || [])
          .map((f) => {
            if (f.type === "bool") {
              return `<label class="row admin-field"><span>${esc(f.label)}</span><input type="checkbox" name="${esc(f.key)}" ${f.value ? "checked" : ""}></label>`;
            }
            if (f.type === "text") {
              return `<label class="admin-field">${esc(f.label)}<input name="${esc(f.key)}" maxlength="${f.key === "donationUrl" ? 1000 : 280}" value="${esc(f.value || "")}" placeholder="${esc(f.hint || "")}"></label>`;
            }
            return `<label class="admin-field">${esc(f.label)}<input name="${esc(f.key)}" type="number" min="${f.min ?? 0}" max="${f.max ?? 999999}" value="${f.value}"></label>`;
          })
          .join("");
        return `<fieldset class="admin-set"><legend>${esc(g.name)}</legend>${fields}</fieldset>`;
      })
      .join("");
    const adminBlock = isAdmin
      ? `<div class="admin-stats">
          <div class="stat panel"><em>Online</em><strong>${st.online || 0}</strong></div>
          <div class="stat panel"><em>Imperien</em><strong>${st.empires || 0}</strong></div>
          <div class="stat panel"><em>Welten</em><strong>${st.planets || 0}</strong></div>
          <div class="stat panel"><em>Systeme</em><strong>${st.systems || 0}</strong></div>
          <div class="stat panel"><em>Flotten</em><strong>${st.fleets || 0}</strong></div>
          <div class="stat panel"><em>Piraten</em><strong>${st.threat || 1}</strong><small>${st.pirates || 0} Horste</small></div>
          <div class="stat panel"><em>Beta</em><strong>${st.betaRegistrations || 0}</strong><small>Registrierungen</small></div>
        </div>
        <section class="panel" style="padding:14px;margin-bottom:14px;max-width:1100px">
          <h3 style="margin:0 0 10px;font-size:13px">Welt-Einstellungen</h3>
          <p class="hint">Sofort wirksam, ohne Deploy. Kampf- und Premium-Werte gelten für alle.</p>
          <section class="panel" id="registration-admin">Registrierungen werden geladen …</section><form id="admin-settings" class="admin-form">${settingsHtml}<button class="btn primary" type="submit">Einstellungen speichern</button></form>
        </section>
        <section class="panel" style="padding:14px;margin-bottom:14px;max-width:1100px">
          <h3 style="margin:0 0 10px;font-size:13px">Sofort-Aktionen</h3>
          <div class="row" style="flex-wrap:wrap;gap:8px;justify-content:flex-start">
            <button class="btn" type="button" data-world="rift">Riss 3 Std.</button>
            <button class="btn" type="button" data-world="expand">Galaxie erweitern</button>
            <button class="btn" type="button" data-world="pirate">Piraten +1</button>
          </div>
          <form id="admin-broadcast" class="row" style="margin-top:10px;gap:8px;justify-content:flex-start">
            <input id="admin-bc" maxlength="220" placeholder="Funk an die Galaxie…" style="flex:1;min-width:180px">
            <button class="btn primary" type="submit">Senden</button>
          </form>
        </section>`
      : "";
    host.innerHTML = `<div class="section-title"><h2>${isAdmin ? "Admin-Zentrale" : "Moderation"}</h2><span class="muted">${isAdmin ? "Einstellungen & Spieler" : "Moderator"}</span></div>
      <p class="hint">${isAdmin ? "Weltwerte, Gutschriften und Funk — ohne Code-Änderung." : "Funk- und Account-Sperren, Chat löschen."}</p>
      ${adminBlock}
      <section class="panel" style="padding:14px;margin-bottom:14px;max-width:1100px">
        <h3 style="margin:0 0 8px;font-size:13px">Spieler suchen</h3>
        <form id="mod-search" class="row" style="gap:8px;justify-content:flex-start">
          <input id="mod-q" maxlength="24" placeholder="Commander-ID oder Imperium…" style="min-width:200px">
          <button class="btn primary" type="submit">Suchen</button>
        </form>
        <div id="mod-results" style="margin-top:10px"></div>
      </section>
      <div class="section-title"><h2>Team</h2></div>
      <div class="table-wrap panel" style="margin-bottom:14px;max-width:1100px"><table class="table"><thead><tr><th>Spieler</th><th>Punkte</th><th>Status</th><th></th></tr></thead><tbody>${staff || `<tr><td class="muted" colspan="4">Niemand.</td></tr>`}</tbody></table></div>
      <div class="section-title"><h2>Aktive Sperren</h2></div>
      <div class="table-wrap panel" style="margin-bottom:14px;max-width:1100px"><table class="table"><thead><tr><th>Spieler</th><th>Punkte</th><th>Status</th><th></th></tr></thead><tbody>${sanctions || `<tr><td class="muted" colspan="4">Keine Sperren.</td></tr>`}</tbody></table></div>
      <div class="section-title"><h2>Letzter Funk</h2></div>
      <div class="table-wrap panel" style="margin-bottom:14px;max-width:1100px"><table class="table"><thead><tr><th>Kanal</th><th>Von</th><th>Text</th><th></th></tr></thead><tbody>${chatRows || `<tr><td class="muted" colspan="4">Leer.</td></tr>`}</tbody></table></div>
      <div class="section-title"><h2>Protokoll</h2></div>
      <div class="table-wrap panel" style="max-width:1100px"><table class="table"><thead><tr><th>Zeit</th><th>Von</th><th>Aktion</th><th>Detail</th></tr></thead><tbody>${logRows || `<tr><td class="muted" colspan="4">—</td></tr>`}</tbody></table></div>`;
    const bindRows = (root) => {
      root.querySelectorAll("[data-sanction]").forEach((b) => {
        b.onclick = () => openSanctionSheet(0, Number(b.dataset.sanction));
      });
      root.querySelectorAll("[data-lift]").forEach((b) => {
        b.onclick = async () => {
          try {
            const out = await api("/mod/lift", { method: "POST", body: { userId: Number(b.dataset.user), kind: b.dataset.lift } });
            toast(`${out.username}: Sperre aufgehoben`);
            bootModeration();
          } catch (err) {
            toast(err.message, true);
          }
        };
      });
      root.querySelectorAll("[data-staff]").forEach((b) => {
        b.onclick = async () => {
          try {
            const out = await api("/mod/moderator", {
              method: "POST",
              body: { userId: Number(b.dataset.staff), on: b.dataset.on === "1" },
            });
            toast(`${out.username}: ${out.isMod ? "ist Moderator" : "kein Moderator mehr"}`);
            bootModeration();
          } catch (err) {
            toast(err.message, true);
          }
        };
      });
      root.querySelectorAll("[data-chat-del]").forEach((b) => {
        b.onclick = async () => {
          try {
            await api("/mod/chat/delete", { method: "POST", body: { id: Number(b.dataset.chatDel) } });
            toast("Nachricht gelöscht");
            bootModeration();
          } catch (err) {
            toast(err.message, true);
          }
        };
      });
      root.querySelectorAll("[data-grant]").forEach((b) => {
        b.onclick = async () => {
          try {
            const out = await api("/admin/player", {
              method: "POST",
              body: { userId: Number(b.dataset.user), action: b.dataset.grant, amount: Number(b.dataset.amt || 0) },
            });
            toast(`${out.username}: ${out.detail}`);
          } catch (err) {
            toast(err.message, true);
          }
        };
      });
    };
    bindRows(host);
    const registrations=host.querySelector("#registration-admin");
    if(registrations) api("/admin/registrations").then(data=>{
      if(!registrations.isConnected) return;
      registrations.innerHTML=`<h3>Registrierungen zur Freigabe</h3><p>Freigabe erfolgt über den Link in der Admin-E-Mail. Empfänger unter Closed Beta eintragen.</p>${data.registrations.map(r=>`<div class="panel"><b>${esc(r.username)}</b> · ${esc(r.email)}<p>${r.status==="approved"?"Freigegeben":"Wartet auf Freigabe"} · Mail: ${esc(r.mail_status)}</p>${r.mail_status==="failed"?`<p class="error">${esc(r.mail_error)}</p>`:""}${r.status==="pending"?`<button class="btn" data-resend-registration="${r.id}">Freigabe-Mail erneut senden</button>`:""}</div>`).join("")||"Keine Registrierungen."}`;
      registrations.querySelectorAll("[data-resend-registration]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(`/admin/registrations/${b.dataset.resendRegistration}/resend`,{method:"POST",body:{}});toast("Freigabe-Mail gesendet");bootModeration();}catch(err){toast(err.message,true);b.disabled=false;}});
    }).catch(err=>{registrations.textContent=err.message;});
    const setForm = host.querySelector("#admin-settings");
    if (setForm) {
      setForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const patch = {};
        for (const el of setForm.querySelectorAll("[name]")) {
          patch[el.name] = el.type === "checkbox" ? el.checked : el.value;
        }
        try {
          await api("/admin/settings", { method: "POST", body: patch });
          toast("Einstellungen gespeichert");
          await refresh();
          bootModeration();
        } catch (err) {
          toast(err.message, true);
        }
      };
    }
    host.querySelectorAll("[data-world]").forEach((b) => {
      b.onclick = async () => {
        try {
          const out = await api("/admin/world", { method: "POST", body: { action: b.dataset.world } });
          toast(out.detail || "OK");
          bootModeration();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
    const bc = host.querySelector("#admin-broadcast");
    if (bc) {
      bc.onsubmit = async (ev) => {
        ev.preventDefault();
        const body = host.querySelector("#admin-bc")?.value.trim();
        if (!body) return;
        try {
          const out = await api("/admin/world", { method: "POST", body: { action: "broadcast", body } });
          toast(out.detail || "Gesendet");
          host.querySelector("#admin-bc").value = "";
        } catch (err) {
          toast(err.message, true);
        }
      };
    }
    const form = host.querySelector("#mod-search");
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const q = host.querySelector("#mod-q").value.trim();
      const box = host.querySelector("#mod-results");
      if (q.length < 1) return;
      try {
        const { players } = await api("/mod/search?q=" + encodeURIComponent(q));
        box.innerHTML = players?.length
          ? `<table class="table"><thead><tr><th>Spieler</th><th>Punkte</th><th>Status</th><th></th></tr></thead><tbody>${players.map(playerRow).join("")}</tbody></table>`
          : `<p class="muted">Kein Treffer.</p>`;
        bindRows(box);
      } catch (err) {
        toast(err.message, true);
      }
    };
  } catch (err) {
    host.innerHTML = `<p class="danger">${esc(err.message)}</p>`;
  }
}

async function bootMail() {
  const host = $("mail-root");
  if (!host) return;
  try {
    const { threads } = await api("/mail");
    const list = (threads || [])
      .map(
        (t) => `<button type="button" class="mail-row ${state.mailPeer === t.peerId ? "on" : ""}" data-mail-peer="${t.peerId}">
          <img class="avatar-sm" src="${esc(t.avatar)}" alt="" />
          <span><b>${esc(t.username)}</b> · ${esc(t.name)}
            <div class="muted">${esc(t.preview)}</div></span>
          ${t.unread ? `<i class="mail-unread">${t.unread}</i>` : ""}
        </button>`
      )
      .join("");
    host.innerHTML = `<aside class="panel mail-list">
        <button class="btn primary small" id="mail-new" type="button">Neue PM</button>
        ${list || `<p class="muted" style="padding:8px">Kein Funk. Schreibe über die Rangliste oder „Neue PM“.</p>`}
      </aside>
      <div id="mail-thread" class="panel mail-thread"><p class="muted">Konversation wählen.</p></div>`;
    host.querySelectorAll("[data-mail-peer]").forEach((b) => {
      b.onclick = () => openMailThread(Number(b.dataset.mailPeer));
    });
    const neu = host.querySelector("#mail-new");
    if (neu) neu.onclick = () => openMailCompose();
    if (state.mailPeer) await openMailThread(state.mailPeer);
  } catch (err) {
    host.innerHTML = `<p class="danger">${esc(err.message)}</p>`;
  }
}

async function openMailThread(peerId) {
  state.mailPeer = peerId;
  const box = $("mail-thread");
  if (!box) return;
  try {
    const data = await api("/mail/" + peerId);
    const selfId = state.snap.empire.id;
    box.innerHTML = `<div class="section-title"><h3 style="margin:0;font-size:13px">${esc(data.peer.username)} · ${esc(data.peer.name)}</h3></div>
      <div id="mail-log" class="chat-log">${data.messages.map((m) => bubbleHtml(m, selfId)).join("") || `<p class="muted">Noch keine Nachrichten.</p>`}</div>
      <form id="mail-reply" class="chat-form">
        <input id="mail-input" maxlength="800" autocomplete="off" placeholder="Antwort…">
        <button class="btn primary" type="submit">Senden</button>
      </form>`;
    const log = $("mail-log");
    if (log) log.scrollTop = log.scrollHeight;
    const form = $("mail-reply");
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const input = $("mail-input");
      const body = input.value.trim();
      if (!body) return;
      try {
        await api("/mail", { method: "POST", body: { toId: peerId, body } });
        input.value = "";
        await openMailThread(peerId);
      } catch (err) {
        toast(err.message, true);
      }
    };
  } catch (err) {
    box.innerHTML = `<p class="danger">${esc(err.message)}</p>`;
  }
}

function openMailCompose(toId, username) {
  showModal(`<div class="sheet panel" style="padding:16px;min-width:min(420px,100%)">
    <h2 style="margin:0 0 10px;font-size:15px">Neue Privatnachricht</h2>
    <form id="pm-form" class="stack">
      <label>Commander-ID<input name="username" maxlength="16" value="${esc(username || "")}" ${toId ? "readonly" : ""} required></label>
      <label>Betreff (optional)<input name="subject" maxlength="80"></label>
      <label>Nachricht<textarea name="body" rows="5" maxlength="800" required></textarea></label>
      <div class="row"><button class="btn ghost" type="button" id="pm-cancel">Abbrechen</button>
        <button class="btn primary" type="submit">Senden</button></div>
    </form>
  </div>`);
  $("pm-cancel").onclick = hideModal;
  $("pm-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      const data = await api("/mail", {
        method: "POST",
        body: { toId: toId || undefined, username: fd.get("username"), subject: fd.get("subject"), body: fd.get("body") },
      });
      hideModal();
      toast("PM gesendet.");
      state.newsTab = "mail";
      state.mailPeer = data.peer?.id || toId;
      setView("reports");
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function bindSettings(root) {
  root.querySelectorAll("[data-avatar]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/avatar", { method: "POST", body: { preset: b.dataset.avatar } })))
  );
  const file = root.querySelector("#avatar-file");
  if (file) {
    file.onchange = () => {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 450000) {
        toast("Bild zu groß (max. 450 KB).", true);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => act(() => api("/avatar", { method: "POST", body: { image: reader.result } }));
      reader.readAsDataURL(f);
    };
  }
  root.querySelectorAll("[data-species]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.species === state.snap.empire.species) return;
      act(() => api("/species", { method: "POST", body: { id: b.dataset.species, planetId: state.snap.planet.id } }));
    })
  );
  const form = root.querySelector("#settings-form");
  if (form) {
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      act(() =>
        api("/settings", {
          method: "POST",
          body: {
            empireName: fd.get("empireName"),
            color: fd.get("color"),
            sound: form.sound.checked,
            notify: form.notify.checked,
            locale: fd.get("locale") || "de",
            translate: form.translate?.checked !== false,
            password: fd.get("password") || "",
            oldPassword: fd.get("oldPassword") || "",
          },
        })
      );
    };
  }
  const deleteButton = root.querySelector("#delete-account");
  if (deleteButton) {
    deleteButton.onclick = async () => {
      if (!window.confirm("Account wirklich dauerhaft löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")) return;
      const words = { de: "Löschen", en: "Delete", it: "Elimina", fr: "Supprimer", es: "Eliminar", pl: "Usuń", pt: "Excluir", ru: "Удалить", nl: "Verwijderen", cs: "Smazat", tr: "Sil" };
      const locale = state.snap.empire.locale || "de";
      const word = words[locale] || words.de;
      showModal(`<div class="sheet panel" style="padding:16px;min-width:min(420px,100%)">
        <h2 style="margin:0 0 10px;font-size:15px">Account endgültig löschen</h2>
        <p class="hint">Gib zur zweiten Bestätigung <b>${esc(word)}</b> ein und bestätige mit deinem Passwort.</p>
        <form id="delete-account-form" class="stack">
          <label>${esc(word)}<input name="confirmation" autocomplete="off" required></label>
          <label>Aktuelles Passwort<input name="password" type="password" autocomplete="current-password" required></label>
          <div class="row"><button class="btn ghost" type="button" id="delete-cancel">Abbrechen</button><button class="btn danger" type="submit">Endgültig löschen</button></div>
        </form>
      </div>`);
      $("delete-cancel").onclick = hideModal;
      $("delete-account-form").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
          await api("/account/delete", { method: "POST", body: { confirmation: form.confirmation.value, password: form.password.value } });
          hideModal();
          window.location.href = "/";
        } catch (err) {
          toast(err.message, true);
        }
      };
    };
  }
}

async function openAllianceProfile(id) {
  try {
    const { alliance } = await getAlliance(id);
    const people = (alliance.members || [])
      .map(
        (m) => `<div class="roster-row">
          <img class="avatar-sm" src="${esc(m.avatar)}" alt="" />
          <span>${esc(m.username)} · ${esc(m.name)}</span>
          <b>${esc(m.rankName || m.rank)}</b>
        </div>`
      )
      .join("");
    const rec = alliance.recruit ? `<p class="hint">${esc(alliance.recruit)}</p>` : "";
    const web = alliance.website
      ? `<p class="muted">Web: ${esc(alliance.website)}</p>`
      : "";
    const joinHint = alliance.openJoin
      ? `<span class="chip ok">Offener Beitritt · ab Level ${alliance.minLevel || 1}</span>`
      : `<span class="chip">Bewerbung · ab Level ${alliance.minLevel || 1}</span>`;
    showModal(`<div class="sheet panel ally-sheet">
      <img class="ally-banner" src="${esc(alliance.banner)}" alt="" />
      <h2 style="color:${alliance.color};margin:12px 0 4px">[${esc(alliance.tag)}] ${esc(alliance.name)}</h2>
       <p class="muted">${fmt(alliance.score)} Punkte · ${alliance.members.length}/${alliance.maxMembers || 15} Mitglieder</p>
      <div class="chips" style="margin:8px 16px">${joinHint}</div>
      ${web}
      <p>${esc(alliance.lore || alliance.blurb || "Kein Manifest.")}</p>
      ${rec}
      <div class="intel-block"><h4>Besatzung</h4>${people}</div>
      <div class="row" style="margin-top:14px">
        <button class="btn ghost" id="ally-close">Schließen</button>
        ${alliance.mine ? `<button class="btn primary" id="ally-manage">Zur Allianz</button>` : ""}
      </div>
    </div>`);
    document.getElementById("ally-close").onclick = hideModal;
    const mg = document.getElementById("ally-manage");
    if (mg)
      mg.onclick = () => {
        hideModal();
        state.allianceFocus = id;
        setView("alliance");
      };
  } catch (err) {
    toast(err.message, true);
  }
}

async function bootAlliance() {
  const host = $("alliance-root");
  if (!host) return;
  try {
    const { alliances, mine } = await getAlliances();
    const focusId = state.allianceFocus || mine?.id || alliances[0]?.id;
    state.allianceFocus = null;
    let detail = null;
    if (focusId) {
      try {
        detail = (await getAlliance(focusId)).alliance;
      } catch {
        detail = null;
      }
    }
    const list = alliances
      .map(
        (a) => `<button type="button" class="ally-row ${detail && a.id === detail.id ? "on" : ""}" data-ally-profile="${a.id}">
          <img class="ally-thumb" src="${esc(a.banner)}" alt="" />
          <span><b style="color:${a.color}">[${esc(a.tag)}]</b> ${esc(a.name)}<div class="muted">${a.members}/${a.maxMembers || 15} · ${fmt(a.score)} · ${a.openJoin ? "offen" : "Bewerbung"}</div></span>
        </button>`
      )
      .join("");
    let body = `<p class="muted">Noch keine Allianzen. Gründe die erste.</p>`;
    if (detail) {
      const members = detail.members
        .map(
          (m) => `<tr>
            <td><button type="button" class="linkish" data-profile="${m.empireId}"><img class="avatar-sm" src="${esc(m.avatar)}" alt="" /></button></td>
            <td><button type="button" class="linkish" data-profile="${m.empireId}">${esc(m.username)}</button></td>
            <td>${esc(m.name)}</td>
            <td>${esc(m.rankName || m.rank)}</td>
            <td>${medalTinyRow(m.medals)}</td>
            <td>${fmt(m.score)}</td>
            <td>${
              detail.perms?.rank && m.rank !== "leader"
                ? `<select data-set-rank="${m.empireId}">
                    ${["coleader", "diplomat", "officer", "member"]
                      .filter((r) => detail.ranks?.[r])
                      .map(
                        (r) =>
                          `<option value="${r}" ${m.rank === r ? "selected" : ""}>${esc(detail.ranks[r].name)}</option>`
                      )
                      .join("")}
                  </select>`
                : ""
            } ${detail.perms?.kick && m.rank !== "leader" ? `<button class="btn ghost small" data-kick="${m.empireId}">Kick</button>` : ""} ${
              m.empireId !== state.snap.empire.id
                ? `<button class="btn ghost small" data-pm="${m.empireId}" data-pm-name="${esc(m.username)}">PM</button>`
                : ""
            }</td>
          </tr>`
        )
        .join("");
      const apps = (detail.apps || [])
        .map(
          (a) => `<div class="row" style="margin:6px 0">
            <span><img class="avatar-sm" src="${esc(a.avatar)}" alt="" /> ${esc(a.username)} · ${esc(a.name)}</span>
            <span>
              <button class="btn primary small" data-decide="${a.empireId}" data-ok="1">Annehmen</button>
              <button class="btn ghost small" data-decide="${a.empireId}" data-ok="0">Ablehnen</button>
            </span>
          </div>`
        )
        .join("");
      const settings = detail.perms?.edit
        ? `<details class="ally-settings panel" open>
            <summary>Allianz-Einstellungen</summary>
            <div class="ally-set-grid">
              <fieldset class="stack">
                <legend>Profil</legend>
                <label>Kurztext<textarea id="ally-blurb" rows="2" maxlength="140">${esc(detail.blurb)}</textarea></label>
                <label>Manifest<textarea id="ally-lore" rows="5" maxlength="800">${esc(detail.lore || "")}</textarea></label>
                <label>Website / Discord<input id="ally-web" maxlength="80" value="${esc(detail.website || "")}" placeholder="https://…"></label>
                <label>Farbe <input id="ally-color" type="color" value="${esc(detail.color || "#3ee8c4")}"></label>
                <div class="avatar-grid" id="banner-picks">
                  ${(detail.banners || ["b1", "b2", "b3", "b4"])
                    .map(
                      (id) =>
                        `<button type="button" class="banner-pick ${detail.bannerKey === id ? "on" : ""}" data-banner="${id}">
                          <img src="/assets/alliances/${id}.jpg" alt="" />
                        </button>`
                    )
                    .join("")}
                </div>
                <label class="btn ghost small">Eigenes Banner<input id="banner-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
              </fieldset>
              <fieldset class="stack">
                <legend>Rekrutierung</legend>
                <label class="row"><input type="checkbox" id="ally-open" ${detail.openJoin ? "checked" : ""}> Offener Beitritt (ohne Bewerbung)</label>
                <label>Mindestlevel<input id="ally-minlv" type="number" min="1" max="60" value="${detail.minLevel || 1}"></label>
                <div class="muted">Mitgliederlimit ${detail.maxMembers || 15} / ${detail.memberCapMax || 30} (Start 15, Maximum 30)</div>
                <label>Rekrutierungstext<textarea id="ally-recruit" rows="3" maxlength="280">${esc(detail.recruit || "")}</textarea></label>
              </fieldset>
              <fieldset class="stack">
                <legend>Intern</legend>
                <label>Nachricht des Tages<textarea id="ally-motd" rows="2" maxlength="180">${esc(detail.motd || "")}</textarea></label>
                <label>Internes Bulletin<textarea id="ally-bulletin" rows="5" maxlength="800">${esc(detail.bulletin || "")}</textarea></label>
              </fieldset>
              <fieldset class="stack">
                <legend>Führung</legend>
                ${
                  detail.perms.transfer
                    ? `<label>Anführer übergeben
                        <select id="ally-transfer">
                          <option value="">— Mitglied wählen —</option>
                          ${detail.members
                            .filter((m) => m.rank !== "leader")
                            .map((m) => `<option value="${m.empireId}">${esc(m.username)} · ${esc(m.name)}</option>`)
                            .join("")}
                        </select>
                      </label>
                      <button class="btn ghost small" id="ally-do-transfer" type="button">Übergeben</button>`
                    : ""
                }
                <button class="btn primary small" id="ally-save" type="button">Einstellungen speichern</button>
                ${detail.perms.edit && detail.canExpand ? `<button class="btn ghost small" data-nex="alliance_expand" data-planet-id="${state.snap.planet?.id || ""}">+5 Mitglieder (30 Nex)</button>` : ""}
                ${detail.perms.edit && !detail.canExpand ? `<div class="muted">Mitglieder-Maximum ${detail.memberCapMax || 30} erreicht</div>` : ""}
                ${detail.perms.disband ? `<button class="btn danger small" id="ally-disband" type="button">Allianz auflösen</button>` : ""}
              </fieldset>
            </div>
          </details>`
        : "";
      const joinBlock = detail.mine
        ? detail.perms?.edit
          ? ""
          : `<button class="btn danger small" id="ally-leave">Allianz verlassen</button>`
        : `<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
            ${detail.recruit ? `<p class="hint" style="flex:1 1 100%">${esc(detail.recruit)}</p>` : ""}
            ${
              detail.openJoin
                ? `<button class="btn primary" id="ally-apply">Beitreten (offen, Level ${detail.minLevel || 1})</button>`
                : `<input id="ally-msg" maxlength="120" placeholder="Bewerbungstext">
                   <button class="btn primary" id="ally-apply">Bewerben (ab Level ${detail.minLevel || 1})</button>`
            }
          </div>`;
      body = `<div class="panel" style="padding:14px">
        <div class="section-title"><h2 style="color:${detail.color}">[${esc(detail.tag)}] ${esc(detail.name)}</h2>
           <span class="muted">${fmt(detail.score)} Punkte · ${detail.members.length}/${detail.maxMembers || 15} Mitglieder</span></div>
        ${detail.motd && detail.mine ? `<p class="ally-motd">${esc(detail.motd)}</p>` : ""}
        <p>${esc(detail.blurb || "Kein Manifest.")}</p>
        ${detail.website ? `<p class="muted">${esc(detail.website)}</p>` : ""}
        ${detail.lore ? `<p class="hint">${esc(detail.lore)}</p>` : ""}
        ${detail.mine && detail.bulletin ? `<div class="intel-block"><h4>Internes Bulletin</h4><p>${esc(detail.bulletin)}</p></div>` : ""}
        ${detail.mine ? allianceBossHtml(detail.boss) + allianceDeskHtml(detail) : ""}
        <table class="table"><thead><tr><th></th><th>Commander</th><th>Imperium</th><th>Rang</th><th>Medaillen</th><th>Punkte</th><th></th></tr></thead>
        <tbody>${members}</tbody></table>
        ${detail.perms?.apps && apps ? `<h3 style="font-size:13px">Bewerbungen</h3>${apps}` : ""}
        ${settings}
        ${joinBlock}
      </div>`;
    }
    const create = mine
      ? ""
      : `<form id="ally-create" class="panel stack" style="padding:14px;max-width:420px">
          <h3 style="margin:0;font-size:13px">Allianz gründen</h3>
          <label>Tag (2–5)<input name="tag" maxlength="5" required></label>
          <label>Name<input name="name" maxlength="24" required></label>
          <label>Manifest<textarea name="blurb" rows="2" maxlength="140"></textarea></label>
          <button class="btn primary" type="submit">Gründen</button>
        </form>`;
    const showActivity = !!(detail?.mine && state.snap?.alliance);
    const actRows = showActivity ? allianceActivityRows() : [];
    const activityHtml = showActivity
      ? `<div id="ally-activity" class="ally-activity panel">${allianceActivityTableHtml(actRows)}</div>`
      : "";
    host.innerHTML = `<div class="section-title"><h2>Allianzen${actRows.length ? ` <i class="page-badge">${actRows.length > 9 ? "9+" : actRows.length}</i>` : ""}</h2><span class="muted">${alliances.length} Bündnisse</span></div>
      <div class="ally-layout">
        <aside class="panel ally-list">${list || `<div class="muted" style="padding:10px">Keine Allianzen.</div>`}</aside>
        <div>${activityHtml}${body}${create}</div>
      </div>`;
    bindAllianceActivityClicks(host);
    bindAllianceQuickActions(host);
    bindJumps(host);
    host.querySelector("#ally-boss-launch")?.addEventListener("click", () => startAllianceBossEncounter({ detail, onDone: async () => {
      state.allianceFocus = detail.id;
      await refresh(undefined,{rerender:false});
      await bootAlliance();
    }}));
    host.querySelector("#ally-open-planet")?.addEventListener("click", () => {
      if (detail.planet?.id) jumpTo("command", detail.planet.id);
    });
    host.querySelectorAll('#ally-colonize,[data-ally-found]').forEach(b=>b.addEventListener('click',()=>{state.colonizeMode={alliance:true,sourcePlanetName:`Allianz [${detail.tag}]`};setView('galaxy');toast('Allianz-Kolonisation: freien Planeten wählen. Der Missionsdialog wählt automatisch den Allianzauftrag.');}));
    host.querySelectorAll("[data-ally-research-open]").forEach(b=>b.addEventListener("click",()=>jumpTo("research",Number(b.dataset.allyResearchOpen))));
    host.querySelector("#ally-goto-research")?.addEventListener("click", () => {
      if (detail.planet?.id) jumpTo("research", detail.planet.id);
    });
    host.querySelectorAll("[data-planet-access]").forEach((inp) => {
      inp.onchange = () =>
        act(() =>
          api("/alliances/planet-access", {
            method: "POST",
            body: { empireId: Number(inp.dataset.planetAccess), grant: inp.checked },
          }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        );
    });
    host.querySelectorAll("[data-ally-profile]").forEach((b) =>
      b.addEventListener("click", () => openAllianceProfile(Number(b.dataset.allyProfile)))
    );
    host.querySelectorAll("[data-set-rank]").forEach((sel) => {
      sel.onchange = () =>
        act(() =>
          api("/alliances/rank", {
            method: "POST",
            body: { empireId: Number(sel.dataset.setRank), rank: sel.value },
          }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        );
    });
    host.querySelectorAll("[data-banner]").forEach((b) =>
      b.addEventListener("click", () =>
        act(() =>
          api("/alliances/banner", { method: "POST", body: { preset: b.dataset.banner } }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        )
      )
    );
    const banFile = host.querySelector("#banner-file");
    if (banFile) {
      banFile.onchange = () => {
        const f = banFile.files?.[0];
        if (!f) return;
        if (f.size > 450000) {
          toast("Bild zu groß (max. 450 KB).", true);
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          act(() =>
            api("/alliances/banner", { method: "POST", body: { image: reader.result } }).then(async (snap) => {
              state.snap = snap;
              state.allianceFocus = detail.id;
              await bootAlliance();
              return snap;
            })
          );
        reader.readAsDataURL(f);
      };
    }
    const applyBtn = host.querySelector("#ally-apply");
    if (applyBtn)
      applyBtn.onclick = () =>
        act(() =>
          api("/alliances/apply", {
            method: "POST",
            body: { id: detail.id, message: host.querySelector("#ally-msg")?.value || "" },
          }).then(async (snap) => {
            state.snap = snap;
            await bootAlliance();
            return snap;
          })
        );
    host.querySelectorAll("[data-decide]").forEach((b) =>
      b.addEventListener("click", () =>
        act(() =>
          api("/alliances/decide", {
            method: "POST",
            body: { allianceId: detail.id, empireId: Number(b.dataset.decide), accept: b.dataset.ok === "1" },
          }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        )
      )
    );
    host.querySelectorAll("[data-pm]").forEach((b) =>
      b.addEventListener("click", () => openMailCompose(Number(b.dataset.pm), b.dataset.pmName))
    );
    host.querySelectorAll("[data-profile]").forEach((b) =>
      b.addEventListener("click", () => openEmpireProfile(Number(b.dataset.profile)))
    );
    host.querySelectorAll("[data-kick]").forEach((b) =>
      b.addEventListener("click", () =>
        act(() => api("/alliances/kick", { method: "POST", body: { empireId: Number(b.dataset.kick) } }).then(async (snap) => {
          state.snap = snap;
          state.allianceFocus = detail.id;
          await bootAlliance();
          return snap;
        }))
      )
    );
    const leave = host.querySelector("#ally-leave");
    if (leave) leave.onclick = () => act(() => api("/alliances/leave", { method: "POST", body: {} }));
    const disband = host.querySelector("#ally-disband");
    if (disband)
      disband.onclick = () => {
        if (confirm("Allianz wirklich auflösen?")) act(() => api("/alliances/disband", { method: "POST", body: {} }));
      };
    host.querySelectorAll("[data-nex]").forEach((b) =>
      b.addEventListener("click", () => {
        act(() =>
          api("/nex/buy", {
            method: "POST",
            body: { id: b.dataset.nex, planetId: state.snap.planet?.id },
          }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        );
      })
    );
    const save = host.querySelector("#ally-save");
    if (save)
      save.onclick = () =>
        act(() =>
          api("/alliances/update", {
            method: "POST",
            body: {
              blurb: host.querySelector("#ally-blurb")?.value || "",
              lore: host.querySelector("#ally-lore")?.value || "",
              color: host.querySelector("#ally-color")?.value || detail.color,
              website: host.querySelector("#ally-web")?.value || "",
              recruit: host.querySelector("#ally-recruit")?.value || "",
              bulletin: host.querySelector("#ally-bulletin")?.value || "",
              motd: host.querySelector("#ally-motd")?.value || "",
              openJoin: !!host.querySelector("#ally-open")?.checked,
              minLevel: Number(host.querySelector("#ally-minlv")?.value || 1),
            },
          }).then(
            async (snap) => {
              state.snap = snap;
              state.allianceFocus = detail.id;
              await bootAlliance();
              return snap;
            }
          )
        );
    const xfer = host.querySelector("#ally-do-transfer");
    if (xfer)
      xfer.onclick = () => {
        const id = Number(host.querySelector("#ally-transfer")?.value || 0);
        if (!id) {
          toast("Mitglied wählen.", true);
          return;
        }
        if (!confirm("Anführer-Rang wirklich übergeben?")) return;
        act(() =>
          api("/alliances/transfer", { method: "POST", body: { empireId: id } }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        );
      };
    const createForm = host.querySelector("#ally-create");
    if (createForm) {
      createForm.onsubmit = (ev) => {
        ev.preventDefault();
        const fd = new FormData(createForm);
        act(() =>
          api("/alliances", {
            method: "POST",
            body: { tag: fd.get("tag"), name: fd.get("name"), blurb: fd.get("blurb"), color: state.snap.empire.color },
          })
        );
      };
    }
  } catch (err) {
    host.innerHTML = `<p class="danger">${esc(err.message)}</p>`;
  }
}

function rosterHtml(map) {
  const entries = Object.entries(map || {}).filter(([, n]) => n > 0);
  if (!entries.length) return `<div class="muted">keine Schiffe</div>`;
  return entries
    .map(
      ([id, n]) => `<div class="roster-row">
        <img class="ship-art mini" src="/assets/ships/${id}.jpg" alt="" />
        <span>${esc(state.catalog.ships[id]?.name || id)}</span>
        <b>×${n}</b>
      </div>`
    )
    .join("");
}

function defenseRoster(map) {
  const entries = Object.entries(map || {}).filter(([, n]) => n > 0);
  if (!entries.length) return `<div class="muted">keine Batterien</div>`;
  return entries
    .map(
      ([id, n]) => `<div class="roster-row">
        <img class="ship-art mini" src="/assets/defenses/${id}.jpg" alt="" />
        <span>${esc(state.catalog.defenses?.[id]?.name || id)}</span>
        <b>×${n}</b>
      </div>`
    )
    .join("");
}

function lootHtml(loot) {
  if (!loot) return "";
  const bits = resourceIds().filter((k) => loot[k] > 0);
  if (!bits.length) return `<span class="muted">keine Beute</span>`;
  return bits
    .map((k) => `<span data-k="${k}">${resourceIcon(k)} ${fmt(loot[k])} ${esc(state.catalog.resources[k].short)}</span>`)
    .join("");
}

function forceCount(map) {
  return Object.values(map || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

function battleTable(deployed, lost, left, kind) {
  const folder = kind === "def" ? "defenses" : "ships";
  const cat = kind === "def" ? state.catalog.defenses : state.catalog.ships;
  const ids = new Set([
    ...Object.keys(deployed || {}),
    ...Object.keys(lost || {}),
    ...Object.keys(left || {}),
  ]);
  const rows = [...ids]
    .filter((id) => (deployed?.[id] || lost?.[id] || left?.[id]) > 0)
    .map((id) => {
      const d = deployed?.[id] || 0;
      const l = lost?.[id] || 0;
      const s = left?.[id] || 0;
      return `<tr>
        <td class="unit-cell"><img class="ship-art mini" src="/assets/${folder}/${id}.jpg" alt="" /> ${esc(cat?.[id]?.name || id)}</td>
        <td>${d || "—"}</td>
        <td class="${l ? "loss-num" : ""}">${l || "—"}</td>
        <td>${s || "—"}</td>
      </tr>`;
    })
    .join("");
  return `<table class="table battle-table">
    <thead><tr><th>Einheit</th><th>Einsatz</th><th>Verlust</th><th>Übrig</th></tr></thead>
    <tbody>${rows || `<tr><td class="muted" colspan="4">keine Einheiten</td></tr>`}</tbody>
  </table>`;
}

function reportIsWin(r) {
  const b = r.body || {};
  if (typeof b.youWin === "boolean") return b.youWin;
  if (b.viewer === "defender") return b.winner === "defender";
  if (b.viewer === "attacker") return b.winner === "attacker";
  if (b.raid || /^(Raid |Verteidigung:)/.test(r.title || "")) return b.winner === "defender";
  return b.winner === "attacker";
}

function renderCombatReport(r) {
  const b = r.body || {};
  const win = reportIsWin(r);
  const atkN = forceCount(b.atkShips);
  const defN = forceCount(b.defShips);
  const batN = forceCount(b.defDefense);
  const atkLostN = forceCount(b.atkLost);
  const defLostN = forceCount(b.defLost) + forceCount(b.defLostDefense);
  const lootBits = resourceIds().filter((k) => (b.loot || {})[k] > 0);
  const lootHint = lootBits.length ? lootBits.map((k) => `${fmt(b.loot[k])} ${state.catalog.resources[k].short}`).join(", ") : "keine Beute";
  return `<details class="report panel battle ${r.seen ? "" : "unread"} ${win ? "win" : "loss"}" data-rid="${r.id}">
    <summary class="report-head">
      <span class="tag-pill ${win ? "ok" : "danger"}">${win ? "SIEG" : "NIEDERLAGE"}</span>
      <h3>${esc(r.title)}</h3>
      <time>${when(r.createdAt)}</time>
      <span class="report-sum">${win ? "Du hast gewonnen" : "Du hast verloren"}${b.raid ? " (Piraten-Raid)" : ""} · ${atkN} Schiffe vs ${defN} Schiffe${batN ? " + " + batN + " Batterien" : ""} · Verluste ${atkLostN}/${defLostN} · ${esc(lootHint)}</span>
    </summary>
    <div class="report-body">
      <p class="hint">${esc(b.text || "")} · ${esc(b.planet || "")}${b.system ? " · " + esc(b.system) : ""}${b.remnant ? " · Piratenbesatzungen" : ""}${b.pirate ? " · Piraten" : ""}${b.owner ? " · " + esc(b.owner) : ""}</p>
      ${
        b.acs && (b.attackers || []).length
          ? `<div class="acs-parties">${b.attackers
              .map(
                (a) =>
                  `<span class="chip">${esc(a.name)} · ${forceCount(a.ships)} Schiffe${a.loot && Object.values(a.loot).some((n) => n > 0) ? " · Beute" : ""}</span>`
              )
              .join("")}</div>`
          : ""
      }
      ${battleReplayHtml(b, state.catalog, win)}
      <h4 class="battle-data-title">Kampfdaten</h4>
      <div class="battle-stats">
        ${b.atkPower ? `<span>Feuerkraft <b>${fmt(b.atkPower)}</b> vs <b>${fmt(b.defPower || 0)}</b></span>` : ""}
        ${b.shield ? `<span>Schildgenerator S${b.shield}</span>` : ""}
        ${b.prizeTitle ? `<span>${esc(b.prizeTitle)}</span>` : ""}
      </div>
      <div class="battle-grid">
        <div>
          <h4>${b.acs ? "Angreifer (addiert)" : "Angreifer"}</h4>
          ${
            b.acs && (b.attackers || []).length
              ? b.attackers
                  .map(
                    (a) =>
                      `<h4 style="margin-top:10px">${esc(a.name)}</h4>${battleTable(a.ships, a.lost, a.left, "ship")}`
                  )
                  .join("")
              : battleTable(b.atkShips, b.atkLost, b.atkLeft, "ship")
          }
        </div>
        <div>
          <h4>Verteidiger</h4>
          ${battleTable(b.defShips, b.defLost, b.defLeft, "ship")}
          ${
            forceCount(b.defDefense) || forceCount(b.defLostDefense)
              ? `<h4 style="margin-top:12px">Orbitale Batterien</h4>${battleTable(b.defDefense, b.defLostDefense, b.defLeftDefense, "def")}`
              : ""
          }
        </div>
      </div>
      <div class="loot-line"><span class="muted">Beute</span> <div class="cost">${lootHtml(b.loot)}</div></div>
      ${b.shipsGain && Object.keys(b.shipsGain).length ? `<div class="loot-line"><span class="muted">Gekaperte Schiffe</span> ${shipList(b.shipsGain, state.catalog)}</div>` : ""}
      ${b.defGain && Object.keys(b.defGain).length ? `<div class="loot-line"><span class="muted">Geborgene Batterien</span> ${defenseRoster(b.defGain)}</div>` : ""}
      ${jumpButtonsHtml(reportJumps(r))}
    </div>
  </details>`;
}

function renderSpyReport(r) {
  const b = r.body || {};
  const rawB = b.buildings || [];
  const blds = Array.isArray(rawB)
    ? rawB.filter((x) => (x.level || 0) > 0)
    : Object.entries(rawB)
        .filter(([, lvl]) => lvl > 0)
        .map(([id, level]) => ({ id, name: state.catalog.buildings[id]?.name || id, level }));
  const res = b.resources
    ? resourceIds()
        .map((k) => {
          const def = state.catalog.resources[k];
          return `<div class="intel-res"><span style="color:${def.color}">${resourceIcon(k)} ${esc(def.short)}</span><b>${fmt(b.resources[k] || 0)}</b></div>`;
        })
        .join("")
    : "";
  const mods = blds.length
    ? blds.map((x) => `<span class="chip">${esc(x.name)} S${x.level}</span>`).join("")
    : `<span class="muted">keine Gebäude erkannt</span>`;
  const shipN = forceCount(b.ships);
  const defN = forceCount(b.defenses);
  return `<details class="report panel spy ${r.seen ? "" : "unread"}" data-rid="${r.id}">
    <summary class="report-head">
      <span class="tag-pill spy-tag">SPIONAGE</span>
      <h3>${esc(r.title)}</h3>
      <time>${when(r.createdAt)}</time>
      <span class="report-sum">${esc(b.planet || "")} · ${esc(b.owner || "unbesetzt")} · ${shipN} Schiffe${defN ? " · " + defN + " Batterien" : ""} · ${b.detected ? "entdeckt" : "unentdeckt"}</span>
    </summary>
    <div class="report-body">
      <p class="hint">${esc(b.text || "")} · ${esc(b.planet || "")}${b.system ? " · " + esc(b.system) : ""} · ${esc(b.typeName || "")} · Kontrolle: ${esc(b.owner || "—")}${b.detected ? " · Sonden angegriffen" : " · unentdeckt"}</p>
      <div class="intel-grid">${res}</div>
      <div class="intel-block"><h4>Infrastruktur</h4><div class="chips">${mods}</div></div>
      <div class="intel-block"><h4>Orbitale Flotte</h4>${rosterHtml(b.ships)}</div>
      ${b.defenses && Object.keys(b.defenses).length ? `<div class="intel-block"><h4>Batterien</h4>${defenseRoster(b.defenses)}</div>` : ""}
      ${b.lost && Object.keys(b.lost).length ? `<div class="muted">Sonden verloren: ${shipList(b.lost, state.catalog)}</div>` : ""}
      ${b.planetId ? `<div class="row" style="margin-top:10px"><button class="btn primary" data-report-attack="${b.planetId}" data-system="${b.systemId || ""}">Flotte zum Angriff</button></div>` : ""}
      ${jumpButtonsHtml(reportJumps(r))}
    </div>
  </details>`;
}

function renderGenericReport(r) {
  const b = r.body || {};
  const kindLabel=r.kind==="alliance_boss"?"ALLIANZ-SIEG":r.kind;
  const jumps = jumpButtonsHtml(reportJumps(r));
  const long = (b.text || "").length > 140 || b.loot || b.shipsGain;
  if (!long) {
    return `<article class="report panel ${r.seen ? "" : "unread"}" data-rid="${r.id}">
      <header class="report-head">
        <span class="tag-pill">${esc(kindLabel)}</span>
        <h3>${esc(r.title)}</h3>
        <time>${when(r.createdAt)}</time>
      </header>
      <p>${esc(b.text || "")}</p>
      ${jumps}
    </article>`;
  }
  return `<details class="report panel ${r.seen ? "" : "unread"}" data-rid="${r.id}">
    <summary class="report-head">
      <span class="tag-pill">${esc(kindLabel)}</span>
      <h3>${esc(r.title)}</h3>
      <time>${when(r.createdAt)}</time>
      <span class="report-sum">${esc((b.text || "").slice(0, 90))}${(b.text || "").length > 90 ? "…" : ""}</span>
    </summary>
    <div class="report-body">
      <p>${esc(b.text || "")}</p>
      ${b.loot ? `<div class="loot-line"><span class="muted">${r.kind==="alliance_boss"?"Automatisch gutgeschrieben":"Fund"}</span><div class="cost">${lootHtml(b.loot)}</div></div>` : ""}
      ${jumps}
    </div>
  </details>`;
}

function reportChannel(kind) {
  if (kind === "combat") return "combat";
  if (kind === "spy") return "spy";
  return "messages";
}

let reportRequest = 0;
async function loadReports(filter = "messages") {
  const request = ++reportRequest;
  try {
  const host = $("report-list");
  if (!host) return;
  const channel = filter === "all" ? "messages" : filter;
  const { reports } = await getReports(channel);
  if (request !== reportRequest || !host.isConnected || state.newsTab !== channel) return;
  host.classList.remove("muted");
  const signature = JSON.stringify(reports);
  if (host.dataset.signature === signature && host.dataset.channel === channel) return;
  host.dataset.signature = signature; host.dataset.channel = channel;
  const list = reports.filter((r) => reportChannel(r.kind) === channel);
  if (!list.length) {
    const empty = channel === "combat"
      ? ["Keine Kampfberichte.", "Sende eine Kampfgruppe über die Sternenkarte."]
      : channel === "spy"
        ? ["Keine Spionageberichte.", "Sende eine Sonde über die Sternenkarte."]
        : ["Keine Nachrichten.", "Bauten, Forschung, Flotten und Ereignisse erscheinen hier."];
    host.innerHTML = `<div class="empty panel"><p>${empty[0]}</p><p class="muted">${empty[1]}</p></div>`;
    return;
  }
  host.innerHTML = list
    .map((r) => {
      if (r.kind === "combat") return renderCombatReport(r);
      if (r.kind === "medal") {
        const b = r.body || {};
        return `<article class="report panel ${r.seen ? "" : "unread"}" data-rid="${r.id}">
          <header class="report-head">
            <span class="tag-pill ok">MEDAILLE</span>
            <h3>${esc(r.title)}</h3>
            <time>${when(r.createdAt)}</time>
          </header>
          <div class="medal-grant">
            ${b.image ? `<img src="${esc(b.image)}" alt="" />` : ""}
            <p>${esc(b.text || "")}</p>
          </div>
        </article>`;
      }
      if (r.kind === "spy") return renderSpyReport(r);
      if (r.kind === "expedition" || r.kind === "salvage") {
        const b = r.body || {};
        return `<details class="report panel spy ${r.seen ? "" : "unread"}" data-rid="${r.id}">
          <summary class="report-head"><span class="tag-pill spy-tag">${esc(r.kind.toUpperCase())}</span>
          <h3>${esc(r.title)}</h3><time>${when(r.createdAt)}</time>
          <span class="report-sum">${esc((b.text || "").slice(0, 80))}${(b.text || "").length > 80 ? "…" : ""}</span></summary>
          <div class="report-body">
            <p class="hint">${esc(b.text || "")}</p>
            <div class="loot-line"><span class="muted">Fund</span><div class="cost">${lootHtml(b.loot)}</div></div>
            ${b.shipsGain && Object.keys(b.shipsGain).length ? `<div>Geborgen: ${shipList(b.shipsGain, state.catalog)}</div>` : ""}
            ${jumpButtonsHtml(reportJumps(r))}
          </div>
        </details>`;
      }
      return renderGenericReport(r);
    })
    .join("");
  host.querySelectorAll("details[data-rid]").forEach((el) => {
    if (state.openReports.has(el.dataset.rid)) el.open = true;
    el.addEventListener("toggle", () => {
      if (el.open) state.openReports.add(el.dataset.rid);
      else state.openReports.delete(el.dataset.rid);
    });
  });
  if (!host.dataset.readBound) {
    host.dataset.readBound = "1";
    const readReports = new Set();
    host.addEventListener("click", (ev) => {
      const el = ev.target.closest("details[data-rid], article[data-rid]");
      if (!el || !el.classList.contains("unread")) return;
      el.classList.remove("unread");
      const id = Number(el.dataset.rid);
      if (!readReports.has(id)) {
        readReports.add(id);
        api("/reports/read", { method: "POST", body: { ids: [id] } }).catch(() => {});
      }
    });
  }
  bindBattleReplays(host);
  bindJumps(host);
  host.querySelectorAll("[data-report-attack]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        const detail = await getSystem(Number(b.dataset.system));
        openGroupMission(Number(b.dataset.reportAttack), detail, "attack");
      } catch (err) {
        toast(err.message || "Ziel unbekannt.", true);
        setView("galaxy");
      }
    });
  });
  } catch (err) {
    const host = $("report-list");
    if (host && request===reportRequest) {
      host.innerHTML = `<div class="panel"><p>${esc(err.message || "Berichte konnten nicht geladen werden.")}</p><button class="btn" data-report-retry>Erneut laden</button></div>`;
      host.querySelector("[data-report-retry]").onclick=()=>loadReports(filter);
      delete host.dataset.signature;
    }
  }
}

let mapBootId = 0;
let orbitStarting = false;
let orbitPick = null;

function paintOrbitButton() {
  const sub = $("map-orbit-fire-sub");
  const btn = $("map-orbit-fire");
  const os = state.snap?.orbitSiege;
  if (!sub || !os) return;
  if (os.best?.waves) btn?.setAttribute("title", `Bestleistung: Welle ${os.best.waves} · ${os.best.kills || 0} Abschüsse`);
  if (os.unlimited) {
    sub.textContent = os.best?.waves ? `Best ${os.best.waves} · Test` : "Test: unbegrenzt";
    if (btn) btn.disabled = false;
  } else if (os.playsLeft > 0) {
    sub.textContent = os.playsLeft === 1 ? "1 Einsatz heute" : `${os.playsLeft} Einsätze heute`;
    if (btn) btn.disabled = false;
  } else {
    const next = (os.tasks || []).find((t) => !t.complete);
    sub.textContent = next ? `Extra: ${next.title}` : "Morgen wieder";
    if (btn) btn.disabled = false;
  }
}

function showOrbitLocked(os) {
  const tasks = (os?.tasks || []).map((t) => `<button type="button" class="btn ${t.complete ? "ghost" : "primary"}" data-orbit-task="${esc(t.view || "infra")}" ${t.complete ? "disabled" : ""}><b>${esc(t.title)}</b><small>${esc(t.blurb)}</small></button>`).join("");
  showModalEl(`<div class="panel orbit-lock"><h2>Keine Freigabe</h2><p>Ein Einsatz pro Tag. Erledige eine Aufgabe für einen weiteren Anflug.</p><div class="orbit-lock-tasks">${tasks || "<p class='muted'>Morgen um 00:00 UTC gibt es einen neuen Einsatz.</p>"}</div></div>`);
  document.querySelectorAll("[data-orbit-task]").forEach((b) => {
    b.addEventListener("click", () => {
      hideModalEl();
      setView(b.dataset.orbitTask);
    });
  });
}

function rememberOrbitPick(planetId, planetName) {
  const id = Number(planetId || 0);
  if (!id) return;
  orbitPick = { planetId: id, planetName: planetName || "" };
}

function chosenOrbitTarget() {
  if (orbitPick?.planetId) return orbitPick;
  const p = state.snap?.planet;
  return p?.id ? { planetId: p.id, planetName: p.name } : null;
}

function orbitErrorMessage(err) {
  const raw = String(err?.message || "");
  const status = Number(err?.status || 0);
  if (status === 404 || /^not found$/i.test(raw) || /cannot post/i.test(raw)) {
    return "Orbit-Feuer ist gerade nicht erreichbar. Bitte die Seite neu laden.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Keine Verbindung zum Server. Orbit-Feuer konnte nicht starten.";
  }
  return raw || "Orbit-Feuer konnte nicht gestartet werden.";
}

function orbitSessionFrom(started) {
  return started?.orbitSiege || started?.orbitFire || null;
}

async function postOrbit(path, body) {
  return api(path, { method: "POST", body });
}

async function startOrbitSession(planetId) {
  try {
    return await postOrbit("/orbit-siege/start", { planetId });
  } catch (err) {
    if (err.status === 404 || /not found/i.test(err.message || "")) {
      return postOrbit("/orbit-fire/start", { planetId });
    }
    throw err;
  }
}

async function claimOrbitSession(session, waves, kills) {
  const body = { sessionId: session.id, waves, kills, hits: kills };
  try {
    return await postOrbit("/orbit-siege/claim", body);
  } catch (err) {
    if (err.status === 404 || /not found/i.test(err.message || "")) {
      return postOrbit("/orbit-fire/claim", body);
    }
    throw err;
  }
}

async function launchOrbitSiege(planetId, planetName) {
  rememberOrbitPick(planetId, planetName);
  const staleOrbit = document.querySelector(".orbit-game");
  if (staleOrbit) staleOrbit.remove();
  document.body.classList.remove("orbit-siege-open");
  if (orbitStarting) return;
  const target = chosenOrbitTarget();
  if (!target?.planetId) {
    toast("Wähle zuerst eine eigene Kolonie.", true);
    return;
  }
  const os = state.snap?.orbitSiege;
  if (os && !os.unlimited && Number(os.playsLeft) === 0) {
    showOrbitLocked(os);
    return;
  }
  orbitStarting = true;
  const resumeUnity = rootView() === "command" && !state.snap?.planet?.isAlliance;
  setUnityColonyVisible(false);
  syncColonyPointerEvents();
  const sessionReady = startOrbitSession(target.planetId)
    .then((started) => {
      const session = orbitSessionFrom(started);
      if (started.orbitSiege?.status) state.snap.orbitSiege = started.orbitSiege.status;
      else if (session?.status) state.snap.orbitSiege = session.status;
      paintOrbitButton();
      if (!session?.id) throw new Error("Orbit-Feuer konnte nicht gestartet werden.");
      return session;
    })
    .catch((err) => {
      throw Object.assign(new Error(orbitErrorMessage(err)), { status: err.status });
    })
    .finally(() => {
      orbitStarting = false;
    });
  try {
    startOrbitSiege({
      session: {},
      sessionReady,
      planetName: target.planetName,
      onClaim: async ({ waves, kills, session }) => {
        const out = await claimOrbitSession(session, waves, kills);
        if (out?.empire) state.snap = out;
        paintChrome();
        paintOrbitButton();
        const loot = out.orbitSiege?.loot || out.orbitFire?.loot || {};
        const lootText = Object.entries(loot).filter(([, n]) => Number(n) > 0).map(([id, n]) => `+${n} ${state.catalog.resources?.[id]?.short || id.toUpperCase()}`).join(" · ");
        const best = out.orbitSiege?.best || out.orbitFire?.best;
        if (best?.improved) toast(`Neuer Orbit-Highscore: Welle ${best.waves} · ${best.kills} Abschüsse`);
        else if (lootText) toast(`Orbit-Feuer: ${lootText}`);
        return out.orbitSiege || out.orbitFire;
      },
      onExit: () => {
        orbitStarting = false;
        if (resumeUnity && rootView() === "command") setUnityColonyVisible(true);
        syncColonyPointerEvents();
        if (state.view !== "galaxy") setView("galaxy");
      },
    });
  } catch (err) {
    orbitStarting = false;
    toast(orbitErrorMessage(err), true);
    if (resumeUnity) setUnityColonyVisible(true);
    syncColonyPointerEvents();
  }
}


function allianceBossHtml(boss) {
  if (!boss) return "";
  const pct = boss.maxHp ? Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)) : 0;
  const ranks = (boss.contributors || []).slice(0, 5).map((p, i) => `<li><i>${i + 1}</i><span>${esc(p.name)}</span><b>${fmt(p.damage)}</b></li>`).join("");
  const attempts = `${boss.attemptsLeft}/2`;
  return `<section class="ally-boss panel"><div class="ally-boss-art" aria-hidden="true"><i></i><span></span><em>BOSS · STUFE ${boss.level || 1}</em></div><div class="ally-boss-body"><em>ALLIANZ-OPERATION</em><h2>${esc(boss.name)} <small>LV. ${boss.level || 1}</small></h2><p>Stärke und HP skalieren mit Flottenmacht, Mitgliederzahl und Bosslevel. Die nächste Stufe erhält mindestens 70 % mehr HP. Zwei Feuerfreigaben pro Commander und Tag, erneuert um 00:00 UTC. Jeder Start zählt, auch bei Abbruch.</p><div class="ally-boss-hp"><span style="width:${pct}%"></span><b>${fmt(boss.hp)} / ${fmt(boss.maxHp)} HP</b></div><div class="ally-boss-stats"><span>Dein Beitrag <b>${fmt(boss.mine)}</b></span><span>Feuerfreigaben <b>${attempts}</b></span></div><div class="ally-boss-reward"><strong>Belohnung je Allianzmitglied · Stufe ${boss.level || 1}</strong><div class="cost">${lootHtml(boss.reward)}</div><p>Automatische Lieferung nach dem vollständigen Sieg. Alle Mitglieder erhalten eine Sieg-Nachricht. Jede weitere Stufe erhöht die Belohnung um mindestens 25 %.</p></div><button class="btn primary ally-boss-launch" id="ally-boss-launch">⚡ NEMESIS-KAMPF ÖFFNEN</button></div><ol>${ranks}</ol></section>`;
}

function syncMapPlanetOptions(){
  const select=$('planet-focus');if(!select)return;
  const planets=state.snap.planets || [],ids=new Set(planets.map(p=>p.id));
  const options='<option value="">— Planet springen —</option>'+planets.map(p=>`<option value="planet:${p.id}">${esc(p.name)} · ${esc(p.systemName || '')}</option>`).join('')+(state.snap.bookmarks || []).filter(b=>!ids.has(b.planetId)).map(b=>`<option value="bookmark:${b.planetId}">${esc(b.label || 'Gespeichertes Ziel')}</option>`).join('');
  if(select.dataset.options!==options){const value=select.value;select.innerHTML=options;select.dataset.options=options;select.value=value;}
}
async function bootMap() {
  const canvas = $("starmap");
  if (!canvas) return;
  const bootId = ++mapBootId;
  const stillHere = () => bootId === mapBootId && rootView() === "galaxy" && $("starmap") === canvas;
  const orbitBtn = $("map-orbit-fire");
  if (orbitBtn) {
    orbitBtn.onclick = () => {
      const target = chosenOrbitTarget();
      launchOrbitSiege(target?.planetId, target?.planetName);
    };
  }
  paintOrbitButton();
  if (state.map) {
    try {
      state.map.destroy();
    } catch {
      /* ignore */
    }
    state.map = null;
  }
  let systemRequest=0,selectedSystem=null,selectedOpts=null;
  const selectSystem=async (sys, opts, background=false) => {
    const request=++systemRequest;
    if (!stillHere()) return;
    const box = $("sysbox");
    if (!box) return;
    if (!sys) {
      selectedSystem=null;
      box.innerHTML = "";
      return;
    }
    selectedSystem=sys;selectedOpts=opts;
    if(!background)box.innerHTML=`<section class="sys-panel panel"><button type="button" data-loading-close aria-label="System schließen">×</button><p>${esc(sys.name)} wird geladen …</p></section>`;
    box.querySelector('[data-loading-close]')?.addEventListener('click',()=>{selectedSystem=null;systemRequest++;box.innerHTML='';});
    let detail;
    try {
      detail = await getSystem(sys.id);
    } catch (err) {
      if(!stillHere() || request!==systemRequest)return;
      if(!background){box.innerHTML='<section class="sys-panel panel"><p>System konnte nicht geladen werden.</p><button type="button" data-system-retry>Erneut laden</button></section>';box.querySelector('[data-system-retry]').onclick=()=>selectSystem(sys,opts);}
      toast(err.message || "System nicht geladen.", true);
      return;
    }
    if(!stillHere() || request!==systemRequest || !box.isConnected) return;
    const highlightPlanetId = Number(opts?.planetId || (state.mapFocus?.systemId === sys.id ? state.mapFocus.planetId : 0));
    if (!opts?.planetId && state.mapFocus && state.mapFocus.systemId !== sys.id) state.mapFocus = null;
    const html = systemHtml(detail, state.catalog, state.snap.planet?.ships, {
      highlightPlanetId,
      colonizeMode: state.colonizeMode,
      systemId: sys.id, flights:state.snap.fleets || [],
      orbitSiege: state.snap.orbitSiege
    });
    if(background && box.dataset.content===html)return;
    const scroll=box.querySelector('.sys-panel')?.scrollTop || 0;
    box.dataset.content=html;box.innerHTML=html;
    if(background && box.querySelector('.sys-panel'))box.querySelector('.sys-panel').scrollTop=scroll;
    box.querySelector("[data-sys-close]")?.addEventListener("click", () => {
      selectedSystem=null;systemRequest++;
      box.innerHTML = "";
    });
    const alertRow = box.querySelector(".sys-planet-alert");
    if (alertRow) alertRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    box.querySelectorAll("[data-focus]").forEach((b) =>
      b.addEventListener("click", () => switchPlanet(Number(b.dataset.focus)))
    );
    box.querySelectorAll("[data-target]").forEach((b) =>
      b.addEventListener("click", () => {
        const kind = b.dataset.missionKind || "";
        if (kind === "attack" || kind === "intercept") openGroupMission(Number(b.dataset.target), detail, kind);
        else openMission(Number(b.dataset.target), detail, kind==='colonize' && state.colonizeMode?.alliance ? 'ally_colonize' : kind);
      })
    );
    box.querySelectorAll("[data-orbit-mode]").forEach((button) => button.addEventListener("click", () => {
      box.querySelectorAll("[data-orbit-mode]").forEach((item) => item.classList.toggle("on", item === button));
      try { localStorage.setItem(`sn-orbit-${sys.id}`, button.dataset.orbitMode); } catch { /* ignore */ }
      rememberOrbitPick(Number(button.dataset.orbitPlanet), button.dataset.orbitName || sys.name);
      launchOrbitSiege(Number(button.dataset.orbitPlanet), button.dataset.orbitName || sys.name);
    }));
    let orbitMode = "auto";
    try { orbitMode = localStorage.getItem(`sn-orbit-${sys.id}`) || "auto"; } catch { /* ignore */ }
    if (orbitPick?.planetId && [...box.querySelectorAll("[data-orbit-mode='manual']")].some((item) => Number(item.dataset.orbitPlanet) === orbitPick.planetId)) {
      orbitMode = "manual";
    }
    box.querySelectorAll("[data-orbit-mode]").forEach((item) => item.classList.toggle("on", item.dataset.orbitMode === orbitMode));
    box.querySelectorAll("[data-bookmark]").forEach((b) => b.addEventListener("click", () => {
      const label = window.prompt("Bezeichnung für diesen Planeten:", b.dataset.bookmarkName || "");
      if (label === null) return;
      act(() => api("/bookmarks", { method: "POST", body: { planetId: Number(b.dataset.bookmark), label } }));
    }));
    box.querySelectorAll("[data-profile]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openEmpireProfile(Number(b.dataset.profile));
      })
    );
  };
  state.refreshSystemSheet=()=>{if(stillHere() && selectedSystem)selectSystem(selectedSystem,selectedOpts,true);};
  state.map = createMap(canvas, selectSystem, ({ mode }) => {
    if (!stillHere()) return;
    const names = { sector: "SEKTOR-EINFLUSS", system: "SYSTEMNETZ", orbit: "ORBIT-DETAIL" };
    const title = $("map-view-title");
    if (title) title.textContent = names[mode] || names.system;
    document.querySelectorAll("[data-map-view]").forEach((button) => button.classList.toggle("on", button.dataset.mapView === mode));
  });
  const kick = () => {
    if (!stillHere() || !state.map) return;
    state.map.resize();
  };
  kick();
  requestAnimationFrame(() => {
    requestAnimationFrame(kick);
    setTimeout(kick, 80);
    setTimeout(kick, 280);
  });
  let focused = false;
  const paintGalaxy = (galaxy) => {
    if (!stillHere() || !state.map || !galaxy) return;
    state.galaxy = galaxy;
    state.map.setData(galaxy);
    if (!focused && !selectedSystem) {
      if (state.mapFocus?.planetId || state.mapFocus?.systemId) applyMapFocus();
      else state.map.focusHome(false);
      focused = true;
    }
    kick();
  };
  if (state.galaxy?.systems) paintGalaxy(state.galaxy);
  // Bind controls before the network request completes: the first tap already works.
  if (!stillHere()) return;
  const root = $("view");
  const searchToggle = root.querySelector(".map-search-toggle");
  const mapTools = root.querySelector("#map-tools");
  const filterToggle=root.querySelector('.map-filter-toggle'),filters=root.querySelector('#map-filters');
  filterToggle?.addEventListener('click',()=>{filters.hidden=!filters.hidden;filterToggle.setAttribute('aria-expanded',String(!filters.hidden));mapTools.classList.remove('open');searchToggle.setAttribute('aria-expanded','false');searchToggle.textContent='⌕';});
  searchToggle?.addEventListener("click", () => {
    filters.hidden=true;filterToggle.setAttribute('aria-expanded','false');
    const open = mapTools?.classList.toggle("open") || false;
    searchToggle.setAttribute("aria-expanded", String(open));
    searchToggle.textContent = open ? "×" : "⌕";
    if (open) requestAnimationFrame(() => root.querySelector("#map-search")?.focus());
  });
  root.querySelectorAll("[data-map-view]").forEach((button) => button.addEventListener("click", () => state.map?.setView(button.dataset.mapView)));
  root.querySelectorAll("[data-season-claim]").forEach((button) => button.addEventListener("click", () => act(() => api("/sector-season/claim", { method: "POST", body: { tier: Number(button.dataset.seasonClaim) } }))));
  const applyMapFilter = () => {
    const filters = { query: root.querySelector("#map-search")?.value || "" };
    root.querySelectorAll("[data-map-filter]").forEach((input) => { filters[input.dataset.mapFilter] = input.checked; });
    state.map.setFilter(filters);
  };
  const mapSearch = root.querySelector("#map-search");
  const searchResults = root.querySelector("#map-search-results");
  if (mapSearch) mapSearch.value = "";
  const openSearchSystem = (system) => {
    if (!system || !state.map) return;
    mapSearch.value = "";
    root.querySelectorAll('[data-map-filter]').forEach(input=>{input.checked=false;});
    if (searchResults) searchResults.hidden = true;
    applyMapFilter();
    state.map.focusSystem(system.id, 2.7);
  };
  const paintSearchResults = () => {
    if (!mapSearch || !searchResults) return;
    const query = mapSearch.value.trim().toLocaleLowerCase("de");
    if (!query) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      return;
    }
    const matches = (state.galaxy?.systems || [])
      .filter((system) => [system.name,...(system.planetNames || [])].some(name=>name.toLocaleLowerCase('de').includes(query)))
      .slice(0, 6);
    searchResults.innerHTML = matches.length
      ? matches.map((system) => `<button type="button" data-search-system="${system.id}"><i aria-hidden="true"></i><span><b>${esc(system.name)}</b><small>${system.planetCount || system.planets || "System"}</small></span><em>›</em></button>`).join("")
      : `<p>Kein System gefunden</p>`;
    searchResults.hidden = false;
    searchResults.querySelectorAll("[data-search-system]").forEach((button) => button.addEventListener("click", () => {
      const system = (state.galaxy?.systems || []).find((item) => item.id === Number(button.dataset.searchSystem));
      openSearchSystem(system);
    }));
  };
  mapSearch?.addEventListener("input", () => {
    applyMapFilter();
    paintSearchResults();
  });
  mapSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = mapSearch.value.trim().toLocaleLowerCase("de");
    const system = (state.galaxy?.systems || []).find((item) => item.name.toLocaleLowerCase("de") === query)
      || (state.galaxy?.systems || []).find((item) => [item.name,...(item.planetNames || [])].some(name=>name.toLocaleLowerCase('de').includes(query)));
    if (!system) {
      toast("System nicht gefunden.", true);
      return;
    }
    openSearchSystem(system);
  });
  root.querySelectorAll("[data-map-filter]").forEach((input) => input.addEventListener("change", applyMapFilter));
  const focusSelect = root.querySelector("#planet-focus");
  if (focusSelect) {
    const ownPlanetIds = new Set((state.snap.planets || []).map((p) => p.id));
    const ownPlanetMap = new Map((state.snap.planets || []).map((p) => [p.id, p]));
    const bookmarkEntries = (state.snap.bookmarks || [])
      .filter((b) => !ownPlanetIds.has(b.planetId))
      .map((b) => {
        const sysId = b.systemId || "";
        const sysName = sysId ? `System ${sysId}` : "";
        const label = b.label || "Unbenannt";
        return `<option value="bookmark:${b.planetId}">${esc(label)}${sysName ? " · " + esc(sysName) : ""}</option>`;
      });
    const planetEntries = (state.snap.planets || [])
      .map((p) => `<option value="planet:${p.id}">${esc(p.name)} · ${esc(p.systemName || "System " + p.systemId)}</option>`)
      .join("");
    focusSelect.innerHTML = `<option value="">— Planet springen —</option>` + planetEntries + bookmarkEntries;
    focusSelect.addEventListener("change", () => {
      const raw = focusSelect.value;
      if (!raw || !state.map) return;
      let sysId = null;
      if (raw.startsWith("planet:")) {
        const planetId = Number(raw.slice(7));
        const planet = state.snap.planets?.find((p) => p.id === planetId);
        sysId = planet?.systemId;
      } else if (raw.startsWith("bookmark:")) {
        const bookmark = state.snap.bookmarks?.find((b) => b.planetId === Number(raw.slice(9)));
        sysId = bookmark?.systemId || null;
        if (!sysId) {
          const planet = state.snap.planets?.find((p) => p.id === bookmark?.planetId);
          sysId = planet?.systemId || null;
        }
      } else {
        sysId = Number(raw);
      }
      if (sysId) state.map.focusSystem(sysId, 1.6);
      focusSelect.value = "";
    });
  }
  root.querySelectorAll("[data-bookmark-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const bookmark = state.snap.bookmarks?.find((b) => b.planetId === Number(button.dataset.bookmarkFocus));
      if (bookmark?.systemId && state.map) {
        state.map.focusSystem(bookmark.systemId, 1.2);
      } else {
        toast("Gespeicherter Planet nicht mehr verfügbar.", true);
      }
    });
  });
  root.querySelectorAll("[data-bookmark-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const planetId = Number(button.dataset.bookmarkDelete);
      try {
        await api(`/bookmarks/${planetId}`, { method: "DELETE" });
        state.snap.bookmarks = (state.snap.bookmarks || []).filter((b) => b.planetId !== planetId);
        const span = button.closest(".map-bookmark");
        if (span) span.remove();
        const focusSelect = $("planet-focus");
        if (focusSelect) {
          const opt = focusSelect.querySelector(`option[value="bookmark:${planetId}"]`);
          if (opt) opt.remove();
        }
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
  syncMapPlanetOptions();
  try {paintGalaxy(await getGalaxy());paintSearchResults();}
  catch(err){if(stillHere())toast(err.message || 'Galaxie nicht geladen.',true);}
}

async function openDefenseMission(targetId, systemId, threat = null) {
  try {
    const sys = await getSystem(systemId);
    if (!sys?.planets?.some((planet) => planet.id === targetId)) throw new Error("Zielplanet nicht gefunden.");
    openGroupMission(targetId, sys, "intercept", {
      title: `Verteidigen · ${threat?.planet || sys.name}`,
      raidId: threat?.kind === 'raid' ? Number(String(threat.id).replace(/^r/,'')) : null,
      warning: threat?.kind === 'raid' ? 'Ohne Freigabe ziehen die Piraten zwei Stunden nach Ankunft ohne Schaden ab. Bei Freigabe kämpfen alle stationierten Schiffe und Anlagen mit; Verstärkung trifft vor dem Kampf ein. Eine Niederlage kostet Schiffe und 18 % der lokalen Ressourcen.' : threat ? `Angriff in ${eta(Math.max(0, threat.arrivesAt - Date.now()))}` : '',
    });
  } catch (err) {
    toast(err.message || "Verteidigung nicht geöffnet.", true);
  }
}

function openGroupMission(targetId, sys, mission = "attack", dialogOpts = {}) {
  const raid=mission==='intercept' && (state.snap.incoming || []).find(r=>r.kind==='raid' && r.planetId===targetId);
  if(raid)dialogOpts={...dialogOpts,raidId:Number(String(raid.id).replace(/^r/,''))};
  const target = sys.planets.find((planet) => planet.id === targetId);
  if (!target) return toast("Zielplanet nicht gefunden.", true);
  const origins = (state.snap.planets || []).filter((planet) => {
    if (planet.isAlliance || (!dialogOpts.raidId && planet.id === targetId)) return false;
    return Object.values(planet.ships || {}).some((n) => Number(n) > 0);
  });
  if (!origins.length && !dialogOpts.raidId) return toast("Keine einsatzbereiten Schiffe auf deinen Planeten.", true);
  const cards = origins.map((planet) => {
    const ships = Object.entries(planet.ships || {}).filter(([, n]) => n > 0);
    return `<section class="group-origin" data-group-origin="${planet.id}">
      <div class="group-origin-head">
        <img src="/assets/planets/${planet.type || "terran"}.jpg" alt="" />
        <span><b>${esc(planet.name)}</b><small>${esc(planet.systemName || "")}</small></span>
        <button type="button" class="btn ghost small" data-group-max="${planet.id}">Max</button>
      </div>
      <div class="group-ship-grid">${ships.map(([id, n]) => `<label>
        <span>${esc(state.catalog.ships[id]?.name || id)} <small>/${n}</small></span>
        <input type="number" min="0" max="${n}" value="0" data-group-ship="${id}" inputmode="numeric" />
      </label>`).join("")}</div>
    </section>`;
  }).join("");
  const hostile = mission === "attack";
  showModal(`<div class="sheet panel group-fleet-sheet">
    <div class="group-body">
    <button type="button" class="group-close" id="m-cancel" aria-label="Schließen">×</button>
    <div class="group-kicker">${hostile ? "GEMEINSAMER SCHLAG" : "GEMEINSAME VERTEIDIGUNG"}</div>
    <h2>${esc(dialogOpts.title || `${hostile ? "Angriff" : "Verteidigen"} · ${target.name}`)}</h2>
    <p>${esc(sys.name)} · ${sys.pirate ? `Piratenhorst Stufe ${sys.pirate}` : sys.remnant ? "Piratenbesatzung" : target.owner?.name || "freier Orbit"}</p>
    ${dialogOpts.warning ? `<div class="group-warning">${esc(dialogOpts.warning)}</div>` : ""}
    <div class="group-origin-list">${cards}</div>
    </div>
    <div class="group-footer">
    <div class="group-summary" id="group-summary">0 Planeten · 0 Schiffe</div>
    <p id="group-error" class="group-error" role="alert" hidden></p>
    <button type="button" class="btn group-launch ${hostile ? "danger" : "primary"}" id="group-launch">${hostile ? "Flotten schicken" : "Verteidigung starten"}</button>
    </div>
  </div>`);
  const modal = document.getElementById("modal");
  let submitting=false;
  const readDeployments = () => [...modal.querySelectorAll("[data-group-origin]")].map((card) => ({
    planetId: Number(card.dataset.groupOrigin),
    ships: Object.fromEntries([...card.querySelectorAll("[data-group-ship]")]
      .map((input) => [input.dataset.groupShip, Math.max(0, Number(input.value) || 0)])
      .filter(([, n]) => n > 0)),
  })).filter((entry) => Object.keys(entry.ships).length);
  const paint = () => {
    const deployments = readDeployments();
    const count = deployments.reduce((sum, entry) => sum + Object.values(entry.ships).reduce((n, value) => n + value, 0), 0);
    document.getElementById("group-summary").textContent = `${deployments.length} Planet${deployments.length === 1 ? "" : "en"} · ${count} Schiffe · gemeinsamer Ankunfts-Tick`;
    document.getElementById("group-launch").disabled = submitting || count <= 0 && !dialogOpts.raidId;
  };
  modal.querySelectorAll("[data-group-max]").forEach((button) => button.addEventListener("click", () => {
    const card = modal.querySelector(`[data-group-origin="${button.dataset.groupMax}"]`);
    card?.querySelectorAll("[data-group-ship]").forEach((input) => { input.value = input.max; });
    paint();
  }));
  modal.querySelectorAll("[data-group-ship]").forEach((input) => input.addEventListener("input", paint));
  document.getElementById("m-cancel").onclick = hideModal;
  document.getElementById("group-launch").onclick = async () => {
    if(submitting)return;
    submitting=true;
    const epoch=focusEpoch;
    const button = document.getElementById("group-launch");
    button.disabled = true;
    const label=button.textContent;
    button.textContent='Wird gestartet …';
    const errorLine=modal.querySelector('#group-error');
    errorLine.hidden=true;
    try {
      const snap=await api(dialogOpts.raidId ? `/raids/${dialogOpts.raidId}/defend` : '/fleet/group', { method: "POST", timeoutMs:20000, body: { targetId, mission, deployments: readDeployments() } });
      acceptMissionSnapshot(snap,epoch);
      hideModal();
      toast(mission === "attack" ? "Gemeinsamer Schlag unterwegs." : 'Verteidigung gestartet. Ankunft und Ergebnis erscheinen auf der Karte und im Funk.');
      refresh().catch(()=>{});
    } catch (err) {
      submitting=false;
      button.disabled = false;
      button.textContent=label;
      errorLine.textContent=err.message || 'Verteidigung konnte nicht gestartet werden. Bitte erneut versuchen.';
      errorLine.hidden=false;
      toast(err.message, true);
      if(err.timeout)refresh().catch(()=>{});
    }
  };
  paint();
}

async function openMission(targetId, sys, initialMission = "", dialogOpts = {}) {
  const planet = sys.planets.find((p) => p.id === targetId);
  if (!planet) {
    toast("Zielplanet nicht gefunden.", true);
    return;
  }
  const own = planet.own || planet.canManage || planet.canStation;
  const canAllyColonize = !planet.owner && (state.snap.alliance?.canColonizePlanet || state.colonizeMode?.alliance);
  
  const colonyMission=['colonize','ally_colonize'].includes(initialMission);
  const origins = (state.snap.fleetAudit?.colonies || []).filter(p => ((initialMission === "expedition" || initialMission === "intercept") || p.id !== targetId) && (colonyMission ? p.ships?.colony > 0 : p.total > 0));
  const sourceId = dialogOpts.sourcePlanetId || origins.find(p=>p.id===state.snap.planet.id)?.id || origins[0]?.id || state.snap.planet.id;
  const origin = sourceId === state.snap.planet.id ? state.snap.planet : origins.find(p=>p.id===sourceId);
  if(!origin) return toast("Startplanet nicht verfügbar.",true);
  const ships = Object.entries(origin.ships || {}).filter(([,n])=>n>0);
  if (!ships.length || (colonyMission && !(origin.ships.colony>0))) {
    toast(initialMission === "colonize" ? "Kein verfügbares Kolonieschiff. Baue es in der Werft eines Planeten mit Kolonialdock." : "Keine Schiffe auf einem Startplaneten verfügbar.",true);
    return;
  }
  const missions = own
    ? [
        ["expedition", "Expedition"],
        ["deploy", "Stationieren"],
        ["transport", "Fracht senden"],
        ["collect", "Fracht abholen"],
        ["intercept", "Verteidigen"],
      ]
    : [
        ["spy", "Spionage"],
        ...(planet.owner && planet.owner.canAttack === false ? [] : [["attack", "Angriff"]]),
        ["colonize", "Kolonisieren"],
        ...(canAllyColonize ? [["ally_colonize", "Als Allianz-Planet besiedeln"]] : []),
      ];
  if (planet.debris) missions.unshift(["salvage", "Trümmer bergen"]);
  showModal(`<div class="sheet panel">
    <label>Start-Hangar<select id="mission-origin">${origins.map(p=>`<option value="${p.id}" ${p.id===origin.id?"selected":""}>${esc(p.name)} · ${p.total} Schiffe</option>`).join("")}</select></label>
    <h2 style="margin:0 0 8px;font-size:18px">${esc(dialogOpts.title || `Mission · ${planet.name}`)}</h2>
    <p class="hint">${dialogOpts.warning ? `<b class="danger">${esc(dialogOpts.warning)}</b> · ` : ""}${esc(sys.name)} · ${esc(planet.name)}</p>
    ${planet.owner?.protected && !own ? `<p class="ok">${esc(planet.owner.protectReason || "Dieser Commander steht unter Fair-Play-Schutz.")}</p>` : ""}
    <label class="muted">Auftrag
      <select id="mission" style="width:100%;margin:6px 0 10px;background:#05060c;border:1px solid var(--line);padding:8px;color:var(--text)">
        ${missions.map(([id, n]) => `<option value="${id}">${n}</option>`).join("")}
      </select>
    </label>
    <div class="row" style="margin:0 0 8px;gap:8px">
      <button type="button" class="btn ghost small" id="ships-max">Alle auf Maximum</button>
      <button type="button" class="btn ghost small" id="ships-clear">Leeren</button>
    </div>
    <div class="stack" id="ship-picks">
      ${ships
        .map(
          ([id, n]) =>
            `<label class="ship-pick">
              <img src="/assets/ships/${id}.jpg" alt="" />
              <span>${esc(state.catalog.ships[id].name)}<div class="muted">max ${n} · Tempo ${state.catalog.ships[id].speed}${state.catalog.ships[id].fuel ? " · Helium " + state.catalog.ships[id].fuel : ""}</div></span>
              <input data-ship="${id}" type="number" min="0" max="${n}" value="${id === (colonyMission ? "colony" : "probe") ? Math.min(1,n) : 0}">
              <button type="button" class="btn ghost small" data-ship-max="${id}" data-max="${n}">Max</button>
            </label>`
        )
        .join("")}
    </div>
    <div id="travel-box" class="travel-box muted">Schiffe wählen — Flugzeit erscheint hier.</div>
    <div id="acs-box" class="acs-box" hidden></div>
    <div id="cargo-fields" class="stack" style="margin-top:8px" hidden></div>
    <div id="combat-preview" class="preview-box" hidden></div>
    <div class="row" style="margin-top:14px">
      <button type="button" class="btn ghost" id="m-cancel">Abbrechen</button>
      <button type="button" class="btn primary" id="m-go">Flotte senden</button>
    </div>
  </div>`);
  document.querySelector("#mission-origin").onchange = e => openMission(targetId,sys,initialMission,{...dialogOpts,sourcePlanetId:Number(e.target.value)});
  const cargoBox = document.getElementById("cargo-fields");
  const missionSel = document.getElementById("mission");
  if (initialMission && [...missionSel.options].some((option) => option.value === initialMission)) missionSel.value = initialMission;
  const previewEl = document.getElementById("combat-preview");
  let joinFleetId = 0;
  let lastTravel = null;
  const pickedShips = () => {
    const picked = {};
    for (const input of document.querySelectorAll("#ship-picks [data-ship]")) {
      const n = Number(input.value || 0);
      if (n > 0) picked[input.dataset.ship] = n;
    }
    return picked;
  };
  const paintCargo = () => {
    const isTransport = missionSel.value === "transport" || missionSel.value === "collect";
    if (isTransport) {
      cargoBox.hidden = false;
      const label = missionSel.value === "collect" ? "Fracht abholen (vom Ziel)" : "Fracht senden (vom Heimatplaneten)";
      cargoBox.innerHTML = `<div class="muted" style="margin-bottom:6px">${label}</div>` +
        resourceIds()
          .map((k) => `<label>${esc(state.catalog.resources[k].name)} <input data-cargo="${k}" type="number" min="0" value="0"></label>`)
          .join("");
    } else {
      cargoBox.hidden = true;
      cargoBox.innerHTML = "";
    }
    paintPreview();
    paintTravel();
    paintAcs(lastTravel);
  };
  let previewTimer = 0;
  let travelTimer = 0;
  const paintTravel = () => {
    clearTimeout(travelTimer);
    const box = document.getElementById("travel-box");
    if (!box) return;
    const picked = pickedShips();
    if (!Object.keys(picked).length) {
      box.className = "travel-box muted";
      box.textContent = "Schiffe wählen — Flugzeit erscheint hier.";
      return;
    }
    travelTimer = setTimeout(async () => {
      try {
        const t = await api("/travel", {
          method: "POST",
          body: { planetId: origin.id, targetId, ships: picked },
        });
        if (!t || t.empty) return;
        lastTravel = t;
        const slow = t.slowest;
        const holdTicks = Number(document.getElementById("acs-hold-ticks")?.value || 0);
        const tick = t.tickMs || tickMsFrom(state.catalog);
        const holdMs = joinFleetId ? 0 : Math.max(0, holdTicks) * tick;
        const joined = (t.strikes || []).find((s) => s.fleetId === joinFleetId);
        const extra = joined ? joined.holdMs : holdMs;
        box.className = "travel-box";
        const arrivalAt = (t.arrivesAt || Date.now() + t.ms) + extra;
        const fuelNeed = t.fuelNeeded || 0;
        const fuelHave = t.fuelAvailable || 0;
        const fuelOk = fuelHave >= fuelNeed;
        box.innerHTML = `<b>Flugzeit ${t.ticks || ticksOf(t.ms, state.catalog)} Tick${(t.ticks || 1) === 1 ? "" : "s"}${extra ? " + Halt " + tickEta(extra, state.catalog) : ""}</b>
          <div>Ankunft im Welt-Tick: ${when(arrivalAt)} · noch <span data-live-eta="${arrivalAt}">${eta(arrivalAt - Date.now())}</span></div>
          <div class="hint">Rohzeit ca. ${eta(t.rawMs || t.ms)}. Sie wird in Reise-Ticks aufgerundet; danach legt der Server den gemeinsamen Ankunfts-Tick fest.</div>
          <div>Distanz ${fmt(t.dist)} LE${t.sameSystem ? " · gleiches System" : t.hops ? ` · ${t.hops} Sprünge` : ""}</div>
          <div>Flottentempo ${t.fleetSpeed}${slow ? ` · limitiert durch ${esc(slow.name)}` : ""}</div>
          <div style="color:${fuelOk ? "var(--text)" : "var(--danger)"}">Treibstoff Helium-3: benötigt ${fmt(fuelNeed)} · vorhanden ${fmt(fuelHave)}${fuelOk ? "" : " · Nicht genug Treibstoff"}</div>
          ${
            t.mixed && slow
              ? `<div class="hint">Jäger und schnelle Boote warten auf das langsamste Schiff. Für Tempo ${slow.speed} getrennt senden.</div>`
              : ""
          }`;
        const goBtn = document.getElementById("m-go");
        if (goBtn) {
          goBtn.disabled = !fuelOk;
          goBtn.textContent = fuelOk ? "Flotte senden" : "Nicht genug Treibstoff";
        }
        paintAcs(t);
      } catch (err) {
        box.textContent = err.message || "Flugzeit unbekannt.";
      }
    }, 160);
  };
  const paintPreview = () => {
    clearTimeout(previewTimer);
    if (missionSel.value === "spy") {
      previewTimer = setTimeout(async () => {
        const probes = Number(document.querySelector('#ship-picks [data-ship="probe"]')?.value || 0);
        if (probes < 1) {
          previewEl.hidden = false;
          previewEl.className = "preview-box";
          previewEl.innerHTML = `<span class="muted">Mindestens eine Sonde. Erfolg hängt vom Spionagezentrum, der Rasse und der gegnerischen Abwehr ab.</span>`;
          return;
        }
        try {
          const data = await api("/spy/odds", {
            method: "POST",
            body: { planetId: origin.id, targetId, probes },
          });
          previewEl.hidden = false;
          previewEl.className = "preview-box";
          previewEl.innerHTML = `<b>Spionagechance ${data.pct}%</b>
            <div class="muted">Dein Zentrum Stufe ${data.mySpy} · Gegner Stufe ${data.theirSpy} · Entdeckung ~${data.detectPct}%</div>
            <div class="muted">Nyxianer und KI-Taktik heben die Chance, Schilde, Flotte und das gegnerische Zentrum senken sie.</div>`;
        } catch (err) {
          previewEl.hidden = false;
          previewEl.innerHTML = `<span class="danger">${esc(err.message)}</span>`;
        }
      }, 160);
      return;
    }
    if (missionSel.value !== "attack") {
      previewEl.hidden = true;
      previewEl.innerHTML = "";
      return;
    }
    previewTimer = setTimeout(async () => {
      const picked = pickedShips();
      if (!Object.keys(picked).length) {
        previewEl.hidden = false;
        previewEl.className = "preview-box";
        previewEl.innerHTML = `<span class="muted">Schiffe wählen für Kampf-Vorschau.</span>`;
        return;
      }
      try {
        const data = await combatPreview({
          planetId: origin.id,
          targetId,
          ships: picked,
        });
        const win = data.winner === "attacker";
        previewEl.hidden = false;
        previewEl.className = "preview-box " + (win ? "win" : "loss");
        const matrixRows = (data.matrix || [])
          .map((row) => {
            const bits = [
              ...Object.values(row.vsDef || {}).map(
                (v) =>
                  `<span class="${v.mul >= 1.4 ? "mul-good" : v.mul <= 0.6 ? "mul-bad" : "mul-mid"}">${esc(v.name)} ×${v.mul.toFixed(2)}</span>`
              ),
              ...Object.values(row.vsShips || {}).map(
                (v) =>
                  `<span class="${v.mul >= 1.4 ? "mul-good" : v.mul <= 0.6 ? "mul-bad" : "mul-mid"}">${esc(v.name)} ×${v.mul.toFixed(2)}</span>`
              ),
            ];
            return `<tr><td>${esc(row.name)} ×${row.n}</td><td>${bits.join(" · ") || "—"}</td></tr>`;
          })
          .join("");
        previewEl.innerHTML = `<b>${win ? "Prognose: Durchbruch" : "Prognose: Abwehr hält"}</b>
          <div class="muted">Feuerkraft ${fmt(data.atkPower)} vs ${fmt(data.defPower)} · ${data.remnant ? "Piratenbesatzungen " : ""}${data.warlord ? "Warlord " : ""}</div>
          <div class="muted" style="margin-top:6px">Verteidiger: ${shipList(data.defShips, state.catalog) || "—"}</div>
          ${data.defenses && Object.keys(data.defenses).length ? `<div class="muted">Batterien: ${Object.entries(data.defenses)
            .map(([id, n]) => n + "× " + (state.catalog.defenses?.[id]?.name || id))
            .join(", ")}</div>` : ""}
          <table class="vs-matrix"><tbody>${matrixRows}</tbody></table>`;
      } catch (err) {
        previewEl.hidden = false;
        previewEl.innerHTML = `<span class="danger">${esc(err.message)}</span>`;
      }
    }, 180);
  };
  const paintAcs = (t) => {
    const box = document.getElementById("acs-box");
    if (!box) return;
    const isAcs = missionSel.value === "attack" || missionSel.value === "intercept";
    if (!isAcs) {
      box.hidden = true;
      joinFleetId = 0;
      return;
    }
    const strikes = (t || lastTravel)?.strikes || [];
    const holdTicks = Number(document.getElementById("acs-hold-ticks")?.value || 0);
    box.hidden = false;
    const joinRows = strikes.length
      ? strikes
          .map(
            (s) => `<button type="button" class="acs-join ${joinFleetId === s.fleetId ? "on" : ""}" data-join="${s.fleetId}" ${s.canJoin ? "" : "disabled"}>
              <b>${esc(s.name)}${s.own ? " (deine Flotte)" : ""}</b>
              <span>${s.canJoin ? "Beitreten · Tick " + when(s.arrivesAt) : "zu spät — du landest erst im nächsten Tick"}</span>
            </button>`
          )
          .join("")
      : `<div class="muted">Keine Allianz-Flotte unterwegs. Halte extra Ticks, damit langsamere Verbündete denselben Tick treffen.</div>`;
    box.innerHTML = `<div class="acs-head">${missionSel.value === "intercept" ? "Verteidigungsverbund" : "Verbundschlag"}</div>
      <p class="hint">1 Tick = 5 Minuten. Alle Allianz-Flotten, die im selben Tick ankommen, kämpfen als eine Flotte (max. 8). Schnellere Flotten halten Ticks, bis die weiteste da ist.</p>
      <div class="acs-hold">
        <label>Halten <input id="acs-hold-ticks" type="number" min="0" max="144" value="${holdTicks}"> Ticks</label>
        ${joinFleetId ? `<button type="button" class="btn ghost small" id="acs-clear">Beitritt lösen</button>` : ""}
      </div>
      <div class="acs-list">${joinRows}</div>`;
    box.querySelectorAll("[data-join]").forEach((b) => {
      b.onclick = () => {
        joinFleetId = Number(b.dataset.join);
        paintTravel();
      };
    });
    box.querySelector("#acs-clear")?.addEventListener("click", () => {
      joinFleetId = 0;
      paintTravel();
    });
    box.querySelector("#acs-hold-ticks")?.addEventListener("change", paintTravel);
  };
  missionSel.onchange = () => {
    if (missionSel.value !== "spy") {
      const picked = pickedShips();
      const hasRealShip = Object.keys(picked).some((id) => id !== "probe");
      if (!hasRealShip) {
        const firstCombat = [...document.querySelectorAll("#ship-picks [data-ship]")]
          .find((input) => input.dataset.ship !== "probe" && Number(input.max || 0) > 0);
        if (firstCombat) firstCombat.value = "1";
      }
    }
    paintCargo();
  };
  document.getElementById("ship-picks").addEventListener("input", () => {
    paintPreview();
    paintTravel();
  });
  document.getElementById("ship-picks").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-ship-max]");
    if (!btn) return;
    ev.preventDefault();
    const input = document.querySelector(`#ship-picks [data-ship="${btn.dataset.shipMax}"]`);
    if (input) {
      input.value = btn.dataset.max;
      paintPreview();
      paintTravel();
    }
  });
  document.getElementById("ships-max")?.addEventListener("click", () => {
    for (const input of document.querySelectorAll("#ship-picks [data-ship]")) {
      input.value = input.max;
    }
    paintPreview();
    paintTravel();
  });
  document.getElementById("ships-clear")?.addEventListener("click", () => {
    for (const input of document.querySelectorAll("#ship-picks [data-ship]")) {
      input.value = 0;
    }
    paintPreview();
    paintTravel();
  });
  paintCargo();
  paintTravel();
  document.getElementById("m-cancel").onclick = hideModal;
  const goBtn = document.getElementById("m-go");
  if (goBtn) {
    goBtn.textContent = "Flotte senden";
    goBtn.disabled = false;
  }
  document.getElementById("m-go").onclick = async () => {
    const epoch=focusEpoch;
    const picked = {};
    for (const input of document.querySelectorAll("#ship-picks [data-ship]")) {
      const n = Number(input.value || 0);
      if (n > 0) picked[input.dataset.ship] = n;
    }
    if (goBtn.disabled) return;
    goBtn.disabled = true;
    try {
      const snap=await api("/fleet", {
        method: "POST",
        body: {
          planetId: origin.id,
          targetId,
          mission: missionSel.value,
          ships: picked,
          holdMs:
            joinFleetId
              ? 0
              : Math.max(0, Number(document.getElementById("acs-hold-ticks")?.value || 0)) * tickMsFrom(state.catalog),
          joinFleetId: joinFleetId || undefined,
          cargo: Object.fromEntries(
            [...document.querySelectorAll("[data-cargo]")].map((el) => [el.dataset.cargo, Number(el.value || 0)])
          ),
        },
      });
      acceptMissionSnapshot(snap,epoch);
      state.colonizeMode=null;
      hideModal();
      const colonySent = (missionSel.value === "colonize" || missionSel.value === "ally_colonize") && (picked.colony || 0) > 0;
      toast(colonySent
        ? `Kolonieschiff unterwegs nach ${planet.name}. Es bleibt im Flug und wird erst bei der Gründung verbraucht.`
        : "Flotte unterwegs.");
      refresh().catch(()=>{});
    } catch (err) {
      toast(err.message, true);
      goBtn.disabled = false;
    }
  };
}

async function act(fn) {
  const epoch=focusEpoch,planetId=state.snap?.planet?.id;
  snapshotRevision++;
  actionPending++;
  try {
    const snap = await fn();
    if(epoch!==focusEpoch||state.focusPending)return;
    if (snap?.empire) {
      const preview=snap.planet?await getPreview(snap.planet.id).catch(()=>null):null;
      if(epoch!==focusEpoch||state.focusPending)return;
      state.snap=snap;state.preview=preview;
      paintChrome();
      renderView({preserveForm:planetId===snap.planet?.id});
    } else await refresh(undefined,{afterAction:true});
  } catch (err) {
    const msg = String(err?.message || "");
    if(epoch===focusEpoch&&!state.focusPending)renderView();
    const spam = /läuft bereits|already running|already in progress/i.test(msg);
    if (spam) {
      const now = Date.now();
      if (now - state.lastBusyToastAt > 6000) {
        state.lastBusyToastAt = now;
        toast(msg, true);
      }
      return;
    }
    toast(msg, true);
  } finally { actionPending--;updateBuildActions(); }
}

function logoutNow() {
  const form = $("logout")?.closest("form");
  if (form) {
    form.submit();
    return;
  }
  api("/auth/logout", { method: "POST", body: {} }).catch(() => {}).finally(() => {
    location.href = "/";
  });
}

$("nav")?.addEventListener("click",e=>{
  if(e.target.closest("#nav-logout")){e.preventDefault();logoutNow();return;}
  const b=e.target.closest("button[data-view]");
  if(b)setView(b.dataset.view);
});
$("tabbar")?.addEventListener("click", (e) => {
  const openCmd = e.target.closest("[data-open-nav]");
  if (openCmd) {
    const shell = $("game");
    if (shell?.classList.contains("nav-open")) closeNavSheet();
    else openNavSheet();
    return;
  }
  const b = e.target.closest("button[data-view]");
  if (b) setView(b.dataset.view);
});
$("nav-backdrop")?.addEventListener("click", () => closeNavSheet());
$("dock")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cancel]");
  if (b) {
    e.preventDefault();
    e.stopPropagation();
    act(() => api("/queue/cancel", { method: "POST", body: { id: Number(b.dataset.cancel) } }));
    return;
  }
  const jump = e.target.closest("[data-dock-view]");
  if (jump) {$('orders').open=false;syncColonyPointerEvents();jumpTo(jump.dataset.dockView, jump.dataset.dockPlanet);}
});
$("orders")?.addEventListener("toggle", syncColonyPointerEvents);
$("dock")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target.closest("[data-cancel]")) return;
  const jump = e.target.closest("[data-dock-view]");
  if (!jump) return;
  e.preventDefault();
  $('orders').open=false;
  syncColonyPointerEvents();
  jumpTo(jump.dataset.dockView, jump.dataset.dockPlanet);
});
const planetSel = $("planet-select");
if (planetSel) {
  planetSel.onchange = () => {
    const id = Number(planetSel.value);
    if (id) {
      state.cityCam.ready = false;
      switchPlanet(id);
    }
  };
}
$("brand-profile")?.addEventListener("click", () => {
  const id = state.snap?.empire?.id;
  if (id) openEmpireProfile(id);
});

if ($("logout") && !$("logout").closest("form")) {
  $("logout").onclick = () => logoutNow();
}

function bindLoginForm() {}
if ($("register-form")) {
  $("register-form").onsubmit = async (e) => {
    e.preventDefault();
    await authSubmit("/auth/register", Object.fromEntries(new FormData(e.target)));
  };
}

document.querySelectorAll("#auth .tab").forEach((tab) => {
  tab.onclick = () => setAuthTab(tab.dataset.tab);
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-gate]");
  if (b) openGate(b.dataset.gate);
});
$("gate-close")?.addEventListener("click", closeGate);
$("auth")?.addEventListener("click", (e) => {
  if (e.target === $("auth")) closeGate();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeGate();
});

function setAuthTab(name) {
  const login = name !== "register";
  if(!login) loadHumanChallenge();
  document.querySelectorAll("#auth .tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === (login ? "login" : "register")));
  if ($("login-form")) {
    $("login-form").hidden = !login;
    $("login-form").classList.toggle("hidden", !login);
  }
  if ($("register-form")) {
    $("register-form").hidden = login;
    $("register-form").classList.toggle("hidden", login);
  }
  $("auth-card")?.classList.toggle("wide", !login);
  if (!login) fillSpeciesPicker();
}

function openGate(tab) {
  show($("auth"));
  document.body.classList.add("gate-open");
  setAuthTab(tab === "register" ? "register" : "login");
  const first = document.querySelector(tab === "register" ? "#register-form input" : "#login-form input");
  first?.focus();
}

function closeGate() {
  hide($("auth"));
  document.body.classList.remove("gate-open");
}

function showLanding() {
  const boot = $("boot");
  if (boot) {
    boot.classList.add("done", "hidden");
    boot.hidden = true;
  }
  hide($("game"));
  hide($("auth"));
  document.body.classList.add("land");
  document.body.classList.remove("gate-open");
  document.documentElement.classList.remove("play");
  const land = $("landing");
  if (land) {
    land.hidden = false;
    land.classList.remove("hidden");
  }
  bootHeroVideo();
  bindMediaFallbacks(document);
}

function bootHeroVideo() {
  const v = $("land-vid");
  if (!v) return;
  v.play?.().catch(() => {});
  if (v.dataset.softLoop) return;
  v.dataset.softLoop = "1";
  v.addEventListener("timeupdate", () => {
    const d = v.duration;
    if (!d || d < 2) return;
    if (d - v.currentTime < 0.8) v.classList.add("land-vid-fade");
    else v.classList.remove("land-vid-fade");
  });
}

function fillSpeciesPicker() {
  const host = $("species-picker");
  if (!host) return;
  const list = state.catalog?.species || [];
  if (!list.length) return;
  const cur = $("species-input")?.value || "terran";
  host.innerHTML = list
    .map(
      (s) => `<button type="button" class="species-card ${s.id === cur ? "on" : ""}" data-pick="${s.id}">
        <img src="/assets/species/${s.id}.jpg" alt="" />
        <div class="sp-body">
          <h3>${esc(s.glyph)} ${esc(s.name)}</h3>
          <p>${esc(s.blurb)}</p>
          <p class="perk">${esc(s.perk)}</p>
          <p class="flaw">${esc(s.flaw)}</p>
        </div>
      </button>`
    )
    .join("");
  host.querySelectorAll("[data-pick]").forEach((b) => {
    b.onclick = () => {
      $("species-input").value = b.dataset.pick;
      host.querySelectorAll(".species-card").forEach((c) => c.classList.toggle("on", c === b));
    };
  });
}

function setAuthError(msg) {
  for (const id of ["auth-error", "hero-login-error"]) {
    const err = $(id);
    if (!err) continue;
    if (msg) {
      err.hidden = false;
      err.textContent = msg;
    } else {
      err.hidden = true;
      err.textContent = "";
    }
  }
}

async function authSubmit(path, body) {
  setAuthError("");
  const buttons = document.querySelectorAll("#hero-login button, #login-form button, #register-form button, #admin-login");
  buttons.forEach((b) => (b.disabled = true));
  try {
    const result = await api(path, { method: "POST", body });
    if(result.pending) {
      setAuthError(result.message);
      buttons.forEach(b=>b.disabled=false);
      await loadHumanChallenge();
      return;
    }
    state.snap=null;
    await enterGame();
  } catch (e) {
    if(path.includes("register")) await loadHumanChallenge();
    setAuthError(e.message || "Anmeldung fehlgeschlagen.");
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function enterGame() {
  if (!state.catalog) state.catalog = await getCatalog();
  if (!state.snap) state.snap = await getState();
  if (!state.snap?.empire) throw new Error("Kein Imperium geladen.");
  const boot = $("boot");
  if (boot) {
    boot.classList.add("done", "hidden");
    boot.hidden = true;
  }
  hide($("auth"));
  hide($("landing"));
  document.body.classList.remove("land", "gate-open");
  document.body.dataset.mode = "play";
  document.documentElement.classList.add("play");
  const game = $("game");
  if (game) {
    game.hidden = false;
    game.classList.remove("hidden");
    game.style.display = "grid";
  }
  document.body.style.overflow = "hidden";
  document.body.style.height = "100%";
  try {
    paintChrome();
  } catch (err) {
    console.error(err);
  }
  try {
    setView("command");
  } catch (err) {
    console.error(err);
    const v = $("view");
    if (v) v.innerHTML = `<p class="error" style="padding:24px">${esc(err.message)}</p>`;
  }
  if (state.snap.planet) {
    const pid=state.snap.planet.id,epoch=focusEpoch;
    getPreview(pid)
      .then((p) => {
        if(epoch===focusEpoch && pid===state.snap.planet.id)state.preview = p;
      })
      .catch(() => {});
  }
}

const handledCompletions = new Set();
setInterval(() => {
  if (!state.snap) return;
  syncCityLive();
  renderResources();
  renderDock();
  updateShipBudgets();
  updateBuildActions();
  renderAlerts();
  document.querySelectorAll("[data-live-eta]").forEach((el) => {
    const at = Number(el.dataset.liveEta || 0);
    if (at) el.textContent = eta(at - Date.now());
  });
  const due = [
    ...(state.snap.queue || []).filter((q) => q.completesAt <= Date.now()).map((q) => `q:${q.id}:${q.completesAt}`),
    ...(state.snap.fleets || []).filter((f) => f.arrivesAt <= Date.now()).map((f) => `f:${f.id}:${f.arrivesAt}`),
    ...(state.snap.incoming || []).filter(f=>f.kind==='raid' && (f.defending ? f.arrivesAt : f.expiresAt)<=Date.now()).map(f=>`raid:${f.id}:${f.defending ? f.arrivesAt : f.expiresAt}`),
    ...(state.snap.activities || []).filter((a) => a.running && a.readyAt <= Date.now()).map((a) => `a:${a.id}:${a.readyAt}`),
  ];
  const unseen = due.filter((key) => !handledCompletions.has(key));
  if (unseen.length) {
    unseen.forEach((key) => handledCompletions.add(key));
    refresh(undefined, { rerender: false }).then(applied => {
      // Retry skipped/stale responses, and any arrival which the server still lists.
      const remaining=new Set([...(state.snap.fleets||[]).map(f=>`f:${f.id}:${f.arrivesAt}`),...(state.snap.queue||[]).map(q=>`q:${q.id}:${q.completesAt}`),...(state.snap.incoming||[]).filter(f=>f.kind==='raid').map(f=>`raid:${f.id}:${f.defending ? f.arrivesAt : f.expiresAt}`),...(state.snap.activities||[]).filter(a=>a.running).map(a=>`a:${a.id}:${a.readyAt}`)]);
      unseen.forEach(key=>{if(!applied||remaining.has(key))handledCompletions.delete(key);});
      renderDock();if(state.view==='reports' && state.newsTab!=='mail')loadReports(state.newsTab);
    }).catch(() => {unseen.forEach(key=>handledCompletions.delete(key));});
  }
}, 500);

setInterval(() => {
  if (state.snap) refresh(undefined, { rerender: false }).then(() => { renderDock(); if(state.view==="reports" && state.newsTab!=="mail") loadReports(state.newsTab); }).catch(() => {});
}, 30000);

async function boot() {
  try {
    state.catalog = await getCatalog();
    fillSpeciesPicker();
  } catch (err) {
    console.warn(err);
  }
  try {
    state.snap = await getState();
    if (state.snap?.empire) {
      await enterGame();
      return;
    }
  } catch (err) {
    if(err.status !== 401) console.warn(err);
  }
  showLanding();
}

boot().catch(() => showLanding());

function openGuide() {
  const i = Math.min(tutorialIndex(), TUTORIAL.length - 1), step = TUTORIAL[i];
  showModal(`<div class="sheet panel" style="max-width:400px"><p class="muted">Erste Schritte ${i+1}/${TUTORIAL.length}</p><h2>${esc(step.title)}</h2><p>${esc(step.text)}</p><div class="row" style="flex-wrap:wrap;gap:8px">${step.plot ? `<button class="btn" data-guide-building>Gebäude öffnen</button>` : ""}<button class="btn primary" data-guide-next>${i === TUTORIAL.length-1 ? "Abschließen" : "Weiter"}</button><button class="btn ghost" data-guide-close>Später</button></div></div>`);
  document.querySelector("[data-guide-next]").onclick = () => { setTutorialIndex(i+1); if (i+1 < TUTORIAL.length) openGuide(); else { hideModal(); syncCityLive(); } };
  document.querySelector("[data-guide-close]").onclick = () => { hideModal(); syncCityLive(); };
  document.querySelector("[data-guide-building]")?.addEventListener("click", () => { hideModal(); state.cityBuilding = step.plot; state.cityScene?.focus(step.plot); state.cityScene?.setSelected(step.plot); syncCityLive(); });
}

async function loadHumanChallenge() {
  const form=$("register-form"); if(!form) return;
  try {
    const challenge=await api("/auth/challenge");
    $("human-question").textContent=challenge.question;
    form.elements.challengeId.value=challenge.id;form.elements.answer.value="";
  } catch(err) { $("human-question").textContent=err.message;form.elements.challengeId.value=""; }
}
$("human-refresh")?.addEventListener("click",loadHumanChallenge);

function openYardSheet(){setView("yard");}

const layoutObserver=new ResizeObserver(()=>{
 const top=document.querySelector('.topbar')?.getBoundingClientRect().bottom||60;
 const bottom=innerHeight-($('tabbar')?.getBoundingClientRect().top||innerHeight);
 document.documentElement.style.setProperty('--game-top',top+'px');
 document.documentElement.style.setProperty('--game-bottom',bottom+'px');
});
for(const el of [document.querySelector('.topbar'),$('tabbar')])if(el)layoutObserver.observe(el);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&hasCommandPanel()&&$('modal')?.hidden){e.preventDefault();closeCommandPanel();}});
