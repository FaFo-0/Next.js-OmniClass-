import { Icon } from "@/components/shared/icons"

interface PageHeaderProps {
  title: string
  subtitle?: string
  right?: React.ReactNode
}

export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="body-sm mt-1">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  )
}
