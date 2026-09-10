ORG-SAFETY FIRST: verify E2E_ORGANIZATION_ID is the dedicated E2E organization and is not the launch organization before provisioning; if it is missing, mismatched, or protected, STOP.

# OmniClass student-teacher loop: real microphone session

This is the on-demand human-audio variant of `docs/E2E_RUNBOOK.md`. Load the routine runbook once, follow every stage and every binary PROBE / EXPECT / RECORD / SHOT row in it, and use this document only for the live-audio substitution below. The executor must never run this variant as part of the routine `walk` path.

## 1. Scope and safety

Target the configured real deployment and the guarded dedicated E2E organization only. Use the same three persistent role contexts, one private login-ticket file per role, one fixture key, persona parameter, screenshot budget (14 required moments + at most 10 failure slots), locale restore rules, findings schema, and SHIP / FIX-N-TEST verdict from `E2E_RUNBOOK.md`.

Do not paste or speak passwords, Clerk tickets, API keys, payment details, authorization headers, or private URLs into the microphone. Do not perform a real bank transfer. Do not fix code during the walk. The human-audio step is on-demand because browser automation cannot faithfully speak into a microphone.

## 2. Fixture and role preparation

Run the same guarded `provisionStudentLoop` sequence from the routine runbook, with the selected `Russian`, `Kazakh`, or `Arabic` persona and a future `booking.date` whose vacancy is covered by the fixture teacher. Verify the returned stable IDs and the protected-org guard before opening a browser. The student booking still uses the real student UI; the current live lesson may use the explicit teacher Start session/one-time-now path so the human does not wait for the future booking window.

Use `scripts/dev-login.mjs` through its private-file handoff. Consume each ticket exactly once, never log or screenshot the ticket URL, and keep student/admin/teacher browser contexts alive for the round trip.

## 3. Human speaks into the microphone for 60 seconds

1. Switch to the persistent teacher context and restore the teacher's default/English staff locale.
2. Open the live lesson created through the teacher's real Start session action. Confirm the visible student name, Meet link, lesson title, MicCheck, and End Session controls.
3. Open Google Meet in the visible Meet link if the controlled session requires it. Use headphones or a local loopback that the browser is permitted to capture. Do not record unrelated people or private material.
4. Start the live mic + Meet/tab capture path. Confirm the browser permission prompt only for the intended microphone/tab. If permission is denied, record a finding; do not bypass browser security.
5. Speak the following neutral English fixture passage for approximately 60 seconds, with short pauses and at least two complete sentences. Do not include credentials or personal data:

   "Today we are talking about travel and a lantern. A traveler checks the map, asks a clear question, and writes a short note. The teacher corrects the sentence and explains the meaning of the new word. We compare a morning plan with an evening plan, then we repeat the example so the learner can remember it."

6. Keep the session running until roughly 60 seconds of captured audio has elapsed. Stop recording once, wait for the transcript state to settle, and inspect the transcript panel.
7. Run the exact routine checks `5.6 SESSION-LIVE`, End Session/finalization, provider-degrade handling, AI generation, review/edit/publish, student consumption, homework round-trip, library/locale, and mobile. Do not run the fixture audio upload in this variant; the live mic/tab result is the Soniox evidence.

Expected human-audio evidence:

    PROBE: /teacher/sessions/[id]/live → transcript panel textContent.
    EXPECT: multiple non-empty utterance lines containing words from the spoken passage, produced by the live Soniox path.
    RECORD: pass / fail / NA + first 80 chars only; no raw provider payload.
    SHOT: live-transcript.png

A hard Soniox outage gets one bounded provider retry only when the UI offers a safe retry. A second outage is `WARN-degraded`, not pass. If browser permissions or the microphone are unavailable, record `NA` for live audio with evidence and continue the rest of the checklist using the routine upload run only in a separate run.

## 4. Finish and report

Restore the student persona locale before the final student checks, then restore the deployment default/English before teardown if required. Remove private ticket files. Keep only the standard artifacts:

- `findings.md`
- `visual-summary.md`
- `screenshots/` (hard maximum 24 PNGs)
- `runbook.md.snapshot`
- `browser-events.json`
- `summary.json` with sanitized shot/token counters when available

Use the exact findings template from the routine runbook:

    severity · stage · locale · what · expected · evidence · class

Return one final `VERDICT: SHIP` or `VERDICT: FIX-N-TEST`. This on-demand variant is not a routine acceptance gate and is never launched by `npm run test:walk`.
