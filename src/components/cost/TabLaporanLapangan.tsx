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
  Image as ImageIcon, ExternalLink, Users, ListChecks,
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

  const load = () => {
    setLoading(true); setError('')
    fieldApi().listLogs()
      .then(setLogs)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
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


  /** Satu kartu buku laporan. `lain` = milik proyek selain yang dibuka. */
  function kartuBuku(log: FieldLog, lain: boolean) {
    return (
            <div key={log.id} className="bg-white rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy text-sm truncate">🏗️ {log.project_name || 'Proyek'}</p>
                  {/* Buku milik proyek lain tetap ditampilkan dan tetap bisa
                      dipakai; yang ditambahkan hanya penandanya, supaya link
                      pekerjanya tidak salah dibagikan. Laporan yang dikirim
                      lewat link sebuah buku masuk ke proyek buku itu. */}
                  {lain && (
                    <p className="text-[10px] font-bold text-amber-700">Proyek lain</p>
                  )}
                </div>
                <button onClick={async () => { if (window.confirm('Hapus buku laporan ini?')) { await fieldApi().deleteLog(log.id); load() } }}
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
            <PanelRekapAbsensi laporan={reports} pekerja={pekerja} namaProyek={openLog.project_name} />
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
