// Mock data for the Omnica English portal prototype
const MOCK = {
  tenant: {
    name: 'Omnica English',
    primaryColor: '#5B21B6',
    tagline: 'Speak English with confidence.',
  },
  student: {
    firstName: 'Amira',
    fullName: 'Amira Hassan',
    email: 'amira@example.com',
    initials: 'AH',
    streak: 12,
    longestStreak: 21,
    lessonsCompleted: 18,
    wordsLearned: 142,
    cardsReviewed: 384,
    sessionsRemaining: 8,
    sessionsTotal: 24,
    studyTimeHours: 14.5,
  },
  upcomingClass: {
    title: 'Business English — Negotiation',
    teacher: 'Mustafa Arslan',
    minutesUntil: 14,
    duration: 60,
    meetLink: '#',
  },
  dueCards: 23,
  lessons: [
    { id: 1, title: 'Business English — Negotiation Tactics', date: 'Apr 28, 2026', teacher: 'Mustafa Arslan', duration: '52 min', wordCount: 12, status: 'finalized' },
    { id: 2, title: 'Travel Conversations — At the Airport', date: 'Apr 25, 2026', teacher: 'Mustafa Arslan', duration: '48 min', wordCount: 9, status: 'finalized' },
    { id: 3, title: 'Phrasal Verbs — Daily Routines', date: 'Apr 22, 2026', teacher: 'Sara Lopez', duration: '60 min', wordCount: 15, status: 'finalized' },
    { id: 4, title: 'Pronunciation Workshop — TH Sounds', date: 'Apr 19, 2026', teacher: 'Mustafa Arslan', duration: '45 min', wordCount: 7, status: 'finalized' },
    { id: 5, title: 'Email Writing — Formal Tone', date: 'Apr 15, 2026', teacher: 'Sara Lopez', duration: '55 min', wordCount: 11, status: 'finalized' },
  ],
  vocabulary: [
    { word: 'leverage', translation: 'aprovechar', pos: 'verb', lessonId: 1 },
    { word: 'concession', translation: 'concesión', pos: 'noun', lessonId: 1 },
    { word: 'stakeholder', translation: 'parte interesada', pos: 'noun', lessonId: 1 },
    { word: 'compromise', translation: 'compromiso', pos: 'noun', lessonId: 1 },
    { word: 'boarding pass', translation: 'tarjeta de embarque', pos: 'noun', lessonId: 2 },
    { word: 'layover', translation: 'escala', pos: 'noun', lessonId: 2 },
    { word: 'baggage claim', translation: 'recogida de equipajes', pos: 'noun', lessonId: 2 },
    { word: 'pick up', translation: 'recoger', pos: 'phrasal', lessonId: 3 },
    { word: 'wind down', translation: 'relajarse', pos: 'phrasal', lessonId: 3 },
    { word: 'come across', translation: 'encontrarse con', pos: 'phrasal', lessonId: 3 },
  ],
  flashcards: [
    { id: 1, front: 'leverage', back: 'to use something to maximum advantage', pos: 'verb', example: 'We can leverage our existing network to find clients.', lesson: 'Business English — Negotiation' },
    { id: 2, front: 'concession', back: 'something granted in response to demands', pos: 'noun', example: 'They made several concessions to close the deal.', lesson: 'Business English — Negotiation' },
    { id: 3, front: 'layover', back: 'a short stay between connecting flights', pos: 'noun', example: 'I have a 3-hour layover in Frankfurt.', lesson: 'Travel Conversations' },
    { id: 4, front: 'wind down', back: 'to gradually relax after a busy time', pos: 'phrasal', example: 'I wind down by reading before bed.', lesson: 'Phrasal Verbs' },
    { id: 5, front: 'stakeholder', back: 'a person with an interest in something', pos: 'noun', example: 'All stakeholders attended the meeting.', lesson: 'Business English — Negotiation' },
  ],
  achievements: [
    { id: 1, name: 'First Steps', description: 'Complete your first lesson', icon: '🎯', unlocked: true, date: 'Mar 12, 2026' },
    { id: 2, name: 'Word Collector', description: 'Learn 100 words', icon: '📚', unlocked: true, date: 'Apr 04, 2026' },
    { id: 3, name: 'Week Warrior', description: 'Maintain a 7-day streak', icon: '🔥', unlocked: true, date: 'Apr 18, 2026' },
    { id: 4, name: 'Quiz Master', description: 'Score 100% on 5 quizzes', icon: '🏆', unlocked: false, progress: 3, total: 5 },
    { id: 5, name: 'Marathon', description: 'Maintain a 30-day streak', icon: '⚡', unlocked: false, progress: 12, total: 30 },
    { id: 6, name: 'Polyglot in Training', description: 'Learn 500 words', icon: '🌍', unlocked: false, progress: 142, total: 500 },
  ],
  upcomingClasses: [
    { id: 1, date: 'May 1', day: 'Today', time: '14:30', title: 'Business English — Negotiation', teacher: 'Mustafa Arslan', student: 'Amira Hassan', status: 'upcoming', minutesUntil: 14 },
    { id: 2, date: 'May 2', day: 'Tomorrow', time: '15:00', title: 'Pronunciation Workshop', teacher: 'Mustafa Arslan', student: 'Amira Hassan', status: 'upcoming' },
    { id: 3, date: 'May 4', day: 'Mon', time: '10:00', title: 'Email Writing — Formal', teacher: 'Sara Lopez', student: 'Amira Hassan', status: 'upcoming' },
    { id: 4, date: 'May 5', day: 'Tue', time: '14:30', title: 'Travel Conversations', teacher: 'Mustafa Arslan', student: 'Amira Hassan', status: 'upcoming' },
  ],
  // Teacher data
  teacher: {
    fullName: 'Mustafa Arslan',
    email: 'mustafa@lingualab.com',
    initials: 'MA',
    totalStudents: 24,
    publishedThisMonth: 47,
    hoursThisMonth: 38.5,
    pendingReviews: 3,
  },
  todaysClasses: [
    { id: 1, time: '14:30', student: 'Amira Hassan', title: 'Business English — Negotiation', status: 'upcoming', minutesUntil: 14 },
    { id: 2, time: '16:00', student: 'Carlos Méndez', title: 'Conversation Practice', status: 'upcoming' },
    { id: 3, time: '17:30', student: 'Yuki Tanaka', title: 'Pronunciation — R/L', status: 'upcoming' },
  ],
  recordings: [
    { id: 1, title: 'Business English — Negotiation', student: 'Amira Hassan', date: 'Apr 28', duration: '52:14', status: 'Draft', workflow: 'Review' },
    { id: 2, title: 'Travel Conversations — Airport', student: 'Amira Hassan', date: 'Apr 25', duration: '48:02', status: 'Finalized', workflow: 'Approved' },
    { id: 3, title: 'Conversation Practice', student: 'Carlos Méndez', date: 'Apr 24', duration: '60:11', status: 'Draft', workflow: 'Generating' },
    { id: 4, title: 'Pronunciation — R/L', student: 'Yuki Tanaka', date: 'Apr 23', duration: '45:30', status: 'Finalized', workflow: 'Approved' },
    { id: 5, title: 'Email Writing — Formal', student: 'Amira Hassan', date: 'Apr 21', duration: '55:18', status: 'Finalized', workflow: 'Approved' },
    { id: 6, title: 'Reading Comprehension', student: 'Carlos Méndez', date: 'Apr 20', duration: '50:00', status: 'Draft', workflow: 'Transcribed' },
  ],
  studentRoster: [
    { id: 1, name: 'Amira Hassan', email: 'amira@example.com', status: 'Active', lessons: 18, lastActivity: '2h ago', teacher: 'Mustafa Arslan', sessionsLeft: 8, sessionsTotal: 24, plan: '24 sessions' },
    { id: 2, name: 'Carlos Méndez', email: 'carlos@example.com', status: 'Active', lessons: 24, lastActivity: '1d ago', teacher: 'Mustafa Arslan', sessionsLeft: 4, sessionsTotal: 12, plan: '12 sessions' },
    { id: 3, name: 'Yuki Tanaka', email: 'yuki@example.com', status: 'Trial', lessons: 2, lastActivity: '3h ago', teacher: 'Mustafa Arslan', sessionsLeft: 1, sessionsTotal: 3, plan: 'Trial' },
    { id: 4, name: 'Sofia Petrova', email: 'sofia@example.com', status: 'Paused', lessons: 12, lastActivity: '2w ago', teacher: 'Sara Lopez', sessionsLeft: 6, sessionsTotal: 12, plan: '12 sessions' },
    { id: 5, name: 'Liam O\'Connor', email: 'liam@example.com', status: 'Active', lessons: 31, lastActivity: '5h ago', teacher: 'Sara Lopez', sessionsLeft: 11, sessionsTotal: 24, plan: '24 sessions' },
    { id: 6, name: 'Priya Shah', email: 'priya@example.com', status: 'Overdue', lessons: 8, lastActivity: '1w ago', teacher: 'Mustafa Arslan', sessionsLeft: 0, sessionsTotal: 12, plan: '12 sessions' },
    { id: 7, name: 'Henrik Larsen', email: 'henrik@example.com', status: 'Cancelled', lessons: 4, lastActivity: '1mo ago', teacher: 'Mustafa Arslan', sessionsLeft: 0, sessionsTotal: 6, plan: '6 sessions' },
    { id: 8, name: 'Aisha Khan', email: 'aisha@example.com', status: 'Active', lessons: 16, lastActivity: '6h ago', teacher: 'Sara Lopez', sessionsLeft: 9, sessionsTotal: 24, plan: '24 sessions' },
  ],
  transcript: [
    { speaker: 'Teacher', text: "Alright, today we're going to work on negotiation language. Can you tell me what you remember from last time?" },
    { speaker: 'Amira Hassan', text: "Yes, we talked about... uh... how to make a counter-offer politely. I remember the phrase 'Would you consider...'" },
    { speaker: 'Teacher', text: "Excellent. That's a softening phrase. Today let's expand that with some new vocabulary. The first word is 'leverage' — to use something to your advantage." },
    { speaker: 'Amira Hassan', text: "Like... we leverage our experience to get a better price?" },
    { speaker: 'Teacher', text: "Exactly. Perfect example. Now, in a negotiation, there are usually concessions on both sides. A concession is something you give up to reach an agreement." },
    { speaker: 'Amira Hassan', text: "And what is the difference between concession and compromise?" },
    { speaker: 'Teacher', text: "Great question. A compromise is the agreement itself; concessions are what each side gives up to get there." },
  ],
  // Admin data
  admin: { fullName: 'Lina Chen', email: 'lina@lingualab.com', initials: 'LC' },
  adminMetrics: {
    teachers: 8,
    students: 142,
    sessionsThisMonth: 487,
    aiPromptsUsed: 1948,
    revenue: 18420,
    adSpend: 2400,
    expenses: 1180,
    teacherPay: 7820,
    netProfit: 7020,
    active: 118, paused: 9, trial: 11, newThisMonth: 14, renewed: 22,
  },
  recentActivity: [
    { type: 'student_registered', text: 'New student registered: Aisha Khan', time: '2h ago' },
    { type: 'lesson_published', text: 'Lesson published: "Business English — Negotiation"', time: '3h ago' },
    { type: 'session_completed', text: 'Mustafa Arslan completed a session with Carlos Méndez', time: '5h ago' },
    { type: 'subscription', text: 'Sofia Petrova paused her subscription', time: 'yesterday' },
    { type: 'invoice', text: 'Invoice INV-2026-0184 paid by Amira Hassan', time: 'yesterday' },
  ],
  aiPrompts: [
    { id: 'transcribe', name: 'Soniox Transcription', model: 'soniox/stt-rt-v2', temperature: null, maxTokens: null, format: 'audio', cost: '$0.013500', desc: 'Realtime speech-to-text with speaker diarization (3 min avg session = $0.0135).', kind: 'stt' },
    { id: 'summary', name: 'Lesson Summary', model: 'google/gemini-3-flash-preview', temperature: 0.3, maxTokens: 500, format: 'text', cost: '$0.000025', desc: 'Generates a 2-3 paragraph summary of the lesson transcript.' },
    { id: 'vocabulary', name: 'Vocabulary Extraction', model: 'google/gemini-3-flash-preview', temperature: 0.2, maxTokens: 2000, format: 'json', cost: '$0.000033', desc: 'Extracts new vocabulary with translation and part of speech.' },
    { id: 'flashcards', name: 'Flashcard Generation', model: 'google/gemini-3-flash-preview', temperature: 0.2, maxTokens: 2000, format: 'json', cost: '$0.000027', desc: 'Creates flashcards (front/back/example) from the transcript.' },
    { id: 'quiz', name: 'Quiz Generation', model: 'google/gemini-3-flash-preview', temperature: 0.4, maxTokens: 2000, format: 'json', cost: '$0.000028', desc: 'Generates a 5-10 question multiple-choice quiz.' },
  ],
  achievementDefs: [
    { id: 1, name: 'First Steps', desc: 'Complete your first lesson', condition: 'lesson_count', threshold: 1, reward: '—', unlockedBy: 138 },
    { id: 2, name: 'Word Collector', desc: 'Learn 100 words', condition: 'vocabulary_count', threshold: 100, reward: '—', unlockedBy: 64 },
    { id: 3, name: 'Week Warrior', desc: 'Maintain a 7-day streak', condition: 'streak_days', threshold: 7, reward: '1 free lesson', unlockedBy: 47 },
    { id: 4, name: 'Quiz Master', desc: 'Score 100% on 5 quizzes', condition: 'perfect_quiz', threshold: 5, reward: '—', unlockedBy: 19 },
    { id: 5, name: 'Marathon', desc: 'Maintain a 30-day streak', condition: 'streak_days', threshold: 30, reward: '2 free lessons', unlockedBy: 8 },
    { id: 6, name: 'Card Crusher', desc: 'Review 500 flashcards', condition: 'review_count', threshold: 500, reward: '—', unlockedBy: 22 },
  ],
  invoices: [
    { id: 'INV-2026-0184', student: 'Amira Hassan', amount: '€480.00', status: 'Paid', date: 'Apr 28' },
    { id: 'INV-2026-0183', student: 'Carlos Méndez', amount: '€240.00', status: 'Paid', date: 'Apr 26' },
    { id: 'INV-2026-0182', student: 'Liam O\'Connor', amount: '€480.00', status: 'Unpaid', date: 'Apr 25' },
    { id: 'INV-2026-0181', student: 'Aisha Khan', amount: '€480.00', status: 'Paid', date: 'Apr 24' },
    { id: 'INV-2026-0180', student: 'Priya Shah', amount: '€240.00', status: 'Overdue', date: 'Apr 12' },
  ],
};

MOCK.instructors = [
  { id: 1, name: 'Mustafa Arslan', email: 'mustafa@lingualab.com', students: 12, hours: 38.5, status: 'Active', sessions: 47, joined: 'Jan 2025' },
  { id: 2, name: 'Sara Lopez', email: 'sara@lingualab.com', students: 8, hours: 24.0, status: 'Active', sessions: 31, joined: 'Mar 2025' },
  { id: 3, name: 'Daniel Kim', email: 'daniel@lingualab.com', students: 4, hours: 12.5, status: 'Active', sessions: 14, joined: 'Sep 2025' },
];
MOCK.adminRoles = [
  { id: 'super', name: 'Super Admin', count: 1, members: ['Lina Chen'], perms: { all: true } },
  { id: 'manager', name: 'Manager', count: 2, members: ['Omar Rashid', 'Eva Costa'], perms: { students: true, instructors: true, billing: true, ai: true, branding: true, scheduling: true, impersonate: true, financials: true } },
  { id: 'sales', name: 'Sales', count: 3, members: ['Jin Park', 'Maya Singh', 'Tom Reilly'], perms: { students: true, billing: true, financials: true } },
  { id: 'support', name: 'Support', count: 1, members: ['Ravi Patel'], perms: { students: 'view', impersonate: true } },
];
MOCK.permMatrix = [
  { key: 'students', label: 'Students', desc: 'View and edit student records' },
  { key: 'instructors', label: 'Instructors', desc: 'View and edit instructor records, assign students' },
  { key: 'billing', label: 'Billing', desc: 'View invoices, subscriptions, payments' },
  { key: 'ai', label: 'AI Manager', desc: 'Edit prompts, models, parameters' },
  { key: 'branding', label: 'Branding', desc: 'Edit tenant identity and theming' },
  { key: 'scheduling', label: 'Scheduling Policies', desc: 'Edit reschedule/cancel windows' },
  { key: 'impersonate', label: 'Impersonate', desc: 'Sign in as another user (notifies them)' },
  { key: 'financials', label: 'Financials', desc: 'View P&L, revenue, expenses' },
];
MOCK.upcomingSessions = [
  { id: 101, date: 'Today', time: '14:30', title: 'Business English — Negotiation', teacher: 'Mustafa Arslan', student: 'Amira Hassan', type: '1-on-1' },
  { id: 102, date: 'Today', time: '16:00', title: 'Conversation Practice', teacher: 'Mustafa Arslan', student: 'Carlos Méndez', type: '1-on-1' },
  { id: 103, date: 'Tomorrow', time: '10:00', title: 'Beginner Group — Intro', teacher: 'Sara Lopez', student: '6 enrolled / 8 max', type: 'Group' },
  { id: 104, date: 'Tomorrow', time: '15:00', title: 'Pronunciation Workshop', teacher: 'Mustafa Arslan', student: 'Amira Hassan', type: '1-on-1' },
  { id: 105, date: 'May 4', time: '10:00', title: 'Email Writing — Formal', teacher: 'Sara Lopez', student: 'Amira Hassan', type: '1-on-1' },
  { id: 106, date: 'May 5', time: '18:00', title: 'Friday Conversation Club', teacher: 'Daniel Kim', student: '12 enrolled / 20 max', type: 'Group' },
];
// Calendar events — anchored to "today" = Friday May 1, 2026 (week of Sun Apr 26 → Sat May 2)
// `day` is offset from today (0 = today, +1 = tomorrow, -1 = yesterday). `start`/`end` are minutes from 00:00.
MOCK.calendarEvents = [
  // Sun Apr 26 (-5)
  { id: 'e1', day: -5, start: 10 * 60, end: 11 * 60, title: 'Beginner Group — Intro', kind: 'group', teacher: 'Sara Lopez', students: '6 / 8 enrolled' },
  // Mon Apr 27 (-4)
  { id: 'e2', day: -4, start: 9 * 60, end: 10 * 60, title: 'Email Writing — Formal', kind: '1on1', teacher: 'Sara Lopez', students: 'Amira Hassan' },
  { id: 'e3', day: -4, start: 14 * 60, end: 15 * 60, title: 'Conversation Practice', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Carlos Méndez' },
  { id: 'e4', day: -4, start: 17 * 60, end: 18 * 60, title: 'Pronunciation — R/L', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Yuki Tanaka' },
  // Tue Apr 28 (-3)
  { id: 'e5', day: -3, start: 11 * 60, end: 12 * 60, title: 'Travel Conversations', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Amira Hassan' },
  { id: 'e6', day: -3, start: 16 * 60, end: 17 * 60, title: 'Office Hours', kind: 'offline', teacher: 'Daniel Kim', students: '—' },
  // Wed Apr 29 (-2)
  { id: 'e7', day: -2, start: 10 * 60, end: 11 * 60, title: 'Business English', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Amira Hassan' },
  { id: 'e8', day: -2, start: 14 * 60, end: 15 * 60 + 30, title: 'Group: Intermediate', kind: 'group', teacher: 'Sara Lopez', students: '8 / 10 enrolled' },
  // Thu Apr 30 (-1)
  { id: 'e9', day: -1, start: 9 * 60, end: 10 * 60, title: 'Pronunciation Workshop', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Amira Hassan' },
  { id: 'e10', day: -1, start: 13 * 60, end: 14 * 60, title: 'Conversation Practice', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Carlos Méndez' },
  { id: 'e11', day: -1, start: 18 * 60, end: 19 * 60, title: 'Public Holiday Reminder', kind: 'global', teacher: '—', students: 'All staff' },
  // Fri May 1 (0 — today)
  { id: 'e12', day: 0, start: 10 * 60, end: 11 * 60, title: 'Email Writing — Formal', kind: '1on1', teacher: 'Sara Lopez', students: 'Amira Hassan' },
  { id: 'e13', day: 0, start: 14 * 60 + 30, end: 15 * 60 + 30, title: 'Business English — Negotiation', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Amira Hassan' },
  { id: 'e14', day: 0, start: 16 * 60, end: 17 * 60, title: 'Conversation Practice', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Carlos Méndez' },
  { id: 'e15', day: 0, start: 17 * 60 + 30, end: 18 * 60 + 30, title: 'Pronunciation — R/L', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Yuki Tanaka' },
  // Sat May 2 (+1)
  { id: 'e16', day: 1, start: 10 * 60, end: 11 * 60, title: 'Pronunciation Workshop', kind: '1on1', teacher: 'Mustafa Arslan', students: 'Amira Hassan' },
  { id: 'e17', day: 1, start: 18 * 60, end: 19 * 60 + 30, title: 'Friday Conversation Club', kind: 'group', teacher: 'Daniel Kim', students: '12 / 20 enrolled' },
];

MOCK.library = [
  { id: 1, title: 'The Great Gatsby — Chapter 1', author: 'F. Scott Fitzgerald', cover: '#7C3AED', cefr: 'B2', pages: 18, assignedTo: ['all'], type: 'Novel', minutes: 22, tags: ['Classic', 'Narrative'] },
  { id: 2, title: 'TED Talk: The Power of Vulnerability', author: 'Brené Brown', cover: '#DC2626', cefr: 'B1', pages: 6, assignedTo: ['Amira', 'Carlos'], type: 'Transcript', minutes: 8, tags: ['Talk', 'Psychology'] },
  { id: 3, title: 'BBC News: Climate Summit Recap', author: 'BBC News', cover: '#0891B2', cefr: 'B2', pages: 4, assignedTo: ['all'], type: 'Article', minutes: 6, tags: ['News', 'Current'] },
  { id: 4, title: 'A Short History of Tea', author: 'Penguin Reader', cover: '#16A34A', cefr: 'A2', pages: 12, assignedTo: ['Amira'], type: 'Article', minutes: 14, tags: ['History', 'Culture'] },
  { id: 5, title: 'Job Interview — Sample Dialogues', author: 'Omnica English', cover: '#F59E0B', cefr: 'B1', pages: 5, assignedTo: ['Carlos'], type: 'Dialogue', minutes: 7, tags: ['Business', 'Practice'] },
  { id: 6, title: 'Sherlock Holmes — A Scandal in Bohemia', author: 'Arthur Conan Doyle', cover: '#1F2937', cefr: 'C1', pages: 24, assignedTo: ['Liam'], type: 'Novel', minutes: 32, tags: ['Classic', 'Mystery'] },
];

MOCK.readingPassage = {
  title: 'The Great Gatsby — Chapter 1',
  author: 'F. Scott Fitzgerald',
  cefr: 'B2',
  paragraphs: [
    "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.",
    "\"Whenever you feel like criticizing any one,\" he told me, \"just remember that all the people in this world haven't had the advantages that you've had.\"",
    "He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.",
    "In consequence, I'm inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.",
    "The abnormal mind is quick to detect and to attach itself to this quality when it appears in a normal person, and so it came about that in college I was unjustly accused of being a political character.",
    "Most of the confidences were unsought—frequently I have feigned sleep, preoccupation, or a hostile levity when I realized by some unmistakable sign that an intimate revelation was quivering on the horizon.",
  ],
};

MOCK.dictionary = {
  vulnerable: { phonetic: '/ˈvʌlnərəbəl/', pos: 'adjective', meaning: 'Susceptible to physical or emotional harm.', example: 'Children are vulnerable to infection.' },
  criticizing: { phonetic: '/ˈkrɪtɪsaɪzɪŋ/', pos: 'verb', meaning: 'Indicating the faults of someone in a disapproving way.', example: 'He was criticizing the new policy.' },
  advantages: { phonetic: '/ədˈvɑːntɪdʒɪz/', pos: 'noun', meaning: 'Conditions that put one in a favorable position.', example: 'She had every advantage growing up.' },
  communicative: { phonetic: '/kəˈmjuːnɪkətɪv/', pos: 'adjective', meaning: 'Ready to talk or impart information.', example: 'He became more communicative after dinner.' },
  reserved: { phonetic: '/rɪˈzɜːrvd/', pos: 'adjective', meaning: 'Slow to reveal emotion or opinions.', example: 'She has a reserved manner.' },
  inclined: { phonetic: '/ɪnˈklaɪnd/', pos: 'adjective', meaning: 'Tending toward a particular view or behaviour.', example: 'I am inclined to agree.' },
  judgments: { phonetic: '/ˈdʒʌdʒmənts/', pos: 'noun', meaning: 'Opinions or conclusions formed after consideration.', example: 'Reserve your judgments until you hear both sides.' },
  curious: { phonetic: '/ˈkjʊəriəs/', pos: 'adjective', meaning: 'Eager to know or learn; or strange and unusual.', example: 'A curious thing happened today.' },
  veteran: { phonetic: '/ˈvetərən/', pos: 'noun', meaning: 'A person with long experience in a field.', example: 'A veteran of three wars.' },
  abnormal: { phonetic: '/æbˈnɔːməl/', pos: 'adjective', meaning: 'Deviating from what is normal or usual.', example: 'Abnormal weather patterns.' },
  detect: { phonetic: '/dɪˈtekt/', pos: 'verb', meaning: 'Discover or identify the presence of something.', example: 'Detect a faint smell of smoke.' },
  unjustly: { phonetic: '/ʌnˈdʒʌstli/', pos: 'adverb', meaning: 'In a manner not based on justice or fairness.', example: 'Unjustly accused of theft.' },
  feigned: { phonetic: '/feɪnd/', pos: 'verb', meaning: 'Pretended to feel or be affected by something.', example: 'She feigned interest in the book.' },
  preoccupation: { phonetic: '/priˌɒkjʊˈpeɪʃən/', pos: 'noun', meaning: 'The state of being engrossed in thought.', example: 'His preoccupation with work hurt his family.' },
  hostile: { phonetic: '/ˈhɒstaɪl/', pos: 'adjective', meaning: 'Showing or feeling opposition; unfriendly.', example: 'A hostile reception.' },
  levity: { phonetic: '/ˈlevɪti/', pos: 'noun', meaning: 'Humor or frivolity, especially the treatment of a serious matter with humor.', example: 'A moment of levity in a tense meeting.' },
  intimate: { phonetic: '/ˈɪntɪmət/', pos: 'adjective', meaning: 'Closely acquainted; familiar; personal.', example: 'An intimate conversation.' },
  revelation: { phonetic: '/ˌrevəˈleɪʃən/', pos: 'noun', meaning: 'A surprising and previously unknown fact.', example: 'The book contains many revelations.' },
  quivering: { phonetic: '/ˈkwɪvərɪŋ/', pos: 'verb', meaning: 'Trembling or shaking with a slight rapid motion.', example: 'Her voice was quivering.' },
};
window.MOCK = MOCK;
