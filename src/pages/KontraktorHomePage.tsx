// ============================================================
// HOME KONTRAKTOR AI — halaman pembuka modul (gaya aplikasi bank):
// kartu proyek, grid menu berikon per kategori, dan aktivitas terbaru.
// Halaman ini hanya "pintu masuk"; seluruh fungsi lama tetap berjalan di
// /cost-control dan dibuka lewat deep-link ?tab=&sub=&project=.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bell, Users, Eye, EyeOff, Plus, ChevronRight, ArrowRight,
  Building2, MapPin, X, ReceiptIcon, Info,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useCostStore, type SavedCostProject } from '@/store/costStore'
import {
  MENU_ITEMS, KATEGORI, cariMenu, targetUrl, butuhProyek,
  type MenuItem, type MenuKategori,
} from '@/lib/kontraktorMenu'

const HIDE_KEY = 'propfs-kontraktor-hide-amount'

function salam(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const rpRingkas = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} Jt`
  return rp(n)
}

/** "2026-07-24" → "24 Jul". Kembalikan apa adanya bila bukan tanggal. */
function tglSingkat(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

/** Ringkasan angka satu proyek untuk kartu di Home. */
function ringkasProyek(p: SavedCostProject) {
  const rab = p.plan?.totalBaselineBudget ?? 0
  const realisasi = (p.realisasiEntries ?? []).reduce((s, e) => s + (e.jumlah ?? 0), 0)
  const comps = p.plan?.components ?? []
  const totalBobot = comps.reduce((s, c) => s + c.totalPlannedCost, 0)
  const progress = totalBobot > 0
    ? comps.reduce((s, c) => s + (c.progressPercentage ?? 0) * c.totalPlannedCost, 0) / totalBobot
    : 0
  const terpakaiPct = rab > 0 ? (realisasi / rab) * 100 : 0
  return { rab, realisasi, progress, terpakaiPct, deviasi: progress - terpakaiPct }
}

export default function KontraktorHomePage() {
  const navigate = useNavigate()
  const { profile, isFeatureEnabled } = useAuthStore()
  const { savedProjects, loadProjects, loadProject, projectInfo } = useCostStore()

  const [q, setQ] = useState('')
  const [kategori, setKategori] = useState<MenuKategori | 'semua'>('semua')
  const [hideAmount, setHideAmount] = useState(() => localStorage.getItem(HIDE_KEY) === '1')
  const [pickerFor, setPickerFor] = useState<MenuItem | null>(null)
  const [bannerTutup, setBannerTutup] = useState(false)

  useEffect(() => { loadProjects() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAmount = () => setHideAmount(v => {
    localStorage.setItem(HIDE_KEY, v ? '0' : '1')
    return !v
  })

  // proyek aktif = yang sedang dibuka, kalau tidak ada → yang terakhir diperbarui
  const urut = useMemo(
    () => [...savedProjects].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [savedProjects],
  )
  const proyekAktif = useMemo(
    () => urut.find(p => p.info.id === projectInfo?.id) ?? urut[0] ?? null,
    [urut, projectInfo],
  )

  const menuTersaring = useMemo(() => {
    const byFeature = MENU_ITEMS.filter(i => !i.feature || isFeatureEnabled(i.feature))
    const byKategori = kategori === 'semua' ? byFeature : byFeature.filter(i => i.kategori === kategori)
    return cariMenu(byKategori, q)
  }, [kategori, q, isFeatureEnabled])

  function bukaMenu(item: MenuItem, projectId?: string) {
    if (butuhProyek(item)) {
      const id = projectId ?? proyekAktif?.info.id
      if (!id) { setPickerFor(item); return }
      loadProject(id)
      navigate(targetUrl(item, id))
      return
    }
    navigate(targetUrl(item))
  }

  // ── Aktivitas terbaru: diturunkan dari data lokal (tanpa loading) ──────────
  const aktivitas = useMemo(() => {
    const items: { id: string; ikon: 'biaya' | 'proyek'; teks: string; sub: string; waktu: string }[] = []
    for (const p of urut) {
      for (const e of (p.realisasiEntries ?? []).slice(-4)) {
        items.push({
          id: `${p.info.id}-${e.id}`,
          ikon: 'biaya',
          teks: e.namaMaterial || e.jenisKerja || e.keterangan || 'Pengeluaran dicatat',
          sub: `${p.info.projectName} · ${rpRingkas(e.jumlah ?? 0)}`,
          waktu: e.tanggal ?? '',
        })
      }
    }
    return items.sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, 5)
  }, [urut])

  const banner = useMemo(() => {
    const list: string[] = []
    if (savedProjects.length === 0) list.push('Belum ada proyek. Buat proyek pertama Anda untuk mulai memakai Kontraktor AI.')
    else {
      const tanpaRab = savedProjects.filter(p => !p.plan).length
      if (tanpaRab > 0) list.push(`${tanpaRab} proyek belum punya RAB — unggah RAB agar Kurva S & realisasi bisa dihitung.`)
    }
    return list
  }, [savedProjects])

  return (
    <div className="min-h-screen bg-slate-100/70">
      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-b from-navy to-navy/95 text-white pb-20">
        <div className="max-w-5xl mx-auto px-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-serif font-bold text-lg leading-tight">Kontraktor AI</p>
              <p className="text-white/60 text-[11px] truncate">
                {profile?.company || 'Workspace Saya'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate('/kontraktor/tim')}
                className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" title="Tim">
                <Users className="w-[18px] h-[18px]" />
              </button>
              <button className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center relative" title="Notifikasi">
                <Bell className="w-[18px] h-[18px]" />
                {banner.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gold" />}
              </button>
              <button onClick={() => navigate('/profile')}
                className="w-9 h-9 rounded-full bg-gold text-navy font-black text-sm flex items-center justify-center shrink-0">
                {(profile?.full_name || 'P').charAt(0).toUpperCase()}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4 relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Cari menu, proyek, laporan…"
              className="w-full h-11 pl-11 pr-4 rounded-full bg-white text-navy text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>

          <p className="mt-4 text-sm text-white/80">
            {salam()}, <span className="font-bold text-white">{(profile?.full_name || 'Rekan').split(' ')[0]}</span>!
          </p>
        </div>
      </div>

      {/* ══ KONTEN (naik menimpa header) ═════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 -mt-14 pb-10 space-y-5">

        {/* ── Kartu proyek (carousel) ─────────────────────────────────── */}
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 scrollbar-none">
          {urut.map(p => {
            const s = ringkasProyek(p)
            const aktif = p.info.id === proyekAktif?.info.id
            return (
              <div key={p.info.id}
                className={`snap-start shrink-0 w-[86%] sm:w-[340px] rounded-2xl bg-white p-4 shadow-lg border transition-colors ${
                  aktif ? 'border-gold' : 'border-transparent'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-navy text-sm truncate">{p.info.projectName}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />{p.info.location || 'Lokasi belum diisi'}
                    </p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-navy/8 text-navy px-2 py-1 rounded-full shrink-0">
                    {p.info.type || 'Proyek'}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Nilai RAB</p>
                    <p className="font-bold text-navy text-xl tracking-tight tabular-nums">
                      {hideAmount ? 'Rp ••••••' : rpRingkas(s.rab)}
                    </p>
                  </div>
                  <button onClick={toggleAmount} className="text-muted-foreground hover:text-navy p-1">
                    {hideAmount ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-muted-foreground">Realisasi</p>
                    <p className="font-bold text-navy">{hideAmount ? '••••' : rpRingkas(s.realisasi)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-muted-foreground">Terpakai</p>
                    <p className="font-bold text-navy">{s.terpakaiPct.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="flex justify-between text-[10px] font-semibold mb-1">
                    <span className="text-muted-foreground">Progress fisik</span>
                    <span className={s.deviasi >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {s.progress.toFixed(1)}% ({s.deviasi >= 0 ? '+' : ''}{s.deviasi.toFixed(1)})
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-navy rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, s.progress))}%` }} />
                  </div>
                </div>

                <button onClick={() => { loadProject(p.info.id); navigate('/cost-control?tab=overview') }}
                  className="mt-3 w-full h-9 rounded-xl bg-navy text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-navy/90">
                  Buka Workspace <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}

          {/* Kartu buat proyek baru */}
          <button onClick={() => navigate('/cost-control')}
            className="snap-start shrink-0 w-[60%] sm:w-[220px] rounded-2xl bg-white border-2 border-dashed border-navy/20 p-4 flex flex-col items-center justify-center gap-2 text-navy hover:border-navy/40 shadow-lg transition-colors min-h-[180px]">
            <div className="w-11 h-11 rounded-full bg-navy/8 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">Buat Proyek Baru</span>
            <span className="text-[10px] text-muted-foreground text-center px-2">Mulai kelola RAB, biaya & lapangan</span>
          </button>
        </div>

        {/* ── Banner info ─────────────────────────────────────────────── */}
        {!bannerTutup && banner.length > 0 && (
          <div className="rounded-2xl bg-white border border-gold/30 p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gold-lt flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-[#8A6D1F]" />
            </div>
            <p className="text-xs text-slate-700 flex-1 leading-relaxed">{banner[0]}</p>
            <button onClick={() => setBannerTutup(true)} className="text-muted-foreground hover:text-navy shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Grid menu ───────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-border p-4 space-y-4">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
            {KATEGORI.map(k => (
              <button key={k.key} onClick={() => setKategori(k.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  kategori === k.key ? 'bg-navy text-white' : 'bg-slate-100 text-muted-foreground hover:bg-slate-200'}`}>
                {k.label}
              </button>
            ))}
          </div>

          {menuTersaring.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Menu "{q}" tidak ditemukan.
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-x-2 gap-y-4">
              {menuTersaring.map(item => {
                const Icon = item.icon
                return (
                  <button key={item.key} onClick={() => bukaMenu(item)}
                    className="flex flex-col items-center gap-1.5 group">
                    <span className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 group-hover:scale-105 ${item.tone}`}>
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                      {item.tag && (
                        <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                          {item.tag}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-semibold text-navy text-center leading-tight px-0.5">
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Aktivitas terbaru ───────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-navy text-sm">Aktivitas Terbaru</h2>
            {proyekAktif && (
              <button onClick={() => { loadProject(proyekAktif.info.id); navigate('/cost-control?tab=realisasi') }}
                className="text-[11px] font-bold text-muted-foreground hover:text-navy flex items-center gap-0.5">
                Lihat semua <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {aktivitas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              Belum ada aktivitas. Catat pengeluaran atau minta pekerja mengisi laporan harian.
            </p>
          ) : (
            <div className="space-y-2.5">
              {aktivitas.map(a => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <ReceiptIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-navy truncate">{a.teks}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.sub}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{tglSingkat(a.waktu)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          PropFS · Kontraktor AI — manajemen proyek konstruksi
        </p>
      </div>

      {/* ══ SHEET PILIH PROYEK ═══════════════════════════════════════════ */}
      {pickerFor && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => setPickerFor(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-navy text-sm">Pilih Proyek</h3>
                <p className="text-[11px] text-muted-foreground">
                  Menu <b>{pickerFor.label}</b> dibuka per proyek.
                </p>
              </div>
              <button onClick={() => setPickerFor(null)} className="text-muted-foreground hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            {urut.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <Building2 className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-xs text-muted-foreground">Belum ada proyek tersimpan.</p>
                <button onClick={() => navigate('/cost-control')}
                  className="h-10 px-5 rounded-xl bg-navy text-white text-xs font-bold">
                  Buat Proyek Baru
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {urut.map(p => (
                  <button key={p.info.id}
                    onClick={() => { const it = pickerFor; setPickerFor(null); bukaMenu(it, p.info.id) }}
                    className="w-full text-left rounded-xl border border-border p-3 hover:border-navy hover:bg-slate-50 transition-colors">
                    <p className="text-xs font-bold text-navy truncate">{p.info.projectName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.info.location || 'Lokasi belum diisi'} · {rpRingkas(p.plan?.totalBaselineBudget ?? 0)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
