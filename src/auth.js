"use strict";

const crypto = require("crypto");

const SESSION_MS = 14 * 24 * 3600 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 32);
  const buf = Buffer.from(hash, "hex");
  if (buf.length !== test.length) return false;
  return crypto.timingSafeEqual(buf, test);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)").run(token, userId, Date.now() + SESSION_MS);
  return token;
}

function destroySession(db, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function userFromRequest(db, req) {
  const token = parseCookies(req).sn_session;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.is_admin, u.is_mod, u.banned_until, u.ban_reason, u.muted_until, u.mute_reason
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, Date.now());
  return row || null;
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `sn_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sn_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key) || [];
  const keep = b.filter((x) => t - x < windowMs);
  if (keep.length >= max) return false;
  keep.push(t);
  buckets.set(key, keep);
  return true;
}

module.exports = {
  hashPassword,
  verifyPassword,
  parseCookies,
  createSession,
  destroySession,
  userFromRequest,
  setSessionCookie,
  clearSessionCookie,
  rateLimit,
};
