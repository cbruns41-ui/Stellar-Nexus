import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export async function verifyAdminShips({ db, send, evaluate, until, click, shot }) {
  const { ensurePlayer } = require('../src/seed');
  const game = require('../src/game');
  ensurePlayer(db, 'GrantTest', 'local-test-password', 'Ship Grant Test', '#44aaff');
  const player = db.prepare("SELECT u.id userId,e.id empireId FROM users u JOIN empires e ON e.user_id=u.id WHERE u.username='GrantTest'").get();
  const home = game.homePlanetOf(db, player.empireId);
  const count = () => Number(db.prepare("SELECT count FROM ships WHERE planet_id=? AND ship_id='colony'").get(home.id)?.count || 0)
    + Number(db.prepare("SELECT count FROM ship_reserves WHERE planet_id=? AND ship_id='colony'").get(home.id)?.count || 0);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[data-view="moderation"]').click()`);
  await until(`document.querySelector('#mod-search')`);
  await evaluate(`document.querySelector('#mod-q').value='GrantTest';document.querySelector('#mod-search').requestSubmit()`);
  const selector = `[data-grant-ships="${player.userId}"]`;
  await until(`document.querySelector('${selector}')`);
  await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center',inline:'center'})`);
  await click(selector);
  await until(`document.querySelector('#admin-ship-grant')`);
  assert.match(await evaluate(`document.querySelector('#admin-ship-grant').textContent`), /GrantTest/);
  await evaluate(`document.querySelector('#admin-ship-grant').elements.shipId.value='colony'`);
  await shot('admin-grant-colony-mobile');
  const before = count();
  await evaluate(`document.querySelector('#admin-ship-grant').requestSubmit();document.querySelector('#admin-ship-grant').requestSubmit()`);
  await until(`!document.querySelector('#admin-ship-grant')`);
  assert.equal(count(), before + 1, 'Double submission grants exactly one colony ship');
  const logs = db.prepare("SELECT detail FROM mod_log WHERE target_id=? AND action='grant'").all(player.userId);
  assert.equal(logs.length, 1);
  assert.match(logs[0].detail, /Kolonialschiff/);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center',inline:'center'})`);
  await click(selector);
  await until(`document.querySelector('#admin-ship-grant')`);
  await click('[data-grant-cancel]');
  assert.equal(count(), before + 1, 'Cancel does not grant a ship');
  console.log('Admin ship grant passed: selected recipient, colony ship, mobile form, double-submit guard, audit log and desktop cancellation');
}
