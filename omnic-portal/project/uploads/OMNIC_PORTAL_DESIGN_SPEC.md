
# Omnic Portal — Design Specification for Claude Design
> **Target tool:** Claude Design (`claude.ai/design`) — Opus 4.7  
> **Handoff:** Export design bundle → Claude Code for Frappe implementation  
> **Date:** 2026-05-01  
> **Status:** Draft v1 — ready for review
---
## 0. Product Identity
**Product name:** Omnic  
**Tagline:** The class management platform for any business that teaches.  
**Brand colors:** Red (`#DC2626`), White (`#FFFFFF`), Gray (`#6B7280`, `#F3F4F6`, `#1F2937`)  
**First tenant:** LinguaLab (English language academy) — brand color: Green (`#16A34A`)  
**Multi-tenant model:** Each tenant = one Frappe site = `tenant.omnic.com`. Portal surfaces adapt per-tenant via configuration.  
**Vertical agnosticism:** Same SPA serves language schools, therapy clinics, gyms, yoga studios, coaching practices. Terminology, feature toggles, and color accent change per tenant.
---
## 1. URL Architecture
| URL | Role(s) | Content |
|---|---|---|
| `tenant.omnic.com/` | All | Redirect to `/portal` if authenticated, login page if not |
| `tenant.omnic.com/portal/` | All | Role-adaptive SPA home / dashboard |
| `tenant.omnic.com/portal/*` | All | All portal sub-pages (client-side Vue Router) |
| `tenant.omnic.com/app/` | Admin, Teacher | Frappe Desk — advanced admin backend (not part of this design) |
**Key principle:** `/portal/` IS the dashboard. No separate `/portal/dashboard` route. The landing view shows the role's dashboard content, and the sidebar navigates to sub-pages. The `/portal/` URL does not change when navigating between tabs — it stays as the base URL with hash or history-mode sub-routes handled by Vue Router.
**Role detection:** Portal SPA calls `frappe.auth.getCurrentUser()` on mount. Role determines which sidebar items render and which content appears.
---
## 2. Design System
### 2.1 Colors
| Token | Value | Usage |
|---|---|---|
| `--omnic-red` | `#DC2626` | Primary actions, active states, badges, Omnic brand mark |
| `--omnic-red-hover` | `#B91C1C` | Button hover, link hover |
| `--omnic-white` | `#FFFFFF` | Card backgrounds, page background |
| `--omnic-gray-50` | `#F9FAFB` | Page background |
| `--omnic-gray-100` | `#F3F4F6` | Card borders, subtle separators |
| `--omnic-gray-400` | `#9CA3AF` | Secondary text, placeholders |
| `--omnic-gray-600` | `#4B5563` | Body text |
| `--omnic-gray-800` | `#1F2937` | Headings, primary text |
| `--omnic-tenant-primary` | Tenant-specific (LinguaLab: `#16A34A`) | Sidebar active indicator, tenant logo accent, tenant-specific highlights |
**Tenant accent usage:** The tenant primary color replaces `--omnic-red` for non-Omnic-brand surfaces within the portal: sidebar active-state dot, "Welcome back" accent underline, stat card highlight borders. The Omnic red remains for the top-left Omnic logo mark and global "Powered by Omnic" footer.
### 2.2 Typography
| Token | Value |
|---|---|
| Font family | Inter (sans-serif) |
| Heading 1 | 24px / 700 |
| Heading 2 | 20px / 600 |
| Heading 3 (card titles) | 16px / 600 |
| Body | 14px / 400 |
| Body small | 12px / 400 |
| Sidebar labels | 13px / 500 |
### 2.3 Spacing
| Token | Value |
|---|---|
| Page padding | 24px |
| Card padding | 20px |
| Card gap | 16px |
| Sidebar width | 240px (desktop) |
| Bottom nav height | 64px (mobile) |
| Section gap | 32px |
### 2.4 Components
**Cards:** White background, 1px `--omnic-gray-100` border, 8px border-radius, subtle shadow (`0 1px 3px rgba(0,0,0,0.06)`). Cards contain: a heading, a value/metric, and optionally a sub-label or icon.
**Buttons:**  
- Primary: `--omnic-red` background, white text, 6px radius, 14px/500 font, 8px/16px vertical/horizontal padding  
- Secondary: White background, `--omnic-gray-400` border, `--omnic-gray-800` text  
- Ghost: Transparent, `--omnic-gray-600` text, hover shows `--omnic-gray-100` background  
**Sidebar:** Left side on desktop (240px fixed). White background, border-right 1px `--omnic-gray-100`. Logo at top. Nav items as vertical list with icon + label. Active item has `--omnic-tenant-primary` left-border (3px) and light tint background. Collapsible sections with caret indicators.
**Bottom nav:** Mobile only. Fixed bottom bar (64px). 4–5 icon-labeled tabs. Active tab uses `--omnic-tenant-primary` fill.
**Status pills:** Small rounded capsules (12px/500 font, 6px/10px padding). Colors: Active=green, Paused=amber, Cancelled=red-300, Trial=blue, New=gray.
**Avatar circle:** 40px circle with initials. Background: `--omnic-tenant-primary` at 15% opacity, text: `--omnic-tenant-primary`. Larger 64px variant for profile pages.
**Metric cards:** White card with a number (28px/700) and a label (12px/400 gray).
---
## 3. Global States
### 3.1 Loading
Skeleton cards (gray pulse) matching the card grid layout. No spinner-only loading — always skeleton placeholders for perceived speed.
### 3.2 Empty
When a list has zero items: centered illustration (simple line-art), heading "No [items] yet", subtext "When you [do X], [items] will appear here", and a CTA button when applicable.
### 3.3 Error
Inline red banner at top of content area: "Something went wrong." with Retry button. Does not take over the full page.
### 3.4 Cross-tab navigation
Instant. No page reload. Content area swaps via Vue Router `<router-view>`. Sidebar/bottom nav remains static.
---
## 4. Student Portal
**Base role:** `Student` (Frappe Education role)  
**Mobile-first.** Desktop sidebar, mobile bottom nav.
### 4.1 Sidebar / Navigation
**Desktop sidebar items:**
1. Home (house icon) — `/portal/`
2. My Lessons (book-open icon) — `/portal/lessons`
3. Study (brain icon) — `/portal/study` — badge: number of due cards
4. My Words (bookmark icon) — `/portal/vocabulary`
5. Calendar (calendar icon) — `/portal/calendar`
6. Achievements (trophy icon) — `/portal/achievements`
**Mobile bottom nav:** Home | Lessons | Study | Calendar | Profile
**Conditional items:** Study, My Words, and Achievements are hidden when the tenant has `gamification_enabled = false` (e.g., therapy clinic).
**Profile access:** Avatar circle at bottom of sidebar (desktop) or last tab in bottom nav (mobile). Opens a dropdown: Profile, Billing, Logout.
### 4.2 `/portal/` — Student Dashboard
**Layout:** 2-column on desktop (cards + activity), single column stacked on mobile.
**Section 1: Welcome bar** — "Welcome back, [First Name]" on left. Streak flame icon + "X-day streak" on right.
**Section 2: "Next Up" card (priority, top-left on desktop).** Logic:
- If a class is scheduled within 60 minutes: "Join Class in [X] min" in large text, class name, teacher name, "Join" button (opens Google Meet link).
- If no upcoming class but SRS cards due: "Study Due Today" with "[N] flashcards ready" and "Start Studying →" button linking to `/portal/study`.
- If neither: "All caught up! 🎉" with "Browse your lessons →".
- If gamification disabled: just show the next upcoming class or "No upcoming classes."
**Section 3: Stat cards row (3–4 cards):**
- Total Lessons Completed (number)
- Words Learned (number — from vocabulary table)
- Flashcards Reviewed (number)
- Current Streak (days)
Each card: icon at top, number in 28px bold, label below in gray.
**Section 4: Recent Lessons list (3 most recent finalized lessons).** Each row: lesson title, date, word count badge. Tap → `/portal/lessons/:id`.
**Empty state (new student, zero lessons):** Welcome card replaces stat cards. "Start your journey! Your lessons will appear here after your teacher publishes them." Stat cards show zeroes.
### 4.3 `/portal/lessons` — My Lessons
**List view:** Vertical list of lesson cards. Each card: lesson title, date, teacher name, duration, word count badge, a right chevron. Sorted by most recent first. Search bar at top (filters by title). Pull-to-refresh on mobile.
**Tabs/filters:** All | Upcoming | Past. Default: All.
**Empty:** "No lessons yet. Your completed lessons will appear here after your teacher publishes them."
### 4.4 `/portal/lessons/:id` — Lesson Detail
**Sections (vertical scroll):**
1. **Header:** Lesson title, date, teacher name, duration. "Play Audio" button if audio file attached (plays inline audio player).
2. **Summary:** AI-generated summary text. Rendered as prose with paragraph breaks. Collapsible if long (show first 150 words, "Read more" expand).
3. **Vocabulary:** Table or card grid: Word | Translation | Part of Speech. Each word has a speaker icon for TTS pronunciation (Web Speech API).
4. **Flashcards:** Inline flip cards (3–5 cards). Tap to flip between word and definition. "Study All in Deck →" link opens `/portal/study` filtered to this lesson's deck.
5. **Quiz:** If quiz exists and student hasn't completed: inline quiz (multiple choice, 5–10 questions). Submit button at bottom. Score shown on completion. If already completed: shows score + "Retake" button.
6. **Action Items:** If lesson is therapy/coaching vertical: action items list (checkable, but student can't modify — read-only view of what teacher published).
**Missing content states:** If any AI section wasn't generated (status ≠ Approved), show a muted placeholder: "Not yet available."
### 4.5 `/portal/study` — The Study Engine
**Header:** "Study Flashcards" with deck selector dropdown (default: "All Due"). Below: "[N] cards due today" or "All caught up! 🎉".
**Flashcard component (main interaction):**
- Card front: prompt text (word, or question). 200px height, white card with subtle shadow, centered text.
- Tap anywhere → card flips (CSS 3D transform, 0.4s ease). Back shows: definition, part of speech, example sentence, and the lesson it came from.
- Below card: 4 rating buttons in a row:
  - **Again** (red, 1) — will repeat in 1 minute
  - **Hard** (orange, 2) — harder than expected
  - **Good** (green, 3) — normal recall
  - **Easy** (blue, 4) — effortless
- On tap: button shows brief pressed state, then next card slides in from right (slide transition, 0.3s).
- **Session progress:** Progress bar at top showing "Card 5 of 20". Streak counter updates in real-time.
- **Session end:** When no more due cards: celebration screen. Large icon (party popper), "Session Complete!", stats: Cards reviewed, Accuracy, Time spent. "Back to Dashboard" button.
**Empty state (no due cards):** "All caught up! 🎉 Check back tomorrow for review cards." Illustration of a relaxed character.
**Gamification disabled state:** This page redirects to `/portal/`.
### 4.6 `/portal/vocabulary` — My Words
**Layout:** Searchable, filterable word list.
**Top:** Search bar (searches English word or translation). Filter chips: All | Recent | By Lesson.
**List:** Each word row: English word (bold), Translation (gray), Part of Speech (pill badge), speaker icon for audio.
**"Create Deck" button:** Opens modal. Name your deck, select words from the full vocabulary list (checkboxes). Deck appears in deck list.
**Deck list toggle:** Switch between "All Words" and "My Decks" view. Deck view shows deck cards with word count and "Study" button.
**Empty:** "No vocabulary yet. Words appear here after your teacher publishes lessons with vocabulary."
### 4.7 `/portal/calendar` — Calendar
**View:** Month grid (desktop) or agenda list (mobile default). Toggle between month/list.
**Month grid:** Standard calendar grid. Days with classes have a colored dot (tenant primary color). Tap a day → list of classes below the grid.
**Agenda list (mobile):** Chronological list of upcoming classes. Each item: date, time, class title, teacher name, status badge (Upcoming/Live/Completed). "Join" button for live classes.
**"Sync to Calendar" button:** Opens dropdown: "Add to Google Calendar" / "Add to Apple Calendar". Generates .ics file download (future implementation — button present in design but marked "Coming soon" on first pass).
**Empty:** "No classes scheduled yet."
### 4.8 `/portal/achievements` — Achievements
**Layout:** Grid of achievement cards (3 columns desktop, 2 tablet, 1 mobile).
**Each card:**  
- **Unlocked:** Full color icon/trophy, achievement name, description, date unlocked. Tenant-primary accent border.  
- **Locked:** Grayscale icon, achievement name, description, lock icon, progress bar if partially complete (e.g., "Review 50 flashcards — 32/50").
**Stats at top:** Total achievements unlocked / total available. Current streak. Longest streak. Total study time.
**Empty (gamification disabled):** Page hidden from nav entirely.
### 4.9 `/portal/profile` — Profile
**Layout:** Centered, max-width 480px.
**Sections:**
1. Avatar (large circle, initials), name, email. "Edit" button opens inline form.
2. Stats summary: Lessons completed, Words learned, Streak.
3. Billing section: "Sessions Remaining: 8 of 24" with progress bar. "Purchase More" button (leads to invoice/checkout — future, button present but marked "Contact your provider" for now).
4. "Sign Out" button (secondary).
---
## 5. Teacher Portal
**Base role:** `Instructor` (Frappe Education role) or `Teacher` (custom role — whichever the tenant uses)  
**Desktop-first.** Sidebar always visible.
### 5.1 Sidebar
**Items:**
1. Home (house) — `/portal/`
2. Sessions (video-camera icon) — `/portal/sessions`
3. Students (users icon) — `/portal/students`
4. Calendar (calendar icon) — `/portal/calendar`
5. Reports (chart-bar icon) — `/portal/reports`
**Transcribe access:** Accessed via "Start Session" button on the Sessions page or Calendar. Not a top-level sidebar item.
### 5.2 `/portal/` — Teacher Dashboard
**Layout:** 2-column.
**Left column:**
- **"Today at a Glance" card:** Upcoming classes for today (list). Each: time, student name, class title, status. "Start Session" button for the next upcoming class.
- **Recent Recordings:** Last 3 recordings with status (Draft/Finalized), date, student name.
**Right column:**
- **Stat cards:** Total Students, Published Lessons This Month, Hours Taught This Month, Pending Reviews (recordings in Draft status).
- **Quick Actions:** "Start Session" (primary button — opens session start dialog), "View All Sessions" (secondary).
### 5.3 `/portal/sessions` — Sessions (Lesson Recordings)
**Top:** "Start Session" button (primary, red). Search bar.
**List view:** Table or card list of all recordings. Columns: Title, Student, Date, Duration, Status (Draft | Finalized), Workflow (Transcribed | Generating | Review | Approved). Sortable by date.
**Tap a session →** `/portal/sessions/:id`.
**Empty:** "No sessions yet. Schedule a class and come back to start recording."
**"Start Session" flow (critical interaction):**
Clicking "Start Session" opens a modal/dialog with two steps:
**Step 1: Select Scheduled Class** — dropdown list of today's scheduled classes (from Course Schedule) AND classes within the reschedule/cancel window. Each option shows: student name, time, class title. If no classes scheduled: "No classes scheduled for today. Schedule one from the Calendar." with a link to Calendar.
**Step 2: Choose Capture Mode** —  
- **Live Recording** (microphone icon): Opens the session page with browser audio capture (mic + tab audio). Real-time Soniox transcription appears as the session progresses.  
- **Upload Recording** (upload icon): Opens file uploader. Accepts audio AND video files. Teacher uploads post-hoc. Session is marked "In Progress — Awaiting Upload."  
- **Cancel**
**After selecting Live Recording:** Full-screen session page opens (this IS the transcription page — see 5.4).
### 5.4 `/portal/transcribe` — Session Page (Live Recording)
**This page is opened from the "Start Session" flow, not the sidebar.**
**Layout:** Full-screen, minimal chrome. This is an active teaching/recording interface.
**Top bar:** Session title (student name + class title), timer (MM:SS elapsed), "Stop & Save" button (red).
**Audio source indicators:** Small chips showing active inputs: "Microphone: On" (green dot), "Tab Audio: On" (green dot). If a source fails, chip turns red with "Reconnect" button.
**Live transcript area (center, scrollable):**  
- Real-time partial transcript (gray, italic) at the bottom  
- Finalized transcript segments above (black text)  
- Speaker labels: "Teacher" / "[Student Name]" (from Soniox diarization tokens)  
- Smooth auto-scroll as new text arrives
**Upload fallback:** If teacher chose "Upload Recording" mode, the session page shows a large upload zone: "Drop audio or video file here" with browse button. Progress bar during upload. After upload: "Processing..." with spinner, then "Transcription Complete" with a preview of the transcript.
**On Stop & Save:**  
- All in-flight audio chunks are drained and sent to Soniox  
- Recording is saved with `status: transcribed`  
- Teacher is redirected to `/portal/sessions/:id` (the session detail page)  
- A toast: "Recording saved. AI content generation can be started from the session page."
### 5.5 `/portal/sessions/:id` — Session Detail (Teacher Review)
**This replaces the current Desk form at `/app/lesson-recording/`.**
**Sections:**
1. **Header:** Lesson title (editable inline), student name, date, duration, status badge (Draft/Finalized).
2. **Transcript tab (default):** Full transcript text, read-only. "Download Audio" button if audio file exists.
3. **AI Content tabs:** Each is a tab OR an accordion section:
   - **Summary:** Editable text area pre-filled with AI-generated summary. "Regenerate" button with model selector dropdown (small, inline).
   - **Vocabulary:** Editable table. Columns: Word, Translation, Part of Speech. Add/remove rows. "Regenerate" button.
   - **Flashcards:** Editable card list. Front/back fields per card. "Regenerate" button.
   - **Quiz:** Editable quiz JSON or structured form (expandable questions with 4 options each, correct answer selector). "Regenerate" button.
4. **Generation controls:** "Generate All" button (primary) — runs all four AI generators. Model selector dropdown (default: tenant's configured model, e.g., `google/gemini-3-flash-preview`). Per-section status badge (Pending | Generating | Review | Approved).
5. **Action bar (bottom, sticky):**  
   - "Save Changes" — saves edits  
   - "Publish to Student" — sets `workflow_status = Finalized`, makes lesson visible to student  
   - "Reopen" — if already finalized, reverts to Draft  
   - "Delete Recording" — with confirmation dialog
**State indicator banner:** If `course_schedule` is missing (recording not linked to a scheduled class): yellow warning banner "This recording is not linked to a scheduled class."
### 5.6 `/portal/students` — Student Roster
**Layout:** Table with columns: Name (avatar + full name), Email, Status (Active/Paused/Cancelled pill), Lessons Completed, Last Activity, Assigned Teacher.
**Top:** Search bar. "Add Student" button (opens invite form). Filter chips: All | Active | Trial | Paused | Overdue | Cancelled.
**Tap student →** Student detail page (future expansion — for now, shows read-only profile with stats and lesson history).
### 5.7 `/portal/calendar` — Teacher Calendar
**Identical to student calendar (4.7) but additionally:**  
- "Schedule Class" button (top-right). Opens modal: select student, date/time, duration, class title, online/offline toggle.  
- Classes are color-coded by status: Upcoming=tenant primary, Completed=gray, Cancelled=red-300.
### 5.8 `/portal/reports` — Teacher Reports
**Two tabs:**
1. **Student Engagement:** Table. Columns: Student Name, Lessons Completed, Flashcards Reviewed, Current Streak, Last Activity. Sortable by each column. "Export CSV" button.
2. **Recording Pipeline:** Table. Columns: Lesson Title, Date, Status, AI Generation Status, Duration. Filter by date range. At-a-glance counts at top: Total, Finalized, Draft, Failed.
---
## 6. Admin Portal
**Base role:** `System Manager` or custom `Admin` role  
**Desktop-first.** The admin uses the portal for daily operations and falls back to `/app/` (Frappe Desk) for advanced ERPNext configuration.
**Design principle:** The admin portal should feel like a complete business management surface. It is not a "lite" version — it is the primary interface. Desk is the "advanced settings" power-user fallback.
### 6.1 Sidebar
**Collapsible sections with sub-items (matching Talk Club pattern):**

├── Dashboard → /portal/  
├── People → section header (not a link)  
│ ├── All People → /portal/people  
│ └── Analytics → /portal/people/analytics  
├── Sessions → /portal/sessions  
├── Billing → /portal/billing  
├── Settings → section header  
│ ├── AI Manager → /portal/settings/ai  
│ ├── Achievements → /portal/settings/achievements  
│ ├── Scheduling Policies → /portal/settings/scheduling  
│ └── Branding → /portal/settings/branding  
└── Open Desk → → /app/ (external link, opens in new tab)

text

**Count badges:** Next to "All People" — total count. Next to "Sessions" — count of Draft recordings needing review.
### 6.2 `/portal/` — Admin Dashboard
**Layout:** 2-column desktop, stacked mobile.
**Top row: Metric cards (4 across, 2 on mobile):**
- Total Teachers
- Total Students
- Total Sessions (this month)
- AI Prompts Used (this month)
**Second row:**
- **Monthly P&L card (2/3 width):** Pulls from ERPNext financial data. Shows:
  - Total Revenue
  - Ad Spend
  - Other Expenses
  - Teacher & Employee Payments
  - Net Profit
  - Month selector dropdown (default: current month)
  - All values in tenant's currency
  - If ERPNext data not available: "Connect ERPNext billing to see financial data" placeholder.
- **Subscription summary (1/3 width):**
  - Active: N
  - Paused: N
  - Trial: N
  - New this month: N
  - Renewed: N
**Third row: Recent Activity feed.**
- List of recent events: "New student registered — 2 hours ago", "Lesson published: 'Business English' — 3 hours ago", "Teacher Mustafa completed session — yesterday". Each with timestamp and a subtle icon.
**Bottom: Quick Links.** Cards linking to: Manage People, AI Manager, Scheduling Policies, Branding.
### 6.3 `/portal/people` — People Management
**This is the "Users" + "Students CRM" merged view from Talk Club.**
**Top row: Status filter pills with counts:**
All (N) | Active (N) | Trial (N) | Paused (N) | Overdue (N) | Cancelled (N)
**Search bar:** Search by name or email.
**"Add Person" button** — opens modal: email, full name, role (Student/Teacher/Admin), assign teacher (dropdown).
**Table:**
| Name | Email | Role | Assigned Teacher | Created | Status |
|---|---|---|---|---|---|
| Avatar + full name | email | pill (Student/Teacher/Admin) | name or "--" | date | Active/Paused/etc pill |
**Row actions (three-dot menu or inline buttons):** Edit, Pause/Activate, Delete (with confirmation), Impersonate (admin only, opens student's portal view in new tab).
**Tap row →** Person detail slide-out or page: profile info, lesson history, billing status, assigned teacher, notes.
### 6.4 `/portal/people/analytics` — People Analytics
**Monthly P&L focused on student metrics:** (Same as the analytics screenshot from Talk Club)
- Month selector
- Total Revenue
- Ad Spend
- Other Expenses
- Teacher & Employee Payments
- Net Profit
- Renewed Subscriptions count
- New + Renewed count
- Paused Students count
- Trial Students count
- Unique Students count
- All-time total
**Expenses section below:** Table of expenses for the month. "No expenses recorded for this month" empty state.
**Data source:** ERPNext `Account` and `Expense Claim` documents, summarized per month. If ERPNext financials not configured, show "Set up ERPNext Financials to see analytics" with a "Open Desk →" link.
### 6.5 `/portal/sessions` — All Sessions
**Admin-level view of ALL recordings across all teachers.**
**Table:** Title, Student, Teacher, Date, Status, AI Status. Filter by teacher, status, date range. Bulk actions: "Publish Selected", "Delete Selected".
**Tap session →** Same detail view as teacher (5.5) but with admin-level edit permissions.
### 6.6 `/portal/billing` — Billing Overview
**Tab 1: Invoices.** Table from ERPNext `Sales Invoice`: Invoice #, Student, Amount, Status (Paid/Unpaid/Overdue), Date. "Create Invoice" button → Desk fallback for now.
**Tab 2: Subscriptions.** Table: Student, Plan (e.g., "12 sessions", "24 sessions"), Sessions Remaining, Sessions Used, Status (Active/Paused/Cancelled), Start Date, End Date.
**Tab 3: Payments.** Table: Date, Student, Amount, Method, Invoice reference.
**Design note:** Billing UI is intentionally simple for v1. Most financial complexity lives in ERPNext Desk. The portal surfaces the operational view: who owes what, who has sessions remaining.
### 6.7 `/portal/settings/ai` — AI Manager
**Directly from the Talk Club AI Manager screenshot:**
Four cards, one per prompt config:
| Card | Model | Temp | Max Tokens | Output Format | Cost Estimate |
|---|---|---|---|---|---|
| Lesson Summary | google/gemini-3-flash-preview | 0.3 | 500 | text | $0.000025 |
| Vocabulary Extraction | google/gemini-3-flash-preview | 0.2 | 2000 | json | $0.000033 |
| Flashcard Generation | google/gemini-3-flash-preview | 0.2 | 2000 | json | $0.000027 |
| Quiz Generation | google/gemini-3-flash-preview | 0.4 | 2000 | json | $0.000028 |
**Total cost per lesson estimate:** $0.000113
**Each card has:** "Edit" button → inline form to change model, temperature, max tokens, output format, and the prompt template itself (large textarea). "Test" button → opens dialog with sample transcript input, runs against current config, shows output.
**Cost estimates section:** Assumes ~200 token transcript. Shows per-request token count and estimated cost based on current model pricing. Recalculated when model changes.
### 6.8 `/portal/settings/achievements` — Achievement Manager
**Grid of achievement definition cards (matching Talk Club screenshot):**
Each card:
- Achievement name (editable)
- Description (editable)
- Condition type (dropdown: `review_count`, `lesson_count`, `streak_days`, `perfect_quiz`, `vocabulary_count`)
- Threshold (number)
- Optional: Reward description (e.g., "2 free lessons")
- "Edit" / "Delete" buttons
- "Add Achievement" button at bottom
**List view also shows:** How many students have unlocked each achievement (count badge).
### 6.9 `/portal/settings/scheduling` — Scheduling Policies
**From Talk Club screenshot:**
Three policy fields:
1. **Reschedule Window:** Minimum hours before class start that students can reschedule. Input: number + "hours". Current value: 6.
2. **Cancel Window:** Minimum hours before class start that students can cancel. Input: number + "hours". Current value: 24.
3. **Default Lesson Duration:** Default duration for newly created lessons. Input: number + "minutes". Current value: 60.
"Save Changes" button (primary). Persists to tenant config.
### 6.10 `/portal/settings/branding` — Tenant Branding
**Fields:**
- Tenant Name (text)
- Primary Color (color picker — this is `--omnic-tenant-primary`)
- Logo upload (image uploader with preview)
- Terminology overrides (table: Default Term → Custom Term. E.g., "Student" → "Patient" for a clinic)
- Feature toggles (toggle switches):
  - Gamification Enabled
  - Achievements Enabled
  - Calendar Sync Enabled (future)
Live preview panel on the right showing how the portal sidebar and a sample card will look with current settings.
---
## 7. Authentication & Onboarding
### 7.1 Login Page (`tenant.omnic.com/` — unauthenticated state)
**Layout:** Centered card, max-width 400px.
- Omnic logo + tenant name (e.g., "LinguaLab") at top
- Email input
- Password input
- "Sign In" button (red)
- "Forgot password?" link
- Frappe's built-in OAuth buttons if configured (Google, etc.)
- No "Sign Up" unless tenant allows self-registration (per Frappe settings)
**After login:** Redirect to `/portal/`. Role determines what renders.
### 7.2 First-Time Student Login
When a new student logs in for the first time (zero lessons): dashboard shows the empty welcome state described in 4.2.
### 7.3 First-Time Teacher Login
Zero students, zero recordings. Dashboard shows "Get Started" card: "Schedule your first class from the Calendar, then start recording from the Sessions page."
---
## 8. Mobile Adaptations
### 8.1 Student Portal
- **Bottom nav bar** replaces sidebar (Home | Lessons | Study | Calendar | Profile)
- **Single column** layout on all pages
- **Flashcard study:** Full-screen card. Rating buttons are large touch targets (min 48px height, spread across full width on mobile).
- **Calendar:** Agenda list view by default, month grid accessible via toggle.
- **Profile:** Accessible from bottom nav, not sidebar avatar.
### 8.2 Teacher Portal
- **Hamburger menu** or slide-out sidebar (not bottom nav — teacher functions are more varied, a menu is better than tabs).
- **Session Start flow:** Full-screen modal steps, large inputs.
- **Session detail:** Tabbed content becomes vertical accordion.
- **Reports:** Stacked cards instead of side-by-side tables. Swipeable charts.
### 8.3 Admin Portal
- **Slide-out sidebar** via hamburger menu.
- **Metric cards:** 2-per-row.
- **Tables:** Horizontal scroll with frozen first column (name).
- **P&L card:** Stacked vertically, full width.
- **Settings pages:** Single column, no live preview panel (preview becomes a "Preview" button that opens a modal).
---
## 9. Technical Constraints (for Claude Code implementation)
### 9.1 Stack
- **Framework:** Frappe v15
- **Frontend:** Vue 3 + Frappe UI component library
- **Routing:** Vue Router (history mode)
- **State:** Frappe DocType as source of truth; client state via Vue reactivity
- **Realtime:** Frappe Socket.IO for live transcript updates, generation status updates
- **Styling:** CSS custom properties (design tokens above). Frappe UI base styles overridden via tenant branding tokens.
- **Auth:** Frappe Auth (session cookie). No token management needed — `frappe.auth.getCurrentUser()` on mount.
### 9.2 File Structure (within `apps/omniclass/`)

omniclass/  
public/  
portal/ ← Vue 3 SPA lives here  
index.html ← entry point, mounts Vue app  
assets/  
css/  
tokens.css ← design system tokens  
portal.css ← global portal styles  
js/  
main.js ← Vue app bootstrap, router, Frappe UI init  
router.js ← all portal routes  
components/  
Sidebar.vue  
BottomNav.vue  
MetricCard.vue  
StatusPill.vue  
FlashCard.vue  
SessionStartModal.vue  
...  
pages/  
student/  
Dashboard.vue  
Lessons.vue  
LessonDetail.vue  
Study.vue  
Vocabulary.vue  
Calendar.vue  
Achievements.vue  
Profile.vue  
teacher/  
Dashboard.vue  
Sessions.vue  
SessionDetail.vue  
Transcribe.vue  
Students.vue  
Calendar.vue  
Reports.vue  
admin/  
Dashboard.vue  
People.vue  
PeopleAnalytics.vue  
Sessions.vue  
Billing.vue  
settings/  
AiManager.vue  
Achievements.vue  
Scheduling.vue  
Branding.vue  
api.js ← Frappe REST call wrappers  
auth.js ← auth state, role detection, redirects  
tenant.js ← tenant branding resolver

text

### 9.3 API Endpoints (existing — already built)
The SPA calls these whitelisted Frappe REST endpoints:
| Endpoint | Purpose |
|---|---|
| `omniclass.api.transcription.start_recording` | Begin online recording session |
| `omniclass.api.transcription.append_chunk` | Send audio chunk |
| `omniclass.api.transcription.stop_recording` | End recording, finalize transcript |
| `omniclass.api.transcription.submit_offline` | Submit file for offline transcription |
| `omniclass.api.transcription.get_recording` | Get recording with all AI content |
| `omniclass.api.transcription.list_recordings` | List recordings (filtered by role) |
| `omniclass.api.transcription.generate_section` | Generate one AI section |
| `omniclass.api.transcription.generate_all_content` | Generate all AI sections |
| `omniclass.api.transcription.save_recording_content` | Save teacher edits |
| `omniclass.api.transcription.finalize_recording` | Publish to student |
| `omniclass.api.transcription.reopen_recording` | Reopen finalized recording |
| `omniclass.api.transcription.get_available_models` | List AI models |
| `omniclass.api.gamification.get_review_cards` | Get due SRS cards |
| `omniclass.api.gamification.submit_review` | Submit card rating |
| `omniclass.api.gamification.get_student_stats` | Streak, counts, achievements |
| `omniclass.api.gamification.get_achievements` | All achievements with unlock status |
| `omniclass.api.gamification.get_decks` | Vocabulary decks |
| `omniclass.api.gamification.get_deck_cards` | Cards in a deck |
| `omniclass.api.gamification.get_lesson_detail` | Student-facing lesson detail |
| `omniclass.api.branding.get_tenant_branding` | Colors, logo, terminology |
| `omniclass.api.admin.test_prompt_config` | Test an AI prompt |
### 9.4 Authentication
- Frappe session cookie is set on `/` — all API calls automatically authenticated
- `frappe.auth.getCurrentUser()` returns `{ name, email, roles, full_name }`
- Portal SPA checks roles on mount and enables/disables routes accordingly
- If not logged in, redirect to `/` (login page)
### 9.5 What NOT to Redesign
- `/app/` (Frappe Desk) — untouched, not in scope
- Login page — minimal styling only (Frappe handles it)
- Frappe UI component internals — we use their button/input/table/dialog primitives, just themed
---
## 10. Exclusions (Not in This Design Pass)
- Certificate manager (future)
- iCal / Google Calendar sync (future — button present but non-functional)
- Billing CRUD (portal surfaces read-only overview — create/edit is Desk for now)
- ERPNext CRM pipeline (Desk for now — not surfaced in portal)
- Advanced admin: custom field management, role editing, print formats, ERPNext module configuration (all Desk)
- Student self-registration flow (uses default Frappe signup if enabled)
- Multi-tenant selector (no shared-tenant login — each tenant is a separate URL)
---
## 11. Visual References
The Talk Club platform is the primary visual reference. Key patterns:
- White cards with light borders and subtle shadows
- Left sidebar with collapsible sections, active-state left-border accent
- Metric cards with icon + number + label
- Status pills (Active green, Paused amber, etc.)
- Avatar circles with initials
- Clean, high-density data tables with search and filter chips
- Modal dialogs for focused workflows (Start Session, Add Person, Test Prompt)
Omnic differentiates with:
- Red/white/gray palette instead of blue-purple
- Tenant-specific primary color for sidebar active state and accent highlights
- Slightly more modern card treatment (rounder corners, softer shadows)
- Mobile bottom nav instead of hamburger for student role
---
## 12. Design Output Expected from Claude Design
1. **Design system tokens sheet** — colors, typography, spacing, shadows, border radii
2. **Interactive prototype of Student Portal** — all pages with real interactions (card flip, tab switching, rating buttons, calendar)
3. **Interactive prototype of Teacher Portal** — with Start Session flow, session detail with AI content tabs, student roster
4. **Interactive prototype of Admin Portal** — dashboard, people management, AI manager, scheduling
5. **Mobile variants** for student (bottom nav) and teacher/admin (slide-out sidebar)
6. **Handoff bundle** for Claude Code — all components, styles, and design tokens packaged for implementation
**Prototype behavior:** Prototypes should feel like a real app — clicking sidebar items switches the content area without page reload, flashcards flip on tap, modals open with smooth transitions, mobile views adapt to smaller viewport.

---









