"use strict";

(function () {
  if (!document.body || document.body.dataset.mode !== "play") return;

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"'`]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c];
    });
  }
  function fmt(n) {
    n = Math.floor(Number(n) || 0);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + "k";
    return n.toLocaleString("de-DE");
  }

  async function api(path, opt) {
    const res = await fetch("/api" + path, {
      method: (opt && opt.method) || "GET",
      credentials: "include",
      headers: opt && opt.body ? { "Content-Type": "application/json" } : undefined,
      body: opt && opt.body ? JSON.stringify(opt.body) : undefined,
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function paint(snap, catalog) {
    const e = snap.empire || {};
    const p = snap.planet || {};
    const name = $("empire-name");
    if (name) name.textContent = (e.name || "—") + (snap.user && snap.user.isAdmin ? " · ADMIN" : "");
    const res = $("resources");
    if (res && p && catalog && catalog.resourceIds) {
      res.innerHTML = catalog.resourceIds
        .map(function (k) {
          const def = catalog.resources[k] || { name: k, color: "#fff" };
          const v = Math.floor(p[k] || 0);
          const prod = (p.production && p.production[k]) || 0;
          return (
            '<div class="res" data-k="' +
            k +
            '"><img class="res-art" src="/assets/resources/' +
            k +
            '.jpg" alt=""><div class="res-meta"><em>' +
            esc(def.name) +
            "</em><b style=\"color:" +
            def.color +
            '">' +
            fmt(v) +
            "</b><small>+" +
            fmt(prod) +
            "/h</small></div></div>"
          );
        })
        .join("");
    }
    const sel = $("planet-select");
    if (sel && snap.planets) {
      sel.innerHTML = snap.planets
        .map(function (pl) {
          return '<option value="' + pl.id + '"' + (p.id === pl.id ? " selected" : "") + ">" + esc(pl.name) + "</option>";
        })
        .join("");
    }
    const view = $("view");
    if (!view) return;
    const type = p.type || "terran";
    const rows = (catalog.resourceIds || [])
      .map(function (k) {
        const def = catalog.resources[k] || { name: k, color: "#fff" };
        const cap = typeof p.storage === "object" ? p.storage[k] : p.storage;
        return (
          "<tr><td>" +
          esc(def.name) +
          '</td><td style="color:' +
          def.color +
          '"><b>' +
          fmt(p[k] || 0) +
          "</b></td><td class=\"muted\">/ " +
          fmt(cap || 0) +
          "</td><td>+" +
          fmt((p.production && p.production[k]) || 0) +
          "/h</td></tr>"
        );
      })
      .join("");
    view.innerHTML =
      '<section class="colony-hero panel">' +
      '<img class="colony-vista" src="/assets/planets/' +
      type +
      '-colony.jpg" alt="">' +
      '<div class="hero-veil"></div><div class="hero-copy"><h2>' +
      esc(p.name || "Heimat") +
      "</h2><div>" +
      esc(p.systemName || "") +
      " · " +
      esc(p.typeName || type) +
      "</div></div></section>" +
      '<div class="og-overview"><div class="og-planet-box panel">' +
      '<img class="planet-orb-media" src="/assets/planets/' +
      type +
      '.jpg" alt="" style="width:200px;height:200px;border-radius:50%;object-fit:cover;margin:18px auto;display:block">' +
      "<h3>" +
      esc(p.name || "") +
      '</h3></div><div class="og-meta panel">' +
      "<div><b>Commander</b> " +
      esc((snap.user && snap.user.username) || "") +
      " · " +
      esc(e.name || "") +
      "</div>" +
      "<div><b>Spezies</b> " +
      esc((snap.species && snap.species.name) || "Terraner") +
      "</div>" +
      "<div><b>Stufe</b> " +
      (e.level || 1) +
      " · " +
      fmt(e.score || 0) +
      " Punkte</div>" +
      '<table class="table prod-table" style="margin-top:10px">' +
      rows +
      "</table></div></div>" +
      '<p class="hint" style="padding:12px 0">Gebäude, Werft, Forschung: linke Navigation.</p>';
  }

  async function start() {
    const view = $("view");
    try {
      const cat = await api("/catalog");
      const snap = await api("/state");
      window.__snBoot = { cat: cat, snap: snap };
      paint(snap, cat);
      const sel = $("planet-select");
      if (sel) {
        sel.onchange = function () {
          api("/focus", { method: "POST", body: { planetId: Number(sel.value) } })
            .then(function (s) {
              paint(s, cat);
            })
            .catch(function (e) {
              if (view) view.innerHTML = '<p class="error" style="padding:24px">' + esc(e.message) + "</p>";
            });
        };
      }
    } catch (e) {
      if (String(e.message || "").indexOf("Nicht angemeldet") >= 0) {
        location.replace("/?login=need");
        return;
      }
      if (view) {
        view.innerHTML =
          '<p class="error" style="padding:24px">' +
          esc(e.message || e) +
          '</p><p style="padding:0 24px"><a href="/">Zurück zur Startseite</a></p>';
      }
    }
  }

  start();
})();
