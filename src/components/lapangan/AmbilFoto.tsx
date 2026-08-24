/**
 * Dua jalan mengambil foto: kamera, atau album yang sudah ada.
 *
 * Sebuah `<input type="file">` yang diberi `capture` MENGHILANGKAN pilihan
 * galeri di Android — bukan sekadar mendahulukan kamera. Pengawas yang
 * memotret pekerjaan sambil berjalan lalu mengisi laporan sore hari di kantor
 * karena itu tidak punya cara memasukkan fotonya, selain memotret ulang layar
 * HP-nya sendiri.
 *
 * Karena itu di sini ada DUA input tersembunyi, bukan satu. Satu elemen tidak
 * bisa melayani keduanya: `capture` harus ada untuk yang satu dan harus benar-
 * benar tidak ada untuk yang lain.
 *
 * Aturannya ada di lib/sumberFoto.ts supaya bisa diuji tanpa DOM.
 */
import { useRef } from 'react'
import { Camera, Images, Loader2 } from 'lucide-react'
import { atributInput, labelSumber, type ArahKamera } from '@/lib/sumberFoto'

interface Props {
  /** Dipanggil dengan berkas yang dipilih, dari sumber mana pun. */
  onPilih: (berkas: File[]) => void | Promise<void>
  sibuk?: boolean
  banyak?: boolean
  arah?: ArahKamera
  /** Tampilan ringkas untuk baris absensi yang sempit. */
  kecil?: boolean
  labelKamera?: string
  nonaktif?: boolean
}

export default function AmbilFoto({
  onPilih, sibuk, banyak, arah = 'belakang', kecil, labelKamera, nonaktif,
}: Props) {
  const kameraRef = useRef<HTMLInputElement>(null)
  const galeriRef = useRef<HTMLInputElement>(null)

  function ambil(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = Array.from(e.target.files ?? [])
    // Dikosongkan SEBELUM dipakai: tanpa ini, memilih berkas yang sama dua kali
    // berturut-turut tidak memicu `change` sama sekali — dan pemakainya
    // menyangka ketukannya tidak terbaca.
    e.target.value = ''
    if (berkas.length) void onPilih(berkas)
  }

  const kamera = atributInput('kamera', { arah, banyak })
  const galeri = atributInput('galeri', { banyak })

  const kelas = kecil
    ? 'h-8 px-2.5 rounded-lg border border-dashed border-border bg-white flex items-center gap-1.5 '
      + 'text-[11px] font-semibold text-muted-foreground hover:border-navy/40 hover:text-navy disabled:opacity-50'
    : 'flex-1 h-10 rounded-xl border border-dashed border-border bg-white flex items-center justify-center gap-2 '
      + 'text-xs font-bold text-navy hover:border-navy/60 disabled:opacity-50'

  return (
    <div className={kecil ? 'flex gap-1.5' : 'flex gap-2'}>
      <button type="button" data-foto-kamera disabled={sibuk || nonaktif}
        onClick={() => kameraRef.current?.click()} className={kelas}>
        {sibuk
          ? <Loader2 className={kecil ? 'w-3.5 h-3.5 animate-spin' : 'w-4 h-4 animate-spin'} />
          : <Camera className={kecil ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
        {labelKamera ?? labelSumber('kamera')}
      </button>

      <button type="button" data-foto-galeri disabled={sibuk || nonaktif}
        onClick={() => galeriRef.current?.click()} className={kelas}>
        <Images className={kecil ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {labelSumber('galeri')}
      </button>

      <input ref={kameraRef} type="file" hidden onChange={ambil}
        accept={kamera.accept} capture={kamera.capture} multiple={kamera.multiple} />
      {/* TANPA `capture` sama sekali. Nilai apa pun di sini — termasuk string
          kosong — sudah cukup membuat sebagian peramban membuka kamera, dan
          kesalahan itu tidak terlihat sampai ada yang mencoba memilih foto
          lama. */}
      <input ref={galeriRef} type="file" hidden onChange={ambil}
        accept={galeri.accept} multiple={galeri.multiple} />
    </div>
  )
}
