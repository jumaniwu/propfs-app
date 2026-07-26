// ============================================================
// LAPORAN KONSOLIDASI — perbandingan seluruh proyek dalam satu tabel:
// nilai RAB, pemasukan, pengeluaran, laba, progress, dan deviasi.
// ============================================================
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { ArrowLeft, Download, BarChart3, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import { useCostStore } from '@/store/costStore'
import { useAkuntanStore } from '@/store/akuntanStore'
import { useToast } from '@/hooks/use-toast'
import { ringkasPerProyek, totalKonsolidasi, PROYEK_UMUM } from '@/lib/akuntan'
import { buildReportSheet, reportXlsx } from '@/utils/excel'
import { getBrandingCache, kopLaporan } from '@/lib/branding'
import { useAuthStore } from '@/store/authStore'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const fmtJt = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} M`
  return `${(n / 1_000_000).toFixed(1)} Jt`
}

export default function KonsolidasiPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { savedProjects, loadProjects, getAllRealisasi, getProjectSummaries } = useCostStore()
  const { pemasukanEntries } = useAkuntanStore()

  useEffect(() => {
    loadProjects()
    void useAkuntanStore.getState().loadFromCloud()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const baris = useMemo(
    () => ringkasPerProyek(getProjectSummaries(), pemasukanEntries, getAllRealisasi()),
    [savedProjects, pemasukanEntries], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const total = useMemo(() => totalKonsolidasi(baris), [baris])

  const dataGrafik = baris.map(b => ({
    nama: b.namaProyek.length > 16 ? b.namaProyek.slice(0, 15) + '…' : b.namaProyek,
    Pemasukan: Math.round(b.pemasukan / 1_000_000),
    Pengeluaran: Math.round(b.pengeluaran / 1_000_000),
  }))

  function exportExcel() {
    const wb = reportXlsx.utils.book_new()
    const kop = kopLaporan(getBrandingCache(), useAuthStore.getState().getPlanFor('kontraktor'))
    const printed = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    const subtitle = `Seluruh proyek · Dicetak: ${printed}`

    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      ...kop,
      title: 'LAPORAN KONSOLIDASI SELURUH PROYEK',
      subtitle,
      headers: ['No', 'Proyek', 'Nilai RAB (Rp)', 'Pemasukan (Rp)', 'Pengeluaran (Rp)', 'Laba (Rp)', 'Progress (%)', 'Terpakai (%)', 'Deviasi (%)'],
      rows: baris.map((b, i) => [
        i + 1, b.namaProyek, Math.round(b.rab), Math.round(b.pemasukan), Math.round(b.pengeluaran),
        Math.round(b.laba), Number(b.progressPct.toFixed(1)), Number(b.terpakaiPct.toFixed(1)),
        Number(b.deviasiPct.toFixed(1)),
      ]),
      sumCols: [2, 3, 4, 5],
    }), 'Ringkasan')

    // satu sheet rincian pengeluaran per proyek
    const semua = getAllRealisasi()
    for (const b of baris) {
      if (b.projectId === PROYEK_UMUM) continue
      const rows = semua.filter(e => e.projectId === b.projectId)
      const nama = b.namaProyek.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 28) || 'Proyek'
      reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      ...kop,
        title: `RINCIAN PENGELUARAN — ${b.namaProyek.toUpperCase()}`,
        subtitle,
        headers: ['No', 'Tanggal', 'Tipe', 'Keterangan', 'Kategori', 'Jumlah (Rp)'],
        rows: rows.map((e, i) => [i + 1, e.tanggal, e.tipe, e.keterangan, e.kategori, Math.round(e.jumlah)]),
        sumCols: [5],
      }), nama)
    }

    const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '')
    reportXlsx.writeFile(wb, `Laporan_Konsolidasi_${dateStr}.xlsx`)
    toast({ title: '✅ Laporan konsolidasi diunduh!', description: `1 sheet ringkasan + ${baris.length} sheet rincian proyek.` })
  }

  return (
    <div className="min-h-screen bg-slate-100/70 pb-10">
      {/* Header */}
      <KontraktorHeader
        judul="Laporan Konsolidasi"
        subjudul={`Gabungan ${baris.length} lingkup · seluruh proyek dalam satu laporan`}
        kembaliKe="/kontraktor"
        aksi={
          <Button onClick={exportExcel} variant="outline"
            className="gap-2 font-bold bg-white text-navy hover:bg-white/90 border-0 w-full sm:w-auto">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
        }
      />

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {baris.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <BarChart3 className="w-10 h-10 mx-auto opacity-30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Belum ada proyek. Buat proyek terlebih dahulu untuk melihat laporan konsolidasi.
            </p>
          </div>
        ) : (
          <>
            {/* Kartu total */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Nilai RAB', nilai: total.rab, ikon: Wallet, tone: 'bg-navy/10 text-navy' },
                { label: 'Total Pemasukan', nilai: total.pemasukan, ikon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
                { label: 'Total Pengeluaran', nilai: total.pengeluaran, ikon: TrendingDown, tone: 'bg-rose-50 text-rose-600' },
                { label: 'Laba Konsolidasi', nilai: total.laba, ikon: BarChart3, tone: 'bg-gold-lt text-[#8A6D1F]' },
              ].map(k => {
                const Ikon = k.ikon
                return (
                  <div key={k.label} className="bg-white rounded-2xl border border-border p-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${k.tone}`}>
                      <Ikon className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-semibold">{k.label}</p>
                    <p className={`font-bold text-lg tabular-nums ${k.nilai < 0 ? 'text-red-600' : 'text-navy'}`}>
                      Rp {fmtJt(k.nilai)}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Grafik */}
            <div className="bg-white rounded-2xl border border-border p-4">
              <h2 className="font-bold text-navy text-sm mb-3">Pemasukan vs Pengeluaran per Proyek (Juta Rp)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataGrafik} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="nama" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => `Rp ${v.toLocaleString('id-ID')} Jt`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Pemasukan" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Pengeluaran" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabel perbandingan */}
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <h2 className="font-bold text-navy text-sm p-4 pb-3">Perbandingan Antar Proyek</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[760px]">
                  <thead className="bg-slate-50 text-muted-foreground">
                    <tr>
                      <th className="text-left font-bold px-4 py-2.5">Proyek</th>
                      <th className="text-right font-bold px-3 py-2.5">Nilai RAB</th>
                      <th className="text-right font-bold px-3 py-2.5">Pemasukan</th>
                      <th className="text-right font-bold px-3 py-2.5">Pengeluaran</th>
                      <th className="text-right font-bold px-3 py-2.5">Laba</th>
                      <th className="text-right font-bold px-3 py-2.5">Progress</th>
                      <th className="text-right font-bold px-4 py-2.5">Deviasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baris.map(b => (
                      <tr key={b.projectId} className="border-t border-border">
                        <td className="px-4 py-2.5 font-semibold text-navy">{b.namaProyek}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmt(b.rab)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{fmt(b.pemasukan)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">{fmt(b.pengeluaran)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${b.laba < 0 ? 'text-red-600' : 'text-navy'}`}>
                          {fmt(b.laba)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.progressPct.toFixed(1)}%</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${b.deviasiPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {b.deviasiPct >= 0 ? '+' : ''}{b.deviasiPct.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-navy/20 bg-slate-50 font-bold text-navy">
                      <td className="px-4 py-3">TOTAL</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(total.rab)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(total.pemasukan)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(total.pengeluaran)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${total.laba < 0 ? 'text-red-600' : ''}`}>{fmt(total.laba)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">—</td>
                      <td className="px-4 py-3 text-right tabular-nums">{total.terpakaiPct.toFixed(1)}% terpakai</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground px-4 py-3 border-t border-border">
                <b>Deviasi</b> = progress fisik − persentase RAB yang terpakai. Nilai negatif berarti biaya
                berjalan lebih cepat daripada progres pekerjaan.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
