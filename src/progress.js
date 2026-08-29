"use strict";

const { BUILDINGS, SHIPS, TECHS, DEFENSES, bag, emptyBag, RESOURCE_IDS, scaleBag } = require("./catalog");

const CONTRACTS = [
  {
    id: "mine2",
    chapter: "I · Fundament",
    title: "Erzfluss",
    blurb: "Baue die Metall-Mine auf Stufe 2. Ohne Metall steht die Werft still.",
    hint: "Gebäude → Metall-Mine → Ausbau",
    view: "infra",
    xp: 40,
    reward: bag({ metal: 350, energy: 180 }),
    test: (c) => (c.buildings.matter_mine || 0) >= 2,
  },
  {
    id: "helium1",
    title: "Treibstoff",
    blurb: "Errichte einen Helium-3-Kollektor. Flotten fliegen sonst nirgendwo hin.",
    hint: "Gebäude → Helium-3-Kollektor",
    view: "infra",
    xp: 40,
    reward: bag({ helium: 280, metal: 120 }),
    test: (c) => (c.buildings.helium_well || 0) >= 1,
  },
  {
    id: "archive1",
    title: "Archiv",
    blurb: "Baue das Forschungsarchiv. Warp und Waffen liegen hinter dieser Tür.",
    hint: "Gebäude → Forschungsarchiv (Kommando Stufe 2)",
    view: "infra",
    xp: 50,
    reward: bag({ crystal: 160, energy: 160 }),
    test: (c) => (c.buildings.archive || 0) >= 1,
  },
  {
    id: "fighters6",
    title: "Schwarm",
    blurb: "Stationiere mindestens 6 Jäger. Dann kannst du Remnants jagen.",
    hint: "Schiffswerft → Jäger bauen",
    view: "yard",
    xp: 50,
    reward: bag({ metal: 200, helium: 120 }),
    test: (c) => (c.ships.fighter || 0) >= 6,
  },
  {
    id: "spy1",
    title: "Auge im Orbit",
    blurb: "Schicke eine Sonde auf Spionage. Kämpfe ohne Bericht sind Blindflug.",
    hint: "Galaxie → Planet → Spionage",
    view: "galaxy",
    xp: 60,
    reward: bag({ crystal: 80, helium: 80 }),
    test: (c) => c.spyCount > 0,
  },
  {
    id: "combat1",
    title: "Erste Schlacht",
    blurb: "Gewinne einen Kampf. Remnants in Nachbarsystemen sind das ideale Ziel.",
    hint: "Nachrichten → Spionage → oder Galaxie → Angriff",
    view: "galaxy",
    xp: 80,
    reward: bag({ metal: 400, titan: 80, helium: 150 }),
    test: (c) => c.combatWins > 0,
  },
  {
    id: "warp1",
    title: "Sprung",
    blurb: "Erforsche Warp-Antrieb Stufe 1. Danach erreichst du die nächste Sonne.",
    hint: "Forschung → Warp-Antrieb",
    view: "research",
    xp: 70,
    reward: bag({ helium: 200, crystal: 120 }),
    test: (c) => (c.techs.warp || 0) >= 1,
  },
  {
    id: "expedition1",
    title: "Nebel",
    blurb: "Starte eine Expedition ins Unbekannte. Das ist die beste Diamant-Quelle früh.",
    hint: "Galaxie → eigenes System → Expedition",
    view: "galaxy",
    xp: 80,
    reward: bag({ diamond: 12, crystal: 80 }),
    test: (c) => c.expeditionCount > 0,
  },
  {
    id: "titan1",
    title: "Panzerung",
    blurb: "Baue den Titan-Extraktor. Kreuzer fressen Titan.",
    hint: "Gebäude → Titan-Extraktor",
    view: "infra",
    xp: 70,
    reward: bag({ titan: 120, metal: 200 }),
    test: (c) => (c.buildings.titan_extractor || 0) >= 1,
  },
  {
    id: "dock1",
    title: "Kolonialdock",
    blurb: "Errichte das Kolonialdock. Ohne Dock kein Siedlerschiff und kein Kolonisationsstart.",
    hint: "Forschung → Kolonisation, dann Gebäude → Kolonialdock",
    view: "infra",
    xp: 80,
    reward: bag({ metal: 280, helium: 160, diamond: 8 }),
    test: (c) => (c.buildings.colony_dock || 0) >= 1,
  },
  {
    id: "colony1",
    title: "Zweite Welt",
    blurb: "Kolonisiere einen Planeten. Spezialisiere: Lava = Titan, Gas = Helium, Ruinen = Diamanten.",
    hint: "Kolonialdock und Kolonieschiff, Remnants vertreiben, dann kolonisieren",
    view: "galaxy",
    xp: 120,
    reward: bag({ metal: 600, helium: 300, diamond: 20 }),
    test: (c) => c.planetCount >= 2,
  },
  {
    id: "flak8",
    title: "Orbitale Batterie",
    blurb: "Stelle 8 Flak-Batterien auf. Jäger und Sonden sterben hier.",
    hint: "Verteidigung → Flak-Batterie bauen",
    view: "defense",
    xp: 70,
    reward: bag({ metal: 220, energy: 140, titan: 40 }),
    test: (c) => (c.ships["def:flak"] || 0) >= 8,
  },
  {
    id: "command3",
    title: "Kommando S3",
    blurb: "Baue den Kommando-Nexus auf Stufe 3. Schilde und schwere Gebäude warten dahinter.",
    hint: "Gebäude → Kommando-Nexus ausbauen",
    view: "infra",
    xp: 80,
    reward: bag({ metal: 400, energy: 220, crystal: 80 }),
    ships: { fighter: 2 },
    test: (c) => (c.buildings.command || 0) >= 3,
  },
  {
    id: "mine3",
    title: "Erzader",
    blurb: "Metall-Mine Stufe 3. Die Werft darf nicht dursten.",
    hint: "Gebäude → Metall-Mine auf Stufe 3",
    view: "infra",
    xp: 70,
    reward: bag({ metal: 500, energy: 120 }),
    test: (c) => (c.buildings.matter_mine || 0) >= 3,
  },
  {
    id: "yard2",
    title: "Trockendock",
    blurb: "Werft Stufe 2. Transporter und Raketenwerfer gehen online.",
    hint: "Gebäude → Werft ausbauen",
    view: "infra",
    xp: 70,
    reward: bag({ metal: 280, helium: 120, titan: 40 }),
    ships: { probe: 2 },
    test: (c) => (c.buildings.shipyard || 0) >= 2,
  },
  {
    id: "energy1",
    title: "Kernzündung",
    blurb: "Erforsche Energiekerne Stufe 1. Ohne sie bleibt der Tech-Tree zu.",
    hint: "Forschung → Energiekerne",
    view: "research",
    xp: 60,
    reward: bag({ energy: 300, crystal: 80 }),
    test: (c) => (c.techs.energy_core || 0) >= 1,
  },
  {
    id: "raidwin",
    title: "Prisenrecht",
    blurb: "Wehre einen Piraten-Raid ab. Beute gehört dem, der den Orbit hält.",
    hint: "Verteidigung ausbauen, Raid abwarten",
    view: "defense",
    xp: 90,
    reward: bag({ metal: 350, helium: 180, titan: 50 }),
    ships: { fighter: 1 },
    test: (c) => (c.raidWins || 0) > 0,
  },
  {
    id: "piratehunt",
    title: "Kaperkrieg",
    blurb: "Nimm einen von Piraten besetzten Planeten. Ihre Flotten werden stärker, je länger du wartest.",
    hint: "Galaxie → orangener Ring → Angriff",
    view: "galaxy",
    xp: 110,
    reward: bag({ metal: 450, helium: 200, diamond: 8 }),
    ships: { frigate: 1 },
    test: (c) => (c.pirateKills || 0) > 0,
  },
  {
    id: "shield1",
    chapter: "II · Dominion",
    title: "Orbit-Schild",
    blurb: "Errichte den Schildgenerator. Raids ohne Schild sind teuer.",
    hint: "Gebäude → Schildgenerator (Kommando Stufe 3)",
    view: "infra",
    xp: 90,
    reward: bag({ metal: 420, energy: 280, titan: 60 }),
    test: (c) => (c.buildings.shield || 0) >= 1,
  },
  {
    id: "fighters24",
    title: "Staffel",
    blurb: "Stationiere 24 Jäger. Der Schwarm ist deine erste echte Flotte.",
    hint: "Schiffswerft → Jäger",
    view: "yard",
    xp: 90,
    reward: bag({ metal: 360, helium: 180 }),
    ships: { interceptor: 1 },
    test: (c) => (c.ships.fighter || 0) >= 24,
  },
  {
    id: "warp3",
    title: "Warp-Korridor",
    blurb: "Warp-Antrieb Stufe 3. Ohne Reichweite bleibt das Dominion klein.",
    hint: "Forschung → Warp-Antrieb",
    view: "research",
    xp: 100,
    reward: bag({ helium: 320, crystal: 160 }),
    test: (c) => (c.techs.warp || 0) >= 3,
  },
  {
    id: "colony3",
    title: "Dreiklang",
    blurb: "Besitze drei Welten. Jede Spezialisierung zählt.",
    hint: "Galaxie → kolonisieren",
    view: "galaxy",
    xp: 140,
    reward: bag({ metal: 800, helium: 360, diamond: 16 }),
    test: (c) => c.planetCount >= 3,
  },
  {
    id: "frigate2",
    title: "Eskorte",
    blurb: "Zwei Fregatten. Sie halten Jäger von deinen Kreuzern fern.",
    hint: "Schiffswerft → Fregatte",
    view: "yard",
    xp: 100,
    reward: bag({ metal: 400, titan: 80, helium: 160 }),
    test: (c) => (c.ships.frigate || 0) >= 2,
  },
  {
    id: "archive4",
    title: "Datenkern",
    blurb: "Forschungsarchiv Stufe 4. Nexus-Protokoll wartet dahinter.",
    hint: "Gebäude → Forschungsarchiv",
    view: "infra",
    xp: 110,
    reward: bag({ crystal: 240, energy: 200 }),
    test: (c) => (c.buildings.archive || 0) >= 4,
  },
  {
    id: "expedition5",
    title: "Nebelgänger",
    blurb: "Überstehe fünf Expeditionen. Relikte liegen im Staub.",
    hint: "Galaxie → Expedition",
    view: "galaxy",
    xp: 120,
    reward: bag({ diamond: 18, crystal: 140 }),
    test: (c) => c.expeditionCount >= 5,
  },
  {
    id: "pirate3",
    title: "Kaperbrief",
    blurb: "Drei Piratenhorste genommen. Der Rim merkt deinen Namen.",
    hint: "Galaxie → orangener Ring",
    view: "galaxy",
    xp: 130,
    reward: bag({ metal: 520, helium: 240, diamond: 10 }),
    ships: { frigate: 1 },
    test: (c) => (c.pirateKills || 0) >= 3,
  },
  {
    id: "command6",
    title: "Kommando S6",
    blurb: "Kommando-Nexus Stufe 6. Fusion und Habitat werden denkbar.",
    hint: "Gebäude → Kommando-Nexus",
    view: "infra",
    xp: 120,
    reward: bag({ metal: 700, energy: 360, crystal: 120 }),
    test: (c) => (c.buildings.command || 0) >= 6,
  },
  {
    id: "cruiser1",
    title: "Kreuzer Kiel",
    blurb: "Baue deinen ersten Kreuzer. Danach ändert sich die Taktiktabelle.",
    hint: "Schiffswerft → Kreuzer (Waffen + Werft)",
    view: "yard",
    xp: 140,
    reward: bag({ metal: 600, titan: 140, helium: 200 }),
    test: (c) => (c.ships.cruiser || 0) >= 1,
  },
  {
    id: "colony6",
    chapter: "III · Hegemonie",
    title: "Sechs Banner",
    blurb: "Sechs Welten unter einer Flagge. Das ist ein Reich, kein Außenposten.",
    hint: "Kolonisation und Astrophysik erhöhen das Limit.",
    view: "galaxy",
    xp: 180,
    reward: bag({ metal: 1200, helium: 500, diamond: 28 }),
    test: (c) => c.planetCount >= 6,
  },
  {
    id: "combat15",
    title: "Schlachtfeld",
    blurb: "Gewinne 15 Kämpfe. Remnants, Piraten, Spieler — alles zählt.",
    hint: "Galaxie → Angriff",
    view: "galaxy",
    xp: 150,
    reward: bag({ metal: 700, titan: 160, helium: 260 }),
    ships: { bomber: 1 },
    test: (c) => c.combatWins >= 15,
  },
  {
    id: "habitat1",
    title: "Kuppelstadt",
    blurb: "Errichte Habitatdome. Lager platzen sonst mitten im Boom.",
    hint: "Gebäude → Habitatdome",
    view: "infra",
    xp: 130,
    reward: bag({ metal: 640, energy: 280, titan: 80 }),
    test: (c) => (c.buildings.habitat || 0) >= 1,
  },
  {
    id: "hyperspace1",
    title: "Falte",
    blurb: "Erforsche Hyperspace Stufe 1. Der äußere Ring rückt näher.",
    hint: "Forschung → Hyperspace (Warp 4, Archiv 5)",
    view: "research",
    xp: 160,
    reward: bag({ helium: 400, crystal: 280, diamond: 12 }),
    test: (c) => (c.techs.hyperspace || 0) >= 1,
  },
  {
    id: "destroyer1",
    title: "Kielbrecher",
    blurb: "Ein Zerstörer. Kapital-Jäger, teuer, unverzichtbar.",
    hint: "Schiffswerft → Zerstörer",
    view: "yard",
    xp: 170,
    reward: bag({ metal: 900, titan: 220, helium: 280 }),
    test: (c) => (c.ships.destroyer || 0) >= 1,
  },
  {
    id: "nanotech1",
    title: "Schwarmbau",
    blurb: "Nanotechnik Stufe 1. Die Naniten-Werft öffnet sich.",
    hint: "Forschung → Nanotechnik",
    view: "research",
    xp: 160,
    reward: bag({ crystal: 300, titan: 120, diamond: 10 }),
    test: (c) => (c.techs.nanotech || 0) >= 1,
  },
  {
    id: "fusion1",
    title: "Zündung",
    blurb: "Baue den Fusionsreaktor. Schwere Schilde brauchen Plasma, kein Sternenlicht.",
    hint: "Gebäude → Fusionsreaktor",
    view: "infra",
    xp: 150,
    reward: bag({ energy: 800, helium: 200, metal: 400 }),
    test: (c) => (c.buildings.fusion || 0) >= 1,
  },
  {
    id: "expedition12",
    title: "Kartograph",
    blurb: "Zwölf Expeditionen. Irgendwo da draußen liegt ein Relikt mit deinem Namen.",
    hint: "Galaxie → Expedition, Nexus-Riss lohnt extra",
    view: "galaxy",
    xp: 160,
    reward: bag({ diamond: 24, crystal: 200 }),
    test: (c) => c.expeditionCount >= 12,
  },
  {
    id: "citadel1",
    title: "Zitadelle",
    blurb: "Orbital-Zitadelle online. Der Orbit wird zur Festung.",
    hint: "Gebäude → Orbital-Zitadelle",
    view: "infra",
    xp: 180,
    reward: bag({ metal: 1000, titan: 280, energy: 400 }),
    test: (c) => (c.buildings.citadel || 0) >= 1,
  },
  {
    id: "battleship1",
    title: "Linienschiff",
    blurb: "Dein erstes Schlachtschiff. Danach führen andere den Rückzug.",
    hint: "Schiffswerft → Schlachtschiff",
    view: "yard",
    xp: 200,
    reward: bag({ metal: 1400, titan: 360, helium: 320, diamond: 16 }),
    test: (c) => (c.ships.battleship || 0) >= 1,
  },
  {
    id: "colony10",
    chapter: "IV · Nexus",
    title: "Zehn Sonnen",
    blurb: "Zehn Kolonien. Astrophysik und Kolonisation müssen mitwachsen.",
    hint: "Forschung → Astrophysik, dann kolonisieren",
    view: "galaxy",
    xp: 220,
    reward: bag({ metal: 1800, helium: 700, diamond: 36 }),
    test: (c) => c.planetCount >= 10,
  },
  {
    id: "graviton1",
    title: "Massewaffe",
    blurb: "Graviton Stufe 1. Endgame-Feuerleitung für Zerstörer und Dreadnoughts.",
    hint: "Forschung → Graviton-Waffe",
    view: "research",
    xp: 220,
    reward: bag({ crystal: 420, titan: 220, diamond: 20 }),
    test: (c) => (c.techs.graviton || 0) >= 1,
  },
  {
    id: "jumpgate1",
    title: "Tor",
    blurb: "Errichte ein Sprungtor. Der Rim ist plötzlich Nachbarschaft.",
    hint: "Gebäude → Sprungtor",
    view: "infra",
    xp: 200,
    reward: bag({ helium: 500, crystal: 360, diamond: 18 }),
    test: (c) => (c.buildings.jumpgate || 0) >= 1,
  },
  {
    id: "dread1",
    title: "Dreadnought",
    blurb: "Ein Dreadnought. Wer ihn sieht, verhandelt nicht.",
    hint: "Schiffswerft → Dreadnought",
    view: "yard",
    xp: 240,
    reward: bag({ metal: 2200, titan: 480, helium: 400, diamond: 24 }),
    test: (c) => (c.ships.dreadnought || 0) >= 1,
  },
  {
    id: "pirate10",
    title: "Rim-Jäger",
    blurb: "Zehn Piratenhorste. Ihre Stufen wachsen mit der Galaxie.",
    hint: "Galaxie → orangene Ringe, regelmäßig jagen",
    view: "galaxy",
    xp: 200,
    reward: bag({ metal: 1100, helium: 420, diamond: 20 }),
    ships: { cruiser: 1 },
    test: (c) => (c.pirateKills || 0) >= 10,
  },
  {
    id: "combat50",
    title: "Veteranenflotte",
    blurb: "Fünfzig Siege. Dein Name steht in den Funkprotokollen.",
    hint: "Kämpfe, Raids, Horste — alles zählt",
    view: "galaxy",
    xp: 220,
    reward: bag({ metal: 1600, titan: 300, helium: 400 }),
    test: (c) => c.combatWins >= 50,
  },
  {
    id: "command12",
    title: "Kommando S12",
    blurb: "Kommando-Nexus Stufe 12. Bauten dauern jetzt Tage — plane voraus.",
    hint: "Gebäude → Kommando-Nexus",
    view: "infra",
    xp: 200,
    reward: bag({ metal: 2000, energy: 900, crystal: 280 }),
    test: (c) => (c.buildings.command || 0) >= 12,
  },
  {
    id: "level25",
    title: "Befehlshaber",
    blurb: "Commander-Stufe 25. Der Ertragsbonus wird spürbar.",
    hint: "Aufträge, Expeditionen, Kämpfe geben XP",
    view: "progress",
    xp: 180,
    reward: bag({ crystal: 300, diamond: 16, energy: 400 }),
    test: (c) => c.level >= 25,
  },
  {
    id: "colony18",
    title: "Sternenkrone",
    blurb: "Achtzehn Welten. Nur wer Astrophysik treibt, kommt so weit.",
    hint: "Kolonisation 20 und Astrophysik für das Limit",
    view: "galaxy",
    xp: 260,
    reward: bag({ metal: 2800, helium: 900, diamond: 48 }),
    test: (c) => c.planetCount >= 18,
  },
  {
    id: "archive16",
    chapter: "V · Ewigkeit",
    title: "Quantenarchiv",
    blurb: "Forschungsarchiv Stufe 16. Die letzten Techs brauchen Jahre, nicht Stunden.",
    hint: "Gebäude → Forschungsarchiv, Quantenlabor stapelt",
    view: "infra",
    xp: 240,
    reward: bag({ crystal: 600, energy: 500, diamond: 22 }),
    test: (c) => (c.buildings.archive || 0) >= 16,
  },
  {
    id: "graviton6",
    title: "Gravitationsfeld",
    blurb: "Graviton Stufe 6. Kapital-Schiffe werden zur Präzisionswaffe.",
    hint: "Forschung → Graviton-Waffe",
    view: "research",
    xp: 260,
    reward: bag({ crystal: 700, titan: 360, diamond: 28 }),
    test: (c) => (c.techs.graviton || 0) >= 6,
  },
  {
    id: "combat120",
    title: "Kriegsmeister",
    blurb: "120 Siege. Die Galaxie kennt deine Taktiktabellen.",
    hint: "Weiter kämpfen, Piraten wachsen mit",
    view: "galaxy",
    xp: 280,
    reward: bag({ metal: 3200, titan: 500, helium: 600, diamond: 30 }),
    ships: { destroyer: 1 },
    test: (c) => c.combatWins >= 120,
  },
  {
    id: "expedition40",
    title: "Nebellegende",
    blurb: "Vierzig Expeditionen. Relikte, Diamanten, verlorene Rümpfe.",
    hint: "Galaxie → Expedition, Risse nutzen",
    view: "galaxy",
    xp: 240,
    reward: bag({ diamond: 40, crystal: 360 }),
    test: (c) => c.expeditionCount >= 40,
  },
  {
    id: "dread3",
    title: "Hochflotte",
    blurb: "Drei Dreadnoughts. Das ist keine Eskorte mehr, das ist Politik.",
    hint: "Schiffswerft → Dreadnought",
    view: "yard",
    xp: 300,
    reward: bag({ metal: 4000, titan: 800, helium: 700, diamond: 40 }),
    test: (c) => (c.ships.dreadnought || 0) >= 3,
  },
  {
    id: "colony28",
    title: "Imperium",
    blurb: "Achtundzwanzig Welten. Das Limit liegt bei 36 — Astrophysik bis zum Schluss.",
    hint: "Kolonisation und Astrophysik auf Maximalstufe",
    view: "galaxy",
    xp: 320,
    reward: bag({ metal: 5000, helium: 1400, diamond: 64 }),
    test: (c) => c.planetCount >= 28,
  },
  {
    id: "level50",
    title: "Nexus-Kommandant",
    blurb: "Commander-Stufe 50. Der lange Weg beginnt erst hier.",
    hint: "Wochenorders, Expeditionen, Kampagne",
    view: "progress",
    xp: 280,
    reward: bag({ crystal: 800, diamond: 36, energy: 700 }),
    test: (c) => c.level >= 50,
  },
  {
    id: "pirate30",
    title: "Hortbrecher",
    blurb: "Dreißig Piratenhorste. Stufe 16 wartet am Rand der Karte.",
    hint: "Galaxie → Piraten, sie wachsen nach",
    view: "galaxy",
    xp: 300,
    reward: bag({ metal: 3600, helium: 900, diamond: 40 }),
    ships: { battleship: 1 },
    test: (c) => (c.pirateKills || 0) >= 30,
  },
  {
    id: "level80",
    title: "Ewige Wache",
    blurb: "Commander-Stufe 80. Wenige halten so lange durch. Die Galaxie gehört dir nicht — du gehörst ihr.",
    hint: "Spielen. Jeden Tag. Über Jahre.",
    view: "progress",
    xp: 400,
    reward: bag({ metal: 8000, helium: 2400, titan: 1200, crystal: 1200, diamond: 80 }),
    ships: { dreadnought: 1 },
    test: (c) => c.level >= 80,
  },
];

const TIER_RANK = { bronze: 1, silver: 2, gold: 3, nexus: 4 };
const TIER_XP = { bronze: 25, silver: 50, gold: 90, nexus: 160 };
const TIER_NAME = { bronze: "Bronze", silver: "Silber", gold: "Gold", nexus: "Nexus" };
const MEDAL_CATS = {
  combat: "Kampf",
  explore: "Erkundung",
  expand: "Expansion",
  fleet: "Flotte",
  science: "Forschung",
  command: "Kommando",
};

const MEDALS = [
  {
    id: "first_build",
    title: "Erster Stein",
    blurb: "Schließe deinen ersten Kampagnen-Auftrag ab.",
    cat: "command",
    tier: "bronze",
    test: (s) => s.contractsClaimed >= 1,
  },
  {
    id: "first_blood",
    title: "Feuertaufe",
    blurb: "Gewinne deinen ersten Kampf.",
    cat: "combat",
    tier: "bronze",
    test: (s) => s.combatWins >= 1,
  },
  {
    id: "first_spy",
    title: "Auge im Orbit",
    blurb: "Schicke die erste Sonde auf Spionage.",
    cat: "explore",
    tier: "bronze",
    test: (s) => s.spyCount >= 1,
  },
  {
    id: "swarm",
    title: "Schwarm",
    blurb: "Stationiere mindestens 25 Jäger.",
    cat: "fleet",
    tier: "bronze",
    test: (s) => s.fighters >= 25,
  },
  {
    id: "login7",
    title: "Wache",
    blurb: "Sieben Tage Login-Serie.",
    cat: "command",
    tier: "bronze",
    art: "veteran",
    test: (s) => s.streak >= 7,
  },
  {
    id: "raid_shield",
    title: "Prisenrecht",
    blurb: "Wehre einen Piraten-Raid ab.",
    cat: "combat",
    tier: "silver",
    test: (s) => s.raidWins >= 1,
  },
  {
    id: "nebula",
    title: "Sternenläufer",
    blurb: "Überstehe drei Expeditionen.",
    cat: "explore",
    tier: "silver",
    test: (s) => s.expeditions >= 3,
  },
  {
    id: "colonizer",
    title: "Weltenbauer",
    blurb: "Besitze mindestens drei Welten.",
    cat: "expand",
    tier: "silver",
    test: (s) => s.planets >= 3,
  },
  {
    id: "archive",
    title: "Archivar",
    blurb: "Erforsche acht verschiedene Technologien.",
    cat: "science",
    tier: "silver",
    test: (s) => s.techKinds >= 8,
  },
  {
    id: "kaper",
    title: "Kaperer",
    blurb: "Nimm drei Piratenhorste.",
    cat: "combat",
    tier: "silver",
    art: "raid_shield",
    test: (s) => s.pirateKills >= 3,
  },
  {
    id: "wing",
    title: "Geschwader",
    blurb: "100 Jäger unter deiner Flagge.",
    cat: "fleet",
    tier: "silver",
    art: "swarm",
    test: (s) => s.fighters >= 100,
  },
  {
    id: "warlord",
    title: "Orbitbrecher",
    blurb: "Gewinne zehn Schlachten.",
    cat: "combat",
    tier: "gold",
    test: (s) => s.combatWins >= 10,
  },
  {
    id: "veteran",
    title: "Veteran",
    blurb: "Erreiche Commander-Stufe 10.",
    cat: "command",
    tier: "gold",
    test: (s) => s.level >= 10,
  },
  {
    id: "hegemon",
    title: "Hegemon",
    blurb: "Sechs Kolonien unter deiner Flagge.",
    cat: "expand",
    tier: "gold",
    test: (s) => s.planets >= 6,
  },
  {
    id: "cartograph",
    title: "Kartograph",
    blurb: "Zwölf Expeditionen überlebt.",
    cat: "explore",
    tier: "gold",
    art: "nebula",
    test: (s) => s.expeditions >= 12,
  },
  {
    id: "line",
    title: "Linie",
    blurb: "Ein Schlachtschiff oder Dreadnought im Hangar.",
    cat: "fleet",
    tier: "gold",
    art: "admiral",
    test: (s) => s.capitals >= 1,
  },
  {
    id: "sage",
    title: "Weiser",
    blurb: "Alle Forschungszweige mindestens einmal geöffnet.",
    cat: "science",
    tier: "gold",
    art: "archive",
    test: (s) => s.techKinds >= 16,
  },
  {
    id: "streak30",
    title: "Unbeirrt",
    blurb: "Dreißig Tage Login-Serie.",
    cat: "command",
    tier: "gold",
    art: "veteran",
    test: (s) => s.streak >= 30,
  },
  {
    id: "admiral",
    title: "Nexus-Admiral",
    blurb: "Erreiche Commander-Stufe 20.",
    cat: "command",
    tier: "nexus",
    test: (s) => s.level >= 20,
  },
  {
    id: "marshal",
    title: "Marschall",
    blurb: "Fünfzig Schlachten gewonnen.",
    cat: "combat",
    tier: "nexus",
    art: "warlord",
    test: (s) => s.combatWins >= 50,
  },
  {
    id: "crown",
    title: "Sternenkrone",
    blurb: "Fünfzehn Kolonien.",
    cat: "expand",
    tier: "nexus",
    art: "hegemon",
    test: (s) => s.planets >= 15,
  },
  {
    id: "voidwalker",
    title: "Leerenläufer",
    blurb: "Vierzig Expeditionen.",
    cat: "explore",
    tier: "nexus",
    art: "nebula",
    test: (s) => s.expeditions >= 40,
  },
  {
    id: "dread_flag",
    title: "Schreckensflagge",
    blurb: "Drei Dreadnoughts.",
    cat: "fleet",
    tier: "nexus",
    art: "admiral",
    test: (s) => (s.dreadnoughts || 0) >= 3,
  },
  {
    id: "horizon",
    title: "Horizont",
    blurb: "Commander-Stufe 50.",
    cat: "command",
    tier: "nexus",
    art: "admiral",
    test: (s) => s.level >= 50,
  },
  {
    id: "year_watch",
    title: "Jahreswache",
    blurb: "365 Tage Login-Serie. Die Galaxie schläft nicht.",
    cat: "command",
    tier: "nexus",
    art: "veteran",
    test: (s) => s.streak >= 365,
  },
  {
    id: "rim_hunter",
    title: "Rim-Jäger",
    blurb: "Dreißig Piratenhorste genommen.",
    cat: "combat",
    tier: "nexus",
    art: "raid_shield",
    test: (s) => s.pirateKills >= 30,
  },
  {
    id: "imperium",
    title: "Imperium",
    blurb: "Achtundzwanzig Welten unter einer Flagge.",
    cat: "expand",
    tier: "nexus",
    art: "hegemon",
    test: (s) => s.planets >= 28,
  },
  {
    id: "eternal",
    title: "Ewige Wache",
    blurb: "Commander-Stufe 80. Wenige kommen so weit.",
    cat: "command",
    tier: "nexus",
    art: "admiral",
    test: (s) => s.level >= 80,
  },
];

function commanderLevel(xp) {
  return Math.min(99, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 42)));
}

function xpForLevel(level) {
  const l = Math.max(1, Math.min(99, Number(level) || 1));
  return 42 * (l - 1) * (l - 1);
}

function productionBonus(xp) {
  return 0.02 * (commanderLevel(xp) - 1);
}

function empireScore(db, empireId) {
  let score = 0;
  const planets = db.prepare("SELECT id FROM planets WHERE empire_id = ?").all(empireId);
  score += planets.length * 120;
  for (const p of planets) {
    const b = db.prepare("SELECT building_id, level FROM buildings WHERE planet_id = ?").all(p.id);
    for (const row of b) score += (row.level || 0) * 8;
    const s = db.prepare("SELECT ship_id, count FROM ships WHERE planet_id = ?").all(p.id);
    for (const row of s) {
      const spec = SHIPS[row.ship_id];
      const w = spec ? spec.cost.metal / 20 + spec.attack / 4 : 1;
      score += Math.floor((row.count || 0) * w);
    }
    try {
      const d = db.prepare("SELECT defense_id, count FROM defenses WHERE planet_id = ?").all(p.id);
      for (const row of d) {
        const spec = DEFENSES[row.defense_id];
        const w = spec ? spec.cost.metal / 18 + spec.attack / 5 : 1;
        score += Math.floor((row.count || 0) * w);
      }
    } catch {
      /* schema not ready */
    }
  }
  const techs = db.prepare("SELECT level FROM research WHERE empire_id = ?").all(empireId);
  for (const t of techs) score += (t.level || 0) * 22;
  return Math.floor(score);
}

function contractDone(ctx, id) {
  const spec = CONTRACTS.find((c) => c.id === id);
  return spec?.test ? !!spec.test(ctx) : false;
}

function gatherCtx(db, empire, planet) {
  const buildings = {};
  const ships = {};
  const owned = db.prepare("SELECT id FROM planets WHERE empire_id = ?").all(empire.id);
  for (const p of owned) {
    for (const r of db.prepare("SELECT building_id, level FROM buildings WHERE planet_id = ?").all(p.id)) {
      buildings[r.building_id] = Math.max(buildings[r.building_id] || 0, r.level);
    }
    for (const r of db.prepare("SELECT ship_id, count FROM ships WHERE planet_id = ?").all(p.id)) {
      ships[r.ship_id] = (ships[r.ship_id] || 0) + r.count;
    }
    try {
      for (const r of db.prepare("SELECT defense_id, count FROM defenses WHERE planet_id = ?").all(p.id)) {
        ships["def:" + r.defense_id] = (ships["def:" + r.defense_id] || 0) + r.count;
      }
    } catch {
      /* schema not ready */
    }
  }
  const techs = {};
  for (const r of db.prepare("SELECT tech_id, level FROM research WHERE empire_id = ?").all(empire.id)) {
    techs[r.tech_id] = r.level;
  }
  const spyCount = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND kind = 'spy'").get(empire.id).n;
  const combatWins = db
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND kind = 'combat' AND json_extract(body, '$.youWin') = 1")
    .get(empire.id).n;
  const expeditionCount = db
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND kind = 'expedition'")
    .get(empire.id).n;
  const raidWins = db
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND kind = 'combat' AND title LIKE 'Raid abgewehrt%'")
    .get(empire.id).n;
  const pirateKills = db
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE empire_id = ? AND kind = 'combat' AND title LIKE 'Piratenhorst%'")
    .get(empire.id).n;
  const contractsClaimed = db
    .prepare("SELECT COUNT(*) AS n FROM quests WHERE empire_id = ? AND quest_id NOT LIKE 'op:%'")
    .get(empire.id).n;
  const shipTotal = Object.entries(ships)
    .filter(([k]) => !k.startsWith("def:"))
    .reduce((s, [, n]) => s + (n || 0), 0);
  return {
    buildings,
    ships,
    techs,
    spyCount,
    combatWins,
    expeditionCount,
    raidWins,
    pirateKills,
    planetCount: owned.length,
    planet,
    contractsClaimed,
    techKinds: Object.values(techs).filter((n) => n > 0).length,
    techLevels: Object.values(techs).reduce((s, n) => s + (n || 0), 0),
    fighters: ships.fighter || 0,
    capitals: (ships.battleship || 0) + (ships.dreadnought || 0),
    dreadnoughts: ships.dreadnought || 0,
    shipTotal,
    level: commanderLevel(empire.xp || 0),
    streak: empire.streak || 0,
    planets: owned.length,
    expeditions: expeditionCount,
    daysAlive: Math.max(1, Math.floor((Date.now() - (empire.created_at || Date.now())) / 86400000) + 1),
  };
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashDay(s) {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function evalCheck(ctx, check) {
  if (!check) return false;
  switch (check.type) {
    case "building":
      return (ctx.buildings[check.id] || 0) >= check.min;
    case "ships":
      return (ctx.ships[check.id] || 0) >= check.min;
    case "def":
      return (ctx.ships["def:" + check.id] || 0) >= check.min;
    case "tech":
      return (ctx.techs[check.id] || 0) >= check.min;
    case "stat":
      return (ctx[check.key] || 0) >= check.min;
    case "resource":
      return (Number(ctx.planet?.[check.id]) || 0) >= check.min;
    default:
      return false;
  }
}

function rewardFor(level, base) {
  const f = 1 + Math.min(12, Math.max(0, level)) * 0.07;
  return scaleBag(base, f);
}

function buildDailyPool(ctx) {
  const pool = [];
  const lv = ctx.level || 1;
  const pushB = (id, name, view, base) => {
    const spec = BUILDINGS[id];
    const cur = ctx.buildings[id] || 0;
    const max = spec?.max || 28;
    if (cur >= max) return;
    const target = cur + 1;
    pool.push({
      id: `b_${id}_${target}`,
      title: `Tagesorder: ${name} S${target}`,
      blurb: `${name} auf Stufe ${target} bringen.`,
      view,
      xp: 35 + Math.min(50, target * 2),
      reward: rewardFor(target, base),
      check: { type: "building", id, min: target },
    });
  };
  pushB("matter_mine", "Metall-Mine", "infra", bag({ metal: 260, energy: 90 }));
  pushB("helium_well", "Helium-3-Kollektor", "infra", bag({ helium: 200, metal: 80 }));
  pushB("energy_array", "Energie-Array", "infra", bag({ energy: 240, metal: 80 }));
  pushB("command", "Kommando-Nexus", "infra", bag({ metal: 220, crystal: 50, energy: 100 }));
  pushB("silo", "Speichervault", "infra", bag({ metal: 180, helium: 70, titan: 20 }));
  pushB("shipyard", "Werft", "infra", bag({ metal: 200, helium: 80, titan: 30 }));
  pushB("archive", "Forschungsarchiv", "infra", bag({ crystal: 120, energy: 100 }));
  pushB("titan_extractor", "Titan-Extraktor", "infra", bag({ titan: 80, metal: 140 }));
  if ((ctx.buildings.shield || 0) > 0) pushB("shield", "Schildgenerator", "infra", bag({ metal: 240, energy: 160, titan: 40 }));

  const fighterNeed = (ctx.fighters || 0) + Math.max(4, Math.ceil(Math.max(6, ctx.fighters || 0) * 0.1));
  pool.push({
    id: `fighters_${fighterNeed}`,
    title: `Tagesorder: ${fighterNeed} Jäger`,
    blurb: `Mindestens ${fighterNeed} Jäger stationieren.`,
    view: "yard",
    xp: 40 + Math.min(40, Math.floor(fighterNeed / 8)),
    reward: rewardFor(lv, bag({ metal: 160, helium: 90 })),
    ships: { probe: 1 },
    check: { type: "ships", id: "fighter", min: fighterNeed },
  });

  const flakNeed = (ctx.ships["def:flak"] || 0) + Math.max(3, Math.ceil((ctx.ships["def:flak"] || 0) * 0.12 || 3));
  pool.push({
    id: `flak_${flakNeed}`,
    title: `Tagesorder: ${flakNeed} Flak`,
    blurb: `${flakNeed} Flak-Batterien in den Orbit.`,
    view: "defense",
    xp: 38,
    reward: rewardFor(lv, bag({ metal: 140, energy: 80 })),
    check: { type: "def", id: "flak", min: flakNeed },
  });

  const metalNeed = Math.max(1800, Math.floor((ctx.planet?.metal || 800) * 1.12) + 350);
  pool.push({
    id: `stock_${metalNeed}`,
    title: "Tagesorder: Reserve",
    blurb: `${metalNeed} Metall auf dem Fokus-Planeten lagern.`,
    view: "economy",
    xp: 32,
    reward: rewardFor(lv, bag({ helium: 100, crystal: 40 })),
    check: { type: "resource", id: "metal", min: metalNeed },
  });

  const expT = (ctx.expeditionCount || 0) + 1;
  pool.push({
    id: `exp_${expT}`,
    title: "Tagesorder: Expedition",
    blurb: "Starte eine Expedition. Der Nebel zahlt Diamanten.",
    view: "galaxy",
    xp: 50,
    reward: rewardFor(lv, bag({ diamond: 4, crystal: 60 })),
    check: { type: "stat", key: "expeditionCount", min: expT },
  });

  const winT = (ctx.combatWins || 0) + 1;
  pool.push({
    id: `win_${winT}`,
    title: "Tagesorder: Gefecht",
    blurb: "Gewinne einen Kampf — Remnants, Piraten oder Spieler.",
    view: "galaxy",
    xp: 55,
    reward: rewardFor(lv, bag({ metal: 220, helium: 90, titan: 30 })),
    check: { type: "stat", key: "combatWins", min: winT },
  });

  const spyT = (ctx.spyCount || 0) + 1;
  pool.push({
    id: `spy_${spyT}`,
    title: "Tagesorder: Sonde",
    blurb: "Schicke eine Sonde auf Spionage.",
    view: "galaxy",
    xp: 40,
    reward: rewardFor(lv, bag({ crystal: 70, helium: 50 })),
    check: { type: "stat", key: "spyCount", min: spyT },
  });

  const pirateT = (ctx.pirateKills || 0) + 1;
  if (lv >= 4) {
    pool.push({
      id: `pirate_${pirateT}`,
      title: "Tagesorder: Kaper",
      blurb: "Nimm einen Piratenhorst. Orange Ringe auf der Karte.",
      view: "galaxy",
      xp: 70,
      reward: rewardFor(lv, bag({ metal: 280, helium: 120, diamond: 5 })),
      check: { type: "stat", key: "pirateKills", min: pirateT },
    });
  }

  const techIds = Object.keys(TECHS);
  for (const id of techIds) {
    const spec = TECHS[id];
    const cur = ctx.techs[id] || 0;
    if (cur <= 0 || cur >= (spec.max || 20)) continue;
    if ((ctx.buildings.archive || 0) < 1) continue;
    pool.push({
      id: `t_${id}_${cur + 1}`,
      title: `Tagesorder: ${spec.name} S${cur + 1}`,
      blurb: `${spec.name} auf Stufe ${cur + 1} erforschen.`,
      view: "research",
      xp: 48 + cur,
      reward: rewardFor(cur, bag({ crystal: 80, energy: 80 })),
      check: { type: "tech", id, min: cur + 1 },
    });
  }
  if ((ctx.techs.energy_core || 0) < 1) {
    pool.push({
      id: "t_energy_core_1",
      title: "Tagesorder: Kerne",
      blurb: "Energiekerne Stufe 1 erforschen.",
      view: "research",
      xp: 50,
      reward: bag({ energy: 200, crystal: 50 }),
      check: { type: "tech", id: "energy_core", min: 1 },
    });
  }
  return pool;
}

function pickFromPool(pool, seed, count) {
  const picks = [];
  const used = new Set();
  let i = 0;
  const n = Math.max(1, pool.length);
  while (picks.length < count && i < n * 4) {
    const idx = (seed + i * 17) % n;
    i += 1;
    const spec = pool[idx];
    if (!spec || used.has(spec.id)) continue;
    used.add(spec.id);
    picks.push(spec);
  }
  return picks;
}

function parseStoredOps(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || !Array.isArray(data.ops)) return null;
    return data;
  } catch {
    return null;
  }
}

function hydrateOps(specs, ctx, claimed, prefix) {
  return specs.map((spec) => {
    const qid = `${prefix}${spec.id}`;
    return {
      id: spec.id,
      questId: qid,
      title: spec.title,
      blurb: spec.blurb,
      view: spec.view,
      xp: spec.xp,
      reward: spec.reward,
      ships: spec.ships || null,
      complete: evalCheck(ctx, spec.check),
      claimed: claimed.has(qid),
    };
  });
}

function listOps(db, empire, planet) {
  const day = dayKey();
  const ctx = gatherCtx(db, empire, planet);
  const claimed = new Set(
    db.prepare("SELECT quest_id FROM quests WHERE empire_id = ?").all(empire.id).map((r) => r.quest_id)
  );
  let stored = parseStoredOps(empire.daily_ops);
  if (!stored || stored.day !== day || stored.ops.length < 3) {
    const seed = hashDay(day + ":" + empire.id);
    stored = { day, ops: pickFromPool(buildDailyPool(ctx), seed, 3) };
    db.prepare("UPDATE empires SET daily_ops = ? WHERE id = ?").run(JSON.stringify(stored), empire.id);
    empire.daily_ops = JSON.stringify(stored);
  }
  return hydrateOps(stored.ops, ctx, claimed, `op:${day}:`);
}

function claimOp(db, empire, planet, opId) {
  const list = listOps(db, empire, planet);
  const c = list.find((x) => x.id === opId);
  if (!c) throw new Error("Unbekannte Tagesorder.");
  if (c.claimed) throw new Error("Heute schon abgeholt.");
  if (!c.complete) throw new Error("Noch nicht erfüllt.");
  db.prepare("INSERT INTO quests(empire_id, quest_id, claimed_at) VALUES(?, ?, ?)").run(empire.id, c.questId, Date.now());
  db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(c.xp, empire.id);
  return c;
}

function weekKey() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function buildWeeklyPool(ctx) {
  const lv = ctx.level || 1;
  const pool = [];
  const cmd = ctx.buildings.command || 0;
  const cmdMax = BUILDINGS.command?.max || 28;
  if (cmd < cmdMax) {
    pool.push({
      id: `wk_cmd_${cmd + 1}`,
      title: `Wochenorder: Kommando S${cmd + 1}`,
      blurb: `Kommando-Nexus auf Stufe ${cmd + 1} — der lange Bau der Woche.`,
      view: "infra",
      xp: 90 + cmd * 4,
      reward: rewardFor(cmd, bag({ metal: 700, energy: 320, crystal: 120, diamond: 8 })),
      check: { type: "building", id: "command", min: cmd + 1 },
    });
  }
  pool.push({
    id: `wk_exp_${(ctx.expeditionCount || 0) + 3}`,
    title: "Wochenorder: Drei Expeditionen",
    blurb: "Drei Expeditionen diese Woche. Relikte und Diamanten.",
    view: "galaxy",
    xp: 110,
    reward: rewardFor(lv, bag({ diamond: 14, crystal: 180, helium: 120 })),
    check: { type: "stat", key: "expeditionCount", min: (ctx.expeditionCount || 0) + 3 },
  });
  pool.push({
    id: `wk_win_${(ctx.combatWins || 0) + 5}`,
    title: "Wochenorder: Fünf Siege",
    blurb: "Gewinne fünf Kämpfe. Piraten und Remnants zählen.",
    view: "galaxy",
    xp: 120,
    reward: rewardFor(lv, bag({ metal: 600, titan: 140, helium: 220 })),
    ships: { fighter: 2 },
    check: { type: "stat", key: "combatWins", min: (ctx.combatWins || 0) + 5 },
  });
  if (lv >= 5) {
    pool.push({
      id: `wk_pirate_${(ctx.pirateKills || 0) + 2}`,
      title: "Wochenorder: Zwei Horste",
      blurb: "Nimm zwei Piratenhorste. Sie werden stärker, je länger du wartest.",
      view: "galaxy",
      xp: 140,
      reward: rewardFor(lv, bag({ metal: 700, helium: 240, diamond: 12 })),
      check: { type: "stat", key: "pirateKills", min: (ctx.pirateKills || 0) + 2 },
    });
  }
  const mine = ctx.buildings.matter_mine || 0;
  if (mine < (BUILDINGS.matter_mine?.max || 36)) {
    pool.push({
      id: `wk_mine_${mine + 2}`,
      title: `Wochenorder: Mine S${mine + 2}`,
      blurb: `Metall-Mine zwei Stufen heben, auf ${mine + 2}.`,
      view: "infra",
      xp: 100,
      reward: rewardFor(mine, bag({ metal: 800, energy: 200 })),
      check: { type: "building", id: "matter_mine", min: mine + 2 },
    });
  }
  const colT = (ctx.planetCount || 1) + 1;
  if (ctx.planetCount < 36) {
    pool.push({
      id: `wk_col_${colT}`,
      title: "Wochenorder: Neue Welt",
      blurb: "Kolonisiere einen weiteren Planeten.",
      view: "galaxy",
      xp: 160,
      reward: rewardFor(lv, bag({ metal: 900, helium: 360, diamond: 20 })),
      check: { type: "stat", key: "planetCount", min: colT },
    });
  }
  return pool;
}

function listWeekly(db, empire, planet) {
  const week = weekKey();
  const ctx = gatherCtx(db, empire, planet);
  const claimed = new Set(
    db.prepare("SELECT quest_id FROM quests WHERE empire_id = ?").all(empire.id).map((r) => r.quest_id)
  );
  let stored = parseStoredOps(empire.weekly_ops);
  if (!stored || stored.week !== week || !stored.ops?.length) {
    const seed = hashDay(week + ":" + empire.id);
    stored = { week, ops: pickFromPool(buildWeeklyPool(ctx), seed, 1) };
    db.prepare("UPDATE empires SET weekly_ops = ? WHERE id = ?").run(JSON.stringify(stored), empire.id);
    empire.weekly_ops = JSON.stringify(stored);
  }
  return hydrateOps(stored.ops, ctx, claimed, `wk:${week}:`);
}

function claimWeekly(db, empire, planet, opId) {
  const list = listWeekly(db, empire, planet);
  const c = list.find((x) => x.id === opId);
  if (!c) throw new Error("Unbekannte Wochenorder.");
  if (c.claimed) throw new Error("Diese Woche schon abgeholt.");
  if (!c.complete) throw new Error("Noch nicht erfüllt.");
  db.prepare("INSERT INTO quests(empire_id, quest_id, claimed_at) VALUES(?, ?, ?)").run(empire.id, c.questId, Date.now());
  db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(c.xp, empire.id);
  return c;
}

function listContracts(db, empire, planet) {
  const claimed = new Set(
    db.prepare("SELECT quest_id FROM quests WHERE empire_id = ?").all(empire.id).map((r) => r.quest_id)
  );
  const ctx = gatherCtx(db, empire, planet);
  return CONTRACTS.map((c, i) => {
    const prev = i === 0 || claimed.has(CONTRACTS[i - 1].id);
    const done = contractDone(ctx, c.id);
    const taken = claimed.has(c.id);
    return {
      ...c,
      locked: !prev,
      complete: prev && done && !taken,
      claimed: taken,
      reward: c.reward,
    };
  });
}

function claimContract(db, empire, planet, questId) {
  const list = listContracts(db, empire, planet);
  const c = list.find((x) => x.id === questId);
  if (!c) throw new Error("Unbekannter Auftrag.");
  if (c.locked) throw new Error("Vorherigen Auftrag zuerst erledigen.");
  if (c.claimed) throw new Error("Bereits abgeholt.");
  if (!c.complete) throw new Error("Noch nicht erfüllt.");
  db.prepare("INSERT INTO quests(empire_id, quest_id, claimed_at) VALUES(?, ?, ?)").run(empire.id, questId, Date.now());
  db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(c.xp, empire.id);
  return c;
}

function nextAction(contracts) {
  const open = contracts.find((c) => !c.claimed && !c.locked);
  if (!open) return { text: "Dominium ausbauen. Expeditionen bringen seltene Beute.", view: "galaxy" };
  if (open.complete) return { text: `Auftrag abholen: ${open.title}`, view: "command", claim: open.id };
  return { text: open.hint || open.blurb, view: open.view, title: open.title };
}

function medalPublic(m, extra = {}) {
  return {
    id: m.id,
    title: m.title,
    blurb: m.blurb,
    cat: m.cat,
    catName: MEDAL_CATS[m.cat] || m.cat,
    tier: m.tier,
    tierName: TIER_NAME[m.tier] || m.tier,
    image: `/assets/medals/${m.art || m.id}.jpg`,
    xp: TIER_XP[m.tier] || 0,
    ...extra,
  };
}

function compactFromIds(ids) {
  const byId = Object.fromEntries(MEDALS.map((m) => [m.id, m]));
  return (ids || [])
    .map((id) => byId[id])
    .filter(Boolean)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.title.localeCompare(b.title, "de"))
    .map((m) => medalPublic(m, { earned: true }));
}

function allEarnedMap(db) {
  const rows = db.prepare("SELECT empire_id, medal_id FROM medals").all();
  const map = {};
  for (const r of rows) (map[r.empire_id] ||= []).push(r.medal_id);
  return map;
}

function earnedRows(db, empireId) {
  return db.prepare("SELECT medal_id, earned_at FROM medals WHERE empire_id = ? ORDER BY earned_at").all(empireId);
}

function listMedals(db, empireId) {
  const have = new Map(earnedRows(db, empireId).map((r) => [r.medal_id, r.earned_at]));
  return MEDALS.map((m) => medalPublic(m, { earned: have.has(m.id), earnedAt: have.get(m.id) || null }));
}

function commanderTitle(medals) {
  const earned = medals.filter((m) => m.earned).sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  return earned[0]?.title || "Neuer Kommandant";
}

function awardMedals(db, empire, planet) {
  const stats = gatherCtx(db, empire, planet);
  const have = new Set(earnedRows(db, empire.id).map((r) => r.medal_id));
  const ins = db.prepare("INSERT OR IGNORE INTO medals(empire_id, medal_id, earned_at) VALUES(?, ?, ?)");
  const fresh = [];
  const t = Date.now();
  for (const m of MEDALS) {
    if (have.has(m.id)) continue;
    if (!m.test(stats)) continue;
    ins.run(empire.id, m.id, t);
    const xp = TIER_XP[m.tier] || 0;
    if (xp) db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(xp, empire.id);
    fresh.push(medalPublic(m, { earned: true, earnedAt: t, new: true }));
  }
  return fresh;
}

function progressData(db, empire, planet) {
  const contracts = listContracts(db, empire, planet);
  const medals = listMedals(db, empire.id);
  const earned = medals.filter((m) => m.earned);
  const openIdx = contracts.findIndex((c) => !c.claimed && !c.locked);
  const windowStart = Math.max(0, (openIdx < 0 ? contracts.length : openIdx) - 3);
  const steps = contracts.slice(windowStart, windowStart + 8).map((c, i) => ({
    number: windowStart + i + 1,
    title: c.title,
    text: c.blurb,
    done: !!c.claimed,
    current: !c.claimed && !c.locked,
  }));
  const lvl = commanderLevel(empire.xp || 0);
  const lo = xpForLevel(lvl);
  const hi = xpForLevel(Math.min(99, lvl + 1));
  const stats = gatherCtx(db, empire, planet);
  return {
    tutorial: {
      steps,
      completed: contracts.filter((c) => c.claimed).length,
      total: contracts.length,
    },
    medals,
    earned,
    cats: MEDAL_CATS,
    title: commanderTitle(medals),
    earnedCount: earned.length,
    total: medals.length,
    level: lvl,
    xp: empire.xp || 0,
    xpLo: lo,
    xpHi: hi,
    xpPct: hi <= lo ? 100 : Math.min(100, Math.round(((empire.xp || 0) - lo) / (hi - lo) * 100)),
    streak: empire.streak || 0,
    stats: {
      combatWins: stats.combatWins,
      expeditions: stats.expeditionCount,
      planets: stats.planetCount,
      spy: stats.spyCount,
      fighters: stats.fighters,
    },
  };
}

function publicProfile(db, empire) {
  const medals = listMedals(db, empire.id).filter((m) => m.earned);
  const al = db
    .prepare(
      `SELECT a.id, a.tag, a.name, a.color FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id WHERE m.empire_id = ?`
    )
    .get(empire.id);
  const stats = gatherCtx(db, empire, null);
  return {
    id: empire.id,
    name: empire.name,
    username: empire.username || "",
    color: empire.color,
    avatar: require("./social").avatarUrl(empire),
    species: empire.species || "terran",
    level: commanderLevel(empire.xp || 0),
    xp: empire.xp || 0,
    score: empireScore(db, empire.id),
    planets: stats.planetCount,
    streak: empire.streak || 0,
    createdAt: empire.created_at || 0,
    title: commanderTitle(medals.map((m) => ({ ...m, earned: true }))),
    medals,
    alliance: al ? { id: al.id, tag: al.tag, name: al.name, color: al.color } : null,
    stats: {
      combatWins: stats.combatWins,
      expeditions: stats.expeditionCount,
      spy: stats.spyCount,
      research: stats.researchScore || Object.values(stats.techs || {}).reduce((n, v) => n + (v || 0), 0),
    },
  };
}

function dailyReward(streak) {
  const s = Math.min(14, Math.max(1, streak));
  return bag({
    metal: 80 * s,
    helium: 40 * s,
    energy: 80 * s,
    crystal: 20 * s,
    titan: 8 * s,
    diamond: s >= 5 ? 2 : 0,
  });
}

function applyDaily(db, empire, homePlanet) {
  const day = new Date().toISOString().slice(0, 10);
  if (empire.last_daily === day) return null;
  let streak = 1;
  if (empire.last_daily) {
    const prev = new Date(empire.last_daily + "T12:00:00Z");
    const today = new Date(day + "T12:00:00Z");
    const diff = Math.round((today - prev) / 86400000);
    if (diff === 1) streak = (empire.streak || 1) + 1;
  }
  const reward = dailyReward(streak);
  db.prepare("UPDATE empires SET last_daily = ?, streak = ? WHERE id = ?").run(day, streak, empire.id);
  return { streak, reward, homeId: homePlanet?.id };
}

function expeditionRoll(ships) {
  const power = Object.entries(ships || {}).reduce((s, [id, n]) => s + (SHIPS[id]?.hull || 4) * n, 0);
  const probes = ships.probe || 0;
  const cargo = ships.cargo || 0;
  const r = Math.random();
  if (r < 0.08) {
    return { kind: "nothing", title: "Leerer Nebel", text: "Nur Interferenzen. Die Flotte kehrt unverrichteter Dinge zurück.", loot: emptyBag(), ships: {} };
  }
  if (r < 0.16) {
    const lost = {};
    if ((ships.fighter || 0) > 0) lost.fighter = 1;
    return {
      kind: "ambush",
      title: "Piraten-Hinterhalt",
      text: "Ein Schwarm kapert den Verband. Verluste, kaum Beute.",
      loot: bag({ metal: 40, helium: 20 }),
      ships: lost,
    };
  }
  if (r < 0.28 && probes > 0) {
    return {
      kind: "map",
      title: "Sternenkarte",
      text: "Die Sonden kartieren eine alte Warp-Gasse. Commander-XP und Kristalle.",
      loot: bag({ crystal: 90 + Math.floor(Math.random() * 80), helium: 40 }),
      ships: {},
      xp: 30,
    };
  }
  if (r < 0.38) {
    const found = {};
    if (Math.random() < 0.7) found.fighter = 1 + Math.floor(Math.random() * 2);
    else found.probe = 2;
    return {
      kind: "ships",
      title: "Treibgut",
      text: "Ein verlassener Konvoi. Intakte Rümpfe, bereit zum Schleppen.",
      loot: emptyBag(),
      shipsGain: found,
    };
  }
  if (r < 0.5) {
    return {
      kind: "rare",
      title: "Diamantader",
      text: "Ein Brocken Quantum-Gitter im Staubring. Selten und schwer.",
      loot: bag({ diamond: 6 + Math.floor(power / 80), crystal: 40, titan: 20 }),
      ships: {},
    };
  }
  const loot = bag({
    metal: 180 + Math.floor(Math.random() * 220) + cargo * 40,
    helium: 90 + Math.floor(Math.random() * 120),
    titan: 20 + Math.floor(Math.random() * 50),
    energy: 80 + Math.floor(Math.random() * 100),
    crystal: 30 + Math.floor(Math.random() * 70),
    diamond: Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 3) : 0,
  });
  return {
    kind: "cache",
    title: "Nexus-Cache",
    text: "Ein Treibgut-Feld aus dem alten Netz. Frachtkähne hätten mehr geladen.",
    loot,
    ships: {},
  };
}

module.exports = {
  CONTRACTS,
  MEDALS,
  MEDAL_CATS,
  commanderLevel,
  xpForLevel,
  productionBonus,
  empireScore,
  listContracts,
  claimContract,
  listOps,
  claimOp,
  listWeekly,
  claimWeekly,
  nextAction,
  applyDaily,
  expeditionRoll,
  dailyReward,
  progressData,
  awardMedals,
  listMedals,
  publicProfile,
  allEarnedMap,
  compactFromIds,
};
