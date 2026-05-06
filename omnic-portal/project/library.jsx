// Feature A: Reading & Library Hub — shared Reading View + role-specific list pages
const { useState: useS_L, useMemo: useM_L } = React;

// ============================================================
// READING VIEW — shared between Student (async) and Teacher (live)
// ============================================================
function ReadingView({ mode = 'student', onClose, onAddWord }) {
  // mode: 'student' (Add to My Flashcards) | 'teacher' (Send to Student's Flashcards) | 'admin' (Preview only)
  const [selectedWord, setSelectedWord] = useS_L(null);
  const [popoverPos, setPopoverPos] = useS_L({ x: 0, y: 0 });
  const [savedWords, setSavedWords] = useS_L([]);
  const [fontSize, setFontSize] = useS_L(18);
  const [activeStudent, setActiveStudent] = useS_L('Amira Hassan');

  const passage = MOCK.readingPassage;

  const handleWordClick = (word, e) => {
    const clean = word.toLowerCase().replace(/[.,!?;:"'—]/g, '');
    const def = MOCK.dictionary[clean];
    if (!def) return;
    const rect = e.target.getBoundingClientRect();
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.bottom + window.scrollY });
    setSelectedWord({ word: clean, ...def });
  };

  const addCurrent = () => {
    if (!selectedWord) return;
    setSavedWords([...savedWords, selectedWord.word]);
    if (onAddWord) onAddWord(selectedWord.word, mode === 'teacher' ? activeStudent : 'self');
    setSelectedWord(null);
  };

  const renderParagraph = (text, idx) => {
    const tokens = text.split(/(\s+)/);
    return (
      <p key={idx} style={{ marginBottom: 18, lineHeight: 1.75, fontSize, color: 'var(--omnic-gray-800)' }}>
        {tokens.map((tok, i) => {
          if (/^\s+$/.test(tok)) return tok;
          const clean = tok.toLowerCase().replace(/[.,!?;:"'—]/g, '');
          const isLookupable = !!MOCK.dictionary[clean];
          const isSaved = savedWords.includes(clean);
          return (
            <span
              key={i}
              onClick={isLookupable ? (e) => handleWordClick(tok, e) : undefined}
              style={{
                cursor: isLookupable ? 'pointer' : 'default',
                background: isSaved ? 'var(--omnic-tenant-primary-mid)' : 'transparent',
                borderBottom: isLookupable && !isSaved ? '1px dashed rgba(91,33,182,0.3)' : 'none',
                padding: isSaved ? '0 2px' : 0,
                borderRadius: 3,
                transition: 'background 0.12s',
              }}
              onMouseEnter={isLookupable ? (e) => e.currentTarget.style.background = isSaved ? 'var(--omnic-tenant-primary-mid)' : 'var(--omnic-tenant-primary-soft)' : undefined}
              onMouseLeave={isLookupable ? (e) => e.currentTarget.style.background = isSaved ? 'var(--omnic-tenant-primary-mid)' : 'transparent' : undefined}
            >
              {tok}
            </span>
          );
        })}
      </p>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,17,12,0.6)', zIndex: 200, display: 'flex', alignItems: 'stretch', padding: 24 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, maxWidth: 960, margin: '0 auto', background: 'white', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-modal)' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--omnic-gray-200)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><Icon name="x" size={18} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--omnic-gray-900)' }}>{passage.title}</div>
            <div className="body-sm">{passage.author} · <span className="pill pill-tenant" style={{ fontSize: 10 }}>CEFR {passage.cefr}</span></div>
          </div>
          {mode === 'teacher' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--omnic-tenant-primary-soft)', padding: '6px 12px', borderRadius: 999 }}>
              <Icon name="user" size={14} stroke="var(--omnic-tenant-primary)" />
              <select value={activeStudent} onChange={e => setActiveStudent(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 600, color: 'var(--omnic-tenant-primary)', fontSize: 13, cursor: 'pointer' }}>
                <option>Amira Hassan</option><option>Carlos Méndez</option><option>Liam O'Connor</option>
              </select>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--omnic-gray-200)', borderRadius: 6, padding: 2 }}>
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setFontSize(Math.max(14, fontSize - 2))}>A−</button>
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 14 }} onClick={() => setFontSize(Math.min(26, fontSize + 2))}>A+</button>
          </div>
        </div>

        {/* Reading area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 56px', background: '#FFFEF8' }}>
          {passage.paragraphs.map(renderParagraph)}
        </div>

        {/* Footer status bar */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--omnic-gray-200)', background: 'var(--omnic-gray-50)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="body-sm" style={{ flex: 1 }}>
            <Icon name="bookmark" size={13} /> {savedWords.length} word{savedWords.length === 1 ? '' : 's'} added {mode === 'teacher' ? `to ${activeStudent}'s flashcards` : 'to flashcards'}
          </div>
          <div className="body-sm">Click any underlined word to look it up.</div>
        </div>
      </div>

      {/* Word popover */}
      {selectedWord && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'fixed', left: Math.min(popoverPos.x - 160, window.innerWidth - 340), top: popoverPos.y + 8,
          width: 320, background: 'white', borderRadius: 12, boxShadow: 'var(--shadow-modal)',
          padding: 18, zIndex: 300, border: '1px solid var(--omnic-gray-200)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--omnic-gray-900)' }}>{selectedWord.word}</div>
              <div style={{ fontSize: 12, color: 'var(--omnic-gray-500)', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{selectedWord.phonetic}</div>
            </div>
            <button className="btn-ghost" style={{ padding: 6 }} title="Pronounce"><Icon name="volume" size={16} stroke="var(--omnic-tenant-primary)" /></button>
          </div>
          <div className="pill pill-new" style={{ fontSize: 10, marginBottom: 8 }}>{selectedWord.pos}</div>
          <div style={{ fontSize: 14, color: 'var(--omnic-gray-800)', marginBottom: 8, lineHeight: 1.5 }}>{selectedWord.meaning}</div>
          <div style={{ fontSize: 13, color: 'var(--omnic-gray-600)', fontStyle: 'italic', borderLeft: '2px solid var(--omnic-tenant-primary)', paddingLeft: 10, marginBottom: 14, lineHeight: 1.5 }}>"{selectedWord.example}"</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 0 }} onClick={() => setSelectedWord(null)}>Close</button>
            {mode !== 'admin' && (
              <button className="btn btn-tenant btn-sm" style={{ flex: 1 }} onClick={addCurrent}>
                <Icon name="plus" size={13} /> {mode === 'teacher' ? `Send to ${activeStudent.split(' ')[0]}'s flashcards` : 'Add to my flashcards'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STUDENT LIBRARY — async reading practice
// ============================================================
function StudentLibrary() {
  const [reading, setReading] = useS_L(null);
  const [filter, setFilter] = useS_L('all');
  const items = MOCK.library.filter(b => filter === 'all' || b.cefr === filter);

  return (
    <div>
      <PageHeader title="Library" subtitle="Read assigned books and articles. Tap any word to look it up and save to flashcards." />

      <div style={{ marginBottom: 20 }}>
        <FilterChips chips={[
          { value: 'all', label: 'All' },
          { value: 'A2', label: 'A2 — Elementary' },
          { value: 'B1', label: 'B1 — Intermediate' },
          { value: 'B2', label: 'B2 — Upper Int.' },
          { value: 'C1', label: 'C1 — Advanced' },
        ]} value={filter} onChange={setFilter} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {items.map(b => (
          <div key={b.id} className="card" style={{ overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s' }}
            onClick={() => setReading(b)}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
            <div style={{
              height: 160, background: `linear-gradient(135deg, ${b.cover}, ${b.cover}dd)`,
              display: 'flex', alignItems: 'flex-end', padding: 14, color: 'white', position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <span className="pill" style={{ background: 'rgba(255,255,255,0.25)', color: 'white', fontSize: 10, fontWeight: 700 }}>{b.cefr}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{b.type}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{b.title}</div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div className="body-sm" style={{ marginBottom: 8 }}>{b.author}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--omnic-gray-500)' }}>
                <span><Icon name="clock" size={11} /> {b.minutes} min</span>
                <span><Icon name="file" size={11} /> {b.pages} pages</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {reading && <ReadingView mode="student" onClose={() => setReading(null)} />}
    </div>
  );
}

// ============================================================
// TEACHER LIBRARY — same UI but Reading View opens in teacher mode
// ============================================================
function TeacherLibrary() {
  const [reading, setReading] = useS_L(null);
  return (
    <div>
      <PageHeader title="Library" subtitle="Open material with your student. Tap words to send them to that student's flashcards." />

      <div className="card" style={{ padding: 14, marginBottom: 20, background: 'var(--omnic-tenant-primary-soft)', borderColor: 'var(--omnic-tenant-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="info" size={18} stroke="var(--omnic-tenant-primary)" />
        <div className="body-sm" style={{ color: 'var(--omnic-gray-800)', flex: 1 }}>
          <strong>Live class mode:</strong> share your screen with the student. Words you tap are pushed straight to their deck — no copy-paste.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {MOCK.library.map(b => (
          <div key={b.id} className="card" style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={() => setReading(b)}>
            <div style={{ height: 140, background: `linear-gradient(135deg, ${b.cover}, ${b.cover}dd)`, padding: 14, color: 'white', display: 'flex', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.85, textTransform: 'uppercase', fontWeight: 600 }}>{b.type} · {b.cefr}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{b.title}</div>
              </div>
            </div>
            <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="body-sm">{b.author}</span>
              <button className="btn btn-tenant btn-sm" onClick={(e) => { e.stopPropagation(); setReading(b); }}>Open</button>
            </div>
          </div>
        ))}
      </div>

      {reading && <ReadingView mode="teacher" onClose={() => setReading(null)} />}
    </div>
  );
}

// ============================================================
// ADMIN LIBRARY — upload/manage
// ============================================================
function AdminLibrary() {
  const [uploadOpen, setUploadOpen] = useS_L(false);
  const [reading, setReading] = useS_L(null);
  return (
    <div>
      <PageHeader title="Library Management" subtitle="Upload books, articles, and transcripts. Assign by CEFR level or to specific students."
        right={[<button key="u" className="btn btn-tenant" onClick={() => setUploadOpen(true)}><Icon name="upload" size={14} /> Upload material</button>]} />

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="book" label="Total items" value={MOCK.library.length} />
        <MetricCard icon="users" label="Assigned (multi)" value={MOCK.library.filter(b => b.assignedTo[0] === 'all').length} />
        <MetricCard icon="user" label="Personal assignments" value={MOCK.library.filter(b => b.assignedTo[0] !== 'all').length} />
        <MetricCard icon="clock" label="Avg. read time" value={`${Math.round(MOCK.library.reduce((a,b)=>a+b.minutes,0)/MOCK.library.length)} min`} />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>CEFR</th><th>Length</th><th>Assigned to</th><th>Tags</th><th></th></tr></thead>
          <tbody>
            {MOCK.library.map(b => (
              <tr key={b.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 40, borderRadius: 4, background: b.cover, flexShrink: 0 }}></div>
                    <span style={{ fontWeight: 600 }}>{b.title}</span>
                  </div>
                </td>
                <td className="muted">{b.author}</td>
                <td><span className="pill pill-new">{b.type}</span></td>
                <td><span className="pill pill-tenant">{b.cefr}</span></td>
                <td>{b.minutes} min · {b.pages} pp</td>
                <td>{b.assignedTo[0] === 'all' ? <span className="pill pill-trial">All students</span> : <span>{b.assignedTo.join(', ')}</span>}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {b.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 6px', background: 'var(--omnic-gray-100)', borderRadius: 4 }}>{t}</span>)}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-ghost" style={{ padding: 6 }} onClick={() => setReading(b)}><Icon name="play" size={14} /></button>
                    <button className="btn-ghost" style={{ padding: 6 }}><Icon name="edit" size={14} /></button>
                    <button className="btn-ghost" style={{ padding: 6 }}><Icon name="moreHorizontal" size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload reading material"
        footer={<><button className="btn btn-secondary" onClick={() => setUploadOpen(false)}>Cancel</button><button className="btn btn-tenant" onClick={() => setUploadOpen(false)}>Upload & process</button></>}>
        <div style={{
          border: '2px dashed var(--omnic-gray-300)', borderRadius: 10, padding: 36,
          textAlign: 'center', marginBottom: 16, background: 'var(--omnic-gray-50)',
        }}>
          <Icon name="upload" size={32} stroke="var(--omnic-tenant-primary)" />
          <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 4 }}>Drop a PDF, EPUB, DOCX, or TXT here</div>
          <div className="body-sm">or click to browse — we'll extract the text and prepare it for the reading view</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Title</label><input className="input" placeholder="The Great Gatsby — Chapter 1" style={{ marginTop: 4 }} /></div>
          <div><label className="label">Author</label><input className="input" placeholder="F. Scott Fitzgerald" style={{ marginTop: 4 }} /></div>
          <div><label className="label">CEFR level</label><select className="select" style={{ marginTop: 4 }}><option>A1</option><option>A2</option><option>B1</option><option selected>B2</option><option>C1</option><option>C2</option></select></div>
          <div><label className="label">Type</label><select className="select" style={{ marginTop: 4 }}><option>Novel</option><option>Article</option><option>Transcript</option><option>Dialogue</option></select></div>
        </div>
        <label className="label" style={{ marginTop: 12, display: 'block' }}>Assign to</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="chip chip-active">All students</button>
          <button className="chip">By CEFR level</button>
          <button className="chip">Specific students</button>
        </div>
      </Modal>

      {reading && <ReadingView mode="admin" onClose={() => setReading(null)} />}
    </div>
  );
}

Object.assign(window, { ReadingView, StudentLibrary, TeacherLibrary, AdminLibrary });
