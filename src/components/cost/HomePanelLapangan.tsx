// ============================================================
// PANEL DASHBOARD HOME KONTRAKTOR AI
//  1. Request material yang menunggu persetujuan (owner/manajemen/PM)
//  2. Grafik progres pekerjaan — mana yang telat, mana yang on track
//  3. Stok material menipis — peringatan dini untuk manajer & pengawas
// Data material ditarik berkala (polling) agar terasa realtime tanpa
// bergantung pada koneksi websocket yang sering putus di jaringan lapangan.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import {
  ShoppingCart, RefreshCw, Check, X, ChevronRight, AlertTriangle,
  TrendingUp, PackageOpen, Clock, FileText,
} from 'lucide-react'
import {
  materialApi, URGENSI_LABEL, URGENSI_TONE,
  type MaterialRequest, type MaterialUsage,
} from '@/lib/materialApi'
import {
  ringkasProgres, stokMenipis, LABEL_STATUS,
  type ProyekUntukProgres, type StatusProgres,
} from '@/lib/dashboardLapangan'
import { can, type TeamRole } from '@/lib/teamRoles'
import { belumTerpesan } from '@/lib/procurement'
import type { MaterialScheduleItem } from '@/types/cost.types'
import { useToast } from '@/hooks/use-toast'

/** Role yang perlu melihat peringatan stok (manajer lapangan & gudang). */
const ROLE_LIHAT_STOK: TeamRole[] = ['pemilik', 'manajemen', 'pm', 'pengawas', 'logistik']

/** Selang muat ulang data material, ms. */
const SELANG_MUAT = 45_000

const WARNA_STATUS: Record<StatusProgres, string> = {
  telat: '#f43f5e',
  on_track: '#10b981',
  lebih_cepat: '#0D1B2A',
  belum_mulai: '#cbd5e1',
}
const CHIP_STATUS: Record<StatusProgres, string> = {
  telat: 'bg-rose-100 text-rose-700',
  on_track: 'bg-emerald-100 text-emerald-700',
  lebih_cepat: 'bg-navy/10 text-navy',
  belum_mulai: 'bg-slate-100 text-slate-500',
}

const angka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

/** "2026-07-24" / ISO → "24 Jul". */
function tglSingkat(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

interface Props {
  role: TeamRole
  /** Proyek tersimpan, sudah dihitung progres fisiknya. */
  proyek: ProyekUntukProgres[]
  /** Gabungan Material Schedule seluruh proyek — dasar perhitungan sisa stok. */
  rencanaMaterial: MaterialScheduleItem[]
  /** Nama pengguna yang menyetujui, dicatat di kolom approver. */
  approverNama: string
  onBukaProyek: (projectId: string) => void
  onBukaMaterial: (sub: 'pakai' | 'request' | 'kurang') => void
  onBukaProcurement: () => void
}

export default function HomePanelLapangan({
  role, proyek, rencanaMaterial, approverNama,
  onBukaProyek, onBukaMaterial, onBukaProcurement,
}: Props) {
  const { toast } = useToast()
  const [requests, setRequests] = useState<MaterialRequest[]>([])
  const [pemakaian, setPemakaian] = useState<MaterialUsage[]>([])
  const [memuat, setMemuat] = useState(true)
  const [gagal, setGagal] = useState('')
  const [proses, setProses] = useState<string | null>(null)

  const bolehApprove = can(role, 'material', 'approve')
  const lihatStok = ROLE_LIHAT_STOK.includes(role)
  const lihatMaterial = can(role, 'material', 'baca')

  const muat = useCallback(async (diam = false) => {
    if (!lihatMaterial) { setMemuat(false); return }
    if (!diam) setMemuat(true)
    try {
      const api = materialApi()
      const [r, u] = await Promise.all([api.listRequests(), api.listUsage()])
      setRequests(r); setPemakaian(u); setGagal('')
    } catch (e) {
      // panel tambahan — kegagalan tidak boleh merusak Home, cukup diberi tahu
      setGagal(e instanceof Error ? e.message : 'Gagal memuat data material.')
    } finally { setMemuat(false) }
  }, [lihatMaterial])

  useEffect(() => {
    muat()
    const timer = setInterval(() => { if (!document.hidden) muat(true) }, SELANG_MUAT)
    const onFokus = () => { if (!document.hidden) muat(true) }
    document.addEventListener('visibilitychange', onFokus)
    window.addEventListener('focus', onFokus)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFokus)
      window.removeEventListener('focus', onFokus)
    }
  }, [muat])

  const menunggu = useMemo(
    () => requests.filter(r => r.status === 'menunggu')
      .sort((a, b) => (b.created_at ?? b.tanggal).localeCompare(a.created_at ?? a.tanggal)),
    [requests],
  )

  // Request yang sudah disetujui tapi belum penuh terpesan — langkah
  // berikutnya bagi pemakai adalah membuat PO.
  const siapDipesan = useMemo(() => belumTerpesan(requests).length, [requests])

  const progres = useMemo(() => ringkasProgres(proyek), [proyek])
  const dataGrafik = useMemo(() => progres.map(p => ({
    nama: p.nama.length > 14 ? `${p.nama.slice(0, 13)}…` : p.nama,
    Realisasi: Number(p.progressPct.toFixed(1)),
    Rencana: Number(p.rencanaPct.toFixed(1)),
    status: p.status,
  })), [progres])
  const jmlTelat = progres.filter(p => p.status === 'telat').length

  const stok = useMemo(
    () => stokMenipis(rencanaMaterial, pemakaian, requests),
    [rencanaMaterial, pemakaian, requests],
  )

  async function ubahStatus(r: MaterialRequest, status: 'disetujui' | 'ditolak') {
    setProses(r.id)
    try {
      await materialApi().setRequestStatus(r.id, status, approverNama, '')
      // perbarui lokal dulu agar terasa cepat, lalu sinkron ulang
      setRequests(list => list.map(x => (x.id === r.id ? { ...x, status } : x)))
      toast({
        title: status === 'disetujui' ? 'Permintaan disetujui' : 'Permintaan ditolak',
        description: `${r.nama} — ${angka(r.qty)} ${r.satuan}`,
      })
      muat(true)
    } catch (e) {
      toast({
        title: 'Gagal memperbarui',
        description: e instanceof Error ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally { setProses(null) }
  }

  return (
    <>
      {/* ── 1. Request material menunggu persetujuan ───────────────────── */}
      {bolehApprove && (
        <div className="rounded-2xl bg-white border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-navy text-sm flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </span>
              Menunggu Persetujuan
              {menunggu.length > 0 && (
                <span className="text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                  {menunggu.length}
                </span>
              )}
            </h2>
            <button onClick={() => muat()} aria-label="Muat ulang permintaan"
              className="text-muted-foreground hover:text-navy p-1">
              <RefreshCw className={`w-4 h-4 ${memuat ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {gagal ? (
            <p className="text-[11px] text-rose-600 py-4 text-center">{gagal}</p>
          ) : memuat && requests.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Memuat permintaan…</p>
          ) : menunggu.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              Tidak ada permintaan material yang menunggu. Semua sudah ditindaklanjuti.
            </p>
          ) : (
            <div className="space-y-2.5">
              {menunggu.slice(0, 4).map(r => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-navy truncate">{r.nama}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {angka(r.qty)} {r.satuan} · {r.pemohon || 'Pekerja'}
                        {r.project_name ? ` · ${r.project_name}` : ''}
                      </p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${URGENSI_TONE[r.urgensi]}`}>
                      {URGENSI_LABEL[r.urgensi]}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {tglSingkat(r.tanggal)}
                    {r.butuh_tanggal && <span>· dibutuhkan {tglSingkat(r.butuh_tanggal)}</span>}
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <button disabled={proses === r.id} onClick={() => ubahStatus(r, 'disetujui')}
                      className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-emerald-700">
                      <Check className="w-3.5 h-3.5" /> Setujui
                    </button>
                    <button disabled={proses === r.id} onClick={() => ubahStatus(r, 'ditolak')}
                      className="flex-1 h-9 rounded-xl border border-border text-navy text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-slate-50">
                      <X className="w-3.5 h-3.5" /> Tolak
                    </button>
                  </div>
                </div>
              ))}

              <button onClick={() => onBukaMaterial('request')}
                className="w-full text-[11px] font-bold text-muted-foreground hover:text-navy flex items-center justify-center gap-0.5 pt-1">
                Lihat semua permintaan <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Setelah disetujui, langkah berikutnya adalah memesan ke vendor —
              jadi pintasannya ditaruh di sini, bukan disembunyikan di menu. */}
          {siapDipesan > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <button onClick={onBukaProcurement}
                className="w-full h-10 rounded-xl bg-navy text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-navy/90">
                <FileText className="w-3.5 h-3.5" />
                Buat PO — {siapDipesan} request siap dipesan
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Grafik progres pekerjaan ─────────────────────────────────── */}
      {proyek.length > 0 && (
        <div className="rounded-2xl bg-white border border-border p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-navy text-sm flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </span>
              Progres Pekerjaan
            </h2>
            {jmlTelat > 0 && (
              <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded-full">
                {jmlTelat} proyek telat
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Realisasi fisik dibanding rencana menurut jadwal hari ini.
          </p>

          <div className="h-52 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataGrafik} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nama" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Rencana" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Realisasi" radius={[4, 4, 0, 0]}>
                  {dataGrafik.map(d => (
                    <Cell key={d.nama} fill={WARNA_STATUS[d.status as StatusProgres]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 space-y-2">
            {progres.map(p => (
              <button key={p.projectId} onClick={() => onBukaProyek(p.projectId)}
                className="w-full flex items-center gap-2 text-left hover:bg-slate-50 rounded-lg p-1.5 -m-0.5 transition-colors">
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: WARNA_STATUS[p.status] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-navy truncate">{p.nama}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.progressPct.toFixed(1)}% dari rencana {p.rencanaPct.toFixed(1)}%
                    {p.status !== 'belum_mulai' &&
                      ` · ${p.selisihPct >= 0 ? '+' : ''}${p.selisihPct.toFixed(1)}%`}
                  </p>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${CHIP_STATUS[p.status]}`}>
                  {LABEL_STATUS[p.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Stok material menipis ────────────────────────────────────── */}
      {lihatStok && lihatMaterial && (
        <div className="rounded-2xl bg-white border border-border p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-navy text-sm flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <PackageOpen className="w-4 h-4" />
              </span>
              <span className="min-w-0">Stok Material Menipis</span>
              {stok.length > 0 && (
                <span className="shrink-0 text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                  {stok.length}
                </span>
              )}
            </h2>
            <button onClick={() => onBukaMaterial('kurang')}
              className="shrink-0 text-[11px] font-bold text-muted-foreground hover:text-navy flex items-center gap-0.5">
              Detail <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Sisa rencana tinggal 20% ke bawah — pesan lebih awal agar pekerjaan tidak berhenti.
          </p>

          {memuat && pemakaian.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Memuat stok…</p>
          ) : stok.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              Semua material masih aman terhadap rencana. Tidak ada yang perlu dipesan sekarang.
            </p>
          ) : (
            <div className="space-y-2">
              {stok.slice(0, 6).map(s => (
                <div key={s.nama}
                  className={`rounded-xl border p-3 ${s.habis ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-navy truncate flex items-center gap-1.5">
                        {s.habis && <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                        {s.nama}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Terpakai {angka(s.terpakai)} dari {angka(s.rencana)} {s.satuan}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${s.habis ? 'text-rose-600' : 'text-amber-700'}`}>
                        {angka(s.sisa)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">sisa {s.satuan}</p>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 rounded-full bg-white overflow-hidden">
                    <div className={`h-full rounded-full ${s.habis ? 'bg-rose-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, s.sisaPct))}%` }} />
                  </div>

                  <p className="mt-1.5 text-[10px] font-semibold">
                    {s.dalamProses > 0 ? (
                      <span className="text-emerald-700">
                        {angka(s.dalamProses)} {s.satuan} sudah diminta — dalam proses
                      </span>
                    ) : (
                      <span className={s.habis ? 'text-rose-700' : 'text-amber-700'}>
                        Belum ada permintaan pembelian
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
