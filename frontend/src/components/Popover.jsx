import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_MARGIN = 8;

// Every open popover's panel DOM node, shared across all Popover instances.
// A Popover can be nested inside another one in the React tree (e.g. the
// emoji picker inside the "new remark" menu), but each portals independently
// straight to document.body, so their DOM subtrees are siblings, not
// ancestor/descendant. Without this registry, clicking inside a *nested*
// popover looks like an "outside click" to any *ancestor* popover's own
// listener (its panelRef doesn't contain the nested popover's DOM node),
// incorrectly closing it too.
const openPanels = new Set();

// Renders its children into document.body, positioned relative to
// `anchorRef`, so the popover can never be clipped by a scrolling/overflow
// ancestor (a plain position:absolute child gets clipped by any ancestor
// with overflow != visible, including overflow-x:auto — which per the CSS
// spec forces overflow-y to auto too, so even "horizontal-only" scroll rows
// clip vertically-extending popovers).
export default function Popover({ open, anchorRef, onClose, align = 'left', width, anchorPoint, children }) {
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);

  // Computes where the panel should sit. On the first call (before the panel
  // has ever rendered) panelRef.current is null, so this returns a best
  // guess below the anchor; a second layout-effect pass below re-measures
  // the panel's real size and corrects it (e.g. flips above the anchor, or
  // clamps sideways) so it never renders off-screen.
  const computePos = () => {
    if (!anchorRef.current) return null;
    const anchor = anchorRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const panelWidth = width ?? panelRef.current?.offsetWidth ?? anchor.width;

    let top;
    let left;
    if (anchorPoint) {
      // Caller supplies an exact point (e.g. "center this panel's selected
      // row on the trigger's own position, so nothing visually jumps when it
      // opens"), still clamped into the viewport below as a safety net.
      ({ top, left } = anchorPoint(anchor, { width: panelWidth, height: panelHeight }));
    } else {
      top = anchor.bottom + 6;
      if (panelHeight && top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
        const above = anchor.top - 6 - panelHeight;
        top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - panelHeight);
      }
      left = align === 'right' ? anchor.right - panelWidth : anchor.left;
    }

    top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, window.innerHeight - panelHeight - VIEWPORT_MARGIN));
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), Math.max(VIEWPORT_MARGIN, window.innerWidth - panelWidth - VIEWPORT_MARGIN));

    return { top, left };
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => setPos(computePos());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorRef, align, width, anchorPoint]);

  // Re-measure once the panel has actually mounted (real height/width known)
  // and correct the guess from the effect above if it would overflow.
  useLayoutEffect(() => {
    if (!open || !pos || !panelRef.current) return;
    const corrected = computePos();
    if (corrected && (corrected.top !== pos.top || corrected.left !== pos.left)) {
      setPos(corrected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos]);

  // Register this popover's panel while it's open/mounted, so sibling
  // Popover instances (including ones nested inside this one in React terms)
  // can recognize a click landing inside it as "not outside".
  useLayoutEffect(() => {
    if (!open || !pos || !panelRef.current) return undefined;
    const el = panelRef.current;
    openPanels.add(el);
    return () => openPanels.delete(el);
  }, [open, pos]);

  useLayoutEffect(() => {
    if (!open || !onClose) return undefined;
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      for (const panel of openPanels) {
        if (panel !== panelRef.current && panel.contains(e.target)) return;
      }
      onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width, maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`, overflow: 'auto', zIndex: 1000 }}>
      {children}
    </div>,
    document.body
  );
}
