import test from "node:test";
import assert from "node:assert/strict";
import { CITY_PLOTS, buildingLevelBand, validateCityPlots } from "../public/js/city.mjs";

test("city plot configuration is complete, unique and inside the map", () => {
  assert.equal(CITY_PLOTS.length, 22);
  assert.deepEqual(validateCityPlots(), []);
  assert.equal(new Set(CITY_PLOTS.map((plot) => plot.building)).size, CITY_PLOTS.length);
});

test("the command nexus remains the single capital in the centre", () => {
  const capitals = CITY_PLOTS.filter((plot) => plot.size === "capital");
  assert.equal(capitals.length, 1);
  assert.equal(capitals[0].id, "command");
  assert.ok(Math.abs(capitals[0].x - 50) <= 2);
  assert.ok(Math.abs(capitals[0].y - 54) <= 2);
});

test("building level bands progress predictably", () => {
  assert.equal(buildingLevelBand(0), "empty");
  assert.equal(buildingLevelBand(1), "starter");
  assert.equal(buildingLevelBand(3), "developed");
  assert.equal(buildingLevelBand(8), "advanced");
  assert.equal(buildingLevelBand(15), "elite");
});
