"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, Calculator } from "lucide-react";

export default function AIManagerPage() {
  const settings = useQuery(api.tenantSettings.getActive);
  const promptConfigs = useQuery(api.promptConfigs.listForOrg) ?? [];
  const updateSettings = useMutation(api.tenantSettings.update);

  const [editingCost, setEditingCost] = useState(false);
  const [sonioxCost, setSonioxCost] = useState("");
  const [avgLessonMin, setAvgLessonMin] = useState("");

  function startEdit() {
    setSonioxCost(String(settings?.ai?.sonioxCostPerMinute ?? 0.0067));
    setAvgLessonMin(String(settings?.ai?.avgLessonMinutes ?? 60));
    setEditingCost(true);
  }

  async function saveCost() {
    await updateSettings({
      patch: {
        ai: {
          sonioxCostPerMinute: Number(sonioxCost) || 0.0067,
          avgLessonMinutes: Number(avgLessonMin) || 60,
        },
      },
    });
    toast.success("Cost settings saved");
    setEditingCost(false);
  }

  const sonioxMinCost = settings?.ai?.sonioxCostPerMinute ?? 0.0067;
  const avgMin = settings?.ai?.avgLessonMinutes ?? 60;

  // Sum token-based costs from prompt configs (rough estimate)
  const defaultTokenCost = 0.0000005; // ~$0.50 per 1M tokens for cheap models
  const promptCosts = promptConfigs.map((c) => ({
    name: c.configId,
    model: c.model,
    maxTokens: c.maxTokens,
    estimatedCost: (c.maxTokens * defaultTokenCost).toFixed(7),
  }));

  const totalPromptCost = promptCosts.reduce(
    (sum, c) => sum + Number(c.estimatedCost),
    0
  );
  const sonioxTotalCost = sonioxMinCost * avgMin;
  const totalPerLesson = totalPromptCost + sonioxTotalCost;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="AI Manager" subtitle="Monitor and configure AI-related costs" />

      {/* Prompt configs */}
      <div className="rounded-lg border bg-white p-5 mb-6"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <Sparkles size={16} /> Prompt Configurations
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
              <th className="text-left py-2 text-zinc-500">Config</th>
              <th className="text-left py-2 text-zinc-500">Model</th>
              <th className="text-right py-2 text-zinc-500">Max Tokens</th>
              <th className="text-right py-2 text-zinc-500">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {promptCosts.map((c) => (
              <tr key={c.name} className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
                <td className="py-2 font-medium text-xs">{c.name}</td>
                <td className="py-2 text-xs text-zinc-500">{c.model}</td>
                <td className="py-2 text-right">{c.maxTokens.toLocaleString()}</td>
                <td className="py-2 text-right font-mono text-xs">${c.estimatedCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* True cost calculator */}
      <div className="rounded-lg border bg-white p-5"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Calculator size={16} /> Per-Lesson Cost
          </h3>
          {!editingCost ? (
            <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
          ) : (
            <Button size="sm" onClick={saveCost}>Save</Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <label className="text-zinc-500">Soniox cost/min ($)</label>
            {editingCost ? (
              <Input type="number" step="0.0001" value={sonioxCost} onChange={(e) => setSonioxCost(e.target.value)} />
            ) : (
              <p className="font-medium">${sonioxMinCost}</p>
            )}
          </div>
          <div>
            <label className="text-zinc-500">Avg lesson (minutes)</label>
            {editingCost ? (
              <Input type="number" value={avgLessonMin} onChange={(e) => setAvgLessonMin(e.target.value)} />
            ) : (
              <p className="font-medium">{avgMin} min</p>
            )}
          </div>
        </div>

        <div className="rounded bg-zinc-50 p-4 font-mono text-sm space-y-1">
          <div className="flex justify-between">
            <span>AI prompts ({promptCosts.length} configs)</span>
            <span>${totalPromptCost.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span>Soniox ({sonioxMinCost}/min × {avgMin} min)</span>
            <span>${sonioxTotalCost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: "var(--omnic-gray-200)" }}>
            <span>Total per lesson</span>
            <span>${totalPerLesson.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
