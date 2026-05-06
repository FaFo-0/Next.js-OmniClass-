// Admin portal pages
const { useState: useState_A } = React;

// ---------- Admin Dashboard ----------
function AdminDashboard({ navigate }) {
  const m = MOCK.adminMetrics;
  const fmt = (n) => '€' + n.toLocaleString();
  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${MOCK.tenant.name} · ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`} />

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="user" label="Teachers" value={m.teachers} />
        <MetricCard icon="users" label="Students" value={m.students} />
        <MetricCard icon="video" label="Sessions (mo)" value={m.sessionsThisMonth} />
        <MetricCard icon="sparkle" label="AI prompts (mo)" value={m.aiPromptsUsed.toLocaleString()} />
      </div>

      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div className="h3">Monthly P&L</div>
              <div className="body-sm">From the billing service</div>
            </div>
            <select className="select" style={{ width: 'auto' }}>
              <option>April 2026</option><option>March 2026</option><option>February 2026</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 32px' }}>
            <div><div className="body-sm">Total revenue</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--omnic-tenant-primary)' }}>{fmt(m.revenue)}</div></div>
            <div><div className="body-sm">Ad spend</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--omnic-gray-700)' }}>{fmt(m.adSpend)}</div></div>
            <div><div className="body-sm">Other expenses</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--omnic-gray-700)' }}>{fmt(m.expenses)}</div></div>
            <div><div className="body-sm">Teacher & employee pay</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--omnic-gray-700)' }}>{fmt(m.teacherPay)}</div></div>
          </div>
          <div style={{ borderTop: '1px solid var(--omnic-gray-100)', paddingTop: 16, marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="h3">Net profit</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--omnic-tenant-primary)' }}>{fmt(m.netProfit)}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Subscriptions</div>
          {[
            { label: 'Active', value: m.active, color: 'var(--status-active)' },
            { label: 'Paused', value: m.paused, color: 'var(--status-paused)' },
            { label: 'Trial', value: m.trial, color: 'var(--status-trial)' },
            { label: 'New this month', value: m.newThisMonth, color: 'var(--omnic-tenant-primary)' },
            { label: 'Renewed', value: m.renewed, color: 'var(--omnic-tenant-primary)' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--omnic-gray-100)' }}>
              <span className="body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }}></span>{r.label}
              </span>
              <span style={{ fontWeight: 600 }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="split-2-1">
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Recent activity</div>
          {MOCK.recentActivity.map((a, i) => (
            <div key={i} className="activity-row">
              <div className="activity-icon">
                <Icon name={a.type === 'student_registered' ? 'user' : a.type === 'lesson_published' ? 'book' : a.type === 'session_completed' ? 'video' : a.type === 'invoice' ? 'dollar' : 'bell'} size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--omnic-gray-800)' }}>{a.text}</div>
                <div className="body-sm" style={{ marginTop: 2 }}>{a.time}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Quick links</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { icon: 'users', label: 'Manage people', route: 'people' },
              { icon: 'sparkle', label: 'AI manager', route: 'ai' },
              { icon: 'calendar', label: 'Calendar', route: 'calendar' },
              { icon: 'settings', label: 'Branding', route: 'branding' },
            ].map(q => (
              <button key={q.label} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: 10 }}
                onClick={() => q.route && navigate(q.route)}>
                <Icon name={q.icon} size={15} />
                <span style={{ flex: 1, textAlign: 'left' }}>{q.label}</span>
                {q.external && <Icon name="external" size={12} stroke="var(--omnic-gray-400)" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Students ----------
function AdminStudents() {
  const [filter, setFilter] = useState_A('all');
  const [search, setSearch] = useState_A('');
  const [assignOpen, setAssignOpen] = useState_A(null);
  const filtered = MOCK.studentRoster.filter(s =>
    (filter === 'all' || s.status.toLowerCase() === filter) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const counts = MOCK.studentRoster.reduce((a, s) => { a[s.status.toLowerCase()] = (a[s.status.toLowerCase()] || 0) + 1; return a; }, {});

  return (
    <div>
      <PageHeader title="Students" subtitle="All students enrolled across instructors"
        right={[<button key="a" className="btn btn-tenant"><Icon name="plus" size={14} /> Add student</button>]} />
      <div style={{ marginBottom: 16 }}>
        <FilterChips chips={[
          { value: 'all', label: 'All', count: MOCK.studentRoster.length },
          { value: 'active', label: 'Active', count: counts.active || 0 },
          { value: 'trial', label: 'Trial', count: counts.trial || 0 },
          { value: 'paused', label: 'Paused', count: counts.paused || 0 },
          { value: 'overdue', label: 'Overdue', count: counts.overdue || 0 },
          { value: 'cancelled', label: 'Cancelled', count: counts.cancelled || 0 },
        ]} value={filter} onChange={setFilter} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email..." />
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Assigned instructor</th><th>Plan</th><th>Sessions left</th><th>Status</th><th></th></tr>
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
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAssignOpen(s)} style={{ padding: '2px 8px' }}>
                    {s.teacher} <Icon name="chevronDown" size={12} />
                  </button>
                </td>
                <td>{s.plan}</td>
                <td>{s.sessionsLeft} / {s.sessionsTotal}</td>
                <td><StatusPill status={s.status} /></td>
                <td><button className="btn-ghost" style={{ padding: 6 }}><Icon name="moreHorizontal" size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!assignOpen} onClose={() => setAssignOpen(null)} title={`Assign instructor to ${assignOpen?.name || ''}`}
        footer={<><button className="btn btn-secondary" onClick={() => setAssignOpen(null)}>Cancel</button><button className="btn btn-tenant" onClick={() => setAssignOpen(null)}>Assign</button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK.instructors.map(i => (
            <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--omnic-gray-200)', borderRadius: 8, cursor: 'pointer' }}>
              <input type="radio" name="ti" defaultChecked={assignOpen?.teacher === i.name} />
              <Avatar initials={i.name.split(' ').map(p => p[0]).join('')} size="sm" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                <div className="body-sm">{i.students} students · {i.hours}h this month</div>
              </div>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ---------- Instructors ----------
function AdminInstructors({ navigate }) {
  const [assignOpen, setAssignOpen] = useState_A(null);
  return (
    <div>
      <PageHeader title="Instructors" subtitle="Teachers, coaches, clinicians delivering sessions"
        right={[<button key="a" className="btn btn-tenant"><Icon name="plus" size={14} /> Add instructor</button>]} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Students</th><th>Hours (mo)</th><th>Sessions (mo)</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {MOCK.instructors.map(i => (
              <tr key={i.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar initials={i.name.split(' ').map(p => p[0]).join('')} size="sm" />
                    <span style={{ fontWeight: 600 }}>{i.name}</span>
                  </div>
                </td>
                <td className="muted">{i.email}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAssignOpen(i)} style={{ padding: '2px 8px' }}>
                    {i.students} <Icon name="chevronDown" size={12} />
                  </button>
                </td>
                <td>{i.hours}</td>
                <td>{i.sessions}</td>
                <td className="muted">{i.joined}</td>
                <td><StatusPill status={i.status} /></td>
                <td><button className="btn-ghost" style={{ padding: 6 }} onClick={() => navigate('calendar')}><Icon name="calendar" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!assignOpen} onClose={() => setAssignOpen(null)} title={`Assign students to ${assignOpen?.name || ''}`}
        footer={<><button className="btn btn-secondary" onClick={() => setAssignOpen(null)}>Cancel</button><button className="btn btn-tenant" onClick={() => setAssignOpen(null)}>Save assignments</button></>}>
        <div style={{ marginBottom: 12 }} className="body-sm">Toggle which students are assigned to this instructor.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MOCK.studentRoster.map(s => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--omnic-gray-100)', borderRadius: 8, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked={s.teacher === assignOpen?.name} />
              <Avatar initials={s.name.split(' ').map(p => p[0]).join('')} size="sm" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div className="body-sm">Currently: {s.teacher}</div>
              </div>
              <StatusPill status={s.status} />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ---------- Permissions ----------
function AdminPermissions() {
  return (
    <div>
      <PageHeader title="Admin Permissions" subtitle="Define what each admin role can see and do — Super Admin only"
        right={[<button key="a" className="btn btn-tenant"><Icon name="plus" size={14} /> Add role</button>]} />
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--omnic-tenant-primary-soft)', borderColor: 'var(--omnic-tenant-primary)' }}>
        <Icon name="lock" size={18} stroke="var(--omnic-tenant-primary)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Permissions</div>
          <div className="body-sm">Super Admin can toggle each capability per role. Sidebar items, table actions, and admin tools vary based on these settings.</div>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Capability</th>
              {MOCK.adminRoles.map(r => (
                <th key={r.id} style={{ textAlign: 'center' }}>
                  <div>{r.name}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', color: 'var(--omnic-gray-400)', marginTop: 2 }}>{r.count} {r.count === 1 ? 'member' : 'members'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK.permMatrix.map(p => (
              <tr key={p.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.label}</div>
                  <div className="body-sm" style={{ fontWeight: 400 }}>{p.desc}</div>
                </td>
                {MOCK.adminRoles.map(r => {
                  const v = r.perms.all || r.perms[p.key];
                  return (
                    <td key={r.id} style={{ textAlign: 'center' }}>
                      {v === true ? <Icon name="check" size={16} stroke="var(--status-active)" />
                        : v === 'view' ? <span className="pill pill-trial" style={{ fontSize: 10 }}>view only</span>
                        : <Icon name="x" size={16} stroke="var(--omnic-gray-300)" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16 }} className="body-sm">Tip: click any cell to toggle. Super Admin permissions are locked and cannot be revoked.</div>
    </div>
  );
}

// ---------- Admin Sessions (read-only, past + upcoming) ----------
function AdminSessionsView({ navigate }) {
  const [tab, setTab] = useState_A('past');
  const [horizon, setHorizon] = useState_A(7);
  const upcoming = MOCK.upcomingSessions.slice(0, horizon === 7 ? 4 : horizon === 14 ? 5 : 6);
  return (
    <div>
      <PageHeader title="Sessions" subtitle="Read-only view of all sessions across instructors" />
      <Tabs tabs={[
        { value: 'past', label: 'Past sessions', count: MOCK.recordings.length },
        { value: 'upcoming', label: 'Upcoming', count: MOCK.upcomingSessions.length },
      ]} value={tab} onChange={setTab} />
      {tab === 'past' ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Title</th><th>Instructor</th><th>Student</th><th>Date</th><th>Duration</th><th>Status</th><th>AI</th></tr></thead>
            <tbody>
              {MOCK.recordings.map(r => (
                <tr key={r.id} onClick={() => navigate('session-detail', r.id)}>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td>Mustafa Arslan</td>
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
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <FilterChips chips={[
              { value: 7, label: 'Next 7 days' }, { value: 14, label: 'Next 14 days' }, { value: 30, label: 'Next 30 days' },
            ]} value={horizon} onChange={setHorizon} />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Time</th><th>Title</th><th>Instructor</th><th>Student / enrollment</th><th>Type</th></tr></thead>
              <tbody>
                {upcoming.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.date}</td>
                    <td style={{ color: 'var(--omnic-tenant-primary)', fontWeight: 600 }}>{s.time}</td>
                    <td>{s.title}</td>
                    <td>{s.teacher}</td>
                    <td>{s.student}</td>
                    <td><span className={s.type === 'Group' ? 'pill pill-trial' : 'pill pill-new'}>{s.type}</span></td>
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

// ---------- Admin Calendar (collective + per-instructor) ----------
function AdminCalendar() {
  const [filter, setFilter] = useState_A('collective');
  const [view, setView] = useState_A('week');
  const [tab, setTab] = useState_A('calendar');
  const [policyOpen, setPolicyOpen] = useState_A(false);

  const filtered = MOCK.calendarEvents.filter(e => {
    if (filter === 'collective') return true;
    if (filter === 'global') return e.kind === 'global' || e.kind === 'offline';
    if (filter === 'mustafa') return (e.teacher || '').includes('Mustafa');
    if (filter === 'sara') return (e.teacher || '').includes('Sara');
    if (filter === 'daniel') return (e.teacher || '').includes('Daniel');
    return true;
  });

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Collective view of all instructor sessions and global events"
        right={[
          <button key="p" className="btn btn-secondary" onClick={() => setPolicyOpen(true)}><Icon name="settings" size={14} /> Scheduling policies</button>,
          <button key="g" className="btn btn-tenant"><Icon name="plus" size={14} /> New event</button>,
        ]} />

      {tab === 'calendar' && <>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm">Today</button>
            <button className="btn btn-ghost btn-sm"><Icon name="chevronLeft" size={14} /></button>
            <button className="btn btn-ghost btn-sm"><Icon name="chevronRight" size={14} /></button>
            <div className="h3" style={{ marginLeft: 8 }}>Apr 26 — May 2, 2026</div>
          </div>
          <FilterChips chips={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]} value={view} onChange={setView} />
        </div>

        {/* Instructor / scope filter */}
        <div style={{ marginBottom: 12 }}>
          <FilterChips chips={[
            { value: 'collective', label: 'Collective (all)' },
            { value: 'mustafa', label: 'Mustafa Arslan' },
            { value: 'sara', label: 'Sara Lopez' },
            { value: 'daniel', label: 'Daniel Kim' },
            { value: 'global', label: 'Global / Off-line only' },
          ]} value={filter} onChange={setFilter} />
        </div>

        <div style={{ marginBottom: 12 }}><CalendarLegend /></div>

        <WeekCalendar events={filtered} view={view === 'day' ? 'day' : 'week'} currentCol={5} />
      </>}

      {policyOpen && <SchedulingPoliciesModal onClose={() => setPolicyOpen(false)} />}
    </div>
  );
}

// Teacher's own calendar — filtered to their events only
function TeacherCalendar() {
  const [view, setView] = useState_A('week');
  const events = MOCK.calendarEvents.filter(e => (e.teacher || '').includes('Mustafa') || e.kind === 'global');
  return (
    <div>
      <PageHeader title="My Calendar" subtitle="Apr 26 — May 2, 2026"
        right={[
          <button key="s" className="btn btn-secondary"><Icon name="external" size={14} /> Sync (.ics)</button>,
          <button key="g" className="btn btn-tenant"><Icon name="plus" size={14} /> New event</button>,
        ]} />
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
        ]} value={view} onChange={setView} />
      </div>
      <div style={{ marginBottom: 12 }}><CalendarLegend /></div>
      <WeekCalendar events={events} view={view === 'day' ? 'day' : 'week'} currentCol={5} />
    </div>
  );
}

// Scheduling policies — now opens as a modal/drawer from the Calendar page
function SchedulingPoliciesModal({ onClose }) {
  const [tab, setTab] = useState_A('limits');
  return (
    <Modal open={true} title="Scheduling policies" onClose={onClose} size="lg" footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-tenant" onClick={onClose}>Save changes</button>
      </>
    }>
      <Tabs tabs={[
        { value: 'limits', label: 'Reschedule limits' },
        { value: 'noshow', label: 'No-show rules' },
        { value: 'credits', label: 'Make-up credits' },
        { value: 'duration', label: 'Lesson defaults' },
      ]} value={tab} onChange={setTab} />
      <div style={{ marginTop: 16, maxHeight: '60vh', overflowY: 'auto' }}>
        <SchedulingTabBody tab={tab} />
      </div>
    </Modal>
  );
}

// ---------- AI Manager ----------
function AdminAI() {
  const [testOpen, setTestOpen] = useState_A(false);
  const [editing, setEditing] = useState_A(null);
  const total = MOCK.aiPrompts.reduce((a, p) => a + parseFloat(p.cost.replace('$', '')), 0);

  return (
    <div>
      <PageHeader title="AI Manager" subtitle="Configure prompts, models, and parameters per generation type" />

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--omnic-tenant-primary-soft)', borderColor: 'var(--omnic-tenant-primary)' }}>
        <Icon name="dollar" size={18} stroke="var(--omnic-tenant-primary)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Estimated cost per lesson</div>
          <div className="body-sm">Soniox transcription (~3 min audio) + 4 LLM generators on a ~200-token transcript</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--omnic-tenant-primary)', fontFamily: 'ui-monospace, monospace' }}>${total.toFixed(6)}</div>
      </div>

      <div className="grid-2">
        {MOCK.aiPrompts.map(p => (
          <div key={p.id} className="card prompt-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="h3">{p.name}</div>
                <div className="body-sm" style={{ marginTop: 2 }}>{p.desc}</div>
              </div>
              <span className="pill pill-tenant">{p.format.toUpperCase()}</span>
            </div>
            <div className="prompt-meta">
              <div className="prompt-meta-item"><span className="prompt-meta-label">Model</span><span className="prompt-meta-value" style={{ fontSize: 12 }}>{p.model.split('/')[1]}</span></div>
              <div className="prompt-meta-item"><span className="prompt-meta-label">Temperature</span><span className="prompt-meta-value">{p.temperature ?? '—'}</span></div>
              <div className="prompt-meta-item"><span className="prompt-meta-label">Max tokens</span><span className="prompt-meta-value">{p.maxTokens ?? '—'}</span></div>
              <div className="prompt-meta-item"><span className="prompt-meta-label">Est. cost</span><span className="prompt-meta-value">{p.cost}</span></div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(p.id)}><Icon name="edit" size={13} /> Edit</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setTestOpen(p.id)}><Icon name="play" size={13} /> Test</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg"
        title={`Edit: ${MOCK.aiPrompts.find(p => p.id === editing)?.name || ''}`}
        footer={<><button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-tenant">Save</button></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><label className="label">Model</label><select className="select" style={{ marginTop: 4 }}><option>google/gemini-3-flash-preview</option><option>anthropic/claude-haiku-4-5</option></select></div>
          <div><label className="label">Output format</label><select className="select" style={{ marginTop: 4 }}><option>text</option><option>json</option></select></div>
          <div><label className="label">Temperature</label><input className="input" type="number" defaultValue="0.3" step="0.1" style={{ marginTop: 4 }} /></div>
          <div><label className="label">Max tokens</label><input className="input" type="number" defaultValue="500" style={{ marginTop: 4 }} /></div>
        </div>
        <label className="label">Prompt template</label>
        <textarea className="textarea" rows={8} style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          defaultValue={`You are an English language teacher. Summarize the following lesson transcript in 2-3 paragraphs, highlighting key vocabulary and concepts taught.\n\nTranscript:\n{{transcript}}\n\nSummary:`} />
      </Modal>

      <Modal open={!!testOpen} onClose={() => setTestOpen(false)} size="lg" title="Test prompt"
        footer={<><button className="btn btn-secondary" onClick={() => setTestOpen(false)}>Close</button><button className="btn btn-tenant"><Icon name="zap" size={14} /> Run</button></>}>
        <label className="label">Sample transcript</label>
        <textarea className="textarea" rows={4} style={{ marginTop: 4 }} defaultValue="Today we'll work on phrasal verbs related to daily routines. Let's start with 'wind down'..." />
        <label className="label" style={{ marginTop: 12, display: 'block' }}>Output</label>
        <div style={{ marginTop: 4, padding: 12, background: 'var(--omnic-gray-50)', borderRadius: 6, fontSize: 13, color: 'var(--omnic-gray-600)', fontFamily: 'ui-monospace, monospace' }}>
          (Click Run to test)
        </div>
      </Modal>
    </div>
  );
}

// ---------- Achievements settings ----------
function AdminAchievements() {
  return (
    <div>
      <PageHeader title="Achievement Manager" subtitle="Define unlock conditions and rewards"
        right={[<button key="a" className="btn btn-tenant"><Icon name="plus" size={14} /> Add achievement</button>]} />
      <div className="grid-2">
        {MOCK.achievementDefs.map(a => (
          <div key={a.id} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div className="h3">{a.name}</div>
              <span className="pill pill-tenant">{a.unlockedBy} unlocked</span>
            </div>
            <div className="body-sm" style={{ marginBottom: 12 }}>{a.desc}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><div className="prompt-meta-label">Condition</div><div style={{ fontSize: 12, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{a.condition}</div></div>
              <div><div className="prompt-meta-label">Threshold</div><div style={{ fontSize: 13, marginTop: 2, fontWeight: 600 }}>{a.threshold}</div></div>
              <div><div className="prompt-meta-label">Reward</div><div style={{ fontSize: 13, marginTop: 2 }}>{a.reward}</div></div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm"><Icon name="edit" size={13} /> Edit</button>
              <button className="btn btn-ghost btn-sm"><Icon name="trash" size={13} /> Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Scheduling policies — body shared between modal & full page ----------
function Toggle({ on, defaultOn }) {
  const [v, setV] = useState_A(on != null ? on : defaultOn);
  return (
    <button onClick={() => setV(!v)} style={{
      width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer',
      background: v ? 'var(--omnic-tenant-primary)' : 'var(--omnic-gray-300)',
      position: 'relative', transition: 'background 0.15s ease', flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: v ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.15s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}></span>
    </button>
  );
}

function SchedulingTabBody({ tab }) {
  return (
    <>
      {tab === 'limits' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Reschedule cutoff</div>
                <div className="body-sm">Students cannot reschedule a class once this many hours remain before start time.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="input" type="number" defaultValue="6" style={{ width: 80 }} />
                <span className="muted">hours</span>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Cancel cutoff</div>
                <div className="body-sm">Cutoff for full cancellation. After this, the class is billable.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="input" type="number" defaultValue="24" style={{ width: 80 }} />
                <span className="muted">hours</span>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Max reschedules per package</div>
                <div className="body-sm">Hard cap on how many times a student can reschedule across one package / subscription cycle.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="input" type="number" defaultValue="3" style={{ width: 80 }} />
                <span className="muted">times</span>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Block back-to-back reschedules</div>
                <div className="body-sm">Prevent students from rescheduling the same class twice in a row.</div>
              </div>
              <Toggle on />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-tenant">Save changes</button>
            <button className="btn btn-secondary">Reset to defaults</button>
          </div>
        </div>
      )}

      {tab === 'noshow' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 4 }}>What counts as a no-show?</div>
            <div className="body-sm" style={{ marginBottom: 14 }}>The system marks the class as no-show if the student doesn't connect within this window.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted">After</span>
              <input className="input" type="number" defaultValue="10" style={{ width: 70 }} />
              <span className="muted">minutes past start</span>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Billing on no-show</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { id: 'full', label: 'Charge full lesson', desc: 'Class deducted from package; teacher paid in full.', def: true },
                { id: 'half', label: 'Charge half lesson', desc: 'Half deducted; teacher paid in full.' },
                { id: 'none', label: 'No charge', desc: 'Class returned to package; teacher paid a flat no-show fee.' },
              ].map(opt => (
                <label key={opt.id} style={{ display: 'flex', gap: 10, padding: 10, border: '1px solid var(--omnic-gray-200)', borderRadius: 8, cursor: 'pointer', background: opt.def ? 'var(--omnic-tenant-primary-soft)' : 'white', borderColor: opt.def ? 'var(--omnic-tenant-primary)' : 'var(--omnic-gray-200)' }}>
                  <input type="radio" name="noshow" defaultChecked={opt.def} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--omnic-gray-900)' }}>{opt.label}</div>
                    <div className="body-sm">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Auto-suspend after N no-shows</div>
                <div className="body-sm">Pause the student's account and notify admin if they no-show this many times in 30 days.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="input" type="number" defaultValue="3" style={{ width: 80 }} />
                <span className="muted">in 30d</span>
              </div>
            </div>
          </div>
          <button className="btn btn-tenant" style={{ alignSelf: 'flex-start' }}>Save changes</button>
        </div>
      )}

      {tab === 'credits' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 20, background: 'var(--omnic-tenant-bg-soft, #FEF3C7)', border: '1px solid var(--omnic-tenant-primary)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="info" size={18} stroke="var(--omnic-tenant-primary)" />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--omnic-gray-900)', marginBottom: 4 }}>What's a make-up credit?</div>
                <div className="body-sm">When a class is cancelled by the school, instructor, or qualifies for refund, students get a <b>make-up credit</b> they can redeem for a future lesson. Credits show up in the student's profile and on the Calendar.</div>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Auto-grant credit when…</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Instructor cancels the class', def: true },
                { label: 'Admin cancels (school holiday, outage)', def: true },
                { label: 'Technical failure during live session', def: true },
                { label: 'Student cancels within reschedule window', def: false },
                { label: 'Student no-show (per no-show rule)', def: false },
              ].map((opt, i) => (
                <label key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--omnic-gray-200)', borderRadius: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--omnic-gray-900)' }}>{opt.label}</span>
                  <Toggle on={opt.def} />
                </label>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Credit expiration</div>
                <div className="body-sm">Credits expire if not redeemed within this many days.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="input" type="number" defaultValue="60" style={{ width: 80 }} />
                <span className="muted">days</span>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="h3">Max credits per student</div>
                <div className="body-sm">Cap to prevent credit hoarding. New cancellations beyond this won't grant credit.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="input" type="number" defaultValue="5" style={{ width: 80 }} />
                <span className="muted">credits</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--omnic-gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="h3">Active credits</div>
                <div className="body-sm">12 students hold a total of 18 unredeemed credits</div>
              </div>
              <button className="btn btn-secondary btn-sm">Export CSV</button>
            </div>
            <table className="table">
              <thead><tr><th>Student</th><th>Credits</th><th>Reason</th><th>Granted</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {[
                  ['Amira Hassan', 2, 'Instructor cancelled', 'Apr 22', 'Jun 21'],
                  ['Diego Ruiz', 1, 'Tech failure', 'Apr 18', 'Jun 17'],
                  ['Yuki Tanaka', 3, 'School holiday', 'Apr 10', 'Jun 09'],
                  ['Lucia Conti', 1, 'Instructor cancelled', 'Mar 30', 'May 29'],
                ].map(([name, n, reason, granted, exp], i) => (
                  <tr key={i}>
                    <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar name={name} size={28} /><b>{name}</b></div></td>
                    <td><span className="pill pill-tenant">{n}</span></td>
                    <td className="muted">{reason}</td>
                    <td className="muted">{granted}</td>
                    <td className="muted">{exp}</td>
                    <td><button className="btn btn-ghost btn-sm">Adjust</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-tenant" style={{ alignSelf: 'flex-start' }}>Save policy changes</button>
        </div>
      )}

      {tab === 'duration' && (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 4 }}>Default lesson duration</div>
            <div className="body-sm" style={{ marginBottom: 12 }}>Used when creating new lessons or recurring classes.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="input" type="number" defaultValue="60" style={{ width: 80 }} />
              <span className="muted">minutes</span>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 4 }}>Buffer between lessons</div>
            <div className="body-sm" style={{ marginBottom: 12 }}>Block time after each lesson so instructors aren't booked back-to-back.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="input" type="number" defaultValue="10" style={{ width: 80 }} />
              <span className="muted">minutes</span>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 4 }}>Booking horizon</div>
            <div className="body-sm" style={{ marginBottom: 12 }}>How far in advance students can book.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="input" type="number" defaultValue="30" style={{ width: 80 }} />
              <span className="muted">days ahead</span>
            </div>
          </div>
          <button className="btn btn-tenant" style={{ alignSelf: 'flex-start' }}>Save changes</button>
        </div>
      )}
    </>
  );
}
  const [v, setV] = useState_A(on != null ? on : defaultOn);
  return (
    <button onClick={() => setV(!v)} style={{
      width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer',
      background: v ? 'var(--omnic-tenant-primary)' : 'var(--omnic-gray-300)',
      position: 'relative', transition: 'background 0.15s ease', flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: v ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.15s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}></span>
    </button>
  );
}

// ---------- Branding ----------
function AdminBranding({ tenantColor, setTenantColor }) {
  const [name, setName] = useState_A(MOCK.tenant.name);
  return (
    <div>
      <PageHeader title="Branding" subtitle="Customize how Omnic looks for your tenant" />
      <div className="split-2-1">
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="h3" style={{ marginBottom: 14 }}>Identity</div>
            <label className="label">Tenant name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} style={{ marginTop: 4, marginBottom: 14 }} />
            <label className="label">Primary color</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {['#16A34A', '#DC2626', '#2563EB', '#9333EA', '#EA580C', '#0891B2', '#DB2777'].map(c => (
                <button key={c} onClick={() => setTenantColor(c)}
                  style={{ width: 36, height: 36, borderRadius: 8, background: c, border: tenantColor === c ? '3px solid white' : '1px solid var(--omnic-gray-200)', boxShadow: tenantColor === c ? `0 0 0 2px ${c}` : 'none', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="h3" style={{ marginBottom: 14 }}>Logo</div>
            <div style={{ padding: 32, border: '2px dashed var(--omnic-gray-200)', borderRadius: 8, textAlign: 'center', color: 'var(--omnic-gray-500)' }}>
              <Icon name="upload" size={24} /><div style={{ marginTop: 8, fontSize: 13 }}>Drop logo here or browse</div>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 14 }}>Feature toggles</div>
            {[
              { label: 'Gamification', desc: 'Streaks, achievements, flashcards' },
              { label: 'Achievements', desc: 'Show unlock progress to students' },
              { label: 'Calendar sync', desc: 'Allow students to sync to Google/Apple Calendar' },
            ].map((t, i) => (
              <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < 2 ? '1px solid var(--omnic-gray-100)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.label}</div>
                  <div className="body-sm">{t.desc}</div>
                </div>
                <Toggle defaultOn={t.label !== 'Calendar sync'} />
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 20, position: 'sticky', top: 84 }}>
          <div className="label" style={{ marginBottom: 10 }}>Live preview</div>
          <div style={{ border: '1px solid var(--omnic-gray-100)', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
            <div style={{ height: 8, background: tenantColor }}></div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--omnic-red)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>O</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: tenantColor }}>{name}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 6, background: tenantColor + '15', color: tenantColor, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Home</div>
              <div style={{ padding: 8, fontSize: 13, color: 'var(--omnic-gray-600)' }}>Sessions</div>
              <div style={{ padding: 8, fontSize: 13, color: 'var(--omnic-gray-600)' }}>Students</div>
              <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--omnic-gray-100)', borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: tenantColor }}>142</div>
                <div style={{ fontSize: 11, color: 'var(--omnic-gray-500)' }}>Students</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminBilling() {
  const [tab, setTab] = useState_A('invoices');
  return (
    <div>
      <PageHeader title="Billing" subtitle="Invoices, subscriptions, and payments"
        right={[<button key="d" className="btn btn-secondary"><Icon name="external" size={14} /> Open in Desk</button>]} />
      <Tabs tabs={[
        { value: 'invoices', label: 'Invoices' },
        { value: 'subs', label: 'Subscriptions' },
        { value: 'payments', label: 'Payments' },
      ]} value={tab} onChange={setTab} />
      {tab === 'invoices' && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Invoice</th><th>Student</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {MOCK.invoices.map(i => (
                <tr key={i.id}>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{i.id}</td>
                  <td>{i.student}</td>
                  <td style={{ fontWeight: 600 }}>{i.amount}</td>
                  <td><StatusPill status={i.status} /></td>
                  <td className="muted">{i.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'subs' && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Student</th><th>Plan</th><th>Sessions</th><th>Status</th></tr></thead>
            <tbody>
              {MOCK.studentRoster.filter(s => s.status !== 'Cancelled').map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.plan}</td>
                  <td>{s.sessionsLeft} / {s.sessionsTotal}</td>
                  <td><StatusPill status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'payments' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <Icon name="dollar" size={28} stroke="var(--omnic-gray-300)" />
          <div className="h3" style={{ marginTop: 12 }}>Payment history</div>
          <div className="body-sm" style={{ marginTop: 4 }}>From the billing service · 47 entries this month</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  AdminDashboard, AdminStudents, AdminInstructors, AdminPermissions, AdminSessionsView, AdminCalendar, TeacherCalendar,
  AdminAI, AdminAchievements, AdminBranding, AdminBilling,
});
