export async function api(path, { method = "GET", body, timeoutMs = 0 } = {}) {
  const controller=timeoutMs ? new AbortController() : null;
  const timer=controller ? setTimeout(()=>controller.abort(),timeoutMs) : null;
  try {
  const res = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: controller?.signal,
  });
  const data = await res.json().catch(err => { if(controller?.signal.aborted)throw err;return {}; });
  if (!res.ok) {
    const fallback = res.status === 404
      ? "Diese Aktion ist nicht verfügbar. Bitte die Seite neu laden."
      : res.statusText && !/^not found$/i.test(res.statusText)
        ? res.statusText
        : "Die Anfrage ist fehlgeschlagen.";
    const error = new Error(data.error || fallback);
    error.status = res.status;
    throw error;
  }
  return data;
  } catch(err) {
    if(controller?.signal.aborted){
      const error=new Error('Die Serverantwort fehlt. Die Aktion kann bereits ausgeführt sein. Bitte den Status auf Karte und im Funk prüfen.');
      error.timeout=true;throw error;
    }
    throw err;
  } finally { if(timer)clearTimeout(timer); }
}

export const getState = (planetId) => api("/state" + (planetId ? `?planet=${planetId}` : ""));
export const getCatalog = () => api("/catalog");
export const getPreview = (planetId) => api(`/preview?planetId=${planetId}`);
export const getGalaxy = () => api("/galaxy");
export const getSystem = (id) => api(`/system/${id}`);
export const getReports = (kind) => api("/reports" + (["combat","spy"].includes(kind) ? `?kind=${kind}` : ""));
export const getRanks = () => api("/ranks");
export const getEmpire = (id) => api(`/empire/${id}`);
export const combatPreview = (body) => api("/combat/preview", { method: "POST", body });
export const combatSim = (body) => api("/combat/sim", { method: "POST", body });
export const getAlliances = () => api("/alliances");
export const getAlliance = (id) => api(`/alliances/${id}`);
export const getAllianceActivity = (id) => api(`/alliances/${id}/activity`);
