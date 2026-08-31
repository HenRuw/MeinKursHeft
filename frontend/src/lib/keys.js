import { useEffect, useRef } from 'react';

// Pure step logic for the arrow-key list walker below, kept separate so it's
// trivially unit-testable. Given the ordered ids, the currently marked id and
// the pressed key ('ArrowDown'/'ArrowUp'), returns the id that should be
// marked next: the first Down (or last Up) press when nothing is marked yet,
// otherwise one step in that direction, clamped at the ends.
export function stepSelection(orderedIds, selectedId, key) {
  if (!orderedIds.length) return selectedId;
  const idx = orderedIds.indexOf(selectedId);
  if (idx === -1) return key === 'ArrowDown' ? orderedIds[0] : orderedIds[orderedIds.length - 1];
  const next = key === 'ArrowDown' ? Math.min(idx + 1, orderedIds.length - 1) : Math.max(idx - 1, 0);
  return orderedIds[next];
}

// Wires the Up/Down arrow keys to walk a vertical list of students (or any
// ordered ids) by moving a marker: the first Down press lands on the first
// row, then each press moves the marker one row, clamped at the ends; Up walks
// back. Ignored while typing in a form field (input/textarea/select/
// contentEditable) so grade entry and comments aren't hijacked, and while a
// modifier is held. Reads its inputs through a ref so it can subscribe to the
// window just once. When a `containerRef` is given, the marked row is scrolled
// into view via its `data-arrow-row` attribute as it walks past a scroll edge.
export function useArrowStudentNav({ orderedIds, selectedId, setSelectedId, containerRef, enabled = true }) {
  const state = useRef();
  state.current = { orderedIds, selectedId, setSelectedId, enabled };

  useEffect(() => {
    const onKey = (e) => {
      const s = state.current;
      if (!s.enabled) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!s.orderedIds.length) return;
      e.preventDefault();
      s.setSelectedId(stepSelection(s.orderedIds, s.selectedId, e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (selectedId == null || !containerRef?.current) return;
    const el = containerRef.current.querySelector(`[data-arrow-row="${selectedId}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId, containerRef]);
}

// Enter confirms an input/textarea; Shift+Enter is left alone so it still
// inserts a line break in a textarea (free-text fields). Wrap a form's submit
// handler and hang the result on the field's onKeyDown. Fires only on a plain
// Enter with no Shift and no in-progress IME composition (so committing a
// candidate word with Enter doesn't also submit the form).
export function submitOnEnter(handler) {
  return (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    handler(e);
  };
}
