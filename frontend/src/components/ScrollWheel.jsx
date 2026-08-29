import { useEffect, useRef, useState } from 'react';
import { colors, fonts } from '../theme.js';
import Popover from './Popover.jsx';

const ITEM_HEIGHT = 32;
const PAD = 32;
const PANEL_WIDTH = 64;
// Vertical offset, within the panel, of the selection band's center — the
// row that shows the currently active value.
const BAND_CENTER = PAD + ITEM_HEIGHT / 2;
// How long a programmatic (click-to-select) smooth-scroll is allowed to run
// before the scroll handler resumes treating scroll events as user input.
const PROGRAMMATIC_SCROLL_MS = 380;
// How long to wait after the wheel stops moving before actually committing
// the value upstream (see the perf note on `onScroll` below).
const COMMIT_DEBOUNCE_MS = 200;

// Scroll-snap wheel picker matching the Notenbuch design doc's "Verspätung"
// picker: a pill button that opens a small vertically-scrollable dial. Each
// row's opacity/scale is purely a function of its distance from the selected
// value — that distance-based fade is what reads as a "wheel" even though
// it's just a plain scrolling list with a fixed row height.
export default function ScrollWheel({ value, onChange, min = 1, max = 30, suffix = ' min' }) {
  const btnRef = useRef(null);
  const wheelElRef = useRef(null);
  const suppressScrollRef = useRef(false);
  const suppressTimerRef = useRef(null);
  const commitTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  // The value shown/scrolled-to locally. Decoupled from `value` (the actual
  // committed prop) so that scrolling past several numbers only re-renders
  // this small popup, instead of firing `onChange` — and therefore a network
  // request + full parent refetch — on every single row crossed, which is
  // what made the wheel feel laggy.
  const [localValue, setLocalValue] = useState(value);
  const values = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => () => clearTimeout(commitTimerRef.current), []);

  const commit = (v) => {
    clearTimeout(commitTimerRef.current);
    if (v !== value) onChange(v);
  };

  const closeWheel = () => {
    // Flush immediately so a quick scroll-then-dismiss never loses the
    // in-flight debounced value.
    commit(localValue);
    setOpen(false);
  };

  // A ref callback (not a useLayoutEffect) is required here: the wheel lives
  // inside a Popover, which itself only mounts its children on a *second*
  // render pass (once it has measured where to position itself). A layout
  // effect keyed on `open` fires too early — before that child even exists —
  // and never gets a second chance to run since its deps don't change again.
  // A ref callback, by contrast, fires exactly when the node is attached,
  // however many render passes that took. This mirrors the original design
  // doc's own `wheelRef` callback for this exact picker.
  const wheelRefCallback = (el) => {
    wheelElRef.current = el;
    if (el) el.scrollTop = (localValue - min) * ITEM_HEIGHT;
  };

  const onScroll = (e) => {
    if (suppressScrollRef.current) return;
    const idx = Math.round(e.target.scrollTop / ITEM_HEIGHT);
    const v = Math.max(min, Math.min(max, idx + min));
    setLocalValue((cur) => (cur === v ? cur : v));
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => commit(v), COMMIT_DEBOUNCE_MS);
  };

  // Clicking a visible-but-not-selected number scrolls it into the center
  // and selects it (committed right away — a click is a single deliberate
  // action, unlike a continuous scroll gesture, so no debounce needed).
  // Clicking the number that's already selected closes the picker instead
  // (it's already "chosen" — a second tap confirms it).
  const selectValue = (v) => {
    if (v === localValue) {
      closeWheel();
      return;
    }
    setLocalValue(v);
    commit(v);
    const el = wheelElRef.current;
    if (el) {
      suppressScrollRef.current = true;
      el.scrollTo({ top: (v - min) * ITEM_HEIGHT, behavior: 'smooth' });
      clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = setTimeout(() => {
        suppressScrollRef.current = false;
      }, PROGRAMMATIC_SCROLL_MS);
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          flex: 'none',
          padding: '5px 10px',
          borderRadius: 7,
          font: `600 11.5px ${fonts.mono}`,
          letterSpacing: '.01em',
          border: `1px solid ${open ? colors.gold : colors.borderStrong}`,
          background: open ? colors.goldBg : '#fff',
          color: colors.gold,
        }}
      >
        {value}
        {suffix}
      </button>
      <Popover
        open={open}
        anchorRef={btnRef}
        onClose={closeWheel}
        width={PANEL_WIDTH}
        anchorPoint={(anchor) => ({
          // Center the selection band (where the current value sits) exactly
          // on the trigger button's own position, so opening the wheel never
          // moves the number on screen — the other values just reveal
          // themselves above and below it.
          top: anchor.top + anchor.height / 2 - BAND_CENTER,
          left: anchor.left + anchor.width / 2 - PANEL_WIDTH / 2,
        })}
      >
        <div
          onMouseLeave={closeWheel}
          style={{
            position: 'relative',
            width: PANEL_WIDTH,
            height: 96,
            background: 'linear-gradient(#fffefb, #fdf9ef)',
            border: '1px solid rgba(216,160,42,.38)',
            borderRadius: 16,
            boxShadow: '0 14px 30px rgba(90,68,10,.16), 0 2px 8px rgba(90,68,10,.10)',
            overflow: 'hidden',
          }}
        >
          {/* selection window: a slim rule above and below, not a filled block — reads calmer/more premium */}
          <span style={{ position: 'absolute', top: PAD, left: 10, right: 10, height: 1, background: 'rgba(180,130,20,.32)', pointerEvents: 'none', zIndex: 2 }} />
          <span style={{ position: 'absolute', top: PAD + ITEM_HEIGHT, left: 10, right: 10, height: 1, background: 'rgba(180,130,20,.32)', pointerEvents: 'none', zIndex: 2 }} />
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, background: 'linear-gradient(#fffefb, rgba(255,254,251,0))', pointerEvents: 'none', zIndex: 3 }} />
          <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 34, background: 'linear-gradient(rgba(253,249,239,0), #fdf9ef)', pointerEvents: 'none', zIndex: 3 }} />
          <div
            ref={wheelRefCallback}
            className="wheel"
            onScroll={onScroll}
            style={{ position: 'relative', height: 96, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
          >
            <div style={{ height: PAD }} />
            {values.map((v) => {
              const on = v === localValue;
              const dist = Math.abs(v - localValue);
              const opacity = on ? 1 : Math.max(0.2, 1 - dist * 0.4);
              const scale = on ? 1 : Math.max(0.8, 1 - dist * 0.1);
              return (
                <button
                  key={v}
                  className="wheel-row"
                  onClick={() => selectValue(v)}
                  title={on ? 'Schließen' : `${v}${suffix} auswählen`}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: ITEM_HEIGHT,
                    scrollSnapAlign: 'center',
                    transition: 'opacity 140ms ease, transform 140ms ease',
                    opacity,
                    transform: `scale(${scale})`,
                    font: `${on ? 700 : 500} ${on ? 14 : 12}px ${fonts.mono}`,
                    letterSpacing: on ? '.015em' : 0,
                    color: on ? colors.ink : '#8a8378',
                  }}
                >
                  {on ? `${v}${suffix}` : v}
                </button>
              );
            })}
            <div style={{ height: PAD }} />
          </div>
        </div>
      </Popover>
    </span>
  );
}
