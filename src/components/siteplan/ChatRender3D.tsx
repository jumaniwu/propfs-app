// ============================================================
// Kolom chat untuk merender 3D dari layout yang sedang dibuka.
//
// Sebelumnya render hanya bisa lewat kuesioner tetap dan daftar gaya yang
// sudah ditentukan. Yang ingin disampaikan orang biasanya kalimat biasa —
// "coba tropis, tampak depan, sore hari" — dan itu tidak muat di kuesioner.
//
// Gambar terakhir selalu dilampirkan sebagai ACUAN untuk permintaan
// berikutnya, supaya "yang tadi tapi malam hari" benar-benar menghasilkan
// bangunan yang sama, bukan kawasan baru yang kebetulan mirip.
// ============================================================
import { useRef, useState } from 'react'
import { Loader2, Send, Sparkles, Download, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { renderDariPrompt } from '@/lib/ai-cadrender'

interface Pesan {
  id: string
  peran: 'user' | 'ai'
  teks?: string
  gambar?: string
  judul?: string
  gagal?: boolean
}

const CONTOH = [
  'Modern minimalis, tampak depan, sore hari',
  'Tropis kontemporer dari drone',
  'Suasana malam dengan lampu taman',
  'Setinggi mata orang dari jalan utama',
]

export default function ChatRender3D({ ambilLayout, deskripsiLayout, namaProyek }: {
  /** Mengambil PNG layout yang sedang tampil. null = layout belum siap. */
  ambilLayout: () => string | null
  deskripsiLayout?: string
  namaProyek?: string
}) {
  const [pesan, setPesan] = useState<Pesan[]>([])
  const [teks, setTeks] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const akhirRef = useRef<HTMLDivElement>(null)

  /** Gambar terakhir yang berhasil — dipakai sebagai acuan permintaan berikutnya. */
  const acuan = [...pesan].reverse().find(p => p.gambar)?.gambar ?? null
  const riwayat = pesan.filter(p => p.peran === 'user' && p.teks).map(p => p.teks as string)

  async function kirim(isi?: string) {
    const permintaan = (isi ?? teks).trim()
    if (!permintaan || sibuk) return

    const layout = ambilLayout()
    if (!layout) {
      setPesan(p => [...p, {
        id: `e${Date.now()}`, peran: 'ai', gagal: true,
        teks: 'Layout belum siap. Buat atau buka desainnya dulu, baru minta render.',
      }])
      return
    }

    setTeks('')
    setPesan(p => [...p, { id: `u${Date.now()}`, peran: 'user', teks: permintaan }])
    setSibuk(true)
    try {
      const hasil = await renderDariPrompt(layout, permintaan, {
        deskripsiLayout, proyek: namaProyek, riwayat, acuanDataUrl: acuan,
      })
      setPesan(p => [...p, {
        id: `a${Date.now()}`, peran: 'ai', gambar: hasil.dataUrl, judul: hasil.judul,
      }])
    } catch (e) {
      setPesan(p => [...p, {
        id: `x${Date.now()}`, peran: 'ai', gagal: true,
        teks: e instanceof Error ? e.message : String(e),
      }])
    } finally {
      setSibuk(false)
      setTimeout(() => akhirRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function unduh(g: string, judul: string) {
    const a = document.createElement('a')
    a.href = g
    a.download = `render-${judul.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
    a.click()
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-gold" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy leading-tight">Render 3D</p>
          <p className="text-[11px] text-muted-foreground truncate">
            Tulis konsep yang Anda mau — tata letaknya tetap mengikuti layout
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[240px]">
        {pesan.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Contoh permintaan:</p>
            {CONTOH.map(c => (
              <button key={c} onClick={() => kirim(c)} disabled={sibuk}
                className="block w-full text-left text-xs bg-slate-50 hover:bg-slate-100 border border-border rounded-xl px-3 py-2 transition-colors">
                {c}
              </button>
            ))}
          </div>
        )}

        {pesan.map(p => p.peran === 'user' ? (
          <div key={p.id} className="flex justify-end">
            <p className="bg-navy text-white text-xs rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]">{p.teks}</p>
          </div>
        ) : p.gagal ? (
          <div key={p.id} className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{p.teks}</span>
          </div>
        ) : (
          <div key={p.id} className="space-y-1.5">
            <img src={p.gambar} alt={p.judul} className="w-full rounded-xl border border-border" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground truncate">{p.judul}</span>
              <button onClick={() => unduh(p.gambar!, p.judul ?? 'render')}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-navy hover:text-gold shrink-0">
                <Download className="w-3 h-3" /> Unduh
              </button>
            </div>
          </div>
        ))}

        {sibuk && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Merender… biasanya 10–30 detik.
          </div>
        )}
        <div ref={akhirRef} />
      </div>

      <div className="p-3 border-t border-border flex items-end gap-2">
        <textarea
          value={teks}
          onChange={e => setTeks(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void kirim() } }}
          placeholder="mis. tropis kontemporer, tampak depan, sore hari"
          className="flex-1 max-h-24 min-h-[40px] resize-none rounded-xl border border-border bg-muted/30 focus:bg-white text-xs px-3 py-2.5 outline-none focus:ring-2 focus:ring-navy/20"
        />
        <Button onClick={() => void kirim()} disabled={sibuk || !teks.trim()}
          className="h-10 w-10 p-0 rounded-xl bg-navy hover:bg-navy/90 shrink-0">
          {sibuk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}
