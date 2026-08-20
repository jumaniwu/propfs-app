// ============================================================
// GAMBAR KERJA & DENAH — satu tempat, dan satu jawaban atas "mana yang dipakai"
//
// Gambar kerja beredar lewat WhatsApp. Akibatnya bukan sekadar berantakan:
// tukang membuka gambar yang salah karena ia yang paling mudah ditemukan di
// gulungan chat, dan yang dibangun mengikuti revisi yang sudah dicabut.
// Kesalahannya baru ketahuan setelah dicor.
//
// Karena itu yang dikejar halaman ini bukan kelengkapan fitur, melainkan satu
// hal: siapa pun yang membukanya di lapangan harus bisa tahu MANA YANG BERLAKU
// tanpa bertanya kepada siapa pun. Versi lama tetap bisa dibuka — tapi harus
// terlihat jelas bahwa ia lama.
//
// Aturan dan pengelompokan versinya ada di lib/gambarKerja.ts supaya bisa
// diuji tanpa DOM.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText, Upload, Loader2, RefreshCw, ChevronDown, ChevronRight,
  Download, History, Trash2, AlertTriangle,
} from 'lucide-react'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { dataOwnerId, roleSaatIni, teamApi, type Workspace } from '@/lib/teamApi'
import { gambarKerjaApi } from '@/lib/gambarKerjaApi'
import {
  KATEGORI, LABEL_KATEGORI, kategoriSah, kelompokkanGambar, versiBerikut,
  jalurBerkas, siapUnggah, tandaVersi, ringkasGambar, ukuranTerbaca,
  bisaDilihatLangsung, TIPE_DITERIMA, akhiran,
  type BarisGambar, type KategoriGambar, type KelompokGambar,
} from '@/lib/gambarKerja'
import { useCostStore } from '@/store/costStore'

const inputCls = 'w-full h-10 px-3 rounded-xl border border-border bg-white text-sm '
  + 'focus:outline-none focus:ring-2 focus:ring-gold'

/** Peran yang boleh mengunggah revisi. Tukang membaca, tidak menerbitkan. */
const BOLEH_UNGGAH = ['pemilik', 'admin', 'pm', 'arsitek', 'drafter', 'pengawas']

export default function GambarKerjaPage() {
  const { toast } = useToast()
  const profile = useAuthStore(s => s.profile)
  const projectInfo = useCostStore(s => s.projectInfo)
  const savedProjects = useCostStore(s => s.savedProjects)

  const namaProyekAktif = projectInfo?.projectName ?? savedProjects[0]?.info.projectName ?? ''

  const [proyek, setProyek] = useState('')
  const [daftar, setDaftar] = useState<BarisGambar[]>([])
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<Record<string, boolean>>({})
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  useEffect(() => {
    void teamApi().myWorkspaces().then(setWorkspaces).catch(() => { /* pemilik: tetap boleh */ })
  }, [])
  const peran = roleSaatIni(workspaces)

  useEffect(() => { if (!proyek && namaProyekAktif) setProyek(namaProyekAktif) }, [namaProyekAktif, proyek])

  const muat = useCallback(async () => {
    setMemuat(true)
    try {
      setDaftar(await gambarKerjaApi().list(proyek || undefined))
      setGalat('')
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    } finally { setMemuat(false) }
  }, [proyek])

  useEffect(() => { void muat() }, [muat])

  const kelompok = useMemo(() => kelompokkanGambar(daftar), [daftar])
  const daftarProyek = useMemo(
    () => [...new Set(savedProjects.map(p => p.info.projectName).filter(Boolean))],
    [savedProjects],
  )
  // Tukang membaca, tidak menerbitkan. Yang bisa mengunggah revisi adalah yang
  // memang bertanggung jawab atas gambarnya — kalau siapa pun bisa, "versi
  // berlaku" berhenti berarti apa-apa.
  const bolehUnggah = BOLEH_UNGGAH.includes(peran)

  return (
    <div className="min-h-screen bg-slate-100/70">
      <KontraktorHeader
        judul="Gambar Kerja & Denah"
        subjudul={`${proyek || 'Semua proyek'} · ${ringkasGambar(kelompok)}`}
        kembaliKe="/kontraktor"
        aksi={
          <button onClick={() => void muat()} aria-label="Muat ulang"
            className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
            <RefreshCw className={`w-4 h-4 ${memuat ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <div className="max-w-3xl w-full mx-auto px-4 -mt-2 pb-6 space-y-3">
        {daftarProyek.length > 0 && (
          <select value={proyek} onChange={e => setProyek(e.target.value)}
            aria-label="Pilih proyek" className={`${inputCls} font-bold`}>
            <option value="">Semua proyek</option>
            {daftarProyek.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {galat && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-relaxed">{galat}</p>
          </div>
        )}

        {bolehUnggah && (
          <FormUnggah
            proyek={proyek}
            daftar={daftar}
            namaSaya={profile?.full_name || 'Tanpa nama'}
            onSelesai={muat}
          />
        )}

        {memuat && kelompok.length === 0 && (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat gambar…
          </div>
        )}

        {!memuat && kelompok.length === 0 && (
          <div className="rounded-2xl bg-white border border-border p-6 text-center space-y-2">
            <FileText className="w-8 h-8 mx-auto opacity-30" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Belum ada gambar kerja untuk proyek ini. Unggah denah, gambar struktur,
              atau MEP di sini — supaya yang di lapangan tidak lagi mencari-cari
              di gulungan chat, dan tidak salah mengerjakan revisi yang sudah dicabut.
            </p>
          </div>
        )}

        {kelompok.map(k => (
          <KartuGambar
            key={k.kunci} k={k}
            terbuka={!!buka[k.kunci]}
            onToggle={() => setBuka(b => ({ ...b, [k.kunci]: !b[k.kunci] }))}
            bolehHapus={bolehUnggah}
            onHapus={muat}
            toast={toast}
          />
        ))}
      </div>
    </div>
  )
}

// ── Satu gambar, berikut riwayat versinya ──────────────────────────────────

function KartuGambar({ k, terbuka, onToggle, bolehHapus, onHapus, toast }: {
  k: KelompokGambar
  terbuka: boolean
  onToggle: () => void
  bolehHapus: boolean
  onHapus: () => void
  toast: ReturnType<typeof useToast>['toast']
}) {
  const [sibuk, setSibuk] = useState('')

  async function bukaBerkas(b: BarisGambar) {
    if (!b.path) return
    setSibuk(b.id ?? '')
    try {
      const url = await gambarKerjaApi().tautan(b.path)
      // Dibuka di tab baru, bukan diunduh paksa: yang bisa ditampilkan
      // peramban (PDF, foto) langsung terbaca tanpa mampir ke aplikasi lain —
      // dan itu bedanya membuka gambar di lapangan dengan satu ketukan versus
      // tiga.
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast({
        title: 'Gagal membuka gambar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally { setSibuk('') }
  }

  return (
    <div className="rounded-2xl bg-white border border-border overflow-hidden">
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-9 h-9 rounded-xl bg-navy/10 text-navy flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy break-words">{k.nama}</p>
            <p className="text-[11px] text-muted-foreground">
              {LABEL_KATEGORI[k.kategori]}
              {k.terbaru.ukuran ? ` · ${ukuranTerbaca(k.terbaru.ukuran)}` : ''}
              {k.terbaru.diunggah_oleh ? ` · ${k.terbaru.diunggah_oleh}` : ''}
            </p>
          </div>
        </div>

        {/* Penanda "BERLAKU" dibuat sebesar mungkin tanpa berteriak.
            Ia satu-satunya hal yang harus terbaca dari jarak satu lengan,
            sambil berdiri, di bawah matahari. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-full px-2.5 py-1">
            {tandaVersi(k.terbaru.versi, true)}
          </span>
          {!bisaDilihatLangsung(k.terbaru.berkas_nama) && (
            <span className="text-[10px] text-muted-foreground">
              {akhiran(k.terbaru.berkas_nama).toUpperCase()} — buka di komputer
            </span>
          )}
        </div>

        {k.terbaru.perubahan && (
          <p className="text-[11px] text-navy bg-slate-50 rounded-lg p-2 leading-relaxed">
            <b>Yang berubah:</b> {k.terbaru.perubahan}
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => void bukaBerkas(k.terbaru)} disabled={!!sibuk}
            className="h-9 px-4 rounded-xl bg-navy text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            {sibuk === k.terbaru.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            Buka Gambar
          </button>

          {k.riwayat.length > 0 && (
            <button onClick={onToggle}
              className="h-9 px-3 rounded-xl border border-border text-xs font-bold text-navy flex items-center gap-1.5">
              {terbuka ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <History className="w-3.5 h-3.5" />
              {k.riwayat.length} versi lama
            </button>
          )}
        </div>
      </div>

      {terbuka && k.riwayat.length > 0 && (
        <div className="border-t border-border bg-slate-50/60 divide-y divide-border">
          {/* Versi lama TIDAK disembunyikan — ia satu-satunya cara menjelaskan
              kenapa yang terlanjur dibangun berbentuk begitu. Yang diurus
              hanyalah agar tidak ada yang mengiranya berlaku. */}
          {k.riwayat.map(b => (
            <div key={b.id} className="p-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {tandaVersi(b.versi, false)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {b.diunggah_oleh || '—'}
                  {b.created_at ? ` · ${new Date(b.created_at).toLocaleDateString('id-ID')}` : ''}
                </p>
              </div>
              <button onClick={() => void bukaBerkas(b)} disabled={!!sibuk}
                className="h-8 px-3 rounded-lg border border-border text-[11px] font-bold text-navy shrink-0 disabled:opacity-50">
                Buka
              </button>
              {bolehHapus && (
                <button
                  aria-label={`Hapus versi ${b.versi}`}
                  onClick={async () => {
                    if (!b.id) return
                    setSibuk(b.id)
                    try {
                      await gambarKerjaApi().hapus(b.id)
                      onHapus()
                    } catch (e) {
                      toast({
                        title: 'Gagal menghapus',
                        description: e instanceof Error ? e.message : String(e),
                        variant: 'destructive',
                      })
                    } finally { setSibuk('') }
                  }}
                  className="w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Unggah / revisi ────────────────────────────────────────────────────────

function FormUnggah({ proyek, daftar, namaSaya, onSelesai }: {
  proyek: string
  daftar: BarisGambar[]
  namaSaya: string
  onSelesai: () => void
}) {
  const { toast } = useToast()
  const [buka, setBuka] = useState(false)
  const [nama, setNama] = useState('')
  const [kategori, setKategori] = useState<KategoriGambar>('arsitektur')
  const [perubahan, setPerubahan] = useState('')
  const [berkas, setBerkas] = useState<File | null>(null)
  const [kirim, setKirim] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const versi = useMemo(() => versiBerikut(daftar, nama), [daftar, nama])
  const revisi = versi > 1
  const periksa = siapUnggah({ nama, berkasNama: berkas?.name, ukuran: berkas?.size })

  async function unggah() {
    if (!periksa.boleh || !berkas) {
      toast({ title: 'Belum bisa diunggah', description: periksa.alasan, variant: 'destructive' })
      return
    }
    setKirim(true)
    try {
      const path = jalurBerkas({
        ownerId: dataOwnerId() ?? '', proyek, nama, versi, berkasNama: berkas.name,
      })
      await gambarKerjaApi().unggah(berkas, {
        project_name: proyek, nama: nama.trim(), kategori, versi, path,
        berkas_nama: berkas.name, mime: berkas.type || '', ukuran: berkas.size,
        catatan: '', perubahan: perubahan.trim(), diunggah_oleh: namaSaya,
      })
      toast({
        title: revisi ? `Revisi tersimpan sebagai versi ${versi}` : 'Gambar tersimpan',
        description: revisi
          ? 'Versi sebelumnya tetap bisa dibuka di riwayat.'
          : 'Sudah bisa dibuka semua orang di tim.',
      })
      setNama(''); setPerubahan(''); setBerkas(null); setBuka(false)
      if (fileRef.current) fileRef.current.value = ''
      onSelesai()
    } catch (e) {
      toast({
        title: 'Gagal mengunggah',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally { setKirim(false) }
  }

  if (!buka) {
    return (
      <button onClick={() => setBuka(true)}
        className="w-full h-11 rounded-xl bg-gold text-navy text-xs font-bold flex items-center justify-center gap-2">
        <Upload className="w-4 h-4" /> Unggah Gambar / Revisi
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-white border-2 border-gold/40 p-4 space-y-3">
      <p className="text-sm font-bold text-navy">Unggah gambar kerja</p>

      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">
          Nama gambar *
        </label>
        <input value={nama} onChange={e => setNama(e.target.value)}
          placeholder="mis. Denah Lantai 1" className={inputCls} />
        {/* Nama yang SAMA berarti revisi, dan itu harus terlihat SEBELUM
            tombolnya ditekan — bukan ditemukan sesudahnya. */}
        {revisi && (
          <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 leading-relaxed">
            Nama ini sudah ada. Berkas ini akan tersimpan sebagai <b>versi {versi}</b>,
            dan menjadi yang berlaku. Versi sebelumnya tidak dihapus.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Kategori</label>
        <select value={kategori} onChange={e => setKategori(kategoriSah(e.target.value))}
          className={inputCls}>
          {KATEGORI.map(k => <option key={k.key} value={k.key}>{k.label} — {k.untuk}</option>)}
        </select>
      </div>

      {revisi && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">
            Apa yang berubah dari versi sebelumnya?
          </label>
          <input value={perubahan} onChange={e => setPerubahan(e.target.value)}
            placeholder="mis. Posisi tangga digeser 40 cm ke timur" className={inputCls} />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Berkas *</label>
        <input ref={fileRef} type="file"
          accept={TIPE_DITERIMA.map(t => `.${t}`).join(',')}
          onChange={e => setBerkas(e.target.files?.[0] ?? null)}
          className="w-full text-xs" />
        <p className="text-[10px] text-muted-foreground">
          {TIPE_DITERIMA.join(', ').toUpperCase()} · maks 50 MB
          {berkas ? ` · dipilih ${ukuranTerbaca(berkas.size)}` : ''}
        </p>
      </div>

      {!periksa.boleh && (nama || berkas) && (
        <p className="text-[11px] text-rose-600">{periksa.alasan}</p>
      )}

      <div className="flex gap-2">
        <button onClick={() => void unggah()} disabled={!periksa.boleh || kirim}
          className="h-10 px-5 rounded-xl bg-navy text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
          {kirim ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {kirim ? 'Mengunggah…' : revisi ? `Simpan sebagai versi ${versi}` : 'Unggah'}
        </button>
        <button onClick={() => setBuka(false)} disabled={kirim}
          className="h-10 px-4 rounded-xl border border-border text-xs font-bold text-navy">
          Batal
        </button>
      </div>
    </div>
  )
}
