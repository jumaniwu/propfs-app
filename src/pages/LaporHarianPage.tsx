// Halaman PUBLIK (tanpa login): pekerja/mandor mengisi dari HP —
//  1. Laporan Harian  : absensi pekerja, kegiatan hari ini, catatan, foto
//  2. Pakai Material  : material yang terpakai di lapangan
//  3. Request Material: permintaan material yang kurang
// Ketiganya memakai satu link yang sama (report_token).
//
// Absensi sengaja MENYATU dengan laporan harian, bukan tab keempat: mandor
// mengisi ini sekali tiap sore, dan tanggal serta nama pelapornya sudah ada
// di atas. Meminta ia mengirim dua kali berarti absensinya akan diisi
// seminggu sekali dari ingatan.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { KopPublik, KakiPublik, useBrandingPublik } from '@/components/KopPublik'
import {
  Loader2, CheckCircle2, Camera, Plus, Trash2, HardHat, PackageOpen, ShoppingCart,
  Users, UserPlus, UserCog, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldApi, uploadToDrive, type FieldHeader } from '@/lib/fieldReports'
import {
  JENIS_UPAH, siapDaftarPekerja, barisDariPekerja, belumDiabsen,
  type JenisUpah, type PekerjaLapangan,
} from '@/lib/pekerjaLapangan'
import {
  STATUS_HADIR, LEMBUR_MAKS, siapKirimAbsensi, ringkasAbsensi, cariPekerja,
  rapikanNama, type BarisAbsensi, type StatusHadir,
} from '@/lib/absensiPekerja'
import {
  materialApi, stokLapangan, cariMaterial,
  type Urgensi, type StokMaterial,
} from '@/lib/materialApi'
import { downscaleImage } from '@/lib/imageUtil'
import AmbilFoto from '@/components/lapangan/AmbilFoto'
import { sisaMuat, petunjukFoto } from '@/lib/sumberFoto'

type Tab = 'laporan' | 'pakai' | 'request' | 'pekerja'

/** Angka ringkas untuk layar HP: tanpa desimal bila bulat. */
const angkaRingkas = (n: number) =>
  (Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })

const hariIni = () => new Date().toISOString().slice(0, 10)
const inputCls = 'w-full h-10 rounded-lg border border-input bg-background px-3 text-sm'

type Header = FieldHeader

export default function LaporHarianPage() {
  const { token = '' } = useParams()
  const merek = useBrandingPublik(token)
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

  // Daftar pekerja dimuat sekali dan dibagi ke dua tab: yang mendaftarkan
  // (Pekerja) dan yang memakai (Laporan Harian). Satu sumber, supaya pekerja
  // yang baru didaftarkan langsung bisa diabsen tanpa memuat ulang halaman.
  const [pekerja, setPekerja] = useState<PekerjaLapangan[]>([])
  const muatPekerja = useCallback(() => {
    if (!token) return
    fieldApi().listPekerja(token).then(setPekerja).catch(() => setPekerja([]))
  }, [token])
  useEffect(() => { muatPekerja() }, [muatPekerja])
  // Header juga membawa daftarnya; dipakai supaya tab Laporan Harian sudah
  // terisi bahkan sebelum panggilan kedua selesai.
  useEffect(() => {
    if (header?.pekerja?.length) setPekerja(p => (p.length ? p : header.pekerja!))
  }, [header])

  const TABS: Array<[Tab, string, JSX.Element]> = [
    ['laporan', 'Laporan Harian', <HardHat key="i" className="w-4 h-4" />],
    ['pekerja', 'Pekerja', <UserCog key="i" className="w-4 h-4" />],
    ['pakai', 'Pakai Material', <PackageOpen key="i" className="w-4 h-4" />],
    ['request', 'Request Material', <ShoppingCart key="i" className="w-4 h-4" />],
  ]

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <div className="max-w-lg mx-auto space-y-4">
        <KopPublik profil={merek} subjudul="Laporan Lapangan Harian" />

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
            <div className="grid grid-cols-4 border-b border-border">
              {TABS.map(([key, label, icon]) => (
                <button key={key} onClick={() => { setTab(key); setDone('') }}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[9px] font-bold transition-colors ${
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
                {tab === 'laporan' && (
                  <FormLaporan token={token} header={header} pekerja={pekerja} onDone={setDone} />
                )}
                {tab === 'pekerja' && (
                  <FormPekerja token={token} pekerja={pekerja} onUbah={muatPekerja} />
                )}
                {tab === 'pakai' && <FormPakaiMaterial token={token} header={header} onDone={setDone} />}
                {tab === 'request' && <FormRequestMaterial token={token} header={header} onDone={setDone} />}
              </>
            )}
          </div>
        )}
        <KakiPublik profil={merek} />
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

  async function pick(files: File[]) {
    if (!files.length) return
    setBusy(true)
    try {
      // Dipotong SEBELUM dikecilkan. Mengecilkan dua puluh foto lalu membuang
      // lima belas di antaranya adalah belasan detik yang dihabiskan pemakai
      // untuk menunggu pekerjaan yang memang akan dibuang.
      for (const f of files.slice(0, sisaMuat(max, photos.length))) {
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
        <>
          {/* Dua tombol, bukan satu. Tombol lama bertuliskan "Ambil / Pilih
              Foto" — menjanjikan keduanya — sementara `capture` pada input-nya
              menghilangkan pilihan galeri sama sekali. Pengawas yang memotret
              sambil berjalan lalu mengisi laporan sore hari tidak punya cara
              memasukkan fotonya, selain memotret ulang layar HP-nya sendiri. */}
          <AmbilFoto onPilih={pick} sibuk={busy} banyak />
          <p className="text-[10px] text-muted-foreground">{petunjukFoto(max, photos.length)}</p>
        </>
      )}
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

// ── Absensi: daftar pekerja terdaftar, tidak diketik ───────────────────────
//
// Dulu blok ini meminta nama DIKETIK setiap hari. Di lapangan itu berarti
// mandor mengetik lima belas nama tiap sore, dari HP, dengan tangan yang baru
// selesai memegang semen — dan rekap upahnya lalu memecah "Yono", "yono",
// "Pak Yono" menjadi tiga orang.
//
// Sekarang pekerja didaftarkan sekali di tab Pekerja, dan yang tersisa di
// sini hanyalah mengetuk: siapa masuk, siapa tidak, dan fotonya sebagai bukti.
function BlokAbsensi({ pekerja, baris, setBaris }: {
  pekerja: PekerjaLapangan[]
  baris: BarisAbsensi[]
  setBaris: React.Dispatch<React.SetStateAction<BarisAbsensi[]>>
}) {
  const belum = useMemo(() => belumDiabsen(pekerja, baris), [pekerja, baris])

  const ubah = (i: number, patch: Partial<BarisAbsensi>) =>
    setBaris(prev => prev.map((b, j) => j === i ? { ...b, ...patch } : b))

  return (
    <div className="rounded-xl border border-border bg-slate-50/70 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-navy flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Absensi Pekerja
        </p>
        <span className="text-[10px] text-muted-foreground">
          {baris.length === 0 ? 'boleh dikosongkan' : ringkasAbsensi(baris)}
        </span>
      </div>

      {pekerja.length === 0 && baris.length === 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
          Belum ada pekerja terdaftar. Buka tab <b>Pekerja</b> di atas untuk mendaftarkan
          mereka sekali di awal — setelah itu absensi harian tinggal diketuk.
        </p>
      )}

      {baris.map((b, i) => (
        <div key={b.pekerja_id || `${b.nama}-${i}`} className="rounded-lg bg-white border border-border p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy truncate">{b.nama}</p>
              {b.peran && <p className="text-[10px] text-muted-foreground truncate">{b.peran}</p>}
            </div>
            <button type="button" aria-label={`Hapus ${b.nama}`}
              onClick={() => setBaris(prev => prev.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-red-600 shrink-0 p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {STATUS_HADIR.map(st => (
              <button key={st.key} type="button" onClick={() => ubah(i, { status: st.key as StatusHadir })}
                className={`h-9 rounded-lg border-2 text-[11px] font-bold transition-all ${
                  b.status === st.key ? `${st.tone} shadow` : 'bg-white text-muted-foreground border-border font-medium'}`}>
                {st.label}
              </button>
            ))}
          </div>

          {(b.status === 'hadir' || b.status === 'setengah') && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Foto orangnya hari itu — bukti hadir, bukan potret. */}
              <FotoAbsen foto={b.foto} onFoto={f => ubah(i, { foto: f })} nama={b.nama} />
              {b.lembur === undefined ? (
                <button type="button" onClick={() => ubah(i, { lembur: 1 })}
                  className="text-[11px] font-semibold text-navy/70 hover:text-navy">+ Lembur</button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-muted-foreground">Lembur</label>
                  <input type="number" inputMode="decimal" min="0" max={LEMBUR_MAKS} value={b.lembur}
                    onChange={e => ubah(i, { lembur: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-14 h-8 rounded-lg border border-input bg-background px-2 text-sm" />
                  <span className="text-[11px] text-muted-foreground">jam</span>
                  <button type="button" onClick={() => ubah(i, { lembur: undefined })}
                    className="text-[11px] text-muted-foreground hover:text-red-600">Batal</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Yang belum diabsen: diketuk satu per satu, atau sekaligus. */}
      {belum.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Belum diabsen ({belum.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {belum.map(p => (
              <button key={p.id} type="button" data-tambah-pekerja={p.id}
                onClick={() => setBaris(prev => [...prev, barisDariPekerja(p)])}
                className="flex items-center gap-1.5 rounded-full border border-border bg-white pl-1 pr-2.5 py-1
                  text-[11px] font-semibold text-navy hover:border-navy/40">
                {p.foto
                  ? <img src={p.foto} alt="" className="w-6 h-6 rounded-full object-cover" />
                  : <span className="w-6 h-6 rounded-full bg-navy/10 flex items-center justify-center text-[10px] font-black text-navy">
                      {p.nama.charAt(0).toUpperCase()}
                    </span>}
                {p.nama}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full h-9 gap-1.5 text-xs border-dashed"
            onClick={() => setBaris(prev => [...prev, ...belum.map(barisDariPekerja)])}>
            <UserPlus className="w-3.5 h-3.5" /> Hadirkan semua ({belum.length})
          </Button>
        </div>
      )}
    </div>
  )
}

/** Foto bukti hadir. Dikecilkan keras — ini bukti, bukan potret. */
function FotoAbsen({ foto, onFoto, nama }: {
  foto?: string
  onFoto: (f: string | undefined) => void
  nama: string
}) {
  const [sibuk, setSibuk] = useState(false)

  async function pilih(berkas: File[]) {
    const f = berkas[0]
    if (!f) return
    setSibuk(true)
    try {
      // 320 px, mutu 0,6. Lima belas pekerja kali tiga puluh hari harus tetap
      // muat di satu kolom jsonb yang masih bisa dibaca HP di lapangan.
      onFoto(await downscaleImage(f, 320, 0.6))
    } finally { setSibuk(false) }
  }

  if (foto) {
    return (
      <div className="relative">
        <img src={foto} alt={`Foto ${nama}`} className="w-10 h-10 rounded-lg object-cover border border-border" />
        <button type="button" aria-label={`Hapus foto ${nama}`} onClick={() => onFoto(undefined)}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center">
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }
  // Galeri ikut dibuka di sini, dan itu keputusan yang disadari.
  //
  // `capture` sempat terasa seperti pagar: foto absensi harus diambil saat itu
  // juga. Ia tidak pernah menjadi pagar. Sebagian peramban mengabaikannya, dan
  // bahkan ketika dipatuhi, memotret layar berisi foto lama tetap menghasilkan
  // "foto kamera". Yang ditinggalkannya hanya kerepotan bagi pengawas jujur
  // yang sudah memotret timnya sekaligus di awal hari.
  return <AmbilFoto onPilih={pilih} sibuk={sibuk} kecil labelKamera="Foto" />
}

// ── 1. Laporan harian ───────────────────────────────────────────────────────
function FormLaporan({ token, header, pekerja, onDone }: {
  token: string; header: Header; pekerja: PekerjaLapangan[]; onDone: (msg: string) => void
}) {
  const [tanggal, setTanggal] = useState(hariIni)
  const [pelapor, setPelapor] = useState('')
  const [absensi, setAbsensi] = useState<BarisAbsensi[]>([])
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
    // Absensi yang cacat dihentikan DI SINI, bukan di server: nama kembar
    // menjadi hari kerja ganda di rekap upah, dan pemakainya harus tahu
    // sebelum menekan kirim, bukan sesudahnya.
    const periksa = siapKirimAbsensi(absensi)
    if (!periksa.ok) { setError(periksa.pesan); return }

    setSubmitting(true); setError('')
    try {
      const ok = await fieldApi().submitReport(token, {
        tanggal, pelapor: pelapor.trim(), kegiatan: keg, catatan: catatan.trim(), photos,
        absensi,
      })
      if (!ok) throw new Error('Gagal mengirim — link tidak berlaku.')
      kirimDrive(header, photos, `${tanggal}_${pelapor.trim()}`)
      const jumlah = absensi.filter(a => a.status === 'hadir' || a.status === 'setengah').length
      onDone(
        `Laporan tanggal ${tanggal} sudah masuk`
        + (jumlah > 0 ? `, dengan ${jumlah} pekerja tercatat masuk` : '')
        + '. Terima kasih.',
      )
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

      <BlokAbsensi pekerja={pekerja} baris={absensi} setBaris={setAbsensi} />

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

  // Daftar material yang sudah dikenal di proyek ini, beserta sisanya.
  // Ditarik sekali saat form dibuka; kegagalannya ditelan diam-diam karena
  // pengisian manual harus tetap bisa dilakukan tanpa daftar ini.
  const [stok, setStok] = useState<StokMaterial[]>([])
  const [siapDaftar, setSiapDaftar] = useState(false)
  const [bukaSaran, setBukaSaran] = useState(false)
  useEffect(() => {
    let batal = false
    materialApi().byToken(token)
      .then(d => { if (!batal) setStok(stokLapangan(d.usage, d.requests, d.penerimaan, d)) })
      .catch(() => { /* daftar saran hanya mempercepat, bukan syarat */ })
      .finally(() => { if (!batal) setSiapDaftar(true) })
    return () => { batal = true }
  }, [token])

  const saran = useMemo(() => cariMaterial(stok, nama), [stok, nama])
  const terpilih = useMemo(
    () => stok.find(m => m.nama.trim().toLowerCase() === nama.trim().toLowerCase()) ?? null,
    [stok, nama],
  )

  function pilihMaterial(m: StokMaterial) {
    setNama(m.nama)
    if (m.satuan) setSatuan(m.satuan)
    setBukaSaran(false)
  }

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

      {/* Nama material: pilih dari yang sudah ada di proyek ini, supaya tukang
          tidak perlu mengetik nama panjang dari nol. Mengetik bebas tetap
          diizinkan — material baru harus tetap bisa dicatat. */}
      <div className="space-y-1 relative">
        <label className="text-xs font-medium text-muted-foreground">Nama Material</label>
        <input value={nama}
          onChange={e => { setNama(e.target.value); setBukaSaran(true) }}
          onFocus={() => setBukaSaran(true)}
          onBlur={() => window.setTimeout(() => setBukaSaran(false), 150)}
          placeholder="Ketik atau pilih dari daftar" className={inputCls} autoComplete="off" />

        {/* Daftar kosong pun harus bersuara: tanpa penjelasan ini, tidak
            munculnya saran terbaca seperti fiturnya rusak, padahal proyeknya
            memang belum punya catatan material. */}
        {bukaSaran && saran.length === 0 && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {!siapDaftar
                ? 'Memuat daftar material…'
                : stok.length === 0
                  ? 'Belum ada material tercatat di proyek ini. Ketik namanya langsung — nanti ikut muncul di sini.'
                  : 'Tidak ada yang cocok. Ketik namanya langsung, material baru tetap tercatat.'}
            </p>
          </div>
        )}

        {bukaSaran && saran.length > 0 && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {saran.map(m => (
              <button key={m.nama} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pilihMaterial(m)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-border last:border-0">
                <p className="text-sm text-navy font-semibold truncate">{m.nama}</p>
                <p className="text-[11px] text-muted-foreground">
                  {m.belumAdaPenerimaan
                    ? `Terpakai ${angkaRingkas(m.terpakai)} ${m.satuan} · penerimaan belum tercatat`
                    : `Sisa ${angkaRingkas(m.stok)} ${m.satuan} · terpakai ${angkaRingkas(m.terpakai)}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stok hanya ditampilkan, tidak bisa diubah dari sini: angkanya lahir
          dari penerimaan dikurangi pemakaian, bukan dari ketikan. */}
      {terpilih && (
        <div className={`rounded-xl border p-3 ${
          terpilih.belumAdaPenerimaan ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          {terpilih.belumAdaPenerimaan ? (
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <b>Stok belum tercatat.</b> Material ini belum pernah ditandai diterima di
              kantor, jadi sisanya belum bisa dihitung. Pemakaian tetap bisa dicatat.
            </p>
          ) : (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold text-emerald-900">Sisa stok saat ini</span>
              <span className="text-base font-black text-emerald-900">
                {angkaRingkas(terpilih.stok)} <span className="text-xs font-bold">{terpilih.satuan}</span>
              </span>
            </div>
          )}
          {!terpilih.belumAdaPenerimaan && (
            <p className="text-[10px] text-emerald-800/80 mt-0.5">
              Diterima {angkaRingkas(terpilih.masuk)} · terpakai {angkaRingkas(terpilih.terpakai)}
              {terpilih.dalamProses > 0 && ` · ${angkaRingkas(terpilih.dalamProses)} dalam proses`}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Jumlah Dipakai</label>
          <input type="number" inputMode="decimal" min="0" value={qty} onChange={e => setQty(e.target.value)}
            placeholder="mis. 40" className={inputCls} />
          {terpilih && !terpilih.belumAdaPenerimaan && Number(qty) > terpilih.stok && (
            <p className="text-[11px] text-amber-700">
              Melebihi sisa stok ({angkaRingkas(terpilih.stok)} {terpilih.satuan}). Tetap bisa
              dicatat bila memang begitu keadaannya.
            </p>
          )}
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

  // Daftar material yang sudah dikenal di proyek ini, beserta sisanya.
  // Ditarik sekali saat form dibuka; kegagalannya ditelan diam-diam karena
  // pengisian manual harus tetap bisa dilakukan tanpa daftar ini.
  const [stok, setStok] = useState<StokMaterial[]>([])
  const [siapDaftar, setSiapDaftar] = useState(false)
  const [bukaSaran, setBukaSaran] = useState(false)
  useEffect(() => {
    let batal = false
    materialApi().byToken(token)
      .then(d => { if (!batal) setStok(stokLapangan(d.usage, d.requests, d.penerimaan, d)) })
      .catch(() => { /* daftar saran hanya mempercepat, bukan syarat */ })
      .finally(() => { if (!batal) setSiapDaftar(true) })
    return () => { batal = true }
  }, [token])

  const saran = useMemo(() => cariMaterial(stok, nama), [stok, nama])
  const terpilih = useMemo(
    () => stok.find(m => m.nama.trim().toLowerCase() === nama.trim().toLowerCase()) ?? null,
    [stok, nama],
  )

  function pilihMaterial(m: StokMaterial) {
    setNama(m.nama)
    if (m.satuan) setSatuan(m.satuan)
    setBukaSaran(false)
  }

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

      {/* Sama seperti form pemakaian: nama diambil dari material yang sudah
          dikenal proyek ini, lengkap dengan sisanya — supaya yang meminta tahu
          barangnya memang tinggal sedikit sebelum menuliskan jumlahnya. */}
      <div className="space-y-1 relative">
        <label className="text-xs font-medium text-muted-foreground">Nama Material</label>
        <input value={nama}
          onChange={e => { setNama(e.target.value); setBukaSaran(true) }}
          onFocus={() => setBukaSaran(true)}
          onBlur={() => window.setTimeout(() => setBukaSaran(false), 150)}
          placeholder="Ketik atau pilih dari daftar" className={inputCls} autoComplete="off" />

        {/* Daftar kosong pun harus bersuara: tanpa penjelasan ini, tidak
            munculnya saran terbaca seperti fiturnya rusak, padahal proyeknya
            memang belum punya catatan material. */}
        {bukaSaran && saran.length === 0 && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {!siapDaftar
                ? 'Memuat daftar material…'
                : stok.length === 0
                  ? 'Belum ada material tercatat di proyek ini. Ketik namanya langsung — nanti ikut muncul di sini.'
                  : 'Tidak ada yang cocok. Ketik namanya langsung, material baru tetap tercatat.'}
            </p>
          </div>
        )}

        {bukaSaran && saran.length > 0 && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {saran.map(m => (
              <button key={m.nama} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pilihMaterial(m)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-border last:border-0">
                <p className="text-sm text-navy font-semibold truncate">{m.nama}</p>
                <p className="text-[11px] text-muted-foreground">
                  {m.belumAdaPenerimaan
                    ? `Terpakai ${angkaRingkas(m.terpakai)} ${m.satuan} · penerimaan belum tercatat`
                    : `Sisa ${angkaRingkas(m.stok)} ${m.satuan} · terpakai ${angkaRingkas(m.terpakai)}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {terpilih && !terpilih.belumAdaPenerimaan && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold text-emerald-900">Sisa stok saat ini</span>
            <span className="text-base font-black text-emerald-900">
              {angkaRingkas(terpilih.stok)} <span className="text-xs font-bold">{terpilih.satuan}</span>
            </span>
          </div>
          <p className="text-[10px] text-emerald-800/80 mt-0.5">
            Diterima {angkaRingkas(terpilih.masuk)} · terpakai {angkaRingkas(terpilih.terpakai)}
            {terpilih.dalamProses > 0 && ` · ${angkaRingkas(terpilih.dalamProses)} dalam proses`}
          </p>
        </div>
      )}

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

// ══ Tab PEKERJA — pengawas mendaftarkan siapa saja yang bekerja di sini ═════
//
// Didaftarkan SEKALI di awal, lewat link yang sudah dipegang pengawas — tidak
// ada link kedua yang harus disebarkan. Setelah ini, absensi harian berhenti
// menjadi pekerjaan mengetik.
function FormPekerja({ token, pekerja, onUbah }: {
  token: string
  pekerja: PekerjaLapangan[]
  onUbah: () => void
}) {
  const [nama, setNama] = useState('')
  const [peran, setPeran] = useState('')
  const [noHp, setNoHp] = useState('')
  const [jenis, setJenis] = useState<JenisUpah>('harian')
  const [upah, setUpah] = useState('')
  const [foto, setFoto] = useState<string>('')
  const [kirim, setKirim] = useState(false)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')

  const calon = {
    nama, peran, no_hp: noHp, jenis,
    upah_harian: Number(upah.replace(/\D/g, '')) || 0,
  }
  const periksa = siapDaftarPekerja(calon, pekerja)

  async function pilihFoto(berkas: File[]) {
    const f = berkas[0]
    if (!f) return
    try { setFoto(await downscaleImage(f, 400, 0.7)) } catch { setGalat('Foto tidak terbaca.') }
  }

  async function simpan() {
    if (!periksa.boleh) { setGalat(periksa.alasan); return }
    setKirim(true); setGalat(''); setPesan('')
    try {
      await fieldApi().daftarPekerja(token, {
        nama: rapikanNama(nama), peran: rapikanNama(peran), no_hp: noHp.trim(),
        jenis, upah_harian: calon.upah_harian, foto,
      })
      setPesan(`${rapikanNama(nama)} terdaftar. Namanya sudah muncul di absensi harian.`)
      setNama(''); setPeran(''); setNoHp(''); setUpah(''); setFoto('')
      onUbah()
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    } finally { setKirim(false) }
  }

  async function nonaktifkan(p: PekerjaLapangan) {
    if (!window.confirm(`Keluarkan ${p.nama} dari daftar pekerja proyek ini?\n\nAbsensinya yang sudah lewat TIDAK dihapus — upah yang belum dibayar tetap terhitung.`)) return
    try {
      await fieldApi().nonaktifkanPekerja(token, p.id)
      onUbah()
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 text-sm">
      <p className="text-[11px] text-muted-foreground bg-blue-50 border border-blue-100 rounded-xl p-2.5 leading-relaxed">
        Daftarkan pekerja <b>sekali di awal</b>. Setelah itu absensi harian tinggal
        diketuk — tidak perlu mengetik nama lagi tiap sore.
      </p>

      {/* ── Yang sudah terdaftar ── */}
      {pekerja.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-muted-foreground">
            Sudah terdaftar ({pekerja.length})
          </p>
          {pekerja.map(p => (
            <div key={p.id} data-pekerja={p.id}
              className="flex items-center gap-2.5 rounded-xl border border-border p-2.5">
              {p.foto
                ? <img src={p.foto} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                : <span className="w-9 h-9 rounded-full bg-navy/10 flex items-center justify-center text-xs font-black text-navy shrink-0">
                    {p.nama.charAt(0).toUpperCase()}
                  </span>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-navy truncate">{p.nama}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {[p.peran, p.jenis === 'borongan'
                    ? 'Borongan'
                    : p.upah_harian > 0
                      ? `Rp ${p.upah_harian.toLocaleString('id-ID')}/hari`
                      : 'Upah belum diisi'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => nonaktifkan(p)} aria-label={`Keluarkan ${p.nama}`}
                className="text-muted-foreground hover:text-red-600 shrink-0 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Tambah ── */}
      <div className="rounded-xl border-2 border-gold/40 bg-slate-50/60 p-3 space-y-3">
        <p className="text-xs font-bold text-navy">Tambah Pekerja</p>

        <div className="flex items-center gap-3">
          {foto
            ? <img src={foto} alt="" className="w-14 h-14 rounded-xl object-cover border border-border" />
            : <span className="w-14 h-14 rounded-xl bg-navy/5 border border-dashed border-border flex items-center justify-center">
                <Camera className="w-5 h-5 text-muted-foreground" />
              </span>}
          <div className="flex-1 space-y-1">
            {/* Foto pengenal boleh datang dari album: yang mendaftarkan
                pekerja sering sudah punya fotonya, dan memaksanya memotret
                ulang di tempat hanya menunda pendaftaran yang seharusnya
                selesai dalam satu menit. */}
            <AmbilFoto onPilih={pilihFoto} arah="depan" kecil
              labelKamera={foto ? 'Ganti' : 'Kamera'} />
            <p className="text-[10px] text-muted-foreground leading-tight">
              Untuk mengenali nama di daftar absen — di proyek besar, "Adi" bisa
              berarti tiga orang.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block col-span-2">
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">Nama *</span>
            <input value={nama} onChange={e => { setNama(e.target.value); setGalat('') }}
              placeholder="mis. Pak Yono" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">Peran</span>
            <input value={peran} onChange={e => setPeran(e.target.value)}
              placeholder="Tukang batu" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">No. HP</span>
            <input value={noHp} onChange={e => setNoHp(e.target.value)} inputMode="tel"
              placeholder="0812…" className={inputCls} />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="block text-[11px] font-medium text-muted-foreground">Cara dibayar</span>
          <div className="grid grid-cols-2 gap-2">
            {JENIS_UPAH.map(j => (
              <button key={j.key} type="button" onClick={() => setJenis(j.key)}
                data-jenis={j.key}
                className={`rounded-xl border-2 p-2.5 text-left transition ${
                  jenis === j.key ? 'border-navy bg-navy/5' : 'border-border bg-white'}`}>
                <p className="text-[11px] font-black text-navy">{j.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{j.untuk}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Upah harian hanya berarti untuk yang dibayar harian. Menampilkannya
            pada borongan mengundang angka yang lalu tidak pernah dipakai — dan
            angka yang tidak dipakai adalah angka yang menyesatkan. */}
        {jenis === 'harian' && (
          <label className="block">
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">
              Upah per hari <span className="text-muted-foreground/70">— boleh diisi nanti</span>
            </span>
            <input value={upah} inputMode="numeric"
              onChange={e => setUpah(e.target.value.replace(/\D/g, ''))}
              placeholder="mis. 150000" className={inputCls} />
            {calon.upah_harian > 0 && (
              <span className="block text-[10px] text-muted-foreground mt-1">
                Rp {calon.upah_harian.toLocaleString('id-ID')} per hari kerja
              </span>
            )}
          </label>
        )}

        {galat && <p className="text-[11px] text-red-600">{galat}</p>}
        {pesan && <p className="text-[11px] text-emerald-700 font-semibold">{pesan}</p>}

        <Button className="w-full h-11 font-bold bg-navy hover:bg-navy/90 gap-2"
          disabled={kirim || !periksa.boleh} onClick={simpan}>
          {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Daftarkan Pekerja
        </Button>
        {!periksa.boleh && nama.trim().length > 0 && (
          <p className="text-[11px] text-muted-foreground">{periksa.alasan}</p>
        )}
      </div>
    </div>
  )
}
