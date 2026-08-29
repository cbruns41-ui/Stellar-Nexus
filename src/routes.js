"use strict";

const {
  BUILDINGS,
  TECHS,
  SHIPS,
  DEFENSES,
  PLANET_TYPES,
  STAR_TYPES,
  publicCatalog,
  scaledCost,
  scaledTime,
  meetsReq,
  colonyShipCost,
} = require("./catalog");
const {
  hashPassword,
  verifyPassword,
  parseCookies,
  createSession,
  destroySession,
  userFromRequest,
  setSessionCookie,
  clearSessionCookie,
  rateLimit,
} = require("./auth");
const game = require("./game");
const progress = require("./progress");
const social = require("./social");
const { remnantFleet } = require("./galaxy");
const { withTx } = require("./tx");
const chat = require("./chat");
const moderation = require("./moderation");
const fairplay = require("./fairplay");
const premium = require("./premium");
const settings = require("./settings");
const admin = require("./admin");

const DELETE_CONFIRMATIONS = {
  de: "Löschen",
  en: "Delete",
  it: "Elimina",
  fr: "Supprimer",
  es: "Eliminar",
  pl: "Usuń",
  pt: "Excluir",
  ru: "Удалить",
  nl: "Verwijderen",
  cs: "Smazat",
  tr: "Sil",
};

function fail(res, status, error) {
  res.status(status).json({ error });
}

function attachRoutes(app, db) {
  const auth = (req, res, next) => {
    const user = userFromRequest(db, req);
    if (!user) return fail(res, 401, "Nicht angemeldet.");
    if (moderation.isBanned(user)) {
      destroySession(db, parseCookies(req).sn_session);
      clearSessionCookie(res);
      return fail(res, 403, moderation.banMessage(user));
    }
    req.user = user;
    if (settings.get(db).maintenance && !user.is_admin && req.path !== "/api/auth/logout" && req.path !== "/api/state") {
      return fail(res, 503, settings.get(db).announcement || "Wartung. Bitte später erneut.");
    }
    next();
  };

  const adminOnly = (req, res, next) => {
    if (!req.user?.is_admin) return fail(res, 403, "Nur Admin.");
    next();
  };

  const staff = (req, res, next) => {
    if (!moderation.canMod(req.user)) return fail(res, 403, "Keine Moderatorenrechte.");
    next();
  };

  app.get("/api/health", (_req, res) => {
    const systems = db.prepare("SELECT COUNT(*) AS n FROM systems").get().n;
    const empires = db.prepare("SELECT COUNT(*) AS n FROM empires").get().n;
    res.json({ ok: true, name: "Stellar Nexus", systems, empires });
  });

  app.get("/api/catalog", (_req, res) => res.json(publicCatalog()));

  app.get("/api/beta/stats", (_req, res) => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM beta_registrations").get().n;
    res.json({ count });
  });

  app.post("/api/beta/register", (req, res) => {
    try {
      const cfg = settings.get(db);
      if (!cfg.betaOpen) return fail(res, 403, "Beta-Registrierung ist derzeit geschlossen.");
      const ip = req.ip || "local";
      if (!rateLimit(`beta:${ip}`, 5, 10 * 60 * 1000)) return fail(res, 429, "Zu viele Versuche.");
      const email = String(req.body?.email || "").trim().slice(0, 180);
      const username = String(req.body?.username || "").trim().slice(0, 40);
      const message = String(req.body?.message || "").trim().slice(0, 500);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Gültige E-Mail-Adresse erforderlich.");
      const existing = db.prepare("SELECT id FROM beta_registrations WHERE email = ?").get(email);
      if (existing) return fail(res, 409, "Diese E-Mail ist bereits registriert.");
      db.prepare("INSERT INTO beta_registrations(email, username, message, ip, created_at) VALUES(?,?,?,?,?)").run(email, username, message, ip, Date.now());
      res.json({ ok: true });
    } catch (err) { fail(res, 400, err.message); }
  });

  app.post("/api/auth/register", (req, res) => {
    const ip = req.ip || "local";
    if (!settings.get(db).registrationOpen) return fail(res, 403, "Registrierung ist derzeit geschlossen.");
    if (!rateLimit(`reg:${ip}`, 8, 10 * 60 * 1000)) return fail(res, 429, "Zu viele Versuche.");
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const empireName = String(req.body?.empire || "").trim();
    const speciesMod = require("./species");
    const raceId = String(req.body?.species || "terran");
    if (!speciesMod.SPECIES[raceId]) return fail(res, 400, "Unbekannte Spezies.");
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      return fail(res, 400, "Commander-ID: 3–16 Zeichen, nur Buchstaben, Zahlen, _.");
    }
    if (username.toLowerCase() === "admin") {
      return fail(res, 403, "Dieser Name ist reserviert.");
    }
    if (password.length < 6 || password.length > 72) return fail(res, 400, "Passwort: 6–72 Zeichen.");
    if (empireName.length < 3 || empireName.length > 24) return fail(res, 400, "Imperiumsname: 3–24 Zeichen.");
    const exists = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (exists) return fail(res, 409, "Diese Commander-ID ist vergeben.");
    try {
      const t = Date.now();
      const userId = withTx(db, () => {
        const u = db
          .prepare("INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?)")
          .run(username, hashPassword(password), t);
        const id = Number(u.lastInsertRowid);
        const e = db
          .prepare("INSERT INTO empires(user_id, name, color, created_at, species, nex) VALUES(?, ?, ?, ?, ?, ?)")
          .run(id, empireName, game.pickColor(db), t, raceId, settings.get(db).starterNex ?? speciesMod.STARTER_NEX);
        game.assignHome(db, Number(e.lastInsertRowid), empireName);
        return id;
      });
      const token = createSession(db, userId);
      setSessionCookie(res, token);
      res.json({ ok: true, username });
    } catch (err) {
      fail(res, 400, err.message || "Registrierung fehlgeschlagen.");
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip || "local";
    if (!rateLimit(`login:${ip}`, 80, 10 * 60 * 1000)) return fail(res, 429, "Zu viele Versuche. Kurz warten.");
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
    const isForm = String(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded");
    if (!user || !verifyPassword(password, user.password_hash)) {
      if (isForm) return res.redirect(303, "/?login=fail");
      return fail(res, 401, "Ungültige Zugangsdaten.");
    }
    if (moderation.isBanned(user)) {
      if (isForm) return res.redirect(303, "/?login=banned");
      return fail(res, 403, moderation.banMessage(user));
    }
    const token = createSession(db, user.id);
    setSessionCookie(res, token);
    if (isForm) return res.redirect(303, "/");
    res.json({ ok: true, username: user.username });
  });

  app.post("/api/auth/logout", (req, res) => {
    destroySession(db, parseCookies(req).sn_session);
    clearSessionCookie(res);
    const isForm = String(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded");
    if (isForm) return res.redirect(303, "/");
    res.json({ ok: true });
  });

  app.get("/api/state", auth, (req, res) => {
    try {
      const planetId = req.query.planet ? Number(req.query.planet) : null;
      res.json(game.snapshot(db, req.user, planetId));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/directive", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.setPlanetDirective(db, planet, String(req.body?.directive || ""));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/relics/equip", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      game.equipRelicLoadout(db, empire, req.body?.ids || []);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/market/trade", auth, (req, res) => {
    try {
      const { planet } = loadCtx(req);
      game.tradeOffer(db, planet, req.body?.index);
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/rush", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.rushQueue(db, empire, planet);
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/species", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      withTx(db, () => game.changeSpecies(db, empire, String(req.body?.id || "")));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/nex/buy", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      withTx(db, () => game.buyNexItem(db, empire, planet, String(req.body?.id || ""), req.body || {}));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/nex/daily", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      withTx(db, () => game.claimDailyNex(db, empire));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/nex/grant", auth, (req, res) => {
    try {
      if (!req.user.is_admin) return fail(res, 403, "Nur Admin.");
      const { empire, planet } = loadCtx(req);
      withTx(db, () => game.grantNex(db, empire, Number(req.body?.amount || 100)));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/nex/checkout", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      const sku = String(req.body?.sku || "");
      const opts = { ageConfirm: !!req.body?.ageConfirm, waiveWithdrawal: !!req.body?.waiveWithdrawal };
      withTx(db, () => {
        if (premium.PACKS.some((p) => p.id === sku)) premium.buyPack(db, empire, sku, opts);
        else if (premium.PLANS.some((p) => p.id === sku)) premium.subscribe(db, empire, sku, opts);
        else if (premium.SHOP.ship_cap_boost && premium.SHOP.ship_cap_boost.id === sku) premium.buyShipCapBoost(db, empire);
        else throw new Error("Unbekanntes Angebot.");
      });
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/nex/vip/cancel", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      premium.cancelVip(db, empire);
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/nex/vip/grant", auth, (req, res) => {
    try {
      if (!req.user.is_admin) return fail(res, 403, "Nur Admin.");
      const { empire, planet } = loadCtx(req);
      premium.grantVipDays(db, empire, Number(req.body?.days || 30));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/market/exchange", auth, (req, res) => {
    try {
      const { planet } = loadCtx(req);
      game.exchangeMarket(db, planet, req.body?.give, req.body?.get, req.body?.amount);
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/quest/op", auth, (req, res) => {
    try {
      game.tickWorld(db);
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const planet = db.prepare("SELECT * FROM planets WHERE id = ? AND empire_id = ?").get(empire.last_planet_id, empire.id);
      game.claimDailyOp(db, empire, planet, String(req.body?.id || ""));
      res.json(game.snapshot(db, req.user, planet?.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/quest/weekly", auth, (req, res) => {
    try {
      game.tickWorld(db);
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const planet = db.prepare("SELECT * FROM planets WHERE id = ? AND empire_id = ?").get(empire.last_planet_id, empire.id);
      game.claimWeeklyOp(db, empire, planet, String(req.body?.id || ""));
      res.json(game.snapshot(db, req.user, planet?.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/quest/claim", auth, (req, res) => {
    try {
      game.tickWorld(db);
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const planet = db.prepare("SELECT * FROM planets WHERE id = ? AND empire_id = ?").get(empire.last_planet_id, empire.id);
      game.claimQuest(db, empire, planet, String(req.body?.id || ""));
      res.json(game.snapshot(db, req.user, planet?.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/focus", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const planet = loadPlanet(empire, Number(req.body?.planetId));
      db.prepare("UPDATE empires SET last_planet_id = ? WHERE id = ?").run(planet.id, empire.id);
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 404, err.message || "Planet nicht im Imperium.");
    }
  });

  app.post("/api/bookmarks", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const planetId = Number(req.body?.planetId);
      const planet = db.prepare("SELECT id, system_id FROM planets WHERE id = ?").get(planetId);
      if (!planet) return fail(res, 404, "Planet nicht gefunden.");
      const existing = db.prepare("SELECT planet_id FROM planet_bookmarks WHERE empire_id = ? AND planet_id = ?").get(empire.id, planetId);
      if (!existing) {
        const n = db.prepare("SELECT COUNT(*) AS n FROM planet_bookmarks WHERE empire_id = ?").get(empire.id).n;
        const cap = premium.bookmarkCap(empire, db);
        if (n >= cap) {
          throw new Error(`Maximal ${cap} gespeicherte Ziele. Der Nexus-Pass erhöht das Limit auf 24.`);
        }
      }
      db.prepare("INSERT INTO planet_bookmarks(empire_id, planet_id, system_id, label, created_at) VALUES(?,?,?,?,?) ON CONFLICT(empire_id, planet_id) DO UPDATE SET label = excluded.label, system_id = excluded.system_id").run(empire.id, planetId, planet.system_id, String(req.body?.label || "").trim().slice(0, 40), Date.now());
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) { fail(res, 400, err.message); }
  });

  app.delete("/api/bookmarks/:planetId", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT id FROM empires WHERE user_id = ?").get(req.user.id);
      db.prepare("DELETE FROM planet_bookmarks WHERE empire_id = ? AND planet_id = ?").run(empire.id, Number(req.params.planetId));
      res.json({ ok: true });
    } catch (err) { fail(res, 400, err.message); }
  });

  function loadPlanet(empire, planetId) {
    const planet = db.prepare("SELECT * FROM planets WHERE id = ?").get(Number(planetId));
    if (!planet || !social.canAccessPlanet(db, empire.id, planet)) throw new Error("Planet nicht gefunden.");
    return planet;
  }

  function loadCtx(req) {
    game.tickWorld(db);
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    const planetId = Number(req.body?.planetId || empire.last_planet_id);
    const planet = loadPlanet(empire, planetId);
    return { empire, planet: game.accruePlanet(db, planet) };
  }

  app.post("/api/build", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.enqueueBuilding(db, empire, planet, String(req.body?.id || ""));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/ship", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.enqueueShip(db, empire, planet, String(req.body?.id || ""), Number(req.body?.qty || 1));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/defense", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.enqueueDefense(db, empire, planet, String(req.body?.id || ""), Number(req.body?.qty || 1));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/spy/odds", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(Number(req.body?.targetId));
      if (!target) return fail(res, 404, "Ziel unbekannt.");
      const probes = Math.max(1, Number(req.body?.probes) || 1);
      res.json(game.spyOdds(db, empire, planet, target, probes));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/combat/preview", auth, (req, res) => {
    try {
      game.tickWorld(db);
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const origin = loadPlanet(empire, Number(req.body?.planetId || empire.last_planet_id));
      const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(Number(req.body?.targetId));
      if (!origin || !target) return fail(res, 404, "Planet nicht gefunden.");
      res.json(game.previewCombat(db, empire, origin, target, req.body?.ships || {}));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/combat/sim", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      res.json(game.simulateWhatIf(db, empire, req.body || {}));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/empire/:id", auth, (req, res) => {
    try {
      const row = db
        .prepare(
          `SELECT e.*, u.username FROM empires e JOIN users u ON u.id = e.user_id WHERE e.id = ?`
        )
        .get(Number(req.params.id));
      if (!row) return fail(res, 404, "Imperium unbekannt.");
      res.json({ empire: progress.publicProfile(db, row) });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/ranks", auth, (_req, res) => {
    game.tickWorld(db);
    const ranks = game.listRanks(db);
    res.json({ ranks, categories: {
      combat: [...ranks].sort((a, b) => b.combatScore - a.combatScore || b.score - a.score),
      economy: [...ranks].sort((a, b) => b.economyScore - a.economyScore || b.score - a.score),
      research: [...ranks].sort((a, b) => b.researchScore - a.researchScore || b.score - a.score),
    } });
  });

  app.post("/api/settings", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.updateSettings(db, req.user, empire, req.body || {});
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/account/delete", auth, (req, res) => {
    try {
      const password = String(req.body?.password || "");
      const account = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
      if (!account || !verifyPassword(password, account.password_hash)) return fail(res, 403, "Passwort falsch.");
      const empire = db.prepare("SELECT id, avatar FROM empires WHERE user_id = ?").get(req.user.id);
      if (!empire) return fail(res, 404, "Imperium nicht gefunden.");
      const expected = DELETE_CONFIRMATIONS[empire.locale] || DELETE_CONFIRMATIONS.de;
      if (String(req.body?.confirmation || "").trim().toLocaleLowerCase(empire.locale || "de") !== expected.toLocaleLowerCase(empire.locale || "de")) {
        return fail(res, 400, `Bitte „${expected}“ eingeben.`);
      }
      withTx(db, () => {
        const planetIds = db.prepare("SELECT id FROM planets WHERE empire_id = ?").all(empire.id).map((p) => p.id);
        const placeholders = planetIds.map(() => "?").join(",");
        if (planetIds.length) {
          db.prepare(`DELETE FROM raids WHERE target_planet_id IN (${placeholders})`).run(...planetIds);
          db.prepare(`DELETE FROM debris WHERE planet_id IN (${placeholders})`).run(...planetIds);
          db.prepare(`DELETE FROM buildings WHERE planet_id IN (${placeholders})`).run(...planetIds);
          db.prepare(`DELETE FROM ships WHERE planet_id IN (${placeholders})`).run(...planetIds);
          db.prepare(`DELETE FROM defenses WHERE planet_id IN (${placeholders})`).run(...planetIds);
        }
        db.prepare("DELETE FROM fleets WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM queue WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM reports WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM research WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM quests WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM relics WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM medals WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM planet_bookmarks WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM chat_reads WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM chat_i18n WHERE message_kind = 'chat' AND message_id IN (SELECT id FROM chat_messages WHERE empire_id = ?)").run(empire.id);
        db.prepare("DELETE FROM chat_messages WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM mail WHERE from_id = ? OR to_id = ?").run(req.user.id, req.user.id);
        db.prepare("DELETE FROM alliance_apps WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM alliance_planet_access WHERE empire_id = ?").run(empire.id);
        db.prepare("DELETE FROM activity_runs WHERE empire_id = ?").run(empire.id);
        const alliance = db.prepare("SELECT a.id, a.leader_id FROM alliances a JOIN alliance_members m ON m.alliance_id = a.id WHERE m.empire_id = ?").get(empire.id);
        if (alliance) {
          db.prepare("DELETE FROM alliance_apps WHERE alliance_id = ? AND empire_id = ?").run(alliance.id, empire.id);
          db.prepare("DELETE FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").run(alliance.id, empire.id);
          const next = db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id = ? ORDER BY joined_at LIMIT 1").get(alliance.id);
          if (next) {
            if (alliance.leader_id === empire.id) {
              db.prepare("UPDATE alliances SET leader_id = ? WHERE id = ?").run(next.empire_id, alliance.id);
              db.prepare("UPDATE alliance_members SET rank = 'leader' WHERE alliance_id = ? AND empire_id = ?").run(alliance.id, next.empire_id);
            }
            social.rehomeAlliancePlanet(db, alliance.id, next.empire_id);
          } else {
            const held = social.alliancePlanetRow(db, alliance.id);
            if (held) db.prepare("UPDATE planets SET alliance_id = NULL WHERE id = ?").run(held.id);
            db.prepare("DELETE FROM alliance_planet_access WHERE alliance_id = ?").run(alliance.id);
            db.prepare("DELETE FROM alliance_research_contributions WHERE alliance_id = ?").run(alliance.id);
            db.prepare("DELETE FROM alliance_research WHERE alliance_id = ?").run(alliance.id);
            db.prepare("DELETE FROM alliance_apps WHERE alliance_id = ?").run(alliance.id);
            db.prepare("DELETE FROM alliances WHERE id = ?").run(alliance.id);
          }
        }
        db.prepare("DELETE FROM planets WHERE empire_id = ? AND IFNULL(alliance_id, 0) = 0").run(empire.id);
        db.prepare("DELETE FROM empires WHERE id = ?").run(empire.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.user.id);
        db.prepare("DELETE FROM users WHERE id = ?").run(req.user.id);
      });
      if (empire.avatar === "custom") social.removeAvatarUpload(empire.id);
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (err) {
      fail(res, 400, err.message || "Account konnte nicht gelöscht werden.");
    }
  });

  app.post("/api/avatar", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      if (req.body?.image) social.saveAvatarUpload(db, empire, req.body.image);
      else if (req.body?.preset) social.updateSettings(db, req.user, empire, { avatar: req.body.preset });
      else throw new Error("Kein Avatar.");
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/alliances", auth, (req, res) => {
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    res.json({
      alliances: social.listAlliances(db),
      mine: social.myAlliance(db, empire.id),
    });
  });

  app.get("/api/alliances/:id", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      res.json({ alliance: social.getAlliance(db, Number(req.params.id), empire.id) });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.createAlliance(db, empire, req.body?.tag, req.body?.name, req.body?.blurb, req.body?.color);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/apply", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.applyAlliance(db, empire, Number(req.body?.id), req.body?.message);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/decide", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.decideApp(db, empire, Number(req.body?.allianceId), Number(req.body?.empireId), !!req.body?.accept);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/leave", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.leaveAlliance(db, empire);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/disband", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.disbandAlliance(db, empire);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/kick", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.kickMember(db, empire, Number(req.body?.empireId));
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/update", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.updateAlliance(db, empire, req.body || {});
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/rank", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.setRank(db, empire, Number(req.body?.empireId), String(req.body?.rank || ""));
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/transfer", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.transferLeadership(db, empire, Number(req.body?.empireId));
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/banner", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      if (req.body?.image) social.saveBannerUpload(db, empire, req.body.image);
      else social.updateAlliance(db, empire, { banner: req.body?.preset });
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/alliances/:id/activity", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const mine = social.myAlliance(db, empire.id);
      if (!mine || mine.id !== Number(req.params.id)) return fail(res, 403, "Keine Berechtigung.");
      const data = social.listAllianceActivity(db, mine.id);
      res.json(data);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/activity", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.runActivity(db, empire, planet, String(req.body?.kind || ""), String(req.body?.duration || "short"));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/research", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      if (req.body?.donate) {
        social.donateAllianceResearch(db, empire, planet, String(req.body?.id || ""), req.body?.donation || {});
      } else {
        game.enqueueAllianceResearch(db, empire, planet, String(req.body?.id || ""));
      }
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/alliances/planet-access", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      social.setPlanetAccess(db, empire, Number(req.body?.empireId), !!req.body?.grant);
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/research", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      game.enqueueResearch(db, empire, planet, String(req.body?.id || ""));
      res.json(game.snapshot(db, req.user, planet.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/queue/cancel", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      game.tickWorld(db);
      game.cancelQueue(db, empire, Number(req.body?.id));
      res.json(game.snapshot(db, req.user, empire.last_planet_id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/galaxy", auth, (req, res) => {
    game.tickWorld(db);
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    const systems = db.prepare("SELECT * FROM systems").all();
    const links = db.prepare("SELECT a, b FROM links").all();
    const flights = db
      .prepare(
        `SELECT f.id, f.mission, f.is_return, f.departed_at, f.arrives_at,
                op.system_id AS origin_system_id, tp.system_id AS target_system_id
         FROM fleets f
         JOIN planets op ON op.id = f.origin_planet_id
         JOIN planets tp ON tp.id = f.target_planet_id
         WHERE f.empire_id = ?
         ORDER BY f.arrives_at`
      )
      .all(empire.id)
      .map((f) => ({
        id: f.id,
        mission: f.mission,
        returning: !!f.is_return,
        departedAt: f.departed_at,
        arrivesAt: f.arrives_at,
        originSystemId: f.origin_system_id,
        targetSystemId: f.target_system_id,
      }));
    const owners = db
      .prepare(
        `SELECT p.system_id, e.id AS empire_id, e.name, e.color, COUNT(*) AS n
         FROM planets p JOIN empires e ON e.id = p.empire_id
         GROUP BY p.system_id, e.id`
      )
      .all();
    const bySys = {};
    for (const o of owners) {
      (bySys[o.system_id] ||= []).push({ empireId: o.empire_id, name: o.name, color: o.color, planets: o.n });
    }
    const techs = game.techsMap(db, empire.id);
    const riftRow = db.prepare("SELECT value FROM world_meta WHERE key = 'rift'").get();
    let riftId = 0;
    if (riftRow) {
      try {
        const d = JSON.parse(riftRow.value);
        if (d && d.until > Date.now()) riftId = d.systemId;
      } catch {
        riftId = 0;
      }
    }
    const home = db
      .prepare(
        "SELECT id, system_id FROM planets WHERE empire_id = ? AND IFNULL(alliance_id,0) = 0 ORDER BY id LIMIT 1"
      )
      .get(empire.id);
    res.json({
      now: Date.now(),
      self: {
        empireId: empire.id,
        color: empire.color,
        warp: techs.warp || 0,
        homePlanetId: home?.id || 0,
        homeSystemId: home?.system_id || 0,
      },
      riftSystemId: riftId || null,
      systems: systems.map((s) => ({
        id: s.id,
        name: s.name,
        x: s.x,
        y: s.y,
        starType: s.star_type,
        star: STAR_TYPES[s.star_type] || STAR_TYPES.yellow,
        isHub: !!s.is_hub,
        remnant: !!s.remnant,
        warlord: s.warlord || "",
        pirate: s.pirate || 0,
        rift: riftId === s.id,
        owners: bySys[s.id] || [],
      })),
      links,
      flights,
    });
  });

  app.get("/api/system/:id", auth, (req, res) => {
    game.tickWorld(db);
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    const sys = db.prepare("SELECT * FROM systems WHERE id = ?").get(Number(req.params.id));
    if (!sys) return fail(res, 404, "System unbekannt.");
    const planets = db.prepare("SELECT * FROM planets WHERE system_id = ? ORDER BY slot").all(sys.id);
    const focus = db.prepare("SELECT * FROM planets WHERE id = ?").get(empire.last_planet_id);
    const home = db
      .prepare(
        "SELECT id FROM planets WHERE empire_id = ? AND IFNULL(alliance_id,0) = 0 ORDER BY id LIMIT 1"
      )
      .get(empire.id);
    const techs = game.techsMap(db, empire.id);
    res.json({
      id: sys.id,
      name: sys.name,
      x: sys.x,
      y: sys.y,
      starType: sys.star_type,
      star: STAR_TYPES[sys.star_type],
      isHub: !!sys.is_hub,
      remnant: !!sys.remnant,
      remnantShips: sys.remnant ? remnantFleet(db, sys.id) : {},
      planets: planets.map((p) => {
        const ownerRow = p.empire_id
          ? db.prepare("SELECT * FROM empires WHERE id = ?").get(p.empire_id)
          : null;
        const owner = ownerRow ? fairplay.ownerPublic(db, empire, ownerRow) : null;
        if (owner && p.alliance_id) {
          const al = db.prepare("SELECT id, tag, name, color FROM alliances WHERE id = ?").get(p.alliance_id);
          if (al) owner.alliance = { id: al.id, tag: al.tag, name: al.name, color: al.color };
        }
        const visibleShips = owner && (owner.id === empire.id || social.canAccessPlanet(db, empire.id, p)) ? game.shipsMap(db, p.id) : null;
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          typeName: PLANET_TYPES[p.type]?.name,
          size: p.size,
          owner,
          own: p.empire_id === empire.id && !p.alliance_id,
          isHome: !!(home && p.id === home.id),
          alliancePlanet: !!p.alliance_id,
          canManage: social.canAccessPlanet(db, empire.id, p),
          ships: visibleShips,
          defenses: (owner && owner.id === empire.id) || social.canAccessPlanet(db, empire.id, p) ? game.defensesMap(db, p.id) : null,
          debris: db.prepare("SELECT COUNT(*) AS n FROM debris WHERE planet_id = ?").get(p.id).n,
        };
      }),
      fromPlanetId: focus?.id || null,
      warp: techs.warp || 0,
      warlord: sys.warlord || "",
      pirate: sys.pirate || 0,
      rift: (() => {
        const row = db.prepare("SELECT value FROM world_meta WHERE key = 'rift'").get();
        if (!row) return false;
        try {
          const d = JSON.parse(row.value);
          return d && d.until > Date.now() && d.systemId === sys.id;
        } catch {
          return false;
        }
      })(),
    });
  });

  app.post("/api/fleet", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(Number(req.body?.targetId));
      if (!target) throw new Error("Zielplanet unbekannt.");
      const result = game.sendFleet(
        db,
        empire,
        planet,
        target,
        String(req.body?.mission || ""),
        req.body?.ships || {},
        req.body?.cargo || {},
        { holdMs: req.body?.holdMs, joinFleetId: req.body?.joinFleetId }
      );
      res.json({ ...game.snapshot(db, req.user, planet.id), launched: result });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/fleet/:id/recall", auth, (req, res) => {
    try {
      game.tickWorld(db);
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const result = game.recallFleet(db, empire, Number(req.params.id));
      res.json({ ...game.snapshot(db, req.user, empire.last_planet_id), recalled: result });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/travel", auth, (req, res) => {
    try {
      const { empire, planet } = loadCtx(req);
      const target = db.prepare("SELECT * FROM planets WHERE id = ?").get(Number(req.body?.targetId));
      if (!target) throw new Error("Zielplanet unbekannt.");
      res.json(game.previewTravel(db, empire, planet, target, req.body?.ships || {}));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/reports", auth, (req, res) => {
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    const rows = db
      .prepare("SELECT * FROM reports WHERE empire_id = ? ORDER BY id DESC LIMIT 50")
      .all(empire.id)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: JSON.parse(r.body),
        createdAt: r.created_at,
        seen: !!r.seen,
      }));
    res.json({ reports: rows });
  });

  app.post("/api/reports/read", auth, (req, res) => {
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Number.isInteger) : [];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`UPDATE reports SET seen = 1 WHERE empire_id = ? AND id IN (${placeholders})`).run(empire.id, ...ids);
    } else {
      db.prepare("UPDATE reports SET seen = 1 WHERE empire_id = ?").run(empire.id);
    }
    res.json({ ok: true });
  });

  app.get("/api/preview", auth, (req, res) => {
    const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
    let planet;
    try {
      planet = loadPlanet(empire, Number(req.query.planetId || empire.last_planet_id));
    } catch {
      return fail(res, 404, "Planet nicht gefunden.");
    }
    const buildings = game.buildingsMap(db, planet.id);
    const techs = game.techsMap(db, empire.id);
    const bSpeed = 0.1 * (buildings.command || 0);
    const sSpeed = 0.14 * (buildings.shipyard || 0);
    const rSpeed = 0.12 * (buildings.archive || 0);
    res.json({
      buildings: Object.values(BUILDINGS).map((b) => {
        const level = buildings[b.id] || 0;
        return {
          id: b.id,
          level,
          unlocked: meetsReq(b.requires, buildings, techs),
          max: level >= b.max,
          nextCost: level >= b.max ? null : scaledCost(b.baseCost, b.factor, level),
          nextTime: level >= b.max ? null : scaledTime(b.baseTime, b.factor, level, bSpeed),
        };
      }),
      ships: Object.values(SHIPS).map((s) => ({
        id: s.id,
        unlocked: meetsReq(s.requires, buildings, techs) && (!s.premium || !!empire[s.premium]),
        cost: s.id === "colony" ? colonyShipCost(db.prepare("SELECT COUNT(*) AS n FROM planets WHERE empire_id = ? AND IFNULL(alliance_id,0)=0").get(empire.id).n) : s.cost,
        time: Math.max(8, Math.floor(s.time / (1 + sSpeed))),
      })),
      defenses: Object.values(DEFENSES).map((d) => ({
        id: d.id,
        unlocked: meetsReq(d.requires, buildings, techs),
        cost: d.cost,
        time: Math.max(8, Math.floor(d.time / (1 + sSpeed * 0.5))),
        have: game.defensesMap(db, planet.id)[d.id] || 0,
      })),
      techs: Object.values(TECHS).map((t) => {
        const level = techs[t.id] || 0;
        return {
          id: t.id,
          level,
          unlocked: meetsReq(t.requires, buildings, techs),
          max: level >= t.max,
          nextCost: level >= t.max ? null : scaledCost(t.baseCost, t.factor, level),
          nextTime: level >= t.max ? null : scaledTime(t.baseTime, t.factor, level, rSpeed),
        };
      }),
    });
  });

  app.get("/api/chat", auth, async (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const data = await chat.listChat(db, empire, String(req.query.channel || "global"));
      res.json(data);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/chat", auth, async (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      chat.postChat(db, empire, String(req.body?.channel || "global"), req.body?.body);
      const fresh = db.prepare("SELECT * FROM empires WHERE id = ?").get(empire.id);
      const data = await chat.listChat(db, fresh, String(req.body?.channel || "global"));
      res.json(data);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/mail", auth, (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      res.json({ threads: chat.listThreads(db, empire), unread: chat.unreadMail(db, empire.id), langs: chat.LANGS });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/mail/:peerId", auth, async (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const data = await chat.listThread(db, empire, Number(req.params.peerId));
      res.json(data);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/mail", auth, async (req, res) => {
    try {
      const empire = db.prepare("SELECT * FROM empires WHERE user_id = ?").get(req.user.id);
      const toId = chat.sendMail(db, empire, req.body || {});
      const fresh = db.prepare("SELECT * FROM empires WHERE id = ?").get(empire.id);
      const data = await chat.listThread(db, fresh, toId);
      res.json({ ...data, threads: chat.listThreads(db, fresh) });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/mod/overview", auth, staff, (req, res) => {
    try {
      res.json(moderation.overview(db));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/mod/search", auth, staff, (req, res) => {
    try {
      res.json({ players: moderation.searchPlayers(db, String(req.query.q || "")) });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/mod/sanction", auth, staff, (req, res) => {
    try {
      const out = moderation.applySanction(
        db,
        req.user,
        { userId: Number(req.body?.userId) || 0, empireId: Number(req.body?.empireId) || 0 },
        String(req.body?.kind || "ban"),
        String(req.body?.duration || "1d"),
        req.body?.reason
      );
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/mod/lift", auth, staff, (req, res) => {
    try {
      const out = moderation.liftSanction(
        db,
        req.user,
        { userId: Number(req.body?.userId) || 0, empireId: Number(req.body?.empireId) || 0 },
        String(req.body?.kind || "ban")
      );
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/mod/moderator", auth, staff, (req, res) => {
    try {
      const out = moderation.setModerator(db, req.user, Number(req.body?.userId), !!req.body?.on);
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/mod/chat/delete", auth, staff, (req, res) => {
    try {
      res.json(moderation.deleteChat(db, req.user, req.body?.id));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.get("/api/admin/overview", auth, adminOnly, (req, res) => {
    try {
      res.json(admin.overview(db, req.user));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/admin/settings", auth, adminOnly, (req, res) => {
    try {
      const out = admin.saveSettings(db, req.user, req.body || {});
      res.json({ ...out, ...moderation.overview(db) });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/admin/player", auth, adminOnly, (req, res) => {
    try {
      const out = admin.playerAction(db, req.user, req.body || {});
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  app.post("/api/admin/world", auth, adminOnly, (req, res) => {
    try {
      const out = admin.worldAction(db, req.user, req.body || {});
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  });
}

module.exports = { attachRoutes };
