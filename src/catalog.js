"use strict";

const RESOURCES = {
  metal: { id: "metal", name: "Metall", short: "Met", color: "#d5dde6", hint: "Träger, Gebäude, Werften" },
  helium: { id: "helium", name: "Helium-3", short: "He3", color: "#2dd4bf", hint: "Treibstoff für Flotten und Warp" },
  titan: { id: "titan", name: "Titan", short: "Ti", color: "#7dd3fc", hint: "Panzerung und schwere Rümpfe" },
  energy: { id: "energy", name: "Energie", short: "En", color: "#3ee0ff", hint: "Reaktoren, Schilde, Arrays" },
  crystal: { id: "crystal", name: "Kristalle", short: "Kri", color: "#c084fc", hint: "Forschung, Elektronik, Sensorik" },
  diamond: { id: "diamond", name: "Diamanten", short: "Dia", color: "#67e8f9", hint: "Selten: Kolonien, Nexus, Kapital-Schiffe" },
};

const RESOURCE_IDS = Object.keys(RESOURCES);

/** Ein Universum-Tick: Flug, Verbundschlag und Ankunft rasten darauf ein. */
const TICK_MS = 5 * 60 * 1000;

const TECH_FOR_RESOURCE = {
  metal: "extraction",
  helium: "fuel_systems",
  titan: "metallurgy",
  energy: "energy_core",
  crystal: "data_arch",
  diamond: "nexus_protocol",
};

function emptyBag() {
  return { metal: 0, helium: 0, titan: 0, energy: 0, crystal: 0, diamond: 0 };
}

function bag(partial) {
  return { ...emptyBag(), ...partial };
}

function scaleBag(b, factor) {
  const out = emptyBag();
  for (const k of RESOURCE_IDS) out[k] = Math.floor((Number(b?.[k]) || 0) * factor);
  return out;
}

function addBags(a, b) {
  const out = emptyBag();
  for (const k of RESOURCE_IDS) out[k] = (Number(a?.[k]) || 0) + (Number(b?.[k]) || 0);
  return out;
}

function bagSum(b) {
  return RESOURCE_IDS.reduce((s, k) => s + (Number(b?.[k]) || 0), 0);
}

function scaledCost(base, factor, level) {
  return scaleBag(base, factor ** level);
}

const BUILDINGS = {
  command: {
    id: "command",
    name: "Kommando-Nexus",
    blurb: "Zentrale der Kolonie. Beschleunigt Bauten und schaltet Infrastruktur frei.",
    icon: "hex",
    baseCost: bag({ metal: 200, energy: 120, crystal: 16 }),
    baseTime: 70,
    factor: 1.58,
    max: 28,
    requires: {},
  },
  matter_mine: {
    id: "matter_mine",
    name: "Metall-Mine",
    blurb: "Bricht Erz für Rümpfe, Platten und Fundament.",
    icon: "mine",
    baseCost: bag({ metal: 55, energy: 22 }),
    baseTime: 42,
    factor: 1.58,
    max: 36,
    requires: {},
    resource: "metal",
    baseProd: 56,
  },
  helium_well: {
    id: "helium_well",
    name: "Helium-3-Kollektor",
    blurb: "Zapft Isotope für Antrieb und Sprungtriebwerke.",
    icon: "sun",
    baseCost: bag({ metal: 60, energy: 50, helium: 8 }),
    baseTime: 55,
    factor: 1.56,
    max: 36,
    requires: { buildings: { command: 1 } },
    resource: "helium",
    baseProd: 42,
  },
  titan_extractor: {
    id: "titan_extractor",
    name: "Titan-Extraktor",
    blurb: "Seltene Erze für Panzerung und Kapital-Schiffe.",
    icon: "wedge",
    baseCost: bag({ metal: 90, energy: 40, titan: 12 }),
    baseTime: 65,
    factor: 1.6,
    max: 34,
    requires: { buildings: { command: 2 } },
    resource: "titan",
    baseProd: 22,
  },
  energy_array: {
    id: "energy_array",
    name: "Energie-Array",
    blurb: "Sammelt stellare Strahlung und speichert Plasma.",
    icon: "sun",
    baseCost: bag({ metal: 50, energy: 18 }),
    baseTime: 42,
    factor: 1.58,
    max: 36,
    requires: {},
    resource: "energy",
    baseProd: 56,
  },
  uplink: {
    id: "uplink",
    name: "Kristallbohrer",
    blurb: "Destilliert Energiekristalle für Forschung und Sensorik.",
    icon: "nodes",
    baseCost: bag({ metal: 80, energy: 90, crystal: 18 }),
    baseTime: 65,
    factor: 1.6,
    max: 34,
    requires: { buildings: { command: 2 } },
    resource: "crystal",
    baseProd: 21,
  },
  diamond_forge: {
    id: "diamond_forge",
    name: "Diamanten-Förderanlage",
    blurb: "Quantum-Gitter. Teuer, langsam, unverzichtbar für Kolonien.",
    icon: "diamond",
    baseCost: bag({ metal: 160, energy: 90, titan: 40, crystal: 30, diamond: 4 }),
    baseTime: 90,
    factor: 1.68,
    max: 24,
    requires: { buildings: { command: 4, uplink: 2 } },
    resource: "diamond",
    baseProd: 2.4,
  },
  silo: {
    id: "silo",
    name: "Speichervault",
    blurb: "Erhöht die Lagerkapazität für alle Materialien.",
    icon: "silo",
    baseCost: bag({ metal: 120, energy: 55, titan: 10 }),
    baseTime: 60,
    factor: 1.5,
    max: 28,
    requires: { buildings: { command: 1 } },
  },
  shipyard: {
    id: "shipyard",
    name: "Werft",
    blurb: "Fertigt Sonden, Jäger und Kapital-Schiffe.",
    icon: "wedge",
    baseCost: bag({ metal: 200, energy: 140, titan: 35, helium: 20 }),
    baseTime: 90,
    factor: 1.6,
    max: 28,
    requires: { buildings: { command: 2 } },
  },
  archive: {
    id: "archive",
    name: "Forschungsarchiv",
    blurb: "Beschleunigt empireweite Forschung.",
    icon: "diamond",
    baseCost: bag({ metal: 130, energy: 180, crystal: 70 }),
    baseTime: 85,
    factor: 1.58,
    max: 28,
    requires: { buildings: { command: 2 } },
  },
  spy_center: {
    id: "spy_center",
    name: "Spionagezentrum",
    blurb: "Sensorik und Agentennetz. Ohne Zentrum keine neuen Sonden. Jede Stufe hebt die Erfolgschance, das gegnerische Zentrum senkt sie.",
    icon: "nodes",
    baseCost: bag({ metal: 80, energy: 100, crystal: 36 }),
    baseTime: 65,
    factor: 1.55,
    max: 20,
    requires: { buildings: { command: 1 } },
  },
  shield: {
    id: "shield",
    name: "Schildgenerator",
    blurb: "Planetare Verteidigung gegen einfliegende Flotten.",
    icon: "shield",
    baseCost: bag({ metal: 220, energy: 280, titan: 70, crystal: 40 }),
    baseTime: 100,
    factor: 1.62,
    max: 22,
    requires: { buildings: { command: 3 } },
  },
  defense_hub: {
    id: "defense_hub",
    name: "Verteidigungszentrum",
    blurb: "Stellung am Kamm. Von hier baust du Flak, Kanonen und Kuppeln — und jede Stufe beschleunigt den Batteriebau.",
    icon: "shield",
    baseCost: bag({ metal: 140, energy: 110, titan: 20, crystal: 16 }),
    baseTime: 72,
    factor: 1.56,
    max: 24,
    requires: { buildings: { command: 1 } },
  },
  beacon: {
    id: "beacon",
    name: "Warp-Bake",
    blurb: "Verkürzt Reisezeiten von diesem Planeten aus.",
    icon: "star",
    baseCost: bag({ metal: 260, energy: 340, titan: 80, crystal: 90, helium: 60, diamond: 10 }),
    baseTime: 120,
    factor: 1.65,
    max: 20,
    requires: { buildings: { command: 4 }, techs: { warp: 1 } },
  },
  colony_dock: {
    id: "colony_dock",
    name: "Kolonialdock",
    blurb: "Bereitet Siedlerflüge vor. Ohne Dock kein Kolonialschiff — und kein Start der Kolonisation von diesem Planeten.",
    icon: "wedge",
    baseCost: bag({ metal: 280, energy: 200, helium: 80, titan: 50, crystal: 60, diamond: 8 }),
    baseTime: 115,
    factor: 1.62,
    max: 18,
    requires: { buildings: { command: 3, shipyard: 2 }, techs: { colonization: 1 } },
  },
  robotics: {
    id: "robotics",
    name: "Robotikfabrik",
    blurb: "Drohnen beschleunigen Gebäudeausbauten auf diesem Planeten.",
    icon: "hex",
    baseCost: bag({ metal: 280, energy: 160, titan: 50, crystal: 40 }),
    baseTime: 110,
    factor: 1.62,
    max: 20,
    requires: { buildings: { command: 5, shipyard: 3 } },
  },
  fusion: {
    id: "fusion",
    name: "Fusionsreaktor",
    blurb: "Schwere Energiequelle. Spät, teuer, speist Schilde und Werften.",
    icon: "sun",
    baseCost: bag({ metal: 320, energy: 180, titan: 70, helium: 80, crystal: 30 }),
    baseTime: 130,
    factor: 1.6,
    max: 26,
    requires: { buildings: { command: 6, energy_array: 8 }, techs: { energy_core: 4 } },
    resource: "energy",
    baseProd: 92,
  },
  habitat: {
    id: "habitat",
    name: "Habitatdome",
    blurb: "Wohnringe und Lager. Hebt die Speicherkapazität stark an.",
    icon: "silo",
    baseCost: bag({ metal: 340, energy: 200, titan: 60, crystal: 50, diamond: 6 }),
    baseTime: 125,
    factor: 1.58,
    max: 22,
    requires: { buildings: { command: 5, silo: 4 } },
  },
  nanite: {
    id: "nanite",
    name: "Naniten-Werft",
    blurb: "Schwärme bauen Rümpfe. Schiff- und Verteidigungsbau wird deutlich schneller.",
    icon: "wedge",
    baseCost: bag({ metal: 480, energy: 360, titan: 140, crystal: 120, diamond: 18 }),
    baseTime: 160,
    factor: 1.68,
    max: 18,
    requires: { buildings: { shipyard: 8, robotics: 3 }, techs: { nanotech: 1 } },
  },
  quantum_lab: {
    id: "quantum_lab",
    name: "Quantenlabor",
    blurb: "Parallelisiert Forschung. Stapelt mit dem Archiv.",
    icon: "diamond",
    baseCost: bag({ metal: 260, energy: 320, crystal: 180, diamond: 10 }),
    baseTime: 140,
    factor: 1.66,
    max: 20,
    requires: { buildings: { archive: 6 }, techs: { data_arch: 4 } },
  },
  jumpgate: {
    id: "jumpgate",
    name: "Sprungtor",
    blurb: "Öffnet weit entfernte Systeme. Mehr Hops, kürzere Reisen von hier.",
    icon: "star",
    baseCost: bag({ metal: 720, energy: 640, titan: 220, helium: 200, crystal: 240, diamond: 36 }),
    baseTime: 200,
    factor: 1.72,
    max: 16,
    requires: { buildings: { command: 8, beacon: 3 }, techs: { hyperspace: 1 } },
  },
  citadel: {
    id: "citadel",
    name: "Orbital-Zitadelle",
    blurb: "Schwere Plattform. Extra Hülle für den ganzen Orbit, Grundlage für Orbitalgeschütze.",
    icon: "shield",
    baseCost: bag({ metal: 620, energy: 480, titan: 280, crystal: 140, diamond: 22 }),
    baseTime: 180,
    factor: 1.7,
    max: 16,
    requires: { buildings: { shield: 5, command: 6 }, techs: { armor: 3 } },
  },
};

const TECHS = {
  energy_core: {
    id: "energy_core",
    name: "Energiekerne",
    blurb: "+6% Energie-Ertrag je Stufe. Grundlage für Antrieb, Waffen und Schilde.",
    branch: "economy",
    baseCost: bag({ metal: 50, energy: 80, crystal: 50 }),
    baseTime: 70,
    factor: 1.78,
    max: 24,
    requires: { buildings: { archive: 1 } },
  },
  extraction: {
    id: "extraction",
    name: "Extraktionstechnik",
    blurb: "+6% Metall-Ertrag je Stufe.",
    branch: "economy",
    baseCost: bag({ metal: 70, energy: 30, crystal: 50 }),
    baseTime: 70,
    factor: 1.78,
    max: 24,
    requires: { buildings: { archive: 1 } },
  },
  fuel_systems: {
    id: "fuel_systems",
    name: "Isotop-Refining",
    blurb: "+6% Helium-3-Ertrag je Stufe. Braucht Energiekerne.",
    branch: "economy",
    baseCost: bag({ metal: 50, energy: 60, helium: 20, crystal: 40 }),
    baseTime: 75,
    factor: 1.7,
    max: 24,
    requires: { buildings: { archive: 1 }, techs: { energy_core: 1 } },
  },
  metallurgy: {
    id: "metallurgy",
    name: "Titan-Metallurgie",
    blurb: "+6% Titan-Ertrag je Stufe. Öffnet Rumpfpanzerung.",
    branch: "economy",
    baseCost: bag({ metal: 80, energy: 50, titan: 20, crystal: 50 }),
    baseTime: 80,
    factor: 1.72,
    max: 24,
    requires: { buildings: { archive: 1 }, techs: { extraction: 1 } },
  },
  data_arch: {
    id: "data_arch",
    name: "Kristallgitter",
    blurb: "+6% Kristall-Ertrag je Stufe. Grundlage für KI und Nexus.",
    branch: "economy",
    baseCost: bag({ metal: 40, energy: 70, crystal: 90 }),
    baseTime: 80,
    factor: 1.72,
    max: 24,
    requires: { buildings: { archive: 1 }, techs: { energy_core: 1 } },
  },
  weapons: {
    id: "weapons",
    name: "Waffensysteme",
    blurb: "+8% Angriff. Schaltet Kreuzer, Gauss und Plasma frei.",
    branch: "combat",
    baseCost: bag({ metal: 90, energy: 120, titan: 30, crystal: 70 }),
    baseTime: 90,
    factor: 1.75,
    max: 24,
    requires: { buildings: { archive: 2 }, techs: { energy_core: 1 } },
  },
  armor: {
    id: "armor",
    name: "Rumpfpanzerung",
    blurb: "+8% Hülle. Nötig für Schilde und Zerstörer.",
    branch: "combat",
    baseCost: bag({ metal: 100, energy: 70, titan: 40, crystal: 60 }),
    baseTime: 90,
    factor: 1.75,
    max: 24,
    requires: { buildings: { archive: 2 }, techs: { metallurgy: 1 } },
  },
  shields: {
    id: "shields",
    name: "Schildmodulation",
    blurb: "+8% Schiffs- und Planetenschilde.",
    branch: "combat",
    baseCost: bag({ metal: 120, energy: 200, titan: 40, crystal: 80 }),
    baseTime: 100,
    factor: 1.76,
    max: 24,
    requires: { buildings: { archive: 3 }, techs: { energy_core: 2, armor: 1 } },
  },
  warp: {
    id: "warp",
    name: "Warp-Antrieb",
    blurb: "Weitere Sprünge, kürzere Reisen. Schaltet Warp-Bake und Kolonisation frei.",
    branch: "expansion",
    baseCost: bag({ metal: 80, energy: 160, helium: 80, crystal: 100 }),
    baseTime: 100,
    factor: 1.78,
    max: 24,
    requires: { buildings: { archive: 2 }, techs: { energy_core: 1, fuel_systems: 1 } },
  },
  ai: {
    id: "ai",
    name: "KI-Taktik",
    blurb: "+4% Kampfeffizienz, bessere Spionage.",
    branch: "combat",
    baseCost: bag({ metal: 60, energy: 140, crystal: 160 }),
    baseTime: 110,
    factor: 1.8,
    max: 24,
    requires: { buildings: { archive: 3 }, techs: { data_arch: 2 } },
  },
  colonization: {
    id: "colonization",
    name: "Kolonisation",
    blurb: "Kolonialdock frei. +1 Planet je Stufe. Das Dock schaltet das Kolonialschiff frei.",
    branch: "expansion",
    baseCost: bag({ metal: 180, energy: 140, helium: 60, crystal: 120, diamond: 8 }),
    baseTime: 140,
    factor: 1.95,
    max: 24,
    requires: { buildings: { archive: 3 }, techs: { warp: 1 } },
  },
  nexus_protocol: {
    id: "nexus_protocol",
    name: "Nexus-Protokoll",
    blurb: "Hub-Boni und +8% Diamanten je Stufe.",
    branch: "expansion",
    baseCost: bag({ metal: 160, energy: 200, crystal: 200, diamond: 12 }),
    baseTime: 150,
    factor: 1.9,
    max: 18,
    requires: { buildings: { archive: 4 }, techs: { data_arch: 2, warp: 1 } },
  },
  laser_tech: {
    id: "laser_tech",
    name: "Laseroptik",
    blurb: "+5% für Jäger, Abfangjäger und Laser-Batterien je Stufe.",
    branch: "combat",
    baseCost: bag({ metal: 90, energy: 140, crystal: 110 }),
    baseTime: 95,
    factor: 1.76,
    max: 20,
    requires: { buildings: { archive: 3 }, techs: { weapons: 2 } },
  },
  plasma_tech: {
    id: "plasma_tech",
    name: "Plasmakern",
    blurb: "+5% für Bomber, Schlachtschiffe, Plasma und Disruptoren je Stufe.",
    branch: "combat",
    baseCost: bag({ metal: 140, energy: 220, titan: 50, crystal: 140 }),
    baseTime: 120,
    factor: 1.8,
    max: 20,
    requires: { buildings: { archive: 5 }, techs: { weapons: 4, laser_tech: 1 } },
  },
  nanotech: {
    id: "nanotech",
    name: "Nanotechnik",
    blurb: "Schaltet Naniten-Werft frei. Reparatur-Schwärme, schnellere Rümpfe.",
    branch: "economy",
    baseCost: bag({ metal: 120, energy: 180, crystal: 200, diamond: 8 }),
    baseTime: 130,
    factor: 1.82,
    max: 18,
    requires: { buildings: { archive: 5 }, techs: { ai: 3, metallurgy: 3 } },
  },
  hyperspace: {
    id: "hyperspace",
    name: "Hyperspace",
    blurb: "+2 Sprünge je Stufe, schnellere Reisen. Nötig für Sprungtore.",
    branch: "expansion",
    baseCost: bag({ metal: 160, energy: 280, helium: 140, crystal: 180, diamond: 10 }),
    baseTime: 140,
    factor: 1.84,
    max: 18,
    requires: { buildings: { archive: 5 }, techs: { warp: 4 } },
  },
  astrophysics: {
    id: "astrophysics",
    name: "Astrophysik",
    blurb: "+1 Kolonie alle 2 Stufen. Kartiert den äußeren Ring.",
    branch: "expansion",
    baseCost: bag({ metal: 200, energy: 180, helium: 80, crystal: 160, diamond: 14 }),
    baseTime: 155,
    factor: 1.88,
    max: 22,
    requires: { buildings: { archive: 4 }, techs: { warp: 3, colonization: 2 } },
  },
  graviton: {
    id: "graviton",
    name: "Graviton-Waffe",
    blurb: "+5% für Zerstörer, Dreadnoughts, Gauss und Orbitalgeschütze. Endgame.",
    branch: "combat",
    baseCost: bag({ metal: 280, energy: 360, titan: 160, crystal: 260, diamond: 28 }),
    baseTime: 180,
    factor: 1.92,
    max: 16,
    requires: { buildings: { archive: 8 }, techs: { hyperspace: 2, plasma_tech: 2 } },
  },
};

const TREE = {
  infra: {
    title: "Gebäude",
    view: "infra",
    tiers: [
      ["command", "matter_mine", "energy_array"],
      ["helium_well", "silo", "spy_center", "defense_hub"],
      ["titan_extractor", "uplink", "shipyard", "archive"],
      ["shield", "robotics"],
      ["diamond_forge", "beacon", "habitat", "colony_dock"],
      ["fusion", "nanite", "quantum_lab", "jumpgate", "citadel"],
    ],
  },
  research: {
    title: "Forschung",
    view: "research",
    tiers: [
      ["energy_core", "extraction"],
      ["fuel_systems", "metallurgy", "data_arch", "weapons"],
      ["armor", "warp", "ai", "laser_tech"],
      ["shields", "colonization"],
      ["nexus_protocol", "hyperspace", "nanotech", "plasma_tech"],
      ["graviton", "astrophysics"],
    ],
  },
  fleet: {
    title: "Flotte",
    view: "yard",
    tiers: [
      ["probe", "fighter"],
      ["interceptor", "cargo"],
      ["frigate", "bomber", "colony"],
      ["cruiser", "aeon"],
      ["destroyer", "carrier", "helix"],
      ["battleship", "dreadnought"],
    ],
  },
  orbit: {
    title: "Verteidigung",
    view: "defense",
    tiers: [
      ["flak"],
      ["missile", "pd"],
      ["laser", "dome", "mines"],
      ["ion", "gauss"],
      ["plasma", "disruptor"],
      ["orbital"],
    ],
  },
};

const SHIPS = {
  probe: {
    id: "probe",
    name: "Sonde",
    blurb: "Schnelles Aufklärungsboot. Unentbehrlich für Spionage.",
    cost: bag({ metal: 16, helium: 32, energy: 18, crystal: 10 }),
    time: 32,
    attack: 0,
    shield: 4,
    hull: 8,
    cargo: 5,
    speed: 14,
    fuel: 10,
    strongVs: "Aufklärung",
    requires: { buildings: { shipyard: 1, spy_center: 1 } },
  },
  fighter: {
    id: "fighter",
    name: "Jäger",
    blurb: "Leichter Schwarmjäger. Stark gegen Kapital, schwach gegen Abfangjäger und Flak.",
    cost: bag({ metal: 82, helium: 50, energy: 24 }),
    time: 55,
    attack: 14,
    shield: 8,
    hull: 22,
    cargo: 40,
    speed: 9,
    fuel: 16,
    strongVs: "Kreuzer, Zerstörer",
    requires: { buildings: { shipyard: 1 } },
  },
  interceptor: {
    id: "interceptor",
    name: "Abfangjäger",
    blurb: "Schneller Jäger-Killer. Frisst Schwärme und Bomber, gegen Kapital fast nutzlos.",
    cost: bag({ metal: 110, helium: 88, energy: 48, crystal: 22 }),
    time: 70,
    attack: 22,
    shield: 10,
    hull: 28,
    cargo: 30,
    speed: 11,
    fuel: 18,
    strongVs: "Jäger, Bomber, Sonden",
    requires: { buildings: { shipyard: 2 }, techs: { laser_tech: 1 } },
  },
  bomber: {
    id: "bomber",
    name: "Bomber",
    blurb: "Langsame Anti-Kapital-Waffe. Stirbt an Abfangjägern und Punktverteidigung.",
    cost: bag({ metal: 210, helium: 105, titan: 55, energy: 65, crystal: 28 }),
    time: 95,
    attack: 58,
    shield: 18,
    hull: 55,
    cargo: 80,
    speed: 5.2,
    fuel: 34,
    strongVs: "Zerstörer, Schlachtschiff, Dreadnought",
    requires: { buildings: { shipyard: 4 }, techs: { weapons: 2 } },
  },
  frigate: {
    id: "frigate",
    name: "Fregatte",
    blurb: "Mehrzweck-Eskorte. Jagt Jäger und Abfangjäger, fällt gegen Kreuzer.",
    cost: bag({ metal: 240, helium: 120, titan: 55, energy: 65 }),
    time: 110,
    attack: 48,
    shield: 36,
    hull: 85,
    cargo: 180,
    speed: 6.5,
    fuel: 24,
    strongVs: "Jäger, Abfangjäger, Bomber",
    requires: { buildings: { shipyard: 3 } },
  },
  cargo: {
    id: "cargo",
    name: "Transporter",
    blurb: "Frachtkahn für Beute und Nachschub zwischen Kolonien.",
    cost: bag({ metal: 185, helium: 70, energy: 26 }),
    time: 70,
    attack: 4,
    shield: 16,
    hull: 36,
    cargo: 4500,
    speed: 5.5,
    fuel: 48,
    strongVs: "—",
    requires: { buildings: { shipyard: 2 } },
  },
  cruiser: {
    id: "cruiser",
    name: "Kreuzer",
    blurb: "Rückgrat jeder Kampfgruppe. Frisst Fregatten, weicht Zerstörern.",
    cost: bag({ metal: 520, helium: 220, titan: 250, energy: 165, crystal: 55 }),
    time: 200,
    attack: 150,
    shield: 120,
    hull: 270,
    cargo: 700,
    speed: 4.4,
    fuel: 56,
    strongVs: "Fregatten, Transporter",
    requires: { buildings: { shipyard: 5 }, techs: { weapons: 2 } },
  },
  colony: {
    id: "colony",
    name: "Kolonialschiff",
    blurb: "Gründet eine neue Welt. Diamant-Kern, wird verbraucht.",
    cost: bag({ metal: 680, helium: 360, titan: 160, energy: 200, crystal: 70, diamond: 22 }),
    time: 280,
    attack: 8,
    shield: 70,
    hull: 180,
    cargo: 1800,
    speed: 3.2,
    fuel: 72,
    strongVs: "—",
    requires: { buildings: { shipyard: 3, colony_dock: 1 }, techs: { colonization: 1 } },
  },
  destroyer: {
    id: "destroyer",
    name: "Zerstörer",
    blurb: "Kapitalwaffe. Jagt Kreuzer und Träger, fällt gegen Bomber und Schlachtschiffe.",
    cost: bag({ metal: 1450, helium: 760, titan: 940, energy: 520, crystal: 180, diamond: 72 }),
    time: 420,
    attack: 420,
    shield: 280,
    hull: 640,
    cargo: 1200,
    speed: 3.0,
    fuel: 82,
    strongVs: "Kreuzer, Träger",
    requires: { buildings: { shipyard: 8 }, techs: { weapons: 5, armor: 3 } },
  },
  carrier: {
    id: "carrier",
    name: "Träger",
    blurb: "Hangar-Schiff. Schwärme gegen Jäger, Bomber und Abfangjäger. Weich gegen Kapital.",
    cost: bag({ metal: 1220, helium: 600, titan: 400, energy: 420, crystal: 230, diamond: 48 }),
    time: 380,
    attack: 210,
    shield: 220,
    hull: 520,
    cargo: 2200,
    speed: 3.4,
    fuel: 88,
    strongVs: "Jäger, Abfangjäger, Bomber",
    requires: { buildings: { shipyard: 9 }, techs: { ai: 3, laser_tech: 2 } },
  },
  battleship: {
    id: "battleship",
    name: "Schlachtschiff",
    blurb: "Schwere Breitseite. Jagt Zerstörer, weicht Bombern und Dreadnoughts.",
    cost: bag({ metal: 2180, helium: 980, titan: 1260, energy: 740, crystal: 280, diamond: 98 }),
    time: 520,
    attack: 620,
    shield: 420,
    hull: 980,
    cargo: 1600,
    speed: 2.6,
    fuel: 118,
    strongVs: "Zerstörer, Kreuzer",
    requires: { buildings: { shipyard: 10 }, techs: { weapons: 6, armor: 4, plasma_tech: 1 } },
  },
  dreadnought: {
    id: "dreadnought",
    name: "Dreadnought",
    blurb: "Endgame-Kapital. Frisst Schlachtschiffe und Träger, verwundbar gegen Bomber-Schwärme.",
    cost: bag({ metal: 3800, helium: 1550, titan: 2200, energy: 1280, crystal: 560, diamond: 190 }),
    time: 780,
    attack: 1100,
    shield: 720,
    hull: 1680,
    cargo: 2400,
    speed: 2.1,
    fuel: 175,
    strongVs: "Schlachtschiff, Träger, Zerstörer",
    requires: { buildings: { shipyard: 14, nanite: 2 }, techs: { graviton: 1, weapons: 8, armor: 6 } },
  },
  aeon: {
    id: "aeon",
    name: "Aeon-Korvette",
    blurb: "Nexus-Eskorte. Jagt Schwärme und Fregatten, weicht Kapital. Freischaltung im Nex-Shop, danach in der Werft baubar.",
    cost: bag({ metal: 520, helium: 260, titan: 110, energy: 190, crystal: 90, diamond: 10 }),
    time: 175,
    attack: 64,
    shield: 48,
    hull: 98,
    cargo: 200,
    speed: 6.8,
    fuel: 28,
    strongVs: "Jäger, Abfangjäger, Fregatten",
    premium: "aeon_unlock",
    requires: { buildings: { shipyard: 4 } },
  },
  helix: {
    id: "helix",
    name: "Helix-Kampfdrohne",
    blurb: "Unbemannte KI-Lanze. Zerlegt Kreuzer und Kapital, stirbt an Flak und Abfangjägern. Nex-Freischaltung, danach in der Werft baubar.",
    cost: bag({ metal: 380, helium: 200, titan: 220, energy: 240, crystal: 160, diamond: 18 }),
    time: 190,
    attack: 86,
    shield: 28,
    hull: 52,
    cargo: 40,
    speed: 8.2,
    fuel: 20,
    strongVs: "Kreuzer, Zerstörer, Schlachtschiff, Dreadnought",
    premium: "helix_unlock",
    requires: { buildings: { shipyard: 6 }, techs: { weapons: 3, ai: 2 } },
  },
};

const DEFENSES = {
  flak: {
    id: "flak",
    name: "Flak-Batterie",
    blurb: "Rotierende Rohre. Frisst Jäger und Sonden, gegen Kapital-Schiffe fast nutzlos.",
    cost: bag({ metal: 40, energy: 15 }),
    time: 28,
    attack: 16,
    shield: 4,
    hull: 18,
    strongVs: "Jäger, Sonden",
    vs: { probe: 1.7, fighter: 1.95, interceptor: 1.8, bomber: 0.7, frigate: 0.75, cargo: 1.15, cruiser: 0.4, colony: 0.85, destroyer: 0.3, battleship: 0.25, carrier: 0.55, dreadnought: 0.2, aeon: 0.9, helix: 1.9 },
    requires: { buildings: { shipyard: 1, defense_hub: 1 } },
  },
  missile: {
    id: "missile",
    name: "Raketenwerfer",
    blurb: "Schwärme gegen Eskorten. Fregatten sterben hier.",
    cost: bag({ metal: 80, energy: 30, helium: 12 }),
    time: 40,
    attack: 28,
    shield: 8,
    hull: 32,
    strongVs: "Fregatten",
    vs: { probe: 1.1, fighter: 0.7, interceptor: 0.85, bomber: 1.7, frigate: 1.9, cargo: 1.2, cruiser: 0.85, colony: 1.0, destroyer: 0.5, battleship: 0.45, carrier: 0.7, dreadnought: 0.35, aeon: 0.7, helix: 0.85 },
    requires: { buildings: { shipyard: 2, defense_hub: 1 } },
  },
  pd: {
    id: "pd",
    name: "Punktverteidigung",
    blurb: "Präzisionslaser. Transporter und Kolonieschiffe überleben das selten.",
    cost: bag({ metal: 60, energy: 50, crystal: 12 }),
    time: 36,
    attack: 22,
    shield: 10,
    hull: 24,
    strongVs: "Transporter, Kolonie, Sonden",
    vs: { probe: 2.1, fighter: 1.1, interceptor: 0.9, bomber: 1.85, frigate: 0.8, cargo: 2.2, cruiser: 0.45, colony: 2.0, destroyer: 0.28, battleship: 0.25, carrier: 0.5, dreadnought: 0.2, aeon: 0.8, helix: 1.55 },
    requires: { buildings: { shipyard: 2, defense_hub: 1 } },
  },
  ion: {
    id: "ion",
    name: "Ionenkanone",
    blurb: "Schildbrecher. Kreuzer verlieren den Gürtel.",
    cost: bag({ metal: 140, energy: 120, crystal: 40, titan: 20 }),
    time: 70,
    attack: 55,
    shield: 30,
    hull: 70,
    strongVs: "Kreuzer",
    vs: { probe: 0.6, fighter: 0.55, interceptor: 0.5, bomber: 0.7, frigate: 1.05, cargo: 0.9, cruiser: 1.95, colony: 1.1, destroyer: 0.8, battleship: 0.7, carrier: 1.7, dreadnought: 0.55, aeon: 0.6, helix: 0.7 },
    requires: { buildings: { shipyard: 4, shield: 1, defense_hub: 1 } },
  },
  gauss: {
    id: "gauss",
    name: "Gauss-Geschütz",
    blurb: "Kinetik gegen Kapital. Zerstörer bekommen Löcher.",
    cost: bag({ metal: 220, energy: 80, titan: 90 }),
    time: 95,
    attack: 90,
    shield: 20,
    hull: 110,
    strongVs: "Zerstörer",
    vs: { probe: 0.4, fighter: 0.42, interceptor: 0.38, bomber: 0.6, frigate: 0.9, cargo: 0.8, cruiser: 1.25, colony: 1.15, destroyer: 2.05, battleship: 1.4, carrier: 1.1, dreadnought: 1.75, aeon: 0.5, helix: 0.55 },
    requires: { buildings: { shipyard: 6, defense_hub: 2 }, techs: { weapons: 3 } },
  },
  plasma: {
    id: "plasma",
    name: "Plasma-Turm",
    blurb: "Schwerer Allrounder. Teuer, langsam, unangenehm für alles Große.",
    cost: bag({ metal: 280, energy: 200, titan: 60, crystal: 50, diamond: 4 }),
    time: 120,
    attack: 110,
    shield: 40,
    hull: 140,
    strongVs: "Kreuzer, Zerstörer",
    vs: { probe: 0.5, fighter: 0.65, interceptor: 0.55, bomber: 0.8, frigate: 1.15, cargo: 1.0, cruiser: 1.55, colony: 1.3, destroyer: 1.65, battleship: 1.7, carrier: 1.25, dreadnought: 1.45, aeon: 0.6, helix: 0.65 },
    requires: { buildings: { shipyard: 7, shield: 2, defense_hub: 3 }, techs: { weapons: 4, plasma_tech: 1 } },
  },
  dome: {
    id: "dome",
    name: "Schildkuppel",
    blurb: "Kein Angriff. Ein HP-Polster für den ganzen Orbit.",
    cost: bag({ metal: 180, energy: 260, crystal: 80, titan: 30 }),
    time: 90,
    attack: 0,
    shield: 180,
    hull: 220,
    strongVs: "absorbiert Salven",
    vs: { probe: 0.2, fighter: 0.2, interceptor: 0.2, bomber: 0.2, frigate: 0.2, cargo: 0.2, cruiser: 0.2, colony: 0.2, destroyer: 0.2, battleship: 0.2, carrier: 0.2, dreadnought: 0.2, aeon: 0.2, helix: 0.2 },
    requires: { buildings: { shield: 1, defense_hub: 1 } },
  },
  laser: {
    id: "laser",
    name: "Laser-Batterie",
    blurb: "Präzisionsstrahlen. Jagt Abfangjäger und Jäger, kratzt Kapital kaum.",
    cost: bag({ metal: 70, energy: 80, crystal: 24 }),
    time: 42,
    attack: 26,
    shield: 12,
    hull: 28,
    strongVs: "Abfangjäger, Jäger",
    vs: { probe: 1.5, fighter: 1.7, interceptor: 2.0, bomber: 0.85, frigate: 0.9, cargo: 1.1, cruiser: 0.5, colony: 0.9, destroyer: 0.35, battleship: 0.3, carrier: 0.55, dreadnought: 0.22, aeon: 1.1, helix: 1.85 },
    requires: { buildings: { shipyard: 3, defense_hub: 1 }, techs: { laser_tech: 1 } },
  },
  mines: {
    id: "mines",
    name: "Minenfeld",
    blurb: "Dumme Sprengsätze. Transporter, Kolonien und Fregatten laufen hinein.",
    cost: bag({ metal: 50, energy: 20, helium: 18, titan: 8 }),
    time: 32,
    attack: 34,
    shield: 0,
    hull: 16,
    strongVs: "Transporter, Kolonie, Fregatte",
    vs: { probe: 0.8, fighter: 0.6, interceptor: 0.55, bomber: 0.9, frigate: 1.8, cargo: 2.3, cruiser: 0.7, colony: 2.1, destroyer: 0.45, battleship: 0.35, carrier: 0.8, dreadnought: 0.25, aeon: 0.5, helix: 0.7 },
    requires: { buildings: { shipyard: 4, defense_hub: 1 } },
  },
  disruptor: {
    id: "disruptor",
    name: "Disruptor",
    blurb: "Schildbrecher der nächsten Generation. Schlachtschiffe und Dreadnoughts verlieren den Gürtel.",
    cost: bag({ metal: 260, energy: 240, titan: 80, crystal: 90, diamond: 8 }),
    time: 110,
    attack: 95,
    shield: 50,
    hull: 120,
    strongVs: "Schlachtschiff, Dreadnought, Kreuzer",
    vs: { probe: 0.45, fighter: 0.5, interceptor: 0.42, bomber: 0.65, frigate: 0.85, cargo: 0.8, cruiser: 1.45, colony: 1.05, destroyer: 1.15, battleship: 2.0, carrier: 1.35, dreadnought: 1.9, aeon: 0.5, helix: 0.6 },
    requires: { buildings: { shipyard: 8, shield: 3, defense_hub: 4 }, techs: { plasma_tech: 1 } },
  },
  orbital: {
    id: "orbital",
    name: "Orbitalgeschütz",
    blurb: "Gravitationslinse. Einziger sinnvoller Counter gegen Dreadnoughts im Orbit.",
    cost: bag({ metal: 480, energy: 360, titan: 220, crystal: 140, diamond: 22 }),
    time: 160,
    attack: 180,
    shield: 60,
    hull: 220,
    strongVs: "Dreadnought, Schlachtschiff, Träger",
    vs: { probe: 0.3, fighter: 0.35, interceptor: 0.3, bomber: 0.55, frigate: 0.7, cargo: 0.75, cruiser: 1.2, colony: 1.1, destroyer: 1.5, battleship: 1.85, carrier: 1.7, dreadnought: 2.15, aeon: 0.45, helix: 0.5 },
    requires: { buildings: { shipyard: 12, citadel: 1, defense_hub: 6 }, techs: { graviton: 1 } },
  },
};

const SHIP_VS = {
  probe: {
    probe: 1, fighter: 0.3, interceptor: 0.25, bomber: 0.3, frigate: 0.25, cargo: 0.4,
    cruiser: 0.2, colony: 0.35, destroyer: 0.15, battleship: 0.12, carrier: 0.18, dreadnought: 0.1, aeon: 0.22, helix: 0.2,
  },
  fighter: {
    probe: 1.4, fighter: 1, interceptor: 0.65, bomber: 1.15, frigate: 0.7, cargo: 1.3,
    cruiser: 1.75, colony: 1.2, destroyer: 1.55, battleship: 1.35, carrier: 0.85, dreadnought: 1.25, aeon: 0.72, helix: 1.35,
  },
  interceptor: {
    probe: 1.6, fighter: 1.85, interceptor: 1, bomber: 1.9, frigate: 0.8, cargo: 1.2,
    cruiser: 0.55, colony: 1.0, destroyer: 0.4, battleship: 0.35, carrier: 0.7, dreadnought: 0.3, aeon: 1.25, helix: 1.7,
  },
  bomber: {
    probe: 0.7, fighter: 0.45, interceptor: 0.35, bomber: 1, frigate: 0.85, cargo: 1.1,
    cruiser: 1.4, colony: 1.2, destroyer: 1.85, battleship: 2.0, carrier: 1.3, dreadnought: 1.7, aeon: 1.1, helix: 0.85,
  },
  frigate: {
    probe: 1.1, fighter: 1.75, interceptor: 1.55, bomber: 1.35, frigate: 1, cargo: 1.2,
    cruiser: 0.75, colony: 1.1, destroyer: 0.55, battleship: 0.5, carrier: 0.9, dreadnought: 0.4, aeon: 0.85, helix: 1.45,
  },
  cargo: {
    probe: 0.5, fighter: 0.35, interceptor: 0.3, bomber: 0.35, frigate: 0.3, cargo: 1,
    cruiser: 0.25, colony: 0.5, destroyer: 0.2, battleship: 0.18, carrier: 0.25, dreadnought: 0.12, aeon: 0.28, helix: 0.3,
  },
  cruiser: {
    probe: 0.8, fighter: 0.55, interceptor: 0.7, bomber: 0.85, frigate: 1.7, cargo: 1.3,
    cruiser: 1, colony: 1.25, destroyer: 0.7, battleship: 0.6, carrier: 1.15, dreadnought: 0.5, aeon: 1.2, helix: 0.55,
  },
  colony: {
    probe: 0.4, fighter: 0.3, interceptor: 0.28, bomber: 0.3, frigate: 0.35, cargo: 0.6,
    cruiser: 0.3, colony: 1, destroyer: 0.25, battleship: 0.22, carrier: 0.3, dreadnought: 0.18, aeon: 0.32, helix: 0.35,
  },
  destroyer: {
    probe: 0.7, fighter: 0.45, interceptor: 0.5, bomber: 0.6, frigate: 0.9, cargo: 1.1,
    cruiser: 1.7, colony: 1.4, destroyer: 1, battleship: 0.75, carrier: 1.55, dreadnought: 0.65, aeon: 1.35, helix: 0.5,
  },
  battleship: {
    probe: 0.65, fighter: 0.5, interceptor: 0.55, bomber: 0.45, frigate: 1.15, cargo: 1.2,
    cruiser: 1.55, colony: 1.35, destroyer: 1.75, battleship: 1, carrier: 1.4, dreadnought: 0.7, aeon: 1.25, helix: 0.42,
  },
  carrier: {
    probe: 1.2, fighter: 1.6, interceptor: 1.45, bomber: 1.5, frigate: 1.05, cargo: 1.15,
    cruiser: 0.7, colony: 1.1, destroyer: 0.5, battleship: 0.45, carrier: 1, dreadnought: 0.4, aeon: 0.95, helix: 0.7,
  },
  dreadnought: {
    probe: 0.6, fighter: 0.4, interceptor: 0.45, bomber: 0.55, frigate: 0.85, cargo: 1.15,
    cruiser: 1.45, colony: 1.5, destroyer: 1.6, battleship: 1.85, carrier: 1.7, dreadnought: 1, aeon: 1.3, helix: 0.38,
  },
  aeon: {
    probe: 1.25, fighter: 1.5, interceptor: 1.35, bomber: 0.7, frigate: 1.25, cargo: 1.35,
    cruiser: 0.62, colony: 1.1, destroyer: 0.38, battleship: 0.28, carrier: 0.7, dreadnought: 0.24, aeon: 1, helix: 1.15,
  },
  helix: {
    probe: 0.7, fighter: 0.48, interceptor: 0.42, bomber: 0.9, frigate: 0.85, cargo: 1.05,
    cruiser: 1.7, colony: 1.3, destroyer: 1.95, battleship: 2.15, carrier: 1.45, dreadnought: 2.05, aeon: 0.7, helix: 1,
  },
};

const PLANET_TYPES = {
  terran: {
    name: "Terran",
    hue: 150,
    focus: "metal",
    multipliers: { metal: 1.25, helium: 0.95, titan: 1.0, energy: 1.05, crystal: 0.9, diamond: 0.55 },
  },
  ocean: {
    name: "Ozean",
    hue: 200,
    focus: "helium",
    multipliers: { metal: 0.75, helium: 1.4, titan: 0.7, energy: 1.05, crystal: 1.05, diamond: 0.6 },
  },
  desert: {
    name: "Wüste",
    hue: 35,
    focus: "energy",
    multipliers: { metal: 0.95, helium: 0.85, titan: 1.15, energy: 1.35, crystal: 0.75, diamond: 0.7 },
  },
  ice: {
    name: "Eis",
    hue: 190,
    focus: "crystal",
    multipliers: { metal: 0.7, helium: 1.15, titan: 0.8, energy: 0.9, crystal: 1.45, diamond: 0.85 },
  },
  lava: {
    name: "Lava",
    hue: 12,
    focus: "titan",
    multipliers: { metal: 1.2, helium: 0.6, titan: 1.45, energy: 1.1, crystal: 0.7, diamond: 0.5 },
  },
  gas: {
    name: "Gasriese",
    hue: 265,
    focus: "helium",
    multipliers: { metal: 0.35, helium: 1.7, titan: 0.4, energy: 1.3, crystal: 0.85, diamond: 0.45 },
  },
  ruin: {
    name: "Ruinenwelt",
    hue: 280,
    focus: "diamond",
    multipliers: { metal: 0.85, helium: 0.7, titan: 1.05, energy: 0.9, crystal: 1.25, diamond: 1.55 },
  },
};

const STAR_TYPES = {
  blue: { name: "Blauer Riese", color: "#7ecbff" },
  white: { name: "Weißer Stern", color: "#f2f6ff" },
  yellow: { name: "Gelber Zwerg", color: "#ffe08a" },
  orange: { name: "Oranger Stern", color: "#ffb060" },
  red: { name: "Roter Zwerg", color: "#ff6b5a" },
  neutron: { name: "Nexus-Kern", color: "#c084fc" },
};

const EMPIRE_COLORS = [
  "#3ee0ff",
  "#a855f7",
  "#f0a030",
  "#4ade80",
  "#ff4d6d",
  "#60a5fa",
  "#f472b6",
  "#22d3ee",
  "#eab308",
  "#c084fc",
  "#34d399",
  "#fb7185",
];

const MISSIONS = {
  attack: { name: "Angriff", hostile: true },
  spy: { name: "Spionage", hostile: true },
  transport: { name: "Fracht senden", hostile: false },
  collect: { name: "Fracht abholen", hostile: false },
  deploy: { name: "Stationieren", hostile: false },
  colonize: { name: "Kolonisieren", hostile: false },
  ally_colonize: { name: "Allianz-Planet", hostile: false },
  expedition: { name: "Expedition", hostile: false },
  salvage: { name: "Bergen", hostile: false },
  intercept: { name: "Verteidigen", hostile: false },
};

/** Speed bonuses cannot fully cancel late-game stretch. */
const TIME_SPEED_CAP = 1.4;

function timeStretch(level) {
  const lv = Math.max(0, level | 0);
  if (lv <= 2) return 1;
  if (lv <= 5) return 1.12;
  if (lv <= 9) return 1.38;
  if (lv <= 14) return 1.85;
  if (lv <= 19) return 2.35;
  return 2.8;
}

function scaledTime(baseTime, factor, level, speedBonus) {
  const raw = baseTime * factor ** level * timeStretch(level);
  const bonus = Math.min(TIME_SPEED_CAP, Math.max(0, speedBonus || 0));
  return Math.max(8, Math.floor(raw / (1 + bonus)));
}

function meetsReq(req, buildings, techs) {
  if (!req) return true;
  if (req.buildings) {
    for (const [id, lvl] of Object.entries(req.buildings)) {
      if ((buildings[id] || 0) < lvl) return false;
    }
  }
  if (req.techs) {
    for (const [id, lvl] of Object.entries(req.techs)) {
      if ((techs[id] || 0) < lvl) return false;
    }
  }
  return true;
}

function maxPlanets(colonizationLevel, astroLevel) {
  return Math.min(36, 1 + (colonizationLevel || 0) + Math.floor((astroLevel || 0) / 2));
}

function colonyShipCost(ownedPersonal) {
  const extra = Math.max(0, (Number(ownedPersonal) || 1) - 1);
  return scaleBag(SHIPS.colony.cost, 1.85 ** extra);
}

function collectUnlocks() {
  const map = {};
  const note = (fromKind, fromId, target) => {
    const key = `${fromKind}:${fromId}`;
    (map[key] ||= []).push(target);
  };
  const scan = (item, kind) => {
    for (const [id, lvl] of Object.entries(item.requires?.buildings || {})) {
      note("building", id, { kind, id: item.id, name: item.name, need: lvl });
    }
    for (const [id, lvl] of Object.entries(item.requires?.techs || {})) {
      note("tech", id, { kind, id: item.id, name: item.name, need: lvl });
    }
  };
  for (const b of Object.values(BUILDINGS)) scan(b, "building");
  for (const t of Object.values(TECHS)) scan(t, "tech");
  for (const s of Object.values(SHIPS)) scan(s, "ship");
  for (const d of Object.values(DEFENSES)) scan(d, "defense");
  return map;
}

const UNLOCKS = collectUnlocks();

function publicCatalog() {
  const species = require("./species");
  return {
    resources: RESOURCES,
    resourceIds: RESOURCE_IDS,
    buildings: BUILDINGS,
    techs: TECHS,
    ships: SHIPS,
    defenses: DEFENSES,
    shipVs: SHIP_VS,
    planetTypes: PLANET_TYPES,
    missions: MISSIONS,
    tree: TREE,
    unlocks: UNLOCKS,
    species: species.publicList(),
    nex: species.publicShop(),
    tickMs: TICK_MS,
    acsMaxFleets: 8,
  };
}

module.exports = {
  RESOURCES,
  RESOURCE_IDS,
  TICK_MS,
  TECH_FOR_RESOURCE,
  BUILDINGS,
  TECHS,
  SHIPS,
  DEFENSES,
  SHIP_VS,
  PLANET_TYPES,
  STAR_TYPES,
  EMPIRE_COLORS,
  MISSIONS,
  emptyBag,
  bag,
  scaleBag,
  addBags,
  bagSum,
  scaledCost,
  scaledTime,
  TIME_SPEED_CAP,
  meetsReq,
  maxPlanets,
  colonyShipCost,
  publicCatalog,
  TREE,
  UNLOCKS,
};
