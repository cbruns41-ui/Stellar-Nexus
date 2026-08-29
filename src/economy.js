"use strict";

const { RESOURCE_IDS, emptyBag, bag } = require("./catalog");

const BASE_PRICE = {
  metal: 1,
  helium: 1.15,
  titan: 1.7,
  energy: 0.95,
  crystal: 1.55,
  diamond: 14,
};

function clampPrice(id, v) {
  const lo = id === "diamond" ? 8 : 0.45;
  const hi = id === "diamond" ? 28 : 3.2;
  return Math.max(lo, Math.min(hi, v));
}

function getPrices(db) {
  const row = db.prepare("SELECT value FROM world_meta WHERE key = 'prices'").get();
  const now = Date.now();
  let state = null;
  if (row) {
    try {
      state = JSON.parse(row.value);
    } catch {
      state = null;
    }
  }
  if (!state || !state.rates) {
    state = { rates: { ...BASE_PRICE }, until: 0 };
  }
  if (state.until < now) {
    const next = { ...state.rates };
    for (const k of RESOURCE_IDS) {
      const shock = 1 + (Math.random() - 0.5) * 0.18;
      next[k] = clampPrice(k, (next[k] || BASE_PRICE[k]) * shock);
    }
    state = { rates: next, until: now + 8 * 60 * 1000 };
    db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('prices', ?)").run(JSON.stringify(state));
  }
  return state;
}

function quote(rates, give, get, amount) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!amount || !rates[give] || !rates[get] || give === get) return 0;
  const spread = 0.9;
  return Math.max(1, Math.floor((amount * rates[give] * spread) / rates[get]));
}

function nudge(db, give, get) {
  const state = getPrices(db);
  const rates = { ...state.rates };
  rates[give] = clampPrice(give, rates[give] * 0.985);
  rates[get] = clampPrice(get, rates[get] * 1.02);
  state.rates = rates;
  db.prepare("INSERT OR REPLACE INTO world_meta(key, value) VALUES('prices', ?)").run(JSON.stringify(state));
}

function hoursToFull(stock, prod, cap) {
  const out = {};
  for (const k of RESOURCE_IDS) {
    const p = Number(prod?.[k]) || 0;
    const room = Math.max(0, (cap?.[k] || 0) - (stock?.[k] || 0));
    out[k] = p <= 0 ? null : room / p;
  }
  return out;
}

module.exports = { getPrices, quote, nudge, hoursToFull, BASE_PRICE };
