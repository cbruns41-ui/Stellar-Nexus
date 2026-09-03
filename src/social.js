"use strict";

const fs = require("fs");
const path = require("path");
const { hashPassword, verifyPassword } = require("./auth");
const progress = require("./progress");

const AVATAR_PRESETS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
const BANNER_PRESETS = ["b1", "b2", "b3", "b4"];
const RANKS = {
  leader: { id: "leader", name: "Anführer", order: 0 },
  coleader: { id: "coleader", name: "Co-Leader", order: 1 },
  diplomat: { id: "diplomat", name: "Diplomat", order: 2 },
  officer: { id: "officer", name: "Offizier", order: 3 },
  member: { id: "member", name: "Mitglied", order: 4 },
};
const UPLOAD_ROOT = process.env.VERCEL
  ? path.join("/tmp", "stellar-nexus-uploads")
  : path.join(__dirname, "..", "public", "assets");
const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");
const BANNER_DIR = path.join(UPLOAD_ROOT, "alliances");
const ALLIANCE_RESOURCE_IDS = ["metal", "helium", "titan", "energy", "crystal"];
const ALLIANCE_MEMBERS_BASE = 15;
const ALLIANCE_MEMBERS_STEP = 5;
const ALLIANCE_MEMBERS_HARD_MAX = 30;

function memberLimits(db) {
  const s = db ? require("./settings").get(db) : {};
  const base = Math.max(5, Math.min(ALLIANCE_MEMBERS_HARD_MAX, Number(s.allianceMembersBase) || ALLIANCE_MEMBERS_BASE));
  const max = Math.max(base, Math.min(ALLIANCE_MEMBERS_HARD_MAX, Number(s.allianceMembersMax) || ALLIANCE_MEMBERS_HARD_MAX));
  return { base, max, step: ALLIANCE_MEMBERS_STEP };
}

function clampMemberCap(n, db) {
  const { base, max } = memberLimits(db);
  const v = Number(n);
  if (!Number.isFinite(v)) return base;
  return Math.max(base, Math.min(max, Math.floor(v)));
}
const ALLIANCE_RESEARCH = {
  supply_grid: {
    id: "supply_grid", name: "Versorgungsnetz", max: 5, factor: 2.15,
    blurb: "+1% Ressourcenproduktion pro Stufe für alle Mitglieder.", effect: "prod", perLevel: 0.01,
    art: "/assets/buildings/matter_mine.jpg",
    cost: { metal: 100000, helium: 70000, titan: 35000, energy: 50000, crystal: 25000 },
    baseTime: 240,
  },
  warp_network: {
    id: "warp_network", name: "Warpnetz", max: 5, factor: 2.2,
    blurb: "+2% Flottentempo pro Stufe für alle Mitglieder.", effect: "travel", perLevel: 0.02,
    art: "/assets/techs/warp.jpg",
    cost: { metal: 120000, helium: 110000, titan: 45000, energy: 65000, crystal: 40000 },
    baseTime: 260,
  },
  shield_protocol: {
    id: "shield_protocol", name: "Schutzprotokolle", max: 5, factor: 2.3,
    blurb: "+1% Flottenhülle pro Stufe für alle Mitglieder.", effect: "hull", perLevel: 0.01,
    art: "/assets/techs/shields.jpg",
    cost: { metal: 150000, helium: 80000, titan: 75000, energy: 55000, crystal: 45000 },
    baseTime: 280,
  },
  foundry_pact: {
    id: "foundry_pact", name: "Gießerei-Pakt", max: 5, factor: 2.2,
    blurb: "+2% Bau- und Werfttempo pro Stufe für alle Mitglieder.", effect: "build", perLevel: 0.02,
    art: "/assets/techs/nanotech.jpg",
    cost: { metal: 130000, helium: 60000, titan: 55000, energy: 70000, crystal: 35000 },
    baseTime: 250,
  },
  science_pact: {
    id: "science_pact", name: "Wissenschaftspakt", max: 5, factor: 2.25,
    blurb: "+2% Forschungstempo pro Stufe für alle Mitglieder.", effect: "research", perLevel: 0.02,
    art: "/assets/techs/data_arch.jpg",
    cost: { metal: 90000, helium: 80000, titan: 40000, energy: 80000, crystal: 70000 },
    baseTime: 270,
  },
};

function researchCost(def, level) {
  const mul = def.factor ** Math.max(0, level || 0);
  return Object.fromEntries(ALLIANCE_RESOURCE_IDS.map((id) => [id, Math.floor((def.cost[id] || 0) * mul)]));
}

function researchRows(db, allianceId, empireId) {
  const rows = Object.fromEntries(db.prepare("SELECT * FROM alliance_research WHERE alliance_id = ?").all(allianceId).map((r) => [r.research_id, r]));
  return Object.values(ALLIANCE_RESEARCH).map((def) => {
    const row = rows[def.id] || { level: 0 };
    const level = Math.min(def.max, row.level || 0);
    const cost = level >= def.max ? {} : researchCost(def, level);
    const funded = Object.fromEntries(ALLIANCE_RESOURCE_IDS.map((id) => [id, Number(row[id] || 0)]));
    const total = ALLIANCE_RESOURCE_IDS.reduce((sum, id) => sum + (cost[id] || 0), 0);
    const paid = ALLIANCE_RESOURCE_IDS.reduce((sum, id) => sum + Math.min(cost[id] || 0, funded[id] || 0), 0);
    const mine = empireId
      ? db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM alliance_research_contributions WHERE alliance_id = ? AND research_id = ? AND level = ? AND empire_id = ?").get(allianceId, def.id, level, empireId).n
      : 0;
    const remaining = Object.fromEntries(ALLIANCE_RESOURCE_IDS.map((id) => [id, Math.max(0, (cost[id] || 0) - (funded[id] || 0))]));
    return {
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      art: def.art,
      max: def.max,
      level,
      effect: def.effect,
      perLevel: def.perLevel,
      cost,
      funded,
      remaining,
      progress: total ? paid / total : 1,
      mine: Math.floor(mine || 0),
      baseTime: def.baseTime || 240,
    };
  });
}

function emptyAllianceBonuses() {
  return { prod: 0, travel: 0, hull: 0, build: 0, research: 0 };
}

function allianceBonuses(db, empireId) {
  const mine = myAlliance(db, empireId);
  if (!mine) return emptyAllianceBonuses();
  const levels = Object.fromEntries(db.prepare("SELECT research_id, level FROM alliance_research WHERE alliance_id = ?").all(mine.id).map((r) => [r.research_id, r.level]));
  const out = emptyAllianceBonuses();
  for (const def of Object.values(ALLIANCE_RESEARCH)) out[def.effect] += Math.min(def.max, levels[def.id] || 0) * def.perLevel;
  return out;
}

function donateAllianceResearch(db, empire, planet, researchId, donation) {
  throw new Error("Direktspenden wurden ersetzt: Ressourcen zuerst per Transport in das Allianzlager schicken.");
}

function canDo(rank, action) {
  const r = rank || "member";
  if (action === "edit") return r === "leader" || r === "coleader" || r === "diplomat";
  if (action === "apps") return r === "leader" || r === "coleader" || r === "diplomat";
  if (action === "kick") return r === "leader" || r === "coleader";
  if (action === "rank") return r === "leader" || r === "coleader";
  if (action === "disband") return r === "leader";
  if (action === "transfer") return r === "leader";
  if (action === "planet") return r === "leader" || r === "coleader" || r === "officer";
  if (action === "planetAccess") return r === "leader" || r === "coleader";
  return false;
}

function alliancePlanetRow(db, allianceId) {
  if (!allianceId) return null;
  return db.prepare("SELECT * FROM planets WHERE alliance_id = ?").get(allianceId) || null;
}

function planetAccessIds(db, allianceId) {
  return db.prepare("SELECT empire_id FROM alliance_planet_access WHERE alliance_id = ?").all(allianceId).map((r) => r.empire_id);
}

function canManageAlliancePlanet(db, empireId, planet) {
  if (!planet?.alliance_id) return false;
  const mine = myAlliance(db, empireId);
  if (!mine || mine.id !== planet.alliance_id) return false;
  if (canDo(mine.myRank, "planet")) return true;
  const granted = db
    .prepare("SELECT empire_id FROM alliance_planet_access WHERE alliance_id = ? AND empire_id = ?")
    .get(planet.alliance_id, empireId);
  return !!granted;
}

function canAccessPlanet(db, empireId, planet) {
  if (!planet) return false;
  if (planet.alliance_id) return canManageAlliancePlanet(db, empireId, planet);
  return planet.empire_id === empireId;
}

function canUseAlliancePlanet(db, empireId, planet) {
  if (!planet?.alliance_id) return false;
  return myAlliance(db, empireId)?.id === planet.alliance_id;
}

function accessibleAlliancePlanets(db, empireId) {
  const mine = myAlliance(db, empireId);
  if (!mine) return [];
  const planet = alliancePlanetRow(db, mine.id);
  if (!planet) return [];
  if (!canManageAlliancePlanet(db, empireId, planet)) return [];
  return [planet];
}

function planetPublic(db, planet) {
  if (!planet) return null;
  const sys = db.prepare("SELECT name FROM systems WHERE id = ?").get(planet.system_id);
  const a = planet.alliance_id ? db.prepare("SELECT id, tag, name, color FROM alliances WHERE id = ?").get(planet.alliance_id) : null;
  return {
    id: planet.id,
    name: planet.name,
    type: planet.type,
    systemId: planet.system_id,
    systemName: sys?.name || "",
    allianceId: a?.id || 0,
    allianceTag: a?.tag || "",
    allianceName: a?.name || "",
    allianceColor: a?.color || "",
  };
}

function rehomeAlliancePlanet(db, allianceId, newEmpireId) {
  const planet = alliancePlanetRow(db, allianceId);
  if (!planet || !newEmpireId) return;
  db.prepare("UPDATE planets SET empire_id = ? WHERE id = ?").run(newEmpireId, planet.id);
}

function wipeAllianceExtras(db, allianceId) {
  const planet = alliancePlanetRow(db, allianceId);
  if (planet) db.prepare("UPDATE planets SET alliance_id = NULL WHERE id = ?").run(planet.id);
  db.prepare("DELETE FROM alliance_planet_access WHERE alliance_id = ?").run(allianceId);
  db.prepare("DELETE FROM alliance_research_contributions WHERE alliance_id = ?").run(allianceId);
  db.prepare("DELETE FROM alliance_research WHERE alliance_id = ?").run(allianceId);
}

function setPlanetAccess(db, actor, empireId, grant) {
  const mine = myAlliance(db, actor.id);
  if (!mine || !canDo(mine.myRank, "planetAccess")) throw new Error("Keine Berechtigung für Allianz-Planet-Zugang.");
  const planet = alliancePlanetRow(db, mine.id);
  if (!planet) throw new Error("Kein Allianz-Planet.");
  if (empireId === actor.id) throw new Error("Eigenen Zugang nicht ändern.");
  const target = db.prepare("SELECT rank FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").get(mine.id, empireId);
  if (!target) throw new Error("Kein Mitglied.");
  if (target.rank === "leader" || target.rank === "coleader") throw new Error("Führung hat immer Zugang.");
  if (grant) {
    db.prepare("INSERT OR IGNORE INTO alliance_planet_access(alliance_id, empire_id) VALUES(?, ?)").run(mine.id, empireId);
  } else {
    db.prepare("DELETE FROM alliance_planet_access WHERE alliance_id = ? AND empire_id = ?").run(mine.id, empireId);
  }
  return { ok: true, grant: !!grant };
}

function bannerUrl(alliance) {
  if (!alliance) return "/assets/alliances/b1.jpg";
  if (alliance.banner === "custom") return `/assets/alliances/a${alliance.id}.jpg`;
  const id = BANNER_PRESETS.includes(alliance.banner) ? alliance.banner : "b1";
  return `/assets/alliances/${id}.jpg`;
}

function avatarUrl(empire) {
  if (!empire) return "/assets/avatars/a1.jpg";
  if (empire.avatar === "custom") return `/assets/avatars/e${empire.id}.jpg`;
  const id = AVATAR_PRESETS.includes(empire.avatar) ? empire.avatar : "a1";
  return `/assets/avatars/${id}.jpg`;
}

function myAlliance(db, empireId) {
  const row = db
    .prepare(
      `SELECT a.*, m.rank AS myRank
       FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
       WHERE m.empire_id = ?`
    )
    .get(empireId);
  return row || null;
}

function memberCount(db, allianceId) {
  return db.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ?").get(allianceId).n;
}

function effectiveMaxMembers(db, alliance) {
  return clampMemberCap(alliance?.max_members, db);
}

function allianceScore(db, allianceId) {
  const ids = db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id = ?").all(allianceId);
  let s = 0;
  for (const r of ids) s += progress.empireScore(db, r.empire_id);
  return s;
}

function listAlliances(db) {
  const rows = db.prepare("SELECT * FROM alliances ORDER BY id").all();
  return rows
    .map((a) => ({
      id: a.id,
      tag: a.tag,
      name: a.name,
      blurb: a.blurb,
      color: a.color,
      leaderId: a.leader_id,
      members: memberCount(db, a.id),
      score: allianceScore(db, a.id),
      banner: bannerUrl(a),
      lore: a.lore || "",
      createdAt: a.created_at,
      website: a.website || "",
      recruit: a.recruit || "",
      openJoin: !!a.open_join,
      minLevel: a.min_level || 1,
      maxMembers: effectiveMaxMembers(db, a),
      memberCapMax: memberLimits(db).max,
    }))
    .sort((x, y) => y.score - x.score);
}

function getAlliance(db, id, viewerEmpireId) {
  const a = db.prepare("SELECT * FROM alliances WHERE id = ?").get(id);
  if (!a) throw new Error("Allianz unbekannt.");
  const medalMap = progress.allEarnedMap(db);
  const members = db
    .prepare(
      `SELECT m.empire_id, m.rank, m.joined_at, e.name, e.color, e.avatar, e.xp, u.username
       FROM alliance_members m
       JOIN empires e ON e.id = m.empire_id
       JOIN users u ON u.id = e.user_id
       WHERE m.alliance_id = ?
       ORDER BY CASE m.rank WHEN 'leader' THEN 0 WHEN 'coleader' THEN 1 WHEN 'diplomat' THEN 2 WHEN 'officer' THEN 3 ELSE 4 END, m.joined_at`
    )
    .all(id)
    .map((m) => ({
      empireId: m.empire_id,
      rank: m.rank,
      rankName: RANKS[m.rank]?.name || m.rank,
      joinedAt: m.joined_at,
      name: m.name,
      color: m.color,
      username: m.username,
      avatar: avatarUrl({ id: m.empire_id, avatar: m.avatar }),
      level: progress.commanderLevel(m.xp || 0),
      score: progress.empireScore(db, m.empire_id),
      medals: progress.compactFromIds(medalMap[m.empire_id] || []).slice(0, 3),
    }));
  const mine = myAlliance(db, viewerEmpireId);
  const apps =
    mine && mine.id === a.id && canDo(mine.myRank, "apps")
      ? db
          .prepare(
            `SELECT ap.empire_id, ap.message, ap.created_at, e.name, e.color, e.avatar, u.username
             FROM alliance_apps ap
             JOIN empires e ON e.id = ap.empire_id
             JOIN users u ON u.id = e.user_id
             WHERE ap.alliance_id = ?`
          )
          .all(id)
          .map((x) => ({
            empireId: x.empire_id,
            name: x.name,
            color: x.color,
            username: x.username,
            avatar: avatarUrl({ id: x.empire_id, avatar: x.avatar }),
            message: x.message,
            createdAt: x.created_at,
          }))
      : [];
  return {
    id: a.id,
    tag: a.tag,
    name: a.name,
    blurb: a.blurb,
    color: a.color,
    leaderId: a.leader_id,
    members,
    apps,
    score: allianceScore(db, a.id),
    createdAt: a.created_at,
    lore: a.lore || "",
    website: a.website || "",
    recruit: a.recruit || "",
    motd: a.motd || "",
    bulletin: mine && mine.id === a.id ? a.bulletin || "" : "",
    openJoin: !!a.open_join,
    minLevel: a.min_level || 1,
    maxMembers: effectiveMaxMembers(db, a),
    memberCapMax: memberLimits(db).max,
    canExpand: effectiveMaxMembers(db, a) < memberLimits(db).max,
    banner: bannerUrl(a),
    bannerKey: a.banner || "b1",
    banners: BANNER_PRESETS,
    ranks: RANKS,
    research: researchRows(db, a.id, mine && mine.id === a.id ? viewerEmpireId : null),
    mine: mine && mine.id === a.id ? mine.myRank : null,
    boostUsed: false,
    planet: mine && mine.id === a.id ? planetPublic(db, alliancePlanetRow(db, a.id)) : null,
    planetAccess: mine && mine.id === a.id ? planetAccessIds(db, a.id) : [],
    canManagePlanet: mine && mine.id === a.id ? canManageAlliancePlanet(db, viewerEmpireId, alliancePlanetRow(db, a.id)) : false,
    canColonizePlanet: !!(mine && mine.id === a.id && canDo(mine.myRank, "planet") && !alliancePlanetRow(db, a.id)),
    perms: mine && mine.id === a.id
      ? {
          edit: canDo(mine.myRank, "edit"),
          apps: canDo(mine.myRank, "apps"),
          kick: canDo(mine.myRank, "kick"),
          rank: canDo(mine.myRank, "rank"),
          disband: canDo(mine.myRank, "disband"),
          transfer: canDo(mine.myRank, "transfer"),
          planet: canDo(mine.myRank, "planet"),
          planetAccess: canDo(mine.myRank, "planetAccess"),
        }
      : null,
  };
}

function createAlliance(db, empire, tag, name, blurb, color) {
  tag = String(tag || "").trim().toUpperCase();
  name = String(name || "").trim();
  blurb = String(blurb || "").trim().slice(0, 140);
  color = String(color || empire.color || "#3ee8c4");
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) throw new Error("Tag: 2–5 Zeichen, A–Z und 0–9.");
  if (name.length < 3 || name.length > 24) throw new Error("Allianzname: 3–24 Zeichen.");
  if (myAlliance(db, empire.id)) throw new Error("Du bist bereits in einer Allianz.");
  const taken = db.prepare("SELECT id FROM alliances WHERE tag = ?").get(tag);
  if (taken) throw new Error("Dieser Tag ist vergeben.");
  const info = db
    .prepare("INSERT INTO alliances(tag, name, blurb, color, leader_id, created_at, max_members) VALUES(?,?,?,?,?,?,?)")
    .run(tag, name, blurb, color, empire.id, Date.now(), memberLimits(db).base);
  const id = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO alliance_members(alliance_id, empire_id, rank, joined_at) VALUES(?,?,?,?)").run(
    id,
    empire.id,
    "leader",
    Date.now()
  );
  return getAlliance(db, id, empire.id);
}

function applyAlliance(db, empire, allianceId, message) {
  if (myAlliance(db, empire.id)) throw new Error("Du bist bereits in einer Allianz.");
  const a = db.prepare("SELECT * FROM alliances WHERE id = ?").get(allianceId);
  if (!a) throw new Error("Allianz unbekannt.");
  const lvl = progress.commanderLevel(empire.xp || 0);
  const minLv = a.min_level || 1;
  if (lvl < minLv) throw new Error(`Mindestlevel ${minLv} erforderlich (du bist ${lvl}).`);
  const n = memberCount(db, a.id);
  const cap = effectiveMaxMembers(db, a);
  if (n >= cap) throw new Error("Allianz ist voll.");
  if (a.open_join) {
    db.prepare("DELETE FROM alliance_apps WHERE alliance_id = ? AND empire_id = ?").run(a.id, empire.id);
    db.prepare("INSERT INTO alliance_members(alliance_id, empire_id, rank, joined_at) VALUES(?,?,?,?)").run(
      a.id,
      empire.id,
      "member",
      Date.now()
    );
    return { joined: true };
  }
  const pending = db.prepare("SELECT empire_id FROM alliance_apps WHERE alliance_id = ? AND empire_id = ?").get(allianceId, empire.id);
  if (pending) throw new Error("Bewerbung läuft bereits.");
  db.prepare("INSERT INTO alliance_apps(alliance_id, empire_id, message, created_at) VALUES(?,?,?,?)").run(
    allianceId,
    empire.id,
    String(message || "").slice(0, 120),
    Date.now()
  );
  return { joined: false };
}

function decideApp(db, leader, allianceId, empireId, accept) {
  const mine = myAlliance(db, leader.id);
  if (!mine || mine.id !== allianceId || !canDo(mine.myRank, "apps")) throw new Error("Keine Berechtigung für Bewerbungen.");
  const app = db.prepare("SELECT * FROM alliance_apps WHERE alliance_id = ? AND empire_id = ?").get(allianceId, empireId);
  if (!app) throw new Error("Keine Bewerbung.");
  db.prepare("DELETE FROM alliance_apps WHERE alliance_id = ? AND empire_id = ?").run(allianceId, empireId);
  if (!accept) return;
  if (myAlliance(db, empireId)) throw new Error("Spieler ist bereits in einer Allianz.");
  const cap = effectiveMaxMembers(db, mine);
  if (memberCount(db, allianceId) >= cap) throw new Error("Allianz ist voll.");
  db.prepare("INSERT INTO alliance_members(alliance_id, empire_id, rank, joined_at) VALUES(?,?,?,?)").run(
    allianceId,
    empireId,
    "member",
    Date.now()
  );
}

function leaveAlliance(db, empire) {
  const mine = myAlliance(db, empire.id);
  if (!mine) throw new Error("Keine Allianz.");
  if (mine.myRank === "leader") {
    const n = memberCount(db, mine.id);
    if (n > 1) throw new Error("Anführer muss die Allianz auflösen oder Mitglieder kicken.");
    wipeAllianceExtras(db, mine.id);
    db.prepare("DELETE FROM alliance_apps WHERE alliance_id = ?").run(mine.id);
    db.prepare("DELETE FROM alliance_members WHERE alliance_id = ?").run(mine.id);
    db.prepare("DELETE FROM alliances WHERE id = ?").run(mine.id);
    return;
  }
  const planet = alliancePlanetRow(db, mine.id);
  if (planet && planet.empire_id === empire.id) rehomeAlliancePlanet(db, mine.id, mine.leader_id);
  db.prepare("DELETE FROM alliance_planet_access WHERE alliance_id = ? AND empire_id = ?").run(mine.id, empire.id);
  db.prepare("DELETE FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").run(mine.id, empire.id);
}

function disbandAlliance(db, empire) {
  const mine = myAlliance(db, empire.id);
  if (!mine || mine.myRank !== "leader") throw new Error("Nur der Anführer kann auflösen.");
  wipeAllianceExtras(db, mine.id);
  db.prepare("DELETE FROM alliance_apps WHERE alliance_id = ?").run(mine.id);
  db.prepare("DELETE FROM alliance_members WHERE alliance_id = ?").run(mine.id);
  db.prepare("DELETE FROM alliances WHERE id = ?").run(mine.id);
}

function kickMember(db, leader, empireId) {
  const mine = myAlliance(db, leader.id);
  if (!mine || !canDo(mine.myRank, "kick")) throw new Error("Keine Kick-Berechtigung.");
  if (empireId === leader.id) throw new Error("Du kannst dich nicht selbst kicken.");
  const target = db.prepare("SELECT rank FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").get(mine.id, empireId);
  if (!target) throw new Error("Kein Mitglied.");
  if (target.rank === "leader") throw new Error("Der Anführer bleibt.");
  if (mine.myRank === "coleader" && (target.rank === "coleader" || target.rank === "leader")) {
    throw new Error("Co-Leader kicken keine Co-Leader.");
  }
  const planet = alliancePlanetRow(db, mine.id);
  if (planet && planet.empire_id === empireId) rehomeAlliancePlanet(db, mine.id, mine.leader_id);
  db.prepare("DELETE FROM alliance_planet_access WHERE alliance_id = ? AND empire_id = ?").run(mine.id, empireId);
  db.prepare("DELETE FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").run(mine.id, empireId);
}

function setRank(db, actor, empireId, rank) {
  const mine = myAlliance(db, actor.id);
  if (!mine || !canDo(mine.myRank, "rank")) throw new Error("Keine Rang-Berechtigung.");
  if (!RANKS[rank] || rank === "leader") throw new Error("Ungültiger Rang.");
  if (empireId === actor.id) throw new Error("Eigenen Rang nicht ändern.");
  const target = db.prepare("SELECT rank FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").get(mine.id, empireId);
  if (!target) throw new Error("Kein Mitglied.");
  if (target.rank === "leader") throw new Error("Anführer-Rang ist fest.");
  if (rank === "coleader" && mine.myRank !== "leader") throw new Error("Nur der Anführer ernennt Co-Leader.");
  if (mine.myRank === "coleader" && target.rank === "coleader") throw new Error("Co-Leader ändern keine Co-Leader.");
  db.prepare("UPDATE alliance_members SET rank = ? WHERE alliance_id = ? AND empire_id = ?").run(rank, mine.id, empireId);
}

function updateAlliance(db, leader, body) {
  const mine = myAlliance(db, leader.id);
  if (!mine || !canDo(mine.myRank, "edit")) throw new Error("Keine Bearbeitungsrechte.");
  const blurb = String(body?.blurb ?? mine.blurb ?? "").slice(0, 140);
  const lore = String(body?.lore ?? mine.lore ?? "").slice(0, 800);
  const color = String(body?.color || mine.color);
  const website = String(body?.website ?? mine.website ?? "").trim().slice(0, 80);
  const recruit = String(body?.recruit ?? mine.recruit ?? "").slice(0, 280);
  const bulletin = String(body?.bulletin ?? mine.bulletin ?? "").slice(0, 800);
  const motd = String(body?.motd ?? mine.motd ?? "").slice(0, 180);
  const openJoin = body?.openJoin === true || body?.openJoin === 1 || body?.openJoin === "1" ? 1 : 0;
  const minLevel = Math.max(1, Math.min(60, Number(body?.minLevel ?? mine.min_level) || 1));
  let banner = mine.banner || "b1";
  if (body?.banner && BANNER_PRESETS.includes(body.banner)) banner = body.banner;
  db.prepare(
    `UPDATE alliances SET blurb = ?, lore = ?, color = ?, banner = ?, website = ?, recruit = ?, bulletin = ?, motd = ?, open_join = ?, min_level = ?
     WHERE id = ?`
  ).run(blurb, lore, color, banner, website, recruit, bulletin, motd, openJoin, minLevel, mine.id);
}

function transferLeadership(db, leader, empireId) {
  const mine = myAlliance(db, leader.id);
  if (!mine || !canDo(mine.myRank, "transfer")) throw new Error("Nur der Anführer kann übergeben.");
  if (empireId === leader.id) throw new Error("Du bist bereits Anführer.");
  const target = db.prepare("SELECT rank FROM alliance_members WHERE alliance_id = ? AND empire_id = ?").get(mine.id, empireId);
  if (!target) throw new Error("Kein Mitglied.");
  db.prepare("UPDATE alliance_members SET rank = ? WHERE alliance_id = ? AND empire_id = ?").run("leader", mine.id, empireId);
  db.prepare("UPDATE alliance_members SET rank = ? WHERE alliance_id = ? AND empire_id = ?").run("coleader", mine.id, leader.id);
  db.prepare("UPDATE alliances SET leader_id = ? WHERE id = ?").run(empireId, mine.id);
  rehomeAlliancePlanet(db, mine.id, empireId);
}

function saveBannerUpload(db, leader, dataUrl) {
  const mine = myAlliance(db, leader.id);
  if (!mine || !canDo(mine.myRank, "edit")) throw new Error("Keine Bearbeitungsrechte.");
  const m = String(dataUrl || "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new Error("Nur JPEG, PNG oder WebP.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 450000) throw new Error("Bild zu groß (max. 450 KB).");
  fs.mkdirSync(BANNER_DIR, { recursive: true });
  fs.writeFileSync(path.join(BANNER_DIR, `a${mine.id}.jpg`), buf);
  db.prepare("UPDATE alliances SET banner = ? WHERE id = ?").run("custom", mine.id);
}

function updateSettings(db, user, empire, body) {
  const name = String(body?.empireName || empire.name).trim();
  if (name.length < 3 || name.length > 24) throw new Error("Imperiumsname: 3–24 Zeichen.");
  const color = String(body?.color || empire.color);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Farbe ungültig.");
  const sound = body?.sound === false || body?.sound === 0 ? 0 : 1;
  const notify = body?.notify ? 1 : 0;
  const chat = require("./chat");
  const locale = chat.LANGS[String(body?.locale || empire.locale || "de")]
    ? String(body.locale || empire.locale || "de")
    : "de";
  const translate = body?.translate === false || body?.translate === 0 ? 0 : 1;
  db.prepare(
    "UPDATE empires SET name = ?, color = ?, sound = ?, notify = ?, locale = ?, translate = ? WHERE id = ?"
  ).run(name, color, sound, notify, locale, translate, empire.id);
  if (body?.password) {
    const old = String(body.oldPassword || "");
    const next = String(body.password);
    if (next.length < 6 || next.length > 72) throw new Error("Neues Passwort: 6–72 Zeichen.");
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
    if (!verifyPassword(old, row.password_hash)) throw new Error("Aktuelles Passwort falsch.");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
  }
  if (body?.avatar && AVATAR_PRESETS.includes(body.avatar)) {
    db.prepare("UPDATE empires SET avatar = ? WHERE id = ?").run(body.avatar, empire.id);
  }
}

function saveAvatarUpload(db, empire, dataUrl) {
  const m = String(dataUrl || "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new Error("Nur JPEG, PNG oder WebP.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 450000) throw new Error("Bild zu groß (max. 450 KB).");
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  fs.writeFileSync(path.join(AVATAR_DIR, `e${empire.id}.jpg`), buf);
  db.prepare("UPDATE empires SET avatar = ? WHERE id = ?").run("custom", empire.id);
}

function removeAvatarUpload(empireId) {
  try {
    fs.unlinkSync(path.join(AVATAR_DIR, `e${empireId}.jpg`));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

function listRanksFull(db) {
  const medalMap = progress.allEarnedMap(db);
  const empires = db
    .prepare(
      `SELECT e.id, e.name, e.color, e.xp, e.avatar, e.created_at, e.species, e.vip_until, e.signet, u.username
       FROM empires e JOIN users u ON u.id = e.user_id`
    )
    .all();
  return empires
    .map((e) => {
      const al = myAlliance(db, e.id);
      const medals = progress.compactFromIds(medalMap[e.id] || []).slice(0, 4);
      return {
        id: e.id,
        name: e.name,
        color: e.color,
        username: e.username,
        avatar: avatarUrl(e),
        species: e.species || "terran",
        xp: e.xp || 0,
        level: progress.commanderLevel(e.xp || 0),
        planets: db.prepare("SELECT COUNT(*) AS n FROM planets WHERE empire_id = ?").get(e.id).n,
        score: progress.empireScore(db, e.id),
        combatScore: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND kind = 'combat' AND json_extract(body, '$.youWin') = 1").get(e.id).n,
        researchScore: db.prepare("SELECT COALESCE(SUM(level), 0) AS n FROM research WHERE empire_id = ?").get(e.id).n,
        economyScore: db.prepare("SELECT COALESCE(SUM(metal + helium + titan + energy + crystal + diamond), 0) AS n FROM planets WHERE empire_id = ?").get(e.id).n,
        alliance: al ? { id: al.id, tag: al.tag, name: al.name, color: al.color } : null,
        medals,
        title: medals[0]?.title || "Neuer Kommandant",
        newbie: Date.now() < (e.created_at || 0) + (require("./settings").get(db).newbieDays || 5) * 24 * 60 * 60 * 1000,
        vip: (Number(e.vip_until) || 0) > Date.now(),
        signet: !!e.signet,
      };
    })
    .sort((a, b) => b.score - a.score || b.xp - a.xp);
}

function listAllianceActivity(db, allianceId) {
  const members = db.prepare("SELECT empire_id FROM alliance_members WHERE alliance_id = ?").all(allianceId).map((r) => r.empire_id);
  if (!members.length) return { attacks: [], defenses: [] };
  const placeholders = members.map(() => "?").join(",");
  const attacks = db
    .prepare(
      `SELECT f.*, tp.name AS targetName, tp.system_id AS targetSystem, e.name AS actorName
       FROM fleets f
       JOIN planets tp ON tp.id = f.target_planet_id
       JOIN empires e ON e.id = f.empire_id
       WHERE f.empire_id IN (${placeholders}) AND f.is_return = 0 AND f.mission = 'attack'
       ORDER BY f.arrives_at ASC`
    )
    .all(...members)
    .map((f) => ({
      id: f.id,
      type: "attack",
      actor: f.actorName,
      attacker: f.actorName,
      target: f.targetName,
      targetId: f.target_planet_id,
      systemId: f.targetSystem,
      arrivesAt: f.arrives_at,
      ships: JSON.parse(f.ships || "{}"),
    }));
  const defenses = db
    .prepare(
      `SELECT f.*, tp.name AS targetName, tp.system_id AS targetSystem, e.name AS actorName
       FROM fleets f
       JOIN planets tp ON tp.id = f.target_planet_id
       JOIN empires e ON e.id = f.empire_id
       WHERE f.empire_id IN (${placeholders}) AND f.is_return = 0 AND f.mission = 'intercept'
       ORDER BY f.arrives_at ASC`
    )
    .all(...members)
    .map((f) => ({
      id: f.id,
      type: "defense",
      actor: f.actorName,
      defender: f.actorName,
      target: f.targetName,
      targetId: f.target_planet_id,
      systemId: f.targetSystem,
      arrivesAt: f.arrives_at,
      ships: JSON.parse(f.ships || "{}"),
    }));
  return { attacks, defenses };
}

module.exports = {
  AVATAR_PRESETS,
  BANNER_PRESETS,
  RANKS,
  avatarUrl,
  bannerUrl,
  myAlliance,
  listAlliances,
  getAlliance,
  createAlliance,
  applyAlliance,
  decideApp,
  leaveAlliance,
  disbandAlliance,
  kickMember,
  setRank,
  updateAlliance,
  transferLeadership,
  saveBannerUpload,
  updateSettings,
  saveAvatarUpload,
  listAllianceActivity,
  ALLIANCE_RESEARCH,
  researchRows,
  allianceBonuses,
  emptyAllianceBonuses,
  donateAllianceResearch,
  listRanksFull,
  removeAvatarUpload,
  memberLimits,
  clampMemberCap,
  effectiveMaxMembers,
  ALLIANCE_MEMBERS_BASE,
  ALLIANCE_MEMBERS_STEP,
  ALLIANCE_MEMBERS_HARD_MAX,
  alliancePlanetRow,
  canManageAlliancePlanet,
  canAccessPlanet,
  canUseAlliancePlanet,
  accessibleAlliancePlanets,
  setPlanetAccess,
  rehomeAlliancePlanet,
  canDo,
};
