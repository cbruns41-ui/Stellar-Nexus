const http = require('http');
const https = require('https');
const url = require('url');

const BOTS = [
  { username: 'bot1', password: 'botpass1', empire: 'Bot Imperium 1', species: 'kryll', personality: 'aggressive' },
  { username: 'bot2', password: 'botpass2', empire: 'Bot Imperium 2', species: 'veyari', personality: 'defensive' },
  { username: 'bot3', password: 'botpass3', empire: 'Bot Imperium 3', species: 'draxen', personality: 'expansive' },
];

const BASE = 'http://localhost:3000';
const TICK_MS = 20 * 1000; // alle 20 Sekunden

let cookies = {};

function request(method, path, body, cookieHeader) {
  return new Promise((resolve, reject) => {
    const u = url.parse(BASE + path);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json' };
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    const req = lib.request({ hostname: u.hostname, port: u.port, path: u.path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          const match = setCookie[0].match(/sn_session=([^;]+)/);
          if (match) cookies[path] = match[1];
        }
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login(bot) {
  const res = await request('POST', '/api/auth/login', { username: bot.username, password: bot.password });
  if (res.status !== 200) throw new Error(`Login failed for ${bot.username}: ${res.body}`);
  const cookie = cookies['/api/auth/login'];
  if (!cookie) throw new Error(`No cookie for ${bot.username}`);
  return cookie;
}

async function getState(cookie) {
  const res = await request('GET', '/api/state', null, `sn_session=${cookie}`);
  if (res.status !== 200) throw new Error(`State failed: ${res.body}`);
  return JSON.parse(res.body);
}

async function build(cookie, planetId, buildingId) {
  const res = await request('POST', '/api/build', { planetId, id: buildingId }, `sn_session=${cookie}`);
  return res.status === 200;
}

async function buildShip(cookie, planetId, shipId, qty) {
  const res = await request('POST', '/api/ship', { planetId, id: shipId, qty }, `sn_session=${cookie}`);
  return res.status === 200;
}

async function buildDefense(cookie, planetId, defenseId, qty) {
  const res = await request('POST', '/api/defense', { planetId, id: defenseId, qty }, `sn_session=${cookie}`);
  return res.status === 200;
}

async function research(cookie, techId) {
  const res = await request('POST', '/api/research', { id: techId }, `sn_session=${cookie}`);
  return res.status === 200;
}

async function attack(cookie, targetId, ships) {
  const res = await request('POST', '/api/fleet', { targetId, mission: 'attack', ships }, `sn_session=${cookie}`);
  return res.status === 200;
}

async function colonize(cookie, targetId, ships) {
  const res = await request('POST', '/api/fleet', { targetId, mission: 'colonize', ships }, `sn_session=${cookie}`);
  return res.status === 200;
}

function pickBuilding(planet, personality) {
  const b = planet.buildings || {};
  
  // Immer zuerst Kommando auf Stufe 2 für Archiv
  if ((b.command || 0) < 2) return 'command';
  
  // Dann Archiv
  if (!b.archive || b.archive < 1) return 'archive';
  
  // Priorisiere Ressourcen-Produktion wenn niedrig
  if ((b.matter_mine || 0) < 3) return 'matter_mine';
  if ((b.energy_array || 0) < 3) return 'energy_array';
  if ((b.helium_well || 0) < 3) return 'helium_well';
  
  if (personality === 'defensive') {
    // Defensiv-Bot priorisiert Verteidigung und Ressourcen
    if (!b.fusion || b.fusion < 2) return 'fusion';
    if (!b.shipyard || b.shipyard < 4) return 'shipyard';
    if (!b.shield_generator || b.shield_generator < 2) return 'shield_generator';
  } else if (personality === 'expansive') {
    // Expansiv-Bot priorisiert Kolonisierung
    if (!b.colony_dock || b.colony_dock < 2) return 'colony_dock';
    if (!b.shipyard || b.shipyard < 5) return 'shipyard';
    if (!b.fusion || b.fusion < 2) return 'fusion';
  } else {
    // Aggressiv-Bot priorisiert Schiffsproduktion
    if (!b.shipyard || b.shipyard < 6) return 'shipyard';
    if (!b.fusion || b.fusion < 2) return 'fusion';
  }
  
  // Allgemeine Weiterentwicklung
  if (!b.command || b.command < 3) return 'command';
  if (!b.fusion || b.fusion < 2) return 'fusion';
  
  return null;
}

function pickDefense(planet, personality) {
  const d = planet.defenses || {};
  
  if (personality === 'defensive') {
    if ((d.flak || 0) < 15) return { id: 'flak', qty: 3 };
    if ((d.missile || 0) < 8) return { id: 'missile', qty: 2 };
    if ((d.laser || 0) < 8) return { id: 'laser', qty: 2 };
    if ((d.shield_generator || 0) < 4) return { id: 'shield_generator', qty: 1 };
  } else {
    if ((d.flak || 0) < 8) return { id: 'flak', qty: 2 };
    if ((d.missile || 0) < 5) return { id: 'missile', qty: 1 };
    if ((d.laser || 0) < 5) return { id: 'laser', qty: 1 };
    if ((d.shield_generator || 0) < 2) return { id: 'shield_generator', qty: 1 };
  }
  
  return null;
}

function pickShip(planet, personality) {
  const s = planet.ships || {};
  const cap = planet.shipCap || 40;
  const count = planet.shipCount || 0;
  
  if (count >= cap * 0.85) return null;
  
  if (personality === 'aggressive') {
    if (!s.bomber || s.bomber < 3) return { id: 'bomber', qty: 2 };
    if (!s.destroyer || s.destroyer < 2) return { id: 'destroyer', qty: 1 };
    if (!s.fighter || s.fighter < 15) return { id: 'fighter', qty: 10 };
  } else if (personality === 'defensive') {
    if (!s.frigate || s.frigate < 8) return { id: 'frigate', qty: 4 };
    if (!s.fighter || s.fighter < 10) return { id: 'fighter', qty: 5 };
    if (!s.battleship || s.battleship < 2) return { id: 'battleship', qty: 1 };
  } else {
    // Expansiv: gemischte Flotte
    if (!s.fighter || s.fighter < 10) return { id: 'fighter', qty: 5 };
    if (!s.frigate || s.frigate < 5) return { id: 'frigate', qty: 2 };
    if (!s.cargo || s.cargo < 3) return { id: 'cargo', qty: 1 };
  }
  
  return { id: 'fighter', qty: 5 };
}

function pickTech(techs, personality) {
  if (personality === 'aggressive') {
    if ((techs.weapons || 0) < 5) return 'weapons';
    if ((techs.armor || 0) < 4) return 'armor';
    if ((techs.shields || 0) < 3) return 'shields';
    if ((techs.warp || 0) < 3) return 'warp';
  } else if (personality === 'defensive') {
    if ((techs.shields || 0) < 5) return 'shields';
    if ((techs.armor || 0) < 4) return 'armor';
    if ((techs.energy_core || 0) < 3) return 'energy_core';
    if ((techs.warp || 0) < 2) return 'warp';
  } else {
    if ((techs.warp || 0) < 4) return 'warp';
    if ((techs.weapons || 0) < 3) return 'weapons';
    if ((techs.armor || 0) < 3) return 'armor';
    if ((techs.extraction || 0) < 2) return 'extraction';
  }
  return null;
}

function pickTarget(state, myEmpireId) {
  const planets = state.planets || [];
  const others = planets.filter(p => p.owner && p.owner.empireId !== myEmpireId && !p.remnant);
  if (others.length === 0) return null;
  
  // Bevorzuge Bot-Imperien
  const botTargets = others.filter(p => p.owner && p.owner.name && p.owner.name.includes('Bot'));
  const pool = botTargets.length > 0 ? botTargets : others;
  
  // Angriff auf schwächste Ziele
  pool.sort((a, b) => (a.shipCount || 0) - (b.shipCount || 0));
  return pool[0];
}

function pickColonyTarget(state, myEmpireId) {
  const planets = state.planets || [];
  return planets.find(p => p.owner && p.owner.empireId === myEmpireId && !p.remnant);
}

async function botTick(bot, cookie) {
  try {
    const state = await getState(cookie);
    const planet = state.planet;
    if (!planet) return;
    const empireId = state.empire.id;

    // 1. Gebäude bauen
    const building = pickBuilding(planet, bot.personality);
    if (building) {
      const success = await build(cookie, planet.id, building);
      if (!success) {
        // Wenn Bau fehlschlägt, versuche Ressourcen-Gebäude
        if ((planet.buildings?.matter_mine || 0) < 3) {
          await build(cookie, planet.id, 'matter_mine');
        } else if ((planet.buildings?.energy_array || 0) < 3) {
          await build(cookie, planet.id, 'energy_array');
        } else if ((planet.buildings?.helium_well || 0) < 3) {
          await build(cookie, planet.id, 'helium_well');
        }
      }
    }

    // 2. Verteidigung bauen
    const defense = pickDefense(planet, bot.personality);
    if (defense && planet.metal > 100) {
      await buildDefense(cookie, planet.id, defense.id, defense.qty);
    }

    // 3. Schiffe bauen
    const ship = pickShip(planet, bot.personality);
    if (ship && planet.metal > 250) {
      await buildShip(cookie, planet.id, ship.id, ship.qty);
    }

    // 4. Forschung
    const tech = pickTech(state.techs || {}, bot.personality);
    if (tech && planet.energy > 80) {
      await research(cookie, tech);
    }

    // 5. Angriff
    const target = pickTarget(state, empireId);
    if (target && (planet.ships?.fighter || 0) > 8) {
      const ships = { fighter: Math.min(8, planet.ships.fighter || 0) };
      await attack(cookie, target.id, ships);
    }

    // 6. Kolonisieren (nur expansive und aggressive Bots)
    if ((bot.personality === 'expansive' || bot.personality === 'aggressive') && 
        planet.helium > 50 && planet.metal > 500) {
      const hasColony = (planet.ships?.colony || 0) > 0;
      if (!hasColony && planet.metal > 800) {
        // Baue Kolonialschiff
        await buildShip(cookie, planet.id, 'colony', 1);
      } else if (hasColony) {
        const myPlanets = state.planets?.filter(p => p.owner?.empireId === empireId) || [];
        if (myPlanets.length < 4) {
          const freePlanet = state.planets?.find(p => !p.owner && !p.remnant);
          if (freePlanet) {
            await colonize(cookie, freePlanet.id, { colony: 1 });
          }
        }
      }
    }

    console.log(`[${new Date().toISOString()}] ${bot.username} (${bot.personality}): planet ${planet.id} | ships ${planet.shipCount}/${planet.shipCap} | def ${Object.keys(planet.defenses || {}).length}`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ${bot.username} ERROR:`, e.message);
  }
}

async function main() {
  console.log('Starte erweiterte Bots...');
  const sessions = {};
  for (const bot of BOTS) {
    try {
      const cookie = await login(bot);
      sessions[bot.username] = cookie;
      console.log(`Bot ${bot.username} eingeloggt (${bot.personality})`);
    } catch (e) {
      console.error(`Bot ${bot.username} Login fehlgeschlagen:`, e.message);
    }
  }

  if (Object.keys(sessions).length === 0) {
    console.error('Keine Bots eingeloggt. Beende.');
    process.exit(1);
  }

  console.log(`Bots aktiv. Takt alle ${TICK_MS / 1000}s.`);
  
  setInterval(async () => {
    for (const bot of BOTS) {
      const cookie = sessions[bot.username];
      if (!cookie) continue;
      await botTick(bot, cookie);
    }
  }, TICK_MS);

  // Erster Tick sofort
  for (const bot of BOTS) {
    const cookie = sessions[bot.username];
    if (!cookie) continue;
    await botTick(bot, cookie);
  }
}

main().catch(e => {
  console.error('Bot-System fehlgeschlagen:', e);
  process.exit(1);
});
