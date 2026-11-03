"use strict";

// Plays FoldBook UI pack animations (assets/lottie/ui/<file>-dark.json) in any container.
//   playFoldBookUI(file, marker, container, { flameDays })   one-shots hold their end state; loops keep going
//   setFoldBookUIProgress(file, marker, container, 0..1)    progress-driven markers (never autoplayed)
//   stopFoldBookUI(container)                               destroy the player in a container
// The container's static fallback (.mascot-fallback) stays until the animation renders.
(() => {
  const players = new WeakMap();
  const live = new Set();
  const dataPromises = new Map();

  function loadData(file) {
    if (!dataPromises.has(file)) {
      const promise = fetch("/assets/lottie/ui/" + file + "-dark.json").then((response) => {
        if (!response.ok) throw new Error("UI animation request failed (" + response.status + ").");
        return response.json();
      });
      dataPromises.set(file, promise);
      promise.catch(() => dataPromises.delete(file));
    }
    return dataPromises.get(file);
  }

  function sweep() {
    for (const entry of live) {
      if (!entry.container.isConnected) stop(entry.container);
    }
  }

  function stop(container) {
    const entry = players.get(container);
    if (!entry) return;
    entry.player.destroy();
    live.delete(entry);
    players.delete(container);
    container.classList.remove("mascot-ready");
    if (container.__foldbookStop === stopThis) container.__foldbookStop = null;
  }
  function stopThis() { stop(this); }

  async function ensurePlayer(file, container, options, onReady) {
    if (!container || !window.lottie || !window.FoldBookUI) return;
    sweep();
    const stage = options.flameDays ? window.FoldBookUI.flameStageFor(Number(options.flameDays) || 1) : 0;
    const key = file + ":" + stage;
    const token = Number(container.dataset.uiToken || 0) + 1;
    container.dataset.uiToken = String(token);
    const existing = players.get(container);
    if (existing && existing.key === key) {
      if (!existing.ready) { existing.pending = onReady; return; }
      if (existing.root && existing.root.isConnected) { onReady(existing.player, false); return; }
    }
    let data = await loadData(file);
    if (!container.isConnected || container.dataset.uiToken !== String(token)) return;
    if (stage) data = window.FoldBookUI.withFlameStage(data, stage);
    stop(container);
    if (typeof container.__foldbookStop === "function") container.__foldbookStop.call(container);
    const player = window.FoldBookUI.createUIAnimation(window.lottie, container, data, { pauseOffscreen: options.pauseOffscreen !== false });
    const entry = { key, player, container, ready: false, root: null, pending: onReady };
    player.anim.addEventListener("DOMLoaded", () => {
      entry.ready = true;
      entry.root = (player.anim.renderer && player.anim.renderer.svgElement) || container.querySelector(":scope > svg");
      container.classList.add("mascot-ready");
      const run = entry.pending; entry.pending = null;
      if (run) run(player, true);
    });
    players.set(container, entry);
    live.add(entry);
    container.__foldbookStop = stopThis;
  }

  window.playFoldBookUI = async (file, marker, container, options = {}) => {
    try {
      await ensurePlayer(file, container, options, (player) => player.play(marker));
    } catch (error) {
      console.warn("FoldBook UI animation could not load:", error.message);
    }
  };

  window.setFoldBookUIProgress = async (file, marker, container, value, options = {}) => {
    try {
      await ensurePlayer(file, container, options, (player, isNew) => player.setProgress(marker, value, { animate: !isNew }));
    } catch (error) {
      console.warn("FoldBook UI animation could not load:", error.message);
    }
  };

  window.stopFoldBookUI = (container) => { if (container) stop(container); };
})();
