"use strict";

const { bag, emptyBag, scaleBag } = require("./catalog");
const progress = require("./progress");

const DURATIONS = {
  short: { id: "short", name: "Kurz", blurb: "Wenig Beute", timeMul: 1, lootMul: 1, xpMul: 1, emptyNerf: 0 },
  mid: { id: "mid", name: "Mittel", blurb: "Solide Beute", timeMul: 2.5, lootMul: 3.1, xpMul: 2.2, emptyNerf: 0.08 },
  long: { id: "long", name: "Lang", blurb: "Reiche Beute", timeMul: 5.5, lootMul: 7.4, xpMul: 4.8, emptyNerf: 0.14 },
};

const KINDS = {
  patrol: {
    id: "patrol",
    name: "Orbit-Patrouille",
    blurb: "Ein Sweep um den Planeten. Schrott, Echo, selten ein Rumpf.",
    cd: 4 * 60 * 1000,
    col: "last_patrol",
    art: "/assets/activity/patrol.jpg",
  },
  salvage: {
    id: "salvage",
    name: "Trümmer-Scan",
    blurb: "Sensoren auf Wrackteile. Titan und Metall, wenn du Glück hast.",
    cd: 6 * 60 * 1000,
    col: "last_salvage",
    art: "/assets/activity/salvage.jpg",
  },
  decode: {
    id: "decode",
    name: "Funknetz knacken",
    blurb: "Piraten-Codes und Händlerfunk. Kristalle und XP.",
    cd: 2.5 * 60 * 1000,
    col: "last_decode",
    art: "/assets/techs/data_arch.jpg",
  },
  sim: {
    id: "sim",
    name: "Kampfsimulator",
    blurb: "Kein Risiko, wenig Erz. Commander-XP, während die Mine tickt.",
    cd: 3 * 60 * 1000,
    col: "last_sim",
    art: "/assets/techs/ai.jpg",
    energy: 35,
  },
  survey: {
    id: "survey",
    name: "Tiefenscan",
    blurb: "Geologische Sensoren. Titan, Metall und selten Kristalle.",
    cd: 5 * 60 * 1000,
    col: "last_survey",
    art: "/assets/activity/survey.jpg",
  },
  drill: {
    id: "drill",
    name: "Bohrung",
    blurb: "Erdwunde bohrt nach Energie und Titan. Gefährlich, aber lohnend.",
    cd: 8 * 60 * 1000,
    col: "last_drill",
    art: "/assets/activity/drill.jpg",
    energy: 40,
  },
};

function rand(n) {
  return Math.floor(Math.random() * n);
}

function durationOf(id) {
  return DURATIONS[id] || DURATIONS.short;
}

function durationMs(kind, durationId) {
  const spec = KINDS[kind];
  const d = durationOf(durationId);
  return Math.max(30 * 1000, Math.floor((spec?.cd || 60 * 1000) * d.timeMul));
}

function energyCost(kind, durationId) {
  const spec = KINDS[kind];
  const d = durationOf(durationId);
  return Math.ceil((spec?.energy || 0) * d.timeMul);
}

function desk(db, empire) {
  const now = Date.now();
  const runs = Object.fromEntries(
    db.prepare("SELECT * FROM activity_runs WHERE empire_id = ?").all(empire.id).map((r) => [r.kind, r])
  );
  return Object.values(KINDS).map((k) => {
    const run = runs[k.id];
    const running = !!(run && run.completes_at > now);
    const readyAt = running ? run.completes_at : 0;
    return {
      id: k.id,
      name: k.name,
      blurb: k.blurb,
      art: k.art,
      energy: k.energy || 0,
      ready: !running,
      running,
      duration: run?.duration || null,
      durationName: run ? durationOf(run.duration).name : null,
      startedAt: run?.started_at || 0,
      readyAt,
      wait: Math.max(0, readyAt - now),
      durations: Object.values(DURATIONS).map((d) => ({
        id: d.id,
        name: d.name,
        blurb: d.blurb,
        ms: durationMs(k.id, d.id),
        energy: energyCost(k.id, d.id),
        lootMul: d.lootMul,
      })),
    };
  });
}

function start(db, empire, planet, kind, durationId) {
  const spec = KINDS[kind];
  if (!spec) throw new Error("Unbekannter Einsatz.");
  const d = DURATIONS[durationId] ? DURATIONS[durationId] : DURATIONS.short;
  const now = Date.now();
  const existing = db.prepare("SELECT * FROM activity_runs WHERE empire_id = ? AND kind = ?").get(empire.id, spec.id);
  if (existing && existing.completes_at > now) throw new Error("Dieser Einsatz läuft bereits.");
  if (existing) db.prepare("DELETE FROM activity_runs WHERE empire_id = ? AND kind = ?").run(empire.id, spec.id);
  const completes = now + durationMs(spec.id, d.id);
  db.prepare(
    "INSERT INTO activity_runs(empire_id, kind, duration, planet_id, started_at, completes_at) VALUES(?,?,?,?,?,?)"
  ).run(empire.id, spec.id, d.id, planet.id, now, completes);
  if (spec.col) db.prepare(`UPDATE empires SET ${spec.col} = ? WHERE id = ?`).run(now, empire.id);
  return { kind: spec.id, duration: d.id, completesAt: completes, wait: completes - now };
}

function run(db, empire, planet, kind, creditFn, addShipsFn, addReportFn, durationId) {
  const spec = KINDS[kind];
  if (!spec) throw new Error("Unbekannter Einsatz.");
  const d = durationOf(durationId);
  const r = Math.random();
  const emptyCut = d.emptyNerf || 0;
  let loot = emptyBag();
  let ships = {};
  let xp = 8 + rand(10);
  let title = spec.name;
  let text = "";

  if (kind === "patrol") {
    if (r < Math.max(0.04, 0.18 - emptyCut)) {
      title = "Leerer Orbit";
      text = "Nur Sternenwind. Die Patrouille kehrt unverrichteter Dinge.";
      xp = 5;
    } else if (r < 0.5) {
      title = "Treibgut";
      text = "Ein zerrissener Frachter. Erz und Isotope im Netz.";
      loot = bag({ metal: 70 + rand(90), helium: 30 + rand(40), energy: 20 });
    } else if (r < 0.7) {
      title = "Piraten-Bake";
      text = "Ein Sender, schnell geknackt. Kristalle und eine Notiz: sie kommen seltener, wenn du wachsam bleibst.";
      loot = bag({ crystal: 40 + rand(50), metal: 40 });
      xp += 10;
    } else if (r < 0.88) {
      title = "Gekaperte Sonde";
      text = "Eine herrenlose Sonde dockt an. Deine jetzt.";
      ships = { probe: 1 };
      loot = bag({ helium: 20 });
    } else {
      title = "Glücksfund";
      text = "Ein Diamantsplitter im Sensorrauschen.";
      loot = bag({ diamond: 1 + (r > 0.97 ? 1 : 0), crystal: 20 });
      xp += 15;
    }
  } else if (kind === "salvage") {
    if (r < Math.max(0.05, 0.2 - emptyCut)) {
      title = "Kaltes Feld";
      text = "Nichts als Staub. Der nächste Scan lohnt eher.";
      xp = 6;
    } else if (r < 0.65) {
      title = "Wrackteile";
      text = "Panzerplatten und Träger. Die Gießerei freut sich.";
      loot = bag({ metal: 90 + rand(110), titan: 20 + rand(35), energy: 15 });
    } else if (r < 0.88) {
      title = "Reaktorbruch";
      text = "Noch heiß. Energie und Titan.";
      loot = bag({ energy: 80 + rand(70), titan: 30, helium: 20 });
    } else {
      title = "Intakter Container";
      text = "Versiegelt, voll. Sogar ein Diamant.";
      loot = bag({ metal: 60, crystal: 30, diamond: 1 });
      xp += 12;
    }
  } else if (kind === "decode") {
    if (r < Math.max(0.04, 0.15 - emptyCut)) {
      title = "Rauschen";
      text = "Nur Interferenzen. Der nächste Burst kommt bald.";
      xp = 6;
    } else if (r < 0.7) {
      title = "Händlerfunk";
      text = "Preise, Routen, Lügen. Kristalle für die Archive.";
      loot = bag({ crystal: 50 + rand(60), energy: 20 });
      xp += 8;
    } else if (r < 0.9) {
      title = "Piraten-Codebuch";
      text = "Ihre Staffeln werden seltener, wenn du zuhörst. XP und Kristalle.";
      loot = bag({ crystal: 80, helium: 25 });
      xp += 18;
    } else {
      title = "Nexus-Flüstern";
      text = "Ein Protokoll-Schnipsel. Selten und wertvoll.";
      loot = bag({ diamond: 1, crystal: 40 });
      xp += 22;
    }
  } else if (kind === "sim") {
    title = "Simulation beendet";
    text = r < 0.2 ? "Niederlage im Simulator. Trotzdem gelernt." : "Sieg im Holoraum. Die Crew ist wacher.";
    xp = 14 + rand(16) + (r > 0.8 ? 12 : 0);
    loot = bag({ energy: 0 });
  } else if (kind === "survey") {
    if (r < Math.max(0.05, 0.2 - emptyCut)) {
      title = "Leerer Untergrund";
      text = "Die Sensoren finden nur Gestein ohne Wert.";
      xp = 7;
    } else if (r < 0.6) {
      title = "Erzgang";
      text = "Ein tiefer Riss im Gestein. Titan und Metall.";
      loot = bag({ metal: 100 + rand(140), titan: 30 + rand(50) });
      xp += 10;
    } else if (r < 0.85) {
      title = "Kristallader";
      text = "Seltene Strukturen im Fels. Kristalle für die Forschung.";
      loot = bag({ crystal: 60 + rand(80), titan: 20 });
      xp += 14;
    } else {
      title = "Seltene Erde";
      text = "Ein unerwarteter Fund. Diamant und Kristalle.";
      loot = bag({ diamond: 1 + rand(2), crystal: 50, metal: 80 });
      xp += 18;
    }
  } else if (kind === "drill") {
    if (r < Math.max(0.04, 0.15 - emptyCut)) {
      title = "Bohrstock gebrochen";
      text = "Kein Treffer. Die Mannschaft braucht eine Pause.";
      xp = 5;
    } else if (r < 0.55) {
      title = "Erdgas-Vorkommen";
      text = "Reichhaltige Blase. Energie und etwas Titan.";
      loot = bag({ energy: 90 + rand(100), titan: 15 + rand(25) });
      xp += 10;
    } else if (r < 0.8) {
      title = "Magma-Kammer";
      text = "Heiß und gefährlich. Viel Energie, wenig Erz.";
      loot = bag({ energy: 140 + rand(120), metal: 40, helium: 30 });
      xp += 14;
    } else {
      title = "Tiefen-Echofeld";
      text = "Ein seltsames Signal. Kristalle und Diamanten aus der Tiefe.";
      loot = bag({ crystal: 70, diamond: 1 + rand(2), energy: 60 });
      xp += 20;
    }
  }

  const lvl = progress.commanderLevel(empire.xp || 0);
  const worldLoot = Math.max(0.4, Math.min(1.6, (Number(require("./settings").get(db).activityLootPct) || 100) / 100));
  const scale = (1 + Math.min(2.4, (lvl - 1) * 0.035)) * (d.lootMul || 1) * worldLoot;
  loot = scaleBag(loot, scale);
  xp = Math.floor(xp * (1 + Math.min(1.2, (lvl - 1) * 0.02)) * (d.xpMul || 1));
  if (ships.probe && d.id === "long" && Math.random() < 0.45) ships.probe += 1;

  if (planet && (loot.metal || loot.helium || loot.titan || loot.energy || loot.crystal || loot.diamond)) {
    creditFn(db, planet, loot);
  }
  if (planet && ships.probe) addShipsFn(db, planet.id, ships);
  db.prepare("UPDATE empires SET xp = IFNULL(xp,0) + ? WHERE id = ?").run(xp, empire.id);
  const suffix = d.id === "short" ? "" : ` · ${d.name}`;
  addReportFn(db, empire.id, "event", title + suffix, { text, loot, shipsGain: ships, xp, activity: kind, duration: d.id });
  return { title, text, loot, ships, xp };
}

function completeDue(db, creditFn, addShipsFn, addReportFn) {
  const now = Date.now();
  const due = db.prepare("SELECT * FROM activity_runs WHERE completes_at <= ?").all(now);
  for (const row of due) {
    db.prepare("DELETE FROM activity_runs WHERE empire_id = ? AND kind = ?").run(row.empire_id, row.kind);
    const empire = db.prepare("SELECT * FROM empires WHERE id = ?").get(row.empire_id);
    const planet = db.prepare("SELECT * FROM planets WHERE id = ?").get(row.planet_id);
    if (!empire || !planet) continue;
    try {
      run(db, empire, planet, row.kind, creditFn, addShipsFn, addReportFn, row.duration);
    } catch {
      /* skip broken run */
    }
  }
}

module.exports = { KINDS, DURATIONS, desk, run, start, completeDue, durationMs, energyCost };
