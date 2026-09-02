"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { addShips, shipsMap, splitShipSurvivors, orbitFireReward } = require("../src/game");
const { withTx } = require("../src/tx");

test("returning ships are never discarded by a station capacity check", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ships (planet_id INTEGER, ship_id TEXT, count INTEGER, PRIMARY KEY (planet_id, ship_id))");
  db.prepare("INSERT INTO ships(planet_id, ship_id, count) VALUES(1, 'fighter', 20)").run();

  addShips(db, 1, { fighter: 7, bomber: 3 });

  assert.deepEqual(shipsMap(db, 1), { fighter: 27, bomber: 3 });
});

test("intercept losses are shared without creating or deleting extra ships", () => {
  const stationed = { fighter: 10, bomber: 2 };
  const allyA = { fighter: 5, bomber: 3 };
  const allyB = { fighter: 5 };
  const split = splitShipSurvivors([stationed, allyA, allyB], { fighter: 8, bomber: 2 });

  assert.equal(split.reduce((n, group) => n + (group.fighter || 0), 0), 12);
  assert.equal(split.reduce((n, group) => n + (group.bomber || 0), 0), 3);
  split.forEach((group, i) => {
    const original = [stationed, allyA, allyB][i];
    assert.ok((group.fighter || 0) <= (original.fighter || 0));
    assert.ok((group.bomber || 0) <= (original.bomber || 0));
  });
});

test("world operations can safely join an existing transaction", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE events (id INTEGER PRIMARY KEY)");
  withTx(db, () => {
    db.prepare("INSERT INTO events DEFAULT VALUES").run();
    withTx(db, () => db.prepare("INSERT INTO events DEFAULT VALUES").run());
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events").get().n, 2);
});

test("orbit fire loot is small, deterministic and score-capped", () => {
  assert.deepEqual(orbitFireReward(-5), { hits: 0, metal: 50, crystal: 3 });
  assert.deepEqual(orbitFireReward(12.9), { hits: 12, metal: 98, crystal: 7 });
  assert.deepEqual(orbitFireReward(999), { hits: 40, metal: 210, crystal: 16 });
});
