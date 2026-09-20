const count = value => Math.max(0, Math.floor(Number(value) || 0));
export function notificationBadges(snap = {}) {
  const h = snap.hints || {}, inbox = snap.unreadCounts;
  const reports = inbox ? Object.values(inbox).reduce((n,v) => n + count(v), 0) : count(h.reports ?? snap.unread);
  const values = {
    command: count(h.command), galaxy: count(h.galaxy),
    infra: count(h.infra), yard: count(h.yard), defense: count(h.defense), research: count(h.research),
    economy: count(h.economy), nexus: count(h.nexus), activity: count(h.activity),
    reports, chat: count(h.chat ?? snap.unreadChat), alliance: count(h.alliance),
  };
  // The parent badge counts destinations, not mixed messages, resources and flags.
  values.more = ['infra','yard','defense','research','economy','nexus','activity','reports','chat','alliance'].filter(k => values[k] > 0).length;
  for (const id of ['messages','combat','spy','mail']) values[`news-${id}`] = count(inbox?.[id] ?? (id === 'mail' ? snap.unreadMail : 0));
  const labels = {
    command: 'abholbare Aufgabenbelohnungen', galaxy: 'Hinweise auf Gefahren oder Trümmer',
    infra: 'Gebäudeausbau verfügbar', yard: 'Schiffsbau verfügbar', defense: 'Verteidigungsbau verfügbar', research: 'Forschung verfügbar',
    economy: 'Lager fast voll', nexus: 'Nex-Tagesbonus abholbar', activity: 'sofort startbare Einsatzarten',
    reports: 'ungelesene Berichte und Privatnachrichten', chat: 'ungelesene Chatnachrichten', alliance: 'laufende Allianz-Flottenaktionen',
    more: 'Bereiche mit verfügbaren Aktionen oder Hinweisen',
    'news-messages': 'ungelesene Nachrichten', 'news-combat': 'ungelesene Kampfberichte', 'news-spy': 'ungelesene Spionageberichte', 'news-mail': 'ungelesene Privatnachrichten',
  };
  return Object.fromEntries(Object.entries(values).map(([id,n]) => [id, { count:n, text:n>99?'99+':String(n), label:`${n} · ${labels[id]}` }]));
}
