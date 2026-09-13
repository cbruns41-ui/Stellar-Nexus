import { startOrbitDemo } from './game.mjs';
const launch = document.querySelector('#launch');
const status = document.querySelector('#load-status');
const images = ['planet.png','deep-space.png'];
let busy = false;
launch.addEventListener('click', async () => {
  if (busy || document.querySelector('.orbit-game')) return;
  busy = true; launch.disabled = true; status.textContent = 'Grafiken werden vorbereitet …';
  try {
    await Promise.all(images.map(async name => { const im = new Image(); im.src = './assets/' + name; await im.decode(); }));
    document.querySelector('#lobby').hidden = true;
    startOrbitDemo({ planetName: 'ORBIT-FEUER', session: {id:'local-demo'}, onClaim: async () => ({loot:{}}), onExit: () => { document.querySelector('#lobby').hidden = false; } });
    status.textContent = '';
  } catch (err) { status.textContent = 'Die 3D-Demo konnte nicht starten: ' + err.message; document.querySelector('.orbit-game')?.remove();document.querySelector('.orbit-backdrop')?.remove();document.body.classList.remove('orbit-siege-open');document.querySelector('#lobby').hidden = false; }
  finally { busy = false; launch.disabled = false; }
});
