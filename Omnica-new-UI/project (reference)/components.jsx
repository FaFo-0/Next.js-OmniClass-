// Shared UI components
const { useState, useEffect, useRef, useMemo } = React;

// ---------- Sidebar ----------
function OmnicLogo({ size = 28 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: 8,
        background: 'var(--omnic-red)', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: size * 0.5, letterSpacing: '-0.04em',
      }}>O</div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--omnic-gray-900)', letterSpacing: '-0.01em' }}>Omnic</span>
        <span style={{ fontSize: 11, color: 'var(--omnic-tenant-primary)', fontWeight: 600 }}>{MOCK.tenant.name}</span>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, badge, onClick, indent }) {
  return (
    <button onClick={onClick} className={`sb-item ${active ? 'sb-item-active' : ''}`}
      style={{ paddingLeft: indent ? 36 : 14 }}>
      {icon && <Icon name={icon} size={17} />}
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      {badge != null && badge !== 0 && (
        <span className={active ? 'sb-badge-active' : 'sb-badge'}>{badge}</span>
      )}
    </button>
  );
}

function SidebarSection({ label, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={() => setOpen(!open)} className="sb-section-header">
        <span>{label}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
      </button>
      {open && <div className="sb-section-body">{children}</div>}
    </div>
  );
}

// ---------- Page chrome ----------
function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
      <div>
        <h1 className="h1" style={{ margin: 0 }}>{title}</h1>
        {subtitle && <div className="body" style={{ marginTop: 4 }}>{subtitle}</div>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  );
}

function MetricCard({ icon, label, value, trend, accent }) {
  return (
    <div className="card" style={{ padding: 'var(--pad-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: accent === 'red' ? 'var(--omnic-red-tint)' : 'var(--omnic-tenant-primary-soft)',
            color: accent === 'red' ? 'var(--omnic-red)' : 'var(--omnic-tenant-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={icon} size={18} />
          </div>
        )}
        {trend && <span className="body-sm" style={{ color: 'var(--omnic-tenant-primary)', fontWeight: 500 }}>{trend}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: 'var(--omnic-gray-900)', letterSpacing: '-0.02em' }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    Active: 'pill-active', active: 'pill-active', Finalized: 'pill-active', Approved: 'pill-active',
    Paused: 'pill-paused', paused: 'pill-paused', Generating: 'pill-paused',
    Cancelled: 'pill-cancelled', cancelled: 'pill-cancelled', Overdue: 'pill-cancelled', Unpaid: 'pill-cancelled', Failed: 'pill-cancelled',
    Trial: 'pill-trial', trial: 'pill-trial', Transcribed: 'pill-trial', Review: 'pill-trial',
    New: 'pill-new', Draft: 'pill-new', Pending: 'pill-new',
    Paid: 'pill-active',
    upcoming: 'pill-tenant', Upcoming: 'pill-tenant', Live: 'pill-red', Completed: 'pill-new',
  };
  return <span className={`pill ${map[status] || 'pill-new'}`}>{status}</span>;
}

function Avatar({ initials, size = 'md', tone }) {
  const cls = size === 'sm' ? 'avatar avatar-sm' : size === 'lg' ? 'avatar avatar-lg' : 'avatar';
  const style = tone === 'red' ? { background: 'var(--omnic-red-tint)', color: 'var(--omnic-red)' } : null;
  return <span className={cls} style={style}>{initials}</span>;
}

// ---------- Modal ----------
function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null;
  const widths = { sm: 400, md: 520, lg: 720 };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scale-in" style={{ width: widths[size] }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 4, borderRadius: 6 }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toast ----------
function Toast({ message, kind = 'success', onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <div className="toast slide-up">
      <Icon name={kind === 'success' ? 'check' : 'bell'} size={16} />
      <span>{message}</span>
    </div>
  );
}

// ---------- Tabs ----------
function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`tab ${value === t.value ? 'tab-active' : ''}`}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- FilterChips ----------
function FilterChips({ chips, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {chips.map(c => (
        <button key={c.value} onClick={() => onChange(c.value)}
          className={`chip ${value === c.value ? 'chip-active' : ''}`}>
          {c.label}{c.count != null && <span className="chip-count">{c.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Search ----------
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="search-wrap">
      <Icon name="search" size={15} stroke="var(--omnic-gray-400)" />
      <input className="search-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ---------- Language Switcher ----------
const UI_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
];
function LanguageSwitcher({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = UI_LANGUAGES.find(l => l.code === value) || UI_LANGUAGES[0];
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn-ghost"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: 'var(--omnic-gray-700)', border: '1px solid var(--omnic-gray-200)', background: 'white' }}
        title="Interface language"
      >
        <Icon name="globe" size={14} stroke="var(--omnic-gray-500)" />
        <span style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>{current.code}</span>
        <Icon name="chevronDown" size={12} stroke="var(--omnic-gray-500)" />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'white', border: '1px solid var(--omnic-gray-200)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', minWidth: 200, zIndex: 100, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px 6px', fontSize: 11, fontWeight: 600, color: 'var(--omnic-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--omnic-gray-100)' }}>Interface language</div>
          {UI_LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { onChange(l.code); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                background: l.code === value ? 'var(--omnic-tenant-primary-soft)' : 'white',
                color: 'var(--omnic-gray-900)', fontSize: 13,
              }}
              onMouseEnter={e => { if (l.code !== value) e.currentTarget.style.background = 'var(--omnic-gray-50)'; }}
              onMouseLeave={e => { if (l.code !== value) e.currentTarget.style.background = 'white'; }}
            >
              <span style={{ fontSize: 16 }}>{l.flag}</span>
              <span style={{ flex: 1 }}>{l.label}</span>
              {l.code === value && <Icon name="check" size={14} stroke="var(--omnic-tenant-primary)" />}
            </button>
          ))}
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--omnic-gray-500)', borderTop: '1px solid var(--omnic-gray-100)', background: 'var(--omnic-gray-50)' }}>
            Stored on User profile
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Week Calendar (Google-Calendar style) ----------
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_DATES = ['Apr 26', 'Apr 27', 'Apr 28', 'Apr 29', 'Apr 30', 'May 1', 'May 2'];
// Today = Friday May 1 = column 5 (0-indexed Sun..Sat). Day offsets in events: -5..+1 → columns 0..6
const dayOffsetToCol = (offset) => offset + 5;
const PX_PER_HOUR = 56;
const HOUR_START = 8;
const HOUR_END = 21;

function EventChip({ event, onClick, color }) {
  const top = ((event.start / 60) - HOUR_START) * PX_PER_HOUR;
  const height = ((event.end - event.start) / 60) * PX_PER_HOUR - 4;
  const fmt = (m) => {
    const h = Math.floor(m / 60), mm = m % 60;
    return `${h}:${mm.toString().padStart(2, '0')}`;
  };
  return (
    <div onClick={onClick} className="cal-event" style={{
      position: 'absolute', top, left: 4, right: 4, height,
      background: color, borderLeft: `3px solid ${shadeColor(color, -25)}`,
      borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
      overflow: 'hidden', fontSize: 12, lineHeight: 1.3,
    }}>
      <div style={{ fontWeight: 600, color: 'var(--omnic-gray-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</div>
      <div style={{ color: 'var(--omnic-gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(event.start)} · {event.students}</div>
    </div>
  );
}

function shadeColor(hex, percent) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + Math.floor(255 * percent / 100)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.floor(255 * percent / 100)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.floor(255 * percent / 100)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const KIND_COLORS = {
  '1on1':   '#DDD6FE', // soft purple
  'group':  '#FEF3C7', // soft yellow
  'offline':'#E5E7EB', // gray
  'global': '#FECACA', // red soft
};
const KIND_LABELS = { '1on1': '1-on-1', 'group': 'Group', 'offline': 'Off-line', 'global': 'Tenant-wide' };

function WeekCalendar({ events, view = 'week', currentCol = 5, onEventClick, onDayClick, dayLabel }) {
  // view: 'day' | 'week' | 'month'
  const cols = view === 'day' ? [currentCol] : [0,1,2,3,4,5,6];
  const totalHeight = (HOUR_END - HOUR_START) * PX_PER_HOUR;
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${cols.length}, 1fr)`, borderBottom: '1px solid var(--omnic-gray-200)' }}>
        <div></div>
        {cols.map(c => {
          const isToday = c === 5;
          return (
            <div key={c} style={{ padding: '12px 8px', textAlign: 'center', borderLeft: '1px solid var(--omnic-gray-100)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--omnic-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{WEEK_LABELS[c]}</div>
              <div style={{
                fontSize: 22, fontWeight: 600, marginTop: 2,
                color: isToday ? 'white' : 'var(--omnic-gray-900)',
                background: isToday ? 'var(--omnic-tenant-primary)' : 'transparent',
                width: 34, height: 34, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{WEEK_DATES[c].split(' ')[1]}</div>
            </div>
          );
        })}
      </div>
      {/* Time grid */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `60px repeat(${cols.length}, 1fr)`, height: totalHeight }}>
        {/* Hour labels */}
        <div style={{ position: 'relative' }}>
          {hours.map(h => (
            <div key={h} style={{ height: PX_PER_HOUR, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -7, right: 8, fontSize: 11, color: 'var(--omnic-gray-500)' }}>{h}:00</div>
            </div>
          ))}
        </div>
        {cols.map(c => {
          const colEvents = events.filter(e => dayOffsetToCol(e.day) === c);
          return (
            <div key={c} style={{ position: 'relative', borderLeft: '1px solid var(--omnic-gray-100)' }}>
              {hours.slice(0, -1).map(h => (
                <div key={h} style={{ height: PX_PER_HOUR, borderBottom: '1px solid var(--omnic-gray-100)' }}></div>
              ))}
              {colEvents.map(e => (
                <EventChip key={e.id} event={e} onClick={() => onEventClick && onEventClick(e)} color={KIND_COLORS[e.kind] || '#DDD6FE'} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarLegend() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      {Object.entries(KIND_LABELS).map(([k, label]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--omnic-gray-700)' }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: KIND_COLORS[k], borderLeft: `3px solid ${shadeColor(KIND_COLORS[k], -25)}` }}></div>
          {label}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  OmnicLogo, SidebarItem, SidebarSection,
  PageHeader, MetricCard, StatusPill, Avatar,
  Modal, Toast, Tabs, FilterChips, SearchInput,
  LanguageSwitcher,
  WeekCalendar, CalendarLegend, KIND_COLORS, KIND_LABELS,
});