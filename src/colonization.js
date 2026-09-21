"use strict";

const MAX_PLANETS = 36;
// Home needs no research. Subsequent gaps grow by one level: 3, 4, 5, 6, ...
function requiredLevel(slot) {
  return slot <= 1 ? 0 : (slot - 1) * (slot + 4) / 2;
}
function maxPlanets(level = 0) {
  let slots = 1;
  while (slots < MAX_PLANETS && Number(level) >= requiredLevel(slots + 1)) slots++;
  return slots;
}
function colonySlots(level, owned, pending = 0) {
  const cap = maxPlanets(level), used = owned + pending;
  const nextSlot = Math.max(cap, used) + 1;
  const nextLevel = nextSlot <= MAX_PLANETS ? requiredLevel(nextSlot) : null;
  const free = Math.max(0, cap - used);
  const blocker = free ? '' : `Planet-Limit ${owned}/${cap} · ${pending} Kolonisationen unterwegs. ${nextLevel == null ? 'Alle 36 Planetplätze sind belegt.' : `Für Planet ${nextSlot} ist Kolonisation Stufe ${nextLevel} nötig (aktuell ${level || 0}). Im Labor weiterforschen.`}`;
  return { tech: 'colonization', level: level || 0, owned, pending, cap, free, nextSlot: nextLevel == null ? null : nextSlot, nextLevel, blocker,
    milestones: Array.from({length:MAX_PLANETS}, (_, i) => ({slot:i+1,level:requiredLevel(i+1)})) };
}
module.exports = { MAX_PLANETS, requiredLevel, maxPlanets, colonySlots };
