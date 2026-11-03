/**
 * FoldBook character helpers (core pack 1.0.1) for lottie-web 5.12+.
 * 1.0.1: still poses reset segments first, so reduced motion and still() land on the right frame after playback.
 * No dependencies. Pass in your own `lottie` instance so this works with any bundler or a <script> tag.
 *
 *   import lottie from 'lottie-web';
 *   import { createCharacter } from './foldbook-characters.js';
 *   const foldo = createCharacter(lottie, el, foldoData, { flameDays: 12 });
 *   foldo.play('correct');            // one-shot, then returns to idle
 *   foldo.play('loading');            // loops until another state is played
 */

/** Looping states. Every other state is a one-shot that returns to `idle` when it ends (or to the `then` option). */
const LOOP_STATES = new Set(['idle', 'listen', 'guide', 'explain', 'loading', 'offline']);

/** Foldo's six approved streak stages. Only the bookmark flame changes; the body never does. */
const FLAME_STAGES = {
  1: { scale: 74 }, 3: { scale: 88 }, 7: { scale: 100 },
  14: { scale: 106, glow: 1 }, 30: { scale: 112, glow: 1, stripe: 1 }, 100: { scale: 118, glow: 1, stripe: 1, spark: 1, gold: 1 },
};
function flameStageFor(days) {
  return [100, 30, 14, 7, 3, 1].find(s => days >= s) || 1;
}

function eachGroup(items, fn) {
  for (const it of items || []) if (it.ty === 'gr') { fn(it, it.it[it.it.length - 1]); eachGroup(it.it, fn); }
}
const setO = (tr, v) => { tr.o = { a: 0, k: v }; };

/**
 * Returns a configured copy of the animation data. lottie-web mutates the data it is given,
 * so always configure a fresh copy per instance.
 *   flameDays: Foldo only. Current streak length in days (sets the bookmark flame stage).
 *   cap:       Dr. Eco only. 'round' (preferred, pending cultural review) or 'none' (capless alternate).
 *   chartCard: Dr. Eco only. true shows the optional chart card during `explain`. Never use it in avatars.
 */
function configure(data, { flameDays, cap, chartCard } = {}) {
  const d = typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  const st = flameDays != null ? FLAME_STAGES[flameStageFor(flameDays)] : null;
  eachGroup(d.layers[0].shapes, (g, tr) => {
    if (st) {
      if (g.nm === 'flame-size') tr.s = { a: 0, k: [st.scale, st.scale] };
      if (g.nm === 'streak-glow') setO(tr, st.glow ? 100 : 0);
      if (g.nm === 'streak-stripe') setO(tr, st.stripe ? 100 : 0);
      if (g.nm === 'streak-spark') setO(tr, st.spark ? 100 : 0);
      if (g.nm === 'streak-gold') setO(tr, st.gold ? 100 : 0);
    }
    if (cap) {
      if (g.nm === 'cap-round') setO(tr, cap === 'none' ? 0 : 100);
      if (g.nm === 'capless') setO(tr, cap === 'none' ? 100 : 0);
    }
    if (chartCard != null && g.nm === 'chart-card-enable') setO(tr, chartCard ? 100 : 0);
  });
  return d;
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Creates a character player.
 *   options.renderer      'svg' (default; measured fastest here) or 'canvas'
 *   options.reducedMotion force still poses (otherwise follows the OS setting, live)
 *   options.pauseOffscreen pause when scrolled out of view (default true)
 *   options.initial       first state (default 'idle')
 *   plus any configure() option
 */
function createCharacter(lottie, container, data, options = {}) {
  const markers = Object.fromEntries(data.markers.map(m => [m.cm, [m.tm, m.tm + m.dr]]));
  const anim = lottie.loadAnimation({
    container, renderer: options.renderer || 'svg', loop: false, autoplay: false,
    animationData: configure(data, options),
    rendererSettings: { progressiveLoad: false, preserveAspectRatio: 'xMidYMax meet' },
  });
  let state = null, after = 'idle', onComplete = null, visible = true, destroyed = false;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => options.reducedMotion === true || (options.reducedMotion !== false && !!(mq && mq.matches));

  function play(next, { then = 'idle' } = {}) {
    if (destroyed || !markers[next]) return;
    state = next; after = then;
    if (onComplete) { anim.removeEventListener('complete', onComplete); onComplete = null; }
    if (reduced()) { gotoStill(next); return; }
    const loop = LOOP_STATES.has(next);
    anim.loop = loop;
    anim.playSegments(markers[next], true);
    if (!loop && then) {
      onComplete = () => { anim.removeEventListener('complete', onComplete); onComplete = null; if (state === next) play(after); };
      anim.addEventListener('complete', onComplete);
    }
    if (!visible) anim.pause();
  }
  // lottie-web counts goToAndStop frames from the last played segment, so reset segments before jumping to an absolute marker.
  function gotoStill(name) { anim.resetSegments(true); anim.goToAndStop('still-' + name, true); }
  /** Show a state's still pose without animating (static fallback, reduced motion, screenshots). */
  function still(name) { state = name; gotoStill(name); }

  let io = null;
  if (options.pauseOffscreen !== false && typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) anim.pause(); else if (!reduced() && state) anim.play();
    });
    io.observe(container);
  }
  const onMotionChange = () => state && play(state, { then: after });
  mq && mq.addEventListener && mq.addEventListener('change', onMotionChange);

  anim.addEventListener('DOMLoaded', () => play(options.initial || 'idle'));
  return {
    anim, play, still,
    get state() { return state; },
    destroy() { destroyed = true; io && io.disconnect(); mq && mq.removeEventListener && mq.removeEventListener('change', onMotionChange); anim.destroy(); },
  };
}

window.FoldBookCharacters = { LOOP_STATES, FLAME_STAGES, flameStageFor, configure, prefersReducedMotion, createCharacter };
