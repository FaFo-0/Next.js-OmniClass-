// Teacher portal pages
const { useState: useState_T } = React;

// ---------- Teacher Dashboard ----------
function TeacherDashboard({ navigate, openSessionStart }) {
  const t = MOCK.teacher;
  return (
    <div>
      <PageHeader title={`Good afternoon, ${t.fullName.split(' ')[0]}`}
        subtitle="Here's what's happening today"
        right={[
          <button key="s" className="btn btn-tenant" onClick={openSessionStart}><Icon name="mic" size={14} /> Start session</button>,
        ]} />

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="users" label="Total students" value={t.totalStudents} />
        <MetricCard icon="book" label="Published this month" value={t.publishedThisMonth} />
        <MetricCard icon="clock" label="Hours taught (mo)" value={t.hoursThisMonth} />
        <MetricCard icon="bell" label="Pending reviews" value={t.pendingReviews} accent="red" />
      </div>

      <div className="split-2-1">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="h3">Today at a glance</div>
            <span className="body-sm">{MOCK.todaysClasses.length} classes</span>
          </div>
          {MOCK.todaysClasses.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < MOCK.todaysClasses.length - 1 ? '1px solid var(--omnic-gray-100)' : 'none' }}>
              <div style={{ minWidth: 56, fontWeight: 700, color: 'var(--omnic-tenant-primary)' }}>{c.time}</div>
              <Avatar initials={c.student.split(' ').map(s => s[0]).join('')} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--omnic-gray-900)' }}>{c.title}</div>
                <div className="body-sm">{c.student}</div>
              </div>
              {c.minutesUntil != null ? (
                <button className="btn btn-tenant btn-sm" onClick={openSessionStart}><Icon name="mic" size={13} /> Start</button>
              ) : (
                <button className="btn btn-secondary btn-sm">Details</button>
              )}
            </div>
          ))}
        </div>

        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="h3" style={{ marginBottom: 14 }}>Quick actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-tenant btn-block" onClick={openSessionStart}><Icon name="mic" size={14} /> Start session</button>
              <button className="btn btn-secondary btn-block" onClick={() => navigate('sessions')}><Icon name="video" size={14} /> View all sessions</button>
              <button className="btn btn-secondary btn-block" onClick={() => navigate('calendar')}><Icon name="calendar" size={14} /> Schedule class</button>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Recent recordings</div>
            {MOCK.recordings.slice(0, 3).map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--omnic-gray-100)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--omnic-gray-900)' }}>{r.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span className="body-sm">{r.student} · {r.date}</span>
                  <StatusPill status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Sessions list ----------
function TeacherSessions({ navigate, openSessionStart }) {
  const [search, setSearch] = useState_T('');
  return (
    <div>
      <PageHeader title="Sessions" subtitle="All recorded lessons across your students"
        right={[<button key="s" className="btn btn-tenant" onClick={openSessionStart}><Icon name="mic" size={14} /> Start session</button>]} />
      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search sessions..." />
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Title</th><th>Student</th><th>Date</th><th>Duration</th><th>Status</th><th>AI</th></tr>
          </thead>
          <tbody>
            {MOCK.recordings.filter(r => r.title.toLowerCase().includes(search.toLowerCase())).map(r => (
              <tr key={r.id} onClick={() => navigate('session-detail', r.id)}>
                <td style={{ fontWeight: 600 }}>{r.title}</td>
                <td>{r.student}</td>
                <td>{r.date}</td>
                <td>{r.duration}</td>
                <td><StatusPill status={r.status} /></td>
                <td><StatusPill status={r.workflow} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Session Start Modal ----------
function SessionStartModal({ open, onClose, onStart }) {
  const [step, setStep] = useState_T(1);
  const [classId, setClassId] = useState_T(null);
  const [mode, setMode] = useState_T(null);

  useEffect(() => { if (open) { setStep(1); setClassId(null); setMode(null); } }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Start a session"
      footer={
        step === 1 ? (
          <>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-tenant" disabled={!classId} onClick={() => setStep(2)}>Next</button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-tenant" disabled={!mode} onClick={() => onStart(mode, classId)}>Start</button>
          </>
        )
      }>
      {step === 1 ? (
        <>
          <div className="label" style={{ marginBottom: 10 }}>Step 1 of 2 · Select scheduled class</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK.todaysClasses.map(c => (
              <div key={c.id} onClick={() => setClassId(c.id)}
                style={{ padding: 14, border: `1px solid ${classId === c.id ? 'var(--omnic-tenant-primary)' : 'var(--omnic-gray-200)'}`, borderRadius: 8, cursor: 'pointer', background: classId === c.id ? 'var(--omnic-tenant-primary-soft)' : 'white', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar initials={c.student.split(' ').map(s => s[0]).join('')} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div className="body-sm">{c.student} · {c.time}</div>
                </div>
                {classId === c.id && <Icon name="check" size={16} stroke="var(--omnic-tenant-primary)" />}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="label" style={{ marginBottom: 10 }}>Step 2 of 2 · Choose capture mode</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { id: 'live', icon: 'mic', name: 'Live recording', desc: 'Capture mic + tab audio with realtime transcription.' },
              { id: 'upload', icon: 'upload', name: 'Upload recording', desc: 'Submit an audio or video file for transcription.' },
            ].map(o => (
              <div key={o.id} onClick={() => setMode(o.id)}
                style={{ padding: 18, border: `1px solid ${mode === o.id ? 'var(--omnic-tenant-primary)' : 'var(--omnic-gray-200)'}`, borderRadius: 8, cursor: 'pointer', background: mode === o.id ? 'var(--omnic-tenant-primary-soft)' : 'white', textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--omnic-tenant-primary-soft)', color: 'var(--omnic-tenant-primary)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={o.icon} size={20} />
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{o.name}</div>
                <div className="body-sm">{o.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- Live Lesson Dashboard (Feature B) ----------
function TeacherTranscribe({ navigate, onStop }) {
  const [elapsed, setElapsed] = useState_T(0);
  const [lineCount, setLineCount] = useState_T(2);
  const [quizJobs, setQuizJobs] = useState_T([]); // { id, status: 'generating'|'ready', preview }
  const [showQuizPanel, setShowQuizPanel] = useState_T(false);
  const [readingOpen, setReadingOpen] = useState_T(false);
  const [paused, setPaused] = useState_T(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(() => {
    if (paused || lineCount >= MOCK.transcript.length) return;
    const id = setTimeout(() => setLineCount(c => c + 1), 3500);
    return () => clearTimeout(id);
  }, [lineCount, paused]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const generateQuiz = () => {
    const id = Date.now();
    const fromLine = Math.max(0, lineCount - 3);
    const sourceText = MOCK.transcript.slice(fromLine, lineCount).map(l => l.text).join(' ').slice(0, 80);
    setQuizJobs(j => [...j, { id, status: 'generating', source: sourceText }]);
    setShowQuizPanel(true);
    // Simulate background generation — DOES NOT pause transcription
    setTimeout(() => {
      setQuizJobs(j => j.map(q => q.id === id ? {
        ...q, status: 'ready',
        preview: {
          q: 'In the dialogue, what does "wind down" most likely mean?',
          options: ['To finish a meeting on time', 'To gradually relax after a busy period', 'To raise an objection', 'To change the topic'],
          correct: 1,
        }
      } : q));
    }, 2400);
  };

  return (
    <div style={{ background: 'var(--omnic-gray-900)', minHeight: '100vh', display: 'flex', flexDirection: 'column', color: 'white' }}>

      {/* Top bar */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Amira Hassan · Business English — Negotiation</div>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>Recording in progress</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(34, 197, 94, 0.15)', color: '#86EFAC', borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }}></span> Mic
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(34, 197, 94, 0.15)', color: '#86EFAC', borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }}></span> Tab
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: paused ? 'rgba(245,158,11,0.2)' : 'rgba(220, 38, 38, 0.2)', color: paused ? '#FCD34D' : '#FCA5A5', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: paused ? '#F59E0B' : '#DC2626' }}></span> {paused ? 'PAUSED' : 'REC'}
          </span>
        </div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>{fmt(elapsed)}</div>
        <button onClick={() => setPaused(p => !p)} className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          <Icon name={paused ? 'play' : 'pause'} size={14} /> {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn" style={{ background: '#DC2626', color: 'white' }} onClick={onStop}>
          <span style={{ width: 8, height: 8, background: 'white', borderRadius: 1 }}></span>
          Stop & save
        </button>
      </div>

      {/* Action bar */}
      <div style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, opacity: 0.7, marginRight: 4 }}>Quick actions:</span>
        <button className="btn btn-tenant btn-sm" onClick={generateQuiz}>
          <Icon name="zap" size={13} /> Generate quiz from last 30s
        </button>
        <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }} onClick={() => setReadingOpen(true)}>
          <Icon name="layers" size={13} /> Open reading material
        </button>
        <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          <Icon name="bookmark" size={13} /> Mark moment
        </button>
        <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          <Icon name="plus" size={13} /> Add vocab on the fly
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showQuizPanel ? '1fr 360px' : '1fr', minHeight: 0 }}>
        {/* Transcript */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 24 }}>
            {MOCK.transcript.slice(0, lineCount).map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ minWidth: 100, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: line.speaker === 'Teacher' ? '#86EFAC' : '#93C5FD', paddingTop: 2 }}>{line.speaker}</div>
                <div style={{ flex: 1, lineHeight: 1.65, fontSize: 15 }}>{line.text}</div>
              </div>
            ))}
            {!paused && lineCount < MOCK.transcript.length && (
              <div style={{ display: 'flex', gap: 16, opacity: 0.5 }}>
                <div style={{ minWidth: 100, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#9CA3AF', paddingTop: 2 }}>Live</div>
                <div style={{ flex: 1, fontStyle: 'italic' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: '#FCD34D', borderRadius: '50%', marginRight: 8, animation: 'fade-in 0.8s ease infinite alternate' }}></span>
                  ...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quiz panel — generates in background, transcription continues */}
        {showQuizPanel && (
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)', padding: 20, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}><Icon name="sparkle" size={14} stroke="#FCD34D" /> AI Quiz Generator</div>
              <button className="btn-ghost" style={{ padding: 4 }} onClick={() => setShowQuizPanel(false)}><Icon name="x" size={14} stroke="white" /></button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 14, lineHeight: 1.5 }}>Runs in the background — transcription keeps going.</div>

            {quizJobs.length === 0 && <div style={{ fontSize: 13, opacity: 0.6, textAlign: 'center', padding: 20 }}>No quizzes yet.</div>}

            {quizJobs.map(q => (
              <div key={q.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14, marginBottom: 10, border: q.status === 'ready' ? '1px solid rgba(252,211,77,0.4)' : '1px solid rgba(255,255,255,0.08)' }}>
                {q.status === 'generating' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon name="refresh" size={14} stroke="#FCD34D" style={{ animation: 'spin 1s linear infinite' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Generating...</div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>From: "{q.source}..."</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="pill" style={{ background: 'rgba(252,211,77,0.2)', color: '#FCD34D', fontSize: 10 }}>Ready</span>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>just now</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{q.preview.q}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                      {q.preview.options.map((o, i) => (
                        <div key={i} style={{ fontSize: 12, padding: '6px 8px', background: i === q.preview.correct ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 4, color: i === q.preview.correct ? '#86EFAC' : 'white' }}>
                          {String.fromCharCode(65 + i)}. {o}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" style={{ flex: 1, background: 'var(--omnic-tenant-primary)', color: 'white' }}><Icon name="send" size={12} /> Send to Amira</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}><Icon name="edit" size={12} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {readingOpen && <ReadingView mode="teacher" onClose={() => setReadingOpen(false)} />}
    </div>
  );
}

// ---------- Session Detail ----------
function TeacherSessionDetail({ navigate, sessionId }) {
  const r = MOCK.recordings.find(x => x.id === sessionId) || MOCK.recordings[0];
  const [tab, setTab] = useState_T('transcript');
  const [generating, setGenerating] = useState_T(false);

  return (
    <div style={{ paddingBottom: 80 }}>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('sessions')}>
        <Icon name="chevronLeft" size={14} /> Back to sessions
      </button>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h1 className="h1" style={{ margin: 0 }}>{r.title}</h1>
              <Icon name="edit" size={14} stroke="var(--omnic-gray-400)" />
            </div>
            <div className="body">{r.student} · {r.date} · {r.duration}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <StatusPill status={r.status} />
            <StatusPill status={r.workflow} />
          </div>
        </div>
      </div>

      {/* Generate panel */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--omnic-tenant-primary-soft)', borderColor: 'var(--omnic-tenant-primary)' }}>
        <Icon name="sparkle" size={20} stroke="var(--omnic-tenant-primary)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--omnic-gray-900)' }}>AI content generation</div>
          <div className="body-sm">Generate summary, vocabulary, flashcards and quiz from the transcript.</div>
        </div>
        <select className="select" style={{ width: 220, fontSize: 13 }}>
          <option>google/gemini-3-flash-preview</option>
          <option>anthropic/claude-haiku-4-5</option>
        </select>
        <button className="btn btn-tenant" onClick={() => { setGenerating(true); setTimeout(() => setGenerating(false), 1800); }}>
          <Icon name={generating ? 'refresh' : 'zap'} size={14} style={generating ? { animation: 'spin 1s linear infinite' } : null} />
          {generating ? 'Generating...' : 'Generate all'}
        </button>
      </div>

      <Tabs tabs={[
        { value: 'transcript', label: 'Transcript' },
        { value: 'summary', label: 'Summary' },
        { value: 'vocab', label: 'Vocabulary', count: 4 },
        { value: 'flashcards', label: 'Flashcards', count: 5 },
        { value: 'quiz', label: 'Quiz', count: 3 },
      ]} value={tab} onChange={setTab} />

      {tab === 'transcript' && (
        <div className="card" style={{ padding: 20 }}>
          {MOCK.transcript.map((line, i) => (
            <div key={i} className="transcript-line">
              <div className={`transcript-speaker ${line.speaker === 'Teacher' ? 'transcript-speaker-teacher' : 'transcript-speaker-student'}`}>{line.speaker}</div>
              <div className="transcript-text">{line.text}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'summary' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <StatusPill status="Approved" />
            <button className="btn btn-secondary btn-sm"><Icon name="refresh" size={13} /> Regenerate</button>
          </div>
          <textarea className="textarea" rows={8} defaultValue="In this lesson we explored the language of business negotiation, focusing on the verb 'leverage' and the noun 'concession'. We practiced softening phrases like 'Would you consider...' and discussed the difference between a compromise — the agreement itself — and concessions, which are the things each side gives up." />
        </div>
      )}
      {tab === 'vocab' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr><th>Word</th><th>Translation</th><th>Part of Speech</th><th></th></tr></thead>
            <tbody>
              {MOCK.vocabulary.slice(0, 4).map((v, i) => (
                <tr key={i}>
                  <td><input className="input" defaultValue={v.word} style={{ padding: '4px 8px', fontSize: 13 }} /></td>
                  <td><input className="input" defaultValue={v.translation} style={{ padding: '4px 8px', fontSize: 13 }} /></td>
                  <td><input className="input" defaultValue={v.pos} style={{ padding: '4px 8px', fontSize: 13 }} /></td>
                  <td><button className="btn-ghost" style={{ padding: 4 }}><Icon name="trash" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 12 }}>
            <button className="btn btn-secondary btn-sm"><Icon name="plus" size={13} /> Add word</button>
          </div>
        </div>
      )}
      {tab === 'flashcards' && (
        <div className="card" style={{ padding: 20 }}>
          {MOCK.flashcards.map(f => (
            <div key={f.id} style={{ padding: 14, border: '1px solid var(--omnic-gray-100)', borderRadius: 8, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12 }}>
              <input className="input" defaultValue={f.front} placeholder="Front" />
              <input className="input" defaultValue={f.back} placeholder="Back" />
              <button className="btn-ghost" style={{ padding: 8 }}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {tab === 'quiz' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16, padding: 14, border: '1px solid var(--omnic-gray-100)', borderRadius: 8 }}>
            <input className="input" defaultValue="What does 'leverage' mean?" style={{ marginBottom: 8, fontWeight: 600 }} />
            {['To negotiate harshly', 'To use something to maximum advantage', 'To compromise', 'To refuse an offer'].map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="radio" name="q1" defaultChecked={i === 1} />
                <input className="input" defaultValue={o} style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 'var(--sidebar-w)', right: 0, background: 'white', borderTop: '1px solid var(--omnic-gray-100)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8, boxShadow: '0 -4px 12px rgba(0,0,0,0.04)' }}>
        <button className="btn btn-ghost"><Icon name="trash" size={14} /> Delete</button>
        <button className="btn btn-secondary">Save changes</button>
        <button className="btn btn-tenant"><Icon name="check" size={14} /> Publish to student</button>
      </div>
    </div>
  );
}

// ---------- Students ----------
function TeacherStudents() {
  const [search, setSearch] = useState_T('');
  const [filter, setFilter] = useState_T('all');
  const filtered = MOCK.studentRoster.filter(s =>
    (filter === 'all' || s.status.toLowerCase() === filter) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <PageHeader title="Students" subtitle="Your active and past students"
        right={[<button key="a" className="btn btn-tenant"><Icon name="plus" size={14} /> Add student</button>]} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search students..." />
        <FilterChips chips={[
          { value: 'all', label: 'All', count: MOCK.studentRoster.length },
          { value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' },
          { value: 'paused', label: 'Paused' }, { value: 'overdue', label: 'Overdue' },
        ]} value={filter} onChange={setFilter} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Lessons</th><th>Last activity</th><th>Sessions left</th></tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar initials={s.name.split(' ').map(p => p[0]).join('')} size="sm" />
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                  </div>
                </td>
                <td className="muted">{s.email}</td>
                <td><StatusPill status={s.status} /></td>
                <td>{s.lessons}</td>
                <td className="muted">{s.lastActivity}</td>
                <td>{s.sessionsLeft} / {s.sessionsTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Reports ----------
function TeacherReports() {
  const [tab, setTab] = useState_T('engagement');
  return (
    <div>
      <PageHeader title="Reports" subtitle="Student engagement and recording pipeline"
        right={[<button key="e" className="btn btn-secondary"><Icon name="external" size={14} /> Export CSV</button>]} />
      <Tabs tabs={[
        { value: 'engagement', label: 'Student engagement' },
        { value: 'pipeline', label: 'Recording pipeline' },
      ]} value={tab} onChange={setTab} />
      {tab === 'engagement' ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Student</th><th>Lessons</th><th>Cards reviewed</th><th>Streak</th><th>Last activity</th></tr></thead>
            <tbody>
              {MOCK.studentRoster.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.lessons}</td>
                  <td>{Math.floor(s.lessons * 18 + Math.random() * 40)}</td>
                  <td>{s.status === 'Active' ? Math.floor(Math.random() * 14 + 1) : 0}🔥</td>
                  <td className="muted">{s.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <MetricCard icon="video" label="Total" value={MOCK.recordings.length} />
            <MetricCard icon="check" label="Finalized" value={MOCK.recordings.filter(r => r.status === 'Finalized').length} />
            <MetricCard icon="edit" label="Draft" value={MOCK.recordings.filter(r => r.status === 'Draft').length} />
            <MetricCard icon="x" label="Failed" value={0} accent="red" />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Title</th><th>Date</th><th>Status</th><th>AI</th><th>Duration</th></tr></thead>
              <tbody>
                {MOCK.recordings.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.title}</td>
                    <td>{r.date}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td><StatusPill status={r.workflow} /></td>
                    <td>{r.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, {
  TeacherDashboard, TeacherSessions, SessionStartModal, TeacherTranscribe, TeacherSessionDetail, TeacherStudents, TeacherReports,
});
