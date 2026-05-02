"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand/provider";
import { useTranslations } from "next-intl";
import { priorityCountries, otherCountries, type Country } from "@/lib/countries";
import { useLocale } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Check, Phone, Globe, Calendar, BookOpen, MessageSquare, GraduationCap, Megaphone } from "lucide-react";
import { toast } from "sonner";

const TOTAL_STEPS = 7;

const REFERRAL_OPTIONS = ["friend", "instagram", "telegram", "other"] as const;
type ReferralSource = typeof REFERRAL_OPTIONS[number];

// Step indicator — circles connected by lines
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-0">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all",
              i < current
                ? "bg-primary text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.5)]"
                : i === current
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-[0_4px_0_0_hsl(var(--primary)/0.5)]"
                  : "bg-muted text-muted-foreground shadow-[0_3px_0_0_hsl(var(--border))]"
            )}
          >
            {i < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={cn(
                "h-[3px] w-8 transition-colors",
                i < current ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const { locale } = useLocale();
  const { tenantBrand } = useBrand();
  const t = useTranslations("onboarding");
  const submitOnboarding = useMutation(api.studentProfiles.submitOnboarding);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [phoneCountryCode, setPhoneCountryCode] = useState("+7");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("");
  const [age, setAge] = useState("");
  const [englishLevel, setArabicLevel] = useState<"beginner" | "intermediate" | "advanced" | "">("");
  const [studiedBefore, setStudiedBefore] = useState("");
  const [studyReason, setStudyReason] = useState("");
  const [referralSource, setReferralSource] = useState<ReferralSource | "">("");

  // Redirect side-effects (router.replace in render is a React error)
  useEffect(() => {
    if (!isLoaded || !user) return;
    if (user.onboardingComplete) {
      router.replace("/student");
    } else if (user.role !== "student") {
      router.replace("/");
    }
  }, [isLoaded, user, router]);

  // While waiting for redirect, render nothing to avoid flashing the form
  if (isLoaded && user && (user.onboardingComplete || user.role !== "student")) {
    return null;
  }

  const canProceed = () => {
    switch (step) {
      case 0: return phoneNumber.trim().length >= 5;
      case 1: return country.trim().length > 0;
      case 2: return age.trim().length > 0 && Number(age) > 0;
      case 3: return englishLevel !== "";
      case 4: return true; // optional
      case 5: return true; // optional
      case 6: return true; // optional
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitOnboarding({
        phoneCountryCode,
        phoneNumber: phoneNumber.trim(),
        country: country.trim(),
        age: Number(age),
        englishLevel: englishLevel as "beginner" | "intermediate" | "advanced",
        studiedBefore: studiedBefore.trim() || undefined,
        studyReason: studyReason.trim() || undefined,
        referralSource: referralSource || undefined,
      });
      router.replace("/student");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setSubmitting(false);
    }
  };

  const getCountryName = (c: Country) => {
    if (locale === "ru") return c.nameRu;
    return c.name;
  };

  return (
    <div className="w-full max-w-md">
      <StepIndicator current={step} total={TOTAL_STEPS} />

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        {/* Step 0: Phone */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Phone className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("phoneTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("phoneDesc")}</p>
            <div className="flex gap-2">
              <select
                value={phoneCountryCode}
                onChange={(e) => setPhoneCountryCode(e.target.value)}
                className="h-10 w-[120px] rounded-md border bg-background px-2 text-sm"
              >
                {priorityCountries.map((c) => (
                  <option key={c.code} value={c.dialCode}>
                    {c.flag} {c.dialCode}
                  </option>
                ))}
                <option disabled>──────</option>
                {otherCountries.map((c) => (
                  <option key={c.code} value={c.dialCode}>
                    {c.flag} {c.dialCode}
                  </option>
                ))}
              </select>
              <Input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t("phonePlaceholder")}
                className="flex-1"
              />
            </div>
          </div>
        )}

        {/* Step 1: Country */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Globe className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("countryTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("countryDesc")}</p>
            <div className="grid max-h-[300px] gap-1.5 overflow-y-auto">
              {priorityCountries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCountry(c.code)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-start",
                    country === c.code
                      ? "bg-primary text-primary-foreground shadow-[0_3px_0_0_hsl(var(--primary)/0.5)]"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <span className="text-lg">{c.flag}</span>
                  {getCountryName(c)}
                </button>
              ))}
              <div className="my-1 border-t" />
              {otherCountries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCountry(c.code)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-start",
                    country === c.code
                      ? "bg-primary text-primary-foreground shadow-[0_3px_0_0_hsl(var(--primary)/0.5)]"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <span className="text-lg">{c.flag}</span>
                  {getCountryName(c)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Age */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Calendar className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("ageTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("ageDesc")}</p>
            <Input
              type="number"
              min={5}
              max={99}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder={t("agePlaceholder")}
              className="text-center text-2xl font-bold"
            />
          </div>
        )}

        {/* Step 3: Arabic level */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <GraduationCap className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("levelTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("levelDesc")}</p>
            <div className="grid gap-3">
              {(["beginner", "intermediate", "advanced"] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setArabicLevel(level)}
                  className={cn(
                    "rounded-xl px-4 py-4 text-start font-semibold transition-all",
                    englishLevel === level
                      ? "bg-primary text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.5)]"
                      : "bg-muted/50 hover:bg-muted shadow-[0_3px_0_0_hsl(var(--border))]"
                  )}
                >
                  <div className="text-sm">{t(`level_${level}`)}</div>
                  <div className={cn(
                    "mt-0.5 text-xs",
                    englishLevel === level ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {t(`level_${level}_desc`)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Studied before (optional — free text) */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <BookOpen className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("studiedTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("studiedDesc")}</p>
            <Textarea
              value={studiedBefore}
              onChange={(e) => setStudiedBefore(e.target.value)}
              placeholder={t("studiedPlaceholder")}
              rows={3}
            />
            <p className="text-center text-xs text-muted-foreground">{t("optional")}</p>
          </div>
        )}

        {/* Step 5: Why Arabic (optional) */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <MessageSquare className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("reasonTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("reasonDesc")}</p>
            <Textarea
              value={studyReason}
              onChange={(e) => setStudyReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              rows={4}
            />
            <p className="text-center text-xs text-muted-foreground">{t("optional")}</p>
          </div>
        )}

        {/* Step 6: Where did you hear about us (optional) */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Megaphone className="h-5 w-5" />
              <h2 className="text-lg font-bold">{t("referralTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("referralDesc", { brandName: tenantBrand.name })}</p>
            <div className="grid gap-3">
              {REFERRAL_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setReferralSource(option)}
                  className={cn(
                    "rounded-xl px-4 py-4 text-start font-semibold transition-all",
                    referralSource === option
                      ? "bg-primary text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.5)]"
                      : "bg-muted/50 hover:bg-muted shadow-[0_3px_0_0_hsl(var(--border))]"
                  )}
                >
                  {t(`referral_${option}`)}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">{t("optional")}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={handleBack} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              {t("back")}
            </Button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()} className="gap-1">
              {t("next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="gap-1"
            >
              {submitting ? t("submitting") : t("finish")}
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
