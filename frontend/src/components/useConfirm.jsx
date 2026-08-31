import { useCallback, useRef, useState } from 'react';
import { colors, fonts } from '../theme.js';

// A small promise-based confirmation dialog for irreversible, destructive
// actions (deleting a written work, a Mitarbeit lesson, restoring a backup …).
// Usage:
//
//   const { confirm, confirmDialog } = useConfirm();
//   const onDelete = async () => {
//     if (!(await confirm({ title: '…', message: '…' }))) return;
//     await api.delete…();
//   };
//   return (<>{confirmDialog} …</>);
//
// `confirm` resolves to true when the user presses the confirm button, false
// when they cancel, click the backdrop or press Escape. Render `confirmDialog`
// once anywhere in the screen's tree.
export function useConfirm() {
  const [state, setState] = useState(null); // { title, message, confirmLabel }
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    setState({ confirmLabel: 'Löschen', ...opts });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result) => {
    setState(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(result);
  }, []);

  const confirmDialog = state ? (
    <div
      onClick={() => settle(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') settle(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 18px 48px rgba(0,0,0,.28)',
          padding: 22,
          maxWidth: 380,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {state.title && <div style={{ font: `500 17px ${fonts.serif}`, color: colors.ink }}>{state.title}</div>}
        <div style={{ fontSize: 13, lineHeight: 1.5, color: colors.mutedStrong }}>{state.message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={() => settle(false)}
            style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, background: '#fff', color: colors.mutedStrong, fontSize: 12.5, fontWeight: 500 }}
          >
            Abbrechen
          </button>
          <button
            onClick={() => settle(true)}
            style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.redBorder}`, background: colors.redBg, color: colors.red, fontSize: 12.5, fontWeight: 600 }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmDialog };
}
