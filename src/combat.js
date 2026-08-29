"use strict";

const { SHIPS, DEFENSES, SHIP_VS } = require("./catalog");

function shipAdv(atk, def) {
  return SHIP_VS[atk]?.[def] ?? 1;
}

function defAdv(defId, shipId) {
  return DEFENSES[defId]?.vs?.[shipId] ?? 1;
}

function countMap(m) {
  let n = 0;
  for (const v of Object.values(m || {})) n += v;
  return n;
}

function shipWeaponMul(id, techs) {
  let m = 1 + 0.08 * (techs.weapons || 0) + 0.04 * (techs.ai || 0);
  if (id === "fighter" || id === "interceptor" || id === "aeon") m += 0.05 * (techs.laser_tech || 0);
  if (id === "bomber" || id === "battleship") m += 0.05 * (techs.plasma_tech || 0);
  if (id === "destroyer" || id === "dreadnought") m += 0.05 * (techs.graviton || 0);
  if (id === "helix") m += 0.05 * (techs.graviton || 0) + 0.04 * (techs.ai || 0);
  if (id === "carrier") m += 0.03 * (techs.laser_tech || 0) + 0.03 * (techs.ai || 0);
  return m;
}

function defWeaponMul(id, techs) {
  let m = 1;
  if (id === "laser" || id === "pd") m += 0.05 * (techs.laser_tech || 0);
  if (id === "plasma" || id === "disruptor") m += 0.05 * (techs.plasma_tech || 0);
  if (id === "orbital" || id === "gauss") m += 0.05 * (techs.graviton || 0);
  if (id === "ion") m += 0.04 * (techs.weapons || 0);
  return m;
}

function avgShipAdv(atkId, defShips, defenses) {
  let w = 0;
  let t = 0;
  for (const [id, n] of Object.entries(defShips || {})) {
    if (n <= 0) continue;
    w += shipAdv(atkId, id) * n;
    t += n;
  }
  for (const [id, n] of Object.entries(defenses || {})) {
    if (n <= 0) continue;
    const inv = 1 / Math.max(0.22, defAdv(id, atkId));
    w += inv * n;
    t += n;
  }
  return t ? w / t : 1;
}

function avgDefAdv(defId, atkShips) {
  let w = 0;
  let t = 0;
  for (const [id, n] of Object.entries(atkShips || {})) {
    if (n <= 0) continue;
    w += defAdv(defId, id) * n;
    t += n;
  }
  return t ? w / t : 1;
}

function shipPower(ships, techs, hullBonus, vsDefShips, vsDefenses) {
  let attack = 0;
  let hp = 0;
  let count = 0;
  for (const [id, n] of Object.entries(ships || {})) {
    if (n <= 0 || !SHIPS[id]) continue;
    const s = SHIPS[id];
    const adv = avgShipAdv(id, vsDefShips, vsDefenses);
    count += n;
    attack += s.attack * n * adv * shipWeaponMul(id, techs) * (techs.specAtk || 1);
    hp += (s.hull + s.shield) * n * (1 + 0.08 * (techs.armor || 0)) * (1 + 0.06 * (techs.shields || 0)) * (1 + hullBonus) * (techs.specHull || 1);
  }
  return { attack, hp, count };
}

function defensePower(defenses, atkShips, techs) {
  let attack = 0;
  let hp = 0;
  let count = 0;
  const t = techs || {};
  for (const [id, n] of Object.entries(defenses || {})) {
    if (n <= 0 || !DEFENSES[id]) continue;
    const d = DEFENSES[id];
    const adv = avgDefAdv(id, atkShips);
    count += n;
    attack += d.attack * n * adv * defWeaponMul(id, t);
    hp += (d.hull + d.shield) * n * (1 + 0.04 * (t.armor || 0) + 0.05 * (t.shields || 0));
  }
  return { attack, hp, count };
}

function applyLosses(map, ratio) {
  const survivors = {};
  const lost = {};
  for (const [id, n] of Object.entries(map || {})) {
    const dead = Math.round(n * ratio);
    const left = Math.max(0, n - dead);
    if (left) survivors[id] = left;
    if (dead) lost[id] = dead;
  }
  return { survivors, lost };
}

function simulate(atkShips, atkTechs, defShips, defTechs, defenses, platformHp, hullBonus) {
  const a0 = shipPower(atkShips, atkTechs, hullBonus || 0, defShips, defenses);
  const dShip = shipPower(defShips, defTechs || {}, 0, atkShips, {});
  const dDef = defensePower(defenses, atkShips, defTechs || {});
  const dHp = dShip.hp + dDef.hp + (platformHp || 0);
  const dAtk = dShip.attack + dDef.attack;
  if (a0.count === 0) {
    return {
      winner: "defender",
      atkLost: atkShips,
      defLost: {},
      defLostDefense: {},
      atkSurvivors: {},
      defSurvivors: defShips,
      defSurvivorsDefense: defenses || {},
    };
  }
  if (dShip.count + dDef.count === 0 && (platformHp || 0) <= 0) {
    return {
      winner: "attacker",
      atkLost: {},
      defLost: {},
      defLostDefense: {},
      atkSurvivors: atkShips,
      defSurvivors: {},
      defSurvivorsDefense: {},
    };
  }
  const atkRatio = Math.max(0, Math.min(1, dAtk / Math.max(1, a0.hp)));
  const defRatio = Math.max(0, Math.min(1, a0.attack / Math.max(1, dHp)));
  const a = applyLosses(atkShips, atkRatio);
  const ds = applyLosses(defShips, defRatio);
  const dd = applyLosses(defenses, defRatio * 0.9);
  const atkLeft = shipPower(a.survivors, atkTechs, hullBonus || 0, ds.survivors, dd.survivors).hp;
  const defLeft =
    shipPower(ds.survivors, defTechs || {}, 0, a.survivors, {}).hp +
    defensePower(dd.survivors, a.survivors, defTechs || {}).hp +
    (platformHp || 0) * (1 - defRatio);
  const winner = atkLeft > defLeft ? "attacker" : defLeft > atkLeft ? "defender" : a0.attack >= dAtk ? "attacker" : "defender";
  return {
    winner,
    atkLost: a.lost,
    defLost: ds.lost,
    defLostDefense: dd.lost,
    atkSurvivors: a.survivors,
    defSurvivors: ds.survivors,
    defSurvivorsDefense: dd.survivors,
    atkPower: Math.round(a0.attack),
    defPower: Math.round(dAtk),
  };
}

function preview(atkShips, defShips, defenses, atkTechs, defTechs, platformHp, hullBonus) {
  return simulate(atkShips, atkTechs || {}, defShips, defTechs || {}, defenses, platformHp, hullBonus);
}

function mergeMaps(a, b) {
  const o = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v;
  return o;
}

function simulateGroups(atkGroups, defShips, defTechs, defenses, platformHp) {
  const groups = (atkGroups || []).map((g) => ({
    ships: g.ships || {},
    techs: g.techs || {},
    hullBonus: g.hullBonus || 0,
  }));
  if (groups.length <= 1) {
    const g = groups[0] || { ships: {}, techs: {}, hullBonus: 0 };
    const one = simulate(g.ships, g.techs, defShips, defTechs, defenses, platformHp, g.hullBonus);
    return {
      ...one,
      groups: [{ lost: one.atkLost || {}, survivors: one.atkSurvivors || {} }],
    };
  }
  let mergedAtk = {};
  for (const g of groups) mergedAtk = mergeMaps(mergedAtk, g.ships);
  let aAtk = 0;
  let aHp = 0;
  let aCount = 0;
  for (const g of groups) {
    const p = shipPower(g.ships, g.techs, g.hullBonus, defShips, defenses);
    aAtk += p.attack;
    aHp += p.hp;
    aCount += p.count;
  }
  const dShip = shipPower(defShips, defTechs || {}, 0, mergedAtk, {});
  const dDef = defensePower(defenses, mergedAtk, defTechs || {});
  const dHp = dShip.hp + dDef.hp + (platformHp || 0);
  const dAtk = dShip.attack + dDef.attack;
  if (aCount === 0) {
    return {
      winner: "defender",
      atkLost: mergedAtk,
      defLost: {},
      defLostDefense: {},
      atkSurvivors: {},
      defSurvivors: defShips,
      defSurvivorsDefense: defenses || {},
      atkPower: 0,
      defPower: Math.round(dAtk),
      groups: groups.map((g) => ({ lost: g.ships, survivors: {} })),
    };
  }
  if (dShip.count + dDef.count === 0 && (platformHp || 0) <= 0) {
    return {
      winner: "attacker",
      atkLost: {},
      defLost: {},
      defLostDefense: {},
      atkSurvivors: mergedAtk,
      defSurvivors: {},
      defSurvivorsDefense: {},
      atkPower: Math.round(aAtk),
      defPower: 0,
      groups: groups.map((g) => ({ lost: {}, survivors: g.ships })),
    };
  }
  const atkRatio = Math.max(0, Math.min(1, dAtk / Math.max(1, aHp)));
  const defRatio = Math.max(0, Math.min(1, aAtk / Math.max(1, dHp)));
  const split = groups.map((g) => {
    const a = applyLosses(g.ships, atkRatio);
    return { lost: a.lost, survivors: a.survivors };
  });
  let atkLost = {};
  let atkSurvivors = {};
  for (const s of split) {
    atkLost = mergeMaps(atkLost, s.lost);
    atkSurvivors = mergeMaps(atkSurvivors, s.survivors);
  }
  const ds = applyLosses(defShips, defRatio);
  const dd = applyLosses(defenses, defRatio * 0.9);
  let atkLeftHp = 0;
  groups.forEach((g, i) => {
    atkLeftHp += shipPower(split[i].survivors, g.techs, g.hullBonus, ds.survivors, dd.survivors).hp;
  });
  const defLeft =
    shipPower(ds.survivors, defTechs || {}, 0, atkSurvivors, {}).hp +
    defensePower(dd.survivors, atkSurvivors, defTechs || {}).hp +
    (platformHp || 0) * (1 - defRatio);
  const winner = atkLeftHp > defLeft ? "attacker" : defLeft > atkLeftHp ? "defender" : aAtk >= dAtk ? "attacker" : "defender";
  return {
    winner,
    atkLost,
    defLost: ds.lost,
    defLostDefense: dd.lost,
    atkSurvivors,
    defSurvivors: ds.survivors,
    defSurvivorsDefense: dd.survivors,
    atkPower: Math.round(aAtk),
    defPower: Math.round(dAtk),
    groups: split,
  };
}

module.exports = { simulate, preview, simulateGroups, shipAdv, defAdv };
