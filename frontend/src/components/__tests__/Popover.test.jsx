import { useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Popover from '../Popover.jsx';

function Harness({ open, onClose, onInsideClick }) {
  const anchorRef = useRef(null);
  return (
    <div>
      <button ref={anchorRef}>Anchor</button>
      <button>Outside button</button>
      <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={100}>
        <button onClick={onInsideClick}>Inside action</button>
      </Popover>
    </div>
  );
}

function AnchorPointHarness({ anchorPoint }) {
  const anchorRef = useRef(null);
  return (
    <div>
      <button ref={anchorRef}>Anchor</button>
      <Popover open anchorRef={anchorRef} onClose={() => {}} width={50} anchorPoint={anchorPoint}>
        <div data-testid="panel-content">Content</div>
      </Popover>
    </div>
  );
}

describe('Popover - anchorPoint override', () => {
  test('positions the panel exactly where anchorPoint says, instead of below the anchor (regression: the value in ScrollWheel must not jump on open)', () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
      top: 100, left: 200, bottom: 130, right: 250, width: 50, height: 30, x: 200, y: 100, toJSON() {},
    });

    try {
      const anchorPoint = (anchor) => ({ top: anchor.top + 5, left: anchor.left + 7 });
      render(<AnchorPointHarness anchorPoint={anchorPoint} />);

      const panel = screen.getByTestId('panel-content').parentElement;
      expect(panel).toHaveStyle({ top: '105px', left: '207px' });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });
});

describe('Popover', () => {
  test('renders nothing when closed', () => {
    render(<Harness open={false} onClose={() => {}} onInsideClick={() => {}} />);
    expect(screen.queryByText('Inside action')).not.toBeInTheDocument();
  });

  test('renders its content into document.body (portal), not inside the anchor tree', () => {
    render(<Harness open onClose={() => {}} onInsideClick={() => {}} />);
    const content = screen.getByText('Inside action');
    // the portal target is document.body directly, so the content's parent
    // chain should NOT include the harness's own wrapping <div>
    expect(document.body.contains(content)).toBe(true);
  });

  // Regression test for the real bug: clicking a button inside the popover
  // must fire that button's own onClick, not get swallowed by the
  // outside-click-to-close handler (which happens on the mousedown that
  // precedes the click).
  test('clicking a button inside the popover fires its own handler and does not close the popover', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onInsideClick = vi.fn();
    render(<Harness open onClose={onClose} onInsideClick={onInsideClick} />);

    await user.click(screen.getByText('Inside action'));

    expect(onInsideClick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('clicking outside the popover and the anchor calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} onInsideClick={() => {}} />);

    await user.click(screen.getByText('Outside button'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the anchor itself does not call onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} onInsideClick={() => {}} />);

    await user.click(screen.getByText('Anchor'));

    expect(onClose).not.toHaveBeenCalled();
  });
});

// Regression test for a real bug: a Popover nested inside another Popover
// (e.g. an emoji picker inside a "new remark" menu) portals independently to
// document.body, so a click inside the nested one used to look like an
// "outside click" to the parent popover's own listener and closed it too.
function NestedHarness({ onOuterClose, onInnerClose, onInnerPick }) {
  const outerAnchorRef = useRef(null);
  const innerAnchorRef = useRef(null);
  return (
    <div>
      <button ref={outerAnchorRef}>Outer anchor</button>
      <Popover open anchorRef={outerAnchorRef} onClose={onOuterClose} width={200}>
        <div>
          <span>Outer content</span>
          <button ref={innerAnchorRef}>Inner anchor</button>
          <Popover open anchorRef={innerAnchorRef} onClose={onInnerClose} width={100}>
            <button onClick={onInnerPick}>Pick emoji</button>
          </Popover>
        </div>
      </Popover>
    </div>
  );
}

describe('Popover - nested popovers', () => {
  test('clicking inside a nested popover does not close the outer popover', async () => {
    const user = userEvent.setup();
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    const onInnerPick = vi.fn();
    render(<NestedHarness onOuterClose={onOuterClose} onInnerClose={onInnerClose} onInnerPick={onInnerPick} />);

    await user.click(screen.getByText('Pick emoji'));

    expect(onInnerPick).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(onInnerClose).not.toHaveBeenCalled();
  });
});
