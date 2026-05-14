"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2", "Unsure"];

export default function StudentOnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const trial = useQuery(api.onboarding.getTrialPolicy, {});
  const existing = useQuery(api.onboarding.getMyOnboarding, {});
  const submit = useMutation(api.onboarding.completeStudentOnboarding);

  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [cefr, setCefr] = useState("");
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from existing onboarding row (edit mode) once.
  useEffect(() => {
    if (hydrated || !existing) return;
    setAge(existing.age ? String(existing.age) : "");
    setPhone(existing.phoneWhatsapp ?? "");
    setCefr(existing.cefrSelfAssessed ?? "");
    setGoal(existing.goal ?? "");
    setDays(existing.preferredDaysTimes ?? "");
    setHydrated(true);
  }, [existing, hydrated]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    if (user.role !== "student") {
      router.replace(`/${user.role}`);
    }
  }, [isLoaded, user, router]);

  if (!isLoaded || !user || user.role !== "student") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !cefr || !goal) {
      toast.error("Please fill phone, English level, and goal.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submit({
        age: age ? Number(age) : undefined,
        phoneWhatsapp: phone,
        cefrSelfAssessed: cefr,
        goal,
        preferredDaysTimes: days,
      });
      if (
        result.firstTime &&
        trial?.enabled &&
        !trial.requiresPayment &&
        trial.points > 0
      ) {
        toast.success(
          `Welcome! ${trial.points} trial points added (valid ${trial.durationDays} days).`
        );
      } else {
        toast.success("Profile saved.");
      }
      router.replace("/student");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-lg">
      <div className="card" style={{ padding: 32 }}>
        <h1 className="h1" style={{ marginBottom: 6 }}>
          Welcome, {user.name?.split(" ")[0] ?? "student"}
        </h1>
        <p className="body" style={{ marginBottom: 20 }}>
          Quick details so we can match you with a teacher.
          {trial?.enabled && !trial.requiresPayment && trial.points > 0 && (
            <>
              {" "}
              You&apos;ll receive <strong>{trial.points} free trial points</strong>{" "}
              after submitting.
            </>
          )}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" htmlFor="age">Age</label>
              <Input
                id="age"
                type="number"
                min={5}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="phone">Phone (WhatsApp)</label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 …"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="cefr">English level (self-assessed)</label>
            <Select value={cefr} onValueChange={(v) => setCefr(v ?? "")}>
              <SelectTrigger id="cefr">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {CEFR.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="goal">Your English goal</label>
            <Textarea
              id="goal"
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. IELTS 7.0 in 6 months, business meetings, travel…"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="days">Preferred days &amp; times</label>
            <Textarea
              id="days"
              rows={2}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="e.g. weekdays 7–10pm, weekends flexible"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Save & continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
