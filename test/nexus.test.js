"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const premium = require("../src/premium");
const settings = require("../src/settings");

test("Nexus keeps ships and passes for Nex and rejects legacy cash purchases", () => {
  const shop = premium.publicShop();
  assert.deepEqual(shop.packs, []);
  assert.deepEqual(shop.plans, []);
  for (const id of ["aeon", "crate_fleet", "pass30", "pass90"]) {
    const item = shop.items.find(item => item.id === id);
    assert.ok(item.cost > 0);
    assert.equal(item.eur, undefined);
    assert.equal(item.eurCents, undefined);
  }
  assert.throws(() => premium.buyPack(), /deaktiviert/);
  assert.throws(() => premium.subscribe(), /deaktiviert/);
  const { buyNexItem } = require("../src/game");
  assert.throws(() => buyNexItem(null, { nex: 149 }, {}, "pass30", {}), /Kostet 150 Nex/);
  assert.throws(() => buyNexItem(null, { nex: 399 }, {}, "pass90", {}), /Kostet 400 Nex/);
});

test("donation settings persist and reject executable or insecure links", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE world_meta(key TEXT PRIMARY KEY, value TEXT)");
    assert.equal(premium.publicShop(db).donationUrl, "");
    settings.set(db, { donationUrl: "https://example.org/donate", donationText: "Serverkosten" });
    assert.equal(premium.publicShop(db).donationUrl, "https://example.org/donate");
    assert.equal(premium.publicShop(db).donationText, "Serverkosten");
    for (const url of ["javascript:alert(1)", "http://example.org", "https://user:password@example.org", "broken"]) {
      assert.throws(() => settings.set(db, { donationUrl: url }), /HTTPS/);
      assert.equal(premium.publicShop(db).donationUrl, "https://example.org/donate");
    }
    settings.set(db, { donationUrl: "" });
    assert.equal(premium.publicShop(db).donationUrl, "");
  } finally { db.close(); }
});
