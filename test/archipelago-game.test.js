"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDb } = require("../src/db");
const game = require("../src/game");
const { withTx } = require("../src/tx");
const { ensurePlayer } = require("../src/seed");
const { ensureOpenGalaxies, galaxyLayout, GALAXY_REGIONS } = require("../src/galaxy");

const SMALL_RINGS = [
  { r: 0, count: 1, ring: 0, hub: true },
  { r: 220, count: 8, ring: 1, hubs: 1 },
  { r: 520, count: 10, ring: 3, hubs: 1 },
  { r: 940, count: 12, ring: 5, hubs: 2 },
];

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-arch-"));
  const db = openDb(path.join(dir, "test.db"));
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  ensurePlayer(db, "Pilot", "secret123", "Pilot Empire", "#00ffff");
  const empire = db.prepare("SELECT * FROM empires LIMIT 1").get();
  const home = db.prepare("SELECT * FROM planets WHERE empire_id=?").get(empire.id);
  db.prepare("UPDATE planets SET helium=50000,metal=8000,energy=8000,titan=4000 WHERE id=?").run(home.id);
  return { db, empire, home: db.prepare("SELECT * FROM planets WHERE id=?").get(home.id) };
}

test("same-galaxy travel stays local and does not invent a jump", (t) => {
  const { db, empire, home } = fixture(t);
  game.addShips(db, home.id, { fighter: 2 });
  const target = db.prepare("SELECT * FROM planets WHERE empire_id IS NULL AND system_id!=? LIMIT 1").get(home.system_id);
  const preview = game.previewTravel(db, empire, home, target, { fighter: 1 });
  assert.equal(preview.jumps, 0);
  assert.equal(preview.intergalactic, false);
  assert.ok(preview.ms >= 300000);
  assert.equal(preview.fuelNeeded, preview.segments[0].fuel);
});

test("cross-galaxy travel uses gates, never a straight line, and needs warp", (t) => {
  const { db, empire, home } = fixture(t);
  ensureOpenGalaxies(db, 3, { rings: SMALL_RINGS, planetSpan: 2 });
  const homeSys = db.prepare("SELECT * FROM systems WHERE id=?").get(home.system_id);
  assert.equal(homeSys.galaxy_id, 0);
  const foreign = db.prepare("SELECT p.* FROM planets p JOIN systems s ON s.id=p.system_id WHERE s.galaxy_id=1 AND s.id NOT IN (SELECT system_id FROM jump_gates) LIMIT 1").get();
  assert.ok(foreign);
  game.addShips(db, home.id, { probe: 2 });
  assert.throws(() => game.previewTravel(db, empire, home, foreign, { probe: 1 }), /Warp/);
  db.prepare("INSERT INTO research(empire_id,tech_id,level) VALUES(?,?,?)").run(empire.id, "warp", 18);
  const preview = game.previewTravel(db, empire, home, foreign, { probe: 1 });
  assert.ok(preview.jumps >= 1);
  assert.equal(preview.intergalactic, true);
  assert.ok(preview.ms >= 15 * 60 * 1000);
  assert.ok(preview.segments.some((s) => s.kind === "jump"));
  assert.ok(preview.segments.some((s) => s.kind === "local"));
  const layout = galaxyLayout(homeSys, GALAXY_REGIONS[0]);
  assert.notEqual(layout.x, homeSys.x);
  withTx(db, () => game.sendFleet(db, empire, home, foreign, "spy", { probe: 1 }, {}));
  const fleet = db.prepare("SELECT * FROM fleets WHERE empire_id=? ORDER BY id DESC LIMIT 1").get(empire.id);
  assert.equal(fleet.target_planet_id, foreign.id);
  assert.ok(fleet.arrives_at - fleet.departed_at >= 15 * 60 * 1000);
});

test("jump gates cannot be colonized or attacked", (t) => {
  const { db, empire, home } = fixture(t);
  ensureOpenGalaxies(db, 3, { rings: SMALL_RINGS, planetSpan: 2 });
  const gatePlanet = db
    .prepare(
      "SELECT p.* FROM planets p JOIN jump_gates g ON g.system_id=p.system_id WHERE p.empire_id IS NULL LIMIT 1"
    )
    .get();
  assert.ok(gatePlanet);
  game.addShips(db, home.id, { fighter: 2, colony: 1, probe: 1 });
  db.prepare("INSERT INTO research(empire_id,tech_id,level) VALUES(?,?,?)").run(empire.id, "warp", 18);
  assert.throws(() => game.sendFleet(db, empire, home, gatePlanet, "colonize", { colony: 1 }, {}), /Sprungtore/);
  assert.throws(() => game.sendFleet(db, empire, home, gatePlanet, "attack", { fighter: 1 }, {}), /Sprungtore/);
  assert.throws(() => game.sendFleet(db, empire, home, gatePlanet, "spy", { probe: 1 }, {}), /Sprungtore/);
});

test("new homes stay in Aurelia after other galaxies open", (t) => {
  const { db } = fixture(t);
  ensureOpenGalaxies(db, 3, { rings: SMALL_RINGS, planetSpan: 2 });
  const empireId = Number(
    db.prepare("INSERT INTO empires(user_id,name,color,created_at,species,nex) VALUES(?,?,?,?, 'terran', 0)").run(
      db.prepare("INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)").run("Other", "x", Date.now()).lastInsertRowid,
      "Other",
      "#ffaa00",
      Date.now()
    ).lastInsertRowid
  );
  const planetId = game.assignHome(db, empireId, "Other");
  const sys = db.prepare("SELECT s.galaxy_id FROM planets p JOIN systems s ON s.id=p.system_id WHERE p.id=?").get(planetId);
  assert.equal(sys.galaxy_id, 0);
});
