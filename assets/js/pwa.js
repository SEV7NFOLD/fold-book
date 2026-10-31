"use strict";

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch((error) => console.warn("FoldBook offline support could not be enabled.", error));
  });
}
