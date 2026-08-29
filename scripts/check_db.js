const DatabaseSync = require('node:sqlite').DatabaseSync;
const db = new DatabaseSync('data/stellar-nexus.db');
const empires = db.prepare('SELECT id, name FROM empires').all();
console.log('Empires:', JSON.stringify(empires, null, 2));
const alliances = db.prepare('SELECT id, tag, name FROM alliances').all();
console.log('Alliances:', JSON.stringify(alliances, null, 2));
const members = db.prepare('SELECT alliance_id, empire_id FROM alliance_members').all();
console.log('Members:', JSON.stringify(members, null, 2));
