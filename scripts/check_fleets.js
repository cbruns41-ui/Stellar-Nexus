const DatabaseSync = require('node:sqlite').DatabaseSync;
const db = new DatabaseSync('data/stellar-nexus.db');
const fleets = db.prepare("SELECT id, empire_id, target_planet_id, mission, is_return, arrives_at FROM fleets WHERE mission = 'attack' AND is_return = 0").all();
console.log('Active attack fleets:', JSON.stringify(fleets, null, 2));
const allFleets = db.prepare("SELECT id, empire_id, target_planet_id, mission, is_return, arrives_at FROM fleets").all();
console.log('All fleets:', JSON.stringify(allFleets, null, 2));
