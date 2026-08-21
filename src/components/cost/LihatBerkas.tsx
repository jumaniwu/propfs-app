import { useEffect, useState } from 'react'
import { bukaBerkas, simpanBerkas, diAndroid, jembatanNativeAda, blobDariBase64 } from '@/lib/unduhBerkas'
import { pdfKeGambar } from '@/lib/pdf-utils'
import { X, ExternalLink, Download, Loader2, FileText, AlertTriangle, Share2 } from 'lucide-react'
import {
  dataUriBerkas, base64Telanjang, bisaTampilInline, adalahPdf,
  namaBerkasAman, labelBuka, ajakanBuka,
} from '@/lib/berkasLampiran'
import { PADDING_BAWAH_TIRAI } from '@/lib/lapisan'

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

  // Halaman PDF yang sudah digambar sendiri oleh aplikasi ini.
  //
  // INILAH perbaikan yang sesungguhnya. Sebelumnya PDF hanya bisa dilihat
  // dengan menyerahkannya ke aplikasi lain — tab baru di peramban, atau menu
  // Bagikan Android di dalam APK. Keduanya menuntut sesuatu di luar kendali
  // aplikasi ini: peramban yang mau menavigasi ke data URI panjang, atau
  // jembatan native yang benar-benar terpasang di APK-nya. Ketika salah
  // satunya tidak ada, yang tersisa tombol yang tidak menghasilkan apa-apa.
  //
  // pdf.js menggambar ke canvas dengan kode kita sendiri. Tidak ada penampil
  // bawaan yang dipanggil dan tidak ada jembatan yang harus terpasang, jadi ia
  // berjalan sama di peramban dan di APK versi mana pun.
  const [halaman, setHalaman] = useState<string[]>([])
  const [totalHalaman, setTotalHalaman] = useState(0)
  const [gambarPdf, setGambarPdf] = useState(false)
  const [gagalGambar, setGagalGambar] = useState('')

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
        const berkas = {
          nama: namaBerkasAman(b.berkas_nama || nama, b.berkas_mime, 'tagihan'),
          mime: b.berkas_mime,
          uri: dataUriBerkas(b.berkas_mime, data),
        }
        setIsi(berkas)

        if (adalahPdf(b.berkas_mime)) {
          setGambarPdf(true)
          // Lebar layar dikalikan rasio piksel: layar 390px pada HP modern
          // sebenarnya 1170 piksel sungguhan, dan merender pada 390 membuat
          // angka nota terbaca kabur — padahal nomor rekening di situlah yang
          // dicari orang.
          const lebar = Math.min(1400, Math.round(
            (window.innerWidth || 390) * Math.min(3, window.devicePixelRatio || 1),
          ))
          blobDariBase64(data, 'application/pdf').arrayBuffer()
            .then(buf => pdfKeGambar(buf, { lebarTarget: lebar }))
            .then(h => {
              if (!hidup) return
              setHalaman(h.halaman)
              setTotalHalaman(h.total)
            })
            .catch(e => {
              if (!hidup) return
              // Gagal menggambar bukan gagal total: tombol "buka dengan
              // aplikasi lain" tetap ada di bawah, dan menyebut sebabnya jauh
              // lebih berguna daripada layar kosong.
              setGagalGambar(e instanceof Error ? e.message : 'PDF ini tidak bisa ditampilkan.')
            })
            .finally(() => { if (hidup) setGambarPdf(false) })
        }
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
    // z-[60], BUKAN z-50. BottomNav berdiri di z-50 dan dirender SETELAH
    // <Routes>, jadi pada nilai yang sama ia yang menang — dan yang kalah
    // hanya 64 piksel paling bawah, persis tempat kedua tombol ini berada.
    // Yang terlihat bukan cacat lapisan, melainkan tombol yang "terlalu di
    // bawah" dan terpotong. Lihat lib/lapisan.ts.
    <div data-lihat-berkas className="fixed inset-0 z-[60] bg-black/80 flex flex-col" onClick={onTutup}>
      <div className="flex items-center justify-between gap-2 p-3 text-white shrink-0"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold truncate">{isi?.nama || nama || 'Berkas'}</p>
        <button onClick={onTutup} className="p-2 hover:bg-white/10 rounded-lg shrink-0"
          aria-label="Tutup">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className={`flex-1 min-h-0 p-3 ${
        halaman.length > 0 ? 'overflow-hidden' : 'flex items-center justify-center'}`}
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
        ) : gambarPdf ? (
          <div className="text-center space-y-2 text-white">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            <p className="text-xs opacity-80">Menyiapkan halaman PDF…</p>
          </div>
        ) : halaman.length > 0 ? (
          // Digulung, bukan dipaskan ke layar: nota vendor dibaca untuk mencari
          // angka — nomor rekening, total, nomor PO — dan angka yang dipaksa
          // muat dalam satu layar 390px tidak bisa dibaca siapa pun.
          <div data-pdf-halaman className="w-full h-full overflow-auto overscroll-contain space-y-3 py-1">
            {halaman.map((h, i) => (
              <img key={i} src={h} alt={`Halaman ${i + 1}`}
                className="w-full rounded-lg bg-white" />
            ))}
            {totalHalaman > halaman.length && (
              <p className="text-center text-[11px] text-white/70 pb-2">
                Menampilkan {halaman.length} dari {totalHalaman} halaman. Buka dengan
                aplikasi lain untuk melihat seluruhnya.
              </p>
            )}
          </div>
        ) : (
          <div className="text-center space-y-3 text-white max-w-xs mx-auto">
            <FileText className="w-12 h-12 mx-auto opacity-70" />
            {/* Kalimat PERINTAH, bukan laporan. Versi sebelumnya berbunyi "PDF
                ini dibuka di tab baru" — mengabarkan sesuatu yang belum
                terjadi, sehingga yang membacanya mengira berkasnya sudah
                terbuka di tempat yang tidak bisa ia temukan, lalu berhenti
                mencari tombol yang sebenarnya ada di bawah layar. */}
            <p className="text-sm leading-relaxed">
              {gagalGambar || ajakanBuka(isi?.mime, diApk)}
            </p>
            {adalahPdf(isi?.mime) && !diApk && (
              <p className="text-xs opacity-70">
                Penampil PDF di dalam halaman tidak bisa diandalkan pada peramban ponsel.
              </p>
            )}
          </div>
        )}
      </div>

      {isi && (
        // Ruang tambahan di dasar layar untuk bilah gestur. Tombol yang
        // menempel persis di tepi berbagi tempat dengan sapuan "kembali ke
        // beranda" — dan yang terjadi bukan tombolnya tertekan, melainkan
        // aplikasinya tertutup.
        <div className={`p-3 pt-2 flex gap-2 shrink-0 ${PADDING_BAWAH_TIRAI}`}
          onClick={e => e.stopPropagation()}>
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
