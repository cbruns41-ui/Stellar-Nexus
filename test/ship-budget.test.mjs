import test from 'node:test';
import assert from 'node:assert/strict';
import { shipBudget } from '../public/js/ship-budget.mjs';

test('ship budget floors the limiting resource without rounding the displayed stock',()=>{
  const cost={metal:100,helium:20,energy:0};
  assert.equal(shipBudget(cost,{metal:299.999,helium:100},{cap:100}).affordable,2);
  assert.equal(shipBudget(cost,{metal:300,helium:100},{cap:100}).affordable,3);
  assert.equal(shipBudget(cost,{metal:1000,helium:19.999},{cap:100}).buildable,0);
  assert.equal(shipBudget(cost,{metal:1000},{cap:100}).affordable,0);
});
test('hangar, pending ships, unlock and order limits are distinct from affordability',()=>{
  const cost={metal:10},resources={metal:2000};
  assert.deepEqual(shipBudget(cost,resources,{cap:110,stationed:90,queued:15}),{affordable:200,room:5,buildable:5});
  assert.equal(shipBudget(cost,resources,{cap:110,stationed:111}).buildable,0);
  assert.equal(shipBudget(cost,resources,{cap:110,unlocked:false}).buildable,0);
  assert.equal(shipBudget(cost,resources,{cap:1000}).buildable,50);
});
