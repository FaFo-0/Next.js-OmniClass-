"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trophy, Plus, Trash2 } from "lucide-react";

export default function AchievementsPage() {
  const achievements = useQuery(api.achievements.list) ?? [];
  const createAch = useMutation(api.achievements.create);
  const removeAch = useMutation(api.achievements.remove);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("🏆");
  const [type, setType] = useState("lessons_completed");
  const [threshold, setThreshold] = useState("");

  async function addAchievement() {
    try {
      await createAch({
        externalId: `ach-${Date.now()}`,
        name,
        description: desc,
        icon,
        conditionType: type as any,
        conditionThreshold: Number(threshold) || 1,
      });
      toast.success("Achievement created");
      setAddOpen(false);
      setName(""); setDesc(""); setIcon("🏆"); setThreshold("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Achievements" subtitle="Manage learning achievements" />

      <div className="mb-4">
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={14} className="me-1" /> Add Achievement
        </Button>
      </div>

      <div className="space-y-2">
        {achievements.map((a) => (
          <div
            key={a._id}
            className="flex items-center justify-between rounded-lg border bg-white p-4"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{a.icon}</span>
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-zinc-500">
                  {a.description} · {a.conditionType.replace(/_/g, " ")} × {a.conditionThreshold}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                removeAch({ id: a._id }).then(() => toast.success("Removed"))
              }
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Achievement</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Icon (emoji)</label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="text-2xl" />
            </div>
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Condition</label>
                <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lessons_completed">Lessons completed</SelectItem>
                  <SelectItem value="cards_reviewed">Cards reviewed</SelectItem>
                  <SelectItem value="quiz_perfect">Perfect quiz</SelectItem>
                  <SelectItem value="streak_days">Streak days</SelectItem>
                  <SelectItem value="vocab_learned">Vocab learned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Threshold</label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="10" />
            </div>
            <Button onClick={addAchievement} className="w-full">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
