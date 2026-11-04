"use strict";

(() => {
  const INSTALL_SNOOZE_KEY = "foldbook-install-prompt-snoozed-until";
  const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
  let installPromptEvent = null;
  let modal;
  let dashboardObserver;
  let broadcastTimer;


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
        <p class="foldbook-install-copy">Keep your courses, Dr. Eco, and learning streak one tap away.</p>
        <div class="foldbook-install-streak"><span aria-hidden="true">⚡</span><span><strong>Small steps count.</strong> Pick up your next study quest whenever you’re ready.</span></div>
        <p class="foldbook-reminder-copy">Up to two short study nudges a day, set by FoldBook Admin. Pause anytime.</p>
        <button class="foldbook-reminder-cta" type="button">Turn on daily reminders</button>
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
    modal.querySelector(".foldbook-reminder-cta").addEventListener("click", toggleStudyReminders);
    return modal;
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  }

  function updateReminderButton(enabled, buttonOverride) {
    const button = buttonOverride || modal?.querySelector(".foldbook-reminder-cta");
    if (button) button.textContent = enabled ? "Pause daily reminders" : "Turn on daily reminders";
    try {
      if (enabled) localStorage.setItem("foldbook-study-reminders-enabled", "1");
      else localStorage.removeItem("foldbook-study-reminders-enabled");
    } catch { /* Storage may be unavailable. */ }
  }

  async function toggleStudyReminders(statusOverride, buttonOverride) {
    const button = buttonOverride || modal?.querySelector(".foldbook-reminder-cta");
    const status = statusOverride || modal?.querySelector(".foldbook-install-status");
    if (!button || !status || !("Notification" in window) || !("PushManager" in window)) {
      if (status) status.textContent = "This browser does not support mobile reminders. Try the latest Chrome or Safari.";
      return;
    }
    button.disabled = true;
    try {
      if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isInstalled()) {
        status.textContent = "On iPhone, first use Share → Add to Home Screen, then open FoldBook from your home screen to turn on reminders.";
        return;
      }
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      const serviceWorker = await navigator.serviceWorker.ready;
      const existing = await serviceWorker.pushManager.getSubscription();
      if (existing) {
        const removed = await fetch("/api/student/reminders", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint })
        });
        if (!removed.ok) throw new Error("Your reminder setting could not be updated.");
        await existing.unsubscribe();
        updateReminderButton(false, buttonOverride);
        status.textContent = "Reminders paused. You can turn them back on whenever you’re ready.";
        return;
      }
      if (permission !== "granted") {
        status.textContent = "Notifications are off in your browser settings. Allow them there whenever you want FoldBook reminders.";
        return;
      }
      const keyResponse = await fetch("/api/student/reminders", { credentials: "same-origin" });
      if (!keyResponse.ok) throw new Error("Reminders are not ready yet. Please try again shortly.");
      const { publicKey } = await keyResponse.json();
      const subscription = await serviceWorker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey)
      });
      const saved = await fetch("/api/student/reminders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription })
      });
      if (!saved.ok) {
        await subscription.unsubscribe();
        throw new Error("We couldn’t save your reminder setting. Please try again.");
      }
      updateReminderButton(true, buttonOverride);
      status.textContent = "You’re in! We’ll send up to two gentle study nudges a day. Keep your streak growing 🌱";
    } catch (error) {
      status.textContent = error.message || "Could not update reminders right now. Please try again shortly.";
    } finally {
      button.disabled = false;
    }
  }

  function hideModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
  }

  function showModal() {
    if (!shouldShowPrompt()) return;
    const panel = createModal();
    const button = panel.querySelector(".foldbook-install-cta");
    const reminderButton = panel.querySelector(".foldbook-reminder-cta");
    const help = panel.querySelector(".foldbook-install-help");
    reminderButton.hidden = !("Notification" in window && "PushManager" in window && "serviceWorker" in navigator);
    const isAndroid = /android/i.test(navigator.userAgent);
    const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const status = panel.querySelector(".foldbook-install-status");
    status.textContent = "";
    help.hidden = false;
    button.querySelector("span").textContent = isAndroid
      ? "Download Android app"
      : isAppleMobile
        ? "Show iPhone install steps"
        : installPromptEvent ? "Install FoldBook" : "How to install";
    if (isAndroid) {
      help.textContent = "Android · One tap downloads the app. Open the APK from Downloads and tap Install. If asked, allow your browser to install apps.";
    } else if (isAppleMobile) {
      const safari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);
      help.textContent = safari
        ? "Install FoldBook on iPhone\n1. In Safari, tap Share (square with the up arrow).\n2. Scroll and tap “Add to Home Screen”. If it’s missing, tap “Edit Actions” and add it.\n3. Turn on “Open as Web App” for an app-like experience.\n4. Tap “Add”. Find FoldBook on your Home Screen."
        : "Install FoldBook on iPhone\n1. Open this page in Safari.\n2. Tap Share (square with the up arrow).\n3. Scroll and tap “Add to Home Screen”. If it’s missing, tap “Edit Actions” and add it.\n4. Turn on “Open as Web App”, then tap “Add”.";
    } else {
      help.textContent = installPromptEvent
        ? "Your browser can install FoldBook now. Tap the button and confirm “Install”."
        : "Open your browser menu and choose “Install app” or “Add to Home screen”.";
    }
    panel.hidden = false;
    button.focus({ preventScroll: true });
  }

  async function installOrExplain() {
    const status = modal.querySelector(".foldbook-install-status");
    if (/android/i.test(navigator.userAgent)) {
      window.location.assign("/download/android");
      return;
    }
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      status.textContent = "In Safari, tap Share → Add to Home Screen, turn on “Open as Web App”, then tap Add. If “Add to Home Screen” is missing, scroll to Edit Actions.";
      return;
    }
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

  function showReminderArrival() {
    const url = new URL(window.location.href);
    if (url.searchParams.get("from") !== "reminder" || !isStudentDashboardVisible()) return;
    const dashboard = document.querySelector("#studentApp");
    if (!dashboard || dashboard.querySelector(".foldbook-reminder-arrival")) return;

    const card = document.createElement("aside");
    card.className = "foldbook-reminder-arrival";
    card.setAttribute("role", "status");
    card.innerHTML = '<div class="foldbook-reminder-arrival-art" aria-hidden="true"><img class="mascot-static" src="/assets/brand/foldo-icon-dark.svg" alt=""></div><div class="foldbook-reminder-arrival-copy"><strong>Your next quick win is ready.</strong><small>Five minutes can move your study path forward.</small></div><button type="button">Let’s study</button>';
    const art = card.querySelector(".foldbook-reminder-arrival-art");
    const moment = url.searchParams.get("moment");
    const character = url.searchParams.get("character") === "eco" ? "eco" : "foldo";
    const state = moment === "morning" ? "greet" : moment === "evening" ? "welcome-back" : "encourage";
    const heading = card.querySelector(".foldbook-reminder-arrival-copy strong");
    const caption = card.querySelector(".foldbook-reminder-arrival-copy small");
    if (character === "eco") {
      art.querySelector("img").src = "/assets/brand/eco-avatar.svg";
      heading.textContent = moment === "evening" ? "Dr. Eco saved you a quick win." : "Dr. Eco has a study nudge for you.";
      caption.textContent = "Five focused minutes can move your study path forward.";
      window.playFoldBookMascot?.("eco", state, art, { cap: "round" });
    } else {
      heading.textContent = moment === "evening" ? "Foldo is here for one last quick win." : "Foldo has a little study quest for you.";
      window.playFoldBookMascot?.("foldo", state, art);
    }
    card.querySelector("button").addEventListener("click", () => {
      dashboard.querySelector("#navLearn")?.click();
      card.remove();
    });
    dashboard.prepend(card);
    url.searchParams.delete("from");
    url.searchParams.delete("moment");
    url.searchParams.delete("character");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function reminderCharacterForStudent() {
    try {
      const saved = JSON.parse(localStorage.getItem("foldBook.studyProgress") || "{}");
      return /^ECO\b/i.test(String(saved.course || "")) ? "eco" : "foldo";
    } catch {
      return "foldo";
    }
  }

  function readDismissedBroadcastIds() {
    try {
      const saved = JSON.parse(localStorage.getItem("foldbook-dismissed-broadcasts") || "[]");
      return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function dismissBroadcast(id) {
    const dismissed = readDismissedBroadcastIds();
    dismissed.add(String(id));
    try { localStorage.setItem("foldbook-dismissed-broadcasts", JSON.stringify([...dismissed].slice(-100))); } catch { /* Storage may be unavailable. */ }
  }

  async function showStudentBroadcast() {
    if (!isStudentDashboardVisible()) return;
    const dashboard = document.querySelector("#studentApp");
    if (!dashboard || dashboard.querySelector(".foldbook-broadcast-banner")) return;
    try {
      const response = await fetch("/api/student/notifications", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const dismissed = readDismissedBroadcastIds();
      const notice = (Array.isArray(data.notifications) ? data.notifications : [])
        .find((item) => item?.id && item?.message && !dismissed.has(String(item.id)));
      if (!notice || !isStudentDashboardVisible()) return;

      const banner = document.createElement("aside");
      banner.className = "foldbook-broadcast-banner";
      banner.setAttribute("role", "status");
      const character = reminderCharacterForStudent();
      const mascot = document.createElement("div");
      mascot.className = "foldbook-broadcast-mascot";
      mascot.setAttribute("aria-hidden", "true");
      const portrait = document.createElement("img");
      portrait.className = "mascot-static";
      portrait.src = character === "eco" ? "/assets/brand/eco-avatar.svg" : "/assets/brand/foldo-icon-dark.svg";
      portrait.alt = "";
      mascot.append(portrait);
      window.playFoldBookMascot?.(character, "encourage", mascot, character === "eco" ? { cap: "round" } : {});
      const copy = document.createElement("div");
      copy.className = "foldbook-broadcast-copy";
      const kicker = document.createElement("strong");
      kicker.textContent = "A note from FoldBook";
      const message = document.createElement("p");
      message.textContent = notice.message;
      copy.append(kicker, message);

      const actions = document.createElement("div");
      actions.className = "foldbook-broadcast-actions";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "Open study";
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "foldbook-broadcast-dismiss";
      dismissButton.setAttribute("aria-label", "Dismiss reminder");
      dismissButton.textContent = "×";
      const finish = () => {
        dismissBroadcast(notice.id);
        banner.remove();
      };
      openButton.addEventListener("click", () => {
        finish();
        dashboard.querySelector("#navLearn")?.click();
      });
      dismissButton.addEventListener("click", finish);
      actions.append(openButton, dismissButton);
      banner.append(mascot, copy, actions);
      dashboard.prepend(banner);
    } catch (error) {
      console.warn("FoldBook inbox reminders could not be loaded.", error);
    }
  }

  function startBroadcastChecks() {
    if (broadcastTimer) return;
    void showStudentBroadcast();
    broadcastTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void showStudentBroadcast();
    }, 60 * 1000);
  }

  function addInstalledReminderBanner() {
    if (!isInstalled() || !isStudentDashboardVisible()) return;
    const dashboard = document.querySelector("#studentApp");
    if (!dashboard || dashboard.querySelector(".foldbook-reminder-banner")) return;
    let enabled = false;
    try { enabled = localStorage.getItem("foldbook-study-reminders-enabled") === "1"; } catch { /* Storage may be unavailable. */ }
    if (enabled) return;
    const banner = document.createElement("aside");
    banner.className = "foldbook-reminder-banner";
    banner.innerHTML = '<span aria-hidden="true">🔥</span><span><strong>Keep your study streak warm</strong><small>Get friendly reminders set by FoldBook Admin.</small><small class="foldbook-reminder-banner-status" role="status" aria-live="polite"></small></span><button type="button">Set reminder</button>';
    const bannerButton = banner.querySelector("button");
    const bannerStatus = banner.querySelector(".foldbook-reminder-banner-status");
    bannerButton.addEventListener("click", async () => {
      if (!modal) createModal();
      await toggleStudyReminders(bannerStatus, bannerButton);
      try {
        if (localStorage.getItem("foldbook-study-reminders-enabled") === "1") banner.remove();
      } catch { /* Storage may be unavailable. */ }
    });
    dashboard.prepend(banner);
  }

  function setupPullToRefresh() {
    const dashboard = document.querySelector("#studentApp");
    if (!dashboard || dashboard.dataset.foldbookPullRefresh === "ready") return;
    dashboard.dataset.foldbookPullRefresh = "ready";
    const indicator = document.createElement("div");
    indicator.className = "foldbook-pull-indicator";
    indicator.setAttribute("aria-hidden", "true");
    indicator.innerHTML = '<span class="foldbook-pull-spinner"></span><span>Release to refresh FoldBook</span>';
    document.body.append(indicator);

    let startY = 0;
    let pullDistance = 0;
    let tracking = false;
    const topOfPage = () => Math.max(window.scrollY || 0, document.scrollingElement?.scrollTop || 0) <= 2;
    dashboard.addEventListener("touchstart", (event) => {
      if (!isStudentDashboardVisible() || !topOfPage() || event.touches.length !== 1
        || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      startY = event.touches[0].clientY;
      pullDistance = 0;
      tracking = true;
    }, { passive: true });
    dashboard.addEventListener("touchmove", (event) => {
      if (!tracking || event.touches.length !== 1 || !topOfPage()) {
        tracking = false;
        indicator.classList.remove("is-pulling", "is-ready");
        return;
      }
      pullDistance = Math.max(0, Math.min(110, event.touches[0].clientY - startY));
      if (pullDistance < 8) return;
      indicator.style.setProperty("--foldbook-pull-distance", pullDistance + "px");
      indicator.classList.add("is-pulling");
      indicator.classList.toggle("is-ready", pullDistance >= 72);
      event.preventDefault();
    }, { passive: false });
    const finish = () => {
      if (!tracking) return;
      tracking = false;
      indicator.classList.remove("is-pulling", "is-ready");
      if (pullDistance >= 72) {
        indicator.classList.add("is-refreshing");
        window.dispatchEvent(new Event("foldbook:refresh"));
        window.setTimeout(() => indicator.classList.remove("is-refreshing"), 950);
      }
      pullDistance = 0;
    };
    dashboard.addEventListener("touchend", finish, { passive: true });
    dashboard.addEventListener("touchcancel", finish, { passive: true });
  }

  function observeDashboard() {
    const dashboard = document.querySelector("#studentApp");
    if (!dashboard || dashboardObserver) return;
    dashboardObserver = new MutationObserver(() => {
      if (isStudentDashboardVisible()) {
        document.body.classList.add("foldbook-app-open");
        showReminderArrival();
        addInstalledReminderBanner();
        startBroadcastChecks();
        window.setTimeout(showModal, 1600);
      } else {
        document.body.classList.remove("foldbook-app-open");
      }
    });
    dashboardObserver.observe(dashboard, { attributes: true, attributeFilter: ["hidden", "class"] });
    if (isStudentDashboardVisible()) {
      document.body.classList.add("foldbook-app-open");
      showReminderArrival();
      addInstalledReminderBanner();
      startBroadcastChecks();
      window.setTimeout(showModal, 1600);
    }
  }

  function start() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch((error) => console.warn("FoldBook offline support could not be enabled.", error));
    setupPullToRefresh();
    observeDashboard();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
