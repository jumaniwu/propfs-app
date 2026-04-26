import { useState, useRef, useEffect, useMemo } from 'react'
import {
  ReceiptIcon, Loader2, Paperclip, Send, Download, CheckCircle2,
  FileText, ImageIcon, X, TrendingDown, Wallet, BarChart3, RefreshCw,
  Package, Hammer, Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import { chatRealisasiWithGemini, RealisasiEntry, ChatMessage } from '@/lib/ai-realisasi'
import { useToast } from '@/hooks/use-toast'
import * as xlsx from 'xlsx'

// ── Category Colors ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  bangunan:      { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  infrastruktur: { bg: 'bg-blue-100',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  lahan:         { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500' },
  operasional:   { bg: 'bg-purple-100',  text: 'text-purple-800',  dot: 'bg-purple-500' },
  marketing:     { bg: 'bg-pink-100',    text: 'text-pink-800',    dot: 'bg-pink-500' },
  lainnya:       { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400' },
}

// ── Markdown Renderer ─────────────────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  const isTableLine = (l: string) => l.trim().startsWith('|')
  const rendered: JSX.Element[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isTableLine(line)) {
      const tableLines: string[] = []
      while (i < lines.length && (isTableLine(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim()) tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0].split('|').filter(c => c.trim())
        const rows = tableLines.slice(2).map(r => r.split('|').filter(c => c.trim()))
        rendered.push(
          <div key={`t${i}`} className="overflow-x-auto my-3 rounded-xl border border-border text-xs shadow-sm">
            <table className="w-full">
              <thead className="bg-navy/5 text-navy">
                <tr>{headers.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h.trim()}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {rows.map((row, j) => (
                  <tr key={j} className="hover:bg-muted/30">
                    {row.map((cell, k) => <td key={k} className="px-3 py-2 whitespace-nowrap">{cell.trim()}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    } else if (line.startsWith('### ')) {
      rendered.push(<h4 key={i} className="font-bold text-sm text-navy mt-3 mb-1">{line.slice(4)}</h4>)
      i++
    } else if (line.startsWith('## ')) {
      rendered.push(<h3 key={i} className="font-bold text-sm text-navy mt-3 mb-1">{line.slice(3)}</h3>)
      i++
    } else if (line.startsWith('**') && line.endsWith('**')) {
      rendered.push(<p key={i} className="font-bold text-sm">{line.slice(2, -2)}</p>)
      i++
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      rendered.push(<li key={i} className="ml-4 list-disc text-sm leading-relaxed">{line.slice(2)}</li>)
      i++
    } else {
      rendered.push(<p key={i} className={line.trim() === '' ? 'h-2' : 'text-sm leading-relaxed mb-0.5'}>{line}</p>)
      i++
    }
  }
  return <div className="leading-relaxed">{rendered}</div>
}

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
  const { activePlan, realisasiEntries, addRealisasiEntries, clearRealisasiEntries } = useCostStore()
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

  const fileToBase64 = (file: File) => new Promise<{ base64Data: string; preview?: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      resolve({ base64Data: result.split(',')[1], preview: file.type.startsWith('image/') ? result : undefined })
    }
    reader.onerror = reject
  })

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const results = await Promise.all(files.map(async f => {
      if (f.size > 8 * 1024 * 1024) { toast({ title: `${f.name} terlalu besar (maks 8MB)`, variant: 'destructive' }); return null }
      const { base64Data, preview } = await fileToBase64(f)
      return { name: f.name, mimeType: f.type, base64Data, preview }
    }))
    setPendingFiles(prev => [...prev, ...results.filter(Boolean) as any])
    e.target.value = ''
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
    setInputValue('')
    setPendingFiles([])
    setIsProcessing(true)
    setRetryInfo('Menghubungi AI...')

    try {
      const { textResponse, parsedEntries } = await chatRealisasiWithGemini(
        userMsg, messages, activePlan.components
      )
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: textResponse,
        newEntries: parsedEntries
      }
      setMessages(prev => [...prev, aiMsg])
      if (parsedEntries.length > 0) {
        addRealisasiEntries(parsedEntries)
        const matCount = parsedEntries.filter(e => e.tipe === 'material').length
        const upahCount = parsedEntries.filter(e => e.tipe === 'upah').length
        toast({
          title: `✅ ${parsedEntries.length} transaksi dicatat!`,
          description: `${matCount > 0 ? `${matCount} material` : ''}${matCount && upahCount ? ', ' : ''}${upahCount > 0 ? `${upahCount} upah` : ''} • Data tersimpan otomatis`
        })
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
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

  // ── Excel Export (2 sheet: Material + Upah) ──────────────────────────────
  const exportToExcel = () => {
    if (realisasiEntries.length === 0) return
    const wb = xlsx.utils.book_new()

    // Sheet 1: Ringkasan
    const grandTotal = realisasiEntries.reduce((s, e) => s + e.jumlah, 0)
    const totalMaterial = realisasiEntries.filter(e => e.tipe === 'material').reduce((s, e) => s + e.jumlah, 0)
    const totalUpah = realisasiEntries.filter(e => e.tipe === 'upah').reduce((s, e) => s + e.jumlah, 0)
    const sumData = [
      { 'Uraian': 'Total Pembelian Material', 'Jumlah (Rp)': totalMaterial },
      { 'Uraian': 'Total Upah Tukang/Pekerja', 'Jumlah (Rp)': totalUpah },
      { 'Uraian': 'Total Operasional & Lainnya', 'Jumlah (Rp)': grandTotal - totalMaterial - totalUpah },
      { 'Uraian': 'GRAND TOTAL PENGELUARAN', 'Jumlah (Rp)': grandTotal },
    ]
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(sumData), '📊 Ringkasan')

    // Sheet 2: Pembelian Material
    const matData = realisasiEntries
      .filter(e => e.tipe === 'material')
      .map(e => ({
        'Tanggal': e.tanggal,
        'Nama Material': e.namaMaterial || e.keterangan,
        'Volume': e.volume || '',
        'Satuan': e.satuan || '',
        'Harga Satuan (Rp)': e.hargaSatuan || '',
        'Supplier/Toko': e.namaSupplier || '-',
        'No. Nota': e.nomorNota || '-',
        'Kategori': e.kategori,
        'Total (Rp)': e.jumlah,
        'Metode Bayar': e.metodePembayaran || 'Cash',
        'Status': e.status,
        'Keterangan': e.keterangan,
      }))
    if (matData.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(matData), '📦 Pembelian Material')
    }

    // Sheet 3: Upah Tukang
    const upahData = realisasiEntries
      .filter(e => e.tipe === 'upah')
      .map(e => ({
        'Tanggal': e.tanggal,
        'Nama Tukang/Mandor': e.namaTukang || e.keterangan,
        'Jenis Pekerjaan': e.jenisKerja || '-',
        'Jumlah Orang': e.jumlahOrang || '',
        'Hari Kerja': e.hariKerja || '',
        'Upah/Orang/Hari (Rp)': e.upahHarian || '',
        'Total Upah (Rp)': e.jumlah,
        'Metode Bayar': e.metodePembayaran || 'Cash',
        'Status': e.status,
        'Keterangan': e.keterangan,
      }))
    if (upahData.length > 0) {
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(upahData), '👷 Upah Tukang')
    }

    // Sheet 4: Semua Transaksi
    const allData = realisasiEntries.map(e => ({
      'Tanggal': e.tanggal,
      'Tipe': e.tipe,
      'Keterangan': e.keterangan,
      'Kategori': e.kategori,
      'Total (Rp)': e.jumlah,
      'Status': e.status,
    }))
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(allData), '📋 Semua Transaksi')

    const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '')
    const projectName = activePlan?.projectId?.substring(0, 10) || 'Proyek'
    xlsx.writeFile(wb, `Laporan_Realisasi_${projectName}_${dateStr}.xlsx`)
    toast({ title: '✅ Laporan Excel berhasil diunduh!', description: '4 sheet: Ringkasan, Material, Upah Tukang, & Semua Transaksi.' })
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
    <div className="flex gap-5" style={{ height: '830px' }}>

      {/* ── KIRI: Chat ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col rounded-3xl overflow-hidden border border-border shadow-sm bg-white">
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
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5 bg-slate-50/60">
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
                      : <MarkdownText text={msg.text} />
                    }
                  </div>
                )}
                {/* Parsed entries mini summary */}
                {msg.newEntries && msg.newEntries.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 space-y-2">
                    <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {msg.newEntries.length} transaksi berhasil dicatat & disimpan
                    </p>
                    <div className="space-y-2">
                      {msg.newEntries.map(e => <EntryCard key={e.id} e={e} />)}
                    </div>
                  </div>
                )}
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
      <div className="w-80 flex flex-col gap-4">

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
        <div className="bg-white rounded-3xl border border-border flex-1 flex flex-col overflow-hidden">
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

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
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
