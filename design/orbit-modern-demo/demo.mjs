import { startOrbitDemo } from './game.mjs';
import {TURRET_ART} from './turret-art.mjs';
const launch = document.querySelector('#launch');
const campaign = document.querySelector('#campaign');
const status = document.querySelector('#load-status');
const images = ['earth-blue-marble-july.jpg','earth-clouds.jpg','deep-space.png','fighter-v3-key.png','frigate.png',...Object.values(TURRET_ART).map(art=>art.file).filter(Boolean)];
let busy = false;
async function play(quickStart) {
  if (busy || document.querySelector('.orbit-game')) return;
  busy = true; launch.disabled = campaign.disabled = true; status.textContent = 'Grafiken werden vorbereitet …';
  try {
    await Promise.all(images.map(async name => { const im = new Image(); im.src = './assets/' + name; await im.decode(); }));
    document.querySelector('#lobby').hidden = true;
    startOrbitDemo({ quickStart, planetName: 'ORBIT-FEUER', session: {id:'local-demo'}, onClaim: async () => ({loot:{}}), onExit: () => { document.querySelector('#lobby').hidden = false; } });
    status.textContent = '';
  } catch (err) { status.textContent = 'Die 3D-Demo konnte nicht starten: ' + err.message; document.querySelector('.orbit-game')?.remove();document.querySelector('.orbit-backdrop')?.remove();document.body.classList.remove('orbit-siege-open');document.querySelector('#lobby').hidden = false; }
  finally { busy = false; launch.disabled = campaign.disabled = false; }
}
launch.addEventListener('click',()=>play(true));
campaign.addEventListener('click',()=>play(false));
