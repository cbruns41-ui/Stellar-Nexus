import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { CITY_PLOTS, colonyBuildingStatus } from "../public/js/city.mjs";
const { BUILDINGS } = createRequire(import.meta.url)("../src/catalog.js");
const catalog = { buildings: BUILDINGS };
const now = 100000;
const snapshot = (buildings = {}, queue = [], extra = {}) => ({
  planet: { id: 42, buildings, production: { metal: 20, energy: 30 }, storage: { metal: 100 }, metal: 25, ...extra }, queue,
});
const job = (kind, itemId, extra = {}) => ({ kind, itemId, planetId: 42, startedAt: now - 500, completesAt: now + 500, ...extra });
const status = (id, snap) => colonyBuildingStatus(id, snap, catalog, now);

test("all 22 catalog buildings have visible, distinct Unity geometry even at level zero", () => {
  assert.deepEqual(CITY_PLOTS.map(p => p.id).sort(), Object.keys(BUILDINGS).sort());
  const unity = JSON.parse(readFileSync(new URL("../unity-colony/Assets/Colony/Resources/colony-layout.json", import.meta.url)));
  for (const p of CITY_PLOTS) {
    const mesh = unity.plots.find(row => row.id === p.id);
    assert.deepEqual(mesh.outline, p.outline, p.id + " Unity polygon must match the approved artwork mapping");
    assert.equal(status(p.id, snapshot()).status, "dormant");
    assert.equal(status(p.id, snapshot()).level, 0);
    for (const point of p.outline) assert.ok(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
  }
});
test("shipyard sleeps without work and wakes only for this planet's current ship queue", () => {
  assert.equal(status("shipyard", snapshot({ shipyard: 3 })).idle, true);
  assert.equal(status("shipyard", snapshot({ shipyard: 3 }, [job("ship", "fighter", { planetId: 9 })])).idle, true);
  assert.equal(status("shipyard", snapshot({ shipyard: 3 }, [job("ship", "fighter", { startedAt: now + 100 })])).idle, true);
  assert.equal(status("shipyard", snapshot({ shipyard: 3 }, [job("ship", "fighter", { completesAt: now - 1 })])).idle, true);
  const working = status("shipyard", snapshot({ shipyard: 3 }, [job("ship", "fighter")]));
  assert.equal(working.active, true);
  assert.equal(working.progress, .5);
});
test("upgrades show progress while keeping the current level until server completion", () => {
  const before = status("shipyard", snapshot({ shipyard: 3 }, [job("building", "shipyard", { levelTo: 4 })]));
  assert.equal(before.level, 3);
  assert.equal(before.status, "upgrading");
  assert.equal(before.busy, true);
  const after = status("shipyard", snapshot({ shipyard: 4 }));
  assert.equal(after.level, 4);
  assert.equal(after.idle, true);
});
test("resource buildings report full storage and stopped production truthfully", () => {
  assert.equal(status("matter_mine", snapshot({ matter_mine: 2 })).active, true);
  assert.equal(status("matter_mine", snapshot({ matter_mine: 2 }, [], { metal: 100 })).statusLabel, "Lager voll");
  assert.equal(status("matter_mine", snapshot({ matter_mine: 2 }, [], { production: { metal: 0 } })).statusLabel, "Keine Produktion");
  assert.equal(status("matter_mine", snapshot({}, [], { metal: 100 })).status, "dormant");
});
test("support factories follow their actual game bonuses, research follows the empire", () => {
  const snap = snapshot({ robotics: 1, nanite: 1, archive: 1, quantum_lab: 1, colony_dock: 1, shield: 1 }, [job("research", "armor", { planetId: 9 })]);
  assert.equal(status("archive", snap).active, true);
  assert.equal(status("quantum_lab", snap).active, true);
  assert.equal(status("robotics", snap).idle, true);
  assert.equal(status("nanite", snap).idle, true);
  assert.equal(status("shield", snap).status, "ready");
  snap.queue = [job("defense", "laser")];
  assert.equal(status("nanite", snap).active, true);
  assert.equal(status("colony_dock", snap).idle, true);
  snap.queue = [job("ship", "colony")];
  assert.equal(status("colony_dock", snap).active, true);
});
