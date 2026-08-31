import { useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { useConfirm } from '../components/useConfirm.jsx';

// Verwaltung › Backup: download a full JSON snapshot of the whole database,
// or restore one. A restore replaces *everything*, so it asks for an explicit
// confirmation and then reloads the page to pick up the fresh state cleanly.
export default function Backup() {
  const { confirm, confirmDialog } = useConfirm();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { data, name } awaiting confirm

  const createBackup = async () => {
    setError('');
    setStatus('');
    try {
      const data = await api.getBackup();
      // Pretty-printed so the file stays legible in any text/JSON viewer.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scorespace-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Backup heruntergeladen.');
    } catch {
      setError('Backup konnte nicht erstellt werden.');
    }
  };

  // A restore overwrites everything irreversibly, so confirm intent before we
  // even open the file picker (there's a second, file-specific confirm after
  // a valid backup is chosen).
  const chooseFile = async () => {
    const ok = await confirm({
      title: 'Backup wiederherstellen?',
      message:
        'Beim Wiederherstellen wird der gesamte aktuelle Datenbestand unwiderruflich durch den Inhalt der Backupdatei ersetzt. Dieser Schritt kann nicht rückgängig gemacht werden. Fortfahren und eine Backupdatei auswählen?',
      confirmLabel: 'Datei auswählen',
    });
    if (!ok) return;
    fileRef.current?.click();
  };

  const onFile = async (e) => {
    setError('');
    setStatus('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'scorespace' || !data.tables) {
        setError('Keine gültige ScoreSpace-Backupdatei.');
        return;
      }
      setPending({ data, name: file.name });
    } catch {
      setError('Datei konnte nicht gelesen werden.');
    }
  };

  const confirmRestore = async () => {
    setBusy(true);
    setError('');
    try {
      await api.restoreBackup(pending.data);
      setStatus('Wiederhergestellt – die Seite wird neu geladen …');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setError(err.message || 'Wiederherstellung fehlgeschlagen.');
      setBusy(false);
    }
  };

  const card = { border: `1px solid ${colors.borderCard}`, borderRadius: 12, background: colors.cardBg, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 };
  const primaryBtn = { alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 8, background: colors.teal, color: '#fff', fontSize: 13, fontWeight: 500 };
  const outlineBtn = { alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, fontSize: 13, fontWeight: 500, color: colors.mutedStrong };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {confirmDialog}
      <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>Backup</div>

      <div style={card}>
        <div style={{ font: `500 15px ${fonts.serif}` }}>Backup erstellen</div>
        <p style={{ fontSize: 12.5, color: colors.mutedStrong, lineHeight: 1.5, margin: 0 }}>
          Lädt den gesamten Datenbestand als lesbare JSON-Datei herunter. Damit lässt sich der Stand später
          vollständig wiederherstellen.
        </p>
        <button onClick={createBackup} style={primaryBtn}>
          Backup herunterladen
        </button>
      </div>

      <div style={card}>
        <div style={{ font: `500 15px ${fonts.serif}` }}>Backup wiederherstellen</div>
        <p style={{ fontSize: 12.5, color: colors.mutedStrong, lineHeight: 1.5, margin: 0 }}>
          Ersetzt den <strong>gesamten</strong> aktuellen Datenbestand durch den Inhalt einer Backupdatei. Dieser
          Schritt kann nicht rückgängig gemacht werden.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
        {!pending ? (
          <button onClick={chooseFile} style={outlineBtn}>
            Backupdatei auswählen …
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: colors.red }}>
              „{pending.name}“ wiederherstellen? Der aktuelle Stand geht dabei verloren.
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmRestore} disabled={busy} style={{ ...primaryBtn, background: busy ? colors.divider : colors.red }}>
                {busy ? 'Wird wiederhergestellt …' : 'Ja, wiederherstellen'}
              </button>
              <button onClick={() => setPending(null)} disabled={busy} style={outlineBtn}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>

      {status && <span style={{ fontSize: 12.5, color: colors.teal }}>{status}</span>}
      {error && <span style={{ fontSize: 12.5, color: colors.red }}>{error}</span>}
    </div>
  );
}
