import { esc } from "./ui.js";

export function createMap(canvas, onSelect) {
  let data = null;
  let cam = { x: 1500, y: 1500, scale: 0.55 };
  let drag = null;
  let hover = null;
  let filter = { query: "", own: false, hostile: false, free: false, special: false };
  let highlightSystemId = null;

  function world(ev) {
    const r = canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) * (canvas.width / r.width) - canvas.width / 2) / cam.scale + cam.x;
    const y = ((ev.clientY - r.top) * (canvas.height / r.height) - canvas.height / 2) / cam.scale + cam.y;
    return { x, y };
  }

  function hit(ev) {
    if (!data) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let best = null;
    let bd = 42;
    for (const s of data.systems) {
      if (!visible(s)) continue;
      const cx = ((s.x - cam.x) * cam.scale + canvas.width / 2) / scaleX;
      const cy = ((s.y - cam.y) * cam.scale + canvas.height / 2) / scaleY;
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  function visible(system) {
    const query = filter.query.trim().toLowerCase();
    if (query && !String(system.name).toLowerCase().includes(query)) return false;
    const own = system.owners.some((o) => o.empireId === data.self.empireId);
    const hostile = system.remnant || system.pirate || system.warlord;
    const free = !system.owners.length && !hostile;
    const special = system.isHub || system.rift || hostile;
    if (filter.own && !own) return false;
    if (filter.hostile && !hostile) return false;
    if (filter.free && !free) return false;
    if (filter.special && !special) return false;
    return true;
  }

  canvas.style.touchAction = "none";
  let pinch = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drag = {
      x: e.clientX,
      y: e.clientY,
      cx: cam.x,
      cy: cam.y,
      moved: false,
      slop: e.pointerType === "touch" ? 18 : 5,
    };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pinch) return;
    if (drag) {
      const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      if (dist > drag.slop) drag.moved = true;
      if (drag.moved) {
        const dx = (e.clientX - drag.x) / cam.scale;
        const dy = (e.clientY - drag.y) / cam.scale;
        cam.x = drag.cx - dx * (canvas.width / canvas.getBoundingClientRect().width);
        cam.y = drag.cy - dy * (canvas.height / canvas.getBoundingClientRect().height);
      }
    }
    hover = hit(e);
    canvas.style.cursor = hover ? "pointer" : drag ? "grabbing" : "grab";
  });
  function endPointer(e) {
    if (drag && !drag.moved && typeof onSelect === "function") {
      const s = hit(e);
      onSelect(s || null);
    }
    drag = null;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", () => {
    drag = null;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const before = world(e);
    cam.scale = Math.min(4.2, Math.max(0.16, cam.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    const after = world(e);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  }, { passive: false });
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinch = { d: Math.max(1, d), scale: cam.scale };
      drag = null;
    }
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      cam.scale = Math.min(4.2, Math.max(0.16, pinch.scale * (d / pinch.d)));
    }
  }, { passive: false });
  canvas.addEventListener("touchend", () => {
    pinch = null;
  });

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function draw(now) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!data) return;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    const t = (now || Date.now()) / 1000;
    const systemById = new Map(data.systems.map((s) => [s.id, s]));
    ctx.lineWidth = 1.2 / cam.scale;
    for (const l of data.links) {
      const a = systemById.get(l.a);
      const b = systemById.get(l.b);
      if (!a || !b) continue;
      ctx.strokeStyle = "rgba(62,224,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const missionColor = { attack: "#ff4d6d", spy: "#a78bfa", transport: "#3ee8c4", deploy: "#3ee8c4", colonize: "#f0c14a", expedition: "#58b7ff", salvage: "#ffb86b", intercept: "#ff6b4a" };
    for (const flight of data.flights || []) {
      const from = systemById.get(flight.originSystemId);
      const to = systemById.get(flight.targetSystemId);
      if (!from || !to) continue;
      const color = missionColor[flight.mission] || "#e8f6ff";
      const total = Math.max(1, flight.arrivesAt - flight.departedAt);
      const progress = Math.max(0, Math.min(1, (Date.now() - flight.departedAt) / total));
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2 / cam.scale;
      if (flight.returning) ctx.setLineDash([7 / cam.scale, 5 / cam.scale]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, y, 4.5 / cam.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const s of data.systems) {
      if (!visible(s)) continue;
      const own = s.owners.find((o) => o.empireId === data.self.empireId);
      const isOwn = !!own;
      const color = isOwn ? data.self.color : s.owners[0]?.color || s.star.color;
      const r = s.isHub ? (isOwn ? 10 : 8) : (isOwn ? 7 : 5);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.arc(s.x, s.y, r + 7, 0, Math.PI * 2);
      ctx.fill();
      if (s.isHub) {
        ctx.strokeStyle = "rgba(192,132,252,0.75)";
        ctx.lineWidth = 1.4 / cam.scale;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (s.rift) {
        ctx.strokeStyle = "rgba(62,232,196,0.85)";
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 4);
        ctx.lineWidth = 2.2 / cam.scale;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 14 + 3 * Math.sin(t * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (s.pirate) {
        ctx.strokeStyle = "#ff8a3a";
        ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 2);
        ctx.lineWidth = 2 / cam.scale;
        ctx.setLineDash([6 / cam.scale, 4 / cam.scale]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (s.remnant) {
        ctx.strokeStyle = s.warlord ? "#f0c14a" : "#ff4d6d";
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = (s.warlord ? 2 : 1.2) / cam.scale;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3, t, t + Math.PI);
        ctx.stroke();
      }
      if (own) {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3);
        ctx.strokeStyle = data.self.color;
        ctx.lineWidth = 2 / cam.scale;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (isOwn) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.6 / cam.scale;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.3 / cam.scale;
        const m = 2.2 / cam.scale;
        ctx.beginPath();
        ctx.moveTo(s.x - m, s.y);
        ctx.lineTo(s.x + m, s.y);
        ctx.moveTo(s.x, s.y - m);
        ctx.lineTo(s.x, s.y + m);
        ctx.stroke();
      }
      if (hover && hover.id === s.id) {
        ctx.fillStyle = "#e8f6ff";
        ctx.font = `${12 / cam.scale}px Sora, sans-serif`;
        ctx.fillText(s.warlord ? s.name + "  †" : s.name, s.x + 10, s.y - 8);
      }
      if (data.self?.homeSystemId === s.id) {
        ctx.strokeStyle = "#ff3b4d";
        ctx.lineWidth = 3.2 / cam.scale;
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 3);
        ctx.setLineDash([]);
        const box = 24 / cam.scale;
        ctx.strokeRect(s.x - box, s.y - box, box * 2, box * 2);
      }
      if (highlightSystemId === s.id && data.self?.homeSystemId !== s.id) {
        ctx.strokeStyle = "#ff4d6d";
        ctx.lineWidth = 2.4 / cam.scale;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function centerHome(open) {
    if (!data) return;
    const homeId = data.self?.homeSystemId;
    const home =
      data.systems.find((s) => s.id === homeId) ||
      data.systems.find((s) => s.owners.some((o) => o.empireId === data.self.empireId));
    if (!home) return;
    highlightSystemId = home.id;
    cam.x = home.x;
    cam.y = home.y;
    cam.scale = 2.7;
    if (open && typeof onSelect === "function") onSelect(home);
  }

  let raf = 0;
  function loop(t) {
    draw(t);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    setData(next) {
      const first = !data;
      data = next;
      if (first) centerHome(false);
    },
    focusHome(open) {
      centerHome(!!open);
    },
    setFilter(next) {
      filter = { ...filter, ...(next || {}) };
    },
    setCenter(x, y, scale) {
      cam.x = x;
      cam.y = y;
      cam.scale = scale;
    },
    focusSystem(systemId, zoom) {
      const sys = data?.systems.find((s) => s.id === systemId);
      if (!sys) return;
      highlightSystemId = systemId;
      cam.x = sys.x;
      cam.y = sys.y;
      cam.scale = zoom || 2;
      if (typeof onSelect === "function") onSelect(sys);
      requestAnimationFrame(() => {});
    },
    focusPlanet(planetId, systemId) {
      const sys = data?.systems.find((s) => s.id === systemId);
      if (!sys) return;
      highlightSystemId = sys.id;
      cam.x = sys.x;
      cam.y = sys.y;
      cam.scale = 2.4;
      if (typeof onSelect === "function") onSelect(sys, { planetId: Number(planetId) || 0 });
      requestAnimationFrame(() => {});
    },
    setHighlight(systemId) {
      highlightSystemId = systemId;
    },
    resize,
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}

export function systemHtml(sys, catalog, originShips, opts = {}) {
  const ships = Object.entries(originShips || {}).filter(([, n]) => n > 0);
  const remnant = Object.entries(sys.remnantShips || {}).filter(([, n]) => n > 0);
  const highlightPlanetId = Number(opts.highlightPlanetId || 0);
  const colonizeMode = opts.colonizeMode || null;
  const systemId = opts.systemId || 0;
  const planetRows = sys.planets
    .map((p) => {
      const owner = p.owner
        ? `${p.owner.alliance ? `<span class="muted">[${esc(p.owner.alliance.tag)}]</span> ` : ""}<button type="button" class="linkish" data-profile="${p.owner.id}" style="color:${p.owner.color}">${esc(p.owner.name)}</button>`
        : sys.pirate
          ? `<span style="color:#ff8a3a">Piraten S${sys.pirate}</span>`
          : sys.remnant
            ? `<span class="danger">Remnants</span>`
            : `<span class="muted">unbesetzt</span>`;
      const alert = highlightPlanetId && p.id === highlightPlanetId;
      
      // Im Kolonie-Auswahlmodus: Unterscheide Zielplanet von anderen
      let acts;
      if (colonizeMode && !colonizeMode.targetPlanetId) {
        // Auswahl-Modus aktiv: Nur unbesiedelte Planeten können Ziel sein
        if (!p.owner && !sys.pirate && !sys.remnant) {
          acts = `<button class="btn small" data-target="${p.id}" style="background:#f0c14a;color:#0a0a0d">Ziel auswählen</button>`;
        } else {
          acts = `<button class="btn small" disabled>Besetzt</button>`;
        }
      } else {
        // Normal-Modus
        acts = p.own || p.canManage
          ? `<button class="btn small" data-focus="${p.id}">Fokus</button><button class="btn small" data-target="${p.id}">Mission</button>`
          : `<button class="btn small" data-target="${p.id}">Mission</button>`;
      }
      
      return `<article class="sys-planet-card${alert ? " sys-planet-alert" : ""}${p.own ? " own" : ""}" data-planet-id="${p.id}">
        <img class="planet-thumb" src="/assets/planets/${p.type || "terran"}.jpg" alt="" />
        <div class="sys-planet-copy">
          <b>${esc(p.name)}${p.isHome ? ` <span class="chip ok">Heimat</span>` : ""}</b>
          <span class="muted">${esc(p.typeName)} · Größe ${p.size}</span>
          <span class="sys-owner">${owner}${p.owner?.newbie ? ` <span class="chip ok">Schutz</span>` : p.owner?.protected ? ` <span class="chip ok">Fair-Play</span>` : ""}</span>
        </div>
        <div class="sys-planet-acts">${acts}<button class="btn ghost small" data-bookmark="${p.id}" data-bookmark-name="${esc(p.name)}">Merken</button>${p.debris ? `<button class="btn small" data-target="${p.id}">Bergen</button>` : ""}</div>
      </article>`;
    })
    .join("");
  const focus = sys.planets.find((x) => x.id === highlightPlanetId) || sys.planets.find((x) => x.own || x.canManage) || sys.planets[0];
  let quick = "";
  if (focus) {
    if (colonizeMode && !colonizeMode.targetPlanetId) {
      // Im Auswahlmodus: Besondere Hinweise
      quick = `<div class="sys-actions">
        <p class="hint" style="margin:0;color:#f0c14a"><b>Wähle einen Zielplaneten</b><br/>Kolonie von ${esc(colonizeMode.sourcePlanetName)}</p>
      </div>`;
    } else if (focus.own || focus.canManage) {
      quick = `<div class="sys-actions">
        <button class="btn primary" data-focus="${focus.id}">Fokus</button>
        <button class="btn" data-target="${focus.id}">Mission</button>
        <button class="btn ghost" data-bookmark="${focus.id}" data-bookmark-name="${esc(focus.name)}">Merken</button>
      </div>`;
    } else if (!focus.owner && !sys.pirate && !sys.remnant) {
      quick = `<div class="sys-actions">
        <button class="btn primary" data-target="${focus.id}">Kolonie</button>
        <button class="btn" data-target="${focus.id}">Mission</button>
        <button class="btn ghost" data-bookmark="${focus.id}" data-bookmark-name="${esc(focus.name)}">Merken</button>
      </div>`;
    } else {
      quick = `<div class="sys-actions">
        <button class="btn" data-target="${focus.id}">Spionage</button>
        <button class="btn primary" data-target="${focus.id}">Angriff</button>
        <button class="btn ghost" data-bookmark="${focus.id}" data-bookmark-name="${esc(focus.name)}">Merken</button>
      </div>`;
    }
  }
  return `
    <div class="sys-panel panel">
      <i class="sys-sheet-handle" aria-hidden="true"></i>
      <div class="section-title"><h2>${esc(sys.name)}</h2><button type="button" class="sys-close" data-sys-close aria-label="Schließen">×</button></div>
      <p class="muted sys-starline">${esc(sys.star?.name || "")}</p>
      ${quick}
      ${sys.isHub ? `<p class="hint">Nexus-Hub — Mehrheitskontrolle gewährt Kristall-Bonus.</p>` : ""}
      ${sys.pirate ? `<p class="hint" style="color:#ff8a3a">Piratenhorst Stufe ${sys.pirate} — Angriff bringt Prisen.</p>` : ""}
      ${sys.warlord ? `<p class="hint" style="color:#f0c14a">Warlord: ${esc(sys.warlord)} — extra Flotte, Relikt.</p>` : ""}
      ${sys.rift ? `<p class="hint" style="color:var(--cyan)">Nexus-Riss aktiv — Expeditionen hier finden mehr.</p>` : ""}
      ${sys.remnant ? `<p class="hint danger">Remnant-Wache: ${remnant.map(([id, n]) => n + "× " + (catalog.ships[id]?.name || id)).join(", ") || "unbekannt"}</p>` : ""}
      <div class="sys-planet-list">${planetRows}</div>
      ${ships.length ? `<p class="muted" style="margin-top:10px">Flotte am Fokus-Planeten bereit.</p>` : `<p class="muted sys-fleet-note">Keine Schiffe am Fokus-Planeten.</p>`}
    </div>`;
}
