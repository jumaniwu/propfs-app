import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import type { StatusKelayakan } from '@/types/fs.types'

interface StatusBadgeProps {
  status: StatusKelayakan
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export default function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const config = {
    sangat_layak: {
      label: 'SANGAT LAYAK',
      icon: CheckCircle,
      className: 'bg-green-50 text-green-800 border-green-200',
      iconClass: 'text-green-600',
    },
    layak: {
      label: 'LAYAK',
      icon: AlertCircle,
      className: 'bg-amber-50 text-amber-800 border-amber-200',
      iconClass: 'text-amber-600',
    },
    tidak_layak: {
      label: 'TIDAK LAYAK',
      icon: XCircle,
      className: 'bg-red-50 text-red-800 border-red-200',
      iconClass: 'text-red-600',
    },
  }

  const { label, icon: Icon, className, iconClass } = config[status] || config['tidak_layak']

  const sizeClass = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
    lg: 'px-4 py-1.5 text-base gap-2',
  }[size]

  const iconSize = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' }[size]

  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${sizeClass} ${className}`}>
      {showIcon && <Icon className={`${iconSize} ${iconClass}`} />}
      {label}
    </span>
  )
}
