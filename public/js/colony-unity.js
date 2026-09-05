const BUILD_URL = "/unity-colony/Build";
const PRODUCT = "unity-colony";

let instance = null;
let bootPromise = null;
let listeners = { onReady: null, onSelect: null };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Unity-Loader nicht geladen."));
    document.head.appendChild(el);
  });
}

function sendState(state) {
  if (!instance || !state) return;
  try {
    instance.SendMessage("ColonyRoot", "ApplyState", JSON.stringify(state));
  } catch (err) {
    console.warn("Unity ApplyState", err);
  }
}

function api() {
  return {
    kind: "unity",
    setSelected(id) {
      try { instance?.SendMessage("ColonyRoot", "SetSelected", id || ""); } catch { /* ignore */ }
    },
    setData(next) { sendState(next); },
    destroy() { /* persistent WebGL instance */ },
  };
}

export function unityColonyAvailable() {
  return typeof createUnityInstance === "function" || !!instance;
}

export async function createColonyUnity(canvas, options = {}) {
  listeners = {
    onReady: options.onReady || null,
    onSelect: options.onSelect || null,
  };
  window.stellarNexusColony = {
    onReady() {
      listeners.onReady?.();
      if (options.state) sendState(options.state);
      if (options.selectedId) {
        try { instance?.SendMessage("ColonyRoot", "SetSelected", options.selectedId); } catch { /* ignore */ }
      }
    },
    onSelect(id) {
      listeners.onSelect?.(id || null);
    },
  };

  if (instance) {
    sendState(options.state);
    if (options.selectedId != null) {
      try { instance.SendMessage("ColonyRoot", "SetSelected", options.selectedId || ""); } catch { /* ignore */ }
    }
    return api();
  }
  if (bootPromise) {
    await bootPromise;
    sendState(options.state);
    return api();
  }

  bootPromise = (async () => {
    await loadScript(`${BUILD_URL}/${PRODUCT}.loader.js`);
    if (typeof createUnityInstance !== "function") throw new Error("createUnityInstance fehlt.");
    const loading = document.getElementById("colony-unity-loading");
    fitUnityCanvas(canvas);
    instance = await createUnityInstance(canvas, {
      dataUrl: `${BUILD_URL}/${PRODUCT}.data`,
      frameworkUrl: `${BUILD_URL}/${PRODUCT}.framework.js`,
      codeUrl: `${BUILD_URL}/${PRODUCT}.wasm`,
      streamingAssetsUrl: "/unity-colony/StreamingAssets",
      companyName: "Stellar Nexus",
      productName: "Colony",
      productVersion: "1.0.0",
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      matchWebGLToCanvasSize: true,
    }, (progress) => {
      if (loading) loading.textContent = `Lade Basis… ${Math.round(progress * 100)}%`;
    });
    if (loading) loading.hidden = true;
    fitUnityCanvas(canvas);
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => fitUnityCanvas(canvas)).observe(canvas.parentElement || canvas);
    }
    window.addEventListener("resize", () => fitUnityCanvas(canvas));
    if (options.state) sendState(options.state);
    if (options.selectedId) {
      try { instance.SendMessage("ColonyRoot", "SetSelected", options.selectedId); } catch { /* ignore */ }
    }
    listeners.onReady?.();
    return instance;
  })();

  try {
    await bootPromise;
    return api();
  } catch (err) {
    bootPromise = null;
    instance = null;
    throw err;
  }
}

export function setUnityColonyVisible(show) {
  const layer = document.getElementById("colony-unity-layer");
  if (!layer) return;
  layer.hidden = !show;
  layer.classList.toggle("hidden", !show);
}

export function resizeUnityColony() {
  const canvas = document.getElementById("colony-unity-canvas");
  if (canvas) fitUnityCanvas(canvas);
}

function fitUnityCanvas(canvas) {
  const layer = canvas?.parentElement;
  if (!canvas || !layer) return;
  const w = Math.max(2, layer.clientWidth || layer.offsetWidth || 0);
  const h = Math.max(2, layer.clientHeight || layer.offsetHeight || 0);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
