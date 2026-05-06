# Omnica English — Handoff Notes for Claude Code

> Backend & permissions behavior that isn't visible in the UI mocks but must be implemented. Pair this with the design prototype (`Omnic Portal.html`).

**Stack:** Next.js (App Router) + React + Tailwind CSS. Multi-tenant: each tenant is a separate domain (`{tenant}.omnica.app`). Portal data and auth come from our backend API; design tokens are exposed as CSS custom properties so tenant branding can rewrite them at runtime without a rebuild.

---

## Multi-tenancy guardrails (applies to ALL items below)

Every feature must stay vertical-agnostic. Where the spec describes language-school behavior (teachers, students, sessions), the same primitives apply to:
- therapy clinics (clinicians, patients, appointments)
- gyms / yoga studios (trainers, members, classes)
- coaching practices (coaches, clients, sessions)

Use the terminology-override layer (Tenant Branding → Terminology overrides). DO NOT hardcode "teacher" / "student" in component copy — pull labels through the override resolver (`useTerminology()` hook).

---

## 1. Permissions model

**Roles to support:**
- `Super Admin` — can toggle and change all admin permissions; manages role definitions
- `Admin (Manager)` — full operational dashboard
- `Admin (Sales)` — restricted to people / billing / sales-relevant views
- `Instructor` (Teacher) — see #2
- `Student` — base role

All admin sub-roles see the Admin Dashboard but with different sidebar items, table columns, and action buttons enabled per their permission set. The Admin → Permissions page lets Super Admin toggle each capability per role. Capabilities at minimum:

- view/edit students, view/edit instructors, view/edit invoices, edit AI prompts, edit branding, edit scheduling policies, impersonate users, view financials.

Capability checks must run server-side on every API route — never rely on the client hiding a button.

## 2. Instructor-specific permission flags

Default: instructors have admin-level calendar power (create / edit / delete events). Admin can revoke per-instructor:

- Ability to assign themselves students (DEFAULT: OFF — must be admin-granted)
- Ability to add new students (DEFAULT: OFF — must be admin-granted)
- Ability to create new calendar events (DEFAULT: ON, can be revoked)
- Ability to cancel sessions (DEFAULT: ON; if revoked, instructor can SEND a cancel request, similar to students)
- Ability to delete sessions (DEFAULT: ON; if revoked, request flow as above)
- Ability to move sessions outside their own week / a custom window (DEFAULT: ON, restrictable)

When a permission is revoked and the instructor takes the action, fire a request workflow (approval queue) for an admin to approve/reject.

## 3. Soft-delete sessions

Even if an instructor deletes a session, the record is NOT hard-deleted. Set `deleted_at` on the `LessonRecording` row and exclude from default list queries. An admin-only "Deleted Sessions" list view exposes them with a Restore action.

## 4. Notification system

Portal events generate notifications visible in the in-app bell:

- Admin impersonates a user → notify the impersonated user
- Session published → notify student
- Cancel/reschedule request created → notify other party + admins
- Permission-elevation request created → notify admins
- Achievement unlocked → notify student
- Invoice paid/overdue → notify student + admins

Use a websocket / SSE channel for portal-side push so the bell updates without reload.

## 5. Calendar — backend behavior

- Each instructor has their own calendar with an exportable ICS feed (`/api/calendar/ics?instructor=...`)
- A "collective calendar" view aggregates ALL instructors + global events — pure read view, scoped by admin permission
- "Global events" = events not tied to a specific student (e.g., holiday, group workshop)
- Group events have `enrolled_count` and `capacity` fields — students can sign up; signup writes an `EventParticipant` row
- Students can toggle which event types appear on their personal calendar (preference stored on user profile)
- Reschedule/cancel requests use the existing scheduling-window policy

## 6. Calendar event types

- **1-on-1 session** (the standard `LessonSession` row)
- **Group event** (`GroupEvent` with an `enrolled` join table)
- **Off-line event** (no specific instructor required)
- **Tenant-global event** (visible to all users in the tenant)

All four types render on the same calendar grid with the type indicated by color/badge.

## 7. Vocabulary / Decks

- Each finalized lesson auto-creates a deck named after the lesson title (1:1 relationship — the lesson "owns" its deck)
- Each student has exactly ONE custom deck where they can pin words from any lesson
- Adding a single word manually writes to that custom deck
- Both surface on the portal Vocabulary page via `api/vocab/decks` and `api/vocab/add`

## 8. Upload page (lesson uploaded post-hoc)

When a teacher chooses "Upload Recording" from the Start Session modal, they go to a dedicated upload page (NOT directly to the live transcription view). After upload completes and the transcription provider returns, they land on the standard Session Detail / Summary page.

## 9. AI Manager — Soniox transcription cost

The AI Manager's cost breakdown includes a Soniox per-minute transcription rate (configurable). Per-lesson estimate:

`(prompt_costs) + (avg_lesson_minutes × soniox_per_minute)`

## 10. Admin Sessions view

Admins do NOT see a "Start Session" button — admins don't deliver lessons. The view is read-only with two subtabs:

- **Past sessions** — all completed/draft recordings, who taught them, status
- **Upcoming** — scheduled sessions limited to next 7 days, expandable to 14 / 30 days

---

## File / route mapping (suggested)

| Prototype JSX | Suggested Next.js location |
|---|---|
| `student.jsx` | `app/(student)/portal/...` route group |
| `teacher.jsx` | `app/(teacher)/portal/...` |
| `admin.jsx` | `app/(admin)/portal/...` |
| `library.jsx` | shared `app/portal/library/[id]/page.tsx` |
| `components.jsx` | `components/shared/*` |
| `tokens.css` + `layout.css` | `styles/tokens.css` (CSS vars) + Tailwind theme extension that reads them |
| `data.jsx` | replaced by API routes (`app/api/*`) + server components |

The role-switching tweak in the prototype maps to middleware that reads the session and rewrites to the correct route group.
