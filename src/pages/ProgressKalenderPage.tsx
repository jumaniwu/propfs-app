// Halaman PUBLIK read-only (tanpa login): owner melihat KALENDER progress
// lapangan — tiap tanggal menampilkan kegiatan & foto laporan pekerja.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { KopPublik, KakiPublik, useBrandingPublik } from '@/components/KopPublik'
import { Loader2, ChevronLeft, ChevronRight, CalendarDays, ImageIcon } from 'lucide-react'
import { fieldApi, type FieldReport } from '@/lib/fieldReports'
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
  // Foto DIAMBIL SAAT HARINYA DIBUKA, bukan ikut di daftar.
  //
  // Foto disimpan sebagai data URL base64 di dalam baris laporannya. Satu buku
  // dengan 31 laporan berfoto menghasilkan payload 26 MB — melewati
  // statement_timeout sebelum sempat terkirim, jadi halaman ini dulu gagal
  // total dengan "canceling statement due to statement timeout". Padahal
  // fotonya hanya dipakai untuk satu hari yang diketuk; kalendernya sendiri
  // cuma butuh tanggal dan kegiatan.
  const [foto, setFoto] = useState<Map<string, string[]>>(new Map())
  const [fotoLoading, setFotoLoading] = useState(false)
  const [fotoGagal, setFotoGagal] = useState('')

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

  useEffect(() => {
    if (!selected) return
    let batal = false
    setFotoLoading(true); setFotoGagal('')
    fieldApi().getOwnerFoto(token, selected)
      .then(p => { if (!batal) setFoto(p) })
      // Kegagalan mengambil foto TIDAK menghapus kegiatannya dari layar:
      // catatan hari itu tetap terbaca, dan yang disebutkan hanya fotonya.
      .catch(e => { if (!batal) setFotoGagal(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!batal) setFotoLoading(false) })
    return () => { batal = true }
  }, [selected, token])

  const shift = (delta: number) => setCursor(c => {
    const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }
  })

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

            {/* Rekap kehadiran SENGAJA TIDAK ADA di sini.
                Halaman ini dibuka pemilik proyek. Nama tiap tukang, berapa
                hari ia masuk, dan berapa orang yang sebenarnya dikerahkan
                adalah data internal kita — semuanya menjadi bahan
                tawar-menawar begitu terbaca klien.

                Menghapusnya dari tampilan saja tidak cukup; batas yang
                sesungguhnya ditarik di migration_owner_tanpa_absensi.sql,
                yang membuang kolom `absensi` sebelum datanya meninggalkan
                database. Yang di sini hanya supaya layarnya ikut bersih. */}

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
                    <ul className="text-xs text-slate-700 space-y-0.5 list-disc pl-4">
                      {r.kegiatan.map((k, j) => <li key={j}>{k}</li>)}
                    </ul>
                    {r.catatan && <p className="text-[11px] text-muted-foreground italic">Catatan: {r.catatan}</p>}
                    {(() => {
                      const fotoHari = foto.get(r.id) ?? r.photos
                      const jumlah = r.foto_jumlah ?? r.photos.length
                      if (fotoHari.length > 0) {
                        return (
                          <div className="grid grid-cols-4 gap-1.5">
                            {fotoHari.map((p, j) => (
                              <button key={j} type="button" onClick={() => setLightbox({ photos: fotoHari, index: j })}
                                className="block">
                                <img src={p} alt="" loading="lazy"
                                  className="w-full h-16 object-cover rounded-lg border border-border" />
                              </button>
                            ))}
                          </div>
                        )
                      }
                      if (jumlah < 1) return null
                      // Ada fotonya, hanya belum sampai. Disebutkan apa
                      // adanya — ruang kosong tanpa keterangan terbaca
                      // sebagai "tidak ada foto hari itu".
                      return (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          {fotoLoading
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Memuat {jumlah} foto…</>
                            : fotoGagal
                              ? <span className="text-red-600">{jumlah} foto gagal dimuat: {fotoGagal}</span>
                              : <><ImageIcon className="w-3 h-3" /> {jumlah} foto</>}
                        </p>
                      )
                    })()}
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
