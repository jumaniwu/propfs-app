// ============================================================
// PropFS — Isi laporan lapangan dari DALAM aplikasi
//
// Sampai sekarang satu-satunya jalan mengisi laporan harian adalah Link
// Pekerja: tautan bertoken yang dibuka di peramban luar. Untuk mandor yang
// memang tidak punya akun, itu tepat — ia tidak perlu login sama sekali.
//
// Untuk project manager dan pengawas yang SUDAH ada di dalam aplikasi, itu
// justru menyusahkan: aplikasinya harus ditinggalkan, dan tombol kembali
// membawa mereka ke halaman yang tidak menyegarkan dirinya — sehingga yang
// baru saja diisi tidak terlihat, dan tidak ada cara mengetahui apakah
// laporannya benar-benar masuk selain mengisinya lagi.
//
// Halaman ini memakai JALUR DATA YANG SAMA: token buku laporan milik proyek
// yang dipilih, dan formulir yang sama persis. Membuat jalur kedua ke tabel
// yang sama berarti dua tempat yang bisa berselisih.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HardHat, Loader2, RefreshCw, CheckCircle2, Users, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldApi, type FieldLog, type FieldHeader } from '@/lib/fieldReports'
import type { PekerjaLapangan } from '@/lib/pekerjaLapangan'
import { useAuthStore } from '@/store/authStore'
import { useCostStore } from '@/store/costStore'
import {
  pilihanBuku, bukuAwal, ingatBuku, namaPengisi, siapIsi, bukuTerpilih, cocokProyek,
} from '@/lib/isiLapangan'
import { FormAbsensi, FormLaporan } from './LaporHarianPage'

type Tab = 'absen' | 'laporan'

export default function IsiLapanganPage() {
  const navigate = useNavigate()
  const profile = useAuthStore(s => s.profile)
  const user = useAuthStore(s => s.user)
  const projectInfo = useCostStore(s => s.projectInfo)

  const [logs, setLogs] = useState<FieldLog[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [bukuId, setBukuId] = useState('')
  const [tab, setTab] = useState<Tab>('absen')

  const [header, setHeader] = useState<FieldHeader | null>(null)
  const [pekerja, setPekerja] = useState<PekerjaLapangan[]>([])
  const [memuatBuku, setMemuatBuku] = useState(false)
  const [selesai, setSelesai] = useState('')

  const daftar = useMemo(() => pilihanBuku(logs), [logs])

  const muat = useCallback(async () => {
    setMemuat(true)
    try {
      const l = await fieldApi().listLogs()
      setLogs(l); setGalat('')
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    } finally { setMemuat(false) }
  }, [])
  useEffect(() => { void muat() }, [muat])

  // Pilihan awal: proyek yang sedang aktif di aplikasi bila namanya cocok,
  // lalu yang terakhir dipakai. Pengawas mengisi proyek yang sama setiap hari.
  useEffect(() => {
    if (bukuId || daftar.length === 0) return
    const aktif = daftar.find(b => cocokProyek(b.nama, projectInfo?.projectName))
    setBukuId(aktif ? aktif.id : bukuAwal(daftar))
  }, [daftar, bukuId, projectInfo?.projectName])

  // Isi buku yang dipilih diambil lewat TOKENNYA — jalur yang sama persis
  // dengan yang dipakai halaman publik, jadi tidak ada aturan kedua yang bisa
  // berselisih dengan yang sudah ada.
  const buku = bukuTerpilih(daftar, bukuId)
  useEffect(() => {
    if (!buku) { setHeader(null); setPekerja([]); return }
    let batal = false
    setMemuatBuku(true); setSelesai('')
    fieldApi().getLogByReportToken(buku.token)
      .then(h => { if (!batal) { setHeader(h); setPekerja(h?.pekerja ?? []) } })
      .catch(() => { if (!batal) { setHeader(null); setPekerja([]) } })
      .finally(() => { if (!batal) setMemuatBuku(false) })
    return () => { batal = true }
  }, [buku?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatPekerja = useCallback(() => {
    if (!buku) return
    fieldApi().listPekerja(buku.token).then(setPekerja).catch(() => { /* opsional */ })
  }, [buku])

  const izin = siapIsi(daftar, bukuId)
  const namaSaya = namaPengisi({ nama: profile?.full_name, email: user?.email })

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <div className="bg-navy text-white px-4 py-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-white/80 text-xs mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali
        </button>
        <div className="flex items-center gap-2">
          <HardHat className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm">Isi Laporan Lapangan</p>
            <p className="text-white/70 text-[11px]">
              Langsung dari dalam aplikasi — tidak perlu buka link di luar
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-3 space-y-3">
        {/* Pemilih proyek. Inti permintaannya: satu layar, pilih proyeknya,
            isi — tanpa meninggalkan aplikasi. */}
        <div className="bg-white rounded-2xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-navy">Proyek yang diisi</label>
            <button onClick={() => void muat()} disabled={memuat}
              className="p-1 text-muted-foreground hover:text-navy" aria-label="Muat ulang">
              <RefreshCw className={`w-3.5 h-3.5 ${memuat ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <select data-pilih-buku value={bukuId}
            onChange={e => { setBukuId(e.target.value); ingatBuku(e.target.value); setSelesai('') }}
            className="w-full h-10 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy">
            <option value="">— Pilih proyek —</option>
            {daftar.map(b => <option key={b.id} value={b.id}>{b.nama}</option>)}
          </select>
          {!izin.boleh && (
            <p data-alasan-isi className="text-[11px] text-amber-900 bg-amber-50 border
              border-amber-200 rounded-lg p-2.5 leading-relaxed">{izin.alasan}</p>
          )}
          {galat && (
            <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200
              rounded-lg p-2.5 break-words">{galat}</p>
          )}
        </div>

        {izin.boleh && (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-2 border-b border-border">
              {([['absen', 'Absensi', Users], ['laporan', 'Laporan Harian', ClipboardList]] as const)
                .map(([key, label, Ikon]) => (
                  <button key={key} onClick={() => { setTab(key); setSelesai('') }}
                    className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
                      tab === key ? 'text-navy border-b-2 border-navy bg-navy/5' : 'text-muted-foreground'}`}>
                    <Ikon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
            </div>

            {memuatBuku ? (
              <div className="p-10 flex justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : !header ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                Buku laporan proyek ini tidak bisa dibuka. Coba muat ulang.
              </p>
            ) : selesai ? (
              // Setelah terkirim, TETAP DI SINI.
              //
              // Inilah bedanya dari tautan luar: di sana pengawas harus menutup
              // peramban dan kembali ke aplikasi, dan halaman yang ditinggalkan
              // tidak menyegarkan dirinya — sehingga yang baru diisi tidak
              // terlihat dan ia mengisinya lagi.
              <div className="p-6 text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="font-bold text-navy">Terkirim ✅</p>
                <p className="text-xs text-muted-foreground">{selesai}</p>
                <div className="flex gap-2 justify-center pt-1">
                  <Button variant="outline" onClick={() => { setSelesai(''); muatPekerja() }}>
                    Isi Lagi
                  </Button>
                  <Button onClick={() => navigate('/kontraktor')}>Selesai</Button>
                </div>
              </div>
            ) : tab === 'absen' ? (
              <FormAbsensi key={`a-${buku?.token}`} token={buku!.token} header={header}
                pekerja={pekerja} onDone={setSelesai} namaAwal={namaSaya} />
            ) : (
              <FormLaporan key={`l-${buku?.token}`} token={buku!.token} header={header}
                pekerja={pekerja} onDone={setSelesai} namaAwal={namaSaya} />
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
          Mandor yang tidak punya akun tetap memakai <b>Link Pekerja</b> dari halaman
          Laporan Lapangan. Layar ini untuk yang sudah masuk ke aplikasi.
        </p>
      </div>
    </div>
  )
}
