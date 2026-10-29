"use client";

// Teacher guide — the operational path through the platform: set up, teach,
// finish the lesson, publish, review homework.
//
// Keep this to what a teacher must do or will otherwise get wrong. No
// philosophy, no feature tour, no copy restating POLICY.md — the UI is the
// source of truth for wording, so button and field names here must match the
// screens exactly (Profile → meeting room, More → Use this week as weekly hours, etc.).

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
        <Icon name={icon} size={18} />
        <h2 className="h3" style={{ margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** Inline link in a step — the page a teacher needs to be on. */
function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="link">{children}</Link>;
}

export default function TeacherGuidePage() {
  return (
    <div style={{ maxWidth: 780 }}>
      <h1 className="h1" style={{ margin: 0 }}>Teacher guide</h1>
      <p className="body" style={{ marginTop: 4, marginBottom: 24 }}>
        Set up, teach, then finish the lesson and publish it. That last part is
        the one the academy counts on you for.
      </p>

      <Section title="Before your first lesson" icon="user">
        <Step n={1} title="Add your meeting room">
          Your avatar menu (top right) → <Go href="/teacher/profile">Profile</Go> →{" "}
          <strong>Your meeting room</strong>. Create a reusable room in Google
          Meet and paste the link — it is attached to every upcoming and live
          lesson, so nobody has to hunt for it. Saving updates lessons that are
          already booked. If Meet says{" "}
          <em>Ask to join</em>, you are signed into a different Google account
          than the one that created the room.
        </Step>
        <Step n={2} title="Open your availability">
          On <Go href="/teacher/calendar">Calendar</Go>, click or drag the
          half-hour cells you can teach. Green cells are open and students can
          book them. For a standing schedule, choose <strong>More</strong> →{" "}
          <strong>Use this week as weekly hours</strong>. This copies the entire
          displayed week; confirm the start date before applying it. Existing
          lessons and time off remain; earlier date-specific slot edits from the
          start date onward are replaced. Faded past hours
          can be edited for this weekly pattern without changing history.
          Use <strong>Undo</strong> for a recent saved edit, or discard past-hour
          drafts using the calendar&apos;s draft notice.{" "}
          Students book with at least 12 hours&apos; notice, so a slot you open
          for today is not bookable — use <strong>Add lesson</strong> for that.
        </Step>
        <Step n={3} title="Block time off">
          <strong>More</strong> → <strong>Time off</strong>. Booked lessons
          inside the range are not cancelled for you: move or cancel them
          first. Blocks longer than three days still apply immediately, but the
          academy has to sign them off.
        </Step>
      </Section>

      <Section title="Running a lesson" icon="video">
        <Step n={1} title="Start the session">
          <Go href="/teacher/sessions">Sessions</Go> shows a green{" "}
          <strong>Ready</strong> badge from ten minutes before the start. Press{" "}
          <strong>Start</strong>, or <strong>Go to Google Meet</strong> to open
          the room. You can start up to 30 minutes after the lesson should have
          ended — after that, record what actually happened instead.
        </Step>
        <Step n={2} title="Lesson with no booking">
          <strong>Start session</strong> → pick the student. It books a real
          lesson at the current time and opens it, so the hour is accounted for.
        </Step>
        <Step n={3} title="Pick your audio source">
          Choose <strong>Mic + Google Meet</strong> — both sides of the call.
          You will be asked to share your Meet tab; keep{" "}
          <em>Share tab audio</em> ticked. If that tab closes mid-lesson, the
          student&apos;s voice stops being recorded, and the page will tell you.
        </Step>
        <Step n={4} title="Teach with the side panel">
          <strong>Reading</strong> opens a text you can share with the student,{" "}
          <strong>Quiz</strong> builds questions from what has been said so far,{" "}
          <strong>Questions</strong> gives conversation prompts, and{" "}
          <strong>Notes</strong> is your scratchpad — those notes are fed to the
          AI afterwards, so write down what you want remembered.
        </Step>
        <Step n={5} title="End the session">
          <strong>Stop Recording</strong> keeps you on the page and saves what
          you have — useful for a pause. <strong>End Session</strong> finishes
          the lesson and opens the review page. If the student never turned up,
          use <strong>No-show</strong> (available ten minutes after the start);
          it applies the academy&apos;s rule instead of logging a lesson that
          did not happen.
        </Step>
      </Section>

      <Section title="Finish and publish the lesson" icon="send">
        <p className="body-sm" style={{ marginBottom: 12, lineHeight: 1.6 }}>
          The platform drafts the lesson material from the transcript. Your job
          is judgement: check it, fix what the AI got wrong, cut what is not
          useful, then publish.
        </p>
        <Step n={1} title="Open the review page">
          <Go href="/teacher/sessions">Sessions</Go> → the lesson. Tabs:{" "}
          <strong>Transcript &amp; Audio</strong>, <strong>Summary</strong>,{" "}
          <strong>Vocabulary</strong>, <strong>Homework</strong>. Each tab shows
          whether its content is drafted and approved.
        </Step>
        <Step n={2} title="Fix and approve Summary and Vocabulary">
          Press <strong>Regenerate</strong> for an AI draft, edit it in place,
          then <strong>Approve</strong>. <strong>Publish</strong> stays disabled
          until both are approved.
        </Step>
        <Step n={3} title="Vocabulary becomes their flashcards">
          Whatever you leave in the table goes out: word or phrase, translation,
          short English meaning, part of speech. Words already in the
          student&apos;s deck keep their review progress.
        </Step>
        <Step n={4} title="Publish">
          The student gets the summary, the vocabulary and their flashcards, and
          is notified. <strong>Reopen</strong> pulls it back if you need to
          change something afterwards.
        </Step>
        <p className="body-sm" style={{ marginTop: 12, lineHeight: 1.6, color: "var(--omnic-gray-600)" }}>
          Publish within 24 hours of the lesson ending — the student&apos;s
          revision and their flashcards depend on it.
        </p>
      </Section>

      <Section title="Homework" icon="book">
        <Step n={1} title="Build a worksheet">
          Choose an exercise type and <strong>Write myself</strong>: gaps, choices,
          matching, word order, rewrites, corrections, dialogues, reading, short answers
          or guided writing. Add instructions and an example, then enter questions
          and accepted answers. Select text in a gap sentence to turn it into a blank.
          Paste several questions with the bulk tool; duplicate or move questions and sections.
        </Step>
        <Step n={2} title="Use AI when it helps">
          <strong>Generate with AI</strong> makes one exercise type; <strong>Generate a worksheet</strong>
          lets you mix types. Set the student level, language objective, question count,
          and optional vocabulary. Use the lesson, pasted material, or your own topic.
          <strong>Convert workbook text</strong> preserves an original exercise;
          <strong>Create similar practice</strong> makes new questions. Missing images,
          audio or passages appear as source notes. Review and edit the preview before
          inserting it. Generate a replacement for one section without replacing the rest.
          Use <strong>Preview as student</strong> before approving; wait for <strong>Saved</strong>.
        </Step>
        <Step n={3} title="Approve it">
          The due date is optional: leave it empty and the homework lands on the
          student&apos;s next lesson with you — which is when you will be
          checking it anyway. <strong>Approve</strong> makes it ready to go.
        </Step>
        <Step n={4} title="It ships with Publish">
          Nothing reaches the student before the lesson is published. Answer
          keys and correct options are stripped before the student sees the
          page, so they cannot read the answers off it.
        </Step>
        <Step n={5} title="Review the submission">
          When homework is submitted you get a notification, and{" "}
          <Go href="/teacher/students">Students</Go> shows how many pieces are
          waiting. Open the lesson → <strong>Homework</strong> →{" "}
          <strong>Finish review</strong>: mark each answer right or wrong
          (overriding the automatic mark where you disagree) and add a comment.
          The student sees their score as soon as you finish. Check submissions
          before your next lesson with that student.
        </Step>
      </Section>

      <Section title="Reading &amp; words" icon="bookmark">
        <Step n={1} title="Read with a student">
          Open a text in <Go href="/teacher/library">Library</Go> and pick the
          student at the top of the page — everything then works in that
          student&apos;s context, and their saved words appear underneath the
          catalogue.
        </Step>
        <Step n={2} title="Find something suitable">
          Use <strong>Browse</strong> or <strong>Recent</strong>, and the Sort
          menu: <strong>Recommended</strong> for the best topic match for that
          student, <strong>Recently added</strong>, <strong>Title A–Z</strong>,{" "}
          <strong>Shortest first</strong>.
        </Step>
        <Step n={3} title="Collect words for them">
          Tap a word → <strong>Add to their words</strong>. It goes into that
          student&apos;s flashcard deck with a translation into their language
          and comes back on a spaced schedule. Words the dictionary does not
          know are translated instead, so nothing dead-ends.
        </Step>
      </Section>

      <Section title="Your students and your pay" icon="users">
        <Step n={1} title="Know where they stand">
          <Go href="/teacher/students">Students</Go> is one row per student:
          level, lessons left, next lesson, last seen, homework waiting to be
          reviewed. Lessons left at zero stops bookings — say something before
          the pack runs out.
        </Step>
        <Step n={2} title="Their full picture">
          Click a row for their profile and signup answers, homework counts,
          recent lessons, and every word they have collected.
        </Step>
        <Step n={3} title="Your payout">
          Your avatar menu → <Go href="/teacher/profile">Profile</Go> shows what
          is owed to you, how many lessons are unpaid this month, and your last
          payment. Payments arrive as a notification.
        </Step>
      </Section>
    </div>
  );
}
