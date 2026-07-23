// Cetak SPK ke PDF A4 (jspdf) — kop, tabel lingkup, ketentuan, area ttd.
import { jsPDF } from 'jspdf'
import type { SpkDoc } from './spkApi'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

export function downloadSpkPdf(spk: SpkDoc): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18
  let y = 20

  // Kop
  doc.setFillColor(13, 27, 42)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('SURAT PERINTAH KERJA', W / 2, 14, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Nomor: ${spk.nomor}`, W / 2, 21, { align: 'center' })
  doc.setTextColor(20, 30, 40)
  y = 40

  doc.setFontSize(10)
  const intro = `Dengan ini memberikan perintah kerja kepada ${spk.vendor_name}` +
    (spk.project_name ? ` untuk proyek ${spk.project_name}` : '') + ' dengan ketentuan sebagai berikut:'
  const introLines = doc.splitTextToSize(intro, W - 2 * M)
  doc.text(introLines, M, y)
  y += introLines.length * 5 + 4

  // Tabel lingkup
  const cols = [10, 78, 22, 20, 34] // No, Uraian, Volume, Satuan, Harga
  const xs: number[] = []
  let acc = M
  for (const c of cols) { xs.push(acc); acc += c }
  const rowH = 7

  const header = ['No', 'Uraian Pekerjaan', 'Volume', 'Satuan', 'Harga (Rp)']
  doc.setFillColor(13, 27, 42)
  doc.rect(M, y, cols.reduce((a, b) => a + b, 0), rowH, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  header.forEach((h, i) => doc.text(h, xs[i] + 2, y + 4.8))
  y += rowH
  doc.setTextColor(20, 30, 40)
  doc.setFont('helvetica', 'normal')

  spk.lingkup.forEach((l, i) => {
    if (y > 250) { doc.addPage(); y = 20 }
    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 250)
      doc.rect(M, y, cols.reduce((a, b) => a + b, 0), rowH, 'F')
    }
    doc.text(String(i + 1), xs[0] + 2, y + 4.8)
    doc.text(doc.splitTextToSize(l.uraian, cols[1] - 4)[0] ?? '', xs[1] + 2, y + 4.8)
    doc.text(l.volume.toLocaleString('id-ID'), xs[2] + cols[2] - 2, y + 4.8, { align: 'right' })
    doc.text(l.satuan, xs[3] + 2, y + 4.8)
    doc.text(l.harga.toLocaleString('id-ID'), xs[4] + cols[4] - 2, y + 4.8, { align: 'right' })
    y += rowH
  })
  doc.setFillColor(240, 230, 206)
  doc.rect(M, y, cols.reduce((a, b) => a + b, 0), rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('NILAI KONTRAK', xs[0] + 2, y + 4.8)
  doc.text(spk.nilai_kontrak.toLocaleString('id-ID'), xs[4] + cols[4] - 2, y + 4.8, { align: 'right' })
  y += rowH + 6

  // Ketentuan
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text('Ketentuan:', M, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const terminStr = spk.termin.length
    ? spk.termin.map(t => `${t.nama} ${t.pct}% (${fmt((spk.nilai_kontrak * t.pct) / 100)})`).join('; ')
    : '-'
  const lines = [
    `1. Waktu pelaksanaan: ${spk.durasi_hari} hari kalender, mulai ${spk.tgl_mulai || '-'}.`,
    `2. Denda keterlambatan: ${spk.denda_permil} permil per hari, maksimum 5% dari nilai kontrak.`,
    `3. Termin pembayaran: ${terminStr}.`,
    ...(spk.catatan ? [`4. Catatan: ${spk.catatan}`] : []),
  ]
  for (const l of lines) {
    const wrapped = doc.splitTextToSize(l, W - 2 * M)
    if (y + wrapped.length * 4.5 > 255) { doc.addPage(); y = 20 }
    doc.text(wrapped, M, y)
    y += wrapped.length * 4.5 + 1.5
  }
  y += 6

  // Area tanda tangan
  if (y > 220) { doc.addPage(); y = 30 }
  doc.setFontSize(9.5)
  doc.text('Pemberi Kerja,', M + 10, y)
  doc.text('Penerima Kerja / Vendor,', W - M - 60, y)
  if (spk.signature_data) {
    try { doc.addImage(spk.signature_data, 'PNG', W - M - 62, y + 3, 50, 22) } catch { /* abaikan ttd korup */ }
  }
  y += 30
  doc.text('(______________________)', M + 2, y)
  doc.setFont('helvetica', 'bold')
  doc.text(`( ${spk.signed_name || spk.vendor_name} )`, W - M - 62, y)
  doc.setFont('helvetica', 'normal')
  if (spk.signed_at) {
    doc.setFontSize(7.5)
    doc.setTextColor(90, 102, 115)
    doc.text(
      `Ditandatangani digital ${new Date(spk.signed_at).toLocaleString('id-ID')} via propfs.id`,
      W - M - 62, y + 5,
    )
  }

  doc.save(`${spk.nomor.replace(/[^\w-]+/g, '_')}.pdf`)
}
