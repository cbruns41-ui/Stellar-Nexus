import test from "node:test";
import assert from "node:assert/strict";
import {
  START_SALVAGE,
  WORK_PER_WAVE,
  TOWER_BASE,
  WEAPON_DEFS,
  weaponCost,
  weaponLimit,
  applyWeaponStats,
  killPayout,
  waveClearBonus,
  waveSpawnCount,
  waveHp,
} from "../public/js/orbit-economy.mjs";

test("starting salvage buys a laser and a mine in the same build phase", () => {
  assert.equal(START_SALVAGE, 160);
  assert.equal(WORK_PER_WAVE, 2);
  assert.ok(START_SALVAGE >= TOWER_BASE.laser + TOWER_BASE.mine);
  assert.ok(START_SALVAGE - TOWER_BASE.laser >= TOWER_BASE.mine);
});

test("kills pay more for heavies and player last hits, and scale with the wave", () => {
  assert.equal(killPayout({ wave: 1 }), 5);
  assert.equal(killPayout({ wave: 1, player: true }), 7);
  assert.equal(killPayout({ wave: 1, heavy: true }), 11);
  assert.equal(killPayout({ wave: 6, heavy: true, player: true }), 19);
  assert.ok(killPayout({ wave: 8, rocket: true }) < killPayout({ wave: 8, heavy: true }));
  assert.ok(killPayout({ wave: 10 }) > killPayout({ wave: 1 }));
});

test("wave pressure grows, but early fighters stay one-shot for the base cannon", () => {
  assert.equal(waveHp(1, false), 1);
  assert.ok(waveHp(4, false) <= 3);
  assert.ok(waveHp(10, true) > waveHp(4, true));
  assert.equal(waveSpawnCount(1), 7);
  assert.ok(waveSpawnCount(8) > waveSpawnCount(3));
  assert.ok(waveClearBonus(5) > waveClearBonus(1));
});

test("cannon passives do not share the tower work slot and unlock by held waves", () => {
  assert.equal(weaponLimit(WEAPON_DEFS[0], 0), 1);
  assert.equal(weaponLimit(WEAPON_DEFS[0], 2), 2);
  assert.equal(weaponCost(WEAPON_DEFS[0], 1) > weaponCost(WEAPON_DEFS[0], 0), true);
  const stats = applyWeaponStats({ dmg: 2, rate: 1, pierce: 1, missiles: 2 });
  assert.ok(stats.playerDmg > 1.5);
  assert.ok(stats.playerRate < 0.18);
  assert.equal(stats.playerPierce, 1);
  assert.equal(stats.playerMissiles, 2);
});
