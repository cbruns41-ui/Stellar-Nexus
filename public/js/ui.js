export function esc(s) {
  return String(s ?? "").replace(/[&<>"'`]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
  })[c]);
}

export function fmt(n) {
  n = Math.floor(Number(n) || 0);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString("de-DE");
}

export function eta(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function tickMsFrom(catalog) {
  return Number(catalog?.tickMs) || 5 * 60 * 1000;
}

export function ticksOf(ms, catalog) {
  const tick = tickMsFrom(catalog);
  return Math.max(0, Math.round(Number(ms) / tick));
}

export function tickEta(ms, catalog) {
  const n = Math.max(0, Math.ceil(Number(ms) / tickMsFrom(catalog)));
  if (!n) return "0 Ticks";
  return `${n} Tick${n === 1 ? "" : "s"} (${eta(n * tickMsFrom(catalog))})`;
}

export function when(ts) {
  return new Date(ts).toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function costHtml(c, have, catalog) {
  if (!c) return "";
  const ids = catalog?.resourceIds || ["metal", "helium", "titan", "energy", "crystal", "diamond"];
  const bits = [];
  for (const k of ids) {
    const need = Number(c[k] || 0);
    if (!need) continue;
    const label = catalog?.resources?.[k]?.short || k;
    const ok = !have || have[k] >= need;
    bits.push(
      `<span data-k="${k}" class="${ok ? "" : "danger"}">${resourceIcon(k)} ${esc(label)} ${fmt(need)}</span>`
    );
  }
  return `<div class="cost">${bits.join("")}</div>`;
}

export function planetGlobeUrl(type) {
  const t = type && String(type) ? type : "terran";
  return `/assets/planets/${t}.jpg`;
}

export function planetColonyUrl(type) {
  const t = type && String(type) ? type : "terran";
  return `/assets/planets/${t}-colony.jpg`;
}

export function mediaTag(src, cls = "") {
  const jpg = String(src || "");
  const mp4 = jpg.replace(/\.jpe?g$/i, ".mp4");
  const c = cls ? ` class="${cls}"` : "";
  if (!/\.jpe?g$/i.test(jpg)) return `<img${c} src="${esc(jpg)}" alt="" loading="lazy" decoding="async" />`;
  const mobileLite = navigator.connection?.saveData || (window.matchMedia?.("(max-width: 760px)")?.matches && Number(navigator.deviceMemory || 4) <= 4);
  if (mobileLite) return `<img${c} src="${esc(jpg)}" alt="" loading="lazy" decoding="async" />`;
  return `<video${c} autoplay muted loop playsinline preload="metadata" poster="${esc(jpg)}" src="${esc(mp4)}" data-fallback="${esc(jpg)}"></video>`;
}

export function bindMediaFallbacks(root = document) {
  root.querySelectorAll("video[data-fallback]").forEach((v) => {
    if (v.dataset.bound) return;
    v.dataset.bound = "1";
    const swap = () => {
      const img = document.createElement("img");
      img.src = v.dataset.fallback;
      img.className = v.className;
      img.alt = "";
      v.replaceWith(img);
    };
    v.addEventListener("error", swap);
    const src = v.querySelector("source") || v;
    src.addEventListener?.("error", swap);
  });
}

export function planetCss(type) {
  const map = {
    terran:
      "radial-gradient(circle at 30% 26%, #d8ffe8 0 8%, #7ed9a6 18%, #2f8a68 42%, #163d38 70%, #071614 100%)",
    ocean:
      "radial-gradient(circle at 28% 24%, #e4f6ff 0 7%, #7ec9ff 20%, #1d6cb0 48%, #0b2748 76%, #051018 100%)",
    desert:
      "radial-gradient(circle at 34% 22%, #fff1c9 0 8%, #f0b45a 22%, #c46a22 50%, #5a2a10 78%, #1a0c06 100%)",
    ice:
      "radial-gradient(circle at 32% 28%, #ffffff 0 6%, #c9f0ff 18%, #7ec7e0 46%, #2a6280 74%, #0c2430 100%)",
    lava:
      "radial-gradient(circle at 30% 22%, #ffe7c4 0 6%, #ff7a3a 20%, #c23014 48%, #4a0d0d 76%, #140404 100%)",
    gas:
      "radial-gradient(circle at 38% 30%, #f3e8ff 0 6%, #c4a0ff 18%, #6b3ad6 46%, #2a1658 74%, #0c081c 100%)",
    ruin:
      "radial-gradient(circle at 28% 26%, #f0e4ff 0 6%, #b7a0d4 20%, #5a4a72 50%, #241830 76%, #0c0812 100%)",
  };
  return map[type] || map.terran;
}

export function resourceIcon(id) {
  return `<img class="res-ico" src="/assets/resources/${id}.jpg" alt="" width="14" height="14">`;
}

export function resourceIconSvg(id) {
  const stroke = "currentColor";
  const paths = {
    metal: `<path d="M4 16 12 4l8 12H4z" fill="currentColor" opacity=".35"/><path d="M4 16 12 4l8 12"/>`,
    helium: `<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M4.6 6.5l2.2 2.2M17.2 15.3l2.2 2.2M3 12h3M18 12h3M4.6 17.5l2.2-2.2M17.2 8.7l2.2-2.2"/>`,
    titan: `<rect x="7" y="4" width="10" height="16" rx="1"/><path d="M7 9h10M7 15h10"/>`,
    energy: `<path d="M13 2 6 13h6l-1 9 8-12h-6l2-8z" fill="currentColor" opacity=".4"/><path d="M13 2 6 13h6l-1 9 8-12h-6l2-8z"/>`,
    crystal: `<path d="M12 3 19 9l-7 12L5 9z" fill="currentColor" opacity=".35"/><path d="M12 3 19 9l-7 12L5 9zM5 9h14"/>`,
    diamond: `<path d="M3 10 8 4h8l5 6-9 10z" fill="currentColor" opacity=".35"/><path d="M3 10 8 4h8l5 6-9 10zM3 10h18M8 4l4 6 4-6M12 10v10"/>`,
  };
  return `<svg class="res-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6">${paths[id] || paths.metal}</svg>`;
}

export function toast(msg, bad = false) {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast panel" + (bad ? " bad" : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

let audioCtx;
export function beep(kind = "ok") {
  if (localStorage.getItem("sn-sound") === "0") return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = kind === "alert" ? "sawtooth" : "triangle";
    o.connect(g);
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    if (kind === "alert") {
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.28);
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.start(t);
      o.stop(t + 0.34);
    } else if (kind === "done") {
      o.frequency.setValueAtTime(480, t);
      o.frequency.exponentialRampToValueAtTime(920, t + 0.14);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.start(t);
      o.stop(t + 0.22);
    } else {
      o.frequency.setValueAtTime(620, t);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.start(t);
      o.stop(t + 0.14);
    }
  } catch {
    /* autoplay policy */
  }
}

export function notify(title, body) {
  try {
    if (localStorage.getItem("sn-notify") === "0") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/assets/emblem.jpg" });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") new Notification(title, { body, icon: "/assets/emblem.jpg" });
      });
    }
  } catch {
    /* ignore */
  }
}

export function showModal(html) {
  const m = document.getElementById("modal");
  m.innerHTML = html;
  m.hidden = false;
  m.classList.remove("hidden");
  m.onclick = (e) => {
    if (e.target === m) hideModal();
  };
}

export function hideModal() {
  const m = document.getElementById("modal");
  m.hidden = true;
  m.classList.add("hidden");
  m.innerHTML = "";
}

const ICONS = {
  hex: "M12 2 21 7v10l-9 5-9-5V7z",
  mine: "M3 20h18M5 20 10 8l4 6 3-4 4 10",
  sun: "M12 8a4 4 0 1 0 .01 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  nodes: "M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 7m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M19 7m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M6 18m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M18 18m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M7 8l3.5 3M17 8l-3.5 3M8 16l2.5-3M16 16l-2.5-3",
  silo: "M7 7c0-3 10-3 10 0v13H7zM7 10h10",
  wedge: "M3 19h18L12 4z",
  diamond: "M12 2 21 12 12 22 3 12z",
  shield: "M12 3 20 7v5c0 5-3.4 8.4-8 9.8C7.4 20.4 4 17 4 12V7z",
  star: "M12 2l2.2 6.8H21l-5.4 4 2.1 6.7L12 16.6 6.3 19.5l2.1-6.7L3 8.8h6.8z",
};

export function icon(name) {
  const d = ICONS[name] || ICONS.hex;
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${d.includes("m-") ? `<path d="${d}"/>` : `<path d="${d}"/>`}</svg>`;
}

export function shipList(map, catalog) {
  const parts = [];
  for (const [id, n] of Object.entries(map || {})) {
    if (!n) continue;
    parts.push(`${n}× ${esc(catalog.ships[id]?.name || id)}`);
  }
  return parts.join(", ") || "—";
}

export function starfield(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const stars = [];
  const streaks = [];
  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    stars.length = 0;
    streaks.length = 0;
    const n = Math.floor((canvas.width * canvas.height) / 7200);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random(),
        p: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 18; i++) {
      streaks.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: 40 + Math.random() * 90,
        v: 1.4 + Math.random() * 2.8,
        a: 0.12 + Math.random() * 0.25,
      });
    }
  }
  const nebulae = [
    { x: 0.18, y: 0.28, c: "62,120,255" },
    { x: 0.78, y: 0.22, c: "140,70,220" },
    { x: 0.62, y: 0.78, c: "20,160,180" },
  ];
  resize();
  addEventListener("resize", resize);
  function frame(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const n of nebulae) {
      const g = ctx.createRadialGradient(canvas.width * n.x, canvas.height * n.y, 20, canvas.width * n.x, canvas.height * n.y, canvas.width * 0.38);
      g.addColorStop(0, `rgba(${n.c},0.16)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const land = document.body.classList.contains("land");
    for (const s of stars) {
      if (land) {
        s.y += 0.08 + s.z * 0.22;
        if (s.y > canvas.height) s.y = 0;
      }
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + s.p));
      ctx.globalAlpha = 0.22 + s.z * 0.78 * tw;
      ctx.fillStyle = s.z > 0.88 ? "#c084fc" : s.z > 0.62 ? "#9fefff" : "#e8f1ff";
      const r = s.z > 0.92 ? 1.6 : 0.6 + s.z;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (land) {
      for (const st of streaks) {
        st.x += st.v * 1.6;
        st.y += st.v * 0.35;
        if (st.x > canvas.width + 80 || st.y > canvas.height + 40) {
          st.x = -80;
          st.y = Math.random() * canvas.height;
        }
        const g = ctx.createLinearGradient(st.x, st.y, st.x - st.len, st.y - st.len * 0.2);
        g.addColorStop(0, `rgba(158, 255, 247, ${st.a})`);
        g.addColorStop(1, "rgba(158, 255, 247, 0)");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x - st.len, st.y - st.len * 0.2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
