"use strict";

// Plays Foldo and Dr. Eco (core character pack) in any container.
// - One player per container; a new state on the same character reuses it.
// - Below the approved sizes (Foldo 96 px, Dr. Eco 120 px wide) it shows static art instead.
// - The container's static fallback (<img> or .mascot-fallback) stays until the animation renders.
(() => {
  const players = new WeakMap();
  const live = new Set();
  const dataPromises = new Map();
  const MIN_ANIMATED_WIDTH = { foldo: 96, eco: 120 };
  const STATIC_ART = { foldo: "/assets/brand/foldo-mark-dark.svg", eco: "/assets/brand/eco-avatar.svg" };

  async function loadData(character) {
    if (!dataPromises.has(character)) {
      const promise = fetch("/assets/lottie/mascots/" + character + "-dark.json.gz.b64")
        .then((response) => {
          if (!response.ok) throw new Error("Mascot animation request failed (" + response.status + ").");
          return response.text();
        })
        .then(async (encoded) => {
          if (typeof DecompressionStream !== "function") throw new Error("This browser cannot expand the mascot animation format.");
          const binary = atob(encoded.trim());
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
          return JSON.parse(await new Response(stream).text());
        });
      dataPromises.set(character, promise);
      promise.catch(() => dataPromises.delete(character));
    }
    return dataPromises.get(character);
  }

  // Destroy players whose container has left the page (for example a re-rendered screen).
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

  function showStatic(container, character) {
    stop(container);
    if (typeof container.__foldbookStop === "function") container.__foldbookStop.call(container);
    let image = container.querySelector(":scope > img.mascot-static");
    if (!image) {
      image = document.createElement("img");
      image.className = "mascot-static";
      image.alt = "";
      container.append(image);
    }
    image.src = STATIC_ART[character] || STATIC_ART.foldo;
  }

  window.stopFoldBookMascot = (container) => { if (container) stop(container); };

  // Wait for layout to settle before measuring: size classes are often added just before a call, and the
  // app's reduced-motion CSS gives every element a tiny transition, so an immediate read returns the old size.
  function settled() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 60);
    });
  }

  window.playFoldBookMascot = async (character, state, container, options = {}) => {
    if (!container) return;
    sweep();
    const measureToken = Number(container.dataset.mascotMeasure || 0) + 1;
    container.dataset.mascotMeasure = String(measureToken);
    await settled();
    if (container.dataset.mascotMeasure !== String(measureToken)) return;
    const width = container.getBoundingClientRect().width;
    if (width > 0 && width < (MIN_ANIMATED_WIDTH[character] || 96)) { showStatic(container, character); return; }
    if (!window.lottie || !window.FoldBookCharacters) return;

    const settings = { ...(character === "eco" ? { cap: "round" } : {}), ...options };
    if (character !== "foldo") delete settings.flameDays;
    const key = [character, settings.cap || "", settings.chartCard ? "chart" : "",
      character === "foldo" ? window.FoldBookCharacters.flameStageFor(Number(settings.flameDays) || 0) : ""].join(":");

    const token = Number(container.dataset.mascotToken || 0) + 1;
    container.dataset.mascotToken = String(token);
    try {
      const existing = players.get(container);
      if (existing && existing.key === key) {
        if (!existing.ready) { existing.pending = state; return; }
        if (existing.root && existing.root.isConnected) { existing.player.play(state); return; }
      }
      const data = await loadData(character);
      if (!container.isConnected || container.dataset.mascotToken !== String(token)) return;
      stop(container);
      // Another animation type (for example a UI animation) may own this container: release it first.
      if (typeof container.__foldbookStop === "function") container.__foldbookStop.call(container);
      container.querySelector(":scope > img.mascot-static")?.remove();
      const player = window.FoldBookCharacters.createCharacter(window.lottie, container, data, {
        initial: state,
        pauseOffscreen: true,
        ...settings
      });
      const entry = { key, player, container, ready: false, root: null, pending: null };
      player.anim.addEventListener("DOMLoaded", () => {
        entry.ready = true;
        entry.root = (player.anim.renderer && player.anim.renderer.svgElement) || container.querySelector(":scope > svg");
        container.classList.add("mascot-ready");
        if (entry.pending) { player.play(entry.pending); entry.pending = null; }
      });
      players.set(container, entry);
      live.add(entry);
      container.__foldbookStop = stopThis;
    } catch (error) {
      console.warn("FoldBook character animation could not load:", error.message);
    }
  };
})();
