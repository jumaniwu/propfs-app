import { useEffect, useState } from 'react'
import { X, ExternalLink, Download, Loader2, FileText, AlertTriangle } from 'lucide-react'
import {
  dataUriBerkas, base64Telanjang, bisaTampilInline, adalahPdf,
  namaBerkasAman, keteranganBerkas,
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

  /**
   * Membuka berkas di tab baru.
   *
   * Lewat Blob, bukan data URI. Peramban ponsel menolak menavigasi ke data URI
   * yang panjang — dan menolaknya tanpa pesan, sehingga tampak seperti tombol
   * yang rusak.
   */
  function bukaTabBaru() {
    if (!isi) return
    try {
      const biner = atob(base64Telanjang(isi.uri))
      const buf = new Uint8Array(biner.length)
      for (let i = 0; i < biner.length; i++) buf[i] = biner.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([buf], { type: isi.mime || 'application/octet-stream' }))
      window.open(url, '_blank', 'noopener')
      // Dibebaskan belakangan: mencabutnya seketika membuat tab yang baru
      // dibuka menampilkan halaman kosong.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      window.open(isi.uri, '_blank', 'noopener')
    }
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
          <div className="text-center space-y-3 text-white">
            <FileText className="w-12 h-12 mx-auto opacity-70" />
            <p className="text-sm">
              {keteranganBerkas(isi?.mime)} ini dibuka di tab baru.
            </p>
            {adalahPdf(isi?.mime) && (
              <p className="text-xs opacity-70 max-w-xs mx-auto">
                Penampil PDF di dalam halaman tidak bisa diandalkan pada peramban ponsel.
              </p>
            )}
          </div>
        )}
      </div>

      {isi && (
        <div className="p-3 flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button data-buka-tab onClick={bukaTabBaru}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white/15
              text-white px-4 py-3 text-sm font-bold">
            <ExternalLink className="w-4 h-4" /> Buka di tab baru
          </button>
          <a href={isi.uri} download={isi.nama}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gold
              text-navy px-4 py-3 text-sm font-bold">
            <Download className="w-4 h-4" /> Simpan
          </a>
        </div>
      )}
    </div>
  )
}
