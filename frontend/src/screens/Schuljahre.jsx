import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

const card = { background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11 };
const btn = { padding: '7px 13px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, border: `1px solid ${colors.borderStrong}`, background: '#fff', color: colors.mutedStrong };
const primaryBtn = { ...btn, background: colors.teal, color: '#fff', border: 'none' };
const input = { padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 };

// Suggests the next year's class name by bumping the first number: 10b -> 11b.
// Purely a suggestion; every field stays editable in the wizard.
const advanceClassName = (name) => String(name).replace(/\d+/, (n) => String(Number(n) + 1));

// A school-year label bumps *every* number so "2026/27" -> "2027/28" (and a
// single "2026" -> "2027"). Digit length is preserved so "27" -> "28".
const advanceYearLabel = (label) =>
  String(label).replace(/\d+/g, (n) => String(Number(n) + 1).padStart(n.length, '0'));

export default function Schuljahre({ years, currentYearId, classes, onRefreshYears, onRefreshKlassen, onSelectYear, openWizardSignal, onWizardConsumed }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteText, setDeleteText] = useState('');
  const [error, setError] = useState('');

  // rollover wizard
  const [wizard, setWizard] = useState(null); // { label, copyQuarters, classRows, courseRows, busy }

  const sortedYears = [...years].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const currentYear = years.find((y) => y.id === currentYearId) || null;

  const doRename = async (id) => {
    if (renameText.trim()) await api.updateYear(id, { label: renameText.trim() });
    setRenamingId(null);
    onRefreshYears();
  };

  const toggleArchive = async (y) => {
    await api.updateYear(y.id, { archived: y.archived ? 0 : 1 });
    onRefreshYears();
  };

  const doDelete = async (y) => {
    setError('');
    try {
      await api.deleteYear(y.id, deleteText);
      setDeletingId(null);
      setDeleteText('');
      await onRefreshYears();
    } catch (e) {
      setError(e.message || 'Löschen fehlgeschlagen.');
    }
  };

  const renameClass = async (id, name) => {
    if (name.trim()) await api.renameClass(id, { name: name.trim() });
    onRefreshKlassen();
  };

  const deleteClass = async (id) => {
    await api.deleteClass(id);
    onRefreshKlassen();
  };

  // ---- rollover wizard ----
  const openWizard = async () => {
    const courses = await api.listCourses(currentYearId);
    setWizard({
      label: currentYear ? advanceYearLabel(currentYear.label) : '',
      copyQuarters: true,
      classRows: sortedClasses.map((c) => ({ fromClassId: c.id, from: c.name, name: advanceClassName(c.name), take: true })),
      // Courses carry over under an editable name too; unlike classes there is
      // no number to bump, so the new name simply defaults to the current one.
      courseRows: courses.map((c) => ({ courseId: c.id, from: c.name, name: c.name, take: true })),
      busy: false,
    });
  };

  // The year dropdown's "Neues Jahr anlegen" sets this; open the wizard once
  // and tell the parent to clear it so a later remount won't reopen it.
  useEffect(() => {
    if (openWizardSignal) {
      openWizard();
      onWizardConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWizardSignal]);

  const submitWizard = async () => {
    setWizard((w) => ({ ...w, busy: true }));
    try {
      const year = await api.advanceYear({
        toLabel: wizard.label.trim(),
        fromYearId: currentYearId,
        copyQuarters: wizard.copyQuarters,
        classes: wizard.classRows.filter((r) => r.take && r.name.trim()).map((r) => ({ fromClassId: r.fromClassId, newName: r.name.trim() })),
        courses: wizard.courseRows.filter((r) => r.take && r.name.trim()).map((r) => ({ courseId: r.courseId, newName: r.name.trim() })),
      });
      setWizard(null);
      await onRefreshYears();
      onSelectYear(year.id);
    } catch (e) {
      setError(e.message || 'Anlegen fehlgeschlagen.');
      setWizard((w) => ({ ...w, busy: false }));
    }
  };

  const setWizardClass = (i, patch) => setWizard((w) => ({ ...w, classRows: w.classRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const setWizardCourse = (i, patch) => setWizard((w) => ({ ...w, courseRows: w.courseRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <section style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>Schuljahre</div>
          <span style={{ flex: 1 }} />
          <button onClick={openWizard} style={primaryBtn}>+ Neues Schuljahr</button>
        </div>

        {error && <div style={{ fontSize: 12.5, color: colors.red, marginBottom: 12 }}>{error}</div>}

        {/* --- year list --- */}
        <div style={{ ...card, marginBottom: 24 }}>
          {sortedYears.map((y, i) => (
            <div key={y.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${colors.divider}` : undefined, flexWrap: 'wrap' }}>
              {renamingId === y.id ? (
                <>
                  <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doRename(y.id)} style={{ ...input, width: 140 }} />
                  <button onClick={() => doRename(y.id)} style={primaryBtn}>OK</button>
                  <button onClick={() => setRenamingId(null)} style={btn}>Abbrechen</button>
                </>
              ) : (
                <>
                  <button onClick={() => onSelectYear(y.id)} style={{ font: `600 14px ${fonts.mono}`, color: y.id === currentYearId ? colors.teal : colors.ink }}>
                    {y.label}
                  </button>
                  {y.id === currentYearId && <span style={{ fontSize: 10.5, color: colors.teal, border: `1px solid ${colors.teal}`, borderRadius: 20, padding: '1px 7px' }}>aktiv</span>}
                  {y.archived ? <span style={{ fontSize: 10.5, color: '#8a6417', background: '#fbf1dc', borderRadius: 20, padding: '1px 7px' }}>Archiv</span> : null}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => { setRenamingId(y.id); setRenameText(y.label); }} style={{ fontSize: 12, color: colors.teal }}>Umbenennen</button>
                  <button onClick={() => toggleArchive(y)} style={{ fontSize: 12, color: colors.mutedStrong }}>{y.archived ? 'Reaktivieren' : 'Archivieren'}</button>
                  <button onClick={() => { setDeletingId(y.id); setDeleteText(''); setError(''); }} style={{ fontSize: 12, color: colors.red }}>Löschen</button>
                </>
              )}
              {deletingId === y.id && (
                <div style={{ flexBasis: '100%', marginTop: 8, padding: 12, background: colors.redBg, border: `1px solid ${colors.redBorder}`, borderRadius: 9 }}>
                  <div style={{ fontSize: 12.5, color: colors.red, marginBottom: 8 }}>
                    Löscht <b>{y.label}</b> unwiderruflich mit allen Kursen, Noten, Klassen und Zuordnungen. Zur Bestätigung <b>{y.label}</b> eingeben:
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder={y.label} style={{ ...input, width: 140 }} />
                    <button onClick={() => doDelete(y)} disabled={deleteText !== y.label} style={{ ...btn, background: deleteText === y.label ? colors.red : '#fff', color: deleteText === y.label ? '#fff' : colors.faint, border: 'none' }}>
                      Endgültig löschen
                    </button>
                    <button onClick={() => setDeletingId(null)} style={btn}>Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* --- classes of the active year --- */}
        <div style={{ font: `500 17px/1.1 ${fonts.serif}`, marginBottom: 4 }}>Klassen {currentYear ? `· ${currentYear.label}` : ''}</div>
        <div style={{ fontSize: 12, color: colors.mutedStrong, marginBottom: 12 }}>
          Klassen entstehen normalerweise automatisch beim Anlegen von Schüler:innen. Hier kannst du sie umbenennen oder löschen (Mitglieder bleiben als „Ohne Klasse" im Jahr).
        </div>
        <div style={card}>
          {sortedClasses.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? `1px solid ${colors.divider}` : undefined }}>
              <span style={{ fontWeight: 600, width: 90 }}>{c.name}</span>
              <span style={{ fontSize: 11.5, color: colors.muted }}>{c.member_count} Schüler:in{c.member_count === 1 ? '' : 'nen'}</span>
              <span style={{ flex: 1 }} />
              {!currentYear?.archived && (
                <>
                  <button onClick={() => { const n = prompt(`Klasse „${c.name}" umbenennen in:`, c.name); if (n) renameClass(c.id, n); }} style={{ fontSize: 12, color: colors.teal }}>Umbenennen</button>
                  <button onClick={() => deleteClass(c.id)} style={{ fontSize: 12, color: colors.red }}>Löschen</button>
                </>
              )}
            </div>
          ))}
          {!sortedClasses.length && <div style={{ padding: '10px 14px', fontSize: 12.5, color: colors.mutedStrong }}>Noch keine Klassen in diesem Jahr.</div>}
        </div>
      </section>

      {/* --- rollover wizard --- */}
      {wizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflow: 'auto' }} onClick={() => !wizard.busy && setWizard(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(680px, 100%)', marginTop: 20 }}>
            <div style={{ font: `500 20px/1.1 ${fonts.serif}`, marginBottom: 4 }}>Neues Schuljahr anlegen</div>
            <div style={{ fontSize: 12.5, color: colors.mutedStrong, marginBottom: 16 }}>
              Aus {currentYear?.label}. Klassen steigen mit denselben Schüler:innen auf; Kurse werden mit Namen und Teilnehmerliste kopiert (Gewichtungen starten neu).
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 12.5, width: 120, color: colors.mutedStrong }}>Bezeichnung</span>
              <input value={wizard.label} onChange={(e) => setWizard((w) => ({ ...w, label: e.target.value }))} placeholder="z. B. 2027/28" style={{ ...input, width: 160 }} />
            </label>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Klassen versetzen</div>
                {wizard.classRows.length ? wizard.classRows.map((r, i) => (
                  <div key={r.fromClassId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <input type="checkbox" checked={r.take} onChange={(e) => setWizardClass(i, { take: e.target.checked })} />
                    <span style={{ fontSize: 11.5, color: colors.muted, width: 42 }}>{r.from}</span>
                    <span aria-hidden style={{ color: colors.faint }}>→</span>
                    <input value={r.name} disabled={!r.take} onChange={(e) => setWizardClass(i, { name: e.target.value })} style={{ ...input, width: 90, opacity: r.take ? 1 : 0.5 }} />
                  </div>
                )) : <div style={{ fontSize: 12, color: colors.mutedStrong }}>Keine Klassen.</div>}
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Kurse übernehmen</div>
                {wizard.courseRows.length ? wizard.courseRows.map((r, i) => (
                  <div key={r.courseId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <input type="checkbox" checked={r.take} onChange={(e) => setWizardCourse(i, { take: e.target.checked })} />
                    <span style={{ fontSize: 11.5, color: colors.muted, width: 42, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.from}</span>
                    <span aria-hidden style={{ color: colors.faint }}>→</span>
                    <input value={r.name} disabled={!r.take} onChange={(e) => setWizardCourse(i, { name: e.target.value })} style={{ ...input, width: 90, opacity: r.take ? 1 : 0.5 }} />
                  </div>
                )) : <div style={{ fontSize: 12, color: colors.mutedStrong }}>Keine Kurse.</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <button onClick={submitWizard} disabled={wizard.busy || !wizard.label.trim()} style={{ ...primaryBtn, opacity: wizard.busy || !wizard.label.trim() ? 0.6 : 1 }}>
                {wizard.busy ? 'Lege an …' : 'Schuljahr anlegen'}
              </button>
              <button onClick={() => setWizard(null)} disabled={wizard.busy} style={btn}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
