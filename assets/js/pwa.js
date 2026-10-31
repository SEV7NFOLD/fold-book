"use strict";

(() => {
  const INSTALL_SNOOZE_KEY = "foldbook-install-prompt-snoozed-until";
  const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
  let installPromptEvent = null;
  let modal;
  let dashboardObserver;

  const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isStudentDashboardVisible = () => {
    const dashboard = document.querySelector("#studentApp");
    return Boolean(dashboard && !dashboard.hidden);
  };

  function shouldShowPrompt() {
    if (isInstalled() || !isStudentDashboardVisible()) return false;
    try {
      return Number(localStorage.getItem(INSTALL_SNOOZE_KEY) || 0) < Date.now();
    } catch {
      return true;
    }
  }

  function snoozePrompt() {
    try { localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* Storage may be unavailable. */ }
  }

  function rememberInstalled() {
    try { localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* Storage may be unavailable. */ }
  }

  function createModal() {
    if (modal) return modal;
    modal = document.createElement("section");
    modal.className = "foldbook-install-overlay";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "foldbookInstallTitle");
    modal.innerHTML = `
      <div class="foldbook-install-card">
        <button class="foldbook-install-close" type="button" aria-label="Close">×</button>
        <div class="foldbook-install-badge" aria-hidden="true"><span>🔥</span><i>✦</i></div>
        <p class="foldbook-install-kicker">YOUR STUDY SPACE, ONE TAP AWAY</p>
        <h2 id="foldbookInstallTitle">Use FoldBook on mobile</h2>
        <p class="foldbook-install-copy">Keep your courses, Dr. Eco, and learning streak close by. Add FoldBook to your home screen for a focused, app-like experience.</p>
        <div class="foldbook-install-streak"><span aria-hidden="true">⚡</span><span><strong>Small steps count.</strong> Pick up your next study quest whenever you’re ready.</span></div>
        <p class="foldbook-install-help" id="foldbookInstallHelp" hidden></p>
        <p class="foldbook-install-status" role="status" aria-live="polite"></p>
        <div class="foldbook-install-actions">
          <button class="foldbook-install-later" type="button">Maybe later</button>
          <button class="foldbook-install-cta" type="button"><span>Install FoldBook</span><b aria-hidden="true">→</b></button>
        </div>
      </div>`;
    document.body.append(modal);

    const later = () => {
      snoozePrompt();
      hideModal();
    };
    modal.querySelector(".foldbook-install-close").addEventListener("click", later);
    modal.querySelector(".foldbook-install-later").addEventListener("click", later);
    modal.addEventListener("click", (event) => { if (event.target === modal) later(); });
    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        later();
      }
    });
    modal.querySelector(".foldbook-install-cta").addEventListener("click", installOrExplain);
    return modal;
  }

  function hideModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
  }

  function showModal() {
    if (!shouldShowPrompt()) return;
    const panel = createModal();
    const button = panel.querySelector(".foldbook-install-cta");
    const help = panel.querySelector(".foldbook-install-help");
    const status = panel.querySelector(".foldbook-install-status");
    status.textContent = "";
    help.hidden = Boolean(installPromptEvent);
    button.querySelector("span").textContent = installPromptEvent ? "Install FoldBook" : "How to install";
    if (!installPromptEvent) {
      const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
      help.textContent = isAppleMobile
        ? "In Safari, tap Share, then Add to Home Screen."
        : "In Chrome, open the ⋮ menu and choose Install app or Add to Home screen.";
    }
    panel.hidden = false;
    button.focus({ preventScroll: true });
  }

  async function installOrExplain() {
    const status = modal.querySelector(".foldbook-install-status");
    if (!installPromptEvent) {
      status.textContent = "Open your browser menu and choose “Install app” or “Add to Home screen.”";
      return;
    }

    const promptEvent = installPromptEvent;
    installPromptEvent = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        rememberInstalled();
        hideModal();
      } else {
        snoozePrompt();
        hideModal();
      }
    } catch (error) {
      status.textContent = "Use your browser menu to add FoldBook to your home screen.";
      console.warn("FoldBook installation prompt could not be opened.", error);
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
  });
  window.addEventListener("appinstalled", () => {
    installPromptEvent = null;
    rememberInstalled();
    hideModal();
  });

  function observeDashboard() {
    const dashboard = document.querySelector("#studentApp");
    if (!dashboard || dashboardObserver) return;
    dashboardObserver = new MutationObserver(() => {
      if (isStudentDashboardVisible()) window.setTimeout(showModal, 1600);
    });
    dashboardObserver.observe(dashboard, { attributes: true, attributeFilter: ["hidden", "class"] });
    if (isStudentDashboardVisible()) window.setTimeout(showModal, 1600);
  }

  function start() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch((error) => console.warn("FoldBook offline support could not be enabled.", error));
    observeDashboard();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
