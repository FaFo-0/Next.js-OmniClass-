"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Palette } from "lucide-react";

export default function BrandingPage() {
  const settings = useQuery(api.tenantSettings.getActive);
  const updateSettings = useMutation(api.tenantSettings.update);

  const [primary, setPrimary] = useState("#6716A4");
  const [primaryHover, setPrimaryHover] = useState("#581289");
  const [background, setBackground] = useState("#FFCA00");
  const [name, setName] = useState("Omnica English");

  useEffect(() => {
    if (!settings) return;
    setPrimary(settings.primaryColor ?? "#6716A4");
    setPrimaryHover(settings.primaryColorHover ?? "#581289");
    setBackground(settings.backgroundColor ?? "#FFCA00");
    setName(settings.name ?? "Omnica English");
  }, [settings]);

  async function save() {
    try {
      await updateSettings({
        patch: {
          name,
          primaryColor: primary,
          primaryColorHover: primaryHover,
          backgroundColor: background,
        },
      });
      toast.success("Brand updated — refresh to see changes");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Live preview via CSS custom properties
  function applyPreview() {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--brand-purple", primary);
    document.documentElement.style.setProperty("--brand-purple-hover", primaryHover);
    document.documentElement.style.setProperty("--brand-yellow", background);
    document.documentElement.style.setProperty("--primary", primary);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Branding" subtitle="Customize colors and identity" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="rounded-lg border bg-white p-5 space-y-4"
          style={{ borderColor: "var(--omnic-gray-100)" }}>
          <h3 className="font-semibold flex items-center gap-2">
            <Palette size={16} /> Colors
          </h3>

          <div>
            <label className="text-sm font-medium">Academy name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Primary color (purple)</label>
            <div className="flex gap-2">
              <Input type="color" value={primary} onChange={(e) => { setPrimary(e.target.value); applyPreview(); }} className="w-12 h-9 p-1" />
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Primary hover</label>
            <div className="flex gap-2">
              <Input type="color" value={primaryHover} onChange={(e) => { setPrimaryHover(e.target.value); applyPreview(); }} className="w-12 h-9 p-1" />
              <Input value={primaryHover} onChange={(e) => setPrimaryHover(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Background color (yellow)</label>
            <div className="flex gap-2">
              <Input type="color" value={background} onChange={(e) => { setBackground(e.target.value); applyPreview(); }} className="w-12 h-9 p-1" />
              <Input value={background} onChange={(e) => setBackground(e.target.value)} />
            </div>
          </div>

          <Button onClick={save} className="w-full">Save branding</Button>
        </div>

        {/* Live preview */}
        <div>
          <h3 className="font-semibold mb-3">Live preview</h3>
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--omnic-gray-100)", backgroundColor: background }}>
            <div style={{ color: primary }} className="text-sm font-semibold">{name}</div>
            <div
              className="rounded px-3 py-1.5 text-white text-sm inline-block font-medium"
              style={{ backgroundColor: primary }}
            >
              Primary button
            </div>
            <div
              className="rounded px-3 py-1.5 text-sm inline-block font-medium border"
              style={{ color: primary, borderColor: primary }}
            >
              Outline button
            </div>
            <div className="h-2 rounded" style={{ backgroundColor: primary + "20" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
