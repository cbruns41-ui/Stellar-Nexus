"use strict";

const crypto = require("crypto");
const { isIP } = require("node:net");

function trustProxySetting() {
  if (process.env.VERCEL) return 1;
  const raw = String(process.env.TRUST_PROXY || "").trim();
  if (!raw) return false;
  if (raw === "1" || raw.toLowerCase() === "true") return 1;
  if (raw.toLowerCase() === "loopback") return "loopback";
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function trustsForwarded(req) {
  if (process.env.VERCEL) return true;
  const setting = req?.app?.get?.("trust proxy");
  return setting !== false && setting != null && setting !== 0;
}

function clientIp(req) {
  if (trustsForwarded(req)) {
    const forwarded = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    if (isIP(forwarded)) return forwarded;
  }
  return req.ip || req.socket?.remoteAddress || "";
}

function cookieSecure(req) {
  const flag = String(process.env.COOKIE_SECURE || "").toLowerCase();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  if (process.env.VERCEL) return true;
  if (req?.secure) return true;
  if (String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https" && trustsForwarded(req)) return true;
  return /^https:/i.test(String(process.env.PUBLIC_URL || ""));
}

function cookieFlags(req) {
  return `HttpOnly; SameSite=Lax; Path=/;${cookieSecure(req) ? " Secure;" : ""}`;
}

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
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
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
  if (row && require("./registration").pending(db,row.id)) return null;
  return row || null;
}

function setSessionCookie(res, token, req) {
  res.setHeader(
    "Set-Cookie",
    `sn_session=${token}; ${cookieFlags(req)} Max-Age=${Math.floor(SESSION_MS / 1000)}`
  );
}

function clearSessionCookie(res, req) {
  res.setHeader("Set-Cookie", `sn_session=; ${cookieFlags(req)} Max-Age=0`);
}

function applySecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (cookieSecure(req)) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
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
  clientIp,
  cookieSecure,
  trustProxySetting,
  applySecurityHeaders,
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
