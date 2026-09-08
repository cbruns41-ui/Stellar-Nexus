// Unit costs come from /preview, including the current colony-ship price.
export function shipBudget(cost, resources, {unlocked=true, cap=0, stationed=0, queued=0}={}) {
  const prices=Object.entries(cost || {}).filter(([,value])=>Number(value)>0);
  const affordable=prices.length ? Math.max(0,Math.min(...prices.map(([id,value])=>Math.floor(Math.max(0,Number(resources[id])||0)/Number(value))))) : 0;
  const room=Math.max(0,Math.floor(cap-stationed-queued));
  return {affordable,room,buildable:unlocked ? Math.min(affordable,room,50) : 0};
}
