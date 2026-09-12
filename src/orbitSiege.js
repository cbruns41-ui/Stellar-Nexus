"use strict";

const { bag, emptyBag, addBags, BUILDINGS, TECHS } = require("./catalog");
const progress = require("./progress");

const SESSION_MS = 15 * 60 * 1000;
const SHORT = { metal: "MET", helium: "HEL", titan: "TIT", energy: "EN", crystal: "KRI", diamond: "DIA" };

function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function lootForWave(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return bag({
    metal: 18 + w * 4,
    helium: 10 + w * 2,
    energy: 12 + w * 3,
    titan: 3 + Math.floor(w / 2),
    crystal: 2 + Math.floor(w / 3),
    diamond: w % 5 === 0 ? 1 : 0,
  });
}

function orbitSiegeReward(waves, kills, random = Math.random) {
  const w = Math.max(0, Math.min(30, Math.floor(Number(waves) || 0)));
  const k = Math.max(0, Math.min(400, Math.floor(Number(kills) || 0)));
  let loot = emptyBag();
  for (let i = 1; i <= w; i++) loot = addBags(loot, lootForWave(i));
  loot.metal += Math.floor(k * 1.4);
  loot.helium += Math.floor(k * 0.6);
  loot.energy += Math.floor(k * 0.8);
  if (w === 0 && k === 0) {
    const roll = (min, max) => Math.floor(min + Math.max(0, Math.min(0.999999, Number(random()) || 0)) * (max - min + 1));
    loot = bag({ metal: roll(12, 22), helium: roll(6, 12), energy: roll(8, 16) });
  }
  return { waves: w, kills: k, loot, ...loot };
}

function capStats(elapsedMs, waves, kills) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const maxWaves = Math.min(30, Math.floor(elapsed / 5000));
  const w = Math.max(0, Math.min(maxWaves, Math.floor(Number(waves) || 0)));
  const maxKills = Math.min(400, w * 24 + 8);
  const k = Math.max(0, Math.min(maxKills, Math.floor(Number(kills) || 0)));
  return { waves: w, kills: k };
}

function isAdminEmpire(db, empire) {
  if (!empire?.user_id) return false;
  const row = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(empire.user_id);
  return !!row?.is_admin;
}

function parseState(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function buildTaskPool(ctx) {
  const tasks = [];
  const pushB = (id, title, blurb, view) => {
    const spec = BUILDINGS[id];
    const cur = ctx.buildings[id] || 0;
    const max = spec?.max || 28;
    if (cur >= max) return;
    tasks.push({
      id: `b_${id}_${cur + 1}`,
      title,
      blurb: `${blurb} (Stufe ${cur + 1}).`,
      view,
      check: { type: "building", id, min: cur + 1 },
    });
  };
  pushB("matter_mine", "Erz für die Batterien", "Baue die Metall-Mine aus", "infra");
  pushB("helium_well", "Treibstoff für Abfangraketen", "Baue den Helium-3-Kollektor aus", "infra");
  pushB("energy_array", "Strom für den Schild", "Baue das Energie-Array aus", "infra");
  pushB("titan_extractor", "Platten für den Ring", "Baue den Titan-Extraktor aus", "infra");
  pushB("shipyard", "Werft unter Feuer", "Baue die Werft aus", "infra");
  const fighterNeed = (ctx.fighters || 0) + Math.max(3, Math.min(8, 3 + Math.floor((ctx.fighters || 0) * 0.08)));
  tasks.push({
    id: `fighters_${fighterNeed}`,
    title: "Schwarm über der Kolonie",
    blurb: `Stationiere mindestens ${fighterNeed} Jäger.`,
    view: "yard",
    check: { type: "ships", id: "fighter", min: fighterNeed },
  });
  const flakNeed = (ctx.ships["def:flak"] || 0) + Math.max(2, 3);
  tasks.push({
    id: `flak_${flakNeed}`,
    title: "Flak in den Orbit",
    blurb: `Bringe ${flakNeed} Flak-Batterien in Stellung.`,
    view: "defense",
    check: { type: "def", id: "flak", min: flakNeed },
  });
  const winT = (ctx.combatWins || 0) + 1;
  tasks.push({
    id: `win_${winT}`,
    title: "Gefecht gewinnen",
    blurb: "Gewinne einen Kampf. Die Abwehr lernt aus jedem Treffer.",
    view: "galaxy",
    check: { type: "stat", key: "combatWins", min: winT },
  });
  for (const id of Object.keys(TECHS)) {
    const spec = TECHS[id];
    const cur = ctx.techs[id] || 0;
    if (cur <= 0 || cur >= (spec.max || 20)) continue;
    if ((ctx.buildings.archive || 0) < 1) continue;
    tasks.push({
      id: `t_${id}_${cur + 1}`,
      title: `Forschung: ${spec.name}`,
      blurb: `${spec.name} auf Stufe ${cur + 1} bringen.`,
      view: "research",
      check: { type: "tech", id, min: cur + 1 },
    });
    break;
  }
  return tasks;
}

function pickTasks(ctx, empireId, day) {
  const pool = buildTaskPool(ctx);
  const seed = progress.hashDay(`${day}:orbit:${empireId}`);
  return progress.pickFromPool(pool, seed, 3).map((t) => ({
    id: t.id,
    title: t.title,
    blurb: t.blurb,
    view: t.view,
    check: t.check,
  }));
}

function loadDay(db, empire, planet, now = Date.now()) {
  const day = dayKey(now);
  const ctx = progress.gatherCtx(db, empire, planet);
  let stored = parseState(empire.orbit_siege);
  if (!stored || stored.day !== day || !Array.isArray(stored.tasks) || stored.tasks.length < 2) {
    stored = { day, playsUsed: 0, tasks: pickTasks(ctx, empire.id, day) };
    db.prepare("UPDATE empires SET orbit_siege = ? WHERE id = ?").run(JSON.stringify(stored), empire.id);
    empire.orbit_siege = JSON.stringify(stored);
  }
  const tasks = stored.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    blurb: t.blurb,
    view: t.view,
    complete: progress.evalCheck(ctx, t.check),
  }));
  const admin = isAdminEmpire(db, empire);
  const playsMax = admin ? 99 : 1 + tasks.filter((t) => t.complete).length;
  const playsUsed = admin ? 0 : Math.max(0, Number(stored.playsUsed) || 0);
  return {
    day,
    stored,
    tasks,
    playsUsed,
    playsMax,
    playsLeft: Math.max(0, playsMax - playsUsed),
    unlimited: admin,
  };
}

function saveDay(db, empire, stored) {
  db.prepare("UPDATE empires SET orbit_siege = ? WHERE id = ?").run(JSON.stringify(stored), empire.id);
  empire.orbit_siege = JSON.stringify(stored);
}

function publicStatus(db, empire, planet, now = Date.now()) {
  if (!planet) return { playsLeft: 0, playsUsed: 0, playsMax: 1, day: dayKey(now), tasks: [], unlimited: false };
  const s = loadDay(db, empire, planet, now);
  return {
    playsLeft: s.playsLeft,
    playsUsed: s.playsUsed,
    playsMax: s.playsMax,
    day: s.day,
    tasks: s.tasks,
    unlimited: !!s.unlimited,
  };
}

function start(db, empire, planet, now = Date.now()) {
  if (!planet || Number(planet.empire_id) !== Number(empire.id)) {
    throw new Error("Orbit-Belagerung ist nur über einer eigenen Kolonie verfügbar.");
  }
  const day = loadDay(db, empire, planet, now);
  if (!day.unlimited) {
    if (day.playsLeft <= 0) {
      const next = day.tasks.find((t) => !t.complete);
      throw new Error(next ? `Heute kein Einsatz mehr. ${next.title}, dann gibt es einen weiteren.` : "Heute sind alle Einsätze verbraucht. Morgen um 00:00 UTC gibt es einen neuen.");
    }
    day.stored.playsUsed = day.playsUsed + 1;
    saveDay(db, empire, day.stored);
  }
  const active = db.prepare(
    "SELECT id FROM orbit_siege_sessions WHERE empire_id = ? AND claimed_at = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1"
  ).get(empire.id, now);
  if (active) db.prepare("UPDATE orbit_siege_sessions SET claimed_at = -1 WHERE id = ?").run(active.id);
  const expiresAt = now + SESSION_MS;
  const row = db.prepare(
    "INSERT INTO orbit_siege_sessions(empire_id, planet_id, started_at, expires_at, claimed_at) VALUES(?,?,?,?,0)"
  ).run(empire.id, planet.id, now, expiresAt);
  return {
    id: Number(row.lastInsertRowid),
    startedAt: now,
    expiresAt,
    planetId: planet.id,
    lootForWave: Array.from({ length: 12 }, (_, i) => lootForWave(i + 1)),
    status: publicStatus(db, empire, planet, now),
  };
}

function readSession(db, empire, sessionId) {
  return db.prepare("SELECT * FROM orbit_siege_sessions WHERE id = ? AND empire_id = ?").get(Number(sessionId), empire.id);
}

function finalize(db, empire, session, waves, kills, now = Date.now()) {
  if (!session) throw new Error("Orbit-Belagerung nicht gefunden.");
  if (session.claimed_at) throw new Error("Diese Belohnung wurde bereits abgeholt.");
  if (now > session.expires_at) throw new Error("Die Belagerung ist abgelaufen.");
  const capped = capStats(now - session.started_at, waves, kills);
  const updated = db.prepare("UPDATE orbit_siege_sessions SET claimed_at = ?, waves = ?, kills = ? WHERE id = ? AND claimed_at = 0")
    .run(now, capped.waves, capped.kills, session.id);
  if (!updated.changes) throw new Error("Diese Belohnung wurde bereits abgeholt.");
  const reward = orbitSiegeReward(capped.waves, capped.kills);
  return { ...reward, planetId: session.planet_id };
}

function lootText(loot) {
  return Object.entries(loot || {})
    .filter(([, amount]) => Number(amount) > 0)
    .map(([id, amount]) => `+${amount} ${SHORT[id] || id.toUpperCase()}`)
    .join(" · ");
}

module.exports = {
  SESSION_MS,
  lootForWave,
  orbitSiegeReward,
  capStats,
  publicStatus,
  start,
  readSession,
  finalize,
  lootText,
  dayKey,
};
