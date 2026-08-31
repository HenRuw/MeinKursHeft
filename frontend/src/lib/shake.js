// Plays a one-shot CSS flash/shake animation (see global.css) on an element:
// the red "lock-shake" glow on a lock icon when someone tries to edit a locked
// grade, or e.g. "field-flash" on an input that was submitted empty. Removing
// and re-adding the class with a forced reflow in between restarts the
// animation on every attempt, even rapid repeats; the class is cleared again
// once the animation ends.
export function triggerShake(el, className = 'lock-shake') {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(className);
  const clear = () => {
    el.classList.remove(className);
    el.removeEventListener('animationend', clear);
  };
  el.addEventListener('animationend', clear);
}
