// Shared Orbit-Feuer economy: kill payouts, wave pressure, passive cannon upgrades.
export const START_SALVAGE = 160;
export const WORK_PER_WAVE = 2;
export const TOWER_BASE = {
  laser: 70,
  mine: 35,
  flak: 75,
  silo: 80,
  gauss: 105,
  tesla: 120,
};
export const WEAPON_DEFS = [
  { id: "dmg", title: "SCHADEN", blurb: "Jeder Schuss trifft härter", cost: 50, max: 5, icon: "dmg" },
  { id: "rate", title: "FEUERRATE", blurb: "Die Kanone taktet schneller", cost: 55, max: 5, icon: "rate" },
  { id: "pierce", title: "DURCHSCHLAG", blurb: "Schüsse gehen durch weitere Ziele", cost: 70, max: 3, icon: "range" },
  { id: "missiles", title: "RAKETEN", blurb: "Begleitraketen neben dem Schuss", cost: 90, max: 3, icon: "missiles" },
];

export function weaponCost(def, level) {
  return Math.ceil(def.cost * Math.pow(1.45, Math.max(0, level)));
}

export function weaponLimit(def, heldWaves) {
  return Math.min(def.max, 1 + Math.floor(Math.max(0, heldWaves) / 2));
}

export function applyWeaponStats(levels = {}) {
  const dmg = Math.max(0, levels.dmg || 0);
  const rate = Math.max(0, levels.rate || 0);
  const pierce = Math.max(0, levels.pierce || 0);
  const missiles = Math.max(0, levels.missiles || 0);
  return {
    playerDmg: 1 + dmg * 0.32,
    playerRate: 0.18 * Math.pow(0.9, rate),
    playerPierce: pierce,
    playerMissiles: missiles,
  };
}

export function killPayout({ heavy = false, rocket = false, wave = 1, player = false } = {}) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  let n = rocket ? 3 + Math.floor(w / 4) : heavy ? 10 + w : 5 + Math.floor(w / 3);
  if (player) n += heavy ? 3 : rocket ? 1 : 2;
  return n;
}

export function waveClearBonus(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return 20 + Math.min(36, w * 4);
}

export function waveSpawnCount(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return 5 + w * 2 + Math.floor(w / 4);
}

export function waveHp(wave, heavy) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  if (heavy) return 3 + w + Math.floor(w * w * 0.035);
  return 1 + Math.floor((w - 1) * 0.5 + w * w * 0.012);
}

export function waveSpawnGap(wave) {
  return Math.max(0.22, 0.88 - Math.max(1, wave) * 0.026);
}
