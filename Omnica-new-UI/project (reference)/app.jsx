// Main app shell + router + Tweaks
const { useState: useS, useEffect: useE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "role": "student",
  "tenantColor": "#5B21B6",
  "tenantBg": "#FCD34D",
  "tenantName": "Omnica English",
  "uiLanguage": "en",
  "gamificationEnabled": true,
  "showSessionStartModal": false
}/*EDITMODE-END*/;

function OmnicLogo2({ tenantName }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="logo-mark.svg" width="34" height="34" style={{ flexShrink: 0, objectFit: 'contain', borderRadius: 6 }} aria-hidden="true" alt="" />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span style={{ fontFamily: 'Georgia, "Plantagenet Cherokee", serif', fontSize: 17, fontWeight: 700, color: '#FFCA00', letterSpacing: '-0.01em' }}>Omnica</span>
        <span style={{ fontFamily: 'Georgia, "Plantagenet Cherokee", serif', fontSize: 11, color: 'rgba(255,202,0,0.65)', letterSpacing: '0.02em', marginTop: 2 }}>.english</span>
      </div>
    </div>
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useS('home');
  const [routeParam, setRouteParam] = useS(null);
  const [sessionModalOpen, setSessionModalOpen] = useS(false);
  const [recording, setRecording] = useS(false);
  const [toast, setToast] = useS('');

  // Apply tenant color
  useE(() => {
    const c = tweaks.tenantColor;
    document.documentElement.style.setProperty('--omnic-tenant-primary', c);
    document.documentElement.style.setProperty('--omnic-tenant-primary-hover', shade(c, -10));
    document.documentElement.style.setProperty('--omnic-tenant-primary-soft', hexA(c, 0.08));
    document.documentElement.style.setProperty('--omnic-tenant-primary-mid', hexA(c, 0.18));
    if (tweaks.tenantBg) {
      document.documentElement.style.setProperty('--omnic-tenant-bg', tweaks.tenantBg);
    }
  }, [tweaks.tenantColor, tweaks.tenantBg]);

  // Reset to home when role changes
  useE(() => { setRoute('home'); setRouteParam(null); setRecording(false); }, [tweaks.role]);

  const navigate = (r, param) => { setRoute(r); setRouteParam(param ?? null); window.scrollTo(0, 0); };

  const startSession = (mode, classId) => {
    setSessionModalOpen(false);
    if (mode === 'live') { setRecording(true); }
    else { setToast('Recording uploaded. Transcription started.'); }
  };

  const stopRecording = () => {
    setRecording(false);
    setToast('Recording saved. AI generation can be started.');
    setRoute('session-detail');
    setRouteParam(1);
  };

  const role = tweaks.role;
  const sidebar = role === 'student' ? <StudentSidebar route={route} navigate={navigate} gamification={tweaks.gamificationEnabled} />
    : role === 'teacher' ? <TeacherSidebar route={route} navigate={navigate} />
    : <AdminSidebar route={route} navigate={navigate} />;

  let content;
  if (recording) {
    content = <TeacherTranscribe navigate={navigate} onStop={stopRecording} />;
  } else if (role === 'student') {
    content = route === 'home' ? <StudentDashboard navigate={navigate} />
      : route === 'lessons' ? <StudentLessons navigate={navigate} />
      : route === 'lesson-detail' ? <StudentLessonDetail navigate={navigate} lessonId={routeParam} />
      : route === 'library' ? <StudentLibrary />
      : route === 'study' ? <StudentStudy navigate={navigate} />
      : route === 'vocabulary' ? <StudentVocabulary />
      : route === 'calendar' ? <StudentCalendar />
      : route === 'achievements' ? <StudentAchievements />
      : route === 'profile' ? <StudentProfile />
      : <StudentDashboard navigate={navigate} />;
  } else if (role === 'teacher') {
    content = route === 'home' ? <TeacherDashboard navigate={navigate} openSessionStart={() => setSessionModalOpen(true)} />
      : route === 'sessions' ? <TeacherSessions navigate={navigate} openSessionStart={() => setSessionModalOpen(true)} />
      : route === 'session-detail' ? <TeacherSessionDetail navigate={navigate} sessionId={routeParam} />
      : route === 'library' ? <TeacherLibrary />
      : route === 'students' ? <TeacherStudents />
      : route === 'calendar' ? <TeacherCalendar />
      : route === 'reports' ? <TeacherReports />
      : <TeacherDashboard navigate={navigate} openSessionStart={() => setSessionModalOpen(true)} />;
  } else {
    content = route === 'home' ? <AdminDashboard navigate={navigate} />
      : route === 'students' ? <AdminStudents />
      : route === 'instructors' ? <AdminInstructors navigate={navigate} />
      : route === 'permissions' ? <AdminPermissions />
      : route === 'sessions' ? <AdminSessionsView navigate={navigate} />
      : route === 'session-detail' ? <TeacherSessionDetail navigate={navigate} sessionId={routeParam} />
      : route === 'calendar' ? <AdminCalendar />
      : route === 'library' ? <AdminLibrary />
      : route === 'billing' ? <AdminBilling />
      : route === 'ai' ? <AdminAI />
      : route === 'achievements-settings' ? <AdminAchievements />
      : route === 'branding' ? <AdminBranding tenantColor={tweaks.tenantColor} setTenantColor={c => setTweak('tenantColor', c)} />
      : <AdminDashboard navigate={navigate} />;
  }

  const profile = role === 'student' ? MOCK.student : role === 'teacher' ? MOCK.teacher : MOCK.admin;

  return (
    <>
      <div className="app-shell">
        {!recording && <aside className="sidebar">
          <div className="sidebar-logo"><OmnicLogo2 tenantName={tweaks.tenantName} /></div>
          <nav className="sidebar-nav">{sidebar}</nav>
          <div className="sidebar-footer">
            <button className="profile-btn" style={{ width: '100%' }}>
              <Avatar initials={profile.initials} size="sm" />
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--omnic-gray-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.fullName}</div>
                <div style={{ fontSize: 11, color: 'var(--omnic-gray-500)', textTransform: 'capitalize' }}>{role}</div>
              </div>
              <Icon name="chevronRight" size={14} stroke="rgba(255,255,255,0.4)" />
            </button>
          </div>
        </aside>}
        <main className="main">
          {!recording && (
            <div className="topbar" data-screen-label={`${role} · ${route}`}>
              <div style={{ fontSize: 14, color: 'var(--omnic-gray-500)' }}>
                <span style={{ color: 'var(--omnic-gray-700)', fontWeight: 500, textTransform: 'capitalize' }}>{role}</span>
                <span style={{ margin: '0 8px' }}>/</span>
                <span style={{ color: 'var(--omnic-gray-900)', fontWeight: 500, textTransform: 'capitalize' }}>{route.replace('-', ' ')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pill pill-tenant" style={{ fontSize: 11 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-purple)' }}></span>
                  {tweaks.tenantName.toLowerCase().replace(/\s+/g, '-')}.omnica.com
                </span>
                <LanguageSwitcher value={tweaks.uiLanguage} onChange={v => setTweak('uiLanguage', v)} />
                <button className="btn-ghost" style={{ padding: 8, borderRadius: 6, position: 'relative' }}>
                  <Icon name="bell" size={18} stroke="var(--omnic-gray-600)" />
                  <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--omnic-red)' }}></span>
                </button>
              </div>
            </div>
          )}
          <div className="content">{content}</div>
        </main>
      </div>

      <SessionStartModal open={sessionModalOpen} onClose={() => setSessionModalOpen(false)} onStart={startSession} />
      <Toast message={toast} onClose={() => setToast('')} />

      <TweaksPanel title="Omnic Tweaks">
        <TweakSection title="Role">
          <TweakRadio label="View as" value={tweaks.role} onChange={v => setTweak('role', v)}
            options={[{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'admin', label: 'Admin' }]} />
        </TweakSection>
        <TweakSection title="Tenant branding">
          <TweakColor label="Primary color" value={tweaks.tenantColor} onChange={v => setTweak('tenantColor', v)} />
          <TweakText label="Tenant name" value={tweaks.tenantName} onChange={v => setTweak('tenantName', v)} />
        </TweakSection>
        <TweakSection title="Features">
          <TweakToggle label="Gamification" value={tweaks.gamificationEnabled} onChange={v => setTweak('gamificationEnabled', v)} />
        </TweakSection>
        <TweakSection title="Try a flow">
          <TweakButton label="Open 'Start Session' flow" onClick={() => { setTweak('role', 'teacher'); setTimeout(() => setSessionModalOpen(true), 100); }} />
          <TweakButton label="Jump to Live Recording" onClick={() => { setTweak('role', 'teacher'); setRecording(true); }} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// ---------- Sidebars ----------
function StudentSidebar({ route, navigate, gamification }) {
  return (
    <>
      <SidebarItem icon="home" label="Home" active={route === 'home'} onClick={() => navigate('home')} />
      <SidebarItem icon="book" label="My Lessons" active={route === 'lessons' || route === 'lesson-detail'} onClick={() => navigate('lessons')} />
      <SidebarItem icon="layers" label="Library" active={route === 'library'} onClick={() => navigate('library')} />
      {gamification && <SidebarItem icon="brain" label="Study" active={route === 'study'} badge={MOCK.dueCards} onClick={() => navigate('study')} />}
      {gamification && <SidebarItem icon="bookmark" label="My Words" active={route === 'vocabulary'} onClick={() => navigate('vocabulary')} />}
      <SidebarItem icon="calendar" label="Calendar" active={route === 'calendar'} onClick={() => navigate('calendar')} />
      {gamification && <SidebarItem icon="trophy" label="Achievements" active={route === 'achievements'} onClick={() => navigate('achievements')} />}
      <div style={{ height: 16 }} />
      <SidebarItem icon="user" label="Profile" active={route === 'profile'} onClick={() => navigate('profile')} />
    </>
  );
}

function TeacherSidebar({ route, navigate }) {
  return (
    <>
      <SidebarItem icon="home" label="Home" active={route === 'home'} onClick={() => navigate('home')} />
      <SidebarItem icon="video" label="Sessions" active={route === 'sessions' || route === 'session-detail'} badge={3} onClick={() => navigate('sessions')} />
      <SidebarItem icon="layers" label="Library" active={route === 'library'} onClick={() => navigate('library')} />
      <SidebarItem icon="users" label="Students" active={route === 'students'} onClick={() => navigate('students')} />
      <SidebarItem icon="calendar" label="Calendar" active={route === 'calendar'} onClick={() => navigate('calendar')} />
      <SidebarItem icon="chart" label="Reports" active={route === 'reports'} onClick={() => navigate('reports')} />
    </>
  );
}

function AdminSidebar({ route, navigate }) {
  return (
    <>
      <SidebarItem icon="home" label="Dashboard" active={route === 'home'} onClick={() => navigate('home')} />
      <SidebarSection label="People">
        <SidebarItem label="Students" active={route === 'students'} badge={MOCK.studentRoster.length} onClick={() => navigate('students')} indent />
        <SidebarItem label="Instructors" active={route === 'instructors'} badge={MOCK.instructors.length} onClick={() => navigate('instructors')} indent />
        <SidebarItem label="Permissions" active={route === 'permissions'} onClick={() => navigate('permissions')} indent />
      </SidebarSection>
      <SidebarItem icon="video" label="Sessions" active={route === 'sessions' || route === 'session-detail'} onClick={() => navigate('sessions')} />
      <SidebarItem icon="layers" label="Library" active={route === 'library'} onClick={() => navigate('library')} />
      <SidebarItem icon="calendar" label="Calendar" active={route === 'calendar'} onClick={() => navigate('calendar')} />
      <SidebarItem icon="dollar" label="Billing" active={route === 'billing'} onClick={() => navigate('billing')} />
      <SidebarSection label="Settings">
        <SidebarItem label="AI Manager" active={route === 'ai'} onClick={() => navigate('ai')} indent />
        <SidebarItem label="Achievements" active={route === 'achievements-settings'} onClick={() => navigate('achievements-settings')} indent />
        <SidebarItem label="Branding" active={route === 'branding'} onClick={() => navigate('branding')} indent />
      </SidebarSection>
    </>
  );
}

// ---------- Color helpers ----------
function shade(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + Math.floor(255 * percent / 100)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.floor(255 * percent / 100)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.floor(255 * percent / 100)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
