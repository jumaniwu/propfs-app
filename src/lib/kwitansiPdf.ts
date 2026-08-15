import { jsPDF } from 'jspdf'
import { simpanPdf, simpanBerkas } from './unduhBerkas.ts'
import type { IdentitasLaporan } from './branding'
import {
  terbilang, perluMaterai, namaFileKwitansi, LABEL_METODE_TERIMA, TARIF_MATERAI,
  type Kwitansi, type MetodeTerima,
} from './kwitansi'

const rp = (n: number) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`
const tglPanjang = (s: string) => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Kwitansi A4 melintang, satu halaman.
 *
 * Melintang dengan sengaja: kwitansi memang berbentuk lebar, dan yang membaca
 * di ponsel maupun yang mencetaknya sama-sama mengenali bentuk itu tanpa perlu
 * membaca judulnya.
 *
 * Bidang meterai hanya digambar bila meterainya MEMANG sudah terbubuh; lihat
 * alasannya di dalam.
 */
export function buatKwitansiPdf(
  k: Kwitansi,
  merek: IdentitasLaporan,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  const H = 210
  const M = 20
  const isiW = W - 2 * M

  // ── Kop ──────────────────────────────────────────────────────────────
  const tinggiKop = merek.bawaan ? 26 : 32
  doc.setFillColor(13, 27, 42)
  doc.rect(0, 0, W, tinggiKop, 'F')
  doc.setTextColor(255, 255, 255)

  let teksX = M
  if (!merek.bawaan && merek.logo) {
    try { doc.addImage(merek.logo, 'PNG', M, 5, 18, 18); teksX = M + 23 } catch { /* logo tidak terbaca */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(merek.bawaan ? 'PropFS' : merek.nama, teksX, merek.bawaan ? 14 : 12)
  if (!merek.bawaan && merek.kontak) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(doc.splitTextToSize(merek.kontak, isiW - (teksX - M))[0], teksX, 17)
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('KWITANSI', W - M, merek.bawaan ? 13 : 12, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`No. ${k.nomor}`, W - M, merek.bawaan ? 19 : 18, { align: 'right' })

  doc.setTextColor(20, 30, 40)
  let y = tinggiKop + 16

  // ── Isi ──────────────────────────────────────────────────────────────
  const baris = (label: string, isi: string, tebal = false) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.setTextColor(110, 120, 130)
    doc.text(label, M, y)
    doc.setTextColor(20, 30, 40)
    doc.setFont('helvetica', tebal ? 'bold' : 'normal')
    doc.setFontSize(tebal ? 12 : 11)
    const lines = doc.splitTextToSize(isi || '-', isiW - 55)
    doc.text(lines, M + 55, y)
    y += Math.max(9, lines.length * 6)
  }

  baris('Telah terima dari', k.penerima_dari, true)

  // Terbilang dibingkai, seperti kwitansi cetak. Ia bukan hiasan: pada
  // dokumen keuangan, kata yang mengulang angkanya adalah yang menahan angka
  // itu diubah setelah ditandatangani.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.setTextColor(110, 120, 130)
  doc.text('Uang sejumlah', M, y)
  doc.setDrawColor(200, 205, 210)
  doc.setFillColor(246, 248, 250)
  const terbilangText = terbilang(k.jumlah)
  const terbilangLines = doc.splitTextToSize(terbilangText, isiW - 62)
  const tinggiKotak = Math.max(12, terbilangLines.length * 6 + 6)
  doc.roundedRect(M + 55, y - 6, isiW - 55, tinggiKotak, 2, 2, 'FD')
  doc.setTextColor(20, 30, 40)
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(11)
  doc.text(terbilangLines, M + 59, y)
  y += tinggiKotak + 6

  baris('Untuk pembayaran', k.untuk_pembayaran)
  if (k.project_name) baris('Proyek', k.project_name)
  baris('Cara pembayaran', LABEL_METODE_TERIMA[k.metode as MetodeTerima] ?? String(k.metode))
  if (k.catatan) baris('Catatan', k.catatan)

  // ── Nominal ──────────────────────────────────────────────────────────
  const yNominal = Math.max(y + 4, H - 62)
  doc.setFillColor(13, 27, 42)
  doc.roundedRect(M, yNominal, 100, 18, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(rp(k.jumlah), M + 6, yNominal + 12)

  // ── Tanda tangan & meterai ───────────────────────────────────────────
  doc.setTextColor(20, 30, 40)
  const xTtd = W - M - 70
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(tglPanjang(k.tanggal), xTtd, yNominal - 4)

  // Bidang meterai HANYA digambar bila meterainya memang sudah terbubuh.
  //
  // Semula kotak kosong bertuliskan "BELUM DIBUBUHI e-METERAI" ikut tercetak.
  // Maksudnya jujur, tetapi akibatnya buruk: kwitansi yang diunduh untuk
  // DIBUBUHI di situs e-Meterai justru membawa tulisan itu ke dalam dokumen
  // finalnya — meterai aslinya menempel di sebelah tulisan yang menyatakan
  // dokumennya belum bermeterai. Yang belum bermeterai cukup tidak punya
  // bidang meterai; itu sudah menerangkan dirinya sendiri.
  if (perluMaterai(k.jumlah) && k.materai_status === 'terbubuh') {
    doc.setDrawColor(16, 140, 90)
    doc.setLineWidth(0.4)
    doc.roundedRect(xTtd, yNominal + 1, 26, 26, 2, 2, 'S')
    doc.setFontSize(6)
    doc.setTextColor(16, 120, 80)
    doc.text('e-METERAI', xTtd + 13, yNominal + 10, { align: 'center' })
    doc.text(`Rp ${TARIF_MATERAI.toLocaleString('id-ID')}`, xTtd + 13, yNominal + 15, { align: 'center' })
    if (k.materai_sn) {
      doc.setFontSize(4.5)
      doc.text(doc.splitTextToSize(k.materai_sn, 24), xTtd + 13, yNominal + 20, { align: 'center' })
    }
    doc.setTextColor(20, 30, 40)
  }

  const xNama = xTtd + 32
  if (k.penanda_nama) {
    doc.setFontSize(10)
    doc.text('Penerima,', xNama, yNominal + 4)
    // Tanda tangan digital, bila sudah dibubuhkan.
    if (k.penanda_signature) {
      try {
        doc.addImage(k.penanda_signature, 'PNG', xNama, yNominal + 6, 40, 18)
      } catch { /* gambar tidak terbaca — garis tanda tangan tetap tercetak */ }
    }
    doc.setDrawColor(160, 170, 180)
    doc.line(xNama, yNominal + 26, xNama + 44, yNominal + 26)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(k.penanda_nama, xNama, yNominal + 31)
    if (k.penanda_jabatan) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      doc.setTextColor(110, 120, 130)
      doc.text(k.penanda_jabatan, xNama, yNominal + 36)
      doc.setTextColor(20, 30, 40)
    }
  }


  return doc
}

export function unduhKwitansiPdf(
  k: Kwitansi, merek: IdentitasLaporan,
): Promise<boolean> {
  return simpanPdf(buatKwitansiPdf(k, merek), namaFileKwitansi({ ...k, materai_pdf: null }))
}

/**
 * Unduh PDF yang SUDAH ADA — versi bermeterai yang diunggah kembali.
 *
 * Lewat Blob, bukan `href` berisi data URI. Berkas bermeterai bisa mendekati
 * 3 MB, dan data URI sepanjang itu ditolak diam-diam oleh sebagian peramban
 * ponsel: tombolnya ditekan, tidak terjadi apa-apa, dan tidak ada galat yang
 * bisa dibaca siapa pun.
 */
export function unduhPdfTersimpan(data: string, nama: string): Promise<boolean> {
  return simpanBerkas(data, nama, 'application/pdf')
}

/** PDF sebagai base64 tanpa awalan data URI — inilah yang dikirim ke e-Meterai. */
export function kwitansiPdfBase64(
  k: Kwitansi, merek: IdentitasLaporan,
): string {
  const uri = buatKwitansiPdf(k, merek).output('datauristring')
  return uri.slice(uri.indexOf(',') + 1)
}
