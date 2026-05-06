// Student portal pages
const { useState: useState_S, useEffect: useEffect_S, useMemo: useMemo_S } = React;

// ---------- Student Dashboard ----------
function StudentDashboard({ navigate }) {
  const m = MOCK;
  const upcoming = m.upcomingClass;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div className="h1">Welcome back, <span style={{ color: 'var(--omnic-tenant-primary)' }}>{m.student.firstName}</span></div>
          <div className="body" style={{ marginTop: 4 }}>You're on a roll — keep the momentum going.</div>
        </div>
        <div className="card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--omnic-gray-900)' }}>{m.student.streak}-day streak</div>
            <div className="body-sm">Longest: {m.student.longestStreak} days</div>
          </div>
        </div>
      </div>

      {/* Next Up + Stats split */}
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="nextup-card">
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Next Up</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em' }}>Join class in {upcoming.minutesUntil} min</div>
          <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>{upcoming.title}</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>with {upcoming.teacher} · {upcoming.duration} min</div>
          <button className="btn btn-secondary" style={{ background: 'white', color: 'var(--omnic-tenant-primary)' }}>
            <Icon name="video" size={16} /> Join on Google Meet
          </button>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 4 }}>Study Due</div>
          <div className="body-sm" style={{ marginBottom: 14 }}>Spaced repetition queue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--omnic-tenant-primary)', letterSpacing: '-0.02em' }}>{m.dueCards}</div>
          <div className="body-sm" style={{ marginBottom: 16 }}>flashcards ready</div>
          <button className="btn btn-tenant btn-block" onClick={() => navigate('study')}>
            <Icon name="brain" size={16} /> Start studying
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="book" label="Lessons completed" value={m.student.lessonsCompleted} />
        <MetricCard icon="bookmark" label="Words learned" value={m.student.wordsLearned} />
        <MetricCard icon="brain" label="Cards reviewed" value={m.student.cardsReviewed} />
        <MetricCard icon="flame" label="Day streak" value={m.student.streak} accent="red" />
      </div>

      {/* Recent lessons */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--omnic-gray-100)' }}>
          <div className="h3">Recent lessons</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('lessons')}>
            View all <Icon name="chevronRight" size={14} />
          </button>
        </div>
        {m.lessons.slice(0, 3).map(l => (
          <div key={l.id} className="lesson-row" onClick={() => navigate('lesson-detail', l.id)}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--omnic-tenant-primary-soft)', color: 'var(--omnic-tenant-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="book" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--omnic-gray-900)' }}>{l.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>{l.date} · {l.teacher} · {l.duration}</div>
            </div>
            <span className="pill pill-tenant">{l.wordCount} words</span>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Student: Lessons ----------
function StudentLessons({ navigate }) {
  const [tab, setTab] = useState_S('all');
  const [search, setSearch] = useState_S('');
  const filtered = MOCK.lessons.filter(l => l.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <PageHeader title="My Lessons" subtitle={`${filtered.length} lessons published by your teachers`} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search lessons..." />
      </div>
      <Tabs tabs={[
        { value: 'all', label: 'All', count: MOCK.lessons.length },
        { value: 'upcoming', label: 'Upcoming', count: 4 },
        { value: 'past', label: 'Past', count: MOCK.lessons.length },
      ]} value={tab} onChange={setTab} />
      <div className="card">
        {filtered.map(l => (
          <div key={l.id} className="lesson-row" onClick={() => navigate('lesson-detail', l.id)}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--omnic-tenant-primary-soft)', color: 'var(--omnic-tenant-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="book" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--omnic-gray-900)' }}>{l.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>{l.date} · {l.teacher} · {l.duration}</div>
            </div>
            <span className="pill pill-tenant">{l.wordCount} words</span>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Student: Lesson Detail ----------
function StudentLessonDetail({ navigate, lessonId }) {
  const lesson = MOCK.lessons.find(l => l.id === lessonId) || MOCK.lessons[0];
  const vocab = MOCK.vocabulary.filter(v => v.lessonId === lesson.id);
  const flashcards = MOCK.flashcards.slice(0, 3);
  const [flippedIdx, setFlippedIdx] = useState_S(null);
  const [summaryExpanded, setSummaryExpanded] = useState_S(false);
  const [quizAnswers, setQuizAnswers] = useState_S({});
  const [quizSubmitted, setQuizSubmitted] = useState_S(false);

  const summary = "In this lesson we explored the language of business negotiation, focusing on the verb 'leverage' and the noun 'concession'. We practiced softening phrases like 'Would you consider...' and discussed the difference between a compromise — the agreement itself — and concessions, which are the things each side gives up. We also covered stakeholder dynamics and how to frame counter-offers diplomatically.";

  const quiz = [
    { q: "What does 'leverage' mean?", options: ['To negotiate harshly', 'To use something to maximum advantage', 'To compromise', 'To refuse an offer'], correct: 1 },
    { q: "A concession is...", options: ['The final agreement', 'Something given up to reach an agreement', 'A type of negotiation', 'A formal contract'], correct: 1 },
    { q: "Which is a softening phrase?", options: ["'You must agree'", "'Would you consider...'", "'I demand'", "'No way'"], correct: 1 },
  ];

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => navigate('lessons')}>
        <Icon name="chevronLeft" size={14} /> Back to lessons
      </button>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1 className="h1" style={{ margin: 0 }}>{lesson.title}</h1>
            <div className="body" style={{ marginTop: 6 }}>{lesson.date} · {lesson.teacher} · {lesson.duration}</div>
          </div>
          <button className="btn btn-secondary"><Icon name="play" size={14} /> Play audio</button>
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sparkle" size={16} stroke="var(--omnic-tenant-primary)" /> Summary
        </div>
        <p className="body" style={{ margin: 0, color: 'var(--omnic-gray-700)' }}>
          {summaryExpanded ? summary : summary.slice(0, 220) + '...'}
        </p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setSummaryExpanded(!summaryExpanded)}>
          {summaryExpanded ? 'Show less' : 'Read more'}
        </button>
      </div>

      {/* Vocabulary */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="bookmark" size={16} stroke="var(--omnic-tenant-primary)" /> Vocabulary <span className="muted body-sm">({vocab.length} words)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {vocab.map((v, i) => (
            <div key={i} style={{ padding: 12, background: 'var(--omnic-gray-50)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => speak(v.word)} className="btn-ghost" style={{ padding: 4, borderRadius: 6 }}>
                <Icon name="speaker" size={14} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--omnic-gray-900)' }}>{v.word}</div>
                <div className="body-sm">{v.translation}</div>
              </div>
              <span className="pill pill-new" style={{ fontSize: 10 }}>{v.pos}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flashcards preview */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="brain" size={16} stroke="var(--omnic-tenant-primary)" /> Flashcards
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('study')}>
            Study all <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {flashcards.map((f, i) => (
            <div key={f.id} onClick={() => setFlippedIdx(flippedIdx === i ? null : i)}
              style={{ height: 130, padding: 16, borderRadius: 8, border: '1px solid var(--omnic-gray-200)', background: flippedIdx === i ? 'var(--omnic-tenant-primary-soft)' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', transition: 'all 0.2s' }}>
              {flippedIdx === i ? (
                <div className="body-sm" style={{ color: 'var(--omnic-gray-700)' }}>{f.back}</div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--omnic-gray-900)' }}>{f.front}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quiz */}
      <div className="card" style={{ padding: 24 }}>
        <div className="h3" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="target" size={16} stroke="var(--omnic-tenant-primary)" /> Comprehension Quiz
        </div>
        {quiz.map((q, qi) => (
          <div key={qi} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--omnic-gray-900)', marginBottom: 8 }}>{qi + 1}. {q.q}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt, oi) => {
                let cls = 'quiz-option';
                if (quizSubmitted) {
                  if (oi === q.correct) cls += ' quiz-option-correct';
                  else if (quizAnswers[qi] === oi) cls += ' quiz-option-wrong';
                } else if (quizAnswers[qi] === oi) cls += ' quiz-option-selected';
                return (
                  <div key={oi} className={cls} onClick={() => !quizSubmitted && setQuizAnswers({ ...quizAnswers, [qi]: oi })}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--omnic-gray-500)' }}>{String.fromCharCode(65 + oi)}</span>
                    {opt}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!quizSubmitted ? (
          <button className="btn btn-tenant" onClick={() => setQuizSubmitted(true)}>Submit answers</button>
        ) : (
          <div style={{ padding: 14, background: 'var(--omnic-tenant-primary-soft)', borderRadius: 8, color: 'var(--omnic-tenant-primary)', fontWeight: 600 }}>
            <Icon name="check" size={14} /> You scored {Object.entries(quizAnswers).filter(([qi, oi]) => quiz[qi].correct === oi).length}/{quiz.length}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Study Engine ----------
function StudentStudy({ navigate }) {
  const cards = MOCK.flashcards;
  const [started, setStarted] = useState_S(false);
  const [idx, setIdx] = useState_S(0);
  const [flipped, setFlipped] = useState_S(false);
  const [done, setDone] = useState_S(false);
  const [stats, setStats] = useState_S({ again: 0, hard: 0, good: 0, easy: 0 });

  if (!started) {
    const dueByDeck = [
      { name: 'Business English', count: 14, color: '#7C3AED' },
      { name: 'Travel Conversations', count: 8, color: '#0891B2' },
      { name: 'Pronunciation', count: 6, color: '#F59E0B' },
    ];
    const total = dueByDeck.reduce((a, d) => a + d.count, 0);
    return (
      <div style={{ maxWidth: 600, margin: '40px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--omnic-tenant-primary-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Icon name="brain" size={44} stroke="var(--omnic-tenant-primary)" />
          </div>
          <h1 className="h1" style={{ marginBottom: 6 }}>Ready to study?</h1>
          <div className="body">{total} cards are due across {dueByDeck.length} decks. Spaced-repetition keeps your hardest words coming back until they stick.</div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Decks with cards due</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dueByDeck.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--omnic-gray-200)', borderRadius: 8 }}>
                <div style={{ width: 6, height: 36, borderRadius: 3, background: d.color }}></div>
                <div style={{ flex: 1, fontWeight: 500, color: 'var(--omnic-gray-900)' }}>{d.name}</div>
                <span className="pill pill-tenant">{d.count} due</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--omnic-gray-50)' }}>
          <Icon name="info" size={18} stroke="var(--omnic-gray-600)" />
          <div className="body-sm">
            <b>How it works:</b> Tap a card to reveal the answer, then rate how well you knew it. Cards you find easy come back less often; cards you struggle with come back sooner.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-tenant btn-lg" style={{ flex: 1 }} onClick={() => setStarted(true)}>
            <Icon name="play" size={16} /> Start studying — {total} cards
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => navigate('vocabulary')}>Browse words</button>
        </div>
        <div className="body-sm" style={{ textAlign: 'center', marginTop: 14 }}>
          🔥 Studying today extends your {MOCK.student.streak}-day streak
        </div>
      </div>
    );
  }

  const rate = (key) => {
    setStats(s => ({ ...s, [key]: s[key] + 1 }));
    setFlipped(false);
    if (idx + 1 >= cards.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
    }
  };

  if (done) {
    const reviewed = stats.again + stats.hard + stats.good + stats.easy;
    const accuracy = Math.round(((stats.good + stats.easy) / Math.max(reviewed, 1)) * 100);
    return (
      <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>🎉</div>
        <h1 className="h1">Session complete!</h1>
        <div className="body" style={{ marginBottom: 24 }}>Great work today, {MOCK.student.firstName}.</div>
        <div className="grid-3" style={{ marginBottom: 24, textAlign: 'left' }}>
          <MetricCard label="Cards reviewed" value={reviewed} icon="brain" />
          <MetricCard label="Accuracy" value={accuracy + '%'} icon="target" />
          <MetricCard label="Streak" value={MOCK.student.streak + 1} icon="flame" accent="red" />
        </div>
        <button className="btn btn-tenant btn-lg" onClick={() => navigate('home')}>Back to dashboard</button>
      </div>
    );
  }

  const card = cards[idx];
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="h2">Study Flashcards</div>
          <div className="body-sm" style={{ marginTop: 2 }}>{cards.length - idx} cards remaining</div>
        </div>
        <select className="select" style={{ width: 'auto' }}>
          <option>All Due</option>
          <option>Business English</option>
          <option>Travel</option>
        </select>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="body-sm">Card {idx + 1} of {cards.length}</span>
          <span className="body-sm">🔥 {MOCK.student.streak}-day streak</span>
        </div>
        <div className="progress"><div className="progress-fill" style={{ width: `${((idx + 1) / cards.length) * 100}%` }} /></div>
      </div>

      {/* Flashcard */}
      <div className="flashcard-container" style={{ marginBottom: 24 }}>
        <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
          <div className="flashcard-face">
            <div className="label" style={{ marginBottom: 8 }}>{card.pos}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--omnic-gray-900)', letterSpacing: '-0.02em' }}>{card.front}</div>
            <div className="body-sm" style={{ marginTop: 16 }}>Tap to reveal definition</div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--omnic-gray-900)', marginBottom: 8 }}>{card.back}</div>
            <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--omnic-gray-600)', marginBottom: 12, textAlign: 'center' }}>"{card.example}"</div>
            <div className="body-sm" style={{ color: 'var(--omnic-gray-400)' }}>From: {card.lesson}</div>
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      {flipped ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="rating-btn" style={{ background: '#DC2626' }} onClick={() => rate('again')}>
            <span>Again</span><span className="key">1 · 1m</span>
          </button>
          <button className="rating-btn" style={{ background: '#EA580C' }} onClick={() => rate('hard')}>
            <span>Hard</span><span className="key">2 · 6m</span>
          </button>
          <button className="rating-btn" style={{ background: '#16A34A' }} onClick={() => rate('good')}>
            <span>Good</span><span className="key">3 · 10m</span>
          </button>
          <button className="rating-btn" style={{ background: '#2563EB' }} onClick={() => rate('easy')}>
            <span>Easy</span><span className="key">4 · 4d</span>
          </button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-block btn-lg" onClick={() => setFlipped(true)}>
          Reveal answer
        </button>
      )}
    </div>
  );
}

// ---------- Vocabulary ----------
function StudentVocabulary() {
  const [search, setSearch] = useState_S('');
  const filtered = MOCK.vocabulary.filter(v => v.word.includes(search.toLowerCase()) || v.translation.includes(search.toLowerCase()));
  const speak = (text) => { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; window.speechSynthesis.speak(u); } };
  return (
    <div>
      <PageHeader title="My Words" subtitle={`${MOCK.vocabulary.length} words across all lessons`} right={[
        <button key="d" className="btn btn-tenant"><Icon name="plus" size={14} /> Create deck</button>
      ]} />
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search words..." />
        <FilterChips chips={[
          { value: 'all', label: 'All', count: MOCK.vocabulary.length },
          { value: 'recent', label: 'Recent' },
          { value: 'lesson', label: 'By Lesson' },
        ]} value="all" onChange={() => {}} />
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th></th><th>Word</th><th>Translation</th><th>Type</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr key={i}>
                <td style={{ width: 40 }}>
                  <button onClick={() => speak(v.word)} className="btn-ghost" style={{ padding: 6, borderRadius: 6 }}>
                    <Icon name="speaker" size={14} />
                  </button>
                </td>
                <td style={{ fontWeight: 600 }}>{v.word}</td>
                <td className="muted">{v.translation}</td>
                <td><span className="pill pill-new">{v.pos}</span></td>
                <td style={{ width: 32 }}><Icon name="chevronRight" size={14} stroke="var(--omnic-gray-400)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Calendar ----------
function StudentCalendar() {
  const [view, setView] = useState_S('week');
  const [eventTypes, setEventTypes] = useState_S({ '1on1': true, group: true, global: true, offline: false });
  const myEvents = MOCK.calendarEvents.filter(e =>
    (e.students || '').includes('Amira') || e.kind === 'group' || e.kind === 'global'
  ).filter(e => eventTypes[e.kind]);

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Apr 26 — May 2, 2026"
        right={[
          <button key="s" className="btn btn-secondary"><Icon name="external" size={14} /> Sync (.ics)</button>,
        ]} />

      {/* Make-up credits banner — info only */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--omnic-tenant-primary-soft)', borderColor: 'var(--omnic-tenant-primary)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--omnic-tenant-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>2</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--omnic-gray-900)' }}>You have 2 make-up credits</div>
          <div className="body-sm">Granted Apr 22 (instructor cancelled). Expires Jun 21. Mention to your instructor when scheduling your next class.</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm">Today</button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronRight" size={14} /></button>
          <div className="h3" style={{ marginLeft: 8 }}>May 2026</div>
        </div>
        <FilterChips chips={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]} value={view} onChange={setView} />
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="body-sm" style={{ fontWeight: 500 }}>Show:</span>
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={eventTypes[k]} onChange={e => setEventTypes(t => ({ ...t, [k]: e.target.checked }))} />
            <div style={{ width: 12, height: 12, borderRadius: 3, background: KIND_COLORS[k] }}></div>
            {label}
          </label>
        ))}
      </div>

      {view === 'month' ? <MonthGrid events={myEvents} /> : <WeekCalendar events={myEvents} view={view === 'day' ? 'day' : 'week'} currentCol={5} />}
    </div>
  );
}

function MonthGrid({ events }) {
  // May 2026 — month view fallback
  const monthDays = 31;
  const startWeekday = 5; // May 1 = Friday
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: 30 - startWeekday + i + 1, other: true });
  for (let i = 1; i <= monthDays; i++) cells.push({ day: i, today: i === 1 });
  // map events with day=0 → May 1, day=1 → May 2, day=-1 → Apr 30 etc; only show days in May
  const eventsByDay = {};
  events.forEach(e => {
    const may = e.day + 1; // since today (offset 0) = May 1
    if (may >= 1 && may <= 31) {
      eventsByDay[may] = eventsByDay[may] || [];
      eventsByDay[may].push(e);
    }
  });
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--omnic-gray-200)' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--omnic-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((c, i) => {
          const dayEvents = !c.other ? (eventsByDay[c.day] || []) : [];
          return (
            <div key={i} style={{ minHeight: 110, padding: 6, borderRight: '1px solid var(--omnic-gray-100)', borderBottom: '1px solid var(--omnic-gray-100)', background: c.other ? 'var(--omnic-gray-50)' : 'white' }}>
              <div style={{ fontSize: 13, fontWeight: c.today ? 700 : 500, color: c.today ? 'white' : (c.other ? 'var(--omnic-gray-400)' : 'var(--omnic-gray-900)'), background: c.today ? 'var(--omnic-tenant-primary)' : 'transparent', width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>{c.day}</div>
              {dayEvents.slice(0, 3).map(e => (
                <div key={e.id} style={{ fontSize: 11, padding: '2px 6px', marginBottom: 2, borderRadius: 4, background: KIND_COLORS[e.kind], color: 'var(--omnic-gray-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{Math.floor(e.start/60)}:{(e.start%60).toString().padStart(2,'0')} {e.title}</div>
              ))}
              {dayEvents.length > 3 && <div style={{ fontSize: 11, color: 'var(--omnic-gray-500)', padding: '0 6px' }}>+{dayEvents.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Achievements ----------
function StudentAchievements() {
  const m = MOCK.student;
  const unlocked = MOCK.achievements.filter(a => a.unlocked).length;
  return (
    <div>
      <PageHeader title="Achievements" subtitle={`${unlocked} of ${MOCK.achievements.length} unlocked`} />
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="award" label="Unlocked" value={`${unlocked}/${MOCK.achievements.length}`} />
        <MetricCard icon="flame" label="Current streak" value={`${m.streak} days`} accent="red" />
        <MetricCard icon="zap" label="Longest streak" value={`${m.longestStreak} days`} />
        <MetricCard icon="clock" label="Study time" value={`${m.studyTimeHours}h`} />
      </div>
      <div className="grid-3">
        {MOCK.achievements.map(a => (
          <div key={a.id} className={`card achv-card ${a.unlocked ? 'achv-unlocked' : 'achv-locked'}`}>
            <div className="achv-icon">{a.unlocked ? a.icon : '🔒'}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--omnic-gray-900)', marginBottom: 4 }}>{a.name}</div>
            <div className="body-sm" style={{ marginBottom: 10 }}>{a.description}</div>
            {a.unlocked ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--omnic-tenant-primary)' }}>Unlocked {a.date}</div>
            ) : (
              <>
                <div className="progress" style={{ marginBottom: 6 }}>
                  <div className="progress-fill" style={{ width: `${(a.progress / a.total) * 100}%` }} />
                </div>
                <div className="body-sm">{a.progress} / {a.total}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Profile ----------
function StudentProfile() {
  const m = MOCK.student;
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="card" style={{ padding: 28, textAlign: 'center', marginBottom: 16 }}>
        <Avatar initials={m.initials} size="lg" />
        <div className="h2" style={{ marginTop: 14 }}>{m.fullName}</div>
        <div className="body" style={{ marginBottom: 14 }}>{m.email}</div>
        <button className="btn btn-secondary btn-sm"><Icon name="edit" size={14} /> Edit profile</button>
      </div>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Your stats</div>
        <div className="grid-3">
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{m.lessonsCompleted}</div><div className="body-sm">Lessons</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{m.wordsLearned}</div><div className="body-sm">Words</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--omnic-red)' }}>{m.streak}🔥</div><div className="body-sm">Streak</div></div>
        </div>
      </div>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Subscription</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="body">Sessions remaining</span>
          <span style={{ fontWeight: 600 }}>{m.sessionsRemaining} of {m.sessionsTotal}</span>
        </div>
        <div className="progress" style={{ marginBottom: 16 }}>
          <div className="progress-fill" style={{ width: `${(m.sessionsRemaining / m.sessionsTotal) * 100}%` }} />
        </div>
        <button className="btn btn-secondary btn-block">Contact your provider to purchase more</button>
      </div>
      <button className="btn btn-secondary btn-block"><Icon name="logout" size={14} /> Sign out</button>
    </div>
  );
}

Object.assign(window, {
  StudentDashboard, StudentLessons, StudentLessonDetail, StudentStudy, StudentVocabulary, StudentCalendar, StudentAchievements, StudentProfile,
});
