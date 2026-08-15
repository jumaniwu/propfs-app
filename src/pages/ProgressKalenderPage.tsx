// Halaman PUBLIK read-only (tanpa login): owner melihat KALENDER progress
// lapangan — tiap tanggal menampilkan kegiatan & foto laporan pekerja.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { KopPublik, KakiPublik, useBrandingPublik } from '@/components/KopPublik'
import { Loader2, ChevronLeft, ChevronRight, CalendarDays, ImageIcon } from 'lucide-react'
import { fieldApi, type FieldReport } from '@/lib/fieldReports'
import ChipAbsensi from '@/components/cost/ChipAbsensi'
import { rekapAbsensi, totalRekap, bulat } from '@/lib/absensiPekerja'
import PhotoLightbox from '@/components/PhotoLightbox'

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export default function ProgressKalenderPage() {
  const { token = '' } = useParams()
  const merek = useBrandingPublik(token)
  const [data, setData] = useState<{ project_name: string; reports: FieldReport[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selected, setSelected] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  useEffect(() => {
    fieldApi().getOwnerView(token)
      .then(d => {
        setData(d)
        if (!d) setError('Link progres tidak ditemukan. Periksa kembali link Anda.')
        else if (d.reports[0]?.tanggal) {
          const t = new Date(d.reports[0].tanggal)
          setCursor({ y: t.getFullYear(), m: t.getMonth() })
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [token])

  // kelompokkan laporan per tanggal (YYYY-MM-DD)
  const byDate = useMemo(() => {
    const map = new Map<string, FieldReport[]>()
    for (const r of data?.reports ?? []) {
      const key = (r.tanggal || '').slice(0, 10)
      const arr = map.get(key) ?? []
      arr.push(r); map.set(key, arr)
    }
    return map
  }, [data])

  const firstDay = new Date(cursor.y, cursor.m, 1).getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const dateKey = (day: number) => `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const selectedReports = selected ? (byDate.get(selected) ?? []) : []

  const shift = (delta: number) => setCursor(c => {
    const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }
  })

  // Rekap kehadiran untuk BULAN YANG SEDANG DILIHAT, bukan seluruh riwayat:
  // angkanya harus berpindah bersama panah bulan, kalau tidak ia menjawab
  // pertanyaan yang tidak sedang ditanyakan.
  const awalanBulan = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`
  const rekapBulan = useMemo(
    () => rekapAbsensi((data?.reports ?? []).filter(r => (r.tanggal || '').startsWith(awalanBulan))),
    [data, awalanBulan],
  )
  const totalBulan = useMemo(() => totalRekap(rekapBulan), [rekapBulan])

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <KopPublik profil={merek} subjudul="Kalender Progres Lapangan" />

        {loading && (
          <div className="bg-white rounded-2xl p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
          </div>
        )}
        {!loading && !data && (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-red-600">{error || 'Tidak ditemukan.'}</div>
        )}

        {data && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="bg-navy text-white px-5 py-4 flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                <div>
                  <p className="font-bold text-sm">{data.project_name || 'Proyek'}</p>
                  <p className="text-white/70 text-[11px]">{data.reports.length} laporan lapangan tercatat</p>
                </div>
              </div>

              {/* Navigasi bulan */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
                <p className="font-bold text-navy text-sm">{BULAN[cursor.m]} {cursor.y}</p>
                <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
              </div>

              {/* Grid kalender */}
              <div className="p-3">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {HARI.map(h => <div key={h} className="text-center text-[10px] font-bold text-muted-foreground py-1">{h}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} />
                    const key = dateKey(day)
                    const reps = byDate.get(key) ?? []
                    const has = reps.length > 0
                    const isSel = selected === key
                    return (
                      <button key={i} onClick={() => has && setSelected(isSel ? null : key)}
                        className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center relative transition-colors ${
                          isSel ? 'bg-navy text-white'
                            : has ? 'bg-emerald-50 text-navy hover:bg-emerald-100 font-bold'
                              : 'text-muted-foreground'}`}>
                        {day}
                        {has && <span className={`mt-0.5 text-[8px] font-bold px-1 rounded-full ${isSel ? 'bg-white/20' : 'bg-emerald-500 text-white'}`}>{reps.length}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Rekap kehadiran bulan yang sedang dilihat */}
            {rekapBulan.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-border p-4 space-y-3">
                {/* Bertumpuk di layar sempit: berdampingan, judul dan
                    ringkasannya sama-sama patah di tengah kata. */}
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2">
                  <p className="font-bold text-navy text-sm">Kehadiran {BULAN[cursor.m]} {cursor.y}</p>
                  <p className="text-[10px] text-muted-foreground shrink-0">
                    {totalBulan.pekerja} pekerja · {bulat(totalBulan.hok)} HOK
                    {totalBulan.jamLembur > 0 && ` · ${bulat(totalBulan.jamLembur)} jam lembur`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {rekapBulan.map(r => (
                    <div key={r.kunci} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-navy truncate">{r.nama}</p>
                        {r.peran && <p className="text-[10px] text-muted-foreground truncate">{r.peran}</p>}
                      </div>
                      {/* Batang sepanjang HOK terbanyak — siapa yang paling
                          banyak di lapangan terbaca tanpa membandingkan angka. */}
                      <div className="w-24 sm:w-40 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                        <div className="h-full bg-navy rounded-full"
                          style={{ width: `${Math.min(100, (r.hok / Math.max(1, rekapBulan[0].hok)) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-black text-navy tabular-nums w-10 text-right shrink-0">
                        {bulat(r.hok)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  HOK = hari orang kerja. Hadir sehari penuh 1, setengah hari 0,5.
                </p>
              </div>
            )}

            {/* Detail hari terpilih */}
            {selected && (
              <div className="bg-white rounded-2xl shadow-sm border border-border p-4 space-y-3">
                <p className="font-bold text-navy text-sm">
                  Kegiatan {new Date(selected).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {selectedReports.map(r => (
                  <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-navy">👷 {r.pelapor}</p>
                      <p className="text-[10px] text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                    </div>
                    <ChipAbsensi absensi={r.absensi} />
                    <ul className="text-xs text-slate-700 space-y-0.5 list-disc pl-4">
                      {r.kegiatan.map((k, j) => <li key={j}>{k}</li>)}
                    </ul>
                    {r.catatan && <p className="text-[11px] text-muted-foreground italic">Catatan: {r.catatan}</p>}
                    {r.photos.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {r.photos.map((p, j) => (
                          <button key={j} type="button" onClick={() => setLightbox({ photos: r.photos, index: j })}
                            className="block">
                            <img src={p} alt="" className="w-full h-16 object-cover rounded-lg border border-border" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!selected && data.reports.length > 0 && (
              <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Ketuk tanggal berwarna hijau untuk melihat kegiatan & foto.
              </p>
            )}
          </>
        )}
        <KakiPublik profil={merek} />
      </div>

      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={i => setLightbox(lb => lb && { ...lb, index: i })} />
      )}
    </div>
  )
}
