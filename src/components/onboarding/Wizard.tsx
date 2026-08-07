"use client";

// Onboarding chrome shared by the student and teacher flows.
//
// One long form asks everything at once and reads like paperwork. Steps let
// each screen ask one thing properly — with room for the sentence that
// explains WHY it's being asked, which is the difference between a form and
// an introduction.

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/shared/icons";
import { useLocale } from "@/i18n/provider";

export interface WizardStep {
  key: string;
  title: string;
  /** One line under the title — say why this is worth asking. */
  blurb?: string;
  body: ReactNode;
  /** Block "Next" until this is true; the message says what's missing. */
  canAdvance?: boolean;
  incompleteHint?: string;
}

export function Wizard({
  steps,
  index,
  onIndexChange,
  onFinish,
  finishing,
  finishLabel = "Finish",
  heading,
  subheading,
}: {
  steps: WizardStep[];
  index: number;
  onIndexChange: (i: number) => void;
  onFinish: () => void;
  finishing?: boolean;
  finishLabel?: string;
  heading: string;
  subheading?: ReactNode;
}) {
  const t = useTranslations("onboarding.wizard");
  const { dir } = useLocale();
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const blocked = step.canAdvance === false;

  // Telling someone what they've missed before they've typed anything is
  // nagging. The hint waits until they've actually engaged with the step.
  // Storing WHICH step was touched resets it on navigation for free — an
  // effect that called setState on every index change did the same thing by
  // rendering twice.
  const [touchedStep, setTouchedStep] = useState<number | null>(null);
  const touched = touchedStep === index;
  const setTouched = () => setTouchedStep(index);

  return (
    <div className="w-full" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h1" style={{ margin: 0 }}>{heading}</h1>
        {subheading && (
          <p className="body" style={{ marginTop: 6 }}>{subheading}</p>
        )}
      </div>

      {/* Progress: dots a person can count, not a percentage. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {steps.map((s, i) => (
          <div
            key={s.key}
            title={s.title}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background:
                i <= index ? "var(--brand-purple)" : "var(--omnic-gray-200)",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="body-sm" style={{ color: "var(--omnic-gray-500)", marginBottom: 4 }}>
          {t("stepCounter", { current: index + 1, total: steps.length })}
        </div>
        <div className="h2" style={{ marginBottom: step.blurb ? 4 : 16 }}>
          {step.title}
        </div>
        {step.blurb && (
          <p className="body-sm" style={{ marginBottom: 18 }}>{step.blurb}</p>
        )}

        <div
          className="space-y-4"
          onInput={setTouched}
          // Only a click that actually landed on a control counts. A bare
          // `onClick` here armed the error hint when you clicked the padding.
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "button, input, select, textarea, label"
              )
            ) {
              setTouched();
            }
          }}
        >
          {step.body}
        </div>

        {blocked && touched && step.incompleteHint && (
          <p
            className="body-sm"
            style={{ marginTop: 14, color: "#92400E" }}
          >
            {step.incompleteHint}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {index > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onIndexChange(index - 1)}
            >
              <Icon name={dir === "rtl" ? "chevronRight" : "chevronLeft"} size={14} />{" "}
              {t("back")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-tenant"
            style={{ flex: 1 }}
            disabled={blocked || finishing}
            onClick={() => (isLast ? onFinish() : onIndexChange(index + 1))}
          >
            {isLast
              ? finishing
                ? t("saving")
                : finishLabel
              : t("continue")}
            {!isLast && (
              <Icon name={dir === "rtl" ? "chevronLeft" : "chevronRight"} size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Multi-select chips — used for days, times of day and interests. */
export function ChipGroup({
  options,
  selected,
  onToggle,
  columns,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  columns?: number;
}) {
  return (
    <div
      style={
        columns
          ? { display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }
          : { display: "flex", flexWrap: "wrap", gap: 8 }
      }
    >
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className="chip"
            onClick={() => onToggle(o.value)}
            style={
              on
                ? {
                    background: "var(--brand-purple)",
                    color: "#fff",
                    borderColor: "var(--brand-purple)",
                    justifyContent: "center",
                  }
                : { justifyContent: "center" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A pickable card — for choices that deserve a sentence of explanation. */
export function ChoiceCard({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "start",
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${selected ? "var(--brand-purple)" : "var(--omnic-gray-200)"}`,
        background: selected ? "var(--brand-purple-tint)" : "#fff",
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--omnic-gray-900)" }}>{label}</span>
      {hint && (
        <span className="body-sm" style={{ display: "block", marginTop: 2 }}>
          {hint}
        </span>
      )}
    </button>
  );
}
