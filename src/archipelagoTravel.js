"use strict";

// Intergalactic travel: never a straight line across display coordinates.
// Same galaxy → caller supplies localLeg (existing travelPlan: distance, hops, fuel, reach).
// Other galaxy → approach a public gate, jump, then local arrival. Jump duration is tick-aligned,
// at most 40% shorter with Warp/Hyperspace, and never below 15 minutes.
function planIntergalacticTravel({
  origin,
  target,
  gates = [],
  connections = [],
  localLeg,
  jumpFuel = () => 0,
  warp = 0,
  hyperspace = 0,
  now = Date.now(),
  tickMs = 300000,
}) {
  if (origin?.galaxyId == null || target?.galaxyId == null) throw Error("Persistierte Galaxie-Zuordnung fehlt.");
  if (typeof localLeg !== "function" || !Number.isFinite(now) || !Number.isFinite(tickMs) || tickMs <= 0) {
    throw Error("Ungültige Reiseparameter.");
  }
  if (!Number.isFinite(warp) || !Number.isFinite(hyperspace) || warp < 0 || hyperspace < 0) {
    throw Error("Ungültige Forschung.");
  }
  const valid = (leg) =>
    leg && leg.allowed !== false && Number.isFinite(leg.ms) && leg.ms >= 0 && Number.isFinite(leg.fuel) && leg.fuel >= 0;
  if (origin.galaxyId === target.galaxyId) {
    const leg = localLeg(origin, target);
    if (!valid(leg)) throw Error(leg?.reason || "Ziel nicht erreichbar.");
    return finish([{ kind: "local", from: origin.systemId, to: target.systemId, ...leg }], now, tickMs);
  }
  const nodes = new Map([
    ["origin", origin],
    ["target", target],
  ]);
  const adj = new Map();
  const gateKeys = new Map();
  for (const g of gates) {
    if (g.galaxyId == null || g.systemId == null || g.id == null || gateKeys.has(g.id)) {
      throw Error("Ungültige Sprungtor-Zuordnung.");
    }
    const key = "gate:" + g.id;
    gateKeys.set(g.id, key);
    nodes.set(key, g);
  }
  for (const key of nodes.keys()) adj.set(key, []);
  function edge(a, b, leg) {
    if (valid(leg)) adj.get(a).push({ to: b, leg });
  }
  for (const [a, from] of nodes) {
    for (const [b, to] of nodes) {
      if (a === b || from.galaxyId !== to.galaxyId) continue;
      const leg =
        from.systemId === to.systemId ? { ms: 0, fuel: 0, allowed: true } : localLeg(from, to);
      if (valid(leg)) edge(a, b, { ...leg, kind: "local", from: from.systemId, to: to.systemId });
    }
  }
  for (const c of connections) {
    if (c.enabled === false) continue;
    const a = gateKeys.get(c.a);
    const b = gateKeys.get(c.b);
    if (!a || !b) throw Error("Sprungverbindung verweist auf unbekanntes Tor.");
    if (nodes.get(a).galaxyId === nodes.get(b).galaxyId) {
      throw Error("Sprungverbindung liegt innerhalb derselben Galaxie.");
    }
    const base = c.baseMs ?? 1800000;
    if (!Number.isFinite(base) || base <= 0) throw Error("Ungültige Sprungdauer.");
    const reduction = Math.max(0.6, 1 / (1 + 0.12 * warp + 0.08 * hyperspace));
    const ms = Math.ceil(Math.max(900000, base * reduction) / tickMs) * tickMs;
    const directions = c.oneWay ? [[a, b]] : [[a, b], [b, a]];
    for (const [from, to] of directions) {
      const fuel = jumpFuel(c, nodes.get(from), nodes.get(to));
      if (!Number.isFinite(fuel) || fuel < 0) throw Error("Ungültiger Sprungtreibstoff.");
      edge(from, to, {
        kind: "jump",
        connectionId: c.id,
        from: nodes.get(from).systemId,
        to: nodes.get(to).systemId,
        ms,
        fuel,
      });
    }
  }
  const distances = new Map([["origin", 0]]);
  const previous = new Map();
  const open = new Set(nodes.keys());
  while (open.size) {
    let best = null;
    for (const key of open) {
      if (Number.isFinite(distances.get(key)) && (best === null || distances.get(key) < distances.get(best))) best = key;
    }
    if (best === null) break;
    open.delete(best);
    if (best === "target") break;
    for (const e of adj.get(best)) {
      if (!open.has(e.to)) continue;
      const value = distances.get(best) + e.leg.ms;
      if (value < (distances.get(e.to) ?? Infinity)) {
        distances.set(e.to, value);
        previous.set(e.to, { from: best, leg: e.leg });
      }
    }
  }
  if (!previous.has("target")) throw Error("Keine freigegebene, erreichbare Sprungroute.");
  const segments = [];
  let cursor = "target";
  while (cursor !== "origin") {
    const p = previous.get(cursor);
    segments.unshift(p.leg);
    cursor = p.from;
  }
  return finish(segments, now, tickMs);
}

function finish(segments, now, tickMs) {
  const rawMs = segments.reduce((n, s) => n + s.ms, 0);
  const ms = Math.max(tickMs, Math.ceil(rawMs / tickMs) * tickMs);
  const arrivesAt = Math.ceil((now + ms) / tickMs) * tickMs;
  return {
    ruleVersion: "archipelago-1",
    segments,
    rawMs,
    ms,
    arrivesAt,
    alignmentMs: arrivesAt - now - ms,
    fuel: segments.reduce((n, s) => n + s.fuel, 0),
    jumps: segments.filter((s) => s.kind === "jump").length,
  };
}

module.exports = { planIntergalacticTravel, JUMP_HOP_EQUIV: 4, JUMP_BASE_MS: 1800000, JUMP_MIN_MS: 900000 };
