import { startOrbitDemo } from './game.mjs';
const launch = document.querySelector('#launch');
const status = document.querySelector('#load-status');
const images = ['planet.png','interceptor.png','frigate.png','rocket.png','missile.png','turret-battery.png','turret-laser.png','turret-silo.png','turret-flak.png','turret-gauss.png','turret-tesla.png','turret-mine.png'];
let busy = false;
launch.addEventListener('click', async () => {
  if (busy || document.querySelector('.orbit-game')) return;
  busy = true; launch.disabled = true; status.textContent = 'Grafiken werden vorbereitet …';
  try {
    await Promise.all(images.map(async name => { const im = new Image(); im.src = './assets/' + name; await im.decode(); }));
    document.querySelector('#lobby').hidden = true;
    startOrbitDemo({ planetName: 'ORBIT-FEUER', session: {id:'local-demo'}, onClaim: async () => ({loot:{}}), onExit: () => { document.querySelector('#lobby').hidden = false; } });
    status.textContent = '';
  } catch (err) { status.textContent = 'Start fehlgeschlagen: ' + err.message; document.querySelector('#lobby').hidden = false; }
  finally { busy = false; launch.disabled = false; }
});
