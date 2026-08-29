import { useRef, useState } from 'react';
import Popover from './Popover.jsx';

// WhatsApp-style categorized picker, thematically adapted for classroom use.
const EMOJI_CATEGORIES = [
  { icon: '📚', title: 'Unterricht', items: ['📕', '📗', '📘', '📝', '✏️', '📐', '🧮', '📄', '📎', '🗂️', '🎒', '🔬', '🖍️', '📊', '🗒️', '📖'] },
  { icon: '⭐', title: 'Verhalten', items: ['⭐', '🌟', '🏆', '👏', '🙋', '🤝', '💪', '🚀', '🔥', '👍', '👎', '⚠️', '🎯', '💡', '🧠', '🎤'] },
  { icon: '🙂', title: 'Stimmung', items: ['🙂', '😀', '😐', '😕', '😢', '😴', '🥱', '😡', '🤔', '😎', '🤒', '😷', '🙃', '😅', '😞', '🤗'] },
  { icon: '⏰', title: 'Zeit & Orga', items: ['⏰', '⌛', '📅', '🔔', '🚪', '🏃', '🐢', '💤', '📵', '🔇', '🗣️', '💬', '✅', '❌', '➕', '➖'] },
];

function EmojiGrid({ onPick }) {
  const [cat, setCat] = useState(0);
  return (
    <div
      style={{
        width: 244,
        background: '#fff',
        border: '1px solid #ddd7cb',
        borderRadius: 12,
        boxShadow: '0 14px 34px rgba(0,0,0,.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', gap: 2, padding: 6, borderBottom: '1px solid #eeeae2', background: '#fbfaf7' }}>
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.title}
            title={c.title}
            onClick={() => setCat(i)}
            style={{ flex: 1, height: 34, borderRadius: 8, fontSize: 17, background: cat === i ? '#fff' : 'transparent', boxShadow: cat === i ? 'inset 0 0 0 1px #ddd7cb' : 'none' }}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, padding: 8, maxHeight: 196, overflowY: 'auto' }}>
        {EMOJI_CATEGORIES[cat].items.map((e) => (
          <button key={e} onClick={() => onPick(e)} style={{ height: 34, borderRadius: 8, fontSize: 18, lineHeight: '32px' }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// Reusable "Bemerkung" popover: pick a preset, add a custom emoji+text
// remark (optionally saving it as a new global preset), or edit/delete an
// already-added remark. Used identically in Stundenerfassung and
// Schriftliche Leistungen. Popovers are portal-rendered (see Popover.jsx) so
// they aren't clipped by the scrolling table rows they live in.
export default function RemarkPicker({ remarks, presets, onAddPreset, onAddCustom, onUpdateRemark, onDeleteRemark, onDeletePreset }) {
  const menuBtnRef = useRef(null);
  const draftEmojiBtnRef = useRef(null);
  const editAnchorRef = useRef(null);
  const editEmojiBtnRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draftEmoji, setDraftEmoji] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);
  const [remember, setRemember] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editEmoji, setEditEmoji] = useState('');
  const [editText, setEditText] = useState('');
  const [editPickerOpen, setEditPickerOpen] = useState(false);

  const closeAll = () => {
    setMenuOpen(false);
    setNewOpen(false);
    setDraftPickerOpen(false);
    setEditingId(null);
    setEditPickerOpen(false);
  };

  const submitDraft = () => {
    if (!draftText.trim()) return;
    onAddCustom({ emoji: draftEmoji, text: draftText.trim() }, remember);
    setDraftEmoji('');
    setDraftText('');
    setNewOpen(false);
    setMenuOpen(false);
  };

  const startEdit = (remark, el) => {
    editAnchorRef.current = el;
    setEditingId(remark.id);
    setEditEmoji(remark.emoji || '');
    setEditText(remark.text);
    setMenuOpen(false);
  };

  const saveEdit = () => {
    onUpdateRemark(editingId, { emoji: editEmoji, text: editText });
    setEditingId(null);
  };

  return (
    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button
        ref={menuBtnRef}
        onClick={() => {
          if (menuOpen) {
            closeAll();
          } else {
            closeAll();
            setMenuOpen(true);
          }
        }}
        title="Bemerkung hinzufügen"
        style={{
          flex: 'none',
          height: 30,
          padding: '0 11px',
          borderRadius: 9,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
          border: '1px solid ' + (menuOpen ? '#0f5b52' : '#cfc8bb'),
          background: menuOpen ? '#eef2f0' : '#fff',
          color: menuOpen ? '#0f5b52' : '#4b5c58',
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Bemerkung
      </button>

      {remarks.map((r) => (
        <button
          key={r.id}
          onClick={(e) => startEdit(r, e.currentTarget)}
          title={r.text}
          style={{
            flex: 'none',
            height: 26,
            padding: r.emoji ? '0 8px' : '0 10px',
            borderRadius: 99,
            fontSize: r.emoji ? 14 : 11,
            fontWeight: r.emoji ? 400 : 500,
            border: '1px solid #e3c777',
            background: '#fbf3dd',
            color: '#7a5a08',
            whiteSpace: 'nowrap',
          }}
        >
          {r.emoji || r.text.split(' ').slice(0, 2).join(' ')}
        </button>
      ))}

      <Popover open={menuOpen} anchorRef={menuBtnRef} onClose={closeAll} width={250}>
        <div
          style={{
            background: '#fff',
            border: '1px solid #ddd7cb',
            borderRadius: 11,
            boxShadow: '0 10px 30px rgba(0,0,0,.16)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 8px' }}>
            <span style={{ font: "500 9.5px 'IBM Plex Mono',monospace", color: '#8b968f', letterSpacing: '.09em' }}>
              BEMERKUNG AUSWÄHLEN
            </span>
            <button onClick={closeAll} style={{ fontSize: 13, color: '#8b968f', padding: '0 4px' }}>
              ✕
            </button>
          </div>
          {presets.map((p) => (
            <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                onClick={() => {
                  onAddPreset(p);
                  setMenuOpen(false);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 7, fontSize: 12.5, textAlign: 'left', flex: 1, minWidth: 0 }}
              >
                <span style={{ fontSize: 15, width: 20, flex: 'none', textAlign: 'center' }}>{p.emoji}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.text}</span>
              </button>
              <button
                onClick={() => onDeletePreset(p.id)}
                title="Bemerkung aus Menü entfernen"
                style={{ flex: 'none', width: 24, height: 24, borderRadius: 6, fontSize: 12, color: '#c0392b' }}
              >
                🗑
              </button>
            </span>
          ))}
          <button
            onClick={() => setNewOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 8px',
              borderRadius: 7,
              fontSize: 12.5,
              textAlign: 'left',
              color: newOpen ? '#0f5b52' : '#6c7a76',
              fontWeight: 500,
              background: newOpen ? '#eef2f0' : 'transparent',
            }}
          >
            <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>＋</span>
            <span>Neue Bemerkung</span>
          </button>
          {newOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '6px 2px 2px', padding: 11, background: '#fbfaf7', border: '1px solid #eeeae2', borderRadius: 9 }}>
              <span style={{ display: 'flex', gap: 8 }}>
                <button
                  ref={draftEmojiBtnRef}
                  onClick={() => setDraftPickerOpen((v) => !v)}
                  title="Emoji wählen"
                  style={{
                    width: 38,
                    height: 36,
                    flex: 'none',
                    borderRadius: 9,
                    font: draftEmoji ? "400 18px 'IBM Plex Sans',sans-serif" : "500 9px 'IBM Plex Mono',monospace",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: draftEmoji ? '#16211f' : '#a6a096',
                    border: '1px dashed ' + (draftPickerOpen ? '#0f5b52' : '#d5cfc3'),
                    background: '#fff',
                  }}
                >
                  {draftEmoji || 'Emoji'}
                </button>
                <input
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Beschreibung …"
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: '1px solid #ddd7cb', borderRadius: 7, fontSize: 12.5 }}
                />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setRemember((v) => !v)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      font: "600 11px 'IBM Plex Sans',sans-serif",
                      lineHeight: '18px',
                      border: '1px solid ' + (remember ? '#0f5b52' : '#d5cfc3'),
                      background: remember ? '#0f5b52' : '#fff',
                      color: '#fff',
                    }}
                  >
                    {remember ? '✓' : ' '}
                  </button>
                  <span style={{ fontSize: 12, color: '#4b5c58' }}>merken</span>
                </span>
                <button
                  onClick={submitDraft}
                  style={{
                    padding: '7px 13px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 500,
                    background: draftText.trim() ? '#0f5b52' : '#e6e1d7',
                    color: draftText.trim() ? '#fff' : '#a6a096',
                  }}
                >
                  Hinzufügen
                </button>
              </span>
            </div>
          )}
        </div>
      </Popover>

      <Popover open={draftPickerOpen} anchorRef={draftEmojiBtnRef} onClose={() => setDraftPickerOpen(false)}>
        <EmojiGrid
          onPick={(e) => {
            setDraftEmoji(e);
            setDraftPickerOpen(false);
          }}
        />
      </Popover>

      <Popover open={editingId != null} anchorRef={editAnchorRef} onClose={() => setEditingId(null)} width={240}>
        <div
          style={{
            background: '#fff',
            border: '1px solid #ddd7cb',
            borderRadius: 11,
            boxShadow: '0 10px 30px rgba(0,0,0,.16)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ font: "500 9.5px 'IBM Plex Mono',monospace", color: '#8b968f', letterSpacing: '.09em' }}>
            BEMERKUNG BEARBEITEN
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button
              ref={editEmojiBtnRef}
              onClick={() => setEditPickerOpen((v) => !v)}
              title="Emoji wählen"
              style={{
                width: 38,
                height: 36,
                flex: 'none',
                borderRadius: 9,
                font: editEmoji ? "400 18px 'IBM Plex Sans',sans-serif" : "500 9px 'IBM Plex Mono',monospace",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: editEmoji ? '#16211f' : '#a6a096',
                border: '1px dashed ' + (editPickerOpen ? '#0f5b52' : '#d5cfc3'),
                background: '#fff',
              }}
            >
              {editEmoji || 'Emoji'}
            </button>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: '1px solid #ddd7cb', borderRadius: 7, fontSize: 12.5 }}
            />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
            <button
              onClick={() => {
                onDeleteRemark(editingId);
                setEditingId(null);
              }}
              style={{ padding: '7px 12px', border: '1px solid #edd3d0', borderRadius: 7, fontSize: 12, fontWeight: 500, color: '#c0392b', background: '#fdf3f2' }}
            >
              Löschen
            </button>
            <button onClick={saveEdit} style={{ padding: '7px 14px', borderRadius: 7, background: '#0f5b52', color: '#fff', fontSize: 12, fontWeight: 500 }}>
              Fertig
            </button>
          </span>
        </div>
      </Popover>

      <Popover open={editPickerOpen} anchorRef={editEmojiBtnRef} onClose={() => setEditPickerOpen(false)}>
        <EmojiGrid
          onPick={(e) => {
            setEditEmoji(e);
            setEditPickerOpen(false);
          }}
        />
      </Popover>
    </span>
  );
}
