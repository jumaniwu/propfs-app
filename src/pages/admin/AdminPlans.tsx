// ============================================================
// ADMIN — Katalog & Harga Langganan
// Tiga katalog berbayar (Feasibility Study, Kontraktor AI, dan gabungan
// keduanya) plus Free Trial. Harga dan JUMLAH PROYEK tiap katalog diatur
// di sini, bukan di kode.
// ============================================================
import { useState, useEffect } from 'react'
import {
  Save, RefreshCw, CheckCircle2, Circle, Info, PlusCircle, ToggleLeft, ToggleRight,
  Shield, Calculator, BarChart3, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import {
  KATALOG_DEFAULT, FITUR_KATALOG, bacaKatalog, urutkanKatalog, muatKatalog, hargaEfektif,
  type KatalogPaket,
} from '@/lib/planCatalog'

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

const IKON_KATALOG: Record<string, React.ElementType> = {
  free: Shield, fs: Calculator, kontraktor: BarChart3, bundle: Layers,
}
const WARNA_KATALOG: Record<string, string> = {
  free: 'bg-slate-100 text-slate-500',
  fs: 'bg-blue-50 text-blue-600',
  kontraktor: 'bg-emerald-50 text-emerald-600',
  bundle: 'bg-gold text-navy',
}
const LABEL_CAKUPAN: Record<string, string> = {
  feasibility: 'Feasibility Study', kontraktor: 'Kontraktor AI',
  bundle: 'FS + Kontraktor AI', none: 'Trial (tanpa produk berbayar)',
}

export default function AdminPlans() {
  const [plans, setPlans] = useState<KatalogPaket[]>(KATALOG_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Add-on: beli slot proyek ekstra tanpa naik paket
  const [addonEnabled, setAddonEnabled] = useState(false)
  const [addonFsPrice, setAddonFsPrice] = useState(75000)
  const [addonCostPrice, setAddonCostPrice] = useState(50000)
  const [savingAddon, setSavingAddon] = useState(false)

  useEffect(() => {
    async function loadCatalog() {
      try {
        // muatKatalog() memakai REST langsung + batas waktu; bacaKatalog() di
        // dalamnya memahami katalog lama (Starter/Pro) dan melengkapi katalog
        // baru yang belum ada, jadi editor tidak pernah kosong.
        setPlans(urutkanKatalog(await muatKatalog()))

        const { data: addonRows } = await supabase
          .from('app_settings').select('key, value')
          .in('key', ['addon_features_enabled', 'addon_fs_price', 'addon_cost_price'])
        if (addonRows) {
          const enabledRow = addonRows.find(r => r.key === 'addon_features_enabled')
          const fsPriceRow = addonRows.find(r => r.key === 'addon_fs_price')
          const costPriceRow = addonRows.find(r => r.key === 'addon_cost_price')
          if (enabledRow) setAddonEnabled(enabledRow.value === true || enabledRow.value === 'true')
          if (fsPriceRow) setAddonFsPrice(Number(fsPriceRow.value) || 75000)
          if (costPriceRow) setAddonCostPrice(Number(costPriceRow.value) || 50000)
        }
      } catch {
        setPlans(urutkanKatalog(bacaKatalog(null)))
      } finally { setLoading(false) }
    }
    loadCatalog()
  }, [])

  function updatePlan<K extends keyof KatalogPaket>(id: string, field: K, value: KatalogPaket[K]) {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  function toggleFeature(planId: string, key: string) {
    setPlans(prev => prev.map(p => {
      if (p.id !== planId) return p
      const cur = p.features[key]
      return { ...p, features: { ...p.features, [key]: !(typeof cur === 'number' ? cur > 0 : !!cur) } }
    }))
  }

  function setFeatureNumber(planId: string, key: string, value: number) {
    setPlans(prev => prev.map(p =>
      p.id === planId ? { ...p, features: { ...p.features, [key]: value } } : p))
  }

  /** Hanya satu katalog boleh ditandai rekomendasi. */
  function setRecommended(id: string) {
    setPlans(prev => prev.map(p => ({ ...p, recommended: p.id === id ? !p.recommended : false })))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: existing } = await supabase
        .from('app_settings').select('key').eq('key', 'plan_catalog').maybeSingle()
      if (existing) {
        const { error } = await supabase.from('app_settings').update({ value: plans }).eq('key', 'plan_catalog')
        if (error) throw error
      } else {
        const { error } = await supabase.from('app_settings').insert({ key: 'plan_catalog', value: plans })
        if (error) throw error
      }
      toast({ title: '✅ Katalog Tersimpan', description: 'Harga, jumlah proyek, dan fitur paket berhasil disimpan.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AdminPlans] Save error:', err)
      toast({ title: 'Gagal Menyimpan', description: msg || 'Pastikan SQL migration sudah dijalankan di Supabase.', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  async function saveAddonSettings() {
    setSavingAddon(true)
    try {
      const updates = [
        { key: 'addon_features_enabled', value: addonEnabled },
        { key: 'addon_fs_price', value: addonFsPrice },
        { key: 'addon_cost_price', value: addonCostPrice },
      ]
      for (const u of updates) {
        const { data: existing } = await supabase.from('app_settings').select('key').eq('key', u.key).maybeSingle()
        if (existing) await supabase.from('app_settings').update({ value: u.value }).eq('key', u.key)
        else await supabase.from('app_settings').insert({ key: u.key, value: u.value })
      }
      toast({ title: '✅ Pengaturan Add-on Tersimpan' })
    } catch (err: unknown) {
      toast({ title: 'Gagal Menyimpan', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally { setSavingAddon(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <RefreshCw className="h-6 w-6 animate-spin text-gold mr-3" />
        <span className="text-muted-foreground font-medium">Memuat katalog harga...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-0 bg-slate-50/90 backdrop-blur-xl pt-4 pb-6 z-10 border-b border-navy/5">
        <div className="space-y-1">
          <h2 className="font-serif text-3xl font-black text-navy tracking-tight">Katalog & Harga Langganan</h2>
          <p className="text-sm text-slate-500 font-medium">
            Tiga katalog: Feasibility Study, Kontraktor AI, dan gabungan keduanya. Atur harga & jumlah proyek di sini.
          </p>
        </div>
        <Button variant="gold"
          className="w-full md:w-auto gap-3 h-14 px-10 text-lg font-black shadow-2xl shadow-gold/20 active:scale-95 transition-all"
          onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          {saving ? 'MENYIMPAN...' : 'SIMPAN HARGA'}
        </Button>
      </div>

      {/* Kartu katalog */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map(plan => {
          const Ikon = IKON_KATALOG[plan.id] || Shield
          const sorot = plan.recommended
          const adaPromo = plan.promoPriceIdr !== null && plan.promoPriceIdr > 0 && plan.promoPriceIdr < plan.priceIdr
          const gratis = plan.id === 'free'
          const pakaiFs = plan.product === 'feasibility' || plan.product === 'bundle' || gratis
          const pakaiCost = plan.product === 'kontraktor' || plan.product === 'bundle'

          return (
            <div key={plan.id}
              className={`group relative p-6 sm:p-8 rounded-[32px] border-2 transition-all duration-500 overflow-hidden flex flex-col h-full
                ${sorot ? 'bg-navy text-white border-gold shadow-2xl' : 'bg-white border-slate-100 hover:border-gold/30 shadow-sm'}
                ${plan.isVisible === false ? 'opacity-50 grayscale' : ''}`}>

              {/* Header kartu */}
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${WARNA_KATALOG[plan.id] || WARNA_KATALOG.free}`}>
                    <Ikon className="h-7 w-7" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <input
                      value={plan.name}
                      onChange={e => updatePlan(plan.id, 'name', e.target.value)}
                      className={`text-xl font-black bg-transparent border-b border-dashed w-full outline-none
                        ${sorot ? 'text-gold border-white/20' : 'text-navy border-slate-200'}`}
                    />
                    <p className={`text-[10px] font-black uppercase tracking-widest ${sorot ? 'text-white/40' : 'text-slate-400'}`}>
                      {LABEL_CAKUPAN[plan.product ?? 'none']} · ID: {plan.id}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                  <button onClick={() => setRecommended(plan.id)}
                    className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border transition-colors
                      ${sorot ? 'bg-gold text-navy border-gold' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    {sorot ? 'Rekomendasi' : 'Jadikan Unggulan'}
                  </button>
                  <button onClick={() => updatePlan(plan.id, 'isVisible', !plan.isVisible)}
                    className={`text-xs px-3 py-1 rounded-full font-bold border transition-colors
                      ${plan.isVisible !== false ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                    {plan.isVisible !== false ? '✅ Tampil' : '👁️ Sembunyi'}
                  </button>
                </div>
              </div>

              {/* Deskripsi */}
              <div className="space-y-1.5 mb-6">
                <label className={`text-[10px] font-black uppercase tracking-wider ${sorot ? 'text-white/50' : 'text-slate-400'}`}>
                  Deskripsi Singkat (tampil di halaman harga)
                </label>
                <textarea
                  rows={2} value={plan.deskripsi}
                  onChange={e => updatePlan(plan.id, 'deskripsi', e.target.value)}
                  placeholder="mis. Analisa kelayakan proyek properti"
                  className={`w-full rounded-xl px-3 py-2 text-sm border-2 outline-none resize-none
                    ${sorot ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'bg-slate-50 border-slate-100 text-navy'}`}
                />
              </div>

              {/* JUMLAH PROYEK — inti "harga berdasarkan per proyek" */}
              <div className="space-y-2 mb-6">
                <p className={`text-[10px] font-black uppercase tracking-wider ${sorot ? 'text-white/50' : 'text-slate-400'}`}>
                  Jumlah Proyek Termasuk
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold ${sorot ? 'text-white/60' : 'text-slate-500'}`}>Proyek Feasibility Study</label>
                    <input type="number" min={0} disabled={!pakaiFs}
                      value={plan.fsProjects}
                      onChange={e => updatePlan(plan.id, 'fsProjects', parseInt(e.target.value) || 0)}
                      className={`w-full h-12 px-3 rounded-xl font-black text-lg border-2 outline-none disabled:opacity-30
                        ${sorot ? 'bg-white/10 border-white/10 text-gold' : 'bg-slate-50 border-slate-100 text-navy'}`} />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold ${sorot ? 'text-white/60' : 'text-slate-500'}`}>Proyek Kontraktor AI</label>
                    <input type="number" min={0} disabled={!pakaiCost}
                      value={plan.costProjects}
                      onChange={e => updatePlan(plan.id, 'costProjects', parseInt(e.target.value) || 0)}
                      className={`w-full h-12 px-3 rounded-xl font-black text-lg border-2 outline-none disabled:opacity-30
                        ${sorot ? 'bg-white/10 border-white/10 text-gold' : 'bg-slate-50 border-slate-100 text-navy'}`} />
                  </div>
                </div>
                <p className={`text-[11px] ${sorot ? 'text-white/40' : 'text-slate-400'}`}>
                  Isi <b>999</b> untuk tak terbatas. Kolom yang tidak dipakai katalog ini otomatis nonaktif.
                </p>
              </div>

              {/* HARGA */}
              <div className="space-y-2 mb-6">
                <p className={`text-[10px] font-black uppercase tracking-wider ${sorot ? 'text-white/50' : 'text-slate-400'}`}>
                  Harga per Bulan
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold ${sorot ? 'text-white/60' : 'text-slate-500'}`}>Harga Normal (IDR)</label>
                    <input type="number" min={0} disabled={gratis}
                      value={plan.priceIdr}
                      onChange={e => updatePlan(plan.id, 'priceIdr', parseInt(e.target.value) || 0)}
                      className={`w-full h-12 px-3 rounded-xl font-black text-lg border-2 outline-none disabled:opacity-30
                        ${sorot ? 'bg-white/10 border-white/10 text-white' : 'bg-slate-50 border-slate-100 text-navy'}`} />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold ${sorot ? 'text-white/60' : 'text-slate-500'}`}>Harga Promo (kosongkan bila tidak ada)</label>
                    <input type="number" min={0} disabled={gratis}
                      value={plan.promoPriceIdr ?? ''}
                      onChange={e => updatePlan(plan.id, 'promoPriceIdr', e.target.value === '' ? null : (parseInt(e.target.value) || 0))}
                      className={`w-full h-12 px-3 rounded-xl font-black text-lg border-2 outline-none disabled:opacity-30
                        ${sorot ? 'bg-white/10 border-white/10 text-gold' : 'bg-slate-50 border-slate-100 text-emerald-600'}`} />
                  </div>
                </div>

                {!gratis && plan.priceIdr > 0 && (
                  <div className={`rounded-xl px-4 py-3 flex items-baseline gap-2 flex-wrap ${sorot ? 'bg-white/5' : 'bg-slate-50'}`}>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${sorot ? 'text-white/40' : 'text-slate-400'}`}>Tampil:</span>
                    {adaPromo && (
                      <span className={`text-sm line-through ${sorot ? 'text-white/40' : 'text-slate-400'}`}>{rp(plan.priceIdr)}</span>
                    )}
                    <span className={`text-2xl font-black ${adaPromo ? 'text-emerald-500' : sorot ? 'text-white' : 'text-navy'}`}>
                      {rp(hargaEfektif(plan))}
                    </span>
                    <span className={`text-sm ${sorot ? 'text-white/40' : 'text-slate-400'}`}>/bulan</span>
                    {adaPromo && (
                      <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                        HEMAT {Math.round((1 - plan.promoPriceIdr! / plan.priceIdr) * 100)}%
                      </span>
                    )}
                  </div>
                )}
                {plan.priceIdr === 0 && !gratis && (
                  <p className="text-[11px] font-bold text-amber-600">
                    ⚠️ Harga masih 0 — katalog ini belum bisa dibeli pelanggan. Isi harganya lebih dulu.
                  </p>
                )}
              </div>

              {/* Fitur */}
              <div className="space-y-3">
                <p className={`text-[10px] font-black uppercase tracking-wider ${sorot ? 'text-white/50' : 'text-slate-400'}`}>
                  Fitur Paket (Checklist)
                </p>
                <div className="space-y-1">
                  {FITUR_KATALOG.map(feat => {
                    const value = plan.features[feat.key]
                    const aktif = typeof value === 'number' ? value > 0 : !!value
                    return (
                      <div key={feat.key} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${sorot ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                        <button className="shrink-0"
                          onClick={() => {
                            if (feat.inputType === 'number') {
                              const n = typeof value === 'number' ? value : 0
                              setFeatureNumber(plan.id, feat.key, n > 0 ? 0 : 1)
                            } else toggleFeature(plan.id, feat.key)
                          }}>
                          {aktif
                            ? <CheckCircle2 className={`h-5 w-5 ${sorot ? 'text-gold' : 'text-emerald-500'}`} />
                            : <Circle className={`h-5 w-5 ${sorot ? 'text-white/20' : 'text-slate-300'}`} />}
                        </button>
                        <span className={`text-sm font-medium flex-1 ${aktif
                          ? (sorot ? 'text-white' : 'text-navy')
                          : (sorot ? 'text-white/30 line-through' : 'text-slate-400 line-through')}`}>
                          {feat.label}
                        </span>
                        {feat.inputType === 'number' && aktif && (
                          <input type="number" min={1}
                            className={`w-16 h-8 text-center rounded-lg text-xs font-bold border-none ${sorot ? 'bg-white/10 text-gold' : 'bg-slate-100 text-navy'}`}
                            value={typeof value === 'number' ? value : 1}
                            onChange={e => setFeatureNumber(plan.id, feat.key, parseInt(e.target.value) || 1)} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add-on slot ekstra */}
      <div className="border-2 border-dashed border-navy/20 rounded-[32px] p-8 space-y-6 bg-navy/[0.02]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-navy/10 rounded-2xl flex items-center justify-center">
              <PlusCircle className="h-7 w-7 text-navy" />
            </div>
            <div>
              <h3 className="text-xl font-black text-navy">Add-on: Beli Slot Ekstra Proyek</h3>
              <p className="text-sm text-slate-500 mt-0.5">Pelanggan menambah proyek satuan tanpa harus naik katalog.</p>
            </div>
          </div>
          <button onClick={() => setAddonEnabled(v => !v)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border-2 transition-all
              ${addonEnabled ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {addonEnabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {addonEnabled ? '🟢 AKTIF (Tampil ke User)' : '⭕ NON-AKTIF (Disembunyikan)'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Harga 1 Proyek Ekstra — Feasibility Study (IDR)</label>
            <div className="relative">
              <span className="absolute left-4 top-4 font-bold text-slate-400">Rp</span>
              <input type="number"
                className="w-full h-14 pl-12 pr-4 rounded-2xl font-bold text-xl bg-white border-2 border-slate-100 focus:border-navy/30 text-navy"
                value={addonFsPrice} onChange={e => setAddonFsPrice(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Harga 1 Proyek Ekstra — Kontraktor AI (IDR)</label>
            <div className="relative">
              <span className="absolute left-4 top-4 font-bold text-slate-400">Rp</span>
              <input type="number"
                className="w-full h-14 pl-12 pr-4 rounded-2xl font-bold text-xl bg-white border-2 border-slate-100 focus:border-navy/30 text-navy"
                value={addonCostPrice} onChange={e => setAddonCostPrice(parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button className="bg-navy text-white hover:bg-navy/90 font-bold gap-2 px-8"
            onClick={saveAddonSettings} disabled={savingAddon}>
            {savingAddon ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingAddon ? 'Menyimpan...' : 'Simpan Pengaturan Add-on'}
          </Button>
        </div>
      </div>

      {/* Petunjuk */}
      <div className="bg-amber-50 border-2 border-amber-100 p-8 rounded-[40px] flex flex-col md:flex-row items-center gap-6">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shrink-0 shadow-lg">
          <Info className="h-8 w-8 text-amber-600" />
        </div>
        <div className="space-y-1 text-center md:text-left">
          <p className="font-black text-amber-900 text-lg">Cara Kerja Katalog</p>
          <p className="text-amber-800/70 text-sm font-medium leading-relaxed">
            Ada <strong>3 katalog berbayar</strong>: Feasibility Study, Kontraktor AI, dan gabungan keduanya —
            plus Free Trial. Isi <strong>jumlah proyek</strong> dan <strong>harga per bulan</strong> tiap katalog,
            lalu klik <strong>SIMPAN HARGA</strong>. Perubahan langsung tampil di landing page dan halaman harga.
            <br /><br />
            Katalog dengan harga <strong>Rp 0</strong> tidak bisa dibeli pelanggan — isi harganya lebih dulu.
            Sembunyikan katalog yang belum siap dijual dengan tombol <strong>Tampil / Sembunyi</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
