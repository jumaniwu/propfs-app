import { useState, useRef, useEffect, useMemo } from 'react'
import {
  ReceiptIcon, Loader2, Paperclip, Send, Download, CheckCircle2,
  FileText, ImageIcon, X, TrendingDown, Wallet, BarChart3, RefreshCw,
  Package, Hammer, Info, MessageSquare, LayoutDashboard, PackageCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import TeksChat from './TeksChat'
import {
  chatRealisasiWithGemini, RealisasiEntry, ChatMessage,
  type PemasukanUsul, type PembayaranUsul,
} from '@/lib/ai-realisasi'
import { useToast } from '@/hooks/use-toast'
import { buildReportSheet, reportXlsx } from '@/utils/excel'
import { getDriveWebhook, uploadToDrive } from '@/lib/fieldReports'
import { procurementApi } from '@/lib/procurementApi'
import { penerimaanApi } from '@/lib/penerimaanApi'
import PanelRencana from '@/components/cost/PanelRencana'
import { susunRencana, LABEL_MODUL, type Rencana } from '@/lib/rencanaCatat'
import { catatRencana, ringkasHasil, GagalSebagian } from '@/lib/catatRencana'
import { useAkuntanStore } from '@/store/akuntanStore'
import { totalDibayar } from '@/lib/penerimaan'
import type { PoPayment } from '@/lib/penerimaan'
import { nomorDo } from '@/lib/penerimaan'
import type { PurchaseOrder } from '@/lib/procurement'
import type { DeliveryOrder } from '@/lib/penerimaan'
import { kecilkanFoto, ukuranTampil } from '@/lib/kompresFoto'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

// ── Category Colors ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  bangunan:      { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  infrastruktur: { bg: 'bg-blue-100',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  lahan:         { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500' },
  operasional:   { bg: 'bg-purple-100',  text: 'text-purple-800',  dot: 'bg-purple-500' },
  marketing:     { bg: 'bg-pink-100',    text: 'text-pink-800',    dot: 'bg-pink-500' },
  lainnya:       { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400' },
}

// Penggambar markdown yang dulu di sini sudah pindah ke `TeksChat`, dipakai
// bersama halaman Chat AI. Dua salinan untuk satu pekerjaan membuat yang satu
// tertinggal: salinan di halaman Chat AI tidak pernah bisa menggambar tabel.

// ── Entry Detail Card (expanded view inside chat) ─────────────────────────────
function EntryCard({ e }: { e: RealisasiEntry }) {
  const isMaterial = e.tipe === 'material'
  const isUpah = e.tipe === 'upah'
  return (
    <div className="border border-border rounded-xl p-3 bg-white text-xs space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-navy">
          {isMaterial ? <Package className="w-3.5 h-3.5 text-emerald-600" /> : isUpah ? <Hammer className="w-3.5 h-3.5 text-amber-600" /> : <Info className="w-3.5 h-3.5 text-muted-foreground" />}
          <span>{e.keterangan}</span>
        </div>
        <span className="font-bold text-navy shrink-0">Rp {e.jumlah.toLocaleString('id-ID')}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <span>📅 {e.tanggal}</span>
        <span>{e.status}</span>
        {isMaterial && e.namaSupplier && <span>🏪 {e.namaSupplier}</span>}
        {isMaterial && e.nomorNota && <span>📋 Nota: {e.nomorNota}</span>}
        {isMaterial && e.volume && <span>📦 {e.volume} {e.satuan} @ Rp {e.hargaSatuan?.toLocaleString('id-ID')}</span>}
        {isUpah && e.namaTukang && <span>👷 {e.namaTukang}</span>}
        {isUpah && e.jumlahOrang && <span>👥 {e.jumlahOrang} org × {e.hariKerja} hari</span>}
        {e.metodePembayaran && <span>💳 {e.metodePembayaran}</span>}
      </div>
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const INITIAL_MSG: ChatMessage = {
  id: 'system-start',
  role: 'assistant',
  text: `Halo! Saya **AI Asisten Keuangan Proyek** 💼

Saya siap mencatat semua pengeluaran lapangan secara detail:

📦 **Pembelian Material** — nama material, volume, harga satuan, supplier, nomor nota
👷 **Upah Tukang/Pekerja** — nama pekerja, jenis kerja, jumlah orang, hari kerja, upah/hari

Cara kirim:
* Ketik langsung: *"Beli bata 2000 pcs @ Rp1.750 dari Toko Maju nota #B01"*
* Upah: *"Upah cor beton 4 tukang 2 hari @ Rp150rb/hari"*
* Upload foto nota / invoice / kuitansi (bisa banyak sekaligus)

Saya juga bisa mengubah format laporan sesuai permintaan Anda. ✨`
}

export default function TabRealisasiBiaya() {
  const { activePlan, projectInfo, realisasiEntries, addRealisasiEntries, updateRealisasiEntry, deleteRealisasiEntry, clearRealisasiEntries } = useCostStore()
  const { toast } = useToast()

  const storageKey = `propfs-chat-${activePlan?.projectId ?? 'default'}`

  const loadMessages = (): ChatMessage[] => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return [INITIAL_MSG]
  }

  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [inputValue, setInputValue] = useState('')
  const [pendingFiles, setPendingFiles] = useState<Array<{
    name: string; mimeType: string; base64Data: string; preview?: string
  }>>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [retryInfo, setRetryInfo] = useState('')
  const [activeTab, setActiveTab] = useState<'semua' | 'material' | 'upah'>('semua')
  const [mobileView, setMobileView] = useState<'chat' | 'dashboard'>('chat')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isProcessing])

  // Persist chat ke sessionStorage (tanpa base64 agar tidak membengkak)
  useEffect(() => {
    const cleaned = messages.map(m => ({
      ...m,
      files: m.files?.map(f => ({ name: f.name, mimeType: f.mimeType, base64Data: '' }))
    }))
    try { sessionStorage.setItem(storageKey, JSON.stringify(cleaned)) } catch { /* ignore */ }
  }, [messages, storageKey])

  // Lihat catatan yang sama di ChatAiPage: foto dikecilkan sebelum dikirim.
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const results = await Promise.all(files.map(async f => {
      if (f.size > 25 * 1024 * 1024) { toast({ title: `${f.name} terlalu besar (maks 25MB)`, variant: 'destructive' }); return null }
      const { base64Data, mimeType, byteAsal, byteAkhir } = await kecilkanFoto(f)
      if (byteAkhir < byteAsal * 0.7) {
        console.log(`[lampiran] ${f.name}: ${ukuranTampil(byteAsal)} → ${ukuranTampil(byteAkhir)}`)
      }
      return { name: f.name, mimeType, base64Data, preview: `data:${mimeType};base64,${base64Data}` }
    }))
    setPendingFiles(prev => [...prev, ...results.filter(Boolean) as any])
    e.target.value = ''
  }

  // ── Jembatan ke Procurement ─────────────────────────────────────────────
  // Nota yang dibaca AI di sini sering merupakan nota barang yang baru datang
  // dari sebuah PO. Daripada mengetik ulang di Procurement, PO-nya dicarikan
  // dan penerimaannya ditawarkan langsung di sini.
  const [posPo, setPosPo] = useState<PurchaseOrder[]>([])
  const [dosDo, setDosDo] = useState<DeliveryOrder[]>([])
  const [bayarPo, setBayarPo] = useState<PoPayment[]>([])
  /** Daftar periksa lintas modul dari masukan terakhir, menunggu persetujuan. */
  const [rencana, setRencana] = useState<Rencana | null>(null)
  /** Pilihan pemakai: PO mana untuk penerimaan, PO mana untuk tiap pembayaran. */
  const [pilihPo, setPilihPo] = useState(0)
  const [pilihBayar, setPilihBayar] = useState<number[]>([])
  const [menyimpan, setMenyimpan] = useState(false)
  const addPemasukan = useAkuntanStore(s => s.addPemasukan)

  const muatProcurement = async () => {
    const [p, d, b] = await Promise.all([
      procurementApi().listPo().catch(() => [] as PurchaseOrder[]),
      penerimaanApi().listDo().catch(() => [] as DeliveryOrder[]),
      penerimaanApi().listBayar().catch(() => [] as PoPayment[]),
    ])
    setPosPo(p); setDosDo(d); setBayarPo(b)
    return { p, d, b }
  }
  useEffect(() => { void muatProcurement() }, [])

  /** Susun daftar periksa: modul apa saja yang tersentuh oleh masukan ini. */
  const susun = (
    hasil: { added: RealisasiEntry[]; pemasukan?: PemasukanUsul[]; pembayaran?: PembayaranUsul[] },
    pos: PurchaseOrder[], dos: DeliveryOrder[], bayar: PoPayment[],
  ) => {
    const r = susunRencana(hasil, {
      pos, dos, sudahDibayar: (id: string) => totalDibayar(id, bayar),
    })
    if (!r.perluKonfirmasi) return
    setRencana(r)
    setPilihPo(0)
    setPilihBayar(r.pembayaran.map(() => 0))
  }

  /**
   * Jalankan semua langkah yang masih menunggu, dalam satu persetujuan.
   * Urutan & penanganan kegagalannya ada di `catatRencana` — dipakai bersama
   * halaman Chat AI supaya keduanya tidak pernah berbeda perilaku.
   */
  const catatSemua = async () => {
    if (!rencana) return
    setMenyimpan(true)
    try {
      const hasil = await catatRencana(rencana, { po: pilihPo, bayar: pilihBayar }, {
        simpanPemasukan: p => addPemasukan({
          tanggal: p.tanggal, sumber: p.sumber,
          kategori: p.kategori as PemasukanUsul['kategori'],
          jumlah: p.jumlah, keterangan: p.keterangan,
          projectId: projectInfo?.id,
        }),
        nomorDo: () => nomorDo(dosDo.length),
        simpanDo: d => penerimaanApi().createDo(d as never),
        tandaiEntri: (id, doId) => updateRealisasiEntry(id, { doId }),
        simpanBayar: b => penerimaanApi().createBayar(b as never),
      })
      await muatProcurement()
      setRencana(null)
      toast({ title: '✅ Tercatat di semua modul', description: ringkasHasil(hasil) })
    } catch (e) {
      const sudah = e instanceof GagalSebagian && e.selesai.length > 0
        ? ` Yang sudah tersimpan: ${e.selesai.join(', ')}.` : ''
      toast({
        title: 'Sebagian gagal disimpan',
        description: (e instanceof Error ? e.message : String(e)) + sudah,
        variant: 'destructive',
      })
    } finally { setMenyimpan(false) }
  }

  const handleSend = async () => {
    if ((!inputValue.trim() && pendingFiles.length === 0) || !activePlan) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue.trim(),
      files: pendingFiles.map(f => ({ name: f.name, mimeType: f.mimeType, base64Data: f.base64Data }))
    }
    setMessages(prev => [...prev, userMsg])
    // Auto-upload foto ke Google Drive (fire-and-forget, tidak memblok AI)
    const driveUrl = getDriveWebhook()
    if (driveUrl) {
      pendingFiles.forEach(f => {
        if (f.mimeType.startsWith('image/')) {
          void uploadToDrive(driveUrl, {
            name: `${new Date().toISOString().slice(0, 10)}_${f.name}`,
            mimeType: f.mimeType, base64Data: f.base64Data,
            folder: activePlan?.projectId || 'Realisasi',
          })
        }
      })
    }
    setInputValue('')
    setPendingFiles([])
    setIsProcessing(true)
    setRetryInfo('Menghubungi AI...')

    try {
      const { textResponse, parsedResult } = await chatRealisasiWithGemini(
        userMsg, messages, activePlan.components, realisasiEntries
      )
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: textResponse,
        newEntries: parsedResult.added,
        updatedEntries: parsedResult.updated,
        deletedEntryIds: parsedResult.deleted
      }
      setMessages(prev => [...prev, aiMsg])
      
      let changeCount = 0
      if (parsedResult.added.length > 0) {
        addRealisasiEntries(parsedResult.added)
        changeCount += parsedResult.added.length
      }
      // Daftar periksa lintas modul disusun untuk SETIAP masukan, bukan hanya
      // yang berisi biaya: satu bukti transfer tidak menambah biaya sama sekali
      // tetapi tetap harus sampai ke Hutang Vendor. PO/DO disegarkan dulu
      // karena barangnya bisa saja sudah dicatat dari perangkat lain.
      void muatProcurement()
        .then(({ p, d, b }) => susun(parsedResult, p, d, b))
        .catch(() => { /* daftar periksa ini pelengkap, bukan syarat pencatatan biaya */ })
      if (parsedResult.updated.length > 0) {
        parsedResult.updated.forEach(u => updateRealisasiEntry(u.id, u.data))
        changeCount += parsedResult.updated.length
      }
      if (parsedResult.deleted.length > 0) {
        parsedResult.deleted.forEach(id => deleteRealisasiEntry(id))
        changeCount += parsedResult.deleted.length
      }

      if (changeCount > 0) {
        toast({
          title: `✅ ${changeCount} perubahan dicatat!`,
          description: `${parsedResult.added.length} baru, ${parsedResult.updated.length} direvisi, ${parsedResult.deleted.length} dihapus`
        })
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        galat: true,
        text: `⚠️ ${err.message}`
      }])
    } finally {
      setIsProcessing(false)
      setRetryInfo('')
    }
  }

  const handleReset = () => {
    if (window.confirm('Hapus semua data pengeluaran & riwayat chat untuk project ini?')) {
      clearRealisasiEntries()
      setMessages([INITIAL_MSG])
      sessionStorage.removeItem(storageKey)
    }
  }

  // ── Excel Export: laporan rapi (judul, tabel berformat, baris TOTAL/SUM) ──
  const exportToExcel = () => {
    if (realisasiEntries.length === 0) return
    const wb = reportXlsx.utils.book_new()
    // nama proyek diambil dari judul proyek, bukan kode ID
    const projectName = projectInfo?.projectName?.trim()
      || activePlan?.projectId?.substring(0, 10) || 'Proyek'
    const printed = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    const dates = realisasiEntries.map(e => e.tanggal).filter(Boolean).sort()
    const periode = dates.length ? `Periode: ${dates[0]} s.d. ${dates[dates.length - 1]} · ` : ''
    const subtitle = `Proyek: ${projectName} · ${periode}Dicetak: ${printed} · ${realisasiEntries.length} transaksi`

    // Sheet 1: Ringkasan
    const grandTotal = realisasiEntries.reduce((s, e) => s + e.jumlah, 0)
    const totalMaterial = realisasiEntries.filter(e => e.tipe === 'material').reduce((s, e) => s + e.jumlah, 0)
    const totalUpah = realisasiEntries.filter(e => e.tipe === 'upah').reduce((s, e) => s + e.jumlah, 0)
    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'LAPORAN REALISASI BIAYA PROYEK — RINGKASAN',
      subtitle,
      headers: ['Uraian', 'Jumlah Transaksi', 'Jumlah (Rp)'],
      rows: [
        ['Pembelian Material', realisasiEntries.filter(e => e.tipe === 'material').length, totalMaterial],
        ['Upah Tukang/Pekerja', realisasiEntries.filter(e => e.tipe === 'upah').length, totalUpah],
        ['Operasional & Lainnya', realisasiEntries.filter(e => e.tipe !== 'material' && e.tipe !== 'upah').length, grandTotal - totalMaterial - totalUpah],
      ],
      sumCols: [1, 2],
    }), 'Ringkasan')

    // Sheet 2: Rekap per Kategori (gaya laporan akuntan)
    const kategoriList = [...new Set(realisasiEntries.map(e => e.kategori || 'lainnya'))]
    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'REKAPITULASI PENGELUARAN PER KATEGORI',
      subtitle,
      headers: ['No', 'Kategori', 'Jumlah Transaksi', 'Total (Rp)', '% dari Total'],
      rows: kategoriList.map((k, i) => {
        const items = realisasiEntries.filter(e => (e.kategori || 'lainnya') === k)
        const tot = items.reduce((s, e) => s + e.jumlah, 0)
        return [i + 1, k.toUpperCase(), items.length, tot,
          grandTotal > 0 ? `${((tot / grandTotal) * 100).toFixed(1)}%` : '0%']
      }),
      sumCols: [2, 3],
    }), 'Rekap Kategori')

    // Sheet 2: Pembelian Material
    const mat = realisasiEntries.filter(e => e.tipe === 'material')
    if (mat.length > 0) {
      reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
        title: 'LAPORAN PEMBELIAN MATERIAL',
        subtitle,
        headers: ['No', 'Tanggal', 'Nama Material', 'Volume', 'Satuan', 'Harga Satuan (Rp)',
          'Total (Rp)', 'Supplier/Toko', 'No. Nota', 'Kategori', 'Metode Bayar', 'Status', 'Keterangan'],
        rows: mat.map((e, i) => [
          i + 1, e.tanggal, e.namaMaterial || e.keterangan, e.volume ?? '', e.satuan ?? '',
          e.hargaSatuan ?? '', e.jumlah, e.namaSupplier || '-', e.nomorNota || '-',
          e.kategori, e.metodePembayaran || 'Cash', e.status, e.keterangan,
        ]),
        sumCols: [6],
      }), 'Pembelian Material')
    }

    // Sheet 3: Upah Tukang
    const upah = realisasiEntries.filter(e => e.tipe === 'upah')
    if (upah.length > 0) {
      reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
        title: 'LAPORAN UPAH TUKANG / PEKERJA',
        subtitle,
        headers: ['No', 'Tanggal', 'Nama Tukang/Mandor', 'Jenis Pekerjaan', 'Jumlah Orang',
          'Hari Kerja', 'Upah/Orang/Hari (Rp)', 'Total Upah (Rp)', 'Metode Bayar', 'Status', 'Keterangan'],
        rows: upah.map((e, i) => [
          i + 1, e.tanggal, e.namaTukang || e.keterangan, e.jenisKerja || '-', e.jumlahOrang ?? '',
          e.hariKerja ?? '', e.upahHarian ?? '', e.jumlah, e.metodePembayaran || 'Cash', e.status, e.keterangan,
        ]),
        sumCols: [7],
      }), 'Upah Tukang')
    }

    // Sheet 4: Semua Transaksi
    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'DAFTAR SEMUA TRANSAKSI',
      subtitle,
      headers: ['No', 'Tanggal', 'Tipe', 'Keterangan', 'Kategori', 'Total (Rp)', 'Status'],
      rows: realisasiEntries.map((e, i) => [
        i + 1, e.tanggal, e.tipe, e.keterangan, e.kategori, e.jumlah, e.status,
      ]),
      sumCols: [5],
    }), 'Semua Transaksi')

    const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '')
    const safeName = projectName.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'Proyek'
    reportXlsx.writeFile(wb, `Laporan_Realisasi_${safeName}_${dateStr}.xlsx`)
    toast({ title: '✅ Laporan Excel berhasil diunduh!', description: 'Format laporan rapi: judul, tabel berformat, dan baris TOTAL (SUM) di tiap sheet.' })
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const entries = realisasiEntries
  const filteredEntries = useMemo(() => {
    if (activeTab === 'material') return entries.filter(e => e.tipe === 'material')
    if (activeTab === 'upah') return entries.filter(e => e.tipe === 'upah')
    return entries
  }, [entries, activeTab])

  const grandTotal = useMemo(() => entries.reduce((s, e) => s + e.jumlah, 0), [entries])
  const totalMaterial = useMemo(() => entries.filter(e => e.tipe === 'material').reduce((s, e) => s + e.jumlah, 0), [entries])
  const totalUpah = useMemo(() => entries.filter(e => e.tipe === 'upah').reduce((s, e) => s + e.jumlah, 0), [entries])

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:min-h-[600px] lg:max-h-[90vh]">

      {/* ── Mobile Toggle ── */}
      <div className="flex lg:hidden gap-2 mb-1">
        <button
          onClick={() => setMobileView('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all ${
            mobileView === 'chat' ? 'bg-navy text-white shadow-lg' : 'bg-muted text-muted-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Chat AI
        </button>
        <button
          onClick={() => setMobileView('dashboard')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all ${
            mobileView === 'dashboard' ? 'bg-navy text-white shadow-lg' : 'bg-muted text-muted-foreground'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Dashboard
          {entries.length > 0 && (
            <span className="bg-gold text-navy text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">{entries.length}</span>
          )}
        </button>
      </div>

      {/* ── KIRI: Chat ─────────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col rounded-3xl overflow-hidden border border-border shadow-sm bg-white min-h-0 h-[75vh] lg:h-auto lg:min-h-[500px] ${mobileView !== 'chat' ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
              <ReceiptIcon className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-navy">AI Cost Assistant</h3>
              <p className="text-[10px] text-muted-foreground">Material & Upah · Gemini 2.5 Flash · Data tersimpan otomatis</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1.5" onClick={handleReset}>
            <RefreshCw className="w-3 h-3" /> Reset
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 space-y-5 bg-slate-50/60">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <ReceiptIcon className="w-3.5 h-3.5 text-indigo-600" />
                </div>
              )}
              <div className="max-w-[82%] flex flex-col gap-2">
                {/* File attachments */}
                {msg.files && msg.files.length > 0 && (
                  <div className="flex gap-2 flex-wrap justify-end">
                    {msg.files.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1.5 bg-navy/10 text-navy rounded-xl px-3 py-2 text-xs font-medium">
                        {f.mimeType.includes('pdf') ? <FileText className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                        <span className="truncate max-w-[120px]">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Text bubble */}
                {msg.text && (
                  <div className={`rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                    ? 'bg-navy text-white rounded-tr-sm'
                    : 'bg-white border border-border rounded-tl-sm'}`}>
                    {msg.role === 'user'
                      ? <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      : <TeksChat text={msg.text} />
                    }
                  </div>
                )}
                {/* Parsed entries mini summary */}
                {(msg.newEntries?.length || msg.updatedEntries?.length || msg.deletedEntryIds?.length) ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 space-y-2">
                    <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Data berhasil diupdate: {(msg.newEntries?.length || 0) + (msg.updatedEntries?.length || 0) + (msg.deletedEntryIds?.length || 0)} transaksi
                    </p>
                    <div className="space-y-2">
                      {msg.newEntries?.map(e => <EntryCard key={e.id} e={e} />)}
                      {msg.updatedEntries?.map(u => (
                        <div key={u.id} className="text-xs text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
                          🔄 Revisi transaksi ID: {u.id}
                        </div>
                      ))}
                      {msg.deletedEntryIds?.map(id => (
                        <div key={id} className="text-xs text-red-700 bg-red-50 p-2 rounded-xl border border-red-200">
                          🗑️ Dihapus transaksi ID: {id}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
              </div>
              <div className="bg-white border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                <span className="text-xs text-muted-foreground animate-pulse">{retryInfo || 'AI sedang menganalisa...'}</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Daftar periksa lintas modul — komponen yang sama dipakai halaman Chat AI. */}
        {rencana && (
          <PanelRencana
            rencana={rencana}
            pilihPo={pilihPo} onPilihPo={setPilihPo}
            pilihBayar={pilihBayar}
            onPilihBayar={(i, j) => setPilihBayar(v => v.map((x, k) => k === i ? j : x))}
            menyimpan={menyimpan}
            onCatat={catatSemua}
            onLewati={() => setRencana(null)}
          />
        )}

        {/* Input */}
        <div className="bg-white border-t border-border p-4">
          {pendingFiles.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {pendingFiles.map((f, i) => (
                <div key={i} className="relative group">
                  {f.preview
                    ? <img src={f.preview} className="w-14 h-14 object-cover rounded-xl border" alt="" />
                    : <div className="w-14 h-14 rounded-xl border bg-muted flex flex-col items-center justify-center gap-1">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[8px] text-muted-foreground truncate w-12 text-center">{f.name}</span>
                      </div>
                  }
                  <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-muted-foreground hover:text-navy hover:bg-muted rounded-xl transition-colors shrink-0"
              title="Upload nota / invoice / foto (bisa multiple)">
              <Paperclip className="w-5 h-5" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" multiple
              accept=".jpg,.jpeg,.png,.pdf,.webp" onChange={handleFilePick} />
            <textarea
              className="flex-1 max-h-28 min-h-[44px] resize-none rounded-2xl border border-border bg-muted/30 focus:bg-white text-sm px-4 py-3 outline-none focus:ring-2 focus:ring-navy/20 transition-all"
              placeholder='Ketik pengeluaran... contoh: "Beli semen 20 sak @58rb Toko Maju" atau "Upah 4 tukang 2 hari @150rb"'
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            />
            <Button onClick={handleSend}
              disabled={isProcessing || (!inputValue.trim() && pendingFiles.length === 0)}
              className="h-[44px] w-[44px] rounded-2xl bg-navy hover:bg-navy/90 p-0 shrink-0">
              <Send className="w-4 h-4 ml-0.5" />
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-2">
            ✨ AI mencatat material + upah secara detail · Data tersimpan otomatis · Fallback 4 tier
          </p>
        </div>
      </div>

      {/* ── KANAN: Dashboard ─────────────────────────────────────────────── */}
      <div className={`w-full lg:w-80 flex flex-col gap-4 lg:min-h-0 ${mobileView !== 'dashboard' ? 'hidden lg:flex' : 'flex'}`}>

        {/* KPI Cards */}
        <div className="bg-navy rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Total Pengeluaran</p>
            <Wallet className="w-4 h-4 text-white/50" />
          </div>
          <p className="text-2xl font-bold mb-3">Rp {(grandTotal / 1_000_000).toFixed(2)} Jt</p>
          {/* Mini KPI: Material vs Upah */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Package className="w-3 h-3 text-emerald-300" />
                <span className="text-white/60 text-[10px] uppercase font-semibold">Material</span>
              </div>
              <p className="text-base font-bold">Rp {(totalMaterial / 1_000_000).toFixed(1)}Jt</p>
              <p className="text-white/50 text-[10px]">{entries.filter(e => e.tipe === 'material').length} transaksi</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Hammer className="w-3 h-3 text-amber-300" />
                <span className="text-white/60 text-[10px] uppercase font-semibold">Upah</span>
              </div>
              <p className="text-base font-bold">Rp {(totalUpah / 1_000_000).toFixed(1)}Jt</p>
              <p className="text-white/50 text-[10px]">{entries.filter(e => e.tipe === 'upah').length} transaksi</p>
            </div>
          </div>
          {activePlan && activePlan.totalBaselineBudget > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>vs Anggaran RAB</span>
                <span>{((grandTotal / activePlan.totalBaselineBudget) * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div className="bg-emerald-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min((grandTotal / activePlan.totalBaselineBudget) * 100, 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Tabs + Transaction list */}
        <div className="bg-white rounded-3xl border border-border flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-navy" />
              <h4 className="font-bold text-sm text-navy">Buku Pengeluaran</h4>
            </div>
            <Button size="sm" variant="outline" onClick={exportToExcel} disabled={entries.length === 0}
              className="h-7 text-[10px] gap-1 font-bold text-navy border-navy/20 hover:bg-navy hover:text-white transition-colors">
              <Download className="w-3 h-3" /> Excel
            </Button>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 px-4 pb-3">
            {(['semua', 'material', 'upah'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === tab ? 'bg-navy text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {tab === 'semua' ? `Semua (${entries.length})` : tab === 'material' ? `📦 Material (${entries.filter(e => e.tipe === 'material').length})` : `👷 Upah (${entries.filter(e => e.tipe === 'upah').length})`}
              </button>
            ))}
          </div>

          {/* Scroll internal di dalam kartu (mobile dibatasi 60vh, desktop ikut flex) */}
          <div className="px-4 pb-4 space-y-2 overflow-y-auto overscroll-contain max-h-[60vh] lg:max-h-none lg:flex-1 lg:min-h-0">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center opacity-40">
                <TrendingDown className="w-10 h-10 mb-2" />
                <p className="text-xs text-muted-foreground">Belum ada data {activeTab !== 'semua' ? activeTab : ''}.<br />Chat dengan AI di sebelah kiri.</p>
              </div>
            ) : (
              [...filteredEntries].reverse().map(e => {
                const col = CAT_COLORS[e.kategori] || CAT_COLORS.lainnya
                const isMat = e.tipe === 'material'
                const isUpah = e.tipe === 'upah'
                return (
                  <div key={e.id} className="border border-border rounded-xl p-3 bg-white hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isMat ? <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : isUpah ? <Hammer className="w-3.5 h-3.5 text-amber-600 shrink-0" /> : <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <p className="text-xs font-semibold text-navy truncate">{e.keterangan}</p>
                      </div>
                      <span className="text-xs font-bold text-navy shrink-0">Rp {e.jumlah.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>📅 {e.tanggal}</span>
                      {isMat && e.namaSupplier && <span>🏪 {e.namaSupplier}</span>}
                      {isMat && e.volume && <span>📦 {e.volume} {e.satuan}</span>}
                      {isMat && e.nomorNota && <span>📋 {e.nomorNota}</span>}
                      {isUpah && e.namaTukang && <span>👷 {e.namaTukang}</span>}
                      {isUpah && e.jumlahOrang && <span>👥 {e.jumlahOrang} org</span>}
                      <span className={`px-1.5 py-0.5 rounded-full font-bold uppercase ${col.bg} ${col.text}`}>{e.kategori}</span>
                      <span>{e.status}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
