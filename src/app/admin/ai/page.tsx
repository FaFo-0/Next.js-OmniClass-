"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex";

interface PromptConfig {
  configId: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  provider: "openrouter" | "openai" | "anthropic";
  temperature: number;
  maxTokens: number;
  outputFormat: "text" | "json";
}
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const SAMPLE_TRANSCRIPT =
  "\u0645\u0631\u062d\u0628\u0627\u060c \u0627\u0633\u0645\u064a \u0623\u062d\u0645\u062f. \u0643\u064a\u0641 \u062d\u0627\u0644\u0643\u061f \u0623\u0646\u0627 \u0628\u062e\u064a\u0631\u060c \u0634\u0643\u0631\u0627.";

const PROVIDER_OPTIONS = ["openrouter", "openai", "anthropic"] as const;
const COST_PER_MILLION_TOKENS = 0.1;

export default function AIPromptManager() {
  const t = useTranslations("admin.ai");
  const tc = useTranslations("common");
  const promptConfigs = useQuery(api.settings.listPromptConfigs) ?? [];
  const updateConfig = useMutation(api.settings.updatePromptConfig);
  const resetConfig = useMutation(api.settings.resetPromptConfig);
  const generateAI = useAction(api.ai.generate);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PromptConfig>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testResultVisible, setTestResultVisible] = useState(false);

  function startEditing(config: PromptConfig) {
    setEditingId(config.configId);
    setDraft({
      name: config.name,
      systemPrompt: config.systemPrompt,
      userPromptTemplate: config.userPromptTemplate,
      model: config.model,
      provider: config.provider,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      outputFormat: config.outputFormat,
    });
    setTestResult(null);
    setTestResultVisible(false);
  }

  function cancelEditing() {
    setEditingId(null);
    setDraft({});
    setTestResult(null);
    setTestResultVisible(false);
  }

  async function saveEditing() {
    if (!editingId) return;
    await updateConfig({
      configId: editingId,
      name: draft.name,
      systemPrompt: draft.systemPrompt,
      userPromptTemplate: draft.userPromptTemplate,
      model: draft.model,
      provider: draft.provider,
      temperature: draft.temperature,
      maxTokens: draft.maxTokens,
      outputFormat: draft.outputFormat,
    });
    toast.success(t("promptSaved"));
    setEditingId(null);
    setDraft({});
    setTestResult(null);
    setTestResultVisible(false);
  }

  async function handleReset(id: string) {
    await resetConfig({ configId: id });
    toast.success(t("resetSuccess"));
    if (editingId === id) {
      cancelEditing();
    }
  }

  async function handleTest() {
    if (!editingId) return;

    const base = promptConfigs.find((p) => p.configId === editingId)!;
    const merged: PromptConfig = {
      configId: base.configId,
      name: draft.name ?? base.name,
      systemPrompt: draft.systemPrompt ?? base.systemPrompt,
      userPromptTemplate: draft.userPromptTemplate ?? base.userPromptTemplate,
      model: draft.model ?? base.model,
      provider: (draft.provider ?? base.provider) as PromptConfig["provider"],
      temperature: draft.temperature ?? base.temperature,
      maxTokens: draft.maxTokens ?? base.maxTokens,
      outputFormat: (draft.outputFormat ?? base.outputFormat) as PromptConfig["outputFormat"],
    };

    setTesting(true);
    setTestResult(null);
    setTestResultVisible(true);

    try {
      const userPrompt = merged.userPromptTemplate.replace(
        "{{transcript}}",
        SAMPLE_TRANSCRIPT
      );
      const res = await generateAI({
        promptConfigId: editingId,
        transcript: SAMPLE_TRANSCRIPT,
        systemPrompt: merged.systemPrompt,
        userPromptTemplate: userPrompt,
        model: merged.model,
        temperature: merged.temperature,
        maxTokens: merged.maxTokens,
      });
      setTestResult(res.content);
      toast.success(t("testComplete"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test failed";
      setTestResult(`Error: ${msg}`);
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  const costEstimates = useMemo(
    () =>
      promptConfigs.map((config) => {
        const estimatedTokens = Math.round(config.systemPrompt.length / 4 + 200);
        const costPerRequest = (estimatedTokens / 1_000_000) * COST_PER_MILLION_TOKENS;
        return { id: config.configId, name: config.name, estimatedTokens, costPerRequest };
      }),
    [promptConfigs]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Prompt Config List */}
      <div className="space-y-4">
        {promptConfigs.map((config) => {
          const isEditing = editingId === config.configId;

          return (
            <Card key={config.configId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <CardTitle>{config.name}</CardTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{config.provider}</Badge>
                      <Badge variant="outline">{config.model}</Badge>
                      <span className="text-xs text-muted-foreground">
                        temp {config.temperature} &middot; {config.maxTokens} max tokens
                        &middot; {config.outputFormat}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!isEditing && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(config)}
                        >
                          {tc("edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(config.configId)}
                        >
                          {tc("reset")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Inline Editor */}
              {isEditing && (
                <CardContent className="space-y-5 border-t pt-5">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("name")}</label>
                    <Input
                      value={draft.name ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </div>

                  {/* System Prompt */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("systemPrompt")}</label>
                    <Textarea
                      rows={8}
                      className="font-mono text-sm"
                      value={draft.systemPrompt ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, systemPrompt: e.target.value }))
                      }
                    />
                  </div>

                  {/* User Prompt Template */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {t("userPromptTemplate")}
                    </label>
                    <Textarea
                      rows={6}
                      className="font-mono text-sm"
                      value={draft.userPromptTemplate ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          userPromptTemplate: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("transcriptPlaceholder")}
                    </p>
                  </div>

                  {/* Model */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("model")}</label>
                    <Input
                      value={draft.model ?? ""}
                      placeholder={t("modelPlaceholder")}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, model: e.target.value }))
                      }
                    />
                  </div>

                  {/* Provider */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("provider")}</label>
                    <div className="flex gap-2">
                      {PROVIDER_OPTIONS.map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant={draft.provider === p ? "default" : "outline"}
                          onClick={() => setDraft((d) => ({ ...d, provider: p }))}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Temperature */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {t("temperature", { value: draft.temperature ?? 0 })}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={draft.temperature ?? 0}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          temperature: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* Max Tokens */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("maxTokens")}</label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.maxTokens ?? 0}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          maxTokens: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>

                  {/* Output Format */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("outputFormat")}</label>
                    <div className="flex gap-2">
                      {(["text", "json"] as const).map((fmt) => (
                        <Button
                          key={fmt}
                          size="sm"
                          variant={draft.outputFormat === fmt ? "default" : "outline"}
                          onClick={() =>
                            setDraft((d) => ({ ...d, outputFormat: fmt }))
                          }
                        >
                          {fmt}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 border-t pt-4">
                    <Button onClick={saveEditing}>{tc("save")}</Button>
                    <Button variant="outline" onClick={cancelEditing}>
                      {tc("cancel")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleTest}
                      disabled={testing}
                    >
                      {testing ? tc("testing") : tc("test")}
                    </Button>
                  </div>

                  {/* Test Result Preview */}
                  {testResultVisible && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => setTestResultVisible((v) => !v)}
                      >
                        {testResult === null ? t("waitingResult") : t("testResult")}
                        {testResult !== null && (
                          <span className="ms-1 text-xs">
                            {t("clickToToggle", { action: testResultVisible ? t("hide") : t("show") })}
                          </span>
                        )}
                      </button>
                      {testResult !== null && (
                        <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-4 text-xs leading-relaxed">
                          {testResult}
                        </pre>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Cost Estimates */}
      <Card>
        <CardHeader>
          <CardTitle>{t("costEstimates")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {t("costDescription", { cost: COST_PER_MILLION_TOKENS.toFixed(2) })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="pb-2 pe-4 text-start font-medium">{t("prompt")}</th>
                  <th className="pb-2 pe-4 text-end font-medium">
                    {t("estTokens")}
                  </th>
                  <th className="pb-2 text-end font-medium">
                    {t("estCost")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {costEstimates.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pe-4">{row.name}</td>
                    <td className="py-2 pe-4 text-end tabular-nums">
                      {row.estimatedTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-end tabular-nums">
                      ${row.costPerRequest.toFixed(6)}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="pt-2 pe-4">{t("totalPerLesson")}</td>
                  <td className="pt-2 pe-4 text-end tabular-nums">
                    {costEstimates
                      .reduce((sum, r) => sum + r.estimatedTokens, 0)
                      .toLocaleString()}
                  </td>
                  <td className="pt-2 text-end tabular-nums">
                    $
                    {costEstimates
                      .reduce((sum, r) => sum + r.costPerRequest, 0)
                      .toFixed(6)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
