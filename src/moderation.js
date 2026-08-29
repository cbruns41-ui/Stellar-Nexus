"use strict";

const progress = require("./progress");
const social = require("./social");

const DURATIONS = [
  { id: "1h", ms: 60 * 60 * 1000, label: "1 Stunde" },
  { id: "6h", ms: 6 * 60 * 60 * 1000, label: "6 Stunden" },
  { id: "1d", ms: 24 * 60 * 60 * 1000, label: "1 Tag" },
  { id: "3d", ms: 3 * 24 * 60 * 60 * 1000, label: "3 Tage" },
  { id: "7d", ms: 7 * 24 * 60 * 60 * 1000, label: "7 Tage" },
  { id: "30d", ms: 30 * 24 * 60 * 60 * 1000, label: "30 Tage" },
  { id: "perm", ms: -1, label: "Dauerhaft" },
];

function canMod(user) {
  return !!(user && (user.is_admin || user.is_mod));
}

function untilActive(until) {
  const n = Number(until) || 0;
  if (n === -1) return true;
  return n > Date.now();
}

function isBanned(user) {
  return untilActive(user?.banned_until);
}

function isMuted(user) {
  return untilActive(user?.muted_until);
}

function formatUntil(until) {
  const n = Number(until) || 0;
  if (n === -1) return "dauerhaft";
  if (n <= Date.now()) return "abgelaufen";
  const ms = n - Date.now();
  const h = Math.ceil(ms / 3600000);
  if (h < 48) return `noch ${h} Std.`;
  return `noch ${Math.ceil(h / 24)} Tage`;
}

function banMessage(user) {
  const reason = String(user?.ban_reason || "Regelverstoß").slice(0, 180);
  return `Account gesperrt (${formatUntil(user.banned_until)}): ${reason}`;
}

function muteMessage(user) {
  const reason = String(user?.mute_reason || "Funk-Sperre").slice(0, 180);
  return `Funk gesperrt (${formatUntil(user.muted_until)}): ${reason}`;
}

function loadUser(db, userId) {
  return db
    .prepare(
      `SELECT u.*, e.id AS empire_id, e.name AS empire_name
       FROM users u LEFT JOIN empires e ON e.user_id = u.id WHERE u.id = ?`
    )
    .get(userId);
}

function loadUserByEmpire(db, empireId) {
  return db
    .prepare(
      `SELECT u.*, e.id AS empire_id, e.name AS empire_name
       FROM empires e JOIN users u ON u.id = e.user_id WHERE e.id = ?`
    )
    .get(empireId);
}

function assertStaff(actor) {
  if (!canMod(actor)) throw new Error("Keine Moderatorenrechte.");
}

function assertTarget(actor, target) {
  if (!target) throw new Error("Spieler unbekannt.");
  if (target.id === actor.id) throw new Error("Dich selbst kannst du nicht sperren.");
  if (target.is_admin) throw new Error("Admins können nicht gesperrt werden.");
  if (target.is_mod && !actor.is_admin) throw new Error("Nur Admins können Moderatoren sperren.");
}

function parseDuration(id) {
  const spec = DURATIONS.find((d) => d.id === String(id || ""));
  if (!spec) throw new Error("Ungültige Dauer.");
  return spec;
}

function log(db, actorId, targetId, action, detail) {
  db.prepare("INSERT INTO mod_log(actor_id, target_id, action, detail, created_at) VALUES(?, ?, ?, ?, ?)").run(
    actorId,
    targetId || null,
    action,
    String(detail || "").slice(0, 400),
    Date.now()
  );
}

function dropSessions(db, userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

function applySanction(db, actor, targetRef, kind, durationId, reason) {
  assertStaff(actor);
  const target = targetRef.userId ? loadUser(db, targetRef.userId) : loadUserByEmpire(db, targetRef.empireId);
  assertTarget(actor, target);
  const spec = parseDuration(durationId);
  const until = spec.ms === -1 ? -1 : Date.now() + spec.ms;
  const why = String(reason || "").trim().slice(0, 180) || "Regelverstoß";
  if (kind === "mute") {
    db.prepare("UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?").run(until, why, target.id);
    log(db, actor.id, target.id, "mute", `${spec.label}: ${why}`);
    return { ok: true, kind: "mute", until, label: spec.label, username: target.username };
  }
  db.prepare("UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?").run(until, why, target.id);
  dropSessions(db, target.id);
  log(db, actor.id, target.id, "ban", `${spec.label}: ${why}`);
  return { ok: true, kind: "ban", until, label: spec.label, username: target.username };
}

function liftSanction(db, actor, targetRef, kind) {
  assertStaff(actor);
  const target = targetRef.userId ? loadUser(db, targetRef.userId) : loadUserByEmpire(db, targetRef.empireId);
  if (!target) throw new Error("Spieler unbekannt.");
  if (target.is_admin) throw new Error("Admins können nicht bearbeitet werden.");
  if (kind === "mute") {
    db.prepare("UPDATE users SET muted_until = 0, mute_reason = '' WHERE id = ?").run(target.id);
    log(db, actor.id, target.id, "unmute", "");
    return { ok: true, kind: "unmute", username: target.username };
  }
  db.prepare("UPDATE users SET banned_until = 0, ban_reason = '' WHERE id = ?").run(target.id);
  log(db, actor.id, target.id, "unban", "");
  return { ok: true, kind: "unban", username: target.username };
}

function setModerator(db, actor, userId, on) {
  if (!actor?.is_admin) throw new Error("Nur Admins können Moderatoren ernennen.");
  const target = loadUser(db, userId);
  if (!target) throw new Error("Spieler unbekannt.");
  if (target.is_admin) throw new Error("Admins brauchen keine Extra-Rolle.");
  if (target.id === actor.id) throw new Error("Eigene Rolle bleibt Admin.");
  db.prepare("UPDATE users SET is_mod = ? WHERE id = ?").run(on ? 1 : 0, target.id);
  log(db, actor.id, target.id, on ? "mod_on" : "mod_off", "");
  return { ok: true, username: target.username, isMod: !!on };
}

function deleteChat(db, actor, messageId) {
  assertStaff(actor);
  const row = db.prepare("SELECT id, empire_id, body FROM chat_messages WHERE id = ?").get(Number(messageId));
  if (!row) throw new Error("Nachricht nicht gefunden.");
  db.prepare("DELETE FROM chat_i18n WHERE message_kind = 'chat' AND message_id = ?").run(row.id);
  db.prepare("DELETE FROM chat_messages WHERE id = ?").run(row.id);
  log(db, actor.id, null, "chat_del", String(row.body || "").slice(0, 120));
  return { ok: true };
}

function publicUser(db, row) {
  const score = row.empire_id ? progress.empireScore(db, row.empire_id) : 0;
  return {
    userId: row.id,
    username: row.username,
    empireId: row.empire_id || null,
    empireName: row.empire_name || "",
    isAdmin: !!row.is_admin,
    isMod: !!row.is_mod,
    banned: isBanned(row),
    bannedUntil: row.banned_until || 0,
    banReason: row.ban_reason || "",
    banLabel: isBanned(row) ? formatUntil(row.banned_until) : "",
    muted: isMuted(row),
    mutedUntil: row.muted_until || 0,
    muteReason: row.mute_reason || "",
    muteLabel: isMuted(row) ? formatUntil(row.muted_until) : "",
    score,
    createdAt: row.created_at,
    lastSeen: row.last_seen || 0,
  };
}

function searchPlayers(db, query) {
  const q = String(query || "").trim();
  if (q.length < 1) return [];
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = db
    .prepare(
      `SELECT u.*, e.id AS empire_id, e.name AS empire_name, e.last_seen
       FROM users u
       LEFT JOIN empires e ON e.user_id = u.id
       WHERE u.username LIKE ? COLLATE NOCASE OR IFNULL(e.name,'') LIKE ? COLLATE NOCASE
       ORDER BY u.id DESC LIMIT 40`
    )
    .all(like, like);
  return rows.map((r) => publicUser(db, r));
}

function listStaff(db) {
  const rows = db
    .prepare(
      `SELECT u.*, e.id AS empire_id, e.name AS empire_name, e.last_seen
       FROM users u LEFT JOIN empires e ON e.user_id = u.id
       WHERE u.is_admin = 1 OR u.is_mod = 1
       ORDER BY u.is_admin DESC, u.username`
    )
    .all();
  return rows.map((r) => publicUser(db, r));
}

function listSanctions(db) {
  const rows = db
    .prepare(
      `SELECT u.*, e.id AS empire_id, e.name AS empire_name, e.last_seen
       FROM users u LEFT JOIN empires e ON e.user_id = u.id
       WHERE u.banned_until = -1 OR u.banned_until > ? OR u.muted_until = -1 OR u.muted_until > ?
       ORDER BY u.banned_until DESC LIMIT 50`
    )
    .all(Date.now(), Date.now());
  return rows.map((r) => publicUser(db, r));
}

function recentChat(db, limit = 40) {
  return db
    .prepare(
      `SELECT m.id, m.channel, m.body, m.created_at, e.id AS empireId, e.name, e.color, u.username
       FROM chat_messages m
       JOIN empires e ON e.id = m.empire_id
       JOIN users u ON u.id = e.user_id
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(Math.max(10, Math.min(80, limit | 0)))
    .reverse();
}

function recentLog(db) {
  return db
    .prepare(
      `SELECT l.*, a.username AS actor, t.username AS target
       FROM mod_log l
       JOIN users a ON a.id = l.actor_id
       LEFT JOIN users t ON t.id = l.target_id
       ORDER BY l.id DESC LIMIT 30`
    )
    .all();
}

function overview(db) {
  return {
    durations: DURATIONS,
    staff: listStaff(db),
    sanctions: listSanctions(db),
    chat: recentChat(db, 36),
    log: recentLog(db),
  };
}

function userState(user) {
  return {
    isAdmin: !!user?.is_admin,
    isMod: !!user?.is_mod,
    canMod: canMod(user),
    banned: isBanned(user),
    muted: isMuted(user),
  };
}

function assertNotMuted(db, empire) {
  if (!empire) return;
  const user = db.prepare("SELECT muted_until, mute_reason FROM users WHERE id = ?").get(empire.user_id);
  if (user && isMuted(user)) throw new Error(muteMessage(user));
}

module.exports = {
  DURATIONS,
  canMod,
  isBanned,
  isMuted,
  banMessage,
  muteMessage,
  formatUntil,
  applySanction,
  liftSanction,
  setModerator,
  deleteChat,
  searchPlayers,
  overview,
  userState,
  assertNotMuted,
  loadUserByEmpire,
  loadUser,
  log,
};
