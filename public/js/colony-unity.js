const BUILD_URL = "/unity-colony/Build", PRODUCT = "unity-colony", VERSION = "living-3";
let instance = null, bootPromise = null, pendingState = null, selected = "", visible = false;
let listeners = {}, resizeObserver = null;
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
function send(method, value) { if (instance) instance.SendMessage("ColonyRoot", method, value); }
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof window.createUnityInstance === "function") return resolve();
    const el = document.createElement("script");
    el.src = src; el.onload = resolve;
    el.onerror = () => { el.remove(); reject(new Error("Unity-Loader konnte nicht geladen werden.")); };
    document.head.append(el);
  });
}
function sync() {
  if (pendingState) send("ApplyState", JSON.stringify(pendingState));
  send("SetSelected", selected);
  send("SetVisible", visible && !document.hidden ? "1" : "0");
  send("SetMotion", motion.matches ? "0" : "1");
}
const scene = {
  kind: "unity",
  setSelected(id) { selected = id || ""; send("SetSelected", selected); },
  setData(data) { pendingState = data; selected = data.selected || ""; if (instance) send("ApplyState", JSON.stringify(data)); },
  camera(action) { send("CameraAction", action); },
  focus(id) { send("FocusBuilding", id); },
  destroy() { setUnityColonyVisible(false); listeners = {}; },
};
window.stellarNexusColony = {
  onReady() { /* Loader resolves after Awake; sync happens below. */ },
  onSelect(id) { if (visible) { selected = id || ""; listeners.onSelect?.(selected); } },
  onFrame(frame) { if (visible) listeners.onFrame?.(frame); },
};
document.addEventListener("visibilitychange", () => send("SetVisible", visible && !document.hidden ? "1" : "0"));
motion.addEventListener("change", () => send("SetMotion", motion.matches ? "0" : "1"));
export function unityColonyAvailable() { return !!instance; }
export async function createColonyUnity(canvas, options = {}) {
  listeners = options; pendingState = options.state; selected = options.selectedId || "";
  canvas.onkeydown = event => {
    if (!visible) return;
    const action = { "+": "in", "=": "in", "-": "out", "Home": "home" }[event.key];
    if (action) { event.preventDefault(); scene.camera(action); }
    if (event.key === "Escape") { scene.setSelected(""); listeners.onSelect?.(""); }
  };
  if (!instance && !bootPromise) {
    const loading = document.getElementById("colony-unity-loading");
    if (loading) { loading.hidden = false; loading.textContent = "Basis wird geladen …"; }
    bootPromise = (async () => {
      await loadScript(`${BUILD_URL}/${PRODUCT}.loader.js?v=${VERSION}`);
      fitUnityCanvas(canvas);
      instance = await window.createUnityInstance(canvas, {
        dataUrl: `${BUILD_URL}/${PRODUCT}.data.unityweb?v=${VERSION}`,
        frameworkUrl: `${BUILD_URL}/${PRODUCT}.framework.js.unityweb?v=${VERSION}`,
        codeUrl: `${BUILD_URL}/${PRODUCT}.wasm.unityweb?v=${VERSION}`,
        streamingAssetsUrl: "/unity-colony/StreamingAssets",
        companyName: "Stellar Nexus", productName: "Colony", productVersion: VERSION,
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        matchWebGLToCanvasSize: true,
      }, progress => { if (loading) loading.textContent = `Basis wird geladen · ${Math.round(progress * 100)} %`; });
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => fitUnityCanvas(canvas));
      resizeObserver.observe(canvas.parentElement);
      if (loading) loading.hidden = true;
      return instance;
    })().catch(error => { bootPromise = null; instance = null; throw error; });
  }
  if (bootPromise) await bootPromise;
  sync();
  return scene;
}
export function setUnityColonyVisible(show) {
  visible = show;
  const layer = document.getElementById("colony-unity-layer");
  if (layer) { layer.hidden = !show; layer.classList.toggle("hidden", !show); }
  document.getElementById("game")?.classList.toggle("unity-active", show);
  send("SetVisible", show && !document.hidden ? "1" : "0");
}
export function resizeUnityColony() {
  const canvas = document.getElementById("colony-unity-canvas");
  if (canvas) fitUnityCanvas(canvas);
}
function fitUnityCanvas(canvas) {
  if (!canvas?.parentElement) return;
  const { clientWidth, clientHeight } = canvas.parentElement;
  canvas.style.width = `${Math.max(2, clientWidth)}px`;
  canvas.style.height = `${Math.max(2, clientHeight)}px`;
}
