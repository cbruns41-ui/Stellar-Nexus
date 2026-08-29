import { fmt } from "./ui.js";

const APPROACH = 1000;
const FIRE = 3800;
const RESOLVE = 1200;
const DURATION = APPROACH + FIRE + RESOLVE;

const TOKEN = {
  probe: 36,
  fighter: 42,
  interceptor: 42,
  bomber: 46,
  frigate: 50,
  cargo: 48,
  cruiser: 56,
  colony: 52,
  destroyer: 60,
  carrier: 64,
  battleship: 68,
  dreadnought: 76,
  aeon: 50,
  helix: 44,
  flak: 32,
  missile: 34,
  pd: 32,
  ion: 36,
  gauss: 40,
  plasma: 42,
  dome: 38,
  laser: 36,
  mines: 30,
  disruptor: 44,
  orbital: 48,
};

const imgs = new Map();
const running = new WeakMap();

function getImg(src) {
  let im = imgs.get(src);
  if (im) return im;
  im = new Image();
  im.decoding = "async";
  im.src = src;
  imgs.set(src, im);
  return im;
}

function roster(deployed, lost, left, catalog, folder) {
  const ids = new Set([
    ...Object.keys(deployed || {}),
    ...Object.keys(lost || {}),
    ...Object.keys(left || {}),
  ]);
  const out = [];
  for (const id of ids) {
    const start = Math.max(0, Number(deployed?.[id] || 0));
    const dead = Math.max(0, Number(lost?.[id] || 0));
    const rest = left && left[id] != null ? Math.max(0, Number(left[id])) : Math.max(0, start - dead);
    if (start + dead + rest <= 0) continue;
    const spec = catalog?.[id] || {};
    out.push({
      id,
      name: spec.name || id,
      src: `/assets/${folder}/${id}.jpg`,
      start,
      lost: dead,
      left: rest,
      atk: Number(spec.attack) || 1,
    });
  }
  out.sort((a, b) => b.start - a.start || a.name.localeCompare(b.name, "de"));
  return out;
}

function hashSeed(s) {
  let h = 2166136261;
  for (const c of String(s || "nexus")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function cover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function roundClip(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
  else ctx.rect(x, y, w, h);
  ctx.clip();
}

function buildPayload(body, catalog, win) {
  return {
    win: !!win,
    planet: body?.planet || "",
    system: body?.system || "",
    raid: !!body?.raid,
    remnant: !!body?.remnant,
    pirate: body?.pirate || 0,
    atkPower: Number(body?.atkPower) || 0,
    defPower: Number(body?.defPower) || 0,
    atk: roster(body?.atkShips, body?.atkLost, body?.atkLeft, catalog?.ships, "ships"),
    def: roster(body?.defShips, body?.defLost, body?.defLeft, catalog?.ships, "ships"),
    bat: roster(body?.defDefense, body?.defLostDefense, body?.defLeftDefense, catalog?.defenses, "defenses"),
  };
}

export function battleReplayHtml(body, catalog, win) {
  const payload = buildPayload(body, catalog, win);
  if (!payload.atk.length && !payload.def.length && !payload.bat.length) return "";
  return `<div class="battle-replay" data-replay="${encodeURIComponent(JSON.stringify(payload))}">
    <canvas class="battle-canvas" aria-hidden="true"></canvas>
    <div class="battle-replay-bar">
      <span class="br-atk">Angreifer</span>
      <span class="br-status">Sequenz…</span>
      <span class="br-def">Verteidiger</span>
    </div>
    <button type="button" class="btn ghost small br-again" hidden>Nochmal</button>
  </div>`;
}

function layout(units, side, W, H) {
  const n = units.length;
  if (!n) return;
  const colW = Math.min(168, Math.max(96, W * 0.22));
  const availH = H - 52;
  const maxH = Math.min(70, Math.floor(availH / n) - 6);
  units.forEach((u, i) => {
    const base = TOKEN[u.id] || 44;
    const h = clamp(base, 28, Math.max(28, maxH));
    const w = h * 1.72;
    u.w = Math.min(colW - 8, w);
    u.h = h;
    const slot = (i + 0.5) * (availH / n);
    u.baseY = 36 + slot - h / 2;
    u.phase = i * 0.7 + (side === "atk" ? 0 : 1.3);
    if (side === "atk") {
      u.restX = 14;
      u.fromX = -u.w - 20;
    } else {
      u.restX = W - 14 - u.w;
      u.fromX = W + 20;
    }
    u.side = side;
    if (u.shown == null) u.shown = u.start;
    if (u.alpha == null) u.alpha = 1;
    u.flash = u.flash || 0;
  });
}

function pick(list, rand) {
  const live = list.filter((u) => u.shown > 0);
  if (!live.length) return null;
  let total = 0;
  for (const u of live) total += Math.max(1, u.shown * u.atk);
  let r = rand() * total;
  for (const u of live) {
    r -= Math.max(1, u.shown * u.atk);
    if (r <= 0) return u;
  }
  return live[live.length - 1];
}

function muzzle(u) {
  const right = u.side === "atk";
  return {
    x: right ? u.x + u.w - 4 : u.x + 4,
    y: u.y + u.h * 0.48,
  };
}

function playBattleReplay(el) {
  stopBattleReplay(el);
  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(el.dataset.replay || ""));
  } catch {
    return;
  }
  const canvas = el.querySelector(".battle-canvas");
  const status = el.querySelector(".br-status");
  const again = el.querySelector(".br-again");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const seed = hashSeed((payload.planet || "") + (payload.system || "") + payload.atk.length);
  const rand = rng(seed);
  const stars = Array.from({ length: 48 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.4 + rand() * 1.3,
    a: 0.15 + rand() * 0.55,
    tw: rand() * Math.PI * 2,
  }));

  const atk = payload.atk.map((u) => ({ ...u }));
  const def = payload.def.map((u) => ({ ...u }));
  const bat = payload.bat.map((u) => ({ ...u, battery: true }));
  const right = [...def, ...bat];
  for (const u of [...atk, ...right]) getImg(u.src);

  const shots = [];
  const sparks = [];
  let started = performance.now();
  let lastFrame = started;
  let shotAcc = 0;
  let raf = 0;
  let W = 0;
  let H = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(280, Math.floor(rect.width));
    H = Math.max(180, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout(atk, "atk", W, H);
    layout(right, "def", W, H);
  }

  function spawnShot(from, to, color, now) {
    if (!from || !to) return;
    const a = muzzle(from);
    const b = muzzle(to);
    b.x += (rand() - 0.5) * to.w * 0.4;
    b.y += (rand() - 0.5) * to.h * 0.5;
    shots.push({
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      t: now,
      life: 140 + rand() * 90,
      color,
      w: 1 + rand() * 1.4,
      target: to,
    });
  }

  function tickCounts(now, fireT) {
    const p = easeOut(clamp(fireT, 0, 1));
    for (const u of [...atk, ...right]) {
      const next = Math.round(u.start + (u.left - u.start) * p);
      if (next < u.shown) {
        u.flash = now;
        sparks.push({
          x: u.x + u.w * (0.3 + rand() * 0.4),
          y: u.y + u.h * (0.3 + rand() * 0.4),
          t: now,
          life: 280 + rand() * 180,
          color: u.side === "atk" ? "#ff8a4c" : "#3ee8c4",
        });
      }
      u.shown = next;
      u.alpha = u.shown > 0 ? 1 : 0.28;
    }
  }

  function drawToken(u, now) {
    const bob = Math.sin(now / 420 + u.phase) * (u.shown > 0 ? 2.2 : 0);
    u.y = u.baseY + bob;
    const img = getImg(u.src);
    ctx.save();
    ctx.globalAlpha = u.alpha;
    roundClip(ctx, u.x, u.y, u.w, u.h, 5);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(u.x, u.y, u.w, u.h);
    if (img.complete && img.naturalWidth) cover(ctx, img, u.x, u.y, u.w, u.h);
    if (u.shown <= 0) {
      ctx.fillStyle = "rgba(4,6,10,0.55)";
      ctx.fillRect(u.x, u.y, u.w, u.h);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = u.battery
      ? "rgba(176,140,255,0.55)"
      : u.side === "atk"
        ? "rgba(62,232,196,0.55)"
        : "rgba(255,138,76,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(u.x, u.y, u.w, u.h, 5);
    else ctx.rect(u.x, u.y, u.w, u.h);
    ctx.stroke();
    if (now - (u.flash || 0) < 160) {
      ctx.fillStyle = `rgba(255,220,180,${0.35 * (1 - (now - u.flash) / 160)})`;
      ctx.fill();
    }
    ctx.restore();
    const badge = `×${fmt(u.shown)}`;
    ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
    const tw = ctx.measureText(badge).width;
    const bx = u.x + u.w - tw - 10;
    const by = u.y + u.h - 16;
    ctx.fillStyle = "rgba(3,5,10,0.78)";
    ctx.fillRect(bx - 4, by - 2, tw + 8, 14);
    ctx.fillStyle = u.shown < u.start ? "#ff8aa0" : "#e8eef6";
    ctx.fillText(badge, bx, by + 9);
  }

  function draw(now) {
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    const elapsed = reduced ? DURATION : now - started;
    const t = clamp(elapsed, 0, DURATION);
    const approachT = clamp(t / APPROACH, 0, 1);
    const fireT = clamp((t - APPROACH) / FIRE, 0, 1);
    const resolveT = clamp((t - APPROACH - FIRE) / RESOLVE, 0, 1);
    const slide = easeInOut(approachT);

    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(62,232,196,0.07)");
    g.addColorStop(0.5, "rgba(4,7,14,0)");
    g.addColorStop(1, "rgba(255,90,60,0.08)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      ctx.fillStyle = `rgba(210,230,255,${s.a * (0.55 + 0.45 * Math.sin(now / 700 + s.tw))})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = W * 0.78;
    const py = H * 0.52;
    const pr = Math.min(64, H * 0.22);
    const planet = ctx.createRadialGradient(px - pr * 0.25, py - pr * 0.2, 4, px, py, pr);
    planet.addColorStop(0, "rgba(90,160,170,0.55)");
    planet.addColorStop(0.55, "rgba(18,40,48,0.7)");
    planet.addColorStop(1, "rgba(4,8,14,0)");
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(62,232,196,0.18)";
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.35, pr * 0.28, -0.2, 0, Math.PI * 2);
    ctx.stroke();

    for (const u of atk) u.x = u.fromX + (u.restX - u.fromX) * slide;
    for (const u of right) u.x = u.fromX + (u.restX - u.fromX) * slide;

    if (t >= APPROACH) tickCounts(now, fireT);

    if (t >= APPROACH && t < APPROACH + FIRE) {
      const atkLive = atk.reduce((s, u) => s + u.shown * u.atk, 0);
      const defLive = right.reduce((s, u) => s + u.shown * u.atk, 0);
      const rate = 8 + Math.min(18, (atkLive + defLive) / 90);
      shotAcc += dt;
      const interval = 1000 / Math.max(6, rate);
      while (shotAcc >= interval) {
        shotAcc -= interval;
        const a = pick(atk, rand);
        const d = pick(right, rand);
        if (a && d) spawnShot(a, d, "rgba(62,232,196,0.95)", now);
        if (rand() < 0.72) {
          const back = pick(right, rand);
          const tgt = pick(atk, rand);
          if (back && tgt) {
            spawnShot(back, tgt, back.battery ? "rgba(176,140,255,0.95)" : "rgba(255,138,76,0.95)", now);
          }
        }
      }
    }

    ctx.globalCompositeOperation = "lighter";
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      const age = now - s.t;
      if (age > s.life) {
        shots.splice(i, 1);
        continue;
      }
      const k = 1 - age / s.life;
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = s.w * k;
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x1, s.y1, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      const age = now - s.t;
      if (age > s.life) {
        sparks.splice(i, 1);
        continue;
      }
      const k = 1 - age / s.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2 + 7 * (1 - k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    for (const u of atk) drawToken(u, now);
    for (const u of right) drawToken(u, now);

    if (approachT < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - approachT;
      ctx.fillStyle = "#e8eef6";
      ctx.font = "700 18px Tektur, Sora, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("VS", W / 2, H / 2 + 6);
      ctx.restore();
    }

    if (resolveT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, resolveT * 1.4);
      ctx.fillStyle = payload.win ? "rgba(94,232,160,0.12)" : "rgba(255,90,106,0.12)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = payload.win ? "#5ee8a0" : "#ff8aa0";
      ctx.font = "700 22px Tektur, Sora, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(payload.win ? "SIEG" : "NIEDERLAGE", W / 2, H / 2 + 8);
      ctx.restore();
    }

    const atkN = atk.reduce((s, u) => s + u.shown, 0);
    const defN = def.reduce((s, u) => s + u.shown, 0);
    const batN = bat.reduce((s, u) => s + u.shown, 0);
    if (status) {
      if (t < APPROACH) status.textContent = "Flotten treffen ein";
      else if (t < APPROACH + FIRE) {
        status.textContent = `${fmt(atkN)} vs ${fmt(defN)}${batN ? " +" + fmt(batN) : ""}`;
      } else status.textContent = payload.win ? "Orbit genommen" : "Abwehr hält";
    }

    if (t < DURATION && !reduced) raf = requestAnimationFrame(draw);
    else {
      raf = 0;
      if (again) again.hidden = false;
    }
  }

  resize();
  if (again) again.hidden = true;
  raf = requestAnimationFrame(draw);
  const ro = new ResizeObserver(() => {
    resize();
    if (!raf) draw(performance.now());
  });
  ro.observe(el);

  const inst = {
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
    },
  };
  running.set(el, inst);
}

function stopBattleReplay(el) {
  const inst = running.get(el);
  if (inst) {
    inst.stop();
    running.delete(el);
  }
}

export function bindBattleReplays(root) {
  root.querySelectorAll(".battle-replay").forEach((el) => {
    const details = el.closest("details");
    const again = el.querySelector(".br-again");
    const start = () => playBattleReplay(el);
    again?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      start();
    });
    if (!details || details.open) requestAnimationFrame(start);
    details?.addEventListener("toggle", () => {
      if (details.open) requestAnimationFrame(start);
      else stopBattleReplay(el);
    });
  });
}
