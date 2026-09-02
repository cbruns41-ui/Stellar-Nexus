// Pure colony configuration. Keeping this separate makes placement and visual
// rules testable without booting the complete game client.
export const CITY_PLOTS = Object.freeze([
  { id: "command", x: 50, y: 54, view: "infra", building: "command", short: "Nexus", size: "capital", art: "command" },
  { id: "citadel", x: 22, y: 31.5, view: "infra", building: "citadel", short: "Zitadelle", size: "medium", art: "defense", zone: "def" },
  { id: "archive", x: 74, y: 30.5, view: "research", building: "archive", short: "Labor", size: "medium", art: "science" },
  { id: "defense_hub", x: 21, y: 72, view: "defense", building: "defense_hub", short: "Verteid.", size: "medium", art: "defense", zone: "def" },
  { id: "shipyard", x: 75, y: 66, view: "yard", building: "shipyard", short: "Schiffsbau", size: "medium", art: "yard" },
  { id: "energy_array", x: 70.3, y: 29, view: "infra", building: "energy_array", short: "Energie", size: "medium", art: "major" },
  { id: "fusion", x: 18, y: 35, view: "infra", building: "fusion", short: "Fusion", size: "medium", art: "major" },
  { id: "shield", x: 14.7, y: 69, view: "infra", building: "shield", short: "Schild", size: "medium", art: "defense" },
  { id: "quantum_lab", x: 78.5, y: 35, view: "research", building: "quantum_lab", short: "Labor+", size: "medium", art: "science" },
  { id: "jumpgate", x: 68.5, y: 73, view: "infra", building: "jumpgate", short: "Sprungtor", size: "medium", art: "yard" },
  { id: "robotics", x: 19.4, y: 77.5, view: "infra", building: "robotics", short: "Robotik", size: "medium", art: "major" },
  { id: "nanite", x: 81, y: 73, view: "yard", building: "nanite", short: "Naniten", size: "medium", art: "major" },
  { id: "matter_mine", x: 24, y: 51, view: "infra", building: "matter_mine", short: "Met-Mine", size: "mini", art: "small" },
  { id: "helium_well", x: 42, y: 29.5, view: "infra", building: "helium_well", short: "Helium", size: "small", art: "small" },
  { id: "titan_extractor", x: 54.5, y: 23.5, view: "infra", building: "titan_extractor", short: "Titan", size: "mini", art: "small" },
  { id: "uplink", x: 65, y: 46.5, view: "infra", building: "uplink", short: "Kri-Mine", size: "micro", art: "small" },
  { id: "diamond_forge", x: 34.6, y: 74.5, view: "infra", building: "diamond_forge", short: "Diamant", size: "micro", art: "small" },
  { id: "silo", x: 26, y: 30.2, view: "infra", building: "silo", short: "Lager", size: "medium", art: "utility" },
  { id: "spy_center", x: 82, y: 49.5, view: "infra", building: "spy_center", short: "Spionage", size: "micro", art: "science" },
  { id: "beacon", x: 62, y: 22.5, view: "infra", building: "beacon", short: "Bake", size: "micro", art: "utility" },
  { id: "colony_dock", x: 31, y: 56, view: "infra", building: "colony_dock", short: "Dock", size: "micro", art: "yard" },
  { id: "habitat", x: 36.8, y: 77, view: "infra", building: "habitat", short: "Habitat", size: "micro", art: "utility" },
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
