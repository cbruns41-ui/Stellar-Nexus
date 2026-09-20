// The tutorial observes authoritative snapshots; clicking never completes a build.
const build = (id, level, text) => ({ id: `${id}-${level}`, kind: 'building', item: id, level, view: 'infra', text });
const research = (id, text) => ({ id, kind: 'research', item: id, level: 1, view: 'research', text });
export const tutorialSteps = [
  build('matter_mine', 2, 'Metall ist die Grundlage deiner Kolonie. Baue die Mine auf Stufe 2 aus. Jeder Ausbau erhöht die laufende Produktion.'),
  build('energy_array', 2, 'Energie wird für Gebäude, Forschung und Schiffe verbraucht. Erhöhe zuerst deinen Nachschub auf Stufe 2.'),
  build('command', 2, 'Der Kommando-Nexus schaltet Werft, Kristallförderung und Forschungsarchiv frei. Erreiche Stufe 2.'),
  build('helium_well', 2, 'Helium-3 brauchst du für Sonden und als Treibstoff. Baue den Kollektor auf Stufe 2 aus und sichere den Nachschub.'),
  build('uplink', 1, 'Kristalle finanzieren Forschung und Sensorik. Errichte den Kristallbohrer, bevor du ins Labor wechselst.'),
  build('titan_extractor', 1, 'Titan wird unter anderem für die Werft benötigt. Sorge jetzt für eine eigene Produktion.'),
  build('silo', 1, 'Der Speichervault vergrößert deine Lager. So geht bei längeren Pausen weniger Produktion verloren.'),
  build('archive', 1, 'Im Forschungsarchiv auf deinem Hauptplaneten erforschst du Technologien für dein ganzes Imperium.'),
  research('energy_core', 'Energiekerne erhöhen den Energieertrag und öffnen weitere Forschungszweige. Erforsche Stufe 1.'),
  research('extraction', 'Extraktionstechnik erhöht deinen Metallertrag. Gebäudeausbau und Forschung ergänzen sich.'),
  research('fuel_systems', 'Isotop-Refining verbessert die Helium-Produktion. Die zuvor erforschten Energiekerne schalten es frei.'),
  build('shipyard', 2, 'Die Werft baut deine Schiffe und erweitert den Hangar. Stufe 2 bereitet dich auf weitere Schiffstypen vor; Sonden kannst du bereits ab Stufe 1 bauen.'),
  build('spy_center', 2, 'Das Spionagezentrum schaltet Sonden frei. Erhöhe es auf Stufe 2, um die Erfolgschance deiner Aufklärung zu verbessern.'),
  { id: 'probe', kind: 'ship', item: 'probe', view: 'yard', text: 'Baue eine Sonde. Sie klärt fremde Planeten auf, bevor du deine wertvollen Kampfschiffe riskierst. Warte, bis sie im Hangar bereitsteht.' },
  { id: 'scout', view: 'galaxy', text: 'Für deinen ersten Flug suchen wir einen unbesetzten Planeten in der Nähe. Klicke dort auf Scout. Später kannst du auch Gegner ausspionieren; dabei können Sonden verloren gehen.' },
  { id: 'report', view: 'reports', text: 'Nach der Ankunft erscheint hier dein Spionagebericht. Öffne ihn und prüfe Ressourcen, Gebäude und Verteidigung. Auch eine entdeckte Sonde liefert einen Bericht.' },
  { id: 'finish', text: 'Deine Wirtschaft läuft, die Grundlagen sind erforscht und du kennst die Aufklärung. Als Nächstes: Aufgabenbelohnungen abholen, Produktion weiter ausbauen und deine erste Kampfflotte vorbereiten.' },
];

export function stepComplete(step, snap, progress = {}) {
  if (step.kind === 'building') return (snap.planet?.buildings?.[step.item] || 0) >= step.level;
  if (step.kind === 'research') return (snap.techs?.[step.item] || 0) >= step.level;
  if (step.kind === 'ship') return (snap.planet?.ships?.[step.item] || 0) >= (progress.probeTarget || 1);
  return false;
}

export function readTutorial(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (value && ['active', 'paused', 'skipped', 'done'].includes(value.status) && Number.isInteger(value.index) && value.index >= 0 && value.index < tutorialSteps.length) return value;
  } catch { /* Private browsing or an old/corrupt save: offer a fresh start. */ }
  return null;
}

export function createTutorial(adapter) {
  let saved, key, root, card, target, lastSelector, busy = false, error = '', previousFocus, missionReviewed = false;
  const memory = new Map();
  const storage = { getItem(k) { try { return localStorage.getItem(k) || memory.get(k); } catch { return memory.get(k); } } };
  const persist = () => {
    memory.set(key, JSON.stringify(saved));
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* Session fallback. */ }
  };
  function mount() {
    if (root) return;
    previousFocus = document.activeElement;
    root = document.createElement('div');
    root.className = 'guided-tutorial';
    document.body.classList.add('tutorial-running');
    root.innerHTML = `<div class="tutorial-shade"></div><div class="tutorial-shade"></div><div class="tutorial-shade"></div><div class="tutorial-shade"></div><div class="tutorial-ring" aria-hidden="true"><span>Hier klicken</span></div><section class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" tabindex="-1"></section>`;
    card = root.querySelector('.tutorial-card');
    document.body.append(root);
    card.focus({ preventScroll: true });
  }
  function close() {
    root?.remove(); root = card = target = null; lastSelector = null;
    document.body.classList.remove('tutorial-running');
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function saveStatus(status) { saved.status = status; persist(); close(); }
  function showCard(title, text, label, action, footer = true, progress = '') {
    mount();
    const signature = JSON.stringify([title, text, label, progress, footer, error]);
    if (card.dataset.signature === signature) return;
    const focusedLabel = card.contains(document.activeElement) ? document.activeElement.textContent : null;
    card.dataset.signature = signature;
    card.replaceChildren();
    const kicker = document.createElement('p'); kicker.className = 'tutorial-kicker'; kicker.textContent = progress || 'DEIN START INS IMPERIUM';
    const heading = document.createElement('h2'); heading.id = 'tutorial-title'; heading.textContent = title;
    const body = document.createElement('p'); body.textContent = text;
    card.append(kicker, heading, body);
    if (error) { const line = document.createElement('p'); line.className = 'error'; line.setAttribute('role', 'alert'); line.textContent = error; card.append(line); }
    if (label) {
      const button = document.createElement('button'); button.className = 'btn primary'; button.textContent = label;
      button.onclick = async () => {
        if (busy) return;
        busy = true; button.disabled = true; error = '';
        try { await action(); } catch (err) { error = err.message || 'Bitte erneut versuchen.'; }
        finally { busy = false; if (card) card.dataset.signature = ''; update(); }
      };
      card.append(button);
    }
    if (footer) {
      const pause = document.createElement('button'); pause.className = 'btn ghost'; pause.textContent = 'Pausieren'; pause.onclick = () => saveStatus('paused'); card.append(pause);
      const hint = document.createElement('small'); hint.textContent = 'Fortsetzen über „Erste Schritte“ in deiner Kolonie. Fortschritt wird in diesem Browser gespeichert.'; card.append(hint);
    }
    if (focusedLabel) ([...card.querySelectorAll('button')].find(b => b.textContent === focusedLabel) || card).focus({ preventScroll: true });
  }
  function layout() {
    if (!root) return;
    const w = innerWidth, h = innerHeight;
    let r = target?.isConnected ? target.getBoundingClientRect() : null;
    if (r && (!r.width || !r.height || r.bottom <= 0 || r.top >= h)) r = null;
    const left = r ? Math.max(0, r.left - 7) : 0, top = r ? Math.max(0, r.top - 7) : 0;
    const right = r ? Math.min(w, r.right + 7) : 0, bottom = r ? Math.min(h, r.bottom + 7) : 0;
    const boxes = r ? [[0, 0, w, top], [0, top, left, bottom - top], [right, top, w - right, bottom - top], [0, bottom, w, h - bottom]] : [[0, 0, w, h], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    [...root.querySelectorAll('.tutorial-shade')].forEach((el, i) => { const [x,y,width,height] = boxes[i]; Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` }); });
    const ring = root.querySelector('.tutorial-ring'); ring.hidden = !r;
    Object.assign(ring.style, { left: `${left}px`, top: `${top}px`, width: `${right-left}px`, height: `${bottom-top}px` });
    card.style.maxHeight = `${h - 16}px`;
    let cr = card.getBoundingClientRect();
    const beside = r && (right + cr.width + 22 < w || left - cr.width - 22 > 0);
    if (r && !beside) card.style.maxHeight = `${Math.max(90, Math.max(top - 22, h - bottom - 22))}px`;
    cr = card.getBoundingClientRect();
    const x = beside ? (right + cr.width + 22 < w ? right + 16 : left - cr.width - 16) : r ? left : (w-cr.width)/2;
    const y = !r ? (h-cr.height)/2 : beside ? Math.min(top, h-cr.height-8) : h-bottom >= top ? bottom + 14 : top-cr.height-14;
    ring.classList.toggle('below', top < 38 || y + cr.height <= top);
    Object.assign(card.style, { left: `${Math.max(8, Math.min(w-cr.width-8, x))}px`, top: `${Math.max(8,y)}px` });
  }
  function focusTarget(selector) {
    const next = selector ? [...document.querySelectorAll(selector)].find(el => el.getClientRects().length) : null;
    const rect = next?.getBoundingClientRect();
    if (next && (next !== target || selector !== lastSelector || rect.top < 90 || rect.bottom > innerHeight - 85)) next.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    target = next; lastSelector = selector;
    const ring = root?.querySelector('.tutorial-ring');
    if (ring) { ring.classList.remove('is-waiting'); ring.querySelector('span').textContent = next?.matches('button, summary') ? 'Hier klicken' : 'Hier ansehen'; }
    layout();
  }
  async function go(step) {
    await adapter.home();
    adapter.navigate(step.view);
  }
  function next() { saved.index = Math.min(tutorialSteps.length-1, saved.index+1); error = ''; persist(); target = null; missionReviewed = false; }
  function update() {
    if (!saved || saved.status !== 'active' || busy) { if (root) layout(); return; }
    const snap = adapter.snapshot();
    if (!snap?.empire || String(snap.empire.id) !== key.split(':').at(-1) || document.body.dataset.mode !== 'play') { close(); return; }
    let step = tutorialSteps[saved.index];
    while (saved.index < tutorialSteps.length-1 && snap.planet?.isHome) {
      if (step.kind === 'ship' && !saved.probeTarget) { saved.probeTarget = (snap.planet.ships?.probe || 0) + 1; persist(); }
      if (!stepComplete(step, snap, saved)) break;
      next(); step = tutorialSteps[saved.index];
    }
    if (step.id === 'scout' && adapter.spySent(saved)) { next(); step = tutorialSteps[saved.index]; }
    const progress = `FLUGSCHULE · ${saved.index+1} / ${tutorialSteps.length}`;
    const title = step.kind ? `${adapter.name(step)}${step.level ? ` · Stufe ${step.level}` : ''}` : { scout: 'Dein erster Aufklärungsflug', report: 'Wissen vor dem Angriff', finish: 'Bereit für die Galaxie' }[step.id];
    if (step.id === 'finish') {
      showCard(title, step.text, 'Tutorial abschließen', () => { saveStatus('done'); adapter.finish(); }, false, progress); focusTarget(null); return;
    }
    if (!snap.planet?.isHome || adapter.view() !== step.view) {
      showCard(title, step.text, { infra: 'Gebäude öffnen', research: 'Forschung öffnen', yard: 'Werft öffnen', galaxy: 'Sternenkarte öffnen', reports: 'Spionageberichte öffnen' }[step.view], () => go(step), true, progress); focusTarget(null); return;
    }
    if (step.kind) {
      const attr = { building: 'build', research: 'tech', ship: 'ship' }[step.kind];
      const selector = `button[data-${attr}="${step.item}"]`;
      const job = snap.queue?.find(q => q.kind === step.kind && (step.kind === 'research' || q.planetId === snap.planet.id));
      const button = document.querySelector(selector);
      const waiting = job ? ` Auftrag läuft${job.completesAt ? ` · noch ${Math.max(0, Math.ceil((job.completesAt-Date.now())/1000))} Sekunden` : ''}. Nach Fertigstellung prüfen wir den nächsten Schritt.` : button?.disabled ? ` ${adapter.missingResources(step) || 'Ressourcen oder eine freie Warteschlange fehlen noch.'} Du kannst warten oder pausieren und frei weiterspielen.` : ' Klicke auf die markierte Schaltfläche.';
      showCard(title, step.text + waiting, !button ? 'Ansicht neu laden' : '', () => go(step), true, progress);
      focusTarget(job ? `${selector.replace('button', '')}` : selector);
      root.querySelector('.tutorial-ring').classList.toggle('is-waiting', !!job || !!button?.disabled);
      root.querySelector('.tutorial-ring span').textContent = job ? '◷ Auftrag läuft' : button?.disabled ? '◷ Noch nicht bereit' : 'Hier klicken';
      return;
    }
    if (step.id === 'scout') {
      if (!(snap.planet.ships?.probe > 0) && !document.querySelector('#m-go')) {
        showCard(title, 'Keine Sonde im Hangar. Warte auf ihre Rückkehr oder baue eine Ersatzsonde.', 'Zur Werft', () => { saved.index = tutorialSteps.findIndex(s => s.id === 'probe'); saved.probeTarget = 1; persist(); adapter.navigate('yard'); }, true, progress); focusTarget(null); return;
      }
      const mission = document.querySelector('#mission');
      if (!mission) missionReviewed = false;
      const scout = saved.targetId && document.querySelector(`[data-target="${saved.targetId}"][data-mission-kind="spy"]`);
      showCard(title, mission ? missionReviewed ? 'Eine Sonde ist ausgewählt, der Auftrag lautet Spionage. Mit „Flotte senden“ startet dein echter Aufklärungsflug.' : 'Eine Sonde und der Auftrag Spionage sind vorausgewählt. Hier siehst du die Flugzeit und den benötigten Treibstoff. Prüfe die Angaben, bevor du startest.' : step.text, mission && !missionReviewed ? 'Flug geprüft' : mission || scout ? '' : 'Übungsziel anzeigen', async () => { if (mission) missionReviewed = true; else { saved.targetId = await adapter.pickTarget(); saved.sentAt = Date.now(); persist(); } }, true, progress);
      focusTarget(mission ? missionReviewed ? '#m-go' : '#travel-box' : scout ? `[data-target="${saved.targetId}"][data-mission-kind="spy"]` : null);
      return;
    }
    if (step.id === 'report') {
      const report = adapter.report(saved);
      showCard(title, step.text + (report?.open ? ' ' + adapter.reportSummary(report) : report ? ' Klicke auf die markierte Berichtszeile.' : ' Deine Sonde ist noch unterwegs. Der Bericht wird nach der Ankunft geladen.'), report?.open ? 'Bericht verstanden' : 'Berichte aktualisieren', async () => { if (report?.open) next(); else await adapter.refreshReports(); }, true, progress);
      focusTarget(report ? `[data-rid="${report.dataset.rid}"] ${report.open ? '.intel-grid' : '> summary'}` : null);
    }
  }
  function start() { saved = { ...(saved || {}), status: 'active', index: saved?.status === 'done' || saved?.status === 'skipped' ? 0 : saved?.index || 0 }; persist(); update(); }
  function enter(manual = false) {
    const snap = adapter.snapshot(); if (!snap?.empire) return;
    const newKey = `sn-guided-tutorial-v2:${snap.empire.id}`;
    if (key !== newKey) { close(); key = newKey; saved = readTutorial(storage, key); }
    if (manual) { if (saved?.status === 'done' || saved?.status === 'skipped') saved = null; start(); return; }
    if (saved?.status === 'active') { update(); return; }
    if (saved || !snap.empire.newbie) return;
    saved = { status: 'invited', index: 0 };
    showCard('Willkommen, Commander', 'Lerne deine Kolonie Schritt für Schritt kennen: Rohstoffe ausbauen, forschen, eine Sonde bauen und deinen ersten Planeten ausspionieren. Markierungen zeigen dir genau, wo du klicken musst. Bau- und Flugzeiten laufen regulär; du kannst jederzeit pausieren.', 'Tutorial spielen', start, false);
    const skip = document.createElement('button'); skip.className = 'btn ghost'; skip.textContent = 'Weiter ohne Tutorial.'; skip.onclick = () => saveStatus('skipped'); card.append(skip); layout();
  }
  // Capture blocks keyboard/pointer activation outside the spotlight, including canvas controls.
  const allowed = node => card?.contains(node) || target?.contains(node);
  document.addEventListener('click', event => { if (root && !allowed(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  document.addEventListener('focusin', event => { if (root && !allowed(event.target)) card.focus({ preventScroll: true }); });
  document.addEventListener('keydown', event => {
    if (!root) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); saveStatus(saved.status === 'invited' ? 'skipped' : 'paused'); return; }
    if (event.key !== 'Tab') return;
    const options = [...(target?.matches('button, input, select, summary, a[href]') && !target.disabled ? [target] : []), ...card.querySelectorAll('button:not(:disabled)')];
    if (!options.length) return;
    const i = options.indexOf(document.activeElement), direction = event.shiftKey ? -1 : 1;
    event.preventDefault(); options[(i + direction + options.length) % options.length].focus({ preventScroll: true });
  }, true);
  window.addEventListener('resize', layout);
  document.addEventListener('scroll', layout, true);
  setInterval(update, 350);
  return { enter, sent(targetId) { if (saved?.status === 'active' && tutorialSteps[saved.index].id === 'scout') { saved.targetId = targetId; persist(); next(); update(); } } };
}
