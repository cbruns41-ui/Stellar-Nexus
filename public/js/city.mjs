// Coordinates refer to the approved colony artwork. Unity's layout is generated
// from this file by scripts/prepare-colony.mjs.
const plot = (id, short, x, y, size, view, outline) => Object.freeze({
  id, building: id, art: id, short, x, y, mx: x, my: y, size, view,
  outline: outline.map(([x, y]) => ({ x: x / 100, y: y / 100 })),
});

export const CITY_PLOTS = Object.freeze([
  plot("command", "Kommando-Nexus", 50, 47, "capital", "infra", [[42,39],[44,34],[50,31],[55,33],[58,39],[58,46],[52,51],[43,48]]),
  plot("shipyard", "Werft", 79.1, 43, "large", "yard", [[71,31],[77,27.5],[85,29],[88,34],[87,42],[81,45],[72,41]]),
  plot("colony_dock", "Kolonialdock", 66.6, 33, "large", "yard", [[59.3,28.8],[61.6,25.8],[62.7,20.2],[63.6,20.4],[64.6,24.1],[67,23.4],[69.6,25],[70.4,21.6],[71.4,21.7],[72.3,29.1],[70.7,34],[65.1,34.6],[59.3,31.5]]),
  plot("fusion", "Fusionsreaktor", 36.6, 31, "large", "infra", [[33,16],[41,16],[41.8,28],[39,33],[33,33],[32,26]]),
  plot("energy_array", "Energie-Array", 54.6, 29.8, "medium", "infra", [[49,23],[58,24],[60,28],[56,31],[48,29]]),
  plot("beacon", "Warp-Bake", 22.2, 36.8, "medium", "infra", [[20,16],[23,14],[25,20],[24,28],[27,34],[24,39],[18.5,36],[18.5,31],[20.5,28]]),
  plot("shield", "Schildgenerator", 45.7, 29.2, "micro", "infra", [[43.2,24.5],[46,22.6],[47.7,25],[47.8,29],[45,31],[42.6,28.5]]),
  plot("habitat", "Habitat", 36.8, 43.4, "medium", "infra", [[32.7,35],[36.3,32.6],[41.5,35.5],[41.8,41.2],[38.7,44.8],[32.8,43]]),
  plot("archive", "Forschungsarchiv", 25.4, 48, "medium", "research", [[20.8,40],[24,37.9],[29.1,40.4],[29.1,47.3],[26.9,50],[19.1,47.2],[18.8,43.5]]),
  plot("quantum_lab", "Quantenlabor", 64.5, 49.5, "medium", "research", [[59,40.8],[64.5,37.2],[67.4,40],[68,47.7],[65.6,51.5],[59,48]]),
  plot("robotics", "Robotikfabrik", 30.6, 55.6, "medium", "infra", [[27,46.5],[30.5,44],[33.6,46],[34.3,52.8],[32.5,56.8],[28,57],[25.5,54.1]]),
  plot("matter_mine", "Metall-Mine", 22.4, 81, "large", "infra", [[14.5,69],[19,65],[28,64.3],[31.8,71.9],[30,79],[24,86],[14,80]]),
  plot("titan_extractor", "Titan-Extraktor", 36.3, 63.5, "medium", "infra", [[32.7,55],[35.5,49.4],[37,49.7],[37.5,54],[39.2,54.5],[42.5,61],[37.8,65],[32,62.7]]),
  plot("diamond_forge", "Diamanten-Förderanlage", 54.3, 63, "medium", "infra", [[51.1,53.8],[54,53],[58.4,56],[59.2,61.2],[56.2,64.3],[50,62.4],[49.4,57]]),
  plot("uplink", "Kristallbohrer", 61.4, 68.8, "medium", "infra", [[59.3,60],[61.3,55.8],[63,57],[63.9,60.9],[66.5,65],[65.2,69.7],[59.3,70.6],[56.5,67.7]]),
  plot("helium_well", "Helium-3-Kollektor", 69.6, 85.4, "large", "infra", [[64.5,74],[65,70.5],[71.1,69.5],[76,73],[78.7,82.4],[73.8,88.5],[66,87],[61.1,82.2]]),
  plot("silo", "Speichervault", 72, 61, "medium", "infra", [[66.5,52],[71,49.9],[75.4,51],[78.5,55.8],[77.6,60.2],[71.2,63],[65.1,59.6]]),
  plot("spy_center", "Spionagezentrum", 81.8, 70.7, "medium", "infra", [[78.8,63],[80.2,56],[83.3,53.1],[83.1,62],[86.8,65],[87.6,70.7],[83.8,74.2],[76.3,70.6],[75.1,67.5]]),
  plot("jumpgate", "Sprungtor", 94.1, 59.2, "large", "infra", [[89.2,48.5],[92.5,42.5],[93.3,45],[95.5,45.4],[96,41.3],[97.5,42.9],[99,57.8],[94.8,61.8],[88.8,58.4]]),
  plot("nanite", "Naniten-Werft", 83.8, 53.6, "medium", "yard", [[79,47],[82.1,45.5],[84.2,42.1],[85.5,43],[84.7,46],[89.3,48.5],[89.5,52.9],[84.3,55.5],[78.3,51.9]]),
  plot("citadel", "Orbital-Zitadelle", 47.5, 79, "large", "defense", [[42.5,69.5],[44,65.4],[47.8,63.2],[51,66],[52,70],[54.5,75.5],[51.4,81.2],[44.8,82.6],[40.4,77]]),
  plot("defense_hub", "Verteidigungszentrum", 13.3, 61.8, "large", "defense", [[6.4,53.1],[10.3,50.6],[12.6,48.1],[14.8,51.4],[18.2,54.3],[20.9,59.4],[16,63.5],[9,63],[4.4,59.9]]),
]);

export function buildingLevelBand(level) {
  const value = Math.max(0, Number(level) || 0);
  if (value >= 15) return "elite";
  if (value >= 8) return "advanced";
  if (value >= 3) return "developed";
  return value > 0 ? "starter" : "dormant";
}

// Research bonuses apply empire-wide; other queues belong to their own planet.
export function colonyBuildingStatus(id, snap, catalog, now = Date.now()) {
  const p = snap?.planet;
  const level = Math.max(0, Number(p?.buildings?.[id]) || 0);
  const queue = (snap?.queue || []).filter(q => q.completesAt > now);
  const local = queue.filter(q => String(q.planetId) === String(p?.id));
  const upgrade = local.find(q => q.kind === "building" && q.itemId === id);
  const response = (status, statusLabel, job = null) => ({
    status, statusLabel, level, busy: !!upgrade, idle: status === "idle",
    active: status === "active", completesAt: job?.completesAt || 0,
    startedAt: job?.startedAt || 0,
    progress: job ? Math.max(0, Math.min(1, (now - job.startedAt) / Math.max(1, job.completesAt - job.startedAt))) : 0,
  });
  if (upgrade) return response("upgrading", `Ausbau auf Stufe ${upgrade.levelTo || level + 1}`, upgrade);
  if (!level) return response("dormant", "Nicht in Betrieb · Stufe 0");
  const resource = catalog?.buildings?.[id]?.resource;
  if (resource) {
    if (Number(p.storage?.[resource]) > 0 && Number(p[resource]) >= Number(p.storage[resource])) return response("idle", "Lager voll");
    return Number(p.production?.[resource]) > 0 ? response("active", "Produziert") : response("idle", "Keine Produktion");
  }
  let jobs;
  if (id === "shipyard") jobs = local.filter(q => q.kind === "ship");
  if (id === "colony_dock") jobs = local.filter(q => q.kind === "ship" && q.itemId === "colony");
  if (id === "nanite") jobs = local.filter(q => q.kind === "ship" || q.kind === "defense");
  if (id === "robotics") jobs = local.filter(q => q.kind === "building");
  if (id === "defense_hub") jobs = local.filter(q => q.kind === "defense");
  if (id === "archive" || id === "quantum_lab") jobs = queue.filter(q => q.kind === "research");
  if (jobs) {
    const job = jobs.find(q => q.startedAt <= now);
    return job ? response("active", id === "archive" || id === "quantum_lab" ? "Forscht" : "In Arbeit", job) : response("idle", "Kein Auftrag");
  }
  return response("ready", "Bereit");
}

export function validateCityPlots(plots = CITY_PLOTS) {
  const ids = new Set(), errors = [];
  for (const plot of plots) {
    if (!plot.id || ids.has(plot.id)) errors.push(`duplicate-or-missing:${plot.id || "?"}`);
    ids.add(plot.id);
    if (!(plot.x >= 0 && plot.x <= 100 && plot.y >= 0 && plot.y <= 100)) errors.push(`out-of-bounds:${plot.id}`);
    if (!plot.building || !plot.art || !plot.size || plot.outline?.length < 3) errors.push(`incomplete:${plot.id}`);
  }
  return errors;
}
