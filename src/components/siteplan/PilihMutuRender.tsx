/**
 * Pilihan mutu render, berikut HARGANYA — ditampilkan sebelum tombolnya
 * ditekan, bukan sesudah tagihannya datang.
 *
 * Dipakai bersama oleh Render Masterplan dan Render dari CAD/PDF. Keduanya
 * memanggil model yang sama dan punya jebakan yang sama: satu ketukan
 * menghasilkan beberapa gambar berbayar, dan selisih antar model bukan
 * berpersen melainkan berlipat.
 *
 * Keputusan dan angkanya ada di lib/mutuGambar.ts supaya bisa diuji tanpa DOM;
 * berkas ini hanya menampilkannya.
 */
import { Info } from 'lucide-react'
import { pilihanMutu, kalimatKonfirmasi, rupiah, type MutuGambar } from '@/lib/mutuGambar'

interface Props {
  mutu: MutuGambar
  onPilih: (m: MutuGambar) => void
  /** Berapa gambar berbayar yang akan dihasilkan satu ketukan. */
  jumlahGambar: number
  nonaktif?: boolean
}

export default function PilihMutuRender({ mutu, onPilih, jumlahGambar, nonaktif }: Props) {
  const pilihan = pilihanMutu(jumlahGambar)

  return (
    <div className="space-y-2" data-uji="pilih-mutu">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-navy">Mutu Render</span>
        <span className="text-[10px] text-muted-foreground">
          {jumlahGambar} gambar berbayar
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {pilihan.map(p => {
          const aktif = p.mutu === mutu
          return (
            <button
              key={p.mutu}
              type="button"
              disabled={nonaktif}
              aria-pressed={aktif}
              data-uji={`mutu-${p.mutu}`}
              onClick={() => onPilih(p.mutu)}
              className={`rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50 ${
                aktif ? 'border-navy bg-navy/5 ring-1 ring-navy' : 'border-border hover:border-navy'
              }`}
            >
              <span className="block text-xs font-bold text-navy">{p.label}</span>
              {/* Harga ditulis sebesar labelnya, bukan sebagai catatan kaki:
                  angka yang harus dicari dulu bukan angka yang dipakai
                  memutuskan. */}
              <span className="block text-sm font-bold tabular-nums text-navy mt-0.5">
                {rupiah(p.biaya.idr)}
              </span>
              <span className="block text-[10px] leading-tight text-muted-foreground mt-1">
                {p.untuk}
              </span>
            </button>
          )
        })}
      </div>

      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 p-2 text-[10px] leading-relaxed text-amber-900">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        <span data-uji="kalimat-konfirmasi">{kalimatKonfirmasi(mutu, jumlahGambar)}</span>
      </p>
    </div>
  )
}
