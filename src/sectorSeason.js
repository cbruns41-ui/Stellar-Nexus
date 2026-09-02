"use strict";

const ANCHOR = Date.UTC(2026, 0, 5);
const LENGTH = 14 * 86400000;
const TIERS = [
  { score: 100, reward: { metal: 900, energy: 600, crystal: 250, helium: 180, titan: 0, diamond: 4 } },
  { score: 300, reward: { metal: 1800, energy: 1200, crystal: 600, helium: 450, titan: 180, diamond: 10 } },
  { score: 700, reward: { metal: 3500, energy: 2200, crystal: 1200, helium: 900, titan: 450, diamond: 22 } },
];

function windowAt(now = Date.now()) {
  const index = Math.max(0, Math.floor((now - ANCHOR) / LENGTH));
  const start = ANCHOR + index * LENGTH;
  return { id: `S${index + 1}`, index, start, end: start + LENGTH };
}

function data(db, empire) {
  const season = windowAt();
  const combat = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id=? AND kind='combat' AND created_at>=? AND json_extract(body,'$.youWin')=1").get(empire.id, season.start).n;
  const expeditions = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id=? AND kind='expedition' AND created_at>=?").get(empire.id, season.start).n;
  const colonies = db.prepare("SELECT COUNT(*) AS n FROM planets WHERE empire_id=? AND IFNULL(alliance_id,0)=0 AND founded_at>=?").get(empire.id, season.start).n;
  const bossDamage = db.prepare("SELECT COALESCE(SUM(damage),0) AS n FROM alliance_boss_hits WHERE empire_id=? AND created_at>=?").get(empire.id, season.start).n;
  const score = combat * 24 + expeditions * 12 + colonies * 120 + Math.floor(Number(bossDamage || 0) / 250);
  const claimed = new Set(db.prepare("SELECT tier FROM sector_season_claims WHERE empire_id=? AND season_id=?").all(empire.id, season.id).map((r) => r.tier));
  return {
    ...season, score, combat, expeditions, colonies, bossDamage: Number(bossDamage || 0),
    tiers: TIERS.map((tier, i) => ({ ...tier, tier: i + 1, ready: score >= tier.score, claimed: claimed.has(i + 1) })),
  };
}

function claim(db, empire, planet, tierNumber) {
  const season = data(db, empire);
  const tier = season.tiers.find((x) => x.tier === Number(tierNumber));
  if (!tier) throw new Error("Saison-Meilenstein unbekannt.");
  if (tier.claimed) throw new Error("Meilenstein bereits abgeholt.");
  if (!tier.ready) throw new Error("Noch nicht genügend Sektorpunkte.");
  if (!planet || planet.empire_id !== empire.id || planet.alliance_id) throw new Error("Belohnung benötigt einen persönlichen Fokus-Planeten.");
  const r = tier.reward;
  db.prepare("UPDATE planets SET metal=metal+?,energy=energy+?,crystal=crystal+?,helium=helium+?,titan=titan+?,diamond=diamond+? WHERE id=?").run(r.metal,r.energy,r.crystal,r.helium,r.titan,r.diamond,planet.id);
  db.prepare("INSERT INTO sector_season_claims(empire_id,season_id,tier,claimed_at) VALUES(?,?,?,?)").run(empire.id, season.id, tier.tier, Date.now());
  return tier;
}

module.exports = { windowAt, data, claim, TIERS };
