"use strict";

function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
// Main app shell + router + Tweaks
var _React = React,
  useS = _React.useState,
  useE = _React.useEffect;
var TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "role": "student",
  "tenantColor": "#5B21B6",
  "tenantBg": "#FCD34D",
  "tenantName": "Omnica English",
  "uiLanguage": "en",
  "gamificationEnabled": true,
  "showSessionStartModal": false
} /*EDITMODE-END*/;
function OmnicLogo2(_ref) {
  var tenantName = _ref.tenantName;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "logo-mark.svg",
    width: "34",
    height: "34",
    style: {
      flexShrink: 0,
      objectFit: 'contain'
    },
    "aria-hidden": "true",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.05
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Georgia, "Plantagenet Cherokee", serif',
      fontSize: 17,
      fontWeight: 700,
      color: 'var(--brand-purple)',
      letterSpacing: '-0.01em'
    }
  }, "Omnica"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Georgia, "Plantagenet Cherokee", serif',
      fontSize: 11,
      color: 'var(--brand-purple)',
      opacity: 0.7,
      letterSpacing: '0.02em',
      marginTop: 2
    }
  }, ".english")));
}
function App() {
  var _useTweaks = useTweaks(TWEAK_DEFAULTS),
    _useTweaks2 = _slicedToArray(_useTweaks, 2),
    tweaks = _useTweaks2[0],
    setTweak = _useTweaks2[1];
  var _useS = useS('home'),
    _useS2 = _slicedToArray(_useS, 2),
    route = _useS2[0],
    setRoute = _useS2[1];
  var _useS3 = useS(null),
    _useS4 = _slicedToArray(_useS3, 2),
    routeParam = _useS4[0],
    setRouteParam = _useS4[1];
  var _useS5 = useS(false),
    _useS6 = _slicedToArray(_useS5, 2),
    sessionModalOpen = _useS6[0],
    setSessionModalOpen = _useS6[1];
  var _useS7 = useS(false),
    _useS8 = _slicedToArray(_useS7, 2),
    recording = _useS8[0],
    setRecording = _useS8[1];
  var _useS9 = useS(''),
    _useS0 = _slicedToArray(_useS9, 2),
    toast = _useS0[0],
    setToast = _useS0[1];

  // Apply tenant color
  useE(function () {
    var c = tweaks.tenantColor;
    document.documentElement.style.setProperty('--omnic-tenant-primary', c);
    document.documentElement.style.setProperty('--omnic-tenant-primary-hover', shade(c, -10));
    document.documentElement.style.setProperty('--omnic-tenant-primary-soft', hexA(c, 0.08));
    document.documentElement.style.setProperty('--omnic-tenant-primary-mid', hexA(c, 0.18));
    if (tweaks.tenantBg) {
      document.documentElement.style.setProperty('--omnic-tenant-bg', tweaks.tenantBg);
    }
  }, [tweaks.tenantColor, tweaks.tenantBg]);

  // Reset to home when role changes
  useE(function () {
    setRoute('home');
    setRouteParam(null);
    setRecording(false);
  }, [tweaks.role]);
  var navigate = function navigate(r, param) {
    setRoute(r);
    setRouteParam(param !== null && param !== void 0 ? param : null);
    window.scrollTo(0, 0);
  };
  var startSession = function startSession(mode, classId) {
    setSessionModalOpen(false);
    if (mode === 'live') {
      setRecording(true);
    } else {
      setToast('Recording uploaded. Transcription started.');
    }
  };
  var stopRecording = function stopRecording() {
    setRecording(false);
    setToast('Recording saved. AI generation can be started.');
    setRoute('session-detail');
    setRouteParam(1);
  };
  var role = tweaks.role;
  var sidebar = role === 'student' ? /*#__PURE__*/React.createElement(StudentSidebar, {
    route: route,
    navigate: navigate,
    gamification: tweaks.gamificationEnabled
  }) : role === 'teacher' ? /*#__PURE__*/React.createElement(TeacherSidebar, {
    route: route,
    navigate: navigate
  }) : /*#__PURE__*/React.createElement(AdminSidebar, {
    route: route,
    navigate: navigate
  });
  var content;
  if (recording) {
    content = /*#__PURE__*/React.createElement(TeacherTranscribe, {
      navigate: navigate,
      onStop: stopRecording
    });
  } else if (role === 'student') {
    content = route === 'home' ? /*#__PURE__*/React.createElement(StudentDashboard, {
      navigate: navigate
    }) : route === 'lessons' ? /*#__PURE__*/React.createElement(StudentLessons, {
      navigate: navigate
    }) : route === 'lesson-detail' ? /*#__PURE__*/React.createElement(StudentLessonDetail, {
      navigate: navigate,
      lessonId: routeParam
    }) : route === 'library' ? /*#__PURE__*/React.createElement(StudentLibrary, null) : route === 'study' ? /*#__PURE__*/React.createElement(StudentStudy, {
      navigate: navigate
    }) : route === 'vocabulary' ? /*#__PURE__*/React.createElement(StudentVocabulary, null) : route === 'calendar' ? /*#__PURE__*/React.createElement(StudentCalendar, null) : route === 'achievements' ? /*#__PURE__*/React.createElement(StudentAchievements, null) : route === 'profile' ? /*#__PURE__*/React.createElement(StudentProfile, null) : /*#__PURE__*/React.createElement(StudentDashboard, {
      navigate: navigate
    });
  } else if (role === 'teacher') {
    content = route === 'home' ? /*#__PURE__*/React.createElement(TeacherDashboard, {
      navigate: navigate,
      openSessionStart: function openSessionStart() {
        return setSessionModalOpen(true);
      }
    }) : route === 'sessions' ? /*#__PURE__*/React.createElement(TeacherSessions, {
      navigate: navigate,
      openSessionStart: function openSessionStart() {
        return setSessionModalOpen(true);
      }
    }) : route === 'session-detail' ? /*#__PURE__*/React.createElement(TeacherSessionDetail, {
      navigate: navigate,
      sessionId: routeParam
    }) : route === 'library' ? /*#__PURE__*/React.createElement(TeacherLibrary, null) : route === 'students' ? /*#__PURE__*/React.createElement(TeacherStudents, null) : route === 'calendar' ? /*#__PURE__*/React.createElement(TeacherCalendar, null) : route === 'reports' ? /*#__PURE__*/React.createElement(TeacherReports, null) : /*#__PURE__*/React.createElement(TeacherDashboard, {
      navigate: navigate,
      openSessionStart: function openSessionStart() {
        return setSessionModalOpen(true);
      }
    });
  } else {
    content = route === 'home' ? /*#__PURE__*/React.createElement(AdminDashboard, {
      navigate: navigate
    }) : route === 'students' ? /*#__PURE__*/React.createElement(AdminStudents, null) : route === 'instructors' ? /*#__PURE__*/React.createElement(AdminInstructors, {
      navigate: navigate
    }) : route === 'permissions' ? /*#__PURE__*/React.createElement(AdminPermissions, null) : route === 'sessions' ? /*#__PURE__*/React.createElement(AdminSessionsView, {
      navigate: navigate
    }) : route === 'session-detail' ? /*#__PURE__*/React.createElement(TeacherSessionDetail, {
      navigate: navigate,
      sessionId: routeParam
    }) : route === 'calendar' ? /*#__PURE__*/React.createElement(AdminCalendar, null) : route === 'library' ? /*#__PURE__*/React.createElement(AdminLibrary, null) : route === 'billing' ? /*#__PURE__*/React.createElement(AdminBilling, null) : route === 'ai' ? /*#__PURE__*/React.createElement(AdminAI, null) : route === 'achievements-settings' ? /*#__PURE__*/React.createElement(AdminAchievements, null) : route === 'branding' ? /*#__PURE__*/React.createElement(AdminBranding, {
      tenantColor: tweaks.tenantColor,
      setTenantColor: function setTenantColor(c) {
        return setTweak('tenantColor', c);
      }
    }) : /*#__PURE__*/React.createElement(AdminDashboard, {
      navigate: navigate
    });
  }
  var profile = role === 'student' ? MOCK.student : role === 'teacher' ? MOCK.teacher : MOCK.admin;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, !recording && /*#__PURE__*/React.createElement("aside", {
    className: "sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sidebar-logo"
  }, /*#__PURE__*/React.createElement(OmnicLogo2, {
    tenantName: tweaks.tenantName
  })), /*#__PURE__*/React.createElement("nav", {
    className: "sidebar-nav"
  }, sidebar), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "profile-btn",
    style: {
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    initials: profile.initials,
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'left',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--omnic-gray-900)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, profile.fullName), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--omnic-gray-500)',
      textTransform: 'capitalize'
    }
  }, role)), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronRight",
    size: 14,
    stroke: "var(--omnic-gray-400)"
  })))), /*#__PURE__*/React.createElement("main", {
    className: "main"
  }, !recording && /*#__PURE__*/React.createElement("div", {
    className: "topbar",
    "data-screen-label": "".concat(role, " \xB7 ").concat(route)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: 'var(--omnic-gray-500)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--omnic-gray-700)',
      fontWeight: 500,
      textTransform: 'capitalize'
    }
  }, role), /*#__PURE__*/React.createElement("span", {
    style: {
      margin: '0 8px'
    }
  }, "/"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--omnic-gray-900)',
      fontWeight: 500,
      textTransform: 'capitalize'
    }
  }, route.replace('-', ' '))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill pill-tenant",
    style: {
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--brand-purple)'
    }
  }), tweaks.tenantName.toLowerCase().replace(/\s+/g, '-'), ".omnica.com"), /*#__PURE__*/React.createElement(LanguageSwitcher, {
    value: tweaks.uiLanguage,
    onChange: function onChange(v) {
      return setTweak('uiLanguage', v);
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn-ghost",
    style: {
      padding: 8,
      borderRadius: 6,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 18,
    stroke: "var(--omnic-gray-600)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--omnic-red)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, content))), /*#__PURE__*/React.createElement(SessionStartModal, {
    open: sessionModalOpen,
    onClose: function onClose() {
      return setSessionModalOpen(false);
    },
    onStart: startSession
  }), /*#__PURE__*/React.createElement(Toast, {
    message: toast,
    onClose: function onClose() {
      return setToast('');
    }
  }), /*#__PURE__*/React.createElement(TweaksPanel, {
    title: "Omnic Tweaks"
  }, /*#__PURE__*/React.createElement(TweakSection, {
    title: "Role"
  }, /*#__PURE__*/React.createElement(TweakRadio, {
    label: "View as",
    value: tweaks.role,
    onChange: function onChange(v) {
      return setTweak('role', v);
    },
    options: [{
      value: 'student',
      label: 'Student'
    }, {
      value: 'teacher',
      label: 'Teacher'
    }, {
      value: 'admin',
      label: 'Admin'
    }]
  })), /*#__PURE__*/React.createElement(TweakSection, {
    title: "Tenant branding"
  }, /*#__PURE__*/React.createElement(TweakColor, {
    label: "Primary color",
    value: tweaks.tenantColor,
    onChange: function onChange(v) {
      return setTweak('tenantColor', v);
    }
  }), /*#__PURE__*/React.createElement(TweakText, {
    label: "Tenant name",
    value: tweaks.tenantName,
    onChange: function onChange(v) {
      return setTweak('tenantName', v);
    }
  })), /*#__PURE__*/React.createElement(TweakSection, {
    title: "Features"
  }, /*#__PURE__*/React.createElement(TweakToggle, {
    label: "Gamification",
    value: tweaks.gamificationEnabled,
    onChange: function onChange(v) {
      return setTweak('gamificationEnabled', v);
    }
  })), /*#__PURE__*/React.createElement(TweakSection, {
    title: "Try a flow"
  }, /*#__PURE__*/React.createElement(TweakButton, {
    label: "Open 'Start Session' flow",
    onClick: function onClick() {
      setTweak('role', 'teacher');
      setTimeout(function () {
        return setSessionModalOpen(true);
      }, 100);
    }
  }), /*#__PURE__*/React.createElement(TweakButton, {
    label: "Jump to Live Recording",
    onClick: function onClick() {
      setTweak('role', 'teacher');
      setRecording(true);
    }
  }))));
}

// ---------- Sidebars ----------
function StudentSidebar(_ref2) {
  var route = _ref2.route,
    navigate = _ref2.navigate,
    gamification = _ref2.gamification;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "home",
    label: "Home",
    active: route === 'home',
    onClick: function onClick() {
      return navigate('home');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "book",
    label: "My Lessons",
    active: route === 'lessons' || route === 'lesson-detail',
    onClick: function onClick() {
      return navigate('lessons');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "layers",
    label: "Library",
    active: route === 'library',
    onClick: function onClick() {
      return navigate('library');
    }
  }), gamification && /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "brain",
    label: "Study",
    active: route === 'study',
    badge: MOCK.dueCards,
    onClick: function onClick() {
      return navigate('study');
    }
  }), gamification && /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "bookmark",
    label: "My Words",
    active: route === 'vocabulary',
    onClick: function onClick() {
      return navigate('vocabulary');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "calendar",
    label: "Calendar",
    active: route === 'calendar',
    onClick: function onClick() {
      return navigate('calendar');
    }
  }), gamification && /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "trophy",
    label: "Achievements",
    active: route === 'achievements',
    onClick: function onClick() {
      return navigate('achievements');
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 16
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "user",
    label: "Profile",
    active: route === 'profile',
    onClick: function onClick() {
      return navigate('profile');
    }
  }));
}
function TeacherSidebar(_ref3) {
  var route = _ref3.route,
    navigate = _ref3.navigate;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "home",
    label: "Home",
    active: route === 'home',
    onClick: function onClick() {
      return navigate('home');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "video",
    label: "Sessions",
    active: route === 'sessions' || route === 'session-detail',
    badge: 3,
    onClick: function onClick() {
      return navigate('sessions');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "layers",
    label: "Library",
    active: route === 'library',
    onClick: function onClick() {
      return navigate('library');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "users",
    label: "Students",
    active: route === 'students',
    onClick: function onClick() {
      return navigate('students');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "calendar",
    label: "Calendar",
    active: route === 'calendar',
    onClick: function onClick() {
      return navigate('calendar');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "chart",
    label: "Reports",
    active: route === 'reports',
    onClick: function onClick() {
      return navigate('reports');
    }
  }));
}
function AdminSidebar(_ref4) {
  var route = _ref4.route,
    navigate = _ref4.navigate;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "home",
    label: "Dashboard",
    active: route === 'home',
    onClick: function onClick() {
      return navigate('home');
    }
  }), /*#__PURE__*/React.createElement(SidebarSection, {
    label: "People"
  }, /*#__PURE__*/React.createElement(SidebarItem, {
    label: "Students",
    active: route === 'students',
    badge: MOCK.studentRoster.length,
    onClick: function onClick() {
      return navigate('students');
    },
    indent: true
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    label: "Instructors",
    active: route === 'instructors',
    badge: MOCK.instructors.length,
    onClick: function onClick() {
      return navigate('instructors');
    },
    indent: true
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    label: "Permissions",
    active: route === 'permissions',
    onClick: function onClick() {
      return navigate('permissions');
    },
    indent: true
  })), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "video",
    label: "Sessions",
    active: route === 'sessions' || route === 'session-detail',
    onClick: function onClick() {
      return navigate('sessions');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "layers",
    label: "Library",
    active: route === 'library',
    onClick: function onClick() {
      return navigate('library');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "calendar",
    label: "Calendar",
    active: route === 'calendar',
    onClick: function onClick() {
      return navigate('calendar');
    }
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "dollar",
    label: "Billing",
    active: route === 'billing',
    onClick: function onClick() {
      return navigate('billing');
    }
  }), /*#__PURE__*/React.createElement(SidebarSection, {
    label: "Settings"
  }, /*#__PURE__*/React.createElement(SidebarItem, {
    label: "AI Manager",
    active: route === 'ai',
    onClick: function onClick() {
      return navigate('ai');
    },
    indent: true
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    label: "Achievements",
    active: route === 'achievements-settings',
    onClick: function onClick() {
      return navigate('achievements-settings');
    },
    indent: true
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    label: "Branding",
    active: route === 'branding',
    onClick: function onClick() {
      return navigate('branding');
    },
    indent: true
  })));
}

// ---------- Color helpers ----------
function shade(hex, percent) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.max(0, Math.min(255, (n >> 16 & 0xff) + Math.floor(255 * percent / 100)));
  var g = Math.max(0, Math.min(255, (n >> 8 & 0xff) + Math.floor(255 * percent / 100)));
  var b = Math.max(0, Math.min(255, (n & 0xff) + Math.floor(255 * percent / 100)));
  return '#' + [r, g, b].map(function (v) {
    return v.toString(16).padStart(2, '0');
  }).join('');
}
function hexA(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  var r = n >> 16 & 0xff,
    g = n >> 8 & 0xff,
    b = n & 0xff;
  return "rgba(".concat(r, ", ").concat(g, ", ").concat(b, ", ").concat(a, ")");
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));