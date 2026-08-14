import { jsPDF } from 'jspdf'
import { perluWatermark, TEKS_WATERMARK, type KonteksWatermark, type IdentitasLaporan } from './branding'
import {
  terbilang, perluMaterai, LABEL_METODE_TERIMA, TARIF_MATERAI,
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
 * Bidang meterai DIGAMBAR meski meterainya belum terbubuh, dengan tulisan yang
 * berbeda. Menyembunyikannya berarti kwitansi wajib-meterai yang belum
 * dimeterai terlihat persis seperti yang sudah — dan yang menandatanganinya
 * tidak punya cara mengetahuinya dari dokumen yang ada di tangannya.
 */
export function buatKwitansiPdf(
  k: Kwitansi,
  merek: IdentitasLaporan,
  konteks?: string | null | KonteksWatermark,
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

  if (perluMaterai(k.jumlah)) {
    const terbubuh = k.materai_status === 'terbubuh'
    doc.setDrawColor(terbubuh ? 16 : 190, terbubuh ? 140 : 130, terbubuh ? 90 : 130)
    doc.setLineWidth(0.4)
    doc.roundedRect(xTtd, yNominal + 1, 26, 26, 2, 2, 'S')
    doc.setFontSize(6)
    doc.setTextColor(terbubuh ? 16 : 150, terbubuh ? 120 : 100, terbubuh ? 80 : 100)
    if (terbubuh) {
      doc.text('e-METERAI', xTtd + 13, yNominal + 10, { align: 'center' })
      doc.text(`Rp ${TARIF_MATERAI.toLocaleString('id-ID')}`, xTtd + 13, yNominal + 15, { align: 'center' })
      if (k.materai_sn) {
        doc.setFontSize(4.5)
        doc.text(doc.splitTextToSize(k.materai_sn, 24), xTtd + 13, yNominal + 20, { align: 'center' })
      }
    } else {
      // Dikatakan apa adanya. Bidang meterai kosong tanpa keterangan terbaca
      // sebagai "meterainya lepas", bukan sebagai "belum dibubuhkan".
      doc.text(doc.splitTextToSize('BELUM DIBUBUHI e-METERAI', 22), xTtd + 13, yNominal + 11,
        { align: 'center' })
    }
    doc.setTextColor(20, 30, 40)
  }

  const xNama = xTtd + 32
  if (k.penanda_nama) {
    doc.setFontSize(10)
    doc.text('Penerima,', xNama, yNominal + 4)
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

  if (perluWatermark(konteks)) {
    doc.setTextColor(200, 205, 210)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(40)
    try {
      const g = doc as unknown as { setGState?: (s: unknown) => void; GState?: new (o: unknown) => unknown }
      if (g.setGState && g.GState) g.setGState(new g.GState({ opacity: 0.12 }))
    } catch { /* jsPDF lama: watermark tetap tercetak, hanya lebih pekat */ }
    doc.text(TEKS_WATERMARK, W / 2, H / 2, { align: 'center', angle: 20 })
  }

  return doc
}

export function unduhKwitansiPdf(
  k: Kwitansi, merek: IdentitasLaporan, konteks?: string | null | KonteksWatermark,
): void {
  buatKwitansiPdf(k, merek, konteks).save(`${(k.nomor || 'kwitansi').replace(/\//g, '-')}.pdf`)
}

/** PDF sebagai base64 tanpa awalan data URI — inilah yang dikirim ke e-Meterai. */
export function kwitansiPdfBase64(
  k: Kwitansi, merek: IdentitasLaporan, konteks?: string | null | KonteksWatermark,
): string {
  const uri = buatKwitansiPdf(k, merek, konteks).output('datauristring')
  return uri.slice(uri.indexOf(',') + 1)
}
