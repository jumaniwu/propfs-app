import { useState, useMemo } from 'react'
import { CheckCircle2, Clock, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react'
import { useCostStore } from '@/store/costStore'

const QUICK_PCT = [0, 25, 50, 75, 100]

export default function ProgressInputPanel() {
  const { activePlan, updateComponentProgress, getActualProgressPct } = useCostStore()
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const overallProgress = getActualProgressPct()

  const groupedData = useMemo(() => {
    if (!activePlan) return {}
    return activePlan.components.reduce((acc, item) => {
      const group = item.groupName || 'Lainnya'
      if (!acc[group]) acc[group] = []
      acc[group].push(item)
      return acc
    }, {} as Record<string, typeof activePlan.components>)
  }, [activePlan])

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const getProgressColor = (pct: number) => {
    if (pct >= 75) return 'bg-emerald-500'
    if (pct >= 50) return 'bg-blue-500'
    if (pct >= 25) return 'bg-amber-500'
    return 'bg-slate-300'
  }

  if (!activePlan || activePlan.components.length === 0) {
    return (
      <div className="py-16 text-center">
        <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground text-sm">Upload RAB terlebih dahulu untuk input progress.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overall Progress Banner */}
      <div className="bg-gradient-to-r from-navy to-navy/80 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">Progress Aktual Tertimbang</p>
            <p className="text-3xl font-bold">{overallProgress.toFixed(1)}%</p>
          </div>
          <div className="w-16 h-16 relative">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke="#C9A84C" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(overallProgress / 100) * 163.4} 163.4`}
                className="transition-all duration-500"
              />
            </svg>
            <TrendingUp className="w-5 h-5 absolute inset-0 m-auto text-gold" />
          </div>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-gold h-2 rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <p className="text-white/50 text-xs mt-2">
          Dihitung berdasarkan rata-rata tertimbang nilai pekerjaan • {activePlan.components.length} item
        </p>
      </div>

      {/* Items by Group */}
      <div className="space-y-4">
        {Object.entries(groupedData).map(([groupName, items]) => {
          const groupTotal = items.reduce((s, i) => s + i.totalPlannedCost, 0)
          const groupWeightedProgress = items.reduce((s, i) => s + ((i.progressPercentage ?? 0) * i.totalPlannedCost), 0)
          const groupProgress = groupTotal > 0 ? groupWeightedProgress / groupTotal : 0
          const isCollapsed = collapsedGroups[groupName]

          return (
            <div key={groupName} className="border border-border rounded-2xl overflow-hidden bg-white shadow-sm">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(groupName)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <span className="font-semibold text-foreground uppercase tracking-wider text-sm">{groupName}</span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    Rp {groupTotal.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-20 bg-muted rounded-full h-1.5 hidden sm:block">
                    <div
                      className={`h-1.5 rounded-full transition-all ${getProgressColor(groupProgress)}`}
                      style={{ width: `${groupProgress}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-12 text-right ${groupProgress >= 100 ? 'text-emerald-600' : 'text-navy'}`}>
                    {groupProgress.toFixed(0)}%
                  </span>
                </div>
              </button>

              {/* Group Items */}
              {!isCollapsed && (
                <div className="divide-y divide-border/60">
                  {items.map(item => {
                    const pct = item.progressPercentage ?? 0
                    const updatedAt = item.progressUpdatedAt
                      ? new Date(item.progressUpdatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' })
                      : null

                    return (
                      <div key={item.id} className="px-5 py-4">
                        {/* Item Header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-navy truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.plannedVolume.toLocaleString('id-ID')} {item.unit} · Rp {item.totalPlannedCost.toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {pct === 100 && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            {updatedAt && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{updatedAt}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Progress Slider + Input */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1 relative">
                            <div className="w-full bg-muted rounded-full h-2 mb-1">
                              <div
                                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(pct)}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <input
                              type="range"
                              min={0} max={100} step={1}
                              value={pct}
                              onChange={e => updateComponentProgress(item.id, Number(e.target.value))}
                              className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
                            />
                          </div>
                          <input
                            type="number"
                            min={0} max={100}
                            value={pct}
                            onChange={e => updateComponentProgress(item.id, Number(e.target.value))}
                            className="w-14 text-center text-sm font-bold border border-border rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-navy/30 bg-white"
                          />
                          <span className="text-sm font-bold text-navy w-4">%</span>
                        </div>

                        {/* Quick Set Buttons */}
                        <div className="flex gap-1.5 flex-wrap">
                          {QUICK_PCT.map(q => (
                            <button
                              key={q}
                              onClick={() => updateComponentProgress(item.id, q)}
                              className={`
                                px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all
                                ${pct === q
                                  ? 'bg-navy text-white shadow-sm'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                }
                              `}
                            >
                              {q}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
