// ============================================================
// MATERIAL LAPANGAN — sisi admin/manajemen:
//  • Penggunaan  : material yang terpakai di lapangan
//  • Request     : permintaan material + persetujuan
//  • Kekurangan  : rencana (Material Schedule) vs terpakai → cepat terlihat
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, PackageOpen, ShoppingCart, AlertTriangle, RefreshCw, Loader2,
  Download, Check, X, Truck, PackageCheck, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import PhotoLightbox from '@/components/PhotoLightbox'
import { useCostStore } from '@/store/costStore'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/use-toast'
import {
  materialApi, ringkasKekurangan, URGENSI_LABEL, URGENSI_TONE, STATUS_TONE,
  type MaterialUsage, type MaterialRequest, type StatusRequest,
} from '@/lib/materialApi'
import { buildReportSheet, reportXlsx } from '@/utils/excel'
import { getBrandingCache, kopLaporan } from '@/lib/branding'

type Sub = 'pakai' | 'request' | 'kurang'

const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

export default function MaterialLapanganPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const { materialSchedule, projectInfo, loadProjects } = useCostStore()
  const { profile } = useAuthStore()

  const [sub, setSub] = useState<Sub>(() => (params.get('sub') === 'request' ? 'request' : 'pakai'))
  const [usage, setUsage] = useState<MaterialUsage[]>([])
  const [requests, setRequests] = useState<MaterialRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  function muat() {
    setLoading(true); setError('')
    Promise.all([materialApi().listUsage(), materialApi().listRequests()])
      .then(([u, r]) => { setUsage(u); setRequests(r) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadProjects(); muat() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const kekurangan = useMemo(
    () => ringkasKekurangan(materialSchedule, usage, requests),
    [materialSchedule, usage, requests],
  )
  const perluPerhatian = kekurangan.filter(k => k.perluPerhatian).length
  const menunggu = requests.filter(r => r.status === 'menunggu').length

  async function ubahStatus(r: MaterialRequest, status: StatusRequest) {
    const catatan = status === 'ditolak'
      ? (window.prompt('Alasan penolakan (opsional):') ?? '')
      : ''
    try {
      await materialApi().setRequestStatus(r.id, status, profile?.full_name ?? 'Admin', catatan)
      setRequests(prev => prev.map(x => x.id === r.id
        ? { ...x, status, approver: profile?.full_name ?? 'Admin', catatan_approval: catatan }
        : x))
      toast({ title: `Permintaan ditandai "${status}"` })
    } catch (e) {
      toast({ title: 'Gagal memperbarui', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function hapus(jenis: 'pakai' | 'request', id: string) {
    if (!window.confirm('Hapus data ini?')) return
    try {
      if (jenis === 'pakai') { await materialApi().deleteUsage(id); setUsage(p => p.filter(x => x.id !== id)) }
      else { await materialApi().deleteRequest(id); setRequests(p => p.filter(x => x.id !== id)) }
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  function exportExcel() {
    const wb = reportXlsx.utils.book_new()
    const kop = kopLaporan(getBrandingCache(), useAuthStore.getState().getPlanFor('kontraktor'))
    const printed = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    const subtitle = `Proyek: ${projectInfo?.projectName ?? 'Semua'} · Dicetak: ${printed}`

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      ...kop,
      title: 'RINGKASAN KEKURANGAN MATERIAL',
      subtitle,
      headers: ['No', 'Material', 'Satuan', 'Rencana', 'Terpakai', 'Sisa Rencana', 'Diterima', 'Dalam Proses', 'Status'],
      rows: kekurangan.map((k, i) => [
        i + 1, k.nama, k.satuan, k.rencana, k.terpakai, k.sisaRencana, k.diterima, k.dalamProses,
        k.diluarRencana ? 'Di luar rencana' : k.perluPerhatian ? 'Perlu perhatian' : 'Aman',
      ]),
      sumCols: [],
    }), 'Kekurangan')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      ...kop,
      title: 'PENGGUNAAN MATERIAL LAPANGAN',
      subtitle,
      headers: ['No', 'Tanggal', 'Material', 'Jumlah', 'Satuan', 'Lokasi', 'Pelapor', 'Catatan'],
      rows: usage.map((u, i) => [i + 1, u.tanggal, u.nama, u.qty, u.satuan, u.lokasi, u.pelapor, u.catatan]),
      sumCols: [],
    }), 'Penggunaan')

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      ...kop,
      title: 'PERMINTAAN MATERIAL',
      subtitle,
      headers: ['No', 'Tanggal', 'Material', 'Jumlah', 'Satuan', 'Urgensi', 'Butuh Tgl', 'Pemohon', 'Status', 'Disetujui Oleh'],
      rows: requests.map((r, i) => [
        i + 1, r.tanggal, r.nama, r.qty, r.satuan, URGENSI_LABEL[r.urgensi],
        r.butuh_tanggal ?? '-', r.pemohon, r.status, r.approver || '-',
      ]),
      sumCols: [],
    }), 'Permintaan')

    const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '')
    reportXlsx.writeFile(wb, `Material_Lapangan_${dateStr}.xlsx`)
    toast({ title: '✅ Laporan material diunduh!', description: '3 sheet: Kekurangan, Penggunaan, Permintaan.' })
  }

  const SUBS: Array<[Sub, string, JSX.Element, number]> = [
    ['pakai', 'Penggunaan', <PackageOpen key="i" className="w-4 h-4" />, usage.length],
    ['request', 'Request', <ShoppingCart key="i" className="w-4 h-4" />, menunggu],
    ['kurang', 'Kekurangan', <AlertTriangle key="i" className="w-4 h-4" />, perluPerhatian],
  ]

  return (
    <div className="min-h-screen bg-slate-100/70 pb-10">
      <div className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <button onClick={() => navigate('/kontraktor')}
            className="flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-white mb-2">
            <ArrowLeft className="w-4 h-4" /> Home Kontraktor AI
          </button>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-serif text-xl md:text-2xl font-bold flex items-center gap-2">
                <PackageOpen className="w-6 h-6" /> Material Lapangan
              </h1>
              <p className="text-white/60 text-xs mt-1">
                Penggunaan, permintaan, dan kekurangan material dari lapangan
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={muat} variant="outline" size="sm"
                className="gap-1.5 bg-white/10 text-white border-white/20 hover:bg-white/20">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
              </Button>
              <Button onClick={exportExcel} variant="outline" size="sm"
                className="gap-1.5 font-bold bg-white text-navy hover:bg-white/90 border-0">
                <Download className="w-3.5 h-3.5" /> Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {/* Sub-tab */}
        <div className="flex gap-1.5 flex-wrap">
          {SUBS.map(([key, label, icon, badge]) => (
            <button key={key} onClick={() => setSub(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
                sub === key ? 'bg-navy text-white shadow' : 'bg-white text-muted-foreground hover:bg-slate-50 border border-border'}`}>
              {icon} {label}
              {badge > 0 && (
                <span className={`text-[10px] px-1.5 rounded-full ${
                  sub === key ? 'bg-white/20' : key === 'pakai' ? 'bg-slate-200 text-slate-600' : 'bg-red-500 text-white'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
            {error} — pastikan migrasi <code>migration_material.sql</code> sudah dijalankan di Supabase.
          </p>
        )}

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* ── Penggunaan ────────────────────────────────────────────── */}
            {sub === 'pakai' && (
              usage.length === 0 ? (
                <Kosong ikon={<PackageOpen className="w-10 h-10" />}
                  teks="Belum ada pemakaian material dicatat. Minta pekerja mengisi lewat Link Pekerja → tab 'Pakai Material'." />
              ) : (
                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[700px]">
                      <thead className="bg-slate-50 text-muted-foreground">
                        <tr>
                          <th className="text-left font-bold px-4 py-2.5">Tanggal</th>
                          <th className="text-left font-bold px-3 py-2.5">Material</th>
                          <th className="text-right font-bold px-3 py-2.5">Jumlah</th>
                          <th className="text-left font-bold px-3 py-2.5">Lokasi</th>
                          <th className="text-left font-bold px-3 py-2.5">Pelapor</th>
                          <th className="text-left font-bold px-3 py-2.5">Foto</th>
                          <th className="px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {usage.map(u => (
                          <tr key={u.id} className="border-t border-border align-top">
                            <td className="px-4 py-2.5 whitespace-nowrap">{u.tanggal}</td>
                            <td className="px-3 py-2.5 font-semibold text-navy">
                              {u.nama}
                              {u.catatan && <p className="text-[10px] text-muted-foreground font-normal">{u.catatan}</p>}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{num(u.qty)} {u.satuan}</td>
                            <td className="px-3 py-2.5">{u.lokasi || '-'}</td>
                            <td className="px-3 py-2.5">{u.pelapor}</td>
                            <td className="px-3 py-2.5">
                              {u.photos?.length ? (
                                <button onClick={() => setLightbox({ photos: u.photos, index: 0 })}>
                                  <img src={u.photos[0]} alt="" className="w-10 h-10 object-cover rounded-lg border border-border" />
                                </button>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => hapus('pakai', u.id)} className="text-muted-foreground hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* ── Request ───────────────────────────────────────────────── */}
            {sub === 'request' && (
              requests.length === 0 ? (
                <Kosong ikon={<ShoppingCart className="w-10 h-10" />}
                  teks="Belum ada permintaan material dari lapangan." />
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  {requests.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-navy text-sm truncate">{r.nama}</p>
                          <p className="text-xs text-muted-foreground">
                            {num(r.qty)} {r.satuan} · diminta {r.pemohon}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${URGENSI_TONE[r.urgensi]}`}>
                            {URGENSI_LABEL[r.urgensi]}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_TONE[r.status]}`}>
                            {r.status}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        <p>📅 Diajukan {r.tanggal}{r.butuh_tanggal ? ` · dibutuhkan sebelum ${r.butuh_tanggal}` : ''}</p>
                        {r.project_name && <p>🏗️ {r.project_name}</p>}
                        {r.catatan && <p className="italic">"{r.catatan}"</p>}
                        {r.approver && <p>✍️ {r.status} oleh {r.approver}{r.catatan_approval ? ` — ${r.catatan_approval}` : ''}</p>}
                      </div>

                      {r.photos?.length > 0 && (
                        <div className="flex gap-1.5">
                          {r.photos.map((p, j) => (
                            <button key={j} onClick={() => setLightbox({ photos: r.photos, index: j })}>
                              <img src={p} alt="" className="w-12 h-12 object-cover rounded-lg border border-border" />
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1.5 flex-wrap pt-1 border-t border-border">
                        {r.status === 'menunggu' && (
                          <>
                            <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => ubahStatus(r, 'disetujui')}>
                              <Check className="w-3 h-3" /> Setujui
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                              onClick={() => ubahStatus(r, 'ditolak')}>
                              <X className="w-3 h-3" /> Tolak
                            </Button>
                          </>
                        )}
                        {r.status === 'disetujui' && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                            onClick={() => ubahStatus(r, 'dibeli')}>
                            <Truck className="w-3 h-3" /> Tandai Dibeli
                          </Button>
                        )}
                        {r.status === 'dibeli' && (
                          <Button size="sm" className="h-7 text-[11px] gap-1 bg-navy hover:bg-navy/90"
                            onClick={() => ubahStatus(r, 'diterima')}>
                            <PackageCheck className="w-3 h-3" /> Sudah Diterima
                          </Button>
                        )}
                        <button onClick={() => hapus('request', r.id)}
                          className="ml-auto text-muted-foreground hover:text-red-600 self-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Kekurangan ────────────────────────────────────────────── */}
            {sub === 'kurang' && (
              kekurangan.length === 0 ? (
                <Kosong ikon={<AlertTriangle className="w-10 h-10" />}
                  teks="Belum ada data. Isi Material Schedule pada proyek dan catat pemakaian di lapangan." />
              ) : (
                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="p-4 pb-3">
                    <h2 className="font-bold text-navy text-sm">Rencana vs Pemakaian Lapangan</h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Baris merah = pemakaian melebihi rencana atau sisa tinggal &lt; 10%.
                      {!projectInfo && ' Buka salah satu proyek agar kolom Rencana terisi dari Material Schedule.'}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[720px]">
                      <thead className="bg-slate-50 text-muted-foreground">
                        <tr>
                          <th className="text-left font-bold px-4 py-2.5">Material</th>
                          <th className="text-right font-bold px-3 py-2.5">Rencana</th>
                          <th className="text-right font-bold px-3 py-2.5">Terpakai</th>
                          <th className="text-right font-bold px-3 py-2.5">Sisa Rencana</th>
                          <th className="text-right font-bold px-3 py-2.5">Diterima</th>
                          <th className="text-right font-bold px-3 py-2.5">Dalam Proses</th>
                          <th className="text-left font-bold px-4 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kekurangan.map(k => (
                          <tr key={k.nama} className={`border-t border-border ${k.perluPerhatian ? 'bg-red-50/60' : ''}`}>
                            <td className="px-4 py-2.5 font-semibold text-navy">{k.nama}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{k.rencana ? `${num(k.rencana)} ${k.satuan}` : '—'}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{num(k.terpakai)} {k.satuan}</td>
                            <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${
                              k.rencana && k.sisaRencana < 0 ? 'text-red-600' : 'text-navy'}`}>
                              {k.rencana ? num(k.sisaRencana) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{k.diterima ? num(k.diterima) : '—'}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{k.dalamProses ? num(k.dalamProses) : '—'}</td>
                            <td className="px-4 py-2.5">
                              {k.diluarRencana ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Di luar rencana</span>
                              ) : k.perluPerhatian ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Perlu perhatian</span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aman</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={i => setLightbox(lb => lb && { ...lb, index: i })} />
      )}
    </div>
  )
}

function Kosong({ ikon, teks }: { ikon: JSX.Element; teks: string }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-12 text-center">
      <div className="opacity-30 flex justify-center mb-3">{ikon}</div>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{teks}</p>
    </div>
  )
}
