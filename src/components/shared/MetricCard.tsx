import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  accent?: "purple" | "red";
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  accent = "purple",
}: MetricCardProps) {
  const chipBg =
    accent === "red"
      ? "var(--omnic-red-tint)"
      : "var(--brand-purple-soft)";
  const chipFg =
    accent === "red" ? "var(--omnic-red)" : "var(--brand-purple)";

  return (
    <div
      className="bg-white rounded-lg border p-5"
      style={{ borderColor: "var(--omnic-gray-100)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex justify-between items-start">
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: chipBg, color: chipFg }}
          >
            <Icon size={18} />
          </div>
        )}
        {trend && (
          <span
            className="text-xs font-medium"
            style={{ color: "var(--brand-purple)" }}
          >
            {trend}
          </span>
        )}
      </div>
      <div
        className="mt-3.5 font-bold tracking-tight"
        style={{
          fontSize: 28,
          color: "var(--omnic-gray-900)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div
        className="text-xs mt-0.5"
        style={{ color: "var(--omnic-gray-500)" }}
      >
        {label}
      </div>
    </div>
  );
}
