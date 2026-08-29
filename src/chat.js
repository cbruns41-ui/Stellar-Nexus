"use strict";

const social = require("./social");
const moderation = require("./moderation");

const LANGS = {
  de: "Deutsch",
  en: "English",
  it: "Italiano",
  fr: "Français",
  es: "Español",
  pl: "Polski",
  pt: "Português",
  ru: "Русский",
  nl: "Nederlands",
  cs: "Čeština",
  tr: "Türkçe",
};

const LANG_EN = {
  de: "German",
  en: "English",
  it: "Italian",
  fr: "French",
  es: "Spanish",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  nl: "Dutch",
  cs: "Czech",
  tr: "Turkish",
};

const CHANNELS = {
  global: { id: "global", name: "Global", blurb: "Funk an die ganze Galaxie." },
  alliance: { id: "alliance", name: "Allianz", blurb: "Nur für dein Bündnis." },
  system: { id: "system", name: "System", blurb: "Spieler im aktuellen Sternensystem." },
  trade: { id: "trade", name: "Handel", blurb: "Börse, Tausch, Preise." },
};

const CENSORED_WORDS = [
  "arschloch", "arsch", "bastard", "drecksau", "fotze", "hurensohn", "hure", "idiot",
  "kanake", "missgeburt", "nutte", "schlampe", "scheisse", "scheiße", "schwanz", "wixer",
  "wichser", "asshole", "bitch", "dumbass", "fuck", "motherfucker", "shit", "slut",
];

function normalizeForModeration(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9äöüß]/g, "");
}

function censorMessage(text) {
  let output = String(text || "");
  const normalized = normalizeForModeration(output);
  const variants = { a: "a4", e: "e3", i: "i1!|", o: "o0@", s: "s5$", t: "t7" };
  for (const word of CENSORED_WORDS) {
    const cleanWord = normalizeForModeration(word);
    if (!cleanWord || !normalized.includes(cleanWord)) continue;
    const pattern = cleanWord
      .split("")
      .map((char) => `[${variants[char] || char}][^a-zA-Z0-9]*`)
      .join("");
    output = output.replace(new RegExp(pattern, "giu"), (match) => match.replace(/[^\s]/gu, "*"));
  }
  return output;
}

function normLang(code) {
  const k = String(code || "de").slice(0, 2).toLowerCase();
  return LANGS[k] ? k : "de";
}

function cleanText(raw, max) {
  return String(raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function localeOf(empire) {
  return normLang(empire?.locale);
}

function wantsTranslate(empire) {
  return empire?.translate !== 0 && empire?.translate !== false;
}

function channelKey(channel, extraId) {
  if (channel === "alliance") return `alliance:${extraId || 0}`;
  if (channel === "system") return `system:${extraId || 0}`;
  return channel;
}

function lastRead(db, empireId, key) {
  const row = db.prepare("SELECT last_id FROM chat_reads WHERE empire_id = ? AND channel_key = ?").get(empireId, key);
  return row ? row.last_id : 0;
}

function setLastRead(db, empireId, key, id) {
  db.prepare(
    `INSERT INTO chat_reads(empire_id, channel_key, last_id) VALUES(?, ?, ?)
     ON CONFLICT(empire_id, channel_key) DO UPDATE SET last_id = excluded.last_id`
  ).run(empireId, key, id || 0);
}

function cachedTranslation(db, kind, id, lang) {
  const row = db
    .prepare("SELECT text FROM chat_i18n WHERE message_kind = ? AND message_id = ? AND lang = ?")
    .get(kind, id, lang);
  return row?.text || null;
}

function saveTranslation(db, kind, id, lang, text) {
  db.prepare(
    "INSERT OR REPLACE INTO chat_i18n(message_kind, message_id, lang, text) VALUES(?, ?, ?, ?)"
  ).run(kind, id, lang, text);
}

async function translateViaXai(text, from, to) {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Translate the user message from ${LANG_EN[from] || from} to ${LANG_EN[to] || to}. Return only the translation. Keep names, tags and numbers. No quotes, no notes.`,
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    return out ? String(out).trim() : null;
  } catch {
    return null;
  }
}

async function translateViaMemory(text, from, to) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${from}|${to}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data?.responseData?.translatedText;
    if (!out) return null;
    const t = String(out).trim();
    if (!t || /INVALID|MYMEMORY WARNING|PLEASE SELECT/i.test(t)) return null;
    return t;
  } catch {
    return null;
  }
}

async function translateText(db, kind, id, text, from, to) {
  const src = normLang(from);
  const dst = normLang(to);
  if (!text || src === dst) return { text, translated: false, original: text, lang: src };
  const hit = cachedTranslation(db, kind, id, dst);
  if (hit) return { text: hit, translated: hit !== text, original: text, lang: src };
  let out = await translateViaXai(text, src, dst);
  if (!out) out = await translateViaMemory(text, src, dst);
  if (!out) return { text, translated: false, original: text, lang: src, failed: true };
  saveTranslation(db, kind, id, dst, out);
  return { text: out, translated: out !== text, original: text, lang: src };
}

async function decorate(db, empire, kind, rows) {
  const dest = localeOf(empire);
  const auto = wantsTranslate(empire);
  const out = [];
  for (const row of rows) {
    const src = normLang(row.lang);
    let pack = { text: row.body, translated: false, original: row.body, lang: src };
    if (auto && src !== dest) {
      pack = await translateText(db, kind, row.id, row.body, src, dest);
    }
    out.push({
      id: row.id,
      body: pack.text,
      original: pack.original,
      translated: !!pack.translated,
      failed: !!pack.failed,
      lang: src,
      createdAt: row.created_at,
      empireId: row.empire_id || row.from_id,
      fromId: row.from_id || row.empire_id,
      toId: row.to_id || null,
      subject: row.subject || "",
      seen: row.seen != null ? !!row.seen : true,
      name: row.name,
      username: row.username,
      color: row.color,
      avatar: social.avatarUrl({ id: row.empire_id || row.from_id, avatar: row.avatar }),
      vip: (Number(row.vip_until) || 0) > Date.now(),
      signet: !!row.signet,
    });
  }
  return out;
}

function resolveScope(db, empire, channel) {
  const ch = CHANNELS[channel] ? channel : "global";
  if (ch === "alliance") {
    const mine = social.myAlliance(db, empire.id);
    if (!mine) throw new Error("Du bist in keiner Allianz.");
    return { channel: ch, allianceId: mine.id, systemId: null, key: channelKey("alliance", mine.id) };
  }
  if (ch === "system") {
    const planet = db.prepare("SELECT system_id FROM planets WHERE id = ?").get(empire.last_planet_id);
    if (!planet) throw new Error("Kein Fokusplanet.");
    return { channel: ch, allianceId: null, systemId: planet.system_id, key: channelKey("system", planet.system_id) };
  }
  return { channel: ch, allianceId: null, systemId: null, key: ch };
}

function listQuery(db, scope) {
  if (scope.channel === "alliance") {
    return db
      .prepare(
        `SELECT m.*, e.name, e.color, e.avatar, e.vip_until, e.signet, u.username
         FROM chat_messages m
         JOIN empires e ON e.id = m.empire_id
         JOIN users u ON u.id = e.user_id
         WHERE m.channel = 'alliance' AND m.alliance_id = ?
         ORDER BY m.id DESC LIMIT 80`
      )
      .all(scope.allianceId)
      .reverse();
  }
  if (scope.channel === "system") {
    return db
      .prepare(
        `SELECT m.*, e.name, e.color, e.avatar, e.vip_until, e.signet, u.username
         FROM chat_messages m
         JOIN empires e ON e.id = m.empire_id
         JOIN users u ON u.id = e.user_id
         WHERE m.channel = 'system' AND m.system_id = ?
         ORDER BY m.id DESC LIMIT 80`
      )
      .all(scope.systemId)
      .reverse();
  }
  return db
    .prepare(
      `SELECT m.*, e.name, e.color, e.avatar, e.vip_until, e.signet, u.username
       FROM chat_messages m
       JOIN empires e ON e.id = m.empire_id
       JOIN users u ON u.id = e.user_id
       WHERE m.channel = ?
       ORDER BY m.id DESC LIMIT 80`
    )
    .all(scope.channel)
    .reverse();
}

async function listChat(db, empire, channel) {
  const scope = resolveScope(db, empire, channel);
  const rows = listQuery(db, scope);
  if (rows.length) setLastRead(db, empire.id, scope.key, rows[rows.length - 1].id);
  const messages = await decorate(db, empire, "chat", rows);
  const mine = social.myAlliance(db, empire.id);
  const staff = db.prepare("SELECT is_admin, is_mod FROM users WHERE id = ?").get(empire.user_id);
  return {
    canMod: moderation.canMod(staff),
    channel: scope.channel,
    channels: Object.values(CHANNELS).map((c) => ({
      ...c,
      locked: c.id === "alliance" && !mine,
    })),
    alliance: mine ? { id: mine.id, tag: mine.tag, name: mine.name } : null,
    lang: localeOf(empire),
    translate: wantsTranslate(empire),
    langs: LANGS,
    messages,
  };
}

function postSystem(db, body) {
  const text = censorMessage(cleanText("[NEXUS] " + String(body || ""), 240));
  if (text.length < 8) throw new Error("Text zu kurz.");
  const admin = db
    .prepare(
      `SELECT e.id FROM empires e JOIN users u ON u.id = e.user_id WHERE u.is_admin = 1 ORDER BY u.id LIMIT 1`
    )
    .get();
  if (!admin) throw new Error("Kein Admin-Imperium für den Funk.");
  db.prepare(
    "INSERT INTO chat_messages(channel, alliance_id, system_id, empire_id, body, lang, created_at) VALUES(?,?,?,?,?,?,?)"
  ).run("global", null, null, admin.id, text, "de", Date.now());
  return text;
}

function postChat(db, empire, channel, body) {
  moderation.assertNotMuted(db, empire);
  const text = censorMessage(cleanText(body, 240));
  if (text.length < 1) throw new Error("Leere Nachricht.");
  const now = Date.now();
  if ((empire.last_chat || 0) > now - 1600) throw new Error("Funk überlastet. Kurz warten.");
  const scope = resolveScope(db, empire, channel);
  db.prepare(
    "INSERT INTO chat_messages(channel, alliance_id, system_id, empire_id, body, lang, created_at) VALUES(?,?,?,?,?,?,?)"
  ).run(scope.channel, scope.allianceId, scope.systemId, empire.id, text, localeOf(empire), now);
  db.prepare("UPDATE empires SET last_chat = ? WHERE id = ?").run(now, empire.id);
  const old = now - 14 * 24 * 3600 * 1000;
  db.prepare("DELETE FROM chat_messages WHERE created_at < ?").run(old);
}

function unreadForKey(db, empireId, channel, extraId) {
  const key = channelKey(channel, extraId);
  const last = lastRead(db, empireId, key);
  if (channel === "alliance") {
    return db
      .prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE channel = 'alliance' AND alliance_id = ? AND id > ?")
      .get(extraId, last).n;
  }
  if (channel === "system") {
    return db
      .prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE channel = 'system' AND system_id = ? AND id > ?")
      .get(extraId, last).n;
  }
  return db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE channel = ? AND id > ?").get(channel, last).n;
}

function unreadChat(db, empire) {
  let n = unreadForKey(db, empire.id, "global") + unreadForKey(db, empire.id, "trade");
  const mine = social.myAlliance(db, empire.id);
  if (mine) n += unreadForKey(db, empire.id, "alliance", mine.id);
  const planet = db.prepare("SELECT system_id FROM planets WHERE id = ?").get(empire.last_planet_id);
  if (planet) n += unreadForKey(db, empire.id, "system", planet.system_id);
  return n;
}

function unreadMail(db, empireId) {
  return db.prepare("SELECT COUNT(*) AS n FROM mail WHERE to_id = ? AND seen = 0").get(empireId).n;
}

function listThreads(db, empire) {
  const rows = db
    .prepare(
      `SELECT m.*,
              CASE WHEN m.from_id = ? THEN m.to_id ELSE m.from_id END AS peer_id
       FROM mail m
       WHERE m.from_id = ? OR m.to_id = ?
       ORDER BY m.id DESC`
    )
    .all(empire.id, empire.id, empire.id);
  const seen = new Set();
  const threads = [];
  for (const r of rows) {
    if (seen.has(r.peer_id)) continue;
    seen.add(r.peer_id);
    const peer = db
      .prepare(
        `SELECT e.id, e.name, e.color, e.avatar, u.username
         FROM empires e JOIN users u ON u.id = e.user_id WHERE e.id = ?`
      )
      .get(r.peer_id);
    if (!peer) continue;
    const unread = db
      .prepare("SELECT COUNT(*) AS n FROM mail WHERE from_id = ? AND to_id = ? AND seen = 0")
      .get(r.peer_id, empire.id).n;
    threads.push({
      peerId: peer.id,
      name: peer.name,
      username: peer.username,
      color: peer.color,
      avatar: social.avatarUrl(peer),
      preview: r.body.slice(0, 80),
      createdAt: r.created_at,
      unread,
      mine: r.from_id === empire.id,
    });
  }
  return threads;
}

async function listThread(db, empire, peerId) {
  const peer = db
    .prepare(
      `SELECT e.id, e.name, e.color, e.avatar, u.username
       FROM empires e JOIN users u ON u.id = e.user_id WHERE e.id = ?`
    )
    .get(peerId);
  if (!peer) throw new Error("Spieler unbekannt.");
  const rows = db
    .prepare(
      `SELECT m.*, e.name, e.color, e.avatar, u.username
       FROM mail m
       JOIN empires e ON e.id = m.from_id
       JOIN users u ON u.id = e.user_id
       WHERE (m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?)
       ORDER BY m.id ASC
       LIMIT 120`
    )
    .all(empire.id, peerId, peerId, empire.id);
  db.prepare("UPDATE mail SET seen = 1 WHERE from_id = ? AND to_id = ?").run(peerId, empire.id);
  const messages = await decorate(db, empire, "mail", rows);
  return {
    peer: {
      id: peer.id,
      name: peer.name,
      username: peer.username,
      color: peer.color,
      avatar: social.avatarUrl(peer),
    },
    messages,
    lang: localeOf(empire),
    translate: wantsTranslate(empire),
  };
}

function sendMail(db, empire, body) {
  moderation.assertNotMuted(db, empire);
  const text = cleanText(body?.body, 800);
  const subject = cleanText(body?.subject, 80);
  if (text.length < 1) throw new Error("Leere Nachricht.");
  const now = Date.now();
  if ((empire.last_mail || 0) > now - 2500) throw new Error("Postfach überlastet. Kurz warten.");
  let toId = Number(body?.toId || 0);
  if (!toId && body?.username) {
    const row = db
      .prepare(
        `SELECT e.id FROM empires e JOIN users u ON u.id = e.user_id WHERE u.username = ? COLLATE NOCASE`
      )
      .get(String(body.username).trim());
    if (!row) throw new Error("Commander unbekannt.");
    toId = row.id;
  }
  if (!toId) throw new Error("Empfänger fehlt.");
  if (toId === empire.id) throw new Error("Du kannst dir nicht selbst schreiben.");
  const target = db.prepare("SELECT id FROM empires WHERE id = ?").get(toId);
  if (!target) throw new Error("Spieler unbekannt.");
  db.prepare(
    "INSERT INTO mail(from_id, to_id, subject, body, lang, created_at, seen) VALUES(?,?,?,?,?,?,0)"
  ).run(empire.id, toId, subject, text, localeOf(empire), now);
  db.prepare("UPDATE empires SET last_mail = ? WHERE id = ?").run(now, empire.id);
  return toId;
}

module.exports = {
    censorMessage,
  LANGS,
  CHANNELS,
  listChat,
  postChat,
  postSystem,
  unreadChat,
  unreadMail,
  listThreads,
  listThread,
  sendMail,
};
