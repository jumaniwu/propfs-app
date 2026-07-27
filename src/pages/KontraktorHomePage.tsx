// ============================================================
// HOME KONTRAKTOR AI — halaman pembuka modul (gaya aplikasi bank):
// kartu proyek, grid menu berikon per kategori, dan aktivitas terbaru.
// Halaman ini hanya "pintu masuk"; seluruh fungsi lama tetap berjalan di
// /cost-control dan dibuka lewat deep-link ?tab=&sub=&project=.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Eye, EyeOff, Plus, ChevronRight, ArrowRight,
  Building2, MapPin, X, ReceiptIcon, Info,
} from 'lucide-react'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import HomePanelLapangan from '@/components/cost/HomePanelLapangan'
import { useAuthStore } from '@/store/authStore'
import { useCostStore, type SavedCostProject } from '@/store/costStore'
import {
  MENU_ITEMS, KATEGORI, cariMenu, targetUrl, butuhProyek,
  type MenuItem, type MenuKategori,
} from '@/lib/kontraktorMenu'
import {
  teamApi, getWorkspaceOwner, setWorkspaceOwner, roleSaatIni, sesiTim, type Workspace,
} from '@/lib/teamApi'
import { aksesLewatPerusahaan } from '@/lib/teamLogin'
import { can, MENU_KE_MODUL, ROLES } from '@/lib/teamRoles'
import { useBuatProyek } from '@/hooks/useBuatProyek'
import CreateProjectModal from '@/components/cost/CreateProjectModal'

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

  // Gerbang kuota + dialog buat proyek, sama persis dengan yang dipakai
  // Dashboard Kontraktor AI.
  const buatProyek = useBuatProyek()

  const [q, setQ] = useState('')
  const [kategori, setKategori] = useState<MenuKategori | 'semua'>('semua')
  const [hideAmount, setHideAmount] = useState(() => localStorage.getItem(HIDE_KEY) === '1')
  const [pickerFor, setPickerFor] = useState<MenuItem | null>(null)
  const [bannerTutup, setBannerTutup] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [wsOwner, setWsOwner] = useState<string | null>(() => getWorkspaceOwner())
  const [wsDimuat, setWsDimuat] = useState(false)
  const timSession = sesiTim()

  useEffect(() => {
    loadProjects()
    // daftar workspace perusahaan tempat pengguna ini menjadi anggota tim
    teamApi().myWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]))
      .finally(() => setWsDimuat(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const role = roleSaatIni(workspaces)
  const wsAktif = workspaces.find(w => w.owner_id === wsOwner)

  function gantiWorkspace(ownerId: string | null) {
    setWorkspaceOwner(ownerId)
    setWsOwner(ownerId)
    // muat ulang agar seluruh store menarik data workspace yang dipilih
    window.location.reload()
  }

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
    // saring sesuai role pada workspace aktif (pemilik sendiri = akses penuh)
    const byRole = byFeature.filter(i => {
      const modul = MENU_KE_MODUL[i.key]
      return !modul || can(role, modul, 'baca')
    })
    const byKategori = kategori === 'semua' ? byRole : byRole.filter(i => i.kategori === kategori)
    return cariMenu(byKategori, q)
  }, [kategori, q, isFeatureEnabled, role])

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

  // ── Bahan untuk panel dashboard (progres & stok) ──────────────────────────
  const proyekProgres = useMemo(
    () => urut.map(p => ({
      id: p.info.id,
      nama: p.info.projectName,
      progressPct: ringkasProyek(p).progress,
      startDate: p.info.startDate,
      durasiBulan: p.info.targetDurationMonths,
    })),
    [urut],
  )
  // sisa stok dihitung terhadap gabungan Material Schedule seluruh proyek
  const rencanaMaterial = useMemo(
    () => urut.flatMap(p => p.materialSchedule ?? []),
    [urut],
  )

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

  // Akun tim tidak punya langganan sendiri — aksesnya menumpang langganan
  // Kontraktor AI perusahaan. Diperiksa di sini karena penjaga rute tidak bisa
  // menunggu data workspace yang datang dari jaringan.
  if (timSession && wsDimuat && !aksesLewatPerusahaan(wsAktif ?? workspaces[0])) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
            <Info className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="font-serif text-xl font-bold text-navy">Langganan Perusahaan Berakhir</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {wsAktif?.perusahaan || workspaces[0]?.perusahaan || 'Perusahaan Anda'} belum
            memperpanjang langganan Kontraktor AI, jadi akun tim untuk sementara tidak bisa dipakai.
            Silakan hubungi admin perusahaan Anda.
          </p>
          <button onClick={() => useAuthStore.getState().signOut().then(() => navigate('/tim/masuk'))}
            className="w-full h-11 rounded-xl bg-navy text-white font-bold text-sm hover:bg-navy/90">
            Keluar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100/70">
      {/* ══ HEADER — komponen yang sama dipakai seluruh halaman Kontraktor AI ══ */}
      <KontraktorHeader
        pbExtra
        adaNotifikasi={banner.length > 0}
        identitas={timSession ? (
          // sesi tim dikunci ke satu perusahaan — tidak ada penukar workspace
          <p className="mt-0.5 text-[11px] text-white/70">
            {wsAktif?.perusahaan || 'Perusahaan'} · {ROLES.find(r => r.key === role)?.label ?? role}
          </p>
        ) : workspaces.length > 0 ? (
          // pengguna ini anggota tim di perusahaan lain → bisa berpindah workspace
          <select
            value={wsOwner ?? ''} onChange={e => gantiWorkspace(e.target.value || null)}
            aria-label="Pilih workspace"
            className="mt-0.5 bg-white/10 text-white/90 text-[11px] rounded-lg px-2 py-1 max-w-[210px] border border-white/20">
            <option value="" className="text-navy">Workspace Saya</option>
            {workspaces.map(w => (
              <option key={w.owner_id} value={w.owner_id} className="text-navy">
                {w.perusahaan || w.nama || 'Perusahaan'} ({ROLES.find(r => r.key === w.role)?.label ?? w.role})
              </option>
            ))}
          </select>
        ) : undefined}
      >
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
      </KontraktorHeader>

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

          {/* Kartu buat proyek baru — dialognya dibuka langsung di sini.
              Sebelumnya melempar ke dashboard lama, lalu tombol yang sama
              harus ditekan sekali lagi. */}
          <button onClick={buatProyek.mulai}
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

        {/* ── Panel lapangan: approval material, progres, stok menipis ── */}
        <HomePanelLapangan
          role={role}
          proyek={proyekProgres}
          rencanaMaterial={rencanaMaterial}
          approverNama={profile?.full_name || 'Manajemen'}
          onBukaProyek={id => { loadProject(id); navigate('/cost-control?tab=overview') }}
          onBukaMaterial={sub => navigate(`/kontraktor/material?sub=${sub}`)}
          onBukaProcurement={() => navigate('/kontraktor/procurement?sub=po')}
        />

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
                <button onClick={buatProyek.mulai}
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

      {/* Dialog buat proyek — dibuka langsung dari Home, tanpa singgah ke
          Dashboard Kontraktor AI. Setelah tersimpan, langsung dibawa ke RAB
          proyek barunya: itu langkah berikutnya yang sebenarnya. */}
      {buatProyek.terbuka && (
        <CreateProjectModal
          onClose={buatProyek.tutup}
          onCreated={() => { buatProyek.tutup(); navigate('/cost-control?tab=rab') }}
        />
      )}
    </div>
  )
}
