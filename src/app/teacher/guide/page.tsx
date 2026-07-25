"use client";

// Teacher guide — how the platform works, with homework covered properly
// (the part teachers ask about most). Plain prose, no video, no gating: a
// teacher should be able to read this once and get on with teaching.

import Link from "next/link";
import { Icon } from "@/components/shared/icons";

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--omnic-tenant-primary-soft)",
          color: "var(--omnic-tenant-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <div className="body-sm" style={{ lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Icon name={icon as any} size={18} />
        <h2 className="h3" style={{ margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function TeacherGuidePage() {
  return (
    <div style={{ maxWidth: 780 }}>
      <h1 className="h1" style={{ margin: 0 }}>Teacher guide</h1>
      <p className="body" style={{ marginTop: 4, marginBottom: 24 }}>
        Everything you need to run lessons here — start to finish.
      </p>

      <Section title="Getting set up" icon="calendar">
        <Step n={1} title="Open your availability">
          Go to <Link href="/teacher/calendar" className="link">Calendar</Link>, pick
          the <strong>Open brush</strong>, and drag across the hours you can teach.
          Students can only book inside these green windows. Tick{" "}
          <em>apply every week</em> to make it your standing schedule, or use{" "}
          <strong>Copy this week</strong> to repeat it forward.
        </Step>
        <Step n={2} title="Add your meeting room">
          <strong>Meeting room</strong> on the Calendar page stores your permanent
          Google Meet link. Every lesson you get is created with it already
          attached, so neither you nor the student has to hunt for a link.
        </Step>
        <Step n={3} title="Block time off">
          Use <strong>Time off</strong> for holidays or travel. Existing lessons
          inside the range are not deleted — you&apos;ll be told to move or cancel
          them, so nobody silently loses a lesson.
        </Step>
      </Section>

      <Section title="Running a lesson" icon="video">
        <Step n={1} title="Start the session">
          From <Link href="/teacher/sessions" className="link">Sessions</Link>, click
          the lesson and press <strong>Start</strong>. For something unscheduled,
          use <strong>Start session</strong> — it puts a real lesson on the calendar
          at the current time and opens it.
        </Step>
        <Step n={2} title="Pick your audio source">
          <strong>Mic + Google Meet</strong> captures both sides of the call — that&apos;s
          the one you want. You&apos;ll be asked to share your Meet tab; make sure{" "}
          <em>Share tab audio</em> is ticked, or only your own voice is recorded.
        </Step>
        <Step n={3} title="Teach with the side panel">
          <strong>Reading</strong> shares a text with the student,{" "}
          <strong>Quiz</strong> generates questions from what you&apos;ve covered,{" "}
          <strong>Questions</strong> gives conversation prompts, and{" "}
          <strong>Notes</strong> is your private scratchpad. Notes auto-save.
        </Step>
        <Step n={4} title="End the session">
          <strong>End Session</strong> stops the recording and starts transcription.
          If the student never turned up, use <strong>No-show</strong> instead —
          that applies the academy&apos;s policy rather than logging a fake lesson.
        </Step>
      </Section>

      <Section title="Homework — the part worth reading" icon="book">
        <p className="body-sm" style={{ marginBottom: 12, lineHeight: 1.6 }}>
          The platform drafts homework from the lesson transcript. Your job is
          judgement, not authoring: check it, fix what the AI got wrong, cut what
          isn&apos;t useful, then send it.
        </p>
        <Step n={1} title="Open the Homework tab">
          On a finished session, the <strong>Homework</strong> tab holds the draft.
          Press <strong>Generate</strong> if it&apos;s empty — it reads the transcript.
        </Step>
        <Step n={2} title="Edit like a document">
          It&apos;s a normal editor. Use <strong>Insert</strong> to add exercises:
          <br />
          • <strong>Fill in the blank</strong> — you set the expected answer; graded automatically.
          <br />
          • <strong>Multiple choice</strong> — you mark the correct option; graded automatically.
          <br />
          • <strong>Open answer</strong> — short or long writing; you grade it yourself.
        </Step>
        <Step n={3} title="Assign it">
          <strong>Assign to student</strong> sends it. Answers and correct options
          are stripped before the student sees it — they can never read the key
          from the page.
        </Step>
        <Step n={4} title="Review the submission">
          Submitted homework appears in <strong>Needs attention</strong> on your
          dashboard. Auto-graded items are already marked; you score the open
          answers and can override any mark. Publishing the review is what shows
          the student their score and the correct answers.
        </Step>
        <p className="body-sm" style={{ marginTop: 12, lineHeight: 1.6, color: "var(--omnic-gray-600)" }}>
          Aim to publish lesson material within 24 hours, and to check submitted
          homework before your next lesson with that student.
        </p>
      </Section>

      <Section title="Reading library &amp; vocabulary" icon="bookmark">
        <Step n={1} title="Read together">
          Open a text in <Link href="/teacher/library" className="link">Library</Link>.
          Pick the student you&apos;re reading with at the top — the whole page works
          in that student&apos;s context.
        </Step>
        <Step n={2} title="Send words to their flashcards">
          Tap any word to see its meaning, then{" "}
          <strong>Send to Student&apos;s Flashcards</strong>. It lands in that
          student&apos;s spaced-repetition deck and comes back for review on a
          schedule. Words the dictionary doesn&apos;t know are translated instead, so
          nothing dead-ends.
        </Step>
      </Section>

      <Section title="Your students" icon="users">
        <Step n={1} title="Know where they stand">
          <Link href="/teacher/students" className="link">Students</Link> → click
          anyone to see lessons remaining, level, contact details, homework status
          and lesson history. Check the balance before promising a lesson: at zero,
          bookings stop.
        </Step>
      </Section>
    </div>
  );
}
