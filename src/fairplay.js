"use strict";

const progress = require("./progress");
const settings = require("./settings");

const NEWBIE_MS = 5 * 24 * 60 * 60 * 1000;
const FAIR_RATIO = 0.25;
const FAIR_MIN_ATTACKER = 1500;
const BASH_LIMIT = 5;
const BASH_WINDOW_MS = 24 * 60 * 60 * 1000;

function cfg(db) {
  return db ? settings.get(db) : {};
}

function newbieMs(db) {
  const days = Number(cfg(db).newbieDays);
  return (Number.isFinite(days) ? days : 5) * 24 * 60 * 60 * 1000;
}

function newbieLeft(createdAt, db) {
  return Math.max(0, (createdAt || 0) + newbieMs(db) - Date.now());
}

function isNewbie(empire, db) {
  return !!empire && newbieLeft(empire.created_at, db) > 0;
}

function inspect(db, attacker, victim) {
  if (!attacker || !victim || attacker.id === victim.id) {
    return { ok: true, canAttack: true, newbie: false, protected: false, reason: "", ratio: FAIR_RATIO };
  }
  const s = cfg(db);
  const ratio = Math.max(0.05, Math.min(0.9, (Number(s.fairRatioPct) || 25) / 100));
  const minAtk = Number.isFinite(Number(s.fairMinScore)) ? Number(s.fairMinScore) : FAIR_MIN_ATTACKER;
  const bashCap = Math.max(1, Number(s.bashLimit) || BASH_LIMIT);
  const atkScore = progress.empireScore(db, attacker.id);
  const defScore = progress.empireScore(db, victim.id);
  const need = Math.floor(atkScore * ratio);
  const base = {
    ok: true,
    canAttack: true,
    newbie: false,
    protected: false,
    reason: "",
    ratio,
    atkScore,
    defScore,
    need,
    bashLeft: bashCap,
    name: victim.name,
  };
  if (isNewbie(victim, db)) {
    const hrs = Math.max(1, Math.ceil(newbieLeft(victim.created_at, db) / 3600000));
    return {
      ...base,
      ok: false,
      canAttack: false,
      newbie: true,
      protected: true,
      reason: `Anfängerschutz: ${victim.name} kann noch ${hrs} Std. nicht angegriffen werden.`,
    };
  }
  if (atkScore >= minAtk && defScore < need) {
    return {
      ...base,
      ok: false,
      canAttack: false,
      protected: true,
      reason: `Fair-Play: ${victim.name} hat ${defScore} Punkte, du ${atkScore}. Angriff nur gegen Spieler mit mindestens ${need} Punkten (${Math.round(ratio * 100)} % deiner Stärke).`,
    };
  }
  const since = Date.now() - BASH_WINDOW_MS;
  const bash = db
    .prepare(
      "SELECT COUNT(*) AS n FROM attack_log WHERE attacker_id = ? AND victim_id = ? AND created_at >= ?"
    )
    .get(attacker.id, victim.id, since).n;
  const bashLeft = Math.max(0, bashCap - bash);
  if (bash >= bashCap) {
    return {
      ...base,
      ok: false,
      canAttack: false,
      protected: true,
      bashLeft: 0,
      reason: `Bash-Schutz: du hast ${victim.name} in 24 Stunden schon ${bashCap}× angegriffen. Morgen wieder.`,
    };
  }
  return { ...base, bashLeft };
}

function assertCanAttack(db, attacker, victim) {
  const st = inspect(db, attacker, victim);
  if (!st.ok) throw new Error(st.reason);
  return st;
}

function logAttack(db, attackerId, victimId) {
  if (!attackerId || !victimId || attackerId === victimId) return;
  const t = Date.now();
  db.prepare("INSERT INTO attack_log(attacker_id, victim_id, created_at) VALUES(?, ?, ?)").run(attackerId, victimId, t);
  db.prepare("DELETE FROM attack_log WHERE created_at < ?").run(t - 3 * BASH_WINDOW_MS);
}

function ownerPublic(db, viewer, ownerRow) {
  if (!ownerRow) return null;
  const st = inspect(db, viewer, ownerRow);
  return {
    id: ownerRow.id,
    name: ownerRow.name,
    color: ownerRow.color,
    newbie: st.newbie,
    protected: st.protected,
    canAttack: st.canAttack,
    protectReason: st.reason || "",
    score: st.defScore || 0,
  };
}

module.exports = {
  NEWBIE_MS,
  FAIR_RATIO,
  FAIR_MIN_ATTACKER,
  BASH_LIMIT,
  newbieLeft,
  isNewbie,
  inspect,
  assertCanAttack,
  logAttack,
  ownerPublic,
};
