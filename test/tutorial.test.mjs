import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tutorialSteps, stepComplete, readTutorial } from '../public/js/tutorial.mjs';
const require = createRequire(import.meta.url);
const { BUILDINGS, TECHS, SHIPS } = require('../src/catalog.js');

test('tutorial meets catalog prerequisites in order starting from a new colony', () => {
  const levels = { command: 1, matter_mine: 1, energy_array: 1, helium_well: 1, shipyard: 1, spy_center: 1 }, techs = {};
  for (const step of tutorialSteps.filter(s => s.kind)) {
    const spec = (step.kind === 'building' ? BUILDINGS : step.kind === 'research' ? TECHS : SHIPS)[step.item];
    assert.ok(spec, step.item);
    for (const [id, n] of Object.entries(spec.requires?.buildings || {})) assert.ok((levels[id] || 0) >= n, `${step.id} needs ${id} ${n}`);
    for (const [id, n] of Object.entries(spec.requires?.techs || {})) assert.ok((techs[id] || 0) >= n, `${step.id} needs ${id} ${n}`);
    if (step.kind === 'building') levels[step.item] = step.level;
    if (step.kind === 'research') techs[step.item] = step.level;
  }
});

test('queue submission is not completion and starter probes do not replace construction', () => {
  const mine = tutorialSteps[0], probe = tutorialSteps.find(s => s.id === 'probe');
  const snap = { planet: { buildings: { matter_mine: 1 }, ships: { probe: 2 } }, queue: [{kind: 'building', itemId: 'matter_mine'}] };
  assert.equal(stepComplete(mine, snap), false);
  snap.planet.buildings.matter_mine = 2;
  assert.equal(stepComplete(mine, snap), true);
  assert.equal(stepComplete(probe, snap, { probeTarget: 3 }), false);
  snap.planet.ships.probe = 3;
  assert.equal(stepComplete(probe, snap, { probeTarget: 3 }), true);
});

test('saved preference is account-scoped and invalid or inaccessible saves are recoverable', () => {
  const storage = { getItem: key => key === 'account1' ? JSON.stringify({ status:'paused', index:4 }) : null };
  assert.deepEqual(readTutorial(storage, 'account1'), { status:'paused', index:4 });
  assert.equal(readTutorial(storage, 'account2'), null);
  for (const value of ['{', '{"status":"active","index":-1}', '{"status":"active","index":999}', '{"status":"active","index":0.5}']) assert.equal(readTutorial({getItem:()=>value}, 'a'), null);
  assert.equal(readTutorial({getItem:()=>{throw new Error('blocked');}}, 'a'), null);
});
