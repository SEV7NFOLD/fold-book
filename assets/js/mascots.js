"use strict";

(() => {
  const players = new WeakMap();
  const dataPromises = new Map();

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

  window.playFoldBookMascot = async (character, state, container, options = {}) => {
    if (!container || !window.lottie || !window.FoldBookCharacters) return;
    const token = Number(container.dataset.mascotToken || 0) + 1;
    container.dataset.mascotToken = String(token);
    try {
      const existing = players.get(container);
      if (existing && existing.character === character) {
        existing.player.play(state);
        return;
      }
      const data = await loadData(character);
      if (!container.isConnected || container.dataset.mascotToken !== String(token)) return;
      if (existing) existing.player.destroy();
      const player = window.FoldBookCharacters.createCharacter(window.lottie, container, data, {
        initial: state,
        pauseOffscreen: true,
        ...options
      });
      players.set(container, { character, player });
    } catch (error) {
      console.warn("FoldBook character animation could not load:", error.message);
    }
  };
})();
