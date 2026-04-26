import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, PieChart, Award, MapPin } from 'lucide-react'
import { formatRupiah, formatPct } from '@/engine/formatter'
import StatusBadge from '@/components/shared/StatusBadge'
import type { FSResults } from '@/types/fs.types'

interface Props {
  results: FSResults
}

export default function KPICards({ results: r }: Props) {
  const cards = [
    {
      label: 'Gross Revenue',
      value: formatRupiah(r.grossRevenue, true),
      sub: '100% pendapatan kotor',
      icon: DollarSign,
      color: 'border-l-blue-600',
      iconBg: 'bg-blue-50 text-blue-600',
      valueClass: 'text-blue-700',
    },
    {
      label: 'Total Investment',
      value: formatRupiah(r.totalInvestment, true),
      sub: `${formatPct(r.totalInvestment / r.grossRevenue * 100)} dari gross revenue`,
      icon: BarChart2,
      color: 'border-l-slate-600',
      iconBg: 'bg-slate-50 text-slate-600',
      valueClass: 'text-slate-700',
    },
    {
      label: 'Gross Profit',
      value: formatRupiah(r.grossProfit, true),
      sub: `${formatPct(r.grossMargin)} gross margin`,
      icon: TrendingUp,
      color: 'border-l-emerald-600',
      iconBg: 'bg-emerald-50 text-emerald-600',
      valueClass: 'text-emerald-700',
    },
    {
      label: 'Net Profit',
      value: formatRupiah(r.netProfit, true),
      sub: `Skenario tanpa bagi hasil`,
      icon: r.netProfit >= 0 ? TrendingUp : TrendingDown,
      color: r.netProfit >= 0 ? 'border-l-green-600' : 'border-l-red-600',
      iconBg: r.netProfit >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600',
      valueClass: r.netProfit >= 0 ? 'text-green-700' : 'text-red-700',
    },
    {
      label: 'Net Margin',
      value: formatPct(r.netMargin),
      sub: 'Target ≥ 20%',
      icon: PieChart,
      color: r.netMargin >= 25 ? 'border-l-green-600' : r.netMargin >= 15 ? 'border-l-amber-500' : 'border-l-red-600',
      iconBg: r.netMargin >= 25 ? 'bg-green-50 text-green-600' : r.netMargin >= 15 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600',
      valueClass: r.netMargin >= 25 ? 'text-green-700' : r.netMargin >= 15 ? 'text-amber-700' : 'text-red-700',
    },
    {
      label: 'Status Kelayakan',
      value: null,
      sub: `Gross margin ${formatPct(r.grossMargin)}`,
      icon: Award,
      color: r.statusKelayakan === 'sangat_layak' ? 'border-l-green-600' : r.statusKelayakan === 'layak' ? 'border-l-amber-500' : 'border-l-red-600',
      iconBg: 'bg-gold/10 text-yellow-700',
      valueClass: '',
    },
  ]

  if (r.assetLahan && r.assetLahan.totalNilaiAset > 0) {
    cards.push({
      label: 'Aset Lahan (Future Dev)',
      value: formatRupiah(r.assetLahan.totalNilaiAset, true),
      sub: `${r.assetLahan.luasLahanDisimpan.toLocaleString('id-ID')} m² lahan tersimpan`,
      icon: MapPin,
      color: 'border-l-amber-600',
      iconBg: 'bg-amber-100 text-amber-700',
      valueClass: 'text-amber-800',
    })
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.08, ease: 'easeOut' }}
            className={`bg-card rounded-xl shadow-sm border-l-4 ${card.color} p-4 lg:p-5 space-y-2 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</span>
            </div>

            {card.value !== null ? (
              <div className={`font-mono font-bold text-xl lg:text-2xl leading-tight ${card.valueClass}`}>
                {card.value}
              </div>
            ) : (
              <div className="mt-1">
                <StatusBadge status={r.statusKelayakan} size="md" />
              </div>
            )}

            <div className="text-xs text-muted-foreground">{card.sub}</div>
          </motion.div>
        )
      })}
    </div>
  )
}
