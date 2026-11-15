/*
 * Dr. Eco talking head for the voice call screen.
 *
 * Shows only Dr. Eco's head (from the approved static art in assets/brand/eco-avatar.svg,
 * arms hidden) with a simple Duolingo-style lip sync: the mouth opens with the loudness
 * of Dr. Eco's real voice audio. Adds a gentle head bob, blinks and a listening tilt.
 * The approved Lottie animation data is not touched.
 *
 *   window.FoldBookEcoTalker.mount(container)          -> renders the head
 *   window.FoldBookEcoTalker.setState(container, s)    -> "SPEAKING" | "LISTENING" | "CONNECTING" | "ERROR" | "IDLE"
 *   window.FoldBookEcoTalker.setLevelSource(fn)        -> fn() returns current voice loudness 0..1
 *   window.FoldBookEcoTalker.unmount(container)
 */
(() => {
  const SVG_URL = "/assets/brand/eco-avatar.svg";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let svgTextPromise = null;
  let levelSource = null;
  const players = new Map();

  const loadSvg = () => {
    if (!svgTextPromise) {
      svgTextPromise = fetch(SVG_URL, { credentials: "same-origin" })
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .catch((error) => { svgTextPromise = null; throw error; });
    }
    return svgTextPromise;
  };

  const el = (name, attrs) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };

  function buildHead(svgText) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new Error("Invalid Dr. Eco art");
    const svgNode = document.importNode(svg, true);
    // Head-and-shoulders crop, no hands.
    svgNode.setAttribute("viewBox", "40 18 120 120");
    svgNode.setAttribute("class", "eco-talker-svg");
    svgNode.setAttribute("aria-hidden", "true");
    svgNode.setAttribute("focusable", "false");
    svgNode.removeAttribute("width");
    svgNode.removeAttribute("height");
    svgNode.querySelectorAll("#arm-l, #arm-r").forEach((node) => node.remove());
    // Keep the round avatar clip (head-and-shoulders bubble) but drop its light background.
    const clipped = svgNode.querySelector("[clip-path]");
    const bg = clipped?.querySelector(":scope > circle");
    if (bg) bg.remove();
    // Give the clip a unique id so several copies on a page never clash.
    const avatarClip = svgNode.querySelector("clipPath#av-clip");
    if (avatarClip && clipped) {
      const clipId = `eco-av-clip-${Math.random().toString(36).slice(2, 8)}`;
      avatarClip.id = clipId;
      clipped.setAttribute("clip-path", `url(#${clipId})`);
    }
    // Unique ids so two copies never clash.
    svgNode.querySelectorAll("g[id]").forEach((node) => {
      node.setAttribute("data-eco-part", node.id);
      node.removeAttribute("id");
    });

    const head = svgNode.querySelector('[data-eco-part="head"]');
    const beard = svgNode.querySelector('[data-eco-part="beard"]');
    const mouthBig = svgNode.querySelector('[data-eco-part="mouth-big"]');
    const neutralMouth = svgNode.querySelector('[data-eco-part="mouth-neutral"]');
    const eyes = svgNode.querySelector('[data-eco-part="eye-neutral"]');
    if (!head || !mouthBig) throw new Error("Dr. Eco art is missing its head or mouth");

    // Open mouth: dark oval with a tongue, scaled vertically by voice loudness.
    const openMouth = el("g", { class: "eco-talker-mouth" });
    const mouthClipId = `eco-mouth-clip-${Math.random().toString(36).slice(2, 8)}`;
    const clip = el("clipPath", { id: mouthClipId });
    const clipShape = el("ellipse", { cx: "100", cy: "102", rx: "7", ry: "1" });
    clip.append(clipShape);
    const defs = svgNode.querySelector("defs") || svgNode.insertBefore(el("defs", {}), svgNode.firstChild);
    defs.append(clip);
    const cavity = el("ellipse", { cx: "100", cy: "102", rx: "7", ry: "1", fill: "rgb(36, 19, 11)", stroke: "rgb(36, 19, 11)", "stroke-width": "1.6" });
    const tongue = el("ellipse", { cx: "100", cy: "107", rx: "5", ry: "3", fill: "rgb(214, 96, 92)", "clip-path": `url(#${mouthClipId})` });
    openMouth.append(cavity, tongue);
    // Sit the mouth just behind the moustache so its top edge tucks under it.
    const moustache = [...head.querySelectorAll("path")].find((node) => (node.getAttribute("d") || "").startsWith("M83 92"));
    if (moustache) moustache.parentNode.insertBefore(openMouth, moustache);
    else mouthBig.append(openMouth);
    openMouth.style.opacity = "0";

    // Eyelids for blinking (skin-coloured rectangles that drop over the eyes).
    const lids = [];
    if (eyes) {
      for (const cx of [88, 112]) {
        const lid = el("rect", { x: String(cx - 6.5), y: "61", width: "13", height: "0", fill: "rgb(92, 54, 34)" });
        eyes.append(lid);
        lids.push(lid);
      }
    }
    return { svgNode, head, beard, neutralMouth, openMouth, cavity, clipShape, tongue, lids };
  }

  function startLoop(player) {
    let mouth = 0;
    let blinkAt = performance.now() + 1800 + Math.random() * 2400;
    let blinkStart = -1;
    const tick = (now) => {
      if (!player.svg.isConnected) { stop(player.container); return; }
      const { parts, state } = player;
      // 1. Mouth target from real voice level (or a gentle fallback flap if no level is available).
      let target = 0;
      if (state === "SPEAKING") {
        const raw = typeof levelSource === "function" ? Number(levelSource()) : NaN;
        if (Number.isFinite(raw)) target = Math.min(1, Math.max(0, (raw - 0.012) * 9));
        else target = 0.35 + 0.35 * Math.abs(Math.sin(now / 95)) * Math.abs(Math.sin(now / 173));
      }
      // Open fast, close a little slower – reads as natural speech.
      mouth += (target - mouth) * (target > mouth ? 0.55 : 0.28);
      if (mouth < 0.02) mouth = 0;
      const ry = 0.8 + mouth * 6.2;
      const rx = 6.4 + mouth * 1.4;
      const cy = 97.5 + ry * 0.85;
      for (const node of [parts.cavity, parts.clipShape]) {
        node.setAttribute("cy", cy.toFixed(2));
        node.setAttribute("ry", ry.toFixed(2));
        node.setAttribute("rx", rx.toFixed(2));
      }
      parts.tongue.setAttribute("cy", (cy + ry * 0.75).toFixed(2));
      parts.openMouth.style.opacity = mouth > 0.04 ? "1" : "0";
      if (parts.neutralMouth) parts.neutralMouth.style.opacity = mouth > 0.04 ? "0" : "1";
      // Jaw: lower beard drops a touch with the mouth.
      if (parts.beard) parts.beard.setAttribute("transform", `translate(0 ${(mouth * 2.4).toFixed(2)})`);

      // 2. Head motion: small bob while talking, slight tilt while listening, still otherwise.
      if (!reduceMotion) {
        let rotate = 0;
        let lift = 0;
        if (state === "SPEAKING") {
          rotate = Math.sin(now / 620) * 2.2;
          lift = -mouth * 1.4 + Math.sin(now / 410) * 0.5;
        } else if (state === "LISTENING") {
          rotate = -4 + Math.sin(now / 1400) * 1.2;
        } else if (state === "CONNECTING") {
          lift = Math.sin(now / 500) * 1.2;
        }
        player.svg.style.transform = `translateY(${lift.toFixed(2)}%) rotate(${rotate.toFixed(2)}deg)`;
      }

      // 3. Blink every few seconds.
      if (parts.lids.length) {
        if (blinkStart < 0 && now >= blinkAt) blinkStart = now;
        let lid = 0;
        if (blinkStart >= 0) {
          const t = (now - blinkStart) / 150;
          lid = t < 1 ? t : t < 2 ? 2 - t : 0;
          if (t >= 2) { blinkStart = -1; blinkAt = now + 2200 + Math.random() * 3200; }
        }
        for (const node of parts.lids) node.setAttribute("height", (lid * 14).toFixed(2));
      }
      player.frame = window.requestAnimationFrame(tick);
    };
    player.frame = window.requestAnimationFrame(tick);
  }

  function stop(container) {
    const player = players.get(container);
    if (!player) return;
    window.cancelAnimationFrame(player.frame);
    players.delete(container);
  }

  const pending = new Map();
  function mount(container) {
    if (!container) return Promise.resolve(null);
    const existing = players.get(container);
    if (existing && existing.svg.isConnected) return Promise.resolve(existing);
    if (!pending.has(container)) {
      pending.set(container, mountNow(container).finally(() => pending.delete(container)));
    }
    return pending.get(container);
  }

  async function mountNow(container) {
    // Cancel any Lottie load still in flight for this slot, then take it over.
    container.dataset.mascotToken = String(Number(container.dataset.mascotToken || 0) + 1);
    window.stopFoldBookMascot?.(container);
    try {
      const parts = buildHead(await loadSvg());
      container.replaceChildren(parts.svgNode);
      container.classList.add("eco-talker", "mascot-ready");
      const player = { container, svg: parts.svgNode, parts, state: "IDLE", frame: 0 };
      players.set(container, player);
      startLoop(player);
      return player;
    } catch (error) {
      console.warn("Dr. Eco talking head unavailable; using the standard mascot.", error);
      return null;
    }
  }

  function setState(container, state) {
    const player = players.get(container);
    if (player) {
      player.state = state;
      container.dataset.ecoState = String(state || "").toLowerCase();
    }
    return Boolean(player);
  }

  function unmount(container) {
    stop(container);
    if (container) {
      container.classList.remove("eco-talker");
      delete container.dataset.ecoState;
    }
  }

  window.FoldBookEcoTalker = {
    mount,
    setState,
    unmount,
    setLevelSource(fn) { levelSource = typeof fn === "function" ? fn : null; },
  };
})();
