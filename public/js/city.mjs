// Pure colony configuration. Keeping this separate makes placement and visual
// rules testable without booting the complete game client.
export const CITY_PLOTS = Object.freeze([
  { id: "command", x: 50, y: 54, view: "infra", building: "command", short: "Nexus", size: "capital", art: "command" },
  { id: "citadel", x: 23, y: 38, view: "infra", building: "citadel", short: "Zitadelle", size: "large", art: "defense", zone: "def" },
  { id: "archive", x: 77, y: 38, view: "research", building: "archive", short: "Labor", size: "large", art: "science" },
  { id: "defense_hub", x: 16, y: 74, view: "defense", building: "defense_hub", short: "Verteid.", size: "large", art: "defense", zone: "def" },
  { id: "shipyard", x: 84, y: 73, view: "yard", building: "shipyard", short: "Schiffsbau", size: "large", art: "yard" },
  { id: "energy_array", x: 50, y: 91, view: "infra", building: "energy_array", short: "Energie", size: "large", art: "major" },
  { id: "fusion", x: 43, y: 29, view: "infra", building: "fusion", short: "Fusion", size: "medium", art: "major" },
  { id: "shield", x: 56, y: 29, view: "infra", building: "shield", short: "Schild", size: "medium", art: "defense" },
  { id: "quantum_lab", x: 66, y: 30, view: "research", building: "quantum_lab", short: "Labor+", size: "medium", art: "science" },
  { id: "jumpgate", x: 35, y: 32, view: "infra", building: "jumpgate", short: "Sprungtor", size: "medium", art: "yard" },
  { id: "robotics", x: 38, y: 43, view: "infra", building: "robotics", short: "Robotik", size: "medium", art: "major" },
  { id: "nanite", x: 62, y: 42, view: "yard", building: "nanite", short: "Naniten", size: "medium", art: "major" },
  { id: "matter_mine", x: 22, y: 55, view: "infra", building: "matter_mine", short: "Met-Mine", size: "mini", art: "small" },
  { id: "helium_well", x: 31, y: 55, view: "infra", building: "helium_well", short: "Helium", size: "mini", art: "small" },
  { id: "titan_extractor", x: 69, y: 53, view: "infra", building: "titan_extractor", short: "Titan", size: "mini", art: "small" },
  { id: "uplink", x: 80, y: 53, view: "infra", building: "uplink", short: "Kri-Mine", size: "mini", art: "small" },
  { id: "diamond_forge", x: 34, y: 73, view: "infra", building: "diamond_forge", short: "Diamant", size: "mini", art: "small" },
  { id: "silo", x: 66, y: 72, view: "infra", building: "silo", short: "Lager", size: "medium", art: "utility" },
  { id: "spy_center", x: 27, y: 86, view: "infra", building: "spy_center", short: "Spionage", size: "micro", art: "science" },
  { id: "beacon", x: 76, y: 84, view: "infra", building: "beacon", short: "Bake", size: "micro", art: "utility" },
  { id: "colony_dock", x: 41, y: 79, view: "infra", building: "colony_dock", short: "Dock", size: "micro", art: "yard" },
  { id: "habitat", x: 59, y: 79, view: "infra", building: "habitat", short: "Habitat", size: "micro", art: "utility" },
]);

export function buildingLevelBand(level) {
  const value = Math.max(0, Number(level) || 0);
  if (value >= 15) return "elite";
  if (value >= 8) return "advanced";
  if (value >= 3) return "developed";
  return value > 0 ? "starter" : "empty";
}

export function validateCityPlots(plots = CITY_PLOTS) {
  const ids = new Set();
  const errors = [];
  for (const plot of plots) {
    if (!plot.id || ids.has(plot.id)) errors.push(`duplicate-or-missing:${plot.id || "?"}`);
    ids.add(plot.id);
    if (!(plot.x >= 0 && plot.x <= 100 && plot.y >= 0 && plot.y <= 100)) errors.push(`out-of-bounds:${plot.id}`);
    if (!plot.building || !plot.art || !plot.size) errors.push(`incomplete:${plot.id}`);
  }
  return errors;
}
