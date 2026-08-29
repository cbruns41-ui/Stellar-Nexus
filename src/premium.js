"use strict";

const DAILY_NEX_FREE = 10;
const DAILY_NEX_VIP = 16;
const BOOKMARK_FREE = 8;
const BOOKMARK_VIP = 24;
const REPORT_FREE = 80;
const REPORT_VIP = 200;
const VIP_RECALL_CD = 12 * 60 * 60 * 1000;
const RUSH_CD = 8 * 60 * 1000;

/** Kleinste Packung bestimmt den Euro-Gegenwert je Nex (CPC 2025: echte Währung ausweisen). */
const PACKS = [
  { id: "pack_s", name: "80 Nex", nex: 80, eurCents: 299, blurb: "Einstieg: Rückruf, Signet oder ein Chrono-Takt." },
  { id: "pack_m", name: "220 Nex", nex: 220, eurCents: 699, blurb: "Mehr Komfort, klarer Mengenrabatt, kein Zufall." },
  { id: "pack_l", name: "600 Nex", nex: 600, eurCents: 1499, blurb: "Vorrat für Cosmetics und Komfort — kein Kampfvorteil." },
];

const PLANS = [
  {
    id: "pass30",
    name: "Nexus-Pass · 30 Tage",
    days: 30,
    eurCents: 499,
    blurb: "Abo mit Komfort und Cosmetics. Kein Kampfbonus, keine Extra-Produktion.",
  },
  {
    id: "pass90",
    name: "Nexus-Pass · 90 Tage",
    days: 90,
    eurCents: 1299,
    blurb: "Drei Monate, etwas günstiger pro Tag. Jederzeit zum Periodenende kündbar.",
  },
];

const VIP_PERKS = [
  "Funk- und Ranglisten-Abzeichen „Pass“ (rein kosmetisch)",
  "Tägliches Nex: 16 statt 10",
  "24 statt 8 gespeicherte Kartenziele",
  "200 statt 80 Nachrichten im Archiv",
  "Spezieswechsel nach 24 statt 48 Stunden",
  "Ein Flotten-Rückruf alle 12 Stunden ohne Nex",
];

const SHOP = {
  recall: {
    id: "recall",
    name: "Flotten-Rückruf",
    cost: 12,
    kind: "comfort",
    blurb: "Alle eigenen Flotten kehren um. Kein extra Tempo, kein Kampfvorteil.",
  },
  chrono: {
    id: "chrono",
    name: "Chrono-Takt",
    cost: 18,
    kind: "comfort",
    blurb: "Schließt einen laufenden Bau-, Werft- oder Forschungsauftrag ab. Dieselbe 8-Minuten-Pause wie der Diamant-Riss — Bezahlen stapelt keine Extra-Skips.",
  },
  rename: {
    id: "rename",
    name: "Planetenname",
    cost: 10,
    kind: "cosmetic",
    blurb: "Benennt den Fokus-Planeten um. Rein kosmetisch.",
  },
  signet: {
    id: "signet",
    name: "Funk-Signet",
    cost: 25,
    kind: "cosmetic",
    blurb: "Kleines Zeichen neben deinem Namen im Funk. Kein Spielvorteil.",
  },
  crate_ore: {
    id: "crate_ore",
    name: "Erz-Konvoi",
    cost: 28,
    kind: "supply",
    blurb: "Fester Nachschub auf dem Fokus-Planeten. Inhalt steht fest, kein Zufall.",
    loot: { metal: 2400, helium: 1200, energy: 2400 },
  },
  crate_rare: {
    id: "crate_rare",
    name: "Seltene Fracht",
    cost: 42,
    kind: "supply",
    blurb: "Titan, Kristalle, Diamanten — Mengen sind ausgewiesen.",
    loot: { titan: 600, crystal: 600, diamond: 20 },
  },
  crate_fleet: {
    id: "crate_fleet",
    name: "Staffel-Paket",
    cost: 36,
    kind: "fleet",
    blurb: "8 Jäger und 2 Abfangjäger, sofort am Fokus-Planeten.",
    ships: { fighter: 8, interceptor: 2 },
  },
  aeon: {
    id: "aeon",
    name: "Aeon-Korvette",
    cost: 48,
    kind: "fleet",
    blurb: "Schaltet die Nexus-Klasse frei und liefert 1 Korvette. Danach in der Werft mit Ressourcen baubar. Werte stehen im Tech-Tree.",
    ships: { aeon: 1 },
    unlock: "aeon_unlock",
  },
  aeon_more: {
    id: "aeon_more",
    name: "Weitere Aeon",
    cost: 32,
    kind: "fleet",
    blurb: "1 weitere Aeon-Korvette. Nur nach Freischaltung.",
    ships: { aeon: 1 },
    needUnlock: "aeon_unlock",
  },
  helix: {
    id: "helix",
    name: "Helix-Kampfdrohne",
    cost: 54,
    kind: "fleet",
    blurb: "Schaltet die KI-Drohne frei und liefert 1 Stück. Stark gegen Kapital, schwach gegen Schwärme. Danach in der Werft baubar.",
    ships: { helix: 1 },
    unlock: "helix_unlock",
  },
  helix_more: {
    id: "helix_more",
    name: "Weitere Helix",
    cost: 38,
    kind: "fleet",
    blurb: "1 weitere Helix-Kampfdrohne. Nur nach Freischaltung.",
    ships: { helix: 1 },
    needUnlock: "helix_unlock",
  },
  ship_cap_boost: {
    id: "ship_cap_boost",
    name: "Werft-Turbine",
    cost: 20,
    kind: "comfort",
    blurb: "Erhöht das Schiffslimit pro Planet für 24 Stunden um 20 %. Legal-Hinweis: Kein Kampfvorteil, reines Komfort-Item.",
  },
  alliance_expand: {
    id: "alliance_expand",
    name: "Allianz-Ausbau",
    cost: 30,
    kind: "comfort",
    blurb: "Erhöht das Mitgliederlimit der Allianz um 5. Start 15, Maximum 30 — das ist das absolute Limit.",
  },
};

function eurFromCents(cents) {
  return (Number(cents) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function nexToEurLabel(nex) {
  const cents = Math.round((Number(nex) * PACKS[0].eurCents) / PACKS[0].nex);
  return eurFromCents(cents);
}

function isVip(empire) {
  return !!empire && (Number(empire.vip_until) || 0) > Date.now();
}

function dailyNexOf(empire, db) {
  const s = db ? require("./settings").get(db) : {};
  const free = Number.isFinite(Number(s.dailyNex)) ? s.dailyNex : DAILY_NEX_FREE;
  const vip = Number.isFinite(Number(s.dailyNexVip)) ? s.dailyNexVip : DAILY_NEX_VIP;
  return isVip(empire) ? vip : free;
}

function bookmarkCap(empire, db) {
  const s = db ? require("./settings").get(db) : {};
  const free = Number.isFinite(Number(s.bookmarkFree)) ? s.bookmarkFree : BOOKMARK_FREE;
  const vip = Number.isFinite(Number(s.bookmarkVip)) ? s.bookmarkVip : BOOKMARK_VIP;
  return isVip(empire) ? vip : free;
}

function reportCap(empire) {
  return isVip(empire) ? REPORT_VIP : REPORT_FREE;
}

function speciesCdMs(empire) {
  return (isVip(empire) ? 24 : 48) * 60 * 60 * 1000;
}

function freeRecallReady(empire) {
  if (!isVip(empire)) return false;
  return Date.now() - (Number(empire.last_vip_recall) || 0) >= VIP_RECALL_CD;
}

function publicVip(empire, db) {
  const active = isVip(empire);
  return {
    active,
    until: active ? empire.vip_until : 0,
    plan: active ? empire.vip_plan || "pass30" : "",
    cancelAtEnd: !!empire.vip_cancel,
    dailyNex: dailyNexOf(empire, db),
    bookmarkCap: bookmarkCap(empire, db),
    reportCap: reportCap(empire),
    speciesCdHours: isVip(empire) ? 24 : 48,
    freeRecallReady: freeRecallReady(empire),
    perks: VIP_PERKS,
    signet: !!empire.signet,
  };
}

function decorateShopItem(item) {
  return { ...item, eur: nexToEurLabel(item.cost) };
}

function publicShop(db) {
  const species = require("./species");
  const s = db ? require("./settings").get(db) : {};
  return {
    items: Object.values(SHOP).map(decorateShopItem),
    packs: PACKS.map((p) => ({ ...p, eur: eurFromCents(p.eurCents) })),
    plans: PLANS.map((p) => ({ ...p, eur: eurFromCents(p.eurCents), perks: VIP_PERKS })),
    changeCost: species.CHANGE_COST,
    changeCdHours: species.CHANGE_CD / 3600000,
    daily: Number.isFinite(Number(s.dailyNex)) ? s.dailyNex : DAILY_NEX_FREE,
    dailyVip: Number.isFinite(Number(s.dailyNexVip)) ? s.dailyNexVip : DAILY_NEX_VIP,
    starter: Number.isFinite(Number(s.starterNex)) ? s.starterNex : species.STARTER_NEX,
    bookmarkFree: BOOKMARK_FREE,
    bookmarkVip: BOOKMARK_VIP,
    legal: {
      currencyNote:
        "Euro-Preise neben Nex folgen den CPC-Leitlinien 2025 zur Transparenz virtueller Währungen. Der Gegenwert richtet sich nach der kleinsten Packung.",
      noLoot:
        "Keine Lootboxen, kein Zufall: jedes Paket listet Inhalt und Euro-Preis. Ressourcen und die Aeon-Korvette sind optionales Pay-to-Progress — legal, weil der Inhalt feststeht (CPC 2025, kein Glücksspiel).",
      withdrawal:
        "Digitale Inhalte: 14 Tage Widerruf, solange die Leistung nicht begonnen hat. Mit ausdrücklichem Verlangen der sofortigen Ausführung erlischt das Widerrufsrecht (§ 356 Abs. 5 BGB).",
      age: "Käufe und Abos sind nur für Personen ab 18 Jahren.",
      sub:
        "Nexus-Pass verlängert sich in der Testphase nicht automatisch. Kündigung wirkt zum Ende der bezahlten Laufzeit. Preise inkl. MwSt., sofern anfallend.",
      demo: "Zahlungsdienstleister folgt. Bis dahin ist der Kauf eine Testgutschrift ohne echten Einzug.",
    },
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function claimDaily(db, empire) {
  const day = todayKey();
  if ((empire.last_nex || "") === day) throw new Error("Heutige Nex bereits abgeholt.");
  const amount = dailyNexOf(empire, db);
  db.prepare("UPDATE empires SET nex = IFNULL(nex,0) + ?, last_nex = ? WHERE id = ?").run(amount, day, empire.id);
  return amount;
}

function assertCheckout(opts) {
  if (!opts?.ageConfirm) throw new Error("Bitte bestätigen: du bist mindestens 18 Jahre alt.");
  if (!opts?.waiveWithdrawal) {
    throw new Error("Für die sofortige Gutschrift musst du den Hinweis zum Widerrufsrecht bestätigen.");
  }
}

function recordPurchase(db, empire, kind, sku, nex, eurCents) {
  db.prepare(
    `INSERT INTO purchases(user_id, empire_id, kind, sku, nex, eur_cents, status, created_at)
     VALUES(?, ?, ?, ?, ?, ?, 'done', ?)`
  ).run(empire.user_id, empire.id, kind, sku, nex || 0, eurCents || 0, Date.now());
}

function buyPack(db, empire, sku, opts) {
  assertCheckout(opts);
  const pack = PACKS.find((p) => p.id === sku);
  if (!pack) throw new Error("Unbekanntes Nex-Paket.");
  db.prepare("UPDATE empires SET nex = IFNULL(nex,0) + ? WHERE id = ?").run(pack.nex, empire.id);
  recordPurchase(db, empire, "pack", pack.id, pack.nex, pack.eurCents);
  return { nex: pack.nex, eur: eurFromCents(pack.eurCents), name: pack.name };
}

function buyShipCapBoost(db, empire) {
  assertCheckout({});
  const until = Date.now() + 24 * 60 * 60 * 1000;
  db.prepare("UPDATE empires SET ship_cap_boost_until = ? WHERE id = ?").run(until, empire.id);
  recordPurchase(db, empire, "comfort", "ship_cap_boost", 20, 0);
  return { until, name: SHOP.ship_cap_boost.name };
}

function subscribe(db, empire, sku, opts) {
  assertCheckout(opts);
  const plan = PLANS.find((p) => p.id === sku);
  if (!plan) throw new Error("Unbekannter Pass.");
  const now = Date.now();
  const base = Math.max(now, Number(empire.vip_until) || 0);
  const until = base + plan.days * 24 * 60 * 60 * 1000;
  db.prepare("UPDATE empires SET vip_until = ?, vip_plan = ?, vip_cancel = 0, vip_started = ? WHERE id = ?").run(
    until,
    plan.id,
    empire.vip_started || now,
    empire.id
  );
  recordPurchase(db, empire, "vip", plan.id, 0, plan.eurCents);
  return { until, plan: plan.id, eur: eurFromCents(plan.eurCents), name: plan.name };
}

function cancelVip(db, empire) {
  if (!isVip(empire)) throw new Error("Kein aktiver Nexus-Pass.");
  db.prepare("UPDATE empires SET vip_cancel = 1 WHERE id = ?").run(empire.id);
  return { until: empire.vip_until };
}

function grantVipDays(db, empire, days) {
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const now = Date.now();
  const base = Math.max(now, Number(empire.vip_until) || 0);
  const until = base + d * 24 * 60 * 60 * 1000;
  db.prepare("UPDATE empires SET vip_until = ?, vip_plan = ?, vip_cancel = 0 WHERE id = ?").run(until, "pass30", empire.id);
  return until;
}

function markVipRecall(db, empire) {
  db.prepare("UPDATE empires SET last_vip_recall = ? WHERE id = ?").run(Date.now(), empire.id);
}

module.exports = {
  DAILY_NEX_FREE,
  DAILY_NEX_VIP,
  BOOKMARK_FREE,
  BOOKMARK_VIP,
  RUSH_CD,
  PACKS,
  PLANS,
  SHOP,
  VIP_PERKS,
  eurFromCents,
  nexToEurLabel,
  isVip,
  dailyNexOf,
  bookmarkCap,
  reportCap,
  speciesCdMs,
  freeRecallReady,
  publicVip,
  publicShop,
  claimDaily,
  buyPack,
  subscribe,
  cancelVip,
  grantVipDays,
  markVipRecall,
  buyShipCapBoost,
};
