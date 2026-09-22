import { api } from './api.js?v=5';
import { esc, when } from './ui.js?v=3';

export function bootRegistrations(root) {
  root.innerHTML = `<details class="registration-overview">
    <summary><b>Registrierungen</b><span data-registration-counts>Wird geladen …</span></summary>
    <p class="hint">Freigabe über den Link in der Admin-E-Mail. Danach wird die Spielerbestätigung automatisch gesendet. Erfolgreich bestätigte Accounts stehen unter „Erledigt“.</p>
    <form class="registration-tools">
      <label>Anzeige<select name="filter"><option value="open">Offen</option><option value="done">Erledigt</option><option value="all">Alle</option></select></label>
      <label>Spieler oder E-Mail<input name="q" type="search" maxlength="180" placeholder="Suchen …"></label>
      <button class="btn small" type="submit">Suchen</button>
      <button class="btn ghost small" type="button" data-registration-refresh>Aktualisieren</button>
    </form>
    <p data-registration-message role="status" hidden></p>
    <div data-registration-list></div>
    <div class="registration-pages"><button class="btn ghost small" data-registration-prev>Zurück</button><span data-registration-page></span><button class="btn ghost small" data-registration-next>Weiter</button></div>
  </details>`;
  const overview = root.querySelector('details'), form = root.querySelector('form');
  const list = root.querySelector('[data-registration-list]'), message = root.querySelector('[data-registration-message]');
  const prev = root.querySelector('[data-registration-prev]'), next = root.querySelector('[data-registration-next]');
  let filter = 'open', q = '', page = 1, sequence = 0, busy = false, lastRows = '';
  const feedback = (text, error = false) => { message.textContent = text; message.hidden = !text; message.classList.toggle('error', error); };

  function rowHtml(r) {
    const approved = r.status === 'approved', done = approved && r.player_mail_status === 'sent';
    const sending = approved && r.player_mail_status === 'sending' && r.player_mail_attempted_at > Date.now() - 120000;
    const failed = approved ? r.player_mail_status === 'failed' : r.mail_status === 'failed';
    const status = done ? 'Freigegeben · Bestätigung versandt' : sending ? 'Bestätigung wird gesendet' : approved ? (failed ? 'Freigegeben · Bestätigung fehlgeschlagen' : 'Freigegeben · Bestätigung offen') : (failed ? 'Freigabe offen · Admin-Mail fehlgeschlagen' : 'Wartet auf Freigabe');
    const adminStatus = r.mail_status === 'sent' ? 'Freigabe-Mail an Admin versandt. Freigabe steht noch aus.' : r.mail_status === 'failed' ? 'Freigabe-Mail an Admin fehlgeschlagen.' : 'Freigabe-Mail an Admin noch nicht versandt.';
    const error = approved ? r.player_mail_error : r.mail_error;
    return `<details class="registration-entry" data-registration-id="${r.id}">
      <summary><b>${esc(r.username)}</b><span class="${failed ? 'error' : 'muted'}">${esc(status)}</span></summary>
      <div class="registration-entry-body"><p>${esc(r.email)} · Registriert ${esc(when(r.created_at))}</p>
      ${!approved ? `<p>${adminStatus}</p>` : ''}
      ${!done && error ? `<p class="error">${esc(error)}</p>` : ''}
      ${done ? '' : `<button class="btn small" data-registration-action="${approved ? 'confirmation' : 'resend'}" data-id="${r.id}" ${sending ? 'disabled' : ''}>${sending ? 'Versand läuft …' : approved ? 'Bestätigung an Spieler senden' : 'Freigabe-Mail an Admin erneut senden'}</button>`}
      </div></details>`;
  }

  async function load() {
    const request = ++sequence;
    try {
      const data = await api(`/admin/registrations?${new URLSearchParams({filter, q, page: String(page)})}`);
      if (!root.isConnected || request !== sequence) return;
      page = data.page;
      root.querySelector('[data-registration-counts]').textContent = `${data.counts.open} offen · ${data.counts.done} erledigt`;
      root.querySelector('[data-registration-page]').textContent = `${data.total} Treffer · Seite ${page} von ${data.pages}`;
      prev.disabled = page <= 1; next.disabled = page >= data.pages;
      const html = data.registrations.map(rowHtml).join('') || `<p class="muted">${filter === 'open' && !q ? 'Keine offenen Registrierungen.' : 'Keine passenden Registrierungen.'}</p>`;
      if (html !== lastRows) {
        const expanded = new Set([...list.querySelectorAll('details[open]')].map(el => el.dataset.registrationId));
        list.innerHTML = html; lastRows = html;
        list.querySelectorAll('details').forEach(el => { el.open = expanded.has(el.dataset.registrationId); });
      }
    } catch (err) {
      if (root.isConnected && request === sequence) feedback(err.message, true);
    }
  }
  form.onsubmit = event => { event.preventDefault(); if (busy) return; filter = form.elements.filter.value; q = form.elements.q.value.trim(); page = 1; feedback(''); load(); };
  form.elements.filter.onchange = () => form.requestSubmit();
  prev.onclick = () => { if (!busy && page > 1) { page--; load(); } };
  next.onclick = () => { if (!busy) { page++; load(); } };
  root.querySelector('[data-registration-refresh]').onclick = () => { if (!busy) { feedback(''); load(); } };
  overview.addEventListener('toggle', () => { if (overview.open && !busy) load(); });
  list.onclick = async event => {
    const button = event.target.closest('[data-registration-action]');
    if (!button || busy || button.disabled) return;
    busy = true; ++sequence; button.disabled = true;
    feedback('Mail wird versendet …');
    try {
      await api(`/admin/registrations/${button.dataset.id}/${button.dataset.registrationAction}`, {method: 'POST', body: {}, timeoutMs: 45000});
      feedback(button.dataset.registrationAction === 'confirmation' ? 'Bestätigung versandt. Die Registrierung ist erledigt.' : 'Freigabe-Mail an Admin versandt. Die Freigabe steht noch aus.');
    } catch (err) { feedback(err.message, true); }
    finally { busy = false; button.disabled = false; await load(); }
  };
  // Stop polling as soon as the admin view is replaced. Keep expanded rows and search input intact.
  async function poll() {
    if (!root.isConnected) return;
    if (!busy && !document.hidden) await load();
    if (root.isConnected) setTimeout(poll, 15000);
  }
  poll();
}
