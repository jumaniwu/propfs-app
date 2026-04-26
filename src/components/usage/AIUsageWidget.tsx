import { useEffect } from 'react'
import { Zap, TrendingUp, Package, Hammer, AlertTriangle, BarChart2 } from 'lucide-react'
import { useUsageStore, PLAN_AI_BUDGET_IDR } from '@/store/usageStore'

// Warna untuk provider
const PROVIDER_COLOR: Record<string, string> = {
  gemini:     'bg-blue-500',
  openrouter: 'bg-violet-500',
  groq:       'bg-orange-500',
}

// Paket saat ini (nanti bisa diambil dari authStore)
const CURRENT_PLAN = 'pro' // TODO: sambungkan ke authStore.getCurrentPlan()

export default function AIUsageWidget({ planId = CURRENT_PLAN }: { planId?: string }) {
  const { currentMonthSummary, refreshSummary, getBudgetUsedPercent, getBudgetRemaining, pruneOldEntries } = useUsageStore()

  useEffect(() => {
    refreshSummary()
    pruneOldEntries()
  }, [])

  const summary = currentMonthSummary
  const budgetRaw = PLAN_AI_BUDGET_IDR[planId] ?? PLAN_AI_BUDGET_IDR.starter
  const budgetIDR = budgetRaw === Infinity ? null : budgetRaw
  const usedPct   = getBudgetUsedPercent(planId)
  const remaining = getBudgetRemaining(planId)

  const isUnlimited = budgetIDR === null
  const isWarning   = !isUnlimited && usedPct >= 75
  const isDanger    = !isUnlimited && usedPct >= 95

  if (!summary || summary.callCount === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
        <Zap className="w-8 h-8 text-white/20 mx-auto mb-2" />
        <p className="text-white/40 text-sm">AI Usage bulan ini</p>
        <p className="text-white/20 text-xs mt-1">Belum ada request AI tercatat.</p>
      </div>
    )
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-gold" />
          <h4 className="text-sm font-bold text-white">AI Usage — {summary.month}</h4>
        </div>
        {isWarning && !isDanger && (
          <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> 75% Penuh
          </span>
        )}
        {isDanger && (
          <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> Hampir Habis!
          </span>
        )}
      </div>

      {/* Budget Bar */}
      {!isUnlimited && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-white/60">Budget Bulanan</span>
            <span className={`font-bold ${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-white'}`}>
              {usedPct}% terpakai
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-gold'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/40 mt-1">
            <span>Rp {summary.totalCostIDR.toLocaleString('id-ID')} digunakan</span>
            <span>Sisa Rp {remaining.toLocaleString('id-ID')}</span>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white/[0.04] rounded-2xl p-3">
          <p className="text-lg font-black text-white">{summary.callCount}</p>
          <p className="text-[10px] text-white/40 mt-0.5">Request AI</p>
        </div>
        <div className="bg-white/[0.04] rounded-2xl p-3">
          <p className="text-lg font-black text-white">
            {((summary.totalInputTokens + summary.totalOutputTokens) / 1000).toFixed(1)}K
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">Total Token</p>
        </div>
        <div className="bg-white/[0.04] rounded-2xl p-3">
          <p className="text-lg font-black text-white">
            Rp {summary.totalCostIDR >= 1000
              ? `${(summary.totalCostIDR / 1000).toFixed(1)}K`
              : summary.totalCostIDR}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">Biaya AI</p>
        </div>
      </div>

      {/* Usage by Feature */}
      {Object.keys(summary.byFeature).length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
            <BarChart2 className="w-3 h-3 inline mr-1" />Per Fitur
          </p>
          <div className="space-y-1.5">
            {(Object.entries(summary.byFeature) as any[]).map(([feat, data]: any) => (
              <div key={feat} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-white/60">
                  {feat === 'rab_parser' ? <Package className="w-3 h-3" /> :
                   feat === 'material_schedule' ? <TrendingUp className="w-3 h-3" /> :
                   <Hammer className="w-3 h-3" />}
                  <span>{feat === 'rab_parser' ? 'Upload RAB' : feat === 'realisasi_chat' ? 'Chat Cost' : 'Material AI'}</span>
                  <span className="text-white/30">{data.calls}×</span>
                </div>
                <span className="text-white/60 font-bold">Rp {data.costIDR.toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage by Provider */}
      {Object.keys(summary.byProvider).length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Per Provider</p>
          <div className="space-y-1.5">
            {(Object.entries(summary.byProvider) as any[]).map(([prov, data]: any) => {
              const total = summary.totalCostIDR
              const pct   = total > 0 ? Math.round((data.costIDR / total) * 100) : 0
              return (
                <div key={prov} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${PROVIDER_COLOR[prov] ?? 'bg-white/20'}`} />
                  <span className="text-xs text-white/60 w-20 capitalize">{prov}</span>
                  <div className="flex-1 bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${PROVIDER_COLOR[prov] ?? 'bg-white/30'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-white/40">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[9px] text-white/20 text-center">
        * Estimasi biaya berdasarkan jumlah karakter / 4 ≈ token
      </p>
    </div>
  )
}
