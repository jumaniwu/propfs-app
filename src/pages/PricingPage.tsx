// ============================================================
// PropFS — Halaman Harga
// Tiga katalog langganan (Feasibility Study, Kontraktor AI, dan gabungan
// keduanya) plus Free Trial. Harga dan jumlah proyek dibaca dari katalog
// yang diatur admin di backend (app_settings.plan_catalog).
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2, XCircle, ArrowLeft, Clock, Calendar, CalendarDays,
  Shield, Calculator, BarChart3, Layers, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Header from '@/components/layout/Header'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { usePPNRate } from '@/hooks/usePPNRate'
import {
  bacaKatalog, katalogTampil, muatKatalog, FITUR_KATALOG, hargaEfektif, totalHarga,
  type KatalogPaket,
} from '@/lib/planCatalog'
import { produkTercakup } from '@/lib/produk'

// ── Pilihan durasi ──────────────────────────────────────────
const DURATIONS = [
  { months: 1,  label: '1 Bulan',  icon: Clock,        discount: 0,  badge: '' },
  { months: 3,  label: '3 Bulan',  icon: Calendar,     discount: 10, badge: 'HEMAT 10%' },
  { months: 12, label: '12 Bulan', icon: CalendarDays, discount: 20, badge: 'HEMAT 20%' },
]

const IKON: Record<string, React.ElementType> = {
  free: Shield, fs: Calculator, kontraktor: BarChart3, bundle: Layers,
}

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

/** Nama fitur yang bisa dibaca orang, untuk pesan "fitur terkunci". */
const NAMA_FITUR: Record<string, string> = {
  cost_control: 'Kontraktor AI', cost_rab: 'RAB', cost_realisasi: 'Realisasi Biaya',
  cost_material: 'Material Lapangan', scurve: 'Kurva S', fs_module: 'Feasibility Study',
  ai_solver: 'AI Solver', pdf_export: 'Ekspor PDF',
}

/** Baris kuota proyek yang ditampilkan di kartu harga. */
function barisProyek(paket: KatalogPaket): Array<{ label: string; ada: boolean }> {
  const produk = produkTercakup(paket.product)
  const teks = (n: number, nama: string) =>
    `${n >= 999 ? 'Tak terbatas' : n} proyek ${nama}`

  if (paket.id === 'free') {
    return [{ label: teks(paket.fsProjects, 'Feasibility Study'), ada: paket.fsProjects > 0 }]
  }
  const out: Array<{ label: string; ada: boolean }> = []
  if (produk.includes('feasibility')) out.push({ label: teks(paket.fsProjects, 'Feasibility Study'), ada: paket.fsProjects > 0 })
  if (produk.includes('kontraktor')) out.push({ label: teks(paket.costProjects, 'Kontraktor AI'), ada: paket.costProjects > 0 })
  return out
}

export default function PricingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { getPlanFor } = useAuthStore()
  const { ppnPct, loading: ppnLoading } = usePPNRate()

  const [selectedMonths, setSelectedMonths] = useState(1)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [katalog, setKatalog] = useState<KatalogPaket[]>([])
  const [loading, setLoading] = useState(true)

  const dur = DURATIONS.find(d => d.months === selectedMonths)!

  // Paket aktif pelanggan per produk — dipakai menandai "Paket Aktif"
  const planFs = getPlanFor('feasibility')
  const planKontraktor = getPlanFor('kontraktor')

  // Datang ke sini karena sebuah fitur terkunci: katakan fitur MANA, jangan
  // biarkan pemakainya menebak mengapa ia tiba-tiba berada di halaman harga.
  useEffect(() => {
    const fitur = (location.state as { upgradeNeeded?: string } | null)?.upgradeNeeded
    if (!fitur) return
    toast({
      title: 'Fitur terkunci 🔒',
      description: `${NAMA_FITUR[fitur] ?? fitur} tidak termasuk dalam paket Anda saat ini. Pilih paket di bawah untuk membukanya.`,
      variant: 'destructive',
    })
  }, [])

  useEffect(() => {
    // muatKatalog() memakai REST langsung + batas waktu, dan selalu jatuh ke
    // katalog bawaan bila gagal, sehingga halaman harga tidak pernah kosong.
    muatKatalog()
      .then(setKatalog)
      .catch(() => setKatalog(bacaKatalog(null)))
      .finally(() => setLoading(false))
  }, [])

  const daftar = useMemo(() => {
    const tampil = katalogTampil(katalog)
    // Bila datang dari tombol "Mulai Berlangganan" satu produk, sorot katalog itu
    const fokus = searchParams.get('produk')
    if (fokus !== 'feasibility' && fokus !== 'kontraktor') return tampil
    return [...tampil].sort((a, b) => {
      const skor = (p: KatalogPaket) =>
        p.product === fokus ? 0 : p.product === 'bundle' ? 1 : p.id === 'free' ? 3 : 2
      return skor(a) - skor(b)
    })
  }, [katalog, searchParams])

  async function beli(paket: KatalogPaket, totalPrice: number, ppnAmount: number, grandTotal: number) {
    if (paket.id === 'free') { navigate('/auth'); return }
    setIsProcessing(paket.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`
      const invoicePayload = {
        user_id: user.id,
        plan_id: paket.id,
        invoice_number: invoiceNumber,
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + selectedMonths * 30 * 86400000).toISOString(),
        subtotal_idr: totalPrice,
        ppn_idr: ppnAmount,
        total_idr: grandTotal,
        status: 'pending' as const,
        product: paket.product,
      }

      // Bila kolom `product` belum ada (migrasi belum dijalankan), ulangi
      // tanpa kolom itu agar proses pembayaran tetap berjalan.
      let { data: dbInvoice, error: dbError } = await supabase
        .from('invoices').insert(invoicePayload).select().single()

      if (dbError) {
        const { product: _lewati, ...tanpaProduk } = invoicePayload
        const ulang = await supabase.from('invoices').insert(tanpaProduk).select().single()
        dbInvoice = ulang.data
        dbError = ulang.error
      }

      let invoiceId: string
      if (dbInvoice && !dbError) {
        invoiceId = dbInvoice.id
        localStorage.setItem(`propfs_invoice_${invoiceId}`, JSON.stringify({
          ...invoicePayload, id: invoiceId, created_at: dbInvoice.created_at,
        }))
      } else {
        console.warn('[Invoice] DB insert gagal, memakai localStorage:', dbError?.message)
        invoiceId = `local_${Math.random().toString(36).slice(2, 11)}`
        localStorage.setItem(`propfs_invoice_${invoiceId}`, JSON.stringify({
          ...invoicePayload, id: invoiceId, created_at: new Date().toISOString(),
        }))
      }
      navigate(`/payment/${invoiceId}`)
    } catch (e) {
      console.error(e)
    } finally { setIsProcessing(null) }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-12 space-y-10">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="font-serif text-3xl lg:text-4xl font-bold text-foreground">Pilih Langganan PropFS</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Berlangganan <strong>Feasibility Study</strong> saja, <strong>Kontraktor AI</strong> saja,
            atau <strong>keduanya sekaligus</strong> — jumlah proyek mengikuti katalog yang dipilih.
            {!ppnLoading && ppnPct > 0 && <> Semua harga <strong>belum termasuk PPN {ppnPct}%</strong>.</>}
          </p>
        </div>

        {/* Durasi — bisa digeser di layar sempit agar tidak menembus lebar layar */}
        <div className="flex justify-start sm:justify-center overflow-x-auto scrollbar-none -mx-4 px-4">
          <div className="inline-flex bg-muted rounded-2xl p-1.5 gap-1 mx-auto">
            {DURATIONS.map(d => {
              const DIcon = d.icon
              const aktif = selectedMonths === d.months
              return (
                <button key={d.months} onClick={() => setSelectedMonths(d.months)}
                  className={`relative flex shrink-0 items-center gap-1.5 px-3.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200
                    ${aktif ? 'bg-navy text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
                  <DIcon className="h-4 w-4 shrink-0" />
                  {d.label}
                  {d.badge && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${aktif ? 'bg-gold text-navy' : 'bg-green-500 text-white'}`}>
                      {d.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {dur.discount > 0 && (
          <div className="text-center">
            <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-1.5 text-sm font-bold">
              🎁 Hemat {dur.discount}% dengan paket {dur.label} — bayar sekarang, aktif langsung {dur.months} bulan
            </span>
          </div>
        )}

        {/* Kartu katalog */}
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            {daftar.map(paket => {
              const Ikon = IKON[paket.id] ?? Shield
              const sorot = paket.recommended === true
              const gratis = paket.id === 'free'
              const belumBerharga = !gratis && hargaEfektif(paket) <= 0

              const totalPrice = gratis ? 0 : totalHarga(paket, selectedMonths, dur.discount)
              const ppnAmount = Math.round(totalPrice * (ppnPct / 100))
              const grandTotal = totalPrice + ppnAmount
              const adaPromo = paket.promoPriceIdr !== null && paket.promoPriceIdr > 0 && paket.promoPriceIdr < paket.priceIdr

              const produk = produkTercakup(paket.product)
              const paketAktif = !gratis && (
                (produk.includes('feasibility') && planFs === paket.id) ||
                (produk.includes('kontraktor') && planKontraktor === paket.id)
              )

              return (
                <div key={paket.id}
                  className={`relative rounded-3xl border-2 p-6 flex flex-col gap-5 transition-all
                    ${sorot ? 'bg-navy text-white border-gold shadow-2xl lg:scale-[1.03]' : 'bg-card border-border hover:border-gold/40'}`}>

                  {sorot && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-navy text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                      🔥 Paling Lengkap
                    </span>
                  )}

                  {/* Judul */}
                  <div className="space-y-2">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center
                      ${sorot ? 'bg-gold text-navy' : 'bg-navy/8 text-navy'}`}>
                      <Ikon className="h-5 w-5" />
                    </div>
                    <h3 className={`font-serif text-xl font-bold leading-tight ${sorot ? 'text-gold' : 'text-foreground'}`}>
                      {paket.name}
                    </h3>
                    {paket.deskripsi && (
                      <p className={`text-xs leading-relaxed ${sorot ? 'text-white/60' : 'text-muted-foreground'}`}>
                        {paket.deskripsi}
                      </p>
                    )}
                  </div>

                  {/* Harga */}
                  <div className="space-y-1">
                    {gratis ? (
                      <>
                        <p className={`text-3xl font-black ${sorot ? 'text-white' : 'text-foreground'}`}>Gratis</p>
                        <p className="text-xs text-muted-foreground">Untuk mencoba</p>
                      </>
                    ) : belumBerharga ? (
                      <>
                        <p className={`text-2xl font-black ${sorot ? 'text-white' : 'text-foreground'}`}>Segera</p>
                        <p className="text-xs text-muted-foreground">Harga belum ditentukan</p>
                      </>
                    ) : (
                      <>
                        {adaPromo && (
                          <p className={`text-sm line-through ${sorot ? 'text-white/40' : 'text-muted-foreground/60'}`}>
                            {rp(paket.priceIdr * selectedMonths)}
                          </p>
                        )}
                        <p className={`text-3xl font-black ${sorot ? 'text-white' : 'text-foreground'}`}>{rp(totalPrice)}</p>
                        <p className="text-xs text-muted-foreground">untuk {selectedMonths} bulan</p>
                        {ppnPct > 0 && (
                          <div className={`mt-2 pt-2 border-t text-xs space-y-0.5 ${sorot ? 'border-white/10' : 'border-border'}`}>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">PPN {ppnPct}%</span>
                              <span className={sorot ? 'text-white/70' : ''}>+ {rp(ppnAmount)}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span className={sorot ? 'text-gold' : 'text-foreground'}>Total Bayar</span>
                              <span className={sorot ? 'text-gold' : 'text-foreground'}>{rp(grandTotal)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Kuota proyek + fitur */}
                  <ul className="space-y-2 flex-1">
                    {barisProyek(paket).map(b => (
                      <li key={b.label} className="flex items-start gap-2.5 text-sm">
                        {b.ada
                          ? <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${sorot ? 'text-gold' : 'text-emerald-600'}`} />
                          : <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/30" />}
                        <span className={`font-bold ${b.ada ? (sorot ? 'text-white' : 'text-foreground') : 'text-muted-foreground/40 line-through'}`}>
                          {b.label}
                        </span>
                      </li>
                    ))}

                    {FITUR_KATALOG.map(f => {
                      const val = paket.features[f.key]
                      const ada = typeof val === 'number' ? val > 0 : !!val
                      const teks = typeof val === 'number' && val > 0
                        ? `${val >= 999 ? 'Tak terbatas' : val} ${f.suffix ?? ''} ${f.label}`.replace(/\s+/g, ' ').trim()
                        : f.label
                      return (
                        <li key={f.key} className="flex items-start gap-2.5 text-sm">
                          {ada
                            ? <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${sorot ? 'text-gold' : 'text-emerald-600'}`} />
                            : <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/30" />}
                          <span className={ada ? (sorot ? 'text-white' : 'text-foreground') : 'text-muted-foreground/40 line-through'}>
                            {teks}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {/* CTA */}
                  <Button
                    variant={sorot ? 'gold' : 'outline'}
                    className={`w-full h-11 font-bold mt-auto ${sorot ? '' : 'border-current'}`}
                    disabled={paketAktif || belumBerharga || isProcessing !== null}
                    onClick={() => beli(paket, totalPrice, ppnAmount, grandTotal)}
                  >
                    {paketAktif ? '✓ Paket Aktif'
                      : belumBerharga ? 'Belum Tersedia'
                        : isProcessing === paket.id ? 'Memproses...'
                          : gratis ? 'Mulai Gratis' : `Pilih ${paket.name}`}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          Langganan tiap produk berdiri sendiri. Membeli katalog <strong>Feasibility Study</strong> tidak
          otomatis membuka Kontraktor AI, dan sebaliknya — kecuali Anda memilih katalog gabungan.
        </p>
      </main>
    </div>
  )
}
