// Cycle de vie : AbortController, timers, RAF et pause d'onglet.
export function createLifecycle() {
  const controller = new AbortController();
  const timers = new Set();
  let rafId = 0;
  let disposed = false;

  function on(target, type, handler, options = {}) {
    if (disposed || !target) return () => {};
    target.addEventListener(type, handler, { ...options, signal: controller.signal });
    return () => target.removeEventListener(type, handler, options);
  }

  function timer(fn, ms) {
    if (disposed) return 0;
    const id = window.setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  }

  function raf(fn) {
    if (disposed) return 0;
    rafId = requestAnimationFrame(fn);
    return rafId;
  }

  function cancelRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    clearTimers();
    cancelRaf();
  }

  return { signal: controller.signal, on, timer, raf, cancelRaf, clearTimers, dispose, get disposed() { return disposed; } };
}
