import { cn } from "@/lib/utils"

interface StatusPillProps {
  status: string
  className?: string
}

const variantMap: Record<string, string> = {
  active: "pill-active",
  paused: "pill-paused",
  cancelled: "pill-cancelled",
  trial: "pill-trial",
  new: "pill-new",
  draft: "pill-draft",
  finalized: "pill-finalized",
  upcoming: "pill-trial",
  live: "pill-active",
  completed: "pill-finalized",
  paid: "pill-active",
  unpaid: "pill-paused",
  overdue: "pill-cancelled",
}

export function StatusPill({ status, className }: StatusPillProps) {
  const variant = variantMap[status.toLowerCase()] || "pill-new"
  return (
    <span className={cn("pill", variant, className)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
