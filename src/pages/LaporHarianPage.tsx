// Halaman PUBLIK (tanpa login): pekerja/mandor mengisi dari HP —
//  1. Laporan Harian  : kegiatan hari ini, catatan progress, foto
//  2. Pakai Material  : material yang terpakai di lapangan
//  3. Request Material: permintaan material yang kurang
// Ketiganya memakai satu link yang sama (report_token).
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, CheckCircle2, Camera, Plus, Trash2, HardHat, PackageOpen, ShoppingCart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldApi, uploadToDrive } from '@/lib/fieldReports'
import { materialApi, type Urgensi } from '@/lib/materialApi'
import { downscaleImage } from '@/lib/imageUtil'

type Tab = 'laporan' | 'pakai' | 'request'

const hariIni = () => new Date().toISOString().slice(0, 10)
const inputCls = 'w-full h-10 rounded-lg border border-input bg-background px-3 text-sm'

interface Header { project_name: string; drive_webhook: string }

export default function LaporHarianPage() {
  const { token = '' } = useParams()
  const [header, setHeader] = useState<Header | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('laporan')
  const [done, setDone] = useState('')

  useEffect(() => {
    fieldApi().getLogByReportToken(token)
      .then(h => { setHeader(h); if (!h) setError('Link laporan tidak ditemukan. Periksa kembali link Anda.') })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [token])

  const TABS: Array<[Tab, string, JSX.Element]> = [
    ['laporan', 'Laporan Harian', <HardHat key="i" className="w-4 h-4" />],
    ['pakai', 'Pakai Material', <PackageOpen key="i" className="w-4 h-4" />],
    ['request', 'Request Material', <ShoppingCart key="i" className="w-4 h-4" />],
  ]

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <p className="font-serif font-bold text-xl text-navy">PropFS · Kontraktor AI</p>
          <p className="text-xs text-muted-foreground">Laporan Lapangan Harian</p>
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
                <p className="text-white/70 text-[11px]">Isi dari HP, tanpa perlu login</p>
              </div>
            </div>

            {/* Tab */}
            <div className="flex border-b border-border">
              {TABS.map(([key, label, icon]) => (
                <button key={key} onClick={() => { setTab(key); setDone('') }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
                    tab === key ? 'text-navy border-b-2 border-navy bg-navy/5' : 'text-muted-foreground'}`}>
                  {icon}
                  <span className="text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>

            {done ? (
              <div className="p-6 text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="font-bold text-navy">Terkirim! ✅</p>
                <p className="text-xs text-muted-foreground">{done}</p>
                <Button variant="outline" className="mt-2" onClick={() => setDone('')}>Kirim Lagi</Button>
              </div>
            ) : (
              <>
                {tab === 'laporan' && <FormLaporan token={token} header={header} onDone={setDone} />}
                {tab === 'pakai' && <FormPakaiMaterial token={token} header={header} onDone={setDone} />}
                {tab === 'request' && <FormRequestMaterial token={token} header={header} onDone={setDone} />}
              </>
            )}
          </div>
        )}
        <p className="text-center text-[10px] text-muted-foreground">Dokumen digital · propfs.id · Kontraktor AI</p>
      </div>
    </div>
  )
}

// ── Pemilih foto yang dipakai ketiga form ───────────────────────────────────
function PilihFoto({ photos, setPhotos, max = 8 }: {
  photos: string[]
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>
  max?: number
}) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        const small = await downscaleImage(f)
        setPhotos(prev => prev.length < max ? [...prev, small] : prev)
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Foto (maks {max})</label>
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
      {photos.length < max && (
        <Button variant="outline" className="gap-2 border-dashed w-full" disabled={busy}
          onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          Ambil / Pilih Foto
        </Button>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={pick} />
    </div>
  )
}

/** Kirim foto ke Google Drive bila webhook proyek diset (fire-and-forget). */
function kirimDrive(header: Header, photos: string[], prefix: string) {
  if (!header.drive_webhook) return
  photos.forEach((p, i) => {
    const comma = p.indexOf(',')
    void uploadToDrive(header.drive_webhook, {
      name: `${prefix}_${i + 1}.jpg`, mimeType: 'image/jpeg',
      base64Data: p.slice(comma + 1), folder: header.project_name,
    })
  })
}

// ── 1. Laporan harian ───────────────────────────────────────────────────────
function FormLaporan({ token, header, onDone }: {
  token: string; header: Header; onDone: (msg: string) => void
}) {
  const [tanggal, setTanggal] = useState(hariIni)
  const [pelapor, setPelapor] = useState('')
  const [kegiatan, setKegiatan] = useState<string[]>([''])
  const [catatan, setCatatan] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const setKeg = (i: number, v: string) => setKegiatan(prev => prev.map((k, j) => j === i ? v : k))

  async function submit() {
    const keg = kegiatan.map(k => k.trim()).filter(Boolean)
    if (pelapor.trim().length < 2 || keg.length === 0) {
      setError('Isi nama pelapor dan minimal 1 kegiatan.'); return
    }
    setSubmitting(true); setError('')
    try {
      const ok = await fieldApi().submitReport(token, {
        tanggal, pelapor: pelapor.trim(), kegiatan: keg, catatan: catatan.trim(), photos,
      })
      if (!ok) throw new Error('Gagal mengirim — link tidak berlaku.')
      kirimDrive(header, photos, `${tanggal}_${pelapor.trim()}`)
      onDone(`Laporan tanggal ${tanggal} sudah masuk. Terima kasih.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nama Pelapor</label>
          <input value={pelapor} onChange={e => setPelapor(e.target.value)} placeholder="mis. Pak Yono" className={inputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Kegiatan Hari Ini</label>
        {kegiatan.map((k, i) => (
          <div key={i} className="flex gap-2">
            <input value={k} onChange={e => setKeg(i, e.target.value)}
              placeholder={`Kegiatan ${i + 1} (mis. Cor kolom lantai 2)`} className={`flex-1 ${inputCls}`} />
            {kegiatan.length > 1 && (
              <button onClick={() => setKegiatan(prev => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-red-600 px-1"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setKegiatan(prev => [...prev, ''])}>
          <Plus className="w-3.5 h-3.5" /> Tambah Kegiatan
        </Button>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Catatan / Progress</label>
        <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2}
          placeholder="mis. progress 60%, material semen menipis"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
      </div>

      <PilihFoto photos={photos} setPhotos={setPhotos} />

      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button className="w-full h-12 font-bold bg-navy hover:bg-navy/90" disabled={submitting} onClick={submit}>
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kirim Laporan'}
      </Button>
    </div>
  )
}

// ── 2. Pakai material ───────────────────────────────────────────────────────
function FormPakaiMaterial({ token, header, onDone }: {
  token: string; header: Header; onDone: (msg: string) => void
}) {
  const [tanggal, setTanggal] = useState(hariIni)
  const [pelapor, setPelapor] = useState('')
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('')
  const [qty, setQty] = useState('')
  const [lokasi, setLokasi] = useState('')
  const [catatan, setCatatan] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const jumlah = Number(qty)
    if (pelapor.trim().length < 2 || nama.trim().length < 2 || !(jumlah > 0)) {
      setError('Isi nama pelapor, nama material, dan jumlah yang dipakai.'); return
    }
    setSubmitting(true); setError('')
    try {
      const ok = await materialApi().submitUsage(token, {
        tanggal, pelapor: pelapor.trim(), nama: nama.trim(), satuan: satuan.trim(),
        qty: jumlah, lokasi: lokasi.trim(), catatan: catatan.trim(), photos,
      })
      if (!ok) throw new Error('Gagal mengirim — link tidak berlaku atau data belum lengkap.')
      kirimDrive(header, photos, `pakai_${tanggal}_${nama.trim()}`)
      onDone(`Pemakaian ${jumlah} ${satuan} ${nama.trim()} sudah dicatat.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 text-sm">
      <p className="text-[11px] text-muted-foreground bg-blue-50 border border-blue-100 rounded-xl p-2.5">
        Catat material yang <b>terpakai hari ini</b> agar kantor tahu sisa stok di lapangan.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nama Pelapor</label>
          <input value={pelapor} onChange={e => setPelapor(e.target.value)} placeholder="mis. Pak Yono" className={inputCls} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nama Material</label>
        <input value={nama} onChange={e => setNama(e.target.value)}
          placeholder="mis. Semen Portland 50kg" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Jumlah Dipakai</label>
          <input type="number" inputMode="decimal" min="0" value={qty} onChange={e => setQty(e.target.value)}
            placeholder="mis. 40" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Satuan</label>
          <input value={satuan} onChange={e => setSatuan(e.target.value)} placeholder="sak / m3 / btg" className={inputCls} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Lokasi / Pekerjaan</label>
        <input value={lokasi} onChange={e => setLokasi(e.target.value)}
          placeholder="mis. Kolom lantai 2 blok A" className={inputCls} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Catatan</label>
        <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2}
          placeholder="opsional" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
      </div>

      <PilihFoto photos={photos} setPhotos={setPhotos} max={4} />

      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button className="w-full h-12 font-bold bg-navy hover:bg-navy/90" disabled={submitting} onClick={submit}>
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Catat Pemakaian'}
      </Button>
    </div>
  )
}

// ── 3. Request material ─────────────────────────────────────────────────────
const URGENSI_PILIHAN: Array<[Urgensi, string, string]> = [
  ['normal', 'Normal', 'bg-slate-600 text-white border-slate-600'],
  ['segera', 'Segera', 'bg-amber-500 text-white border-amber-500'],
  ['darurat', 'Darurat', 'bg-red-600 text-white border-red-600'],
]

function FormRequestMaterial({ token, header, onDone }: {
  token: string; header: Header; onDone: (msg: string) => void
}) {
  const [tanggal, setTanggal] = useState(hariIni)
  const [pemohon, setPemohon] = useState('')
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('')
  const [qty, setQty] = useState('')
  const [urgensi, setUrgensi] = useState<Urgensi>('normal')
  const [butuhTanggal, setButuhTanggal] = useState('')
  const [catatan, setCatatan] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const jumlah = Number(qty)
    if (pemohon.trim().length < 2 || nama.trim().length < 2 || !(jumlah > 0)) {
      setError('Isi nama pemohon, nama material, dan jumlah yang diminta.'); return
    }
    setSubmitting(true); setError('')
    try {
      const ok = await materialApi().submitRequest(token, {
        tanggal, pemohon: pemohon.trim(), nama: nama.trim(), satuan: satuan.trim(),
        qty: jumlah, urgensi, butuhTanggal: butuhTanggal || null,
        catatan: catatan.trim(), photos,
      })
      if (!ok) throw new Error('Gagal mengirim — link tidak berlaku atau data belum lengkap.')
      kirimDrive(header, photos, `request_${tanggal}_${nama.trim()}`)
      onDone(`Permintaan ${jumlah} ${satuan} ${nama.trim()} sudah dikirim ke kantor.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 text-sm">
      <p className="text-[11px] text-muted-foreground bg-rose-50 border border-rose-100 rounded-xl p-2.5">
        Ajukan material yang <b>kurang / habis</b>. Permintaan langsung masuk ke admin & manajemen.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nama Pemohon</label>
          <input value={pemohon} onChange={e => setPemohon(e.target.value)} placeholder="mis. Pak Yono" className={inputCls} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nama Material</label>
        <input value={nama} onChange={e => setNama(e.target.value)}
          placeholder="mis. Besi Beton D13" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Jumlah Diminta</label>
          <input type="number" inputMode="decimal" min="0" value={qty} onChange={e => setQty(e.target.value)}
            placeholder="mis. 100" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Satuan</label>
          <input value={satuan} onChange={e => setSatuan(e.target.value)} placeholder="sak / m3 / btg" className={inputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Tingkat Urgensi</label>
        <div className="grid grid-cols-3 gap-2">
          {URGENSI_PILIHAN.map(([key, label, tone]) => (
            <button key={key} onClick={() => setUrgensi(key)}
              className={`h-10 rounded-lg border-2 text-xs font-bold transition-all ${
                urgensi === key ? `${tone} shadow` : 'bg-white text-muted-foreground border-border font-medium'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Dibutuhkan Paling Lambat</label>
        <input type="date" value={butuhTanggal} onChange={e => setButuhTanggal(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Catatan / Alasan</label>
        <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2}
          placeholder="mis. stok habis, besok mulai pembesian lantai 3"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
      </div>

      <PilihFoto photos={photos} setPhotos={setPhotos} max={4} />

      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button className="w-full h-12 font-bold bg-navy hover:bg-navy/90" disabled={submitting} onClick={submit}>
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kirim Permintaan'}
      </Button>
    </div>
  )
}
