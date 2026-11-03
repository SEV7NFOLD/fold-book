// FoldBook UI pack helper 1.0 (from the handoff bundle, unmodified apart from removing `export`).
// Wrapped in its own scope: the character helper also declares flameStageFor at the top level.
(() => {
/**
 * FoldBook UI animation helpers (UI pack 1.0) for lottie-web 5.12+. No dependencies.
 *
 *   import lottie from 'lottie-web';
 *   import { createUIAnimation } from './foldbook-ui.js';
 *   const combo = createUIAnimation(lottie, el, comboData);
 *   combo.play('pip-1');                      // one-shot, holds its end state (1 pip filled)
 *   const bar = createUIAnimation(lottie, el2, progressData, { initial: null });
 *   bar.setProgress('question-fill', 0.4);    // progress-driven marker, animates smoothly to 40%
 */

/** Markers that loop until something else is played. */
const UI_LOOPS = new Set(['next-pulse', 'header', 'reminder-pulse', 'chat-typing', 'connecting', 'listening',
  'loading-soft', 'offline-waiting', 'pull-to-refresh-spin', 'install-guide', 'empty-path-idle', 'empty-course-idle']);
/** Markers whose frames map to progress 0–100% (drive them with setProgress, never autoplay). */
const UI_DRIVEN = new Set(['question-fill', 'module-fill', 'progress', 'pull-to-refresh-pull']);

const FLAME = { 1: [74], 3: [88], 7: [100], 14: [106, 'glow'], 30: [112, 'glow', 'ring'], 100: [118, 'glow', 'ring', 'gold', 'spark'] };
const flameStageFor = d => [100, 30, 14, 7, 3, 1].find(s => d >= s) || 1;

function eachGroup(items, fn) { for (const it of items || []) if (it.ty === 'gr') { fn(it, it.it[it.it.length - 1]); eachGroup(it.it, fn); } }

/**
 * streak-flame.json only: returns a copy fixed at a stage for the header or reminder flame.
 * (Milestone markers already carry their own stage, so don't use this for milestone celebrations.)
 */
function withFlameStage(data, days) {
  const d = typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  const [scale, ...extras] = FLAME[flameStageFor(days)];
  eachGroup(d.layers[0].shapes, (g, tr) => {
    if (g.nm === 'size') tr.s = { a: 0, k: [scale, scale] };
    if (['glow', 'ring', 'gold', 'spark'].includes(g.nm)) tr.o = { a: 0, k: extras.includes(g.nm) ? 100 : 0 };
  });
  return d;
}

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function createUIAnimation(lottie, container, data, options = {}) {
  const markers = Object.fromEntries(data.markers.map(m => [m.cm, [m.tm, m.tm + m.dr]]));
  const anim = lottie.loadAnimation({
    container, renderer: options.renderer || 'svg', loop: false, autoplay: false,
    animationData: typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data)),
    rendererSettings: { progressiveLoad: false },
  });
  // lottie-web counts goToAndStop frames from the last played segment, so reset segments before absolute jumps.
  const gotoAbs = f => { anim.resetSegments(true); anim.goToAndStop(f, true); };
  const reduced = () => options.reducedMotion === true || (options.reducedMotion !== false && !!(mq && mq.matches));
  let current = null, visible = true, done = null;

  /**
   * Play a marker. One-shots hold their last frame (the end state) unless `then` names another marker.
   * In reduced motion, jumps straight to the still pose (or the end state for markers without one).
   */
  function play(name, { then = null } = {}) {
    if (!markers[name]) return;
    current = name;
    if (done) { anim.removeEventListener('complete', done); done = null; }
    if (reduced()) { gotoAbs(markers['still-' + name] ? markers['still-' + name][0] : markers[name][1]); return; }
    const loop = UI_LOOPS.has(name);
    anim.loop = loop;
    // segment ends are exclusive in lottie-web: one-shots play through their last frame so the held end state is exact
    anim.playSegments(loop ? markers[name] : [markers[name][0], markers[name][1] + 1], true);
    if (!loop && then) {
      done = () => { anim.removeEventListener('complete', done); done = null; if (current === name) play(then); };
      anim.addEventListener('complete', done);
    }
    if (!visible) anim.pause();
  }

  /** Progress-driven markers: p from 0 to 1. Animates from the current frame unless reduced motion or { animate: false }. */
  let lastFrame = null;
  function setProgress(name, p, { animate = true } = {}) {
    const [a, b] = markers[name]; const target = Math.round(a + Math.max(0, Math.min(1, p)) * (b - a));
    current = name;
    if (!animate || reduced() || lastFrame == null || lastFrame < a || lastFrame > b || lastFrame === target) gotoAbs(target);
    else { anim.loop = false; anim.playSegments(target > lastFrame ? [lastFrame, target + 1] : [lastFrame, target], true); }
    lastFrame = target;
  }

  let io = null;
  if (options.pauseOffscreen !== false && typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) anim.pause(); else if (current && !reduced() && !UI_DRIVEN.has(current)) anim.play(); });
    io.observe(container);
  }
  anim.addEventListener('DOMLoaded', () => { if (options.initial) play(options.initial); });
  return { anim, play, setProgress, still: n => { current = n; gotoAbs(markers['still-' + n][0]); }, destroy() { io && io.disconnect(); anim.destroy(); } };
}

window.FoldBookUI = { UI_LOOPS, UI_DRIVEN, flameStageFor, withFlameStage, createUIAnimation };
})();
