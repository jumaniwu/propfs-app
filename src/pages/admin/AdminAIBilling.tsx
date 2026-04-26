// ============================================================
// PropFS — Admin: AI Billing & Margin Control Dashboard
// ============================================================

import { useState, useEffect } from 'react'
import { Zap, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function AdminAIBilling() {
  const [logs, setLogs] = useState<any[]>([])
  const [stats, setStats] = useState({
    gemini: 0, groq: 0, claude: 0, total_usd: 0
  })

  useEffect(() => {
    async function loadData() {
      // Note: Admin needs RLS policy allowing to read all or use service_role
      // For this demo, assuming we just show a mockup or basic DB query
      const { data } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        setLogs(data)
        // Basic calculation
        let g = 0, gr = 0, c = 0
        data.forEach(x => {
          if (x.provider === 'gemini') g += x.cost_usd
          if (x.provider === 'groq') gr += x.cost_usd
          if (x.provider === 'claude') c += x.cost_usd
        })
        setStats({ gemini: g, groq: gr, claude: c, total_usd: g + gr + c })
      }
    }
    loadData()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-navy flex items-center gap-2">
          <Zap className="h-6 w-6 text-gold" /> AI Billing & Budget
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pantau limit penggunaan API Intelligence dan awasi kebocoran cost.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[{ label: 'Gemini Usage', val: stats.gemini, limit: 500 },
          { label: 'Groq Usage', val: stats.groq, limit: 200 },
          { label: 'Claude Usage', val: stats.claude, limit: 300 },
          { label: 'Total AI Cost', val: stats.total_usd, limit: 1000 }
        ].map(s => {
          const pct = Math.min((s.val / s.limit) * 100, 100)
          return (
            <div key={s.label} className="bg-card border border-border p-5 rounded-2xl">
              <h3 className="text-sm font-bold text-muted-foreground">{s.label}</h3>
              <p className="text-2xl font-black mt-1">${s.val.toFixed(4)} <span className="text-sm font-normal text-muted-foreground">/ ${s.limit}</span></p>
              
              <div className="w-full bg-muted rounded-full h-1.5 mt-3">
                <div 
                  className={`h-1.5 rounded-full ${pct > 80 ? 'bg-destructive' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${pct}%` }} 
                />
              </div>
              <p className="text-[10px] text-right mt-1 text-muted-foreground">{pct.toFixed(1)}% limit</p>
            </div>
          )
        })}
      </div>

      {/* Margins */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6">
         <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h2 className="font-bold text-emerald-900">Profit Margin Safety</h2>
         </div>
         <p className="text-sm text-emerald-800">
           Target Margin SaaS PropFS adalah &gt;90%. Pastikan biaya API AI (sekarang ${stats.total_usd.toFixed(2)}) tidak melebihi 10% dari total pendapatan Invoice.
         </p>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex justify-between items-center">
          <h2 className="font-bold whitespace-nowrap">Log Token Usage (Realtime)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
               <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">Provider</th>
                  <th className="px-6 py-3 font-medium">Feature</th>
                  <th className="px-6 py-3 font-medium">Tokens</th>
                  <th className="px-6 py-3 font-medium">Cost USD</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Belum ada aktivitas AI.</td></tr>
              ) : logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-3 whitespace-nowrap">{new Date(log.created_at).toLocaleString('id-ID')}</td>
                  <td className="px-6 py-3 capitalize font-medium">
                    <span className={`px-2 py-1 rounded bg-muted text-xs ${log.provider === 'claude' ? 'text-purple-600' : ''}`}>
                      {log.provider}
                    </span>
                  </td>
                  <td className="px-6 py-3">{log.feature}</td>
                  <td className="px-6 py-3 text-muted-foreground">{log.input_tokens + log.output_tokens}</td>
                  <td className="px-6 py-3 font-mono">${log.cost_usd.toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
