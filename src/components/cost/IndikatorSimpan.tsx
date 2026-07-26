// ============================================================
// Indikator simpan otomatis — pengganti tombol "Simpan Data".
// Tombol lama tidak menyimpan apa pun (hanya memunculkan notifikasi);
// penyimpanan sebenarnya sudah berjalan otomatis di costStore & akuntanStore.
// Komponen ini menampilkan keadaan yang sebenarnya, termasuk bila gagal.
// ============================================================
import { Check, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { useSyncStatus, jamSingkat } from '@/lib/syncStatus'

export default function IndikatorSimpan({ terang = false }: {
  /** true bila diletakkan di atas latar navy (header). */
  terang?: boolean
}) {
  const { status, terakhir, pesan } = useSyncStatus()
  const jam = jamSingkat(terakhir)

  const dasar = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold whitespace-nowrap'

  if (status === 'gagal') {
    return (
      <button
        onClick={() => window.location.reload()}
        title={`Gagal menyimpan ke server: ${pesan}. Data masih tersimpan di perangkat ini. Ketuk untuk memuat ulang.`}
        className={`${dasar} bg-rose-500 text-white hover:bg-rose-600`}>
        <CloudOff className="w-3.5 h-3.5" />
        Gagal menyimpan
        <RefreshCw className="w-3 h-3 opacity-80" />
      </button>
    )
  }

  if (status === 'menyimpan') {
    return (
      <span className={`${dasar} ${terang ? 'bg-white/10 text-white/90' : 'bg-slate-100 text-muted-foreground'}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Menyimpan…
      </span>
    )
  }

  return (
    <span
      title={jam ? `Perubahan terakhir tersimpan pukul ${jam}` : 'Semua perubahan tersimpan otomatis'}
      className={`${dasar} ${terang ? 'bg-white/10 text-white/80' : 'bg-emerald-50 text-emerald-700'}`}>
      <Check className="w-3.5 h-3.5" />
      {jam ? `Tersimpan ${jam}` : 'Tersimpan otomatis'}
    </span>
  )
}
