// ============================================================
// PropFS — Admin: Subscription Plans & Providers
// ============================================================

import { Crown, Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminPlans() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy flex items-center gap-2">
              <Crown className="h-6 w-6 text-gold" /> Manajemen Paket SaaS
           </h1>
           <p className="text-sm text-muted-foreground mt-1">Atur pembatasan fitur dan routing AI per plan.</p>
        </div>
      </div>

      <div className="bg-amber-50 text-amber-800 border border-amber-200 p-4 rounded-xl text-sm flex gap-3">
         <Sparkles className="h-5 w-5 shrink-0 text-amber-600" />
         <div>
            <strong>Info Sistem Routing AI:</strong><br />
            Konfigurasi saat ini di-hardcode ke dalam kode sumber (<code>src/lib/ai-router.ts</code>) untuk performa maksimal. Mengubah opsi di halaman ini memerlukan pembaruan schema backend di versi selanjutnya.
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Free Plan */}
         <div className="bg-card border border-border p-5 rounded-2xl">
            <div className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4">Free Plan</div>
            <div className="space-y-4">
               <div>
                 <label className="text-xs font-bold text-muted-foreground block mb-1">Max Proyek RAB</label>
                 <div className="bg-muted px-3 py-2 rounded-lg font-mono text-sm">2</div>
               </div>
               <div>
                 <label className="text-xs font-bold text-muted-foreground block mb-1">Akses AI</label>
                 <div className="bg-muted px-3 py-2 rounded-lg text-sm text-muted-foreground">Tidak Ada (Blocked)</div>
               </div>
               <div>
                 <label className="text-xs font-bold text-muted-foreground block mb-1">Export PDF</label>
                 <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm font-bold flex gap-2 items-center">
                    <Check className="h-4 w-4" /> Terkunci
                 </div>
               </div>
            </div>
         </div>

         {/* Starter Plan */}
         <div className="bg-card border border-border p-5 rounded-2xl relative overflow-hidden">
            <div className="text-sm font-bold uppercase tracking-widest text-blue-600 mb-4">Starter Plan</div>
            <div className="space-y-4 relative z-10">
               <div>
                 <label className="text-xs font-bold text-muted-foreground block mb-1">Max Proyek RAB</label>
                 <div className="bg-muted px-3 py-2 rounded-lg font-mono text-sm">5</div>
               </div>
               <div>
                 <label className="text-xs font-bold text-muted-foreground block mb-1">Provider RAB Parser</label>
                 <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg font-medium text-sm">Groq (Llama 3)</div>
               </div>
               <div>
                 <label className="text-xs font-bold text-muted-foreground block mb-1">Provider Realisasi Chat</label>
                 <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg font-medium text-sm">Gemini 1.5 Flash</div>
               </div>
               <Button className="w-full mt-4" variant="outline" disabled>Edit Starter Plan</Button>
            </div>
         </div>

         {/* Pro Plan */}
         <div className="bg-navy border-gold p-5 rounded-2xl shadow-xl relative overflow-hidden text-white border-2">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-gold/10 rounded-full blur-2xl" />
            <div className="text-sm font-bold uppercase tracking-widest text-gold mb-4 flex justify-between">
               Pro Plan
               <span className="bg-gold text-navy text-[9px] px-2 py-0.5 rounded-full font-black">POPULER</span>
            </div>
            <div className="space-y-4 relative z-10">
               <div>
                 <label className="text-xs font-bold text-white/50 block mb-1">Max Proyek RAB</label>
                 <div className="bg-white/10 px-3 py-2 rounded-lg font-mono text-sm">Unlimited</div>
               </div>
               <div>
                 <label className="text-xs font-bold text-white/50 block mb-1">Provider RAB Parser</label>
                 <div className="bg-gold/20 text-gold px-3 py-2 rounded-lg font-medium text-sm">Claude 3.5 Sonnet / Gemini Pro</div>
               </div>
               <div>
                 <label className="text-xs font-bold text-white/50 block mb-1">Provider Realisasi Chat</label>
                 <div className="bg-gold/20 text-gold px-3 py-2 rounded-lg font-medium text-sm">Gemini 1.5 Pro</div>
               </div>
               <Button className="w-full mt-4 bg-gold text-navy hover:bg-gold/90 font-bold" disabled>Edit Pro Plan</Button>
            </div>
         </div>
      </div>
    </div>
  )
}
