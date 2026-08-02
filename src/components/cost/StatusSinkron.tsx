// ============================================================
// Status sinkronisasi proyek — apakah yang ada di HP juga ada di server.
//
// Sampai sekarang kegagalan sinkron hanya masuk console.warn. Pemakainya tidak
// punya cara apa pun untuk tahu bahwa proyek yang ia kerjakan seharian ternyata
// tidak pernah sampai ke server — dan baru menyadarinya ketika membuka laptop
// dan proyeknya tidak ada.
//
// Panel ini menjawab satu pertanyaan itu saja, dengan angka: berapa proyek di
// perangkat ini, berapa di server. Bila ada yang belum naik, warnanya berubah
// dan tombolnya jelas. Bila semuanya aman, ia menyusut jadi satu baris kecil —
// peringatan yang selalu menyala akan berhenti dibaca orang.
// ============================================================
import { useEffect, useState } from 'react'
import { CloudOff, Cloud, Loader2, RefreshCw } from 'lucide-react'
import { useCostStore } from '@/store/costStore'
import { useToast } from '@/hooks/use-toast'

interface Hasil { ok: boolean; lokal: number; cloud: number; gagal?: number }

export default function StatusSinkron() {
  const sinkronCloud = useCostStore(s => s.sinkronCloud)
  const savedProjects = useCostStore(s => s.savedProjects)
  const { toast } = useToast()
  const [hasil, setHasil] = useState<Hasil | null>(null)
  const [jalan, setJalan] = useState(false)

  // Diperiksa sekali saat halaman terbuka. Tidak diulang otomatis: yang
  // dijawab panel ini keadaan, bukan denyut.
  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const h = await sinkronCloud()
        if (!batal) setHasil(h)
      } catch { /* penanda gagal sudah ditangani store */ }
    })()
    return () => { batal = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function sinkronSekarang() {
    setJalan(true)
    try {
      const h = await sinkronCloud(true)
      setHasil(h)
      toast(h.ok
        ? { title: '✅ Semua proyek tersimpan di server', description: `${h.lokal} proyek aman dibuka dari perangkat lain.` }
        : {
            title: 'Sebagian belum tersimpan',
            description: h.gagal
              ? `${h.gagal} proyek gagal naik. Periksa koneksi lalu coba lagi.`
              : 'Sesi belum siap. Muat ulang halaman lalu coba lagi.',
            variant: 'destructive',
          })
    } finally { setJalan(false) }
  }

  const belumNaik = hasil ? Math.max(0, hasil.lokal - hasil.cloud) : 0
  const bahaya = !!hasil && (!hasil.ok || belumNaik > 0)

  // Belum ada proyek sama sekali: tidak ada yang perlu dikhawatirkan.
  if (savedProjects.length === 0 && !bahaya) return null

  if (!hasil) {
    return (
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Memeriksa penyimpanan server…
      </p>
    )
  }

  if (!bahaya) {
    return (
      <div data-sinkron="aman" className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
          <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">{hasil.cloud} proyek tersimpan di server</span>
        </p>
        <button onClick={() => void sinkronSekarang()} disabled={jalan}
          className="text-[11px] font-bold text-muted-foreground hover:text-navy flex items-center gap-1 shrink-0 disabled:opacity-50">
          {jalan ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Sinkronkan
        </button>
      </div>
    )
  }

  return (
    <div data-sinkron="bahaya" className="rounded-2xl bg-amber-50 border border-amber-300 p-3.5 space-y-2">
      <div className="flex items-start gap-2.5">
        <CloudOff className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-navy">
            {belumNaik > 0
              ? `${belumNaik} proyek belum tersimpan di server`
              : 'Penyimpanan ke server sedang gagal'}
          </p>
          <p className="text-[11px] text-amber-900/80 leading-relaxed mt-0.5">
            {belumNaik > 0
              ? 'Proyek ini baru ada di perangkat ini. Kalau HP hilang atau riwayat peramban dibersihkan, datanya ikut hilang — dan tidak akan muncul saat dibuka dari laptop.'
              : 'Perubahan terbaru mungkin belum sampai ke server. Periksa koneksi lalu coba lagi.'}
          </p>
          <p className="text-[10px] text-amber-900/60 mt-1 tabular-nums">
            Di perangkat ini {hasil.lokal} · di server {hasil.cloud}
          </p>
        </div>
      </div>
      <button onClick={() => void sinkronSekarang()} disabled={jalan}
        className="w-full h-10 rounded-xl bg-navy text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        {jalan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Sinkronkan Sekarang
      </button>
    </div>
  )
}
