// Pure colony configuration. Keeping this separate makes placement and visual
// rules testable without booting the complete game client.
export const CITY_PLOTS = Object.freeze([
  { id: "command", x: 50, y: 54, mx: 50, my: 72, view: "infra", building: "command", short: "Nexus", size: "capital", art: "command" },
  { id: "shipyard", x: 54.9, y: 68.0, mx: 55.7, my: 87.0, view: "yard", building: "shipyard", short: "Schiffsbau", size: "large", art: "yard" },
  { id: "uplink", x: 45.1, y: 68.0, mx: 44.3, my: 87.0, view: "infra", building: "uplink", short: "Kri-Mine", size: "mini", art: "small" },
  { id: "jumpgate", x: 36.6, y: 64.3, mx: 34.4, my: 83.0, view: "infra", building: "jumpgate", short: "Sprungtor", size: "medium", art: "yard" },
  { id: "archive", x: 31.6, y: 57.8, mx: 28.7, my: 76.0, view: "research", building: "archive", short: "Labor", size: "large", art: "science" },
  { id: "matter_mine", x: 31.6, y: 50.2, mx: 28.7, my: 68.0, view: "infra", building: "matter_mine", short: "Met-Mine", size: "mini", art: "small" },
  { id: "shield", x: 34.1, y: 41.8, mx: 31.6, my: 58.9, view: "infra", building: "shield", short: "Schild", size: "medium", art: "defense" },
  { id: "robotics", x: 44.2, y: 37.4, mx: 43.3, my: 54.1, view: "infra", building: "robotics", short: "Robotik", size: "medium", art: "major" },
  { id: "fusion", x: 55.8, y: 37.4, mx: 56.7, my: 54.1, view: "infra", building: "fusion", short: "Fusion", size: "medium", art: "major" },
  { id: "energy_array", x: 63.4, y: 43.7, mx: 65.6, my: 61.0, view: "infra", building: "energy_array", short: "Energie", size: "large", art: "major" },
  { id: "silo", x: 68.4, y: 50.2, mx: 71.3, my: 68.0, view: "infra", building: "silo", short: "Lager", size: "medium", art: "utility" },
  { id: "quantum_lab", x: 68.4, y: 57.8, mx: 71.3, my: 76.0, view: "research", building: "quantum_lab", short: "Labor+", size: "medium", art: "science" },
  { id: "citadel", x: 63.4, y: 64.3, mx: 65.6, my: 83.0, view: "infra", building: "citadel", short: "Zitadelle", size: "large", art: "defense", zone: "def" },
  { id: "defense_hub", x: 57.4, y: 74.8, mx: 58.3, my: 92.0, view: "defense", building: "defense_hub", short: "Verteid.", size: "large", art: "defense", zone: "def" },
  { id: "colony_dock", x: 42.6, y: 74.8, mx: 41.7, my: 92.0, view: "infra", building: "colony_dock", short: "Dock", size: "micro", art: "yard" },
  { id: "beacon", x: 29.8, y: 69.2, mx: 27.4, my: 88.3, view: "infra", building: "beacon", short: "Bake", size: "micro", art: "utility" },
  { id: "spy_center", x: 22.5, y: 59.6, mx: 19.1, my: 78.0, view: "infra", building: "spy_center", short: "Spionage", size: "micro", art: "science" },
  { id: "diamond_forge", x: 22.5, y: 48.4, mx: 19.1, my: 66.0, view: "infra", building: "diamond_forge", short: "Diamant", size: "mini", art: "small" },
  { id: "nanite", x: 70.2, y: 38.8, mx: 72.6, my: 55.7, view: "yard", building: "nanite", short: "Naniten", size: "medium", art: "major" },
  { id: "titan_extractor", x: 77.5, y: 48.4, mx: 80.9, my: 66.0, view: "infra", building: "titan_extractor", short: "Titan", size: "mini", art: "small" },
  { id: "helium_well", x: 77.5, y: 59.6, mx: 80.9, my: 78.0, view: "infra", building: "helium_well", short: "Helium", size: "mini", art: "small" },
  { id: "habitat", x: 70.2, y: 69.2, mx: 72.6, my: 88.3, view: "infra", building: "habitat", short: "Habitat", size: "micro", art: "utility" },
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
