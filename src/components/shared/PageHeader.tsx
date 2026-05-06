import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <div className="flex justify-between items-end gap-4 mb-6">
      <div>
        <h1
          className="font-bold tracking-tight m-0"
          style={{
            fontSize: 24,
            lineHeight: 1.25,
            color: "var(--omnic-gray-900)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div
            className="text-sm mt-1"
            style={{ color: "var(--omnic-gray-600)" }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right && <div className="flex gap-2">{right}</div>}
    </div>
  );
}
