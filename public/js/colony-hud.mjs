import { CITY_PLOTS, colonyBuildingStatus } from "./city.mjs?v=11";

const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
export function colonyRows(snap, catalog, previews, selected, now = Date.now()) {
  const byId = Object.fromEntries((previews?.planetId === String(snap?.planet?.id) ? previews.buildings || [] : []).map(p => [p.id, p]));
  return {
    planetId: String(snap?.planet?.id || ""), selected: selected || "",
    plots: CITY_PLOTS.map(plot => ({
      id: plot.id, name: catalog?.buildings?.[plot.id]?.name || plot.short,
      locked: byId[plot.id]?.unlocked === false,
      ...colonyBuildingStatus(plot.id, snap, catalog, now),
    })),
  };
}
export function colonyHudHtml(questsOpen = false) {
  return `<div class="colony-markers" aria-label="Gebäude">
    ${CITY_PLOTS.map(p => `<button type="button" class="colony-marker" data-colony-marker="${p.id}" data-city-building="${p.id}" hidden aria-label="${escape(p.short)}">
      <span class="colony-sleep" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>
      <span class="colony-level"><i></i><b>0</b></span>
    </button>`).join("")}</div>
    <div class="colony-tools" aria-label="Basisansicht">
      <button type="button" class="colony-orders" data-city-sheet="quests" aria-expanded="${questsOpen}" aria-controls="colony-quests" title="Tägliche und wöchentliche Aufgaben öffnen"><span aria-hidden="true">▤</span> Aufgaben</button>
    <details class="colony-directory"><summary>Gebäude <span>22</span></summary><div>
      ${CITY_PLOTS.map(p => `<button type="button" data-colony-focus="${p.id}"><span>${escape(p.short)}</span><b data-colony-list-level="${p.id}">0</b></button>`).join("")}
    </div></details>
    <button type="button" class="colony-guide" data-guide>Erste Schritte</button>
    </div>
    <div class="colony-load-error" hidden role="alert"><b>Basis konnte nicht geladen werden</b><p>Bitte erneut versuchen.</p><button type="button" data-colony-retry>Erneut laden</button></div>
    <div class="city-actions" id="city-actions" hidden role="region" aria-label="Gebäudeaktionen"></div>`;
}
export function paintColonyMarkers(root, rows) {
  for (const row of rows.plots) {
    const marker = root.querySelector(`[data-colony-marker="${row.id}"]`);
    if (!marker) continue;
    marker.dataset.status = row.status;
    marker.classList.toggle("selected", rows.selected === row.id);
    marker.querySelector("b").textContent = row.level;
    marker.setAttribute("aria-pressed", String(rows.selected === row.id));
    marker.setAttribute("aria-label", `${row.name}, Stufe ${row.level}, ${row.statusLabel}`);
    marker.title = `${row.name} · Stufe ${row.level} · ${row.statusLabel}`;
    const list = root.querySelector(`[data-colony-list-level="${row.id}"]`);
    if (list) {
      list.previousElementSibling.textContent = row.name;
      list.parentElement.setAttribute('aria-label', `${row.name}, Stufe ${row.level} öffnen`);
    }
    if (list) list.textContent = row.level;
  }
}
export function paintColonyFrame(root, frame, selected) {
  const view = root.querySelector(".living-colony");
  if (!view || !view.isConnected) return;
  for (const point of frame.anchors || []) {
    const marker = view.querySelector(`[data-colony-marker="${point.id}"]`);
    if (!marker) continue;
    marker.hidden = !point.visible;
    marker.style.left = `${point.x * 100}%`;
    marker.style.top = `${point.y * 100}%`;
  }
  // Building badges follow the camera; action buttons stay anchored in the viewport.
  // Moving a live button between pointerdown and pointerup loses the first tap.
}
