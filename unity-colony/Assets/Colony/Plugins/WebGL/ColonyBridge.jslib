mergeInto(LibraryManager.library, {
  SN_NotifyReady: function () {
    if (typeof window !== "undefined" && window.stellarNexusColony && typeof window.stellarNexusColony.onReady === "function") {
      window.stellarNexusColony.onReady();
    }
  },
  SN_NotifySelect: function (idPtr) {
    var id = UTF8ToString(idPtr);
    if (typeof window !== "undefined" && window.stellarNexusColony && typeof window.stellarNexusColony.onSelect === "function") {
      window.stellarNexusColony.onSelect(id);
    }
  }
});
