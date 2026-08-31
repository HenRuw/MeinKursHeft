// Plays the red "lock-shake" flash (see global.css) on a lock icon element
// when someone tries to edit a locked grade. Removing and re-adding the class
// with a forced reflow in between restarts the CSS animation on every attempt,
// even rapid repeats; the class is cleared again once the animation ends.
export function triggerShake(el) {
  if (!el) return;
  el.classList.remove('lock-shake');
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add('lock-shake');
  const clear = () => {
    el.classList.remove('lock-shake');
    el.removeEventListener('animationend', clear);
  };
  el.addEventListener('animationend', clear);
}
