"use client"

import { cn } from "@/lib/utils"
import { Icon } from "./icons"

interface MetricCardProps {
  icon: string
  label: string
  value: string | number
  trend?: string
  className?: string
}

export function MetricCard({ icon, label, value, trend, className }: MetricCardProps) {
  return (
    <div className={cn("card p-5 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--omnic-tenant-primary-mid)", color: "var(--omnic-tenant-primary)" }}>
          <Icon name={icon} size={18} />
        </span>
        {trend && (
          <span className="text-xs font-medium" style={{ color: trend.startsWith("+") ? "#16A34A" : "var(--omnic-red)" }}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <div className="text-[28px] font-bold leading-tight" style={{ color: "var(--omnic-gray-800)" }}>
          {value}
        </div>
        <div className="text-xs text-[var(--omnic-gray-500)] mt-1">{label}</div>
      </div>
    </div>
  )
}
