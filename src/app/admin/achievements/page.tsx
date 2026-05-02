"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Trophy,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  Target,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";

type ConditionType =
  | "lessons_completed"
  | "cards_reviewed"
  | "quiz_perfect"
  | "streak_days"
  | "vocab_learned";

const CONDITION_TYPES: ConditionType[] = [
  "lessons_completed",
  "cards_reviewed",
  "quiz_perfect",
  "streak_days",
  "vocab_learned",
];

const CONDITION_LABELS: Record<ConditionType, string> = {
  lessons_completed: "Lessons Completed",
  cards_reviewed: "Cards Reviewed",
  quiz_perfect: "Perfect Quizzes",
  streak_days: "Streak Days",
  vocab_learned: "Vocab Learned",
};

interface EditState {
  name: string;
  description: string;
  icon: string;
  conditionType: ConditionType;
  threshold: number;
  reward: string;
}

function emptyEditState(): EditState {
  return {
    name: "",
    description: "",
    icon: "",
    conditionType: "lessons_completed",
    threshold: 1,
    reward: "",
  };
}

export default function AchievementEditorPage() {
  const t = useTranslations("admin.achievementsEditor");
  const tc = useTranslations("common");
  const achievements = useQuery(api.achievements.listAchievements) ?? [];
  const createAchievementMut = useMutation(api.achievements.createAchievement);
  const updateAchievementMut = useMutation(api.achievements.updateAchievement);
  const deleteAchievementMut = useMutation(api.achievements.deleteAchievement);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>(emptyEditState());
  const [isAdding, setIsAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const sortedAchievements = useMemo(
    () => [...achievements].sort((a, b) => a.name.localeCompare(b.name)),
    [achievements]
  );

  const startEdit = useCallback((a: typeof achievements[number]) => {
    setIsAdding(false);
    setDeleteConfirmId(null);
    setEditingId(a.externalId);
    setEditState({
      name: a.name,
      description: a.description,
      icon: a.icon,
      conditionType: a.conditionType as ConditionType,
      threshold: a.conditionThreshold,
      reward: a.reward ?? "",
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setIsAdding(false);
    setEditState(emptyEditState());
  }, []);

  const saveEdit = useCallback(() => {
    if (!editState.name.trim() || !editState.icon.trim()) return;

    if (isAdding) {
      const externalId = `ach-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      createAchievementMut({
        externalId,
        name: editState.name.trim(),
        description: editState.description.trim(),
        icon: editState.icon.trim(),
        conditionType: editState.conditionType,
        conditionThreshold: editState.threshold,
        ...(editState.reward.trim() ? { reward: editState.reward.trim() } : {}),
      });
    } else if (editingId) {
      updateAchievementMut({
        externalId: editingId,
        name: editState.name.trim(),
        description: editState.description.trim(),
        icon: editState.icon.trim(),
        conditionType: editState.conditionType,
        conditionThreshold: editState.threshold,
        reward: editState.reward.trim() || undefined,
      });
    }

    setEditingId(null);
    setIsAdding(false);
    setEditState(emptyEditState());
  }, [editState, editingId, isAdding, createAchievementMut, updateAchievementMut]);

  const startAdd = useCallback(() => {
    setEditingId(null);
    setDeleteConfirmId(null);
    setIsAdding(true);
    setEditState(emptyEditState());
  }, []);

  const handleDelete = useCallback(
    (externalId: string) => {
      deleteAchievementMut({ externalId });
      setDeleteConfirmId(null);
    },
    [deleteAchievementMut]
  );

  const updateField = useCallback(
    <K extends keyof EditState>(field: K, value: EditState[K]) => {
      setEditState((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Button onClick={startAdd} disabled={isAdding}>
          <Plus className="h-4 w-4" />
          {t("addAchievement")}
        </Button>
      </div>

      {/* Add new form */}
      {isAdding && (
        <Card className="border-2 border-dashed border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>{t("addAchievement")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <AchievementForm
              state={editState}
              onUpdate={updateField}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          </CardContent>
        </Card>
      )}

      {/* Achievement list */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedAchievements.map((achievement) => {
          const isEditing = editingId === achievement.externalId;
          const isDeleting = deleteConfirmId === achievement.externalId;

          return (
            <Card key={achievement.externalId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none" role="img" aria-label={achievement.name}>
                      {achievement.icon}
                    </span>
                    <div>
                      <CardTitle>{achievement.name}</CardTitle>
                      <CardDescription>{achievement.description}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {isEditing ? (
                  <AchievementForm
                    state={editState}
                    onUpdate={updateField}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        <Target className="h-3 w-3" />
                        {CONDITION_LABELS[achievement.conditionType as ConditionType]}
                      </Badge>
                      <Badge variant="outline">
                        {t("threshold")}: {achievement.conditionThreshold}
                      </Badge>
                    </div>

                    {achievement.reward && (
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs text-muted-foreground">
                          {t("reward")}: {achievement.reward}
                        </span>
                      </div>
                    )}

                    {/* Action buttons */}
                    {isDeleting ? (
                      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                        <span className="flex-1 text-xs text-destructive">{tc("confirm")}</span>
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleDelete(achievement.externalId)}
                        >
                          <Check className="h-3 w-3" />
                          Yes
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          <X className="h-3 w-3" />
                          No
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(achievement)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {tc("edit")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteConfirmId(achievement.externalId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {tc("delete")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sortedAchievements.length === 0 && !isAdding && (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {tc("noResults")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---- Inline form component ---- */

function AchievementForm({
  state,
  onUpdate,
  onSave,
  onCancel,
}: {
  state: EditState;
  onUpdate: <K extends keyof EditState>(field: K, value: EditState[K]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.achievementsEditor");
  const tc = useTranslations("common");
  const canSave = useMemo(
    () => state.name.trim().length > 0 && state.icon.trim().length > 0 && state.threshold > 0,
    [state.name, state.icon, state.threshold]
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[3rem_1fr] gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Icon</label>
          <Input
            value={state.icon}
            onChange={(e) => onUpdate("icon", e.target.value)}
            placeholder=""
            className="text-center text-lg"
            maxLength={4}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Name</label>
          <Input
            value={state.name}
            onChange={(e) => onUpdate("name", e.target.value)}
            placeholder="Achievement name"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Description</label>
        <Input
          value={state.description}
          onChange={(e) => onUpdate("description", e.target.value)}
          placeholder="What the student needs to do"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("conditionType")}</label>
          <select
            value={state.conditionType}
            onChange={(e) =>
              onUpdate("conditionType", e.target.value as ConditionType)
            }
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CONDITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONDITION_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("threshold")}</label>
          <Input
            type="number"
            min={1}
            value={state.threshold}
            onChange={(e) => onUpdate("threshold", Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("reward")} <span className="text-muted-foreground/60">(optional)</span>
        </label>
        <Input
          value={state.reward}
          onChange={(e) => onUpdate("reward", e.target.value)}
          placeholder="e.g. 2 free lessons"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          {tc("cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          <Check className="h-3.5 w-3.5" />
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
