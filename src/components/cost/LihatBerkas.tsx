import { useEffect, useState } from 'react'
import { bukaBerkas, simpanBerkas, diAndroid, jembatanNativeAda } from '@/lib/unduhBerkas'
import { X, ExternalLink, Download, Loader2, FileText, AlertTriangle, Share2 } from 'lucide-react'
import {
  dataUriBerkas, base64Telanjang, bisaTampilInline, adalahPdf,
  namaBerkasAman, labelBuka, ajakanBuka,
} from '@/lib/berkasLampiran'

/**
 * Membuka berkas yang tersimpan bersama sebuah dokumen.
 *
 * Dibuat karena tagihan vendor menyimpan foto notanya dan menuliskan namanya,
 * tetapi tidak menyediakan cara membukanya — sehingga nomor rekening yang
 * tertulis di foto itu, yang justru dibutuhkan untuk mentransfer, hanya bisa
 * dilihat dengan membuka WhatsApp lagi. Menyimpan bukti tanpa cara melihatnya
 * sama saja tidak menyimpannya.
 *
 * Gambar ditampilkan langsung dan bisa dicubit-perbesar seperti foto biasa —
 * angka rekening pada foto nota sering kecil. PDF tidak dipaksakan tampil di
 * dalam halaman: penampil PDF di dalam bingkai tidak bisa diandalkan pada
 * peramban ponsel, dan yang gagal di sana gagal tanpa pesan.
 */
export default function LihatBerkas({ muat, nama, onTutup }: {
  /** Diambil saat dibuka, bukan saat daftarnya dimuat. */
  muat: () => Promise<{ berkas_nama: string; berkas_mime: string; berkas_data: string | null } | null>
  /** Nama yang sudah diketahui, untuk judul selagi memuat. */
  nama?: string
  onTutup: () => void
}) {
  const [isi, setIsi] = useState<{ nama: string; mime: string; uri: string } | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    let hidup = true
    muat()
      .then(b => {
        if (!hidup) return
        const data = base64Telanjang(b?.berkas_data)
        if (!b || !data) {
          setGalat('Berkasnya tidak tersimpan bersama tagihan ini. '
            + 'Tagihan yang dikirim sebelum fitur ini ada, atau berkasnya terlalu besar saat dikirim.')
          return
        }
        setIsi({
          nama: namaBerkasAman(b.berkas_nama || nama, b.berkas_mime, 'tagihan'),
          mime: b.berkas_mime,
          uri: dataUriBerkas(b.berkas_mime, data),
        })
      })
      .catch(e => hidup && setGalat(e instanceof Error ? e.message : 'Gagal memuat berkas.'))
      .finally(() => hidup && setMemuat(false))
    return () => { hidup = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Di dalam APK tidak ada tab dan tidak ada folder Unduhan yang bisa dicapai
  // dari `<a download>`; yang ada menu Bagikan Android. Dua tombol di bawah
  // menyesuaikan diri — termasuk namanya.
  const diApk = diAndroid() || jembatanNativeAda()
  const [sibuk, setSibuk] = useState<'' | 'buka' | 'simpan'>('')

  /**
   * Membuka berkas untuk DILIHAT.
   *
   * Lewat Blob, bukan data URI. Peramban ponsel menolak menavigasi ke data URI
   * yang panjang — dan menolaknya tanpa pesan, sehingga tampak seperti tombol
   * yang rusak. Di APK, `bukaBerkas` sendiri yang mengalihkannya ke menu
   * Bagikan Android.
   */
  async function bukaTabBaru() {
    if (!isi) return
    setSibuk('buka')
    try {
      await bukaBerkas(isi.uri, isi.nama || 'lampiran', isi.mime || undefined)
    } finally { setSibuk('') }
  }

  /**
   * Menyimpan berkas.
   *
   * DULU ini `<a href={dataUri} download>` telanjang — satu-satunya tempat di
   * aplikasi ini yang tidak melewati lib/unduhBerkas. Di WebView Android,
   * tautan seperti itu TIDAK mengunduh apa pun dan TIDAK melempar apa pun:
   * ditekan, tidak terjadi apa-apa, tanpa satu pun pesan. Persis keluhan
   * "tidak bisa buka file tagihan dari vendor".
   */
  async function simpan() {
    if (!isi) return
    setSibuk('simpan')
    try {
      await simpanBerkas(isi.uri, isi.nama || 'lampiran', isi.mime || undefined)
    } finally { setSibuk('') }
  }

  return (
    <div data-lihat-berkas className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onTutup}>
      <div className="flex items-center justify-between gap-2 p-3 text-white shrink-0"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold truncate">{isi?.nama || nama || 'Berkas'}</p>
        <button onClick={onTutup} className="p-2 hover:bg-white/10 rounded-lg shrink-0"
          aria-label="Tutup">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-3"
        onClick={e => e.stopPropagation()}>
        {memuat ? (
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        ) : galat ? (
          <div className="max-w-sm text-center space-y-2 text-white">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-400" />
            <p className="text-sm">{galat}</p>
          </div>
        ) : isi && bisaTampilInline(isi.mime) ? (
          <img data-berkas-gambar src={isi.uri} alt={isi.nama}
            className="max-w-full max-h-full object-contain rounded-lg" />
        ) : (
          <div className="text-center space-y-3 text-white max-w-xs mx-auto">
            <FileText className="w-12 h-12 mx-auto opacity-70" />
            {/* Kalimat PERINTAH, bukan laporan. Versi sebelumnya berbunyi "PDF
                ini dibuka di tab baru" — mengabarkan sesuatu yang belum
                terjadi, sehingga yang membacanya mengira berkasnya sudah
                terbuka di tempat yang tidak bisa ia temukan, lalu berhenti
                mencari tombol yang sebenarnya ada di bawah layar. */}
            <p className="text-sm leading-relaxed">{ajakanBuka(isi?.mime, diApk)}</p>
            {adalahPdf(isi?.mime) && !diApk && (
              <p className="text-xs opacity-70">
                Penampil PDF di dalam halaman tidak bisa diandalkan pada peramban ponsel.
              </p>
            )}
          </div>
        )}
      </div>

      {isi && (
        <div className="p-3 flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button data-buka-tab onClick={() => void bukaTabBaru()} disabled={!!sibuk}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white/15
              text-white px-4 py-3 text-sm font-bold disabled:opacity-50">
            {sibuk === 'buka'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : diApk ? <Share2 className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
            {labelBuka(diApk)}
          </button>
          {/* Tombol, bukan <a download>. Di WebView Android tautan seperti itu
              tidak mengunduh apa pun dan tidak melempar apa pun — dan ini
              satu-satunya tempat di aplikasi yang masih memakainya. */}
          <button data-simpan-berkas onClick={() => void simpan()} disabled={!!sibuk}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gold
              text-navy px-4 py-3 text-sm font-bold disabled:opacity-50">
            {sibuk === 'simpan'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            Simpan
          </button>
        </div>
      )}
    </div>
  )
}
