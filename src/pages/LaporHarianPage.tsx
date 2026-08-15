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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { KopPublik, KakiPublik, useBrandingPublik } from '@/components/KopPublik'
import {
  Loader2, CheckCircle2, Camera, Plus, Trash2, HardHat, PackageOpen, ShoppingCart,
  Users, UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldApi, uploadToDrive, type FieldHeader } from '@/lib/fieldReports'
import {
  STATUS_HADIR, LEMBUR_MAKS, siapKirimAbsensi, ringkasAbsensi, cariPekerja,
  rapikanNama, type BarisAbsensi, type StatusHadir,
} from '@/lib/absensiPekerja'
import {
  materialApi, stokLapangan, cariMaterial,
  type Urgensi, type StokMaterial,
} from '@/lib/materialApi'
import { downscaleImage } from '@/lib/imageUtil'

type Tab = 'laporan' | 'pakai' | 'request'

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

  const TABS: Array<[Tab, string, JSX.Element]> = [
    ['laporan', 'Laporan Harian', <HardHat key="i" className="w-4 h-4" />],
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

// ── Absensi: satu blok di dalam laporan harian ──────────────────────────────
//
// Dibuat untuk ibu jari, bukan untuk papan ketik. Nama diketuk dari daftar
// yang sudah pernah tercatat; statusnya empat tombol besar. Mengetik nama
// baru tetap bisa — tukang baru harus tetap bisa masuk absen di hari
// pertamanya, tanpa menunggu siapa pun mendaftarkannya lebih dulu.
function BlokAbsensi({ daftar, baris, setBaris }: {
  daftar: Array<{ nama: string; peran: string }>
  baris: BarisAbsensi[]
  setBaris: React.Dispatch<React.SetStateAction<BarisAbsensi[]>>
}) {
  const [ketik, setKetik] = useState('')
  const [fokus, setFokus] = useState(false)

  const dipakai = baris.map(b => b.nama)
  const saran = useMemo(() => cariPekerja(daftar, ketik, dipakai),
    [daftar, ketik, dipakai.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const belumDiabsen = useMemo(() => cariPekerja(daftar, '', dipakai),
    [daftar, dipakai.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const ubah = (i: number, patch: Partial<BarisAbsensi>) =>
    setBaris(prev => prev.map((b, j) => j === i ? { ...b, ...patch } : b))

  function tambah(nama: string, peran = '') {
    const rapi = rapikanNama(nama)
    if (rapi.length < 2) return
    setBaris(prev => [...prev, { nama: rapi, peran: peran || undefined, status: 'hadir' }])
    setKetik('')
  }

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

      {baris.map((b, i) => (
        <div key={i} className="rounded-lg bg-white border border-border p-2.5 space-y-2">
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
            {STATUS_HADIR.map(s => (
              <button key={s.key} type="button" onClick={() => ubah(i, { status: s.key as StatusHadir })}
                className={`h-9 rounded-lg border-2 text-[11px] font-bold transition-all ${
                  b.status === s.key ? `${s.tone} shadow` : 'bg-white text-muted-foreground border-border font-medium'}`}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Lembur hanya berarti bagi yang datang. Menawarkannya kepada yang
              izin atau alpa hanya mengundang angka yang tidak masuk akal.
              Kolomnya pun baru muncul saat diminta: kebanyakan hari tidak ada
              lembur sama sekali, dan sebuah proyek dengan lima belas tukang
              tidak boleh menjadi lima belas kotak kosong untuk digulung. */}
          {(b.status === 'hadir' || b.status === 'setengah') && (
            b.lembur === undefined ? (
              <button type="button" onClick={() => ubah(i, { lembur: 1 })}
                className="text-[11px] font-semibold text-navy/70 hover:text-navy">
                + Lembur
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted-foreground">Lembur</label>
                <input type="number" inputMode="decimal" min="0" max={LEMBUR_MAKS} autoFocus
                  value={b.lembur}
                  onChange={e => {
                    const v = Number(e.target.value)
                    ubah(i, { lembur: e.target.value === '' ? 0 : v })
                  }}
                  className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-sm" />
                <span className="text-[11px] text-muted-foreground">jam</span>
                <button type="button" onClick={() => ubah(i, { lembur: undefined })}
                  className="text-[11px] text-muted-foreground hover:text-red-600 ml-auto">
                  Batal
                </button>
              </div>
            )
          )}
        </div>
      ))}

      {/* Tambah pekerja: ketik, atau ketuk dari yang sudah pernah tercatat. */}
      <div className="relative">
        <div className="flex gap-1.5">
          <input value={ketik}
            onChange={e => { setKetik(e.target.value); setFokus(true) }}
            onFocus={() => setFokus(true)}
            onBlur={() => window.setTimeout(() => setFokus(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tambah(ketik) } }}
            placeholder="Nama pekerja" autoComplete="off"
            className={`flex-1 ${inputCls}`} />
          <Button type="button" variant="outline" className="h-10 px-3 gap-1 shrink-0"
            disabled={rapikanNama(ketik).length < 2} onClick={() => tambah(ketik)}>
            <Plus className="w-4 h-4" /> <span className="text-xs">Tambah</span>
          </Button>
        </div>

        {fokus && saran.length > 0 && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {saran.map(s => (
              <button key={s.nama} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => tambah(s.nama, s.peran)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-border last:border-0">
                <p className="text-sm text-navy font-semibold truncate">{s.nama}</p>
                {s.peran && <p className="text-[11px] text-muted-foreground truncate">{s.peran}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Kebanyakan hari, yang masuk adalah orang yang sama dengan kemarin.
          Satu ketukan untuk itu, lalu yang tidak masuk tinggal diubah. */}
      {belumDiabsen.length > 0 && (
        <Button type="button" variant="outline" size="sm" className="w-full h-9 gap-1.5 text-xs border-dashed"
          onClick={() => setBaris(prev => [
            ...prev,
            ...belumDiabsen.map(d => ({
              nama: d.nama, peran: d.peran || undefined, status: 'hadir' as StatusHadir,
            })),
          ])}>
          <UserPlus className="w-3.5 h-3.5" />
          Hadirkan semua ({belumDiabsen.length})
        </Button>
      )}
    </div>
  )
}

// ── 1. Laporan harian ───────────────────────────────────────────────────────
function FormLaporan({ token, header, onDone }: {
  token: string; header: Header; onDone: (msg: string) => void
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

      <BlokAbsensi daftar={header.pekerja ?? []} baris={absensi} setBaris={setAbsensi} />

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
