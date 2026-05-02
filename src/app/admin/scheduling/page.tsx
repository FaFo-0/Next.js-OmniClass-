"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  CalendarX2,
  Timer,
  Save,
  Settings2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DURATION_OPTIONS = [30, 45, 60, 90] as const;

export default function SchedulingPoliciesPage() {
  const t = useTranslations("admin.scheduling");
  const policy = useQuery(api.schedule.getPolicy) ?? {
    rescheduleWindowHours: 6,
    cancelWindowHours: 24,
    lessonDurationMinutes: 60,
  };
  const updatePolicyMut = useMutation(api.schedule.updatePolicy);

  const [rescheduleHours, setRescheduleHours] = useState(policy.rescheduleWindowHours);
  const [cancelHours, setCancelHours] = useState(policy.cancelWindowHours);
  const [durationMinutes, setDurationMinutes] = useState(policy.lessonDurationMinutes);

  const hasChanges = useMemo(
    () =>
      rescheduleHours !== policy.rescheduleWindowHours ||
      cancelHours !== policy.cancelWindowHours ||
      durationMinutes !== policy.lessonDurationMinutes,
    [rescheduleHours, cancelHours, durationMinutes, policy]
  );

  function handleSave() {
    updatePolicyMut({
      rescheduleWindowHours: rescheduleHours,
      cancelWindowHours: cancelHours,
      lessonDurationMinutes: durationMinutes,
    });
    toast.success(t("saved"));
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("policyConfig")}</CardTitle>
          </div>
          <CardDescription>
            {t("policyDescription")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Reschedule Window */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("rescheduleWindow")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("rescheduleDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={168}
                value={rescheduleHours}
                onChange={(e) => setRescheduleHours(Number(e.target.value))}
                className="w-20"
              />
              <Badge variant="secondary">{t("hours")}</Badge>
            </div>
          </div>

          {/* Cancel Window */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("cancelWindow")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("cancelDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={168}
                value={cancelHours}
                onChange={(e) => setCancelHours(Number(e.target.value))}
                className="w-20"
              />
              <Badge variant="secondary">{t("hours")}</Badge>
            </div>
          </div>

          {/* Default Lesson Duration */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Timer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("defaultDuration")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("durationDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {DURATION_OPTIONS.map((d) => (
                <Button
                  key={d}
                  variant={durationMinutes === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDurationMinutes(d)}
                >
                  {d}m
                </Button>
              ))}
            </div>
          </div>

          {/* Current values summary */}
          <div className="rounded-lg border border-dashed p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("currentValues")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {t("rescheduleH", { hours: policy.rescheduleWindowHours })}
              </Badge>
              <Badge variant="outline">
                {t("cancelH", { hours: policy.cancelWindowHours })}
              </Badge>
              <Badge variant="outline">
                {t("durationMin", { minutes: policy.lessonDurationMinutes })}
              </Badge>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!hasChanges}>
              <Save className="h-4 w-4" />
              {t("saveChanges")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
