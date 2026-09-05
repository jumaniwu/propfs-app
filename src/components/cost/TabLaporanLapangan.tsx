// ============================================================
// Tab LAPORAN LAPANGAN — Kontraktor AI
// Buat "buku laporan" per proyek → 1 link untuk pekerja upload laporan
// harian (absensi/kerja/progress/foto), 1 link untuk owner lihat kalender
// progres.
//
// Laporan yang masuk dibaca dengan dua cara yang berbeda, jadi ada dua
// tampilan: KEJADIAN per hari (apa yang dikerjakan) dan REKAP per pekerja
// (siapa masuk berapa hari). Yang kedua itulah dasar orang dibayar.
// ============================================================
import { useEffect, useState } from 'react'
import {
  HardHat, Plus, RefreshCw, Loader2, Link2, Send, CalendarDays, Trash2,
  Image as ImageIcon, ExternalLink, Users, ListChecks, Merge, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useCostStore } from '@/store/costStore'
import { useToast } from '@/hooks/use-toast'
import {
  fieldApi, laporLink, progresLink, waShare, getDriveWebhook,
  type FieldLog, type FieldReport,
} from '@/lib/fieldReports'
import type { PekerjaLapangan } from '@/lib/pekerjaLapangan'
import { kelompokkanBuku, bolehBuatBuku, pesanBelumPunyaBuku } from '@/lib/bukuLaporan'
import { cariKembar, usulanTarget, rencanaGabung, kalimatGabung } from '@/lib/gabungBuku'
import ChipAbsensi from './ChipAbsensi'
import PanelRekapAbsensi from './PanelRekapAbsensi'
import PhotoLightbox from '@/components/PhotoLightbox'

export default function TabLaporanLapangan() {
  const { toast } = useToast()
  const { projectInfo } = useCostStore()
  const [logs, setLogs] = useState<FieldLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [openLog, setOpenLog] = useState<FieldLog | null>(null)
  const [reports, setReports] = useState<FieldReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [tampilan, setTampilan] = useState<'harian' | 'absensi'>('harian')
  // Daftar pekerja dibutuhkan rekap upah: tarif hariannya ada di sana, bukan
  // di absensinya. Kegagalannya ditelan — rekap HOK tetap berguna tanpa upah.
  const [pekerja, setPekerja] = useState<PekerjaLapangan[]>([])
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)
  // Jumlah laporan per buku. Dipakai memilih buku mana yang dipertahankan
  // saat menggabungkan yang kembar, dan untuk mengatakan berapa yang ikut
  // hangus sebelum sebuah buku dihapus. Kosong bila servernya belum bisa
  // menghitungnya — daftarnya tetap tampil.
  const [jumlah, setJumlah] = useState<Map<string, number>>(new Map())
  const [pilihTarget, setPilihTarget] = useState<Record<string, string>>({})
  const [sedangGabung, setSedangGabung] = useState('')

  const load = () => {
    setLoading(true); setError('')
    fieldApi().listLogs()
      .then(setLogs)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    // Terpisah dan kegagalannya ditelan: hitungan ini keterangan tambahan,
    // dan daftar buku tidak boleh ikut gagal tampil karenanya.
    fieldApi().hitungLaporan().then(setJumlah).catch(() => setJumlah(new Map()))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Buku proyek ini, dipisahkan dari buku proyek lain.
   *
   * Halaman ini dulu menampilkan JUDUL proyek yang sedang dibuka di kepala
   * layar, lalu SELURUH buku milik semua proyek di bawahnya tanpa satu pun
   * penanda. Membuka "Ruko Pak Soni" memperlihatkan kartu bertuliskan "Rumah
   * Noble Cove", dan tidak ada apa pun yang mengatakan itu buku proyek lain.
   *
   * Yang terjadi berikutnya bisa ditebak: buku yang terlihat dianggap buku
   * proyek ini, link pekerjanya dibagikan ke mandor, dan laporan hariannya
   * masuk ke proyek yang salah. Dicari di proyek asalnya, tidak ada apa-apa —
   * dan yang tampak dari luar adalah laporan yang HILANG.
   *
   * Yang milik proyek lain tidak dibuang, hanya dipisah dan diberi nama:
   * laporan yang terlanjur masuk ke sana harus tetap bisa dibuka.
   */
  const namaProyek = projectInfo?.projectName?.trim() ?? ''
  const { milikProyek, proyekLain } = kelompokkanBuku(logs, namaProyek)
  const izinBuat = bolehBuatBuku(logs, namaProyek)

  async function handleCreate() {
    // Dua penolakan, keduanya menutup jalan yang selama ini terbuka: buku
    // tanpa proyek aktif dulu dibuat bernama harfiah "Proyek" — nama yang
    // tidak cocok dengan proyek mana pun — dan buku kedua untuk proyek yang
    // sama membelah laporannya ke dua tempat tanpa ada yang tahu mana yang
    // dipakai mandor.
    if (!izinBuat.boleh) {
      toast({ title: 'Belum bisa dibuat', description: izinBuat.alasan, variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const log = await fieldApi().createLog(namaProyek, getDriveWebhook())
      toast({ title: '✅ Buku laporan dibuat!', description: 'Bagikan link pekerja & owner di bawah.' })
      setLogs(prev => [log, ...prev])
    } catch (e) {
      toast({ title: 'Gagal membuat', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  function openReports(log: FieldLog) {
    setOpenLog(log)
    setReportsLoading(true)
    fieldApi().listReports(log.id)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setReportsLoading(false))
    fieldApi().listPekerja(log.report_token)
      .then(setPekerja)
      .catch(() => setPekerja([]))
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text)
    toast({ title: `${label} disalin!` })
  }
  const shareWaLapor = (log: FieldLog) => {
    const msg = `Selamat pagi. Mohon isi *Laporan Harian Lapangan* dari HP tiap hari (kegiatan, progress, foto):\n${log.project_name}\n\n👉 ${laporLink(log.report_token)}\n\nTerima kasih.`
    window.open(waShare(msg), '_blank')
  }
  const shareWaProgres = (log: FieldLog) => {
    const msg = `Pantau *progres lapangan* proyek ${log.project_name} lewat kalender berikut:\n\n👉 ${progresLink(log.view_token)}`
    window.open(waShare(msg), '_blank')
  }


  /**
   * Buku kembar: lebih dari satu buku untuk nama proyek yang sama.
   *
   * Proyek Pak Soni berakhir dengan tiga. Tombol "Buat Buku Laporan" dulu
   * tidak memeriksa apa pun, dan penjagaannya baru ditambahkan belakangan di
   * layar ini saja — dua orang di dua perangkat tetap bisa melahirkan dua
   * buku, dan yang sudah terlanjur kembar tidak ikut terbereskan.
   *
   * Akibatnya tidak pernah tampak sebagai galat. Tiap buku punya link
   * pekerjanya sendiri; mandor yang menerima link berbeda mengisi ke buku
   * berbeda. Laporannya utuh, hanya terpecah — dan rekap absensi ikut
   * terbelah, sehingga upah dihitung dari separuh datanya.
   */
  const kembar = cariKembar(logs.map(l => ({ ...l, jumlahLaporan: jumlah.get(l.id) })))

  async function handleGabung(nama: string) {
    const kel = kembar.find(k => k.nama === nama)
    if (!kel) return
    const target = pilihTarget[nama] || usulanTarget(kel)
    const r = rencanaGabung(kel, target)
    if (!r.boleh) {
      toast({ title: 'Belum bisa digabungkan', description: r.alasan, variant: 'destructive' })
      return
    }
    // Konfirmasinya menyebut yang HILANG, bukan hanya yang didapat: link
    // pekerja buku yang digabungkan berhenti berlaku, dan mandor yang masih
    // memegangnya tidak akan diberi tahu oleh siapa pun kecuali orang yang
    // menekan tombol ini. Sesudahnya tidak ada tombol urung.
    if (!window.confirm(`${kalimatGabung(r, nama)}\n\nLanjutkan?`)) return

    setSedangGabung(nama)
    try {
      const h = await fieldApi().gabungLog(r.targetId, r.sumberId)
      toast({
        title: '✅ Buku laporan digabungkan',
        description: `${h.laporan_pindah} laporan dipindahkan, ${h.buku_dihapus} buku kembar ditutup.`
          + ' Bagikan ulang link pekerja buku yang tersisa kepada mandor.',
      })
      load()
      setOpenLog(null)
    } catch (e) {
      toast({
        title: 'Gagal menggabungkan',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally { setSedangGabung('') }
  }

  async function hapusBuku(log: FieldLog) {
    const n = jumlah.get(log.id)
    const isi = n === undefined
      ? 'Seluruh laporan harian, absensi, dan catatan material di dalamnya ikut terhapus'
      : n > 0
        ? `${n} laporan harian beserta absensi dan catatan material di dalamnya ikut terhapus`
        : 'Buku ini belum berisi laporan'
    if (!window.confirm(
      `Hapus buku laporan "${log.project_name || 'Proyek'}"?\n\n${isi}, dan tidak bisa dikembalikan.`
      + '\n\nKalau buku ini kembar dengan buku lain, GABUNGKAN saja — jangan dihapus.')) return
    try {
      await fieldApi().deleteLog(log.id)
      toast({ title: 'Buku laporan dihapus' })
      load()
    } catch (e) {
      // Kegagalannya disebutkan. Sebelumnya kegagalan hapus tidak menampilkan
      // apa pun, dan bukunya muncul lagi setelah muat ulang tanpa penjelasan.
      toast({
        title: 'Gagal menghapus',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  /** Satu kartu buku laporan. `lain` = milik proyek selain yang dibuka. */
  function kartuBuku(log: FieldLog, lain: boolean) {
    return (
            <div key={log.id} className="bg-white rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy text-sm truncate">🏗️ {log.project_name || 'Proyek'}</p>
                  {/* Tanggal & jumlah laporan.
                      Tiga buku dengan nama proyek yang sama terlihat persis
                      sama di daftar ini, jadi tidak ada cara memastikan buku
                      mana yang sedang dipilih di panel penggabungan — atau
                      mana yang hendak dihapus. Dua keterangan ini yang
                      membedakannya. */}
                  <p className="text-[10px] text-muted-foreground">
                    Dibuat {log.created_at ? String(log.created_at).slice(0, 10) : '—'}
                    {jumlah.has(log.id) ? ` · ${jumlah.get(log.id)} laporan` : ''}
                  </p>
                  {/* Buku milik proyek lain tetap ditampilkan dan tetap bisa
                      dipakai; yang ditambahkan hanya penandanya, supaya link
                      pekerjanya tidak salah dibagikan. Laporan yang dikirim
                      lewat link sebuah buku masuk ke proyek buku itu. */}
                  {lain && (
                    <p className="text-[10px] font-bold text-amber-700">Proyek lain</p>
                  )}
                </div>
                {/* Peringatan yang dulu tidak ada.
                    "Hapus buku laporan ini?" terdengar seperti membuang
                    wadah kosong. Sebenarnya keempat tabel yang menempel
                    padanya `on delete cascade`: laporan harian, absensi,
                    pemakaian dan permintaan material ikut hangus, tanpa
                    tembusan dan tanpa bisa dikembalikan. Buku yang kembar
                    sebaiknya DIGABUNGKAN, bukan dihapus — panel di atas. */}
                <button onClick={() => hapusBuku(log)}
                  className="text-muted-foreground hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>

              {/* Link pekerja */}
              <div className="rounded-xl bg-slate-50 border border-border p-2.5 space-y-1.5">
                <p className="text-[11px] font-bold text-navy">👷 Link Pekerja (absensi & laporan)</p>
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => copy(laporLink(log.report_token), 'Link pekerja')}>
                    <Link2 className="w-3 h-3" /> Salin
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => shareWaLapor(log)}>
                    <Send className="w-3 h-3" /> WhatsApp
                  </Button>
                  {/* Membuka linknya sendiri, tanpa harus menyalin lalu
                      menempelkannya ke bilah alamat. Admin kantor memakai ini
                      untuk mengisikan absensi hari-hari yang terlewat, dan
                      untuk memastikan formnya memang terbuka sebelum linknya
                      disebarkan ke mandor. */}
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    onClick={() => window.open(laporLink(log.report_token), '_blank', 'noopener')}>
                    <ExternalLink className="w-3 h-3" /> Buka
                  </Button>
                </div>
              </div>

              {/* Link owner */}
              <div className="rounded-xl bg-gold-lt/30 border border-gold/30 p-2.5 space-y-1.5">
                <p className="text-[11px] font-bold text-navy">📅 Link Owner (kalender progres)</p>
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => copy(progresLink(log.view_token), 'Link owner')}>
                    <Link2 className="w-3 h-3" /> Salin
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => shareWaProgres(log)}>
                    <Send className="w-3 h-3" /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                    onClick={() => window.open(progresLink(log.view_token), '_blank', 'noopener')}>
                    <CalendarDays className="w-3 h-3" /> Buka
                  </Button>
                </div>
              </div>

              <Button size="sm" variant="ghost" className="w-full h-8 text-[11px] gap-1.5 text-navy" onClick={() => openReports(log)}>
                <ImageIcon className="w-3.5 h-3.5" /> Lihat Laporan Masuk
              </Button>
            </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl md:text-2xl font-serif font-bold text-navy flex items-center gap-2">
          <HardHat className="w-6 h-6" /> Laporan Lapangan
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
          </Button>
          <Button size="sm" className="gap-1.5 bg-navy hover:bg-navy/90 font-bold" disabled={creating} onClick={handleCreate}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Buat Buku Laporan
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground max-w-2xl">
        Buat buku laporan → bagikan <b>Link Pekerja</b> (mandor mengisi absensi, kegiatan & foto
        tiap hari dari HP tanpa login) → bagikan <b>Link Owner</b> (lihat kalender progres harian,
        lengkap dengan foto). Kehadiran yang masuk direkap per pekerja di <b>Rekap Absensi</b>.
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {error} — pastikan migrasi <code>migration_field_reports.sql</code> sudah dijalankan di Supabase.
        </p>
      )}

      {loading ? (
        <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : logs.length === 0 && !error ? (
        <div className="py-12 text-center bg-white rounded-3xl border border-border">
          <HardHat className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">Belum ada buku laporan. Klik "Buat Buku Laporan".</p>
        </div>
      ) : (
        <>
        {/* Proyek ini belum punya buku sendiri.
            Inilah jawaban atas "kenapa laporan Pak Soni tidak muncul": bukunya
            memang belum pernah dibuat. Disebutkan satu baris, bukan dengan
            menyembunyikan buku yang lain — seluruh buku tetap tampil, dan nama
            proyeknya tertulis di tiap kartu. */}
        {namaProyek && milikProyek.length === 0 && (
          <p data-belum-punya-buku className="text-xs text-amber-900 bg-amber-50 border
            border-amber-200 rounded-xl p-3 leading-relaxed">
            {pesanBelumPunyaBuku(namaProyek, proyekLain.length)}
          </p>
        )}

        {/* Buku kembar — ditawarkan digabungkan, bukan dihapus.
            Menghapus salah satunya tidak merapikan apa pun: keempat tabel
            yang menempel pada sebuah buku `on delete cascade`, jadi
            menghapusnya menghanguskan laporan, absensi, dan catatan material
            di dalamnya. Itu pula sebab paling mungkin buku lama yang
            "hilang". */}
        {kembar.map(k => {
          const target = pilihTarget[k.nama] || usulanTarget(k)
          const r = rencanaGabung(k, target)
          return (
            <div key={k.nama} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-900">
                    Proyek "{k.nama}" punya {k.buku.length} buku laporan
                  </p>
                  <p className="text-[11px] text-amber-900/80 leading-relaxed mt-0.5">
                    Isinya terpisah: tiap buku punya link pekerja sendiri, jadi mandor yang
                    memegang link berbeda mengisi ke buku berbeda — dan rekap absensi hanya
                    membaca satu buku. Gabungkan supaya laporan dan upahnya terbaca utuh.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-amber-900">Buku mana yang dipertahankan?</p>
                {k.buku.map(b => (
                  <label key={b.id} className="flex items-center gap-2 text-[11px] text-amber-900 cursor-pointer">
                    <input type="radio" name={`gabung-${k.nama}`} checked={target === b.id}
                      onChange={() => setPilihTarget(prev => ({ ...prev, [k.nama]: b.id }))} />
                    <span className="truncate">
                      Dibuat {b.created_at ? String(b.created_at).slice(0, 10) : '—'}
                      {' · '}
                      {/* Jumlahnya disebutkan supaya pilihannya punya dasar.
                          Bila server belum bisa menghitungnya, yang tampil
                          adalah tanda tanya — bukan angka nol yang keliru
                          terbaca sebagai "buku ini kosong". */}
                      {jumlah.has(b.id) ? `${jumlah.get(b.id)} laporan` : 'jumlah laporan belum terbaca'}
                    </span>
                  </label>
                ))}
              </div>

              <Button size="sm" className="h-8 text-[11px] gap-1.5 bg-amber-700 hover:bg-amber-800 font-bold"
                disabled={!r.boleh || sedangGabung === k.nama}
                onClick={() => handleGabung(k.nama)}>
                {sedangGabung === k.nama
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Merge className="w-3.5 h-3.5" />}
                Gabungkan jadi 1 buku
              </Button>
              <p className="text-[10px] text-amber-900/70 leading-relaxed">
                Tidak ada laporan yang dihapus — semuanya dipindahkan ke buku yang dipertahankan.
                Yang berhenti berlaku adalah link pekerja buku lainnya, jadi bagikan ulang link
                buku yang tersisa kepada mandor.
              </p>
            </div>
          )
        })}

        {/* SATU daftar untuk seluruh proyek.
            Sempat dipisah menjadi "buku proyek ini" dan "buku proyek lain"
            supaya link tidak salah dibagikan. Itu terlalu jauh: buku laporan
            memang sedikit, nama proyeknya sudah tertulis besar di tiap kartu,
            dan memecahnya menjadi dua bagian justru membuat buku yang dicari
            tampak hilang. Yang dijaga sekarang tinggal pembuatannya — satu
            proyek satu buku. */}
        <div className="grid md:grid-cols-2 gap-3">
          {logs.map(log => kartuBuku(log, !!namaProyek && !milikProyek.includes(log)))}
        </div>
        </>
      )}

      {/* Panel laporan masuk — dua cara membaca data yang sama */}
      {openLog && (
        <div className="bg-white rounded-3xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-navy text-sm truncate">Laporan Masuk — {openLog.project_name}</h3>
            <button onClick={() => setOpenLog(null)} className="text-xs text-muted-foreground hover:text-navy shrink-0">Tutup</button>
          </div>

          <div className="flex gap-1.5">
            {([
              ['harian', 'Laporan Harian', ListChecks],
              ['absensi', 'Rekap Absensi', Users],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setTampilan(key)}
                className={`flex-1 h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  tampilan === key ? 'bg-navy text-white' : 'bg-slate-100 text-muted-foreground hover:bg-slate-200'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {reportsLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : tampilan === 'absensi' ? (
            <PanelRekapAbsensi laporan={reports} pekerja={pekerja} namaProyek={openLog.project_name}
              token={openLog.report_token} onUbahUpah={() => openReports(openLog)} />
          ) : reports.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Belum ada laporan dari pekerja.</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {reports.map(r => (
                <div key={r.id} className="rounded-xl border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-navy">📅 {r.tanggal} · 👷 {r.pelapor}</p>
                    <button onClick={async () => { await fieldApi().deleteReport(r.id); openReports(openLog) }}
                      className="text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <ChipAbsensi absensi={r.absensi} />
                  <ul className="text-xs text-slate-700 list-disc pl-4">
                    {r.kegiatan.map((k, j) => <li key={j}>{k}</li>)}
                  </ul>
                  {r.catatan && <p className="text-[11px] text-muted-foreground italic">Catatan: {r.catatan}</p>}
                  {r.photos.length > 0 && (
                    <div className="grid grid-cols-6 gap-1.5">
                      {r.photos.map((p, j) => (
                        <button key={j} type="button" onClick={() => setLightbox({ photos: r.photos, index: j })}
                          className="block">
                          <img src={p} alt="" className="w-full h-12 object-cover rounded-lg border border-border" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={i => setLightbox(lb => lb && { ...lb, index: i })} />
      )}
    </div>
  )
}

/** Kartu pengaturan Google Drive — dipakai di tab Pengaturan Proyek. */
export function DriveSettingCard() {
  const { toast } = useToast()
  const [url, setUrl] = useState(getDriveWebhook())
  const [saved, setSaved] = useState(false)
  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div>
        <h3 className="font-bold text-navy text-sm">Auto-Upload Foto ke Google Drive</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Setiap foto yang dikirim di chat Realisasi Biaya (dan laporan pekerja) otomatis tersimpan ke folder Drive Anda.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">URL Google Apps Script Web App</Label>
        <Input value={url} onChange={e => { setUrl(e.target.value); setSaved(false) }}
          placeholder="https://script.google.com/macros/s/…/exec" className="text-xs" />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="bg-navy hover:bg-navy/90 font-bold" onClick={() => {
          import('@/lib/fieldReports').then(m => m.setDriveWebhook(url))
          setSaved(true)
          toast({ title: '✅ Folder Drive tersimpan', description: url ? 'Foto akan otomatis di-upload.' : 'Auto-upload dimatikan (URL kosong).' })
        }}>Simpan</Button>
        {saved && <span className="text-xs text-emerald-600 font-semibold">Tersimpan ✓</span>}
      </div>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-navy">Cara mendapatkan URL (klik)</summary>
        <ol className="list-decimal pl-4 mt-2 space-y-1">
          <li>Buka <b>script.google.com</b> → New Project.</li>
          <li>Tempel kode Apps Script yang diberikan tim PropFS.</li>
          <li>Ganti ID folder Drive tujuan Anda.</li>
          <li>Deploy → New deployment → <b>Web app</b> → Execute as: Me, Who has access: <b>Anyone</b>.</li>
          <li>Salin URL <code>…/exec</code> → tempel di atas.</li>
        </ol>
      </details>
    </div>
  )
}
