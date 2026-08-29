export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const getState = (planetId) => api("/state" + (planetId ? `?planet=${planetId}` : ""));
export const getCatalog = () => api("/catalog");
export const getPreview = (planetId) => api(`/preview?planetId=${planetId}`);
export const getGalaxy = () => api("/galaxy");
export const getSystem = (id) => api(`/system/${id}`);
export const getReports = () => api("/reports");
export const getRanks = () => api("/ranks");
export const getEmpire = (id) => api(`/empire/${id}`);
export const combatPreview = (body) => api("/combat/preview", { method: "POST", body });
export const combatSim = (body) => api("/combat/sim", { method: "POST", body });
export const getAlliances = () => api("/alliances");
export const getAlliance = (id) => api(`/alliances/${id}`);
export const getAllianceActivity = (id) => api(`/alliances/${id}/activity`);
