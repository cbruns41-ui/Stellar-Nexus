"use strict";

(function () {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  let deferred = null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  function showInstallButtons() {
    document.querySelectorAll("[data-pwa-install]").forEach(function (el) {
      el.hidden = false;
      el.classList.remove("hidden");
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    showInstallButtons();
  });

  if (ios && !standalone) showInstallButtons();

  window.stellarInstallApp = function () {
    if (deferred) {
      deferred.prompt();
      return deferred.userChoice.then(function () {
        deferred = null;
      });
    }
    var msg = ios
      ? "iPhone: unten auf Teilen tippen, dann „Zum Home-Bildschirm“."
      : "Android: Browser-Menü (⋮) → „App installieren“ oder „Zum Startbildschirm hinzufügen“.\nDie Seite muss über HTTPS laufen (z. B. deine Vercel-URL).";
    window.alert(msg);
  };
})();
