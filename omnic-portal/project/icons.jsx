// Icons — minimal stroke-based SVG icon set
const Icon = ({ name, size = 18, stroke = 'currentColor', strokeWidth = 2, fill = 'none', style }) => {
  const paths = {
    home: <><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></>,
    book: <><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5z"/><path d="M4 19a2 2 0 0 1 2-2h12"/></>,
    brain: <><path d="M9 4a3 3 0 0 0-3 3v.5A2.5 2.5 0 0 0 4 10c0 1 .5 1.8 1 2.2A2.5 2.5 0 0 0 4 14.5 2.5 2.5 0 0 0 6 17a3 3 0 0 0 3 3"/><path d="M15 4a3 3 0 0 1 3 3v.5A2.5 2.5 0 0 1 20 10c0 1-.5 1.8-1 2.2A2.5 2.5 0 0 1 20 14.5 2.5 2.5 0 0 1 18 17a3 3 0 0 1-3 3"/><path d="M12 4v16"/></>,
    bookmark: <><path d="M6 3h12v18l-6-4-6 4z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    trophy: <><path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/><path d="M10 14h4l1 6H9z"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19a4 4 0 0 0-6-3.5"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></>,
    chart: <><path d="M3 20h18"/><path d="M6 16V10M11 16V6M16 16v-8M21 16v-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <><path d="M5 12h14"/></>,
    chevronRight: <><path d="M9 6l6 6-6 6"/></>,
    chevronLeft: <><path d="M15 6l-6 6 6 6"/></>,
    chevronDown: <><path d="M6 9l6 6 6-6"/></>,
    chevronUp: <><path d="M6 15l6-6 6 6"/></>,
    flame: <><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4-.5 2 .5 3 1 3 0-3 1-6 2-9z"/></>,
    play: <><polygon points="6,4 20,12 6,20" fill={stroke} stroke="none"/></>,
    speaker: <><polygon points="4,9 8,9 13,5 13,19 8,15 4,15"/><path d="M16 9a4 4 0 0 1 0 6"/></>,
    volume: <><polygon points="4,9 8,9 13,5 13,19 8,15 4,15"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 6a8 8 0 0 1 0 12"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    layers: <><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 18l9 5 9-5"/></>,
    alert: <><path d="M12 3L1 22h22z"/><path d="M12 9v5M12 17h.01"/></>,
    pause: <><rect x="6" y="4" width="4" height="16" fill={stroke} stroke="none"/><rect x="14" y="4" width="4" height="16" fill={stroke} stroke="none"/></>,
    send: <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
    upload: <><path d="M12 15V4M7 9l5-5 5 5"/><path d="M5 17v3h14v-3"/></>,
    check: <><path d="M5 12l4 4 10-10"/></>,
    x: <><path d="M6 6l12 12M6 18L18 6"/></>,
    bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z"/><path d="M10 21h4"/></>,
    moreHorizontal: <><circle cx="6" cy="12" r="1.5" fill={stroke} stroke="none"/><circle cx="12" cy="12" r="1.5" fill={stroke} stroke="none"/><circle cx="18" cy="12" r="1.5" fill={stroke} stroke="none"/></>,
    logout: <><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>,
    edit: <><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></>,
    trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></>,
    sparkle: <><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="M19 4l.6 1.4L21 6l-1.4.6L19 8l-.6-1.4L17 6l1.4-.6z"/></>,
    zap: <><polygon points="13,2 4,14 11,14 11,22 20,10 13,10" fill={stroke} stroke="none" strokeLinejoin="round"/></>,
    menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
    external: <><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    dollar: <><path d="M12 2v20M16 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7"/></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
    party: <><path d="M3 21l4-12 8 8z"/><path d="M11 4l1 2M16 3l1 1M19 7l1.5-.5M14 9l3-3"/></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={stroke} stroke="none"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    award: <><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths[name] || null}
    </svg>
  );
};

window.Icon = Icon;
