const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { openDb } = require('../src/db');
const { ensureAdmin, ensurePlayer } = require('../src/seed');
const { attachRoutes } = require('../src/routes');
const game = require('../src/game');
const { SHIPS } = require('../src/catalog');

test('admin grants every catalog ship to the chosen home planet with validation and an audit trail', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-admin-ships-'));
  const db = openDb(path.join(dir, 'test.db'));
  ensureAdmin(db);
  ensurePlayer(db, 'Recipient', 'secret123', 'Recipient Empire', '#00ffff');
  const recipient = db.prepare("SELECT e.*,u.id userId FROM empires e JOIN users u ON u.id=e.user_id WHERE u.username='Recipient'").get();
  const home = game.homePlanetOf(db, recipient.id);
  const beforeAdmin = db.prepare('SELECT * FROM ships WHERE planet_id<>? ORDER BY planet_id,ship_id').all(home.id);
  const app = express(); app.use(express.json()); attachRoutes(app, db);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (route, body, cookie = '') => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  const login = async (username, password) => (await post('/auth/login', { username, password })).headers.get('set-cookie');
  const admin = await login('Admin', 'Wurm4444'), member = await login('Recipient', 'secret123');
  const body = { userId: recipient.userId, action: 'ships', shipId: 'colony', amount: 1 };
  assert.equal((await post('/admin/player', body)).status, 401);
  assert.equal((await post('/admin/player', body, member)).status, 403);
  db.prepare('UPDATE users SET is_mod=1 WHERE id=?').run(recipient.userId);
  assert.equal((await post('/admin/player', body, member)).status, 403);
  const count = id => Number(db.prepare('SELECT count FROM ships WHERE planet_id=? AND ship_id=?').get(home.id, id)?.count || 0)
    + Number(db.prepare('SELECT count FROM ship_reserves WHERE planet_id=? AND ship_id=?').get(home.id, id)?.count || 0);
  for (const shipId of Object.keys(SHIPS)) {
    const before = count(shipId);
    const response = await post('/admin/player', { ...body, shipId }, admin);
    assert.equal(response.status, 200);
    assert.match((await response.json()).detail, new RegExp(SHIPS[shipId].name));
    assert.equal(count(shipId), before + 1);
  }
  const before = count('colony');
  for (const amount of [0, -1, 1.5, 51, null, 'bad']) assert.equal((await post('/admin/player', { ...body, amount }, admin)).status, 400);
  for (const shipId of ['unknown', '__proto__', 'constructor']) assert.equal((await post('/admin/player', { ...body, shipId }, admin)).status, 400);
  assert.equal((await post('/admin/player', { ...body, userId: 999999 }, admin)).status, 400);
  assert.equal(count('colony'), before);
  assert.deepEqual(db.prepare('SELECT * FROM ships WHERE planet_id<>? ORDER BY planet_id,ship_id').all(home.id), beforeAdmin);
  const logs = db.prepare("SELECT * FROM mod_log WHERE action='grant' AND target_id=?").all(recipient.userId);
  assert.equal(logs.length, Object.keys(SHIPS).length);
  assert.ok(logs.some(log => log.detail.includes(SHIPS.colony.name) && log.detail.includes(home.name)));
  // Inventory and audit log must commit together.
  db.exec("CREATE TRIGGER reject_grant_log BEFORE INSERT ON mod_log BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
  assert.equal((await post('/admin/player', body, admin)).status, 400);
  assert.equal(count('colony'), before);
});
