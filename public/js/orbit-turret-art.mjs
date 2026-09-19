// Sprite pivots use image coordinates (top = 0). Keep the bearing centered on its slot.
export const TURRET_WORLD_SCALE = .34;
export const TURRET_ART = Object.freeze({
  laser: {file:'turret-laser-v7.png',size:96,pivot:.67,muzzle:52,color:0x65ddff},
  flak:  {file:'turret-flak-v7.png',size:84,pivot:.55,muzzle:26,ports:[-27,27],color:0xffb957},
  silo:  {file:'turret-silo-v7.png',size:90,pivot:.68,muzzle:42,ports:[-28,28],color:0xff7544},
  gauss: {file:'turret-gauss-v7.png',size:96,pivot:.80,muzzle:73,color:0x9cecff},
  tesla: {file:'turret-tesla-v7.png',size:86,pivot:.54,muzzle:0,color:0xc47aff},
  mine:  {file:'turret-mine-v7.png',size:80,pivot:.48,muzzle:0,color:0xa2ef58},
  battery:{file:'turret-battery.png',size:96,pivot:.80,muzzle:73,color:0x9cecff},
});
