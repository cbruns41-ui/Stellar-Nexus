import { api, getState, getCatalog, getPreview, getGalaxy, getSystem, getReports, getRanks, getEmpire, combatPreview, combatSim, getAlliances, getAlliance, getAllianceActivity } from "./api.js";
import { esc, fmt, eta, when, costHtml, planetCss, planetGlobeUrl, planetColonyUrl, mediaTag, bindMediaFallbacks, toast, showModal, hideModal, shipList, starfield, resourceIcon, icon, beep, notify, tickEta, ticksOf, tickMsFrom } from "./ui.js";
import { createMap, systemHtml } from "./map.js?v=46";
import { battleReplayHtml, bindBattleReplays } from "./battle.js";

const $ = (id) => document.getElementById(id);

const state = {
  catalog: null,
  snap: null,
  preview: null,
  view: localStorage.getItem("sn-view") || "command",
  galaxy: null,
  map: null,
  chatChannel: "global",
  mailPeer: null,
  newsTab: "reports",
  openReports: new Set(),
};

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

function have() {
  const p = state.snap?.planet;
  const out = {};
  for (const k of resourceIds()) out[k] = p ? liveRes(k) : 0;
  return out;
}

function liveRes(k) {
  const p = state.snap.planet;
  if (!p) return 0;
  const dt = (Date.now() - p.lastTick) / 3_600_000;
  const cap = typeof p.storage === "object" ? p.storage[k] : p.storage;
  return Math.min(cap || 9000, (p[k] || 0) + (p.production?.[k] || 0) * dt);
}

function renderResources() {
  const p = state.snap?.planet;
  const el = $("resources");
  if (!el) return;
  if (!p) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = resourceIds()
    .map((k) => {
      const def = state.catalog.resources[k];
      const v = liveRes(k);
      const cap = typeof p.storage === "object" ? p.storage[k] : p.storage;
      const prod = p.production[k] || 0;
      const pct = Math.min(100, Math.round((v / Math.max(1, cap)) * 100));
      const full = pct >= 92;
      return `<div class="res${full ? " full" : ""}" data-k="${k}" title="${esc(def.name)}: ${fmt(v)} / ${fmt(cap)} · +${fmt(prod)}/h">
        <img class="res-art" src="/assets/resources/${k}.jpg" alt="" />
        <div class="res-meta">
          <em>${esc(def.short || def.name)}</em>
          <b style="color:${full ? "var(--danger)" : def.color}">${fmt(v)}</b>
          <small>+${fmt(prod)}/h</small>
        </div>
        <i class="fill" style="width:${pct}%;background:${def.color}"></i>
      </div>`;
    })
    .join("");
  const e = state.snap.empire;
  el.innerHTML += `<div class="res nex" data-k="nex" data-goto="nexus" title="Nex — Premium-Währung für Spezieswechsel und Spezialangebote">
      <img class="res-art" src="/assets/nex.jpg" alt="" />
      <div class="res-meta">
        <em>Nex</em>
        <b>${fmt(e.nex || 0)}</b>
        <small>${e.nexDailyReady ? "Tagesbonus bereit" : "Premium"}</small>
      </div>
    </div>`;
  const clock = $("clock");
  if (clock) clock.textContent = new Date().toLocaleTimeString("de-DE");
  el.querySelector("[data-goto]")?.addEventListener("click", () => setView("nexus"));
}

function renderDock() {
  const dock = $("dock");
  if (!dock) return;
  const q = state.snap?.queue || [];
  const f = state.snap?.fleets || [];
  const incoming = state.snap?.incoming || [];
  const acts = (state.snap?.activities || []).filter((a) => a.running);
  if (!q.length && !f.length && !incoming.length && !acts.length) {
    dock.innerHTML = `<div class="muted" style="align-self:center">Keine aktiven Aufträge.</div>`;
    return;
  }
  const t = Date.now();
  const incomingHtml = incoming
    .map((hit) => {
      const pct = clamp(((t - (hit.departedAt || hit.arrivesAt - 90000)) / Math.max(1, hit.arrivesAt - (hit.departedAt || hit.arrivesAt - 90000))) * 100, 0, 100);
      const kind = hit.kind === "spy" ? "SCAN" : hit.kind === "raid" ? "RAID" : "ANGRIFF";
      return `<div class="fleet-item panel dock-jump hostile" role="button" tabindex="0" data-dock-view="galaxy" data-dock-planet="${hit.planetId || ""}" title="Zur Galaxie">
          <b>${kind}</b>
          <span>${esc(hit.from)} → ${esc(hit.planet)}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <span>${eta(hit.arrivesAt - t)}</span>
        </div>`;
    })
    .join("");
  const queueHtml = q
    .map((item) => {
      const pct = clamp(((t - item.startedAt) / Math.max(1, item.completesAt - item.startedAt)) * 100, 0, 100);
      const kind =
        item.kind === "building" ? "BAU" : item.kind === "ship" ? "WERFT" : item.kind === "defense" ? "ORBIT" : "FORSCHUNG";
      const view = queueViewOf(item.kind);
      return `<div class="queue-item panel dock-jump" role="button" tabindex="0" data-dock-view="${view}" data-dock-planet="${item.planetId || ""}" title="${esc(kind)} öffnen">
          <b>${kind}</b>
          <span>${esc(item.name)}${item.qty > 1 ? " ×" + item.qty : ""}${item.levelTo ? " → " + item.levelTo : ""}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="row"><span>${eta(item.completesAt - t)}</span>
            <button class="btn ghost small" data-cancel="${item.id}">Abbruch</button></div>
        </div>`;
    })
    .join("");
  const fleetHtml = f
    .map((fl) => {
      const pct = clamp(((t - fl.departedAt) / Math.max(1, fl.arrivesAt - fl.departedAt)) * 100, 0, 100);
      const label = fl.returning ? "RÜCKFLUG" : (state.catalog.missions[fl.mission]?.name || fl.mission).toUpperCase();
      return `<div class="fleet-item panel dock-jump" role="button" tabindex="0" data-dock-view="fleets" data-dock-planet="${fl.originPlanetId || ""}" title="Zur Flotte">
          <b>${label}</b>
          <span>${esc(fl.originName)} → ${esc(fl.targetName)}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <span>${eta(fl.arrivesAt - t)}</span>
        </div>`;
    })
    .join("");
  const actHtml = acts
    .map((a) => {
      const pct = clamp(((Date.now() - (a.startedAt || Date.now() - a.wait)) / Math.max(1, (a.readyAt || Date.now()) - (a.startedAt || Date.now() - a.wait))) * 100, 0, 100);
      return `<div class="queue-item panel dock-jump" role="button" tabindex="0" data-dock-view="activity" title="Zur Einsatzzentrale">
          <b>EINSATZ</b>
          <span>${esc(a.name)} · ${esc(a.durationName || "")}</span>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <span>${eta(a.wait)}</span>
        </div>`;
    })
    .join("");
  dock.innerHTML = incomingHtml + queueHtml + fleetHtml + actHtml;
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
  const view = $("view");
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
  const root = $("view");
  if (!root) return null;
  const data = {};
  root.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.type === "file" || el.type === "hidden" || el.type === "password") return;
    const key = formFieldKey(el);
    if (!key) return;
    data[key] = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
  });
  return { view: state.view, data };
}

function restoreViewForm(draft) {
  const root = $("view");
  if (!root || !draft || draft.view !== state.view) return;
  root.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.type === "file" || el.type === "hidden" || el.type === "password") return;
    const key = formFieldKey(el);
    if (!key || !(key in draft.data)) return;
    const val = draft.data[key];
    if (el.type === "checkbox" || el.type === "radio") el.checked = !!val;
    else el.value = val;
  });
}

async function jumpTo(view, planetId) {
  const pid = Number(planetId);
  if (pid && pid !== state.snap?.planet?.id) {
    try {
      const snap = await api("/focus", { method: "POST", body: { planetId: pid } });
      if (snap?.empire) {
        state.snap = snap;
        paintChrome();
      }
    } catch {
      /* stay on current planet */
    }
  }
  if (view === "galaxy" && pid) {
    const pl = (state.snap?.planets || []).find((p) => p.id === pid) || state.snap?.planet;
    state.mapFocus = { planetId: pid, systemId: pl?.systemId || pl?.system_id };
  }
  setView(view);
}

function bindJumps(root) {
  if (!root) return;
  root.querySelectorAll("[data-view-jump]").forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
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
      add("defense", "Orbit verstärken");
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
  const more = $("tabbar")?.querySelector("[data-tab='more']");
  if (more) more.classList.toggle("on", tabIdFor(state.view) === "more");
}

function openNavSheet() {
  const shell = $("game");
  const backdrop = $("nav-backdrop");
  if (shell) shell.classList.add("nav-open");
  show(backdrop);
  $("tabbar")?.querySelector("[data-tab='more']")?.classList.add("on");
}

function tabIdFor(view) {
  if (view === "command") return "home";
  if (view === "infra" || view === "yard" || view === "defense" || view === "research" || view === "tree") return "build";
  if (view === "galaxy") return "map";
  if (view === "fleets") return "fleet";
  return "more";
}

function setView(name) {
  state.view = name || "command";
  try {
    localStorage.setItem("sn-view", state.view);
  } catch {
    /* ignore */
  }
  const nav = $("nav");
  if (nav) {
    for (const b of nav.querySelectorAll("button")) b.classList.toggle("on", b.dataset.view === state.view);
  }
  const tabs = $("tabbar");
  const tab = tabIdFor(state.view);
  if (tabs) {
    for (const b of tabs.querySelectorAll("button[data-tab]")) {
      b.classList.toggle("on", b.dataset.tab === tab);
    }
  }
  const shell = $("game");
  if (shell) {
    shell.classList.toggle("view-galaxy", state.view === "galaxy");
    shell.classList.toggle("view-home", state.view === "command");
  }
  closeNavSheet();
  renderView({ preserveForm: false });
}

async function refresh(planetId, { rerender = true } = {}) {
  state.snap = await getState(planetId);
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
  if (rerender && liveRerender()) renderView();
  if (state.snap.planet) {
    getPreview(state.snap.planet.id)
      .then((p) => {
        state.preview = p;
        if (rerender && liveRerender()) renderView();
      })
      .catch(() => {
        state.preview = null;
      });
  }
  if (state.view === "galaxy" && state.map) {
    try {
      state.galaxy = await getGalaxy();
      state.map.setData(state.galaxy);
    } catch {
      /* map stays */
    }
  }
}

function liveRerender() {
  if (isViewEditing()) return false;
  const skip = new Set(["galaxy", "chat", "reports", "sim", "alliance", "settings", "moderation"]);
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
    sel.innerHTML = (s.planets || [])
      .map((p) => `<option value="${p.id}">${p.isAlliance ? `[${esc(s.alliance?.tag || "ALLY")}] ` : ""}${esc(p.name)}</option>`)
      .join("");
    sel.value = cur;
  }
  const hints = s.hints || {};
  const moreKeys = ["economy", "nexus", "activity", "reports", "chat", "alliance"];
  const buildN = (Number(hints.infra) || 0) + (Number(hints.yard) || 0) + (Number(hints.defense) || 0) + (Number(hints.research) || 0);
  const moreN = moreKeys.reduce((n, k) => n + (Number(hints[k]) || 0), 0);
  const badgeMap = { ...hints, more: moreN, infra: buildN || hints.infra || 0, reports: hints.reports || s.unread || 0, chat: hints.chat || s.unreadChat || 0 };
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
  const el = $("alert-strip");
  if (!el) return;
  const hits = state.snap?.incoming || [];
  const shell = $("game");
  if (!hits.length) {
    el.hidden = true;
    el.classList.add("hidden");
    el.innerHTML = "";
    el.onclick = null;
    el.onkeydown = null;
    if (shell) shell.classList.remove("has-alert");
    return;
  }
  if (shell) shell.classList.add("has-alert");
  const soon = hits[0];
  el.hidden = false;
  el.classList.remove("hidden");
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.title = "Zur Galaxie";
  el.innerHTML = `<b>ALARM</b>
    <span>${esc(soon.from)} → ${esc(soon.planet)} · ${esc(soon.kind === "spy" ? "Spionage" : soon.kind === "raid" ? "Raid" : "Angriff")}</span>
    <span class="muted">${eta(soon.arrivesAt - Date.now())}</span>
    <span class="muted">${hits.length > 1 ? hits.length + " Signale" : shipList(soon.ships, state.catalog)}</span>
    <span class="alert-go">Zur Galaxie →</span>`;
  el.onclick = () => jumpTo("galaxy", soon.planetId);
  el.onkeydown = (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      jumpTo("galaxy", soon.planetId);
    }
  };
}

function renderView({ preserveForm = true } = {}) {
  const v = $("view");
  if (!v) return;
  const draft = preserveForm ? snapshotViewForm() : null;
  try {
    if (state.map) {
      state.map.destroy();
      state.map = null;
    }
    const fn = views[state.view] || views.command;
    const rail = buildRailHtml();
    v.innerHTML = rail + fn();
    const shell = $("game");
    if (shell) {
      shell.classList.toggle("view-galaxy", state.view === "galaxy");
      shell.classList.toggle("view-home", state.view === "command");
    }
    if (draft) restoreViewForm(draft);
    bindView(v);
    bindMediaFallbacks(v);
  } catch (err) {
    console.error(err);
    v.innerHTML = `<p class="error">Ansicht fehlgeschlagen: ${esc(err.message)}</p>`;
  }
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
  if (h.defense) push("defense", "Orbit frei", "Batterien können gebaut werden", 1);
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
  return `<section class="contracts">
    <div class="section-title"><h2>Tagesorder${dailyOpen ? `<i class="page-badge">${dailyOpen}</i>` : ""}</h2><span class="muted">wechselt um Mitternacht · skaliert mit deinem Fortschritt · Piratenstufe ${threat}</span></div>
    <div class="contract-list">${ops}</div>
    <div class="section-title" style="margin-top:16px"><h2>Wochenorder${weeklyOpen ? `<i class="page-badge">${weeklyOpen}</i>` : ""}</h2><span class="muted">eine größere Aufgabe pro ISO-Woche</span></div>
    <div class="contract-list">${weekly}</div>
    <div class="section-title" style="margin-top:16px"><h2>Kampagne${readyContracts ? `<i class="page-badge">${readyContracts}</i>` : ""}</h2><span class="muted">${readyContracts ? `${readyContracts} abholbereit · ` : ""}${esc(next?.text || "")}</span></div>
    <div class="contract-list">${rows}</div>
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
          <p>${res ? `${esc(res.name)} · +${fmt(prod)}/h` : esc(b.blurb)}</p>
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
      <div class="section-title" style="margin-top:18px"><h2>Hangar</h2><span class="muted">stationierte Flotte</span></div>
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
        <p><b>${esc(planet.name)}</b> · Führung und gewählte Mitglieder bauen hier Gebäude, Werft, Verteidigung und Allianzforschung.</p>
        ${detail.canManagePlanet ? `<button class="btn primary" type="button" id="ally-open-planet">Planet öffnen</button>` : `<p class="muted">Kein Zugang. Anführer kann dich freischalten.</p>`}
        ${grants ? `<div style="margin-top:12px"><h3 style="font-size:13px;margin:0 0 6px">Zugang</h3><p class="muted">Anführer und Co-Leader haben immer Zugang.</p>${grants}</div>` : ""}
      </div>`
    : `<div class="ally-planet-card panel">
        <div class="section-title"><h2>Allianz-Planet</h2><span class="muted">noch unbesiedelt</span></div>
        <p>Die Führung kann einen freien Planeten als Allianz-Welt kolonisieren (Galaxie → Mission → Als Allianz-Planet besiedeln). Dort entstehen geteilte Bauten und Forschungen, die alle Mitglieder verstärken.</p>
      </div>`;
  const research = (detail.research || [])
    .map((r) => {
      const pct = Math.round((r.progress || 0) * 100);
      const done = r.level >= r.max;
      const remaining = r.remaining || {};
      const donate = done
        ? ""
        : `<div class="research-donate">${Object.keys(r.cost || {})
            .filter((id) => (r.cost[id] || 0) > 0)
            .map(
              (id) => `<label>${esc(state.catalog.resources[id]?.name || id)}
                <input type="number" min="0" max="${remaining[id] || 0}" value="0" data-donate-res="${r.id}" data-res="${id}">
              </label>`
            )
            .join("")}</div>
          <button class="btn ghost small" type="button" data-ally-donate="${r.id}">Vom Fokus-Planeten spenden</button>`;
      return `<div class="intel-block">
        <h4>${esc(r.name)} · Stufe ${r.level}/${r.max}</h4>
        <p class="muted">${esc(r.blurb)}</p>
        ${done ? `<span class="chip ok">Max</span>` : `<div class="ally-progress"><i style="width:${pct}%"></i></div><div class="muted">${pct}% finanziert</div>${donate}`}
      </div>`;
    })
    .join("");
  return `${planetBlock}
    <div class="ally-planet-card panel">
      <div class="section-title"><h2>Allianzforschung</h2><span class="muted">Boni für alle</span></div>
      ${allianceBoostChips()}
      ${research}
      ${detail.canManagePlanet && planet ? `<button class="btn ghost small" type="button" id="ally-goto-research">Forschung am Planeten</button>` : `<p class="muted">Spenden und Aufträge laufen über den Allianz-Planeten oder den Forschungs-Tab, wenn du ihn fokussiert hast.</p>`}
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
      const donate = Object.keys(cost)
        .filter((id) => (cost[id] || 0) > 0)
        .map(
          (id) => `<label>${esc(state.catalog.resources[id]?.name || id)}
            <input type="number" min="0" max="${remaining[id] || cost[id] || 0}" value="0" data-donate-res="${r.id}" data-res="${id}">
          </label>`
        )
        .join("");
      const action = done
        ? `<div class="ok">Abgeschlossen</div>`
        : `<button class="btn ghost small" data-ally-donate="${r.id}">Spenden</button>
           ${canQueue ? `<button class="btn primary small" data-ally-tech="${r.id}" ${busy ? "disabled" : ""}>Auftrag (Planet)</button>` : ""}`;
      return `<article class="og-row panel">
        <img class="og-art" src="${esc(r.art || "/assets/techs/ai.jpg")}" alt="" />
        <div class="og-body">
          <h3>${esc(r.name)} <span class="lvl">Stufe ${r.level} / ${r.max}</span></h3>
          <p>${esc(r.blurb)}</p>
          ${done ? "" : `<div class="ally-progress" title="${pct}%"><i style="width:${pct}%"></i></div>
            <div class="muted">Finanziert ${pct}% · deine Spende ${fmt(r.mine || 0)}</div>
            ${costHtml(remaining, have(), state.catalog)}
            <div class="research-donate">${donate}</div>`}
        </div>
        <div class="og-act">${action}</div>
      </article>`;
    })
    .join("");
  return `<div class="section-title"><h2>Allianzforschung</h2><span class="muted">Boni für alle Mitglieder</span></div>
    ${allianceBoostChips()}
    <p class="hint">Spenden vom aktuellen Planeten oder — auf dem Allianz-Planeten — einen Forschungsauftrag starten. Boni wirken sofort nach Abschluss für die ganze Allianz.</p>
    <div class="og-list">${cards || `<div class="muted">Keine Allianzforschung.</div>`}</div>`;
}

function buildRailHtml() {
  if (!["infra", "research", "tree", "galaxy", "yard", "defense"].includes(state.view)) return "";
  const item = (id, label) =>
    `<button type="button" class="${state.view === id ? "on" : ""}" data-view-jump="${id}">${label}</button>`;
  return `<nav class="build-rail" aria-label="Schnellzugriff">${item("infra", "Gebäude")}${item("research", "Forschung")}${item("tree", "Tech-Tree")}${item("galaxy", "Galaxie")}${item("yard", "Werft")}${item("defense", "Orbit")}</nav>`;
}

function homeStatusCards() {
  const t = Date.now();
  const q = (state.snap.queue || [])[0];
  const hit = (state.snap.incoming || [])[0];
  const qHtml = q
    ? `<button type="button" class="home-card panel" data-view-jump="${queueViewOf(q.kind)}" data-jump-planet="${q.planetId || ""}">
        <em>Bau-Queue</em>
        <h3>${esc(q.name)}${q.qty > 1 ? " ×" + q.qty : ""}${q.levelTo ? " → " + q.levelTo : ""}</h3>
        <div class="bar"><i style="width:${clamp(((t - q.startedAt) / Math.max(1, q.completesAt - q.startedAt)) * 100, 0, 100)}%"></i></div>
        <span>${eta(q.completesAt - t)}</span>
      </button>`
    : `<div class="home-card panel empty"><em>Bau-Queue</em><h3>Leer</h3><span class="muted">Werft und Gebäude still</span></div>`;
  const hHtml = hit
    ? `<button type="button" class="home-card panel hostile" data-view-jump="galaxy" data-jump-planet="${hit.planetId || ""}">
        <em>Eingehend</em>
        <h3>${esc(hit.from)} → ${esc(hit.planet)}</h3>
        <div class="bar"><i style="width:${clamp(((t - (hit.departedAt || hit.arrivesAt - 90000)) / Math.max(1, hit.arrivesAt - (hit.departedAt || hit.arrivesAt - 90000))) * 100, 0, 100)}%"></i></div>
        <span>${eta(hit.arrivesAt - t)}</span>
      </button>`
    : `<div class="home-card panel empty"><em>Eingehend</em><h3>Kein Alarm</h3><span class="muted">Orbit ruhig</span></div>`;
  return `<div class="home-status">${qHtml}${hHtml}</div>
    <div class="home-quick">
      <button type="button" class="btn" data-view-jump="infra">Gebäude</button>
      <button type="button" class="btn" data-view-jump="yard">Werft</button>
      <button type="button" class="btn" data-view-jump="galaxy">Galaxie</button>
      <button type="button" class="btn" data-view-jump="activity">Einsatz</button>
    </div>`;
}

const views = {
  command() {
    const p = state.snap.planet;
    if (!p) return `<p>Kein Planet.</p>`;
    const e = state.snap.empire;
    const builtN = Object.values(p.buildings || {}).filter((n) => n > 0).length;
    const prodRows = resourceIds()
      .map((k) => {
        const def = state.catalog.resources[k];
        const cap = p.storage[k] || p.storage;
        return `<tr>
          <td>${resourceIcon(k)} ${esc(def.name)}</td>
          <td style="color:${def.color}"><b>${fmt(liveRes(k))}</b></td>
          <td class="muted">/ ${fmt(cap)}</td>
          <td style="color:${def.color}">+${fmt(p.production[k] || 0)}/h</td>
        </tr>`;
      })
      .join("");
    const plist = (state.snap.planets || [])
      .map(
        (pl) =>
          `<button type="button" class="${pl.id === p.id ? "on" : ""}" data-focus="${pl.id}">
            <img class="planet-thumb" src="${planetGlobeUrl(pl.type)}" alt="" />
            <span>${pl.isAlliance ? `[${esc(state.snap.alliance?.tag || "ALLY")}] ` : ""}${esc(pl.name)}<div class="muted">${esc(pl.typeName || "")}${pl.isAlliance ? " · Allianz" : ""}</div></span>
          </button>`
      )
      .join("");
    return `
      <section class="colony-hero panel home-hero">
        ${mediaTag(planetColonyUrl(p.type), "colony-vista")}
        <div class="hero-veil"></div>
        <div class="hero-copy">
          <h2>${p.isAlliance ? `<span class="chip ok">Allianz ${esc(p.allianceTag || state.snap.alliance?.tag || "")}</span> ` : ""}${esc(p.name)}</h2>
          <div>${esc(p.systemName)} · ${esc(p.typeName)} · Größe ${p.size}${p.isHub ? " · Nexus-Hub" : ""}</div>
        </div>
      </section>
      ${homeStatusCards()}
      <div class="og-overview">
        <div class="og-planet-box panel">
          <div class="planet-orb" data-type="${p.type}" style="background:${planetCss(p.type)}">${mediaTag(planetGlobeUrl(p.type), "planet-orb-media")}</div>
          <h3>${esc(p.name)}</h3>
          <div class="muted">${esc(p.systemName)} · ${esc(p.typeName)} · Größe ${p.size}</div>
        </div>
        <div class="og-meta panel">
          <div class="desk-only"><b>Commander</b> ${esc(state.snap.user.username)} · ${esc(e.name)}</div>
          <div class="desk-only"><b>Spezies</b> ${esc(state.snap.species?.glyph || "")} ${esc(state.snap.species?.name || "Terraner")}
            · ${esc(state.snap.species?.perk || "")}</div>
          <div class="desk-only"><b>Piraten-Bedrohung</b> Stufe ${e.raidLevel || 1} (an deine Flotte und Technik angepasst)</div>
          <div class="desk-only"><b>Position</b> Galaxie ${p.galaxyIndex || 1} → ${esc(p.systemName)}</div>
          ${
            e.newbieLeft
              ? `<div class="ok keep"><b>Anfängerschutz</b> noch ${eta(e.newbieLeft)}</div>`
              : `<div class="muted desk-only"><b>Fair-Play</b> Starke Imperien dürfen nur Spieler mit mindestens 25 % ihrer Punkte angreifen. Max. 5 Angriffe / 24 Std. gegen denselben Commander.</div>`
          }
          <div class="desk-only"><b>Biom</b> ${esc(p.typeName)} ${p.isHub ? "· Nexus-Hub" : ""}</div>
          <div class="keep"><b>Direktive</b>
            <select id="directive-select" data-planet="${p.id}">
              <option value="">— keine —</option>
              ${Object.values(state.snap.directives || {})
                .map((d) => `<option value="${d.id}" ${p.directive === d.id ? "selected" : ""}>${esc(d.name)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="desk-only"><b>Felder</b> ${builtN} Gebäude · ${e.planetCount}/${e.planetCap} Welten</div>
          <div class="keep"><b>Commander</b> Stufe ${e.level || 1} · ${e.score || 0} Punkte</div>
          <table class="table prod-table desk-only" style="margin-top:10px">${prodRows}</table>
        </div>
        <div class="og-planets panel desk-only">
          <div class="muted" style="margin-bottom:8px">Kolonien</div>
          ${plist}
        </div>
      </div>
      ${state.snap.rift ? `<p class="hint">Nexus-Riss über <b>${esc(state.snap.rift.name)}</b> · Expeditionen dort lohnen extra · ${eta(state.snap.rift.until - Date.now())}</p>` : ""}
      ${(state.snap.queue || []).some((q) => q.completesAt - Date.now() > 180000)
        ? `<p class="hint">Lange Bauten? Die <button class="btn ghost small" data-view-jump="activity">Einsatzzentrale</button> hält dich beschäftigt: Patrouille, Trümmer-Scan, Funknetz, Simulator.</p>`
        : ""}
      ${actionBoard()}
      ${contractsPanel()}
      ${colonyOverview(p)}`;
  },

  infra() {
    const p = state.snap.planet;
    const prev = Object.fromEntries((state.preview?.buildings || []).map((b) => [b.id, b]));
    const busy = state.snap.queue.some((q) => q.kind === "building" && q.planetId === p.id);
    const rows = Object.values(state.catalog.buildings)
      .map((b) => {
        const info = prev[b.id] || { level: p.buildings[b.id] || 0, unlocked: true };
        let action = "";
        if (!info.unlocked) action = `<div class="lock">Voraussetzungen fehlen</div>`;
        else if (info.max) action = `<div class="ok">Maximalstufe</div>`;
        else
          action = `<button class="btn primary" data-build="${b.id}" ${busy ? "disabled" : ""}>Ausbau auf Stufe ${(info.level || 0) + 1}</button>
            <div class="muted">${info.nextTime ? eta(info.nextTime * 1000) : ""}</div>`;
        return `<article class="og-row panel">
          <img class="og-art" src="/assets/buildings/${b.id}.jpg" alt="" />
          <div class="og-body">
            <h3>${esc(b.name)} <span class="lvl">Stufe ${info.level || 0}</span></h3>
            <p>${esc(b.blurb)}</p>
            ${reqHtml(b.requires)}
            ${unlockHtml("building", b.id)}
            ${info.max || !info.unlocked ? "" : costHtml(info.nextCost, have(), state.catalog)}
          </div>
          <div class="og-act">${action}</div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Gebäude</h2><span class="muted">${p.isAlliance ? "Allianz-Planet · " : ""}${esc(p.name)}</span></div>${p.isAlliance ? `<p class="hint">Bauten hier nutzen Allianz-Ressourcen und helfen der ganzen Allianz.</p>` : ""}<div class="og-list">${rows}</div>`;
  },

  yard() {
    const p = state.snap.planet;
    const prev = Object.fromEntries((state.preview?.ships || []).map((s) => [s.id, s]));
    const busy = state.snap.queue.some((q) => q.kind === "ship" && q.planetId === p.id);
    const rows = Object.values(state.catalog.ships)
      .map((s) => {
        const info = prev[s.id] || { unlocked: false, cost: s.cost, time: s.time };
        const haveN = p.ships[s.id] || 0;
        const action = !info.unlocked
          ? `<div class="lock">Voraussetzungen fehlen</div>`
          : `<label class="muted">Anzahl <input data-qty="${s.id}" type="number" min="1" max="20" value="1" style="width:64px;margin-left:6px"></label>
             <button class="btn primary" data-ship="${s.id}" ${busy ? "disabled" : ""}>Bauen</button>
             <div class="muted">${eta((info.time || s.time) * 1000)}</div>`;
        return `<article class="og-row panel">
          ${mediaTag(`/assets/ships/${s.id}.jpg`, "og-art og-art-ship")}
          <div class="og-body">
            <h3>${esc(s.name)} <span class="lvl">vorhanden: ${haveN}</span></h3>
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
    return `<div class="section-title"><h2>Schiffswerft</h2><span class="muted">${p.isAlliance ? "Allianz-Planet · " : ""}${esc(p.name)}</span></div>
      <p class="hint">Tempo = Reisegeschwindigkeit. Eine gemischte Flotte fliegt so schnell wie das langsamste Schiff. Weite Systeme brauchen länger.</p>
      <p class="hint">Schiffslimit: ${p.shipCount || 0} / ${p.shipCap || 0}${state.snap.empire?.shipCapBonus ? " · Werft-Turbine +" + state.snap.empire.shipCapBonus : ""}${(state.snap.empire?.shipCapBoostUntil && state.snap.empire.shipCapBoostUntil > Date.now()) ? " · +20 % bis " + new Date(state.snap.empire.shipCapBoostUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
      <div class="og-list">${rows}</div>`;
  },

  defense() {
    const p = state.snap.planet;
    const prev = Object.fromEntries((state.preview?.defenses || []).map((d) => [d.id, d]));
    const busy = state.snap.queue.some((q) => q.kind === "defense" && q.planetId === p.id);
    const rows = Object.values(state.catalog.defenses || {})
      .map((d) => {
        const info = prev[d.id] || { unlocked: false, cost: d.cost, time: d.time, have: p.defenses?.[d.id] || 0 };
        const haveN = p.defenses?.[d.id] || info.have || 0;
        const action = !info.unlocked
          ? `<div class="lock">Voraussetzungen fehlen</div>`
          : `<label class="muted">Anzahl <input data-dqty="${d.id}" type="number" min="1" max="20" value="1" style="width:64px;margin-left:6px"></label>
             <button class="btn primary" data-defense="${d.id}" ${busy ? "disabled" : ""}>Bauen</button>
             <div class="muted">${eta((info.time || d.time) * 1000)}</div>`;
        return `<article class="og-row panel">
          <img class="og-art" src="/assets/defenses/${d.id}.jpg" alt="" />
          <div class="og-body">
            <h3>${esc(d.name)} <span class="lvl">vorhanden: ${haveN}</span></h3>
            <p>${esc(d.blurb)}</p>
            ${reqHtml(d.requires)}
            ${vsPills(d.vs)}
            <div class="meta"><span>Angriff ${d.attack}</span><span>Hülle ${d.hull + d.shield}</span><span>${esc(d.strongVs || "")}</span></div>
            ${info.unlocked ? costHtml(info.cost, have(), state.catalog) : ""}
          </div>
          <div class="og-act">${action}</div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Verteidigung</h2><span class="muted">${p.isAlliance ? "Allianz-Planet · " : ""}${esc(p.name)} · Gegen-Typen im Orbit</span></div>
      <p class="hint">Flak frisst Jäger, Raketen Fregatten, Ionen Kreuzer, Gauss Zerstörer. Schildkuppeln puffern alles, schießen aber nicht. Baue gegen die Flotte, die dich wirklich bedroht.</p>
      <div class="og-list">${rows}</div>`;
  },

  research() {
    if (state.snap.planet?.isAlliance) return allianceResearchHtml();
    const prev = Object.fromEntries((state.preview?.techs || []).map((t) => [t.id, t]));
    const busy = state.snap.queue.some((q) => q.kind === "research");
    const rows = Object.values(state.catalog.techs)
      .map((t) => {
        const info = prev[t.id] || {
          level: state.snap.techs[t.id] || 0,
          unlocked: nodeUnlocked("tech", t.id),
        };
        const action = !info.unlocked
          ? `<div class="lock">Voraussetzungen fehlen</div>`
          : info.max
            ? `<div class="ok">Abgeschlossen</div>`
            : `<button class="btn primary" data-tech="${t.id}" ${busy ? "disabled" : ""}>Forschen auf Stufe ${(info.level || 0) + 1}</button>
             <div class="muted">${info.nextTime ? eta(info.nextTime * 1000) : ""}</div>`;
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
    return `<div class="section-title"><h2>Forschung</h2><span class="muted">empireweit · Voraussetzungen im Tech-Tree</span></div><div class="og-list">${rows}</div>`;
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
    return `<div class="section-title"><h2>Technologie-Tree</h2>
        <span class="muted">was du wofür brauchst</span></div>
      <div class="tree-legend">
        <span class="lg ready">verfügbar</span>
        <span class="lg owned">im Besitz</span>
        <span class="lg locked">gesperrt</span>
      </div>
      <p class="hint">Von oben nach unten. Rot = fehlt noch, Grün = erfüllt. „gibt frei“ zeigt, was die Stufe entsperrt. Klick öffnet Gebäude, Forschung, Werft oder Verteidigung.</p>
      <div class="tree">${html}</div>`;
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
            <span class="nex-cost">${it.cost} Nex <small>(${esc(it.eur || "")})</small></span>
            <button class="btn primary small" data-nex="${it.id}" ${locked ? "disabled" : it.id === "recall" && vip.freeRecallReady ? "" : e.nex >= it.cost ? "" : "disabled"}>${it.id === "ship_cap_boost" && (e.shipCapBonus || 0) >= 10 ? "Bereits eingebaut" : locked ? "Erst freischalten" : it.id === "recall" && vip.freeRecallReady ? "Pass: kostenlos" : "Einlösen"}</button>
          </div>
        </article>`;
      })
      .join("");
    const packs = (shop.packs || [])
      .map(
        (p) => `<article class="nex-card panel">
          <h3>${esc(p.name)}</h3>
          <p class="hint">${esc(p.blurb)}</p>
          <div class="nex-cost">${esc(p.eur)} inkl. MwSt.</div>
          <p class="muted">Inhalt fest: ${p.nex} Nex. Kein Zufall.</p>
          <button class="btn primary small" data-checkout="${p.id}" data-kind="pack">Zahlungspflichtig kaufen</button>
        </article>`
      )
      .join("");
    const plans = (shop.plans || [])
      .map(
        (p) => `<article class="nex-card panel vip-card">
          <h3>${esc(p.name)}</h3>
          <p class="hint">${esc(p.blurb)}</p>
          <div class="nex-cost">${esc(p.eur)} / ${p.days} Tage</div>
          <ul class="vip-perks">${(p.perks || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <button class="btn primary small" data-checkout="${p.id}" data-kind="vip">Zahlungspflichtig abonnieren</button>
        </article>`
      )
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
      <div class="section-title"><h2>Nexus-Pass</h2><span class="muted">Abo · Komfort + Tagespaket</span></div>
      <p class="hint">${vip.active ? `Aktiv bis ${when(vip.until)}${vip.cancelAtEnd ? " · gekündigt, läuft aus" : ""} · täglich 10 Nex und ein Versorger-Paket auf der Heimatwelt.` : "Pass = mehr Tages-Nex (10 statt 5), kleines tägliches Ressourcen-Paket, Komfort. Kein Kampfbonus."}</p>
      ${vip.active && !vip.cancelAtEnd ? `<p><button class="btn ghost small" id="vip-cancel">Pass zum Periodenende kündigen</button></p>` : ""}
      <div class="nex-shop">${plans}</div>
      <div class="section-title" style="margin-top:18px"><h2>Nex</h2><span class="muted">nur Tagesbonus</span></div>
      <p class="hint">${esc(legal.currencyNote || "")} F2P ${shop.daily || 5} Nex / Tag, Pass ${shop.dailyVip || 10} Nex / Tag${vip.active ? " plus Versorger-Paket" : ""}.</p>
      <div class="row" style="gap:8px;margin-bottom:12px">
        <button class="btn primary" id="nex-daily" ${e.nexDailyReady ? "" : "disabled"}>${e.nexDailyReady ? (vip.active ? `+${vip.dailyNex || 10} Nex + Versorger-Paket` : `+${vip.dailyNex || shop.daily || 5} Nex abholen`) : "Heute bereits abgeholt"}</button>
        ${state.snap.user.isAdmin ? `<button class="btn ghost" id="nex-grant">Admin +100 Nex</button><button class="btn ghost" id="vip-grant">Admin +30 Tage Pass</button>` : ""}
      </div>
      <div class="nex-shop">${shopCards}</div>
      ${(shop.packs || []).length ? `<div class="section-title" style="margin-top:18px"><h2>Nex-Pakete</h2><span class="muted">feste Mengen</span></div>
      <p class="hint">${esc(legal.noLoot || "")} ${esc(legal.demo || "")}</p>
      <div class="nex-shop">${packs}</div>` : ""}
      <p class="legal-note">${esc(legal.age || "")} ${esc(legal.withdrawal || "")} ${esc(legal.sub || "")} <a href="/legal.html">AGB, Widerruf, Impressum</a></p>
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
    return `<div class="map-wrap"><canvas id="starmap"></canvas>
      <div class="map-tools panel"><select id="planet-focus"><option value="">— Planet springen —</option></select><input id="map-search" type="search" placeholder="System suchen…"><details class="map-filters"><summary>Filter</summary><div class="map-filters-body"><label><input type="checkbox" data-map-filter="own"> Eigene</label><label><input type="checkbox" data-map-filter="hostile"> Feindlich</label><label><input type="checkbox" data-map-filter="free"> Frei</label><label><input type="checkbox" data-map-filter="special"> Besonderheiten</label></div></details>${bookmarks ? `<div class="map-bookmarks"><b>Gespeicherte Ziele</b>${bookmarks}</div>` : ""}</div>
      <div class="map-legend panel">Ziehen: Schwenken · Rad: Zoom · Klick: System
        <div>Großer Punkt + weißer Ring + Kreuz = dein System · Teal-Puls = dein System · Rotbogen = Remnants · Orange-Ring = Piratenhorst · Goldbogen = Warlord · Cyan-Halo = Nexus-Riss</div></div>
      <div class="map-flight-note">Eigene Flüge: farbige Route mit bewegtem Marker · gestrichelt = Rückflug</div>
      <div id="sysbox"></div></div>`;
  },

  fleets() {
    const p = state.snap.planet;
    const stationed = p?.ships || {};
    const defs = p?.defenses || {};
    const moving = {};
    for (const f of state.snap.fleets || []) {
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
    const missionCards = (state.snap.fleets || [])
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
            <div class="muted">${esc(f.originName)} → ${esc(f.targetName)} · ${tickEta(f.arrivesAt - Date.now(), state.catalog)}${f.holdMs ? " · Halt " + ticksOf(f.holdMs, state.catalog) + " Ticks" : ""}</div>
          </div>
          <div class="force-chips">${arts}</div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          ${f.returning ? `<div class="muted">Rückruf nicht nötig – Flotte kehrt bereits zurück.</div>` : `<button class="btn ghost small" data-recall-fleet="${f.id}">Rückruf einleiten</button>`}
        </article>`;
      })
      .join("");
    const incoming = (state.snap.incoming || [])
      .map((h) => {
        const arts = Object.entries(h.ships || {})
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `<span class="force-chip"><img src="/assets/ships/${id}.jpg" alt="" /> ×${n}</span>`)
          .join("");
        return `<article class="mission-card panel hostile">
          <div>
            <b>${esc(h.kind === "raid" ? "Raid" : h.kind === "spy" ? "Scan" : "Angriff")}</b>
            <div class="muted">${esc(h.from)} → ${esc(h.planet)} · ${tickEta(h.arrivesAt - Date.now(), state.catalog)}</div>
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
    const news = state.newsTab || "reports";
    return `<div class="section-title">
        <h2>Nachrichten</h2>
        <div class="filters" id="news-tabs">
          <button class="tab ${news === "reports" ? "on" : ""}" data-news="reports" type="button">Berichte</button>
          <button class="tab ${news === "mail" ? "on" : ""}" data-news="mail" type="button">Postfach${mailN ? ` (${mailN})` : ""}</button>
        </div>
      </div>
      <div id="news-reports" ${news === "mail" ? "hidden" : ""}>
        <div class="row" style="gap:8px;margin-bottom:10px">
          <div class="filters" id="report-filters">
            <button class="tab on" data-filter="all" type="button">Alle</button>
            <button class="tab" data-filter="combat" type="button">Kampf</button>
            <button class="tab" data-filter="spy" type="button">Spionage</button>
            <button class="tab" data-filter="expedition" type="button">Expedition</button>
          </div>
          <button class="btn small" id="mark-read">Alle gelesen</button>
        </div>
        <p class="hint">Kampfberichte spielen die Sequenz ab, darunter stehen die Zahlen. Klick auf die Kopfzeile öffnet den Bericht.</p>
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
    return `<div class="section-title"><h2>Ranglisten</h2><span class="muted">Gesamt, Kampf, Wirtschaft und Forschung</span></div>
      <div class="filters" id="rank-tabs"><button class="tab on" data-rank="all" type="button">Gesamt</button><button class="tab" data-rank="combat" type="button">Kampf</button><button class="tab" data-rank="economy" type="button">Wirtschaft</button><button class="tab" data-rank="research" type="button">Forschung</button></div>
      <div id="rank-box" class="panel table-wrap"><p class="muted">Lade Rangliste…</p></div>`;
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
    const cards = acts
      .map((a) => {
        const ready = a.ready;
        const running = a.running;
        const durs = (a.durations || [])
          .map(
            (d) => `<button type="button" class="duration-btn" data-activity="${a.id}" data-duration="${d.id}" ${ready ? "" : "disabled"}>
              <b>${esc(d.name)}</b>
              <span>${eta(d.ms)} · ${esc(d.blurb)}${d.energy ? ` · ${d.energy} E` : ""}</span>
            </button>`
          )
          .join("");
        return `<article class="force-card panel ${ready ? "" : running ? "running" : "empty"}">
          <div class="force-art">
            ${mediaTag(a.art)}
            <span class="force-count">${running ? eta(a.wait) : ready ? "BEREIT" : eta(a.wait)}</span>
          </div>
          <div class="force-body">
            <h3>${esc(a.name)}</h3>
            <p>${esc(a.blurb)}</p>
            ${running ? `<div class="muted">Unterwegs (${esc(a.durationName || "Einsatz")}) · Beute bei Rückkehr</div>` : `<div class="duration-row">${durs}</div>`}
          </div>
        </article>`;
      })
      .join("");
    return `<div class="section-title"><h2>Einsatzzentrale</h2>
        <span class="muted">Kurz wenig Beute · lang reiche Beute</span></div>
      <p class="hint">Wähle die Dauer. Kurze Einsätze sind in Minuten vorbei, lange bringen deutlich mehr Erz, Kristalle und XP. Jeder Typ läuft getrennt.</p>
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
            <label>Neues Passwort (optional)<input name="password" type="password" minlength="6" autocomplete="new-password"></label>
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

function bindView(root) {
  root.querySelectorAll("[data-build]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/build", { method: "POST", body: { id: b.dataset.build, planetId: state.snap.planet.id } })))
  );
  root.querySelectorAll("[data-ship]").forEach((b) =>
    b.addEventListener("click", () => {
      const qty = Number(root.querySelector(`[data-qty="${b.dataset.ship}"]`)?.value || 1);
      act(() => api("/ship", { method: "POST", body: { id: b.dataset.ship, qty, planetId: state.snap.planet.id } }));
    })
  );
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
  root.querySelectorAll("[data-activity]").forEach((b) =>
    b.addEventListener("click", () =>
      act(() =>
        api("/activity", {
          method: "POST",
          body: { kind: b.dataset.activity, duration: b.dataset.duration || "short", planetId: state.snap.planet.id },
        })
      )
    )
  );
  root.querySelectorAll("[data-ally-tech]").forEach((b) =>
    b.addEventListener("click", () =>
      act(() => api("/alliances/research", { method: "POST", body: { id: b.dataset.allyTech, planetId: state.snap.planet.id } }))
    )
  );
  root.querySelectorAll("[data-ally-donate]").forEach((b) =>
    b.addEventListener("click", () => {
      const donation = {};
      root.querySelectorAll(`[data-donate-res="${b.dataset.allyDonate}"]`).forEach((inp) => {
        donation[inp.dataset.res] = Number(inp.value || 0);
      });
      act(() =>
        api("/alliances/research", {
          method: "POST",
          body: { id: b.dataset.allyDonate, donate: true, donation, planetId: state.snap.planet.id },
        })
      );
    })
  );
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
    b.addEventListener("click", () => act(() => api("/focus", { method: "POST", body: { planetId: Number(b.dataset.focus) } })))
  );
  root.querySelectorAll("[data-open-infra]").forEach((b) =>
    b.addEventListener("click", () => setView("infra"))
  );
  root.querySelectorAll("[data-claim]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/quest/claim", { method: "POST", body: { id: b.dataset.claim } })))
  );
  root.querySelectorAll("[data-op]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/quest/op", { method: "POST", body: { id: b.dataset.op } })))
  );
  root.querySelectorAll("[data-weekly]").forEach((b) =>
    b.addEventListener("click", () => act(() => api("/quest/weekly", { method: "POST", body: { id: b.dataset.weekly } })))
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
  if (state.view === "galaxy" && state.map) {
    const applyMapFilter = () => {
      const filters = { query: root.querySelector("#map-search")?.value || "" };
      root.querySelectorAll("[data-map-filter]").forEach((input) => { filters[input.dataset.mapFilter] = input.checked; });
      state.map.setFilter(filters);
    };
    root.querySelector("#map-search")?.addEventListener("input", applyMapFilter);
    root.querySelectorAll("[data-map-filter]").forEach((input) => input.addEventListener("change", applyMapFilter));
    root.querySelectorAll("[data-bookmark-focus]").forEach((button) => button.addEventListener("click", () => {
      const saved = state.snap.planets?.find((p) => p.id === Number(button.dataset.bookmarkFocus));
      if (saved) { act(() => api("/focus", { method: "POST", body: { planetId: saved.id } })); return; }
      toast("Gespeicherter Planet nicht mehr verfügbar.", true);
    }));
    root.querySelectorAll("[data-bookmark-delete]").forEach((button) => button.addEventListener("click", () => {
      act(() => api(`/bookmarks/${Number(button.dataset.bookmarkDelete)}`, { method: "DELETE" }));
    }));
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
  root.querySelectorAll("[data-checkout]").forEach((b) =>
    b.addEventListener("click", () => openCheckout(b.dataset.checkout, b.dataset.kind))
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
        openMission(targetId, detail);
      } catch {
        setView("galaxy");
      }
    })
  );
  const lo = root.querySelector("#logout-mobile");
  if (lo) lo.onclick = () => $("logout").click();
  if (state.view === "galaxy") bootMap();
}

function bindNews(root) {
  root.querySelectorAll("#news-tabs [data-news]").forEach((tab) => {
    tab.onclick = () => {
      state.newsTab = tab.dataset.news;
      root.querySelectorAll("#news-tabs .tab").forEach((t) => t.classList.toggle("on", t === tab));
      const reportsBox = root.querySelector("#news-reports");
      const mailBox = root.querySelector("#news-mail");
      if (reportsBox) reportsBox.hidden = state.newsTab !== "reports";
      if (mailBox) mailBox.hidden = state.newsTab !== "mail";
      if (state.newsTab === "mail") bootMail();
      else loadReports();
    };
  });
  const mark = root.querySelector("#mark-read");
  if (mark) {
    mark.onclick = async () => {
      await api("/reports/read", { method: "POST", body: {} });
      await refresh();
      if (state.newsTab === "reports") loadReports();
    };
    root.querySelectorAll("#report-filters .tab").forEach((tab) => {
      tab.onclick = () => {
        root.querySelectorAll("#report-filters .tab").forEach((t) => t.classList.toggle("on", t === tab));
        loadReports(tab.dataset.filter);
      };
    });
  }
  if (state.newsTab === "mail") bootMail();
  else loadReports();
}

async function loadRanks() {
  const host = $("rank-box");
  if (!host) return;
  try {
    const data = await getRanks();
    const ranks = data.categories?.[state.rankCategory || "all"] || data.ranks || [];
    const selfId = state.snap.empire.id;
    host.innerHTML = `<table class="table rank-table">
        <thead><tr><th>#</th><th></th><th>Commander</th><th>Spezies</th><th>Imperium</th><th>Allianz</th><th>Medaillen</th><th>Stufe</th><th>Welten</th><th>Punkte</th><th></th></tr></thead>
        <tbody>${ranks
          .map(
            (r, i) => `<tr class="${r.id === selfId ? "self" : ""}">
              <td class="rank-pos">${i + 1}</td>
              <td><button type="button" class="linkish" data-profile="${r.id}"><img class="avatar-sm" src="${esc(r.avatar)}" alt="" /></button></td>
              <td><button type="button" class="linkish" data-profile="${r.id}">${esc(r.username)}</button>${r.vip ? ` <span class="vip-pill">Pass</span>` : ""}${r.newbie ? ` <span class="chip ok">Schutz</span>` : ""}</td>
              <td>${esc((state.catalog?.species || []).find((s) => s.id === r.species)?.name || r.species || "—")}</td>
              <td><span style="color:${r.color}">●</span> ${esc(r.name)}</td>
              <td>${r.alliance ? `<button class="btn ghost small" data-open-ally="${r.alliance.id}">[${esc(r.alliance.tag)}]</button>` : `<span class="muted">—</span>`}</td>
              <td>${medalTinyRow(r.medals)}</td>
              <td>${r.level}</td>
              <td>${r.planets}</td>
              <td><b>${fmt(state.rankCategory === "combat" ? r.combatScore : state.rankCategory === "economy" ? r.economyScore : state.rankCategory === "research" ? r.researchScore : r.score)}</b></td>
              <td>${r.id === selfId ? `<button class="btn ghost small" data-profile="${r.id}">Profil</button>` : `<button class="btn ghost small" data-profile="${r.id}">Profil</button> <button class="btn ghost small" data-pm="${r.id}" data-pm-name="${esc(r.username)}">PM</button>`}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`;
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

function openCheckout(sku, kind) {
  const shop = state.snap.nexShop || {};
  const item = (kind === "vip" ? shop.plans : shop.packs)?.find((x) => x.id === sku);
  if (!item) {
    toast("Angebot unbekannt.", true);
    return;
  }
  const legal = shop.legal || {};
  showModal(`<div class="sheet panel" style="max-width:460px">
    <h2 style="margin:0 0 8px;font-size:14px">${esc(item.name)}</h2>
    <p class="hint">${esc(item.blurb || "")}</p>
    <p><b>${esc(item.eur)}</b>${item.nex ? ` · ${item.nex} Nex, fest, kein Zufall` : ` · ${item.days} Tage Pass`}</p>
    <p class="legal-note">${esc(legal.demo || "")}</p>
    <p class="legal-note">${esc(legal.withdrawal || "")}</p>
    <label class="row legal-check"><input type="checkbox" id="pay-age"> Ich bin mindestens 18 Jahre alt.</label>
    <label class="row legal-check"><input type="checkbox" id="pay-waive"> Ich verlange die sofortige Ausführung und weiß, dass ich damit mein Widerrufsrecht nach § 356 Abs. 5 BGB verliere.</label>
    <div class="row" style="margin-top:14px">
      <button class="btn ghost" id="pay-cancel" type="button">Abbrechen</button>
      <button class="btn primary" id="pay-go" type="button">${kind === "vip" ? "Zahlungspflichtig abonnieren" : "Zahlungspflichtig kaufen"}</button>
    </div>
  </div>`);
  document.getElementById("pay-cancel").onclick = hideModal;
  document.getElementById("pay-go").onclick = async () => {
    const ageConfirm = document.getElementById("pay-age").checked;
    const waiveWithdrawal = document.getElementById("pay-waive").checked;
    try {
      const snap = await api("/nex/checkout", {
        method: "POST",
        body: { sku, ageConfirm, waiveWithdrawal, planetId: state.snap.planet?.id },
      });
      if (snap?.empire) {
        state.snap = snap;
        paintChrome();
      }
      hideModal();
      toast(kind === "vip" ? "Nexus-Pass gutgeschrieben (Test, kein Einzug)." : "Nex gutgeschrieben (Test, kein Einzug).");
      renderView();
    } catch (err) {
      toast(err.message, true);
    }
  };
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
              return `<label class="admin-field">${esc(f.label)}<input name="${esc(f.key)}" maxlength="280" value="${esc(f.value || "")}" placeholder="${esc(f.hint || "")}"></label>`;
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
          <form id="admin-settings" class="admin-form">${settingsHtml}<button class="btn primary" type="submit">Einstellungen speichern</button></form>
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
        ${detail.mine ? allianceDeskHtml(detail) : ""}
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
    bindJumps(host);
    host.querySelector("#ally-open-planet")?.addEventListener("click", () => {
      if (detail.planet?.id) jumpTo("command", detail.planet.id);
    });
    host.querySelector("#ally-goto-research")?.addEventListener("click", () => {
      if (detail.planet?.id) jumpTo("research", detail.planet.id);
    });
    host.querySelectorAll("[data-ally-donate]").forEach((b) =>
      b.addEventListener("click", () => {
        const donation = {};
        host.querySelectorAll(`[data-donate-res="${b.dataset.allyDonate}"]`).forEach((inp) => {
          donation[inp.dataset.res] = Number(inp.value || 0);
        });
        act(() =>
          api("/alliances/research", {
            method: "POST",
            body: { id: b.dataset.allyDonate, donate: true, donation, planetId: state.snap.planet?.id },
          }).then(async (snap) => {
            state.snap = snap;
            state.allianceFocus = detail.id;
            await bootAlliance();
            return snap;
          })
        );
      })
    );
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
      <p class="hint">${esc(b.text || "")} · ${esc(b.planet || "")}${b.system ? " · " + esc(b.system) : ""}${b.remnant ? " · Remnants" : ""}${b.pirate ? " · Piraten" : ""}${b.owner ? " · " + esc(b.owner) : ""}</p>
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
  const jumps = jumpButtonsHtml(reportJumps(r));
  const long = (b.text || "").length > 140 || b.loot || b.shipsGain;
  if (!long) {
    return `<article class="report panel ${r.seen ? "" : "unread"}" data-rid="${r.id}">
      <header class="report-head">
        <span class="tag-pill">${esc(r.kind)}</span>
        <h3>${esc(r.title)}</h3>
        <time>${when(r.createdAt)}</time>
      </header>
      <p>${esc(b.text || "")}</p>
      ${jumps}
    </article>`;
  }
  return `<details class="report panel ${r.seen ? "" : "unread"}" data-rid="${r.id}">
    <summary class="report-head">
      <span class="tag-pill">${esc(r.kind)}</span>
      <h3>${esc(r.title)}</h3>
      <time>${when(r.createdAt)}</time>
      <span class="report-sum">${esc((b.text || "").slice(0, 90))}${(b.text || "").length > 90 ? "…" : ""}</span>
    </summary>
    <div class="report-body">
      <p>${esc(b.text || "")}</p>
      ${b.loot ? `<div class="loot-line"><span class="muted">Fund</span><div class="cost">${lootHtml(b.loot)}</div></div>` : ""}
      ${jumps}
    </div>
  </details>`;
}

async function loadReports(filter = "all") {
  const host = $("report-list");
  if (!host) return;
  const { reports } = await getReports();
  const list = reports.filter((r) => (filter === "all" ? true : r.kind === filter));
  if (!list.length) {
    host.innerHTML = `<div class="empty panel"><p>Keine ${filter === "combat" ? "Kampfberichte" : filter === "spy" ? "Spionageberichte" : "Berichte"}.</p>
      <p class="muted">Sende eine Sonde (Spionage) oder eine Kampfgruppe (Angriff) über die Sternenkarte.</p></div>`;
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
        openMission(Number(b.dataset.reportAttack), detail);
      } catch (err) {
        toast(err.message || "Ziel unbekannt.", true);
        setView("galaxy");
      }
    });
  });
}

let mapBootId = 0;

async function bootMap() {
  const canvas = $("starmap");
  if (!canvas) return;
  const bootId = ++mapBootId;
  const stillHere = () => bootId === mapBootId && state.view === "galaxy" && $("starmap") === canvas;
  if (state.map) {
    try {
      state.map.destroy();
    } catch {
      /* ignore */
    }
    state.map = null;
  }
  state.map = createMap(canvas, async (sys, opts) => {
    if (!stillHere()) return;
    const box = $("sysbox");
    if (!box) return;
    if (!sys) {
      box.innerHTML = "";
      return;
    }
    const detail = await getSystem(sys.id);
    const highlightPlanetId = Number(opts?.planetId || (state.mapFocus?.systemId === sys.id ? state.mapFocus.planetId : 0));
    if (!opts?.planetId && state.mapFocus && state.mapFocus.systemId !== sys.id) state.mapFocus = null;
    box.innerHTML = systemHtml(detail, state.catalog, state.snap.planet?.ships, { highlightPlanetId });
    box.querySelector("[data-sys-close]")?.addEventListener("click", () => {
      box.innerHTML = "";
    });
    const alertRow = box.querySelector(".sys-planet-alert");
    if (alertRow) alertRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    box.querySelectorAll("[data-focus]").forEach((b) =>
      b.addEventListener("click", () => act(() => api("/focus", { method: "POST", body: { planetId: Number(b.dataset.focus) } })))
    );
    box.querySelectorAll("[data-target]").forEach((b) =>
      b.addEventListener("click", () => openMission(Number(b.dataset.target), detail))
    );
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
    if (!focused) {
      if (state.mapFocus?.planetId || state.mapFocus?.systemId) applyMapFocus();
      else state.map.focusHome(false);
      focused = true;
    }
    kick();
  };
  if (state.galaxy?.systems) paintGalaxy(state.galaxy);
  try {
    const galaxy = await getGalaxy();
    paintGalaxy(galaxy);
  } catch (err) {
    if (stillHere()) toast(err.message || "Galaxie nicht geladen.", true);
  }
  if (!stillHere()) return;
  const root = $("view");
  const applyMapFilter = () => {
    const filters = { query: root.querySelector("#map-search")?.value || "" };
    root.querySelectorAll("[data-map-filter]").forEach((input) => { filters[input.dataset.mapFilter] = input.checked; });
    state.map.setFilter(filters);
  };
  root.querySelector("#map-search")?.addEventListener("input", applyMapFilter);
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
}

function openMission(targetId, sys) {
  const planet = sys.planets.find((p) => p.id === targetId);
  const ships = Object.entries(state.snap.planet.ships || {}).filter(([, n]) => n > 0);
  if (!ships.length) {
    toast("Keine Schiffe am Fokus-Planeten.", true);
    return;
  }
  const own = planet.own || planet.canManage;
  const canAllyColonize = !planet.owner && state.snap.alliance?.canColonizePlanet;
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
    <h2 style="margin:0 0 8px;font-size:14px">Mission: ${esc(planet.name)}</h2>
    <p class="hint">${esc(sys.name)}</p>
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
              <input data-ship="${id}" type="number" min="0" max="${n}" value="${id === "probe" ? Math.min(1, n) : 0}">
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
      <button class="btn ghost" id="m-cancel">Abbrechen</button>
      <button class="btn primary" id="m-go">Flotte senden</button>
    </div>
  </div>`);
  const cargoBox = document.getElementById("cargo-fields");
  const missionSel = document.getElementById("mission");
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
          body: { planetId: state.snap.planet.id, targetId, ships: picked },
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
          <div>Ankunft im Welt-Tick: ${when(arrivalAt)} · noch ${tickEta(arrivalAt - Date.now(), state.catalog)}</div>
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
            body: { planetId: state.snap.planet.id, targetId, probes },
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
          planetId: state.snap.planet.id,
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
          <div class="muted">Feuerkraft ${fmt(data.atkPower)} vs ${fmt(data.defPower)} · ${data.remnant ? "Remnants " : ""}${data.warlord ? "Warlord " : ""}</div>
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
  missionSel.onchange = paintCargo;
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
    const picked = {};
    for (const input of document.querySelectorAll("#ship-picks [data-ship]")) {
      const n = Number(input.value || 0);
      if (n > 0) picked[input.dataset.ship] = n;
    }
    try {
      await api("/fleet", {
        method: "POST",
        body: {
          planetId: state.snap.planet.id,
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
      hideModal();
      toast("Flotte unterwegs.");
      await refresh();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function act(fn) {
  try {
    const snap = await fn();
    if (snap?.empire) {
      state.snap = snap;
      if (state.snap.planet) state.preview = await getPreview(state.snap.planet.id);
      paintChrome();
      renderView();
    } else await refresh();
  } catch (err) {
    toast(err.message, true);
  }
}

$("nav")?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (b) setView(b.dataset.view);
});
$("tabbar")?.addEventListener("click", (e) => {
  const more = e.target.closest("[data-tab='more'], [data-more]");
  if (more) {
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
  if (jump) jumpTo(jump.dataset.dockView, jump.dataset.dockPlanet);
});
$("dock")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target.closest("[data-cancel]")) return;
  const jump = e.target.closest("[data-dock-view]");
  if (!jump) return;
  e.preventDefault();
  jumpTo(jump.dataset.dockView, jump.dataset.dockPlanet);
});
const planetSel = $("planet-select");
if (planetSel) {
  planetSel.onchange = () => {
    const id = Number(planetSel.value);
    if (id) act(() => api("/focus", { method: "POST", body: { planetId: id } }));
  };
}
$("brand-profile")?.addEventListener("click", () => {
  const id = state.snap?.empire?.id;
  if (id) openEmpireProfile(id);
});

if ($("logout") && !$("logout").closest("form")) {
  $("logout").onclick = async () => {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    location.href = "/";
  };
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
    await api(path, { method: "POST", body });
    await enterGame();
  } catch (e) {
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
    getPreview(state.snap.planet.id)
      .then((p) => {
        state.preview = p;
      })
      .catch(() => {});
  }
}

setInterval(() => {
  if (!state.snap) return;
  renderResources();
  renderDock();
  const due = (state.snap.queue || []).some((q) => q.completesAt <= Date.now() + 400);
  const dueF = (state.snap.fleets || []).some((f) => f.arrivesAt <= Date.now() + 400);
  const dueA = (state.snap.activities || []).some((a) => a.running && a.readyAt <= Date.now() + 400);
  if (due || dueF || dueA) refresh(undefined, { rerender: liveRerender() }).catch(() => {});
}, 500);

setInterval(() => {
  if (state.snap) refresh(undefined, { rerender: liveRerender() }).catch(() => {});
}, 8000);

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
    console.warn(err);
  }
  showLanding();
}

boot().catch(() => showLanding());
