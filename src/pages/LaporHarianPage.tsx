// Halaman PUBLIK (tanpa login): pekerja/mandor mengisi laporan harian
// dari HP — kegiatan hari ini, catatan progress, dan foto lapangan.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, CheckCircle2, Camera, Plus, Trash2, HardHat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldApi, uploadToDrive } from '@/lib/fieldReports'
import { downscaleImage } from '@/lib/imageUtil'

export default function LaporHarianPage() {
  const { token = '' } = useParams()
  const [header, setHeader] = useState<{ project_name: string; drive_webhook: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [pelapor, setPelapor] = useState('')
  const [kegiatan, setKegiatan] = useState<string[]>([''])
  const [catatan, setCatatan] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busyPhoto, setBusyPhoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fieldApi().getLogByReportToken(token)
      .then(h => { setHeader(h); if (!h) setError('Link laporan tidak ditemukan. Periksa kembali link Anda.') })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [token])

  async function pickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setBusyPhoto(true)
    try {
      for (const f of files) {
        if (photos.length >= 8) break
        const small = await downscaleImage(f)
        setPhotos(prev => prev.length < 8 ? [...prev, small] : prev)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyPhoto(false)
    }
  }

  async function handleSubmit() {
    const keg = kegiatan.map(k => k.trim()).filter(Boolean)
    if (pelapor.trim().length < 2 || keg.length === 0) {
      setError('Isi nama pelapor dan minimal 1 kegiatan.')
      return
    }
    setSubmitting(true); setError('')
    try {
      const ok = await fieldApi().submitReport(token, {
        tanggal, pelapor: pelapor.trim(), kegiatan: keg, catatan: catatan.trim(), photos,
      })
      if (!ok) throw new Error('Gagal mengirim — link tidak berlaku.')
      // auto-upload foto ke Drive (fire-and-forget) bila webhook diset
      if (header?.drive_webhook) {
        photos.forEach((p, i) => {
          const comma = p.indexOf(',')
          void uploadToDrive(header.drive_webhook, {
            name: `${tanggal}_${pelapor.trim()}_${i + 1}.jpg`,
            mimeType: 'image/jpeg', base64Data: p.slice(comma + 1),
            folder: header.project_name,
          })
        })
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const setKeg = (i: number, v: string) => setKegiatan(prev => prev.map((k, j) => j === i ? v : k))

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <p className="font-serif font-bold text-xl text-navy">PropFS · Kontraktor AI</p>
          <p className="text-xs text-muted-foreground">Laporan Harian Lapangan</p>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
          </div>
        )}
        {!loading && !header && (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-red-600">{error || 'Tidak ditemukan.'}</div>
        )}

        {header && (
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="bg-navy text-white px-5 py-4 flex items-center gap-2">
              <HardHat className="w-5 h-5" />
              <div>
                <p className="font-bold text-sm">{header.project_name || 'Proyek'}</p>
                <p className="text-white/70 text-[11px]">Isi laporan pekerjaan hari ini</p>
              </div>
            </div>

            {done ? (
              <div className="p-6 text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="font-bold text-navy">Laporan Terkirim! ✅</p>
                <p className="text-xs text-muted-foreground">Terima kasih. Laporan Anda tanggal {tanggal} sudah masuk.</p>
                <Button variant="outline" className="mt-2" onClick={() => {
                  setDone(false); setKegiatan(['']); setCatatan(''); setPhotos([])
                }}>Kirim Laporan Lain</Button>
              </div>
            ) : (
              <div className="p-4 sm:p-5 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
                    <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Nama Pelapor</label>
                    <input value={pelapor} onChange={e => setPelapor(e.target.value)} placeholder="mis. Pak Yono"
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Kegiatan Hari Ini</label>
                  {kegiatan.map((k, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={k} onChange={e => setKeg(i, e.target.value)}
                        placeholder={`Kegiatan ${i + 1} (mis. Cor kolom lantai 2)`}
                        className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                      {kegiatan.length > 1 && (
                        <button onClick={() => setKegiatan(prev => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-red-600 px-1"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => setKegiatan(prev => [...prev, ''])}>
                    <Plus className="w-3.5 h-3.5" /> Tambah Kegiatan
                  </Button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Catatan / Progress</label>
                  <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2}
                    placeholder="mis. progress 60%, material semen menipis"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Foto Lapangan (maks 8)</label>
                  {photos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((p, i) => (
                        <div key={i} className="relative">
                          <img src={p} alt="" className="w-full h-16 object-cover rounded-lg border border-border" />
                          <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photos.length < 8 && (
                    <Button variant="outline" className="gap-2 border-dashed w-full" disabled={busyPhoto}
                      onClick={() => fileRef.current?.click()}>
                      {busyPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      Ambil / Pilih Foto
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={pickPhotos} />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}
                <Button className="w-full h-12 font-bold bg-navy hover:bg-navy/90"
                  disabled={submitting || busyPhoto} onClick={handleSubmit}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kirim Laporan'}
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="text-center text-[10px] text-muted-foreground">Dokumen digital · propfs.id · Kontraktor AI</p>
      </div>
    </div>
  )
}
