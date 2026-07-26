// Cetak SPK ke PDF A4 (jspdf) — kop kontrak, para pihak, rincian pekerjaan,
// pasal-pasal, dan dua blok tanda tangan (Pihak Pertama & Pihak Kedua).
import { jsPDF } from 'jspdf'
import { spkTitle, type SpkDoc } from './spkApi'
import { getBrandingCache, identitasLaporan, perluWatermark, TEKS_WATERMARK } from './branding'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/** `planId` menentukan watermark — hanya paket gratis yang diberi watermark. */
export function downloadSpkPdf(spk: SpkDoc, planId?: string | null): void {
  const isKonsumen = (spk.pihak_kedua_peran || '').toLowerCase() === 'konsumen'
  const merek = identitasLaporan(getBrandingCache())
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18
  const contentW = W - 2 * M
  let y = 20

  const ensure = (need: number) => { if (y + need > 280) { doc.addPage(); y = 20 } }

  // ── Kop: identitas perusahaan pemakai; PropFS hanya dipakai bila profil kosong ──
  const tinggiKop = merek.bawaan ? 30 : 38
  doc.setFillColor(13, 27, 42)
  doc.rect(0, 0, W, tinggiKop, 'F')
  doc.setTextColor(255, 255, 255)

  if (merek.bawaan) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
    doc.text(spkTitle(spk.pihak_kedua_peran), W / 2, 14, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(`Nomor: ${spk.nomor}`, W / 2, 21, { align: 'center' })
  } else {
    let teksX = M
    if (merek.logo) {
      try {
        doc.addImage(merek.logo, 'PNG', M, 6, 20, 20)
        teksX = M + 25
      } catch { /* logo tidak terbaca — lanjut tanpa logo */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(merek.nama, teksX, 13)
    if (merek.kontak) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.text(doc.splitTextToSize(merek.kontak, contentW - (teksX - M))[0], teksX, 18)
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(spkTitle(spk.pihak_kedua_peran), W / 2, 29, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(`Nomor: ${spk.nomor}`, W / 2, 34.5, { align: 'center' })
  }

  doc.setTextColor(20, 30, 40)
  y = tinggiKop + 10

  // ── Para pihak ──
  const peran = spk.pihak_kedua_peran || 'Pelaksana'
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  const intro = `Pada hari ini dibuat dan ditandatangani ${isKonsumen ? 'Perjanjian ini' : 'Surat Perintah Kerja'} antara PIHAK PERTAMA ` +
    `(${spk.pemberi_nama || 'Pemberi Kerja'}${spk.pemberi_jabatan ? ', ' + spk.pemberi_jabatan : ''}) ` +
    `dengan PIHAK KEDUA selaku ${peran} (${spk.vendor_name})` +
    (spk.project_name ? ` untuk proyek "${spk.project_name}"` : '') + '.'
  const introLines = doc.splitTextToSize(intro, contentW)
  doc.text(introLines, M, y)
  y += introLines.length * 5 + 3

  if (spk.lampiran_nama) {
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(90, 102, 115)
    doc.text(`Lampiran: ${spk.lampiran_nama} (RAB / Surat Penawaran Harga) — terlampir terpisah.`, M, y)
    doc.setTextColor(20, 30, 40); doc.setFont('helvetica', 'normal')
    y += 6
  }

  // ── Tabel rincian pekerjaan ──
  const cols = [10, 78, 22, 20, 34] // No, Uraian, Volume, Satuan, Harga
  const totalW = cols.reduce((a, b) => a + b, 0)
  const xs: number[] = []
  let acc = M
  for (const c of cols) { xs.push(acc); acc += c }
  const rowH = 7

  ensure(rowH * 3)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text(isKonsumen ? 'RINCIAN & HARGA' : 'RINCIAN PEKERJAAN', M, y); y += 4
  const header = ['No', 'Uraian Pekerjaan', 'Volume', 'Satuan', 'Harga (Rp)']
  doc.setFillColor(13, 27, 42)
  doc.rect(M, y, totalW, rowH, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(8.5)
  header.forEach((h, i) => doc.text(h, xs[i] + 2, y + 4.8))
  y += rowH
  doc.setTextColor(20, 30, 40); doc.setFont('helvetica', 'normal')

  spk.lingkup.forEach((l, i) => {
    ensure(rowH)
    if (i % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(M, y, totalW, rowH, 'F') }
    doc.text(String(i + 1), xs[0] + 2, y + 4.8)
    doc.text(doc.splitTextToSize(l.uraian, cols[1] - 4)[0] ?? '', xs[1] + 2, y + 4.8)
    doc.text(l.volume.toLocaleString('id-ID'), xs[2] + cols[2] - 2, y + 4.8, { align: 'right' })
    doc.text(l.satuan, xs[3] + 2, y + 4.8)
    doc.text(l.harga.toLocaleString('id-ID'), xs[4] + cols[4] - 2, y + 4.8, { align: 'right' })
    y += rowH
  })
  ensure(rowH)
  doc.setFillColor(240, 230, 206); doc.rect(M, y, totalW, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text(isKonsumen ? 'TOTAL HARGA' : 'NILAI KONTRAK', xs[0] + 2, y + 4.8)
  doc.text(spk.nilai_kontrak.toLocaleString('id-ID'), xs[4] + cols[4] - 2, y + 4.8, { align: 'right' })
  y += rowH + 6

  // ── Waktu & termin ringkas ──
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const terminStr = spk.termin.length
    ? spk.termin.map(t => `${t.nama} ${t.pct}% (${fmt((spk.nilai_kontrak * t.pct) / 100)})`).join('; ')
    : '-'
  const info = [
    `Waktu pelaksanaan: ${spk.durasi_hari} hari kalender, mulai ${spk.tgl_mulai || '-'}.`,
    `Denda keterlambatan: ${spk.denda_permil} permil/hari (maks 5%).`,
    `Termin pembayaran: ${terminStr}.`,
    ...(spk.catatan ? [`Catatan: ${spk.catatan}`] : []),
  ]
  for (const l of info) {
    const wrapped = doc.splitTextToSize(l, contentW)
    ensure(wrapped.length * 4.5 + 1)
    doc.text(wrapped, M, y); y += wrapped.length * 4.5 + 1.5
  }
  y += 4

  // ── Pasal-pasal ──
  const pasal = spk.pasal ?? []
  if (pasal.length) {
    for (const p of pasal) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      const judul = doc.splitTextToSize(p.judul, contentW)
      const isi = doc.splitTextToSize(p.isi, contentW)
      ensure(judul.length * 4.5 + isi.length * 4.3 + 4)
      doc.text(judul, M, y); y += judul.length * 4.5 + 0.5
      doc.setFont('helvetica', 'normal')
      doc.text(isi, M, y); y += isi.length * 4.3 + 3
    }
    y += 2
  }

  // ── Dua tanda tangan ──
  ensure(46)
  const colW = contentW / 2
  const leftX = M
  const rightX = M + colW
  const tglNow = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  doc.text(`${spk.project_name || ''}, ${tglNow}`, rightX + colW / 2, y, { align: 'center' })
  y += 6
  doc.text('PIHAK PERTAMA', leftX + colW / 2, y, { align: 'center' })
  doc.text('PIHAK KEDUA', rightX + colW / 2, y, { align: 'center' })
  doc.setFontSize(8); doc.setTextColor(90, 102, 115)
  doc.text(spk.pemberi_jabatan || 'Pemberi Kerja', leftX + colW / 2, y + 4, { align: 'center' })
  doc.text(peran, rightX + colW / 2, y + 4, { align: 'center' })
  doc.setTextColor(20, 30, 40)
  const sigY = y + 7
  if (spk.pemberi_signature) {
    try { doc.addImage(spk.pemberi_signature, 'PNG', leftX + colW / 2 - 22, sigY, 44, 20) } catch { /* skip */ }
  }
  if (spk.signature_data) {
    try { doc.addImage(spk.signature_data, 'PNG', rightX + colW / 2 - 22, sigY, 44, 20) } catch { /* skip */ }
  }
  y = sigY + 24
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text(`( ${spk.pemberi_signed_name || spk.pemberi_nama || '________________'} )`, leftX + colW / 2, y, { align: 'center' })
  doc.text(`( ${spk.signed_name || spk.vendor_name || '________________'} )`, rightX + colW / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90, 102, 115)
  if (spk.pemberi_signed_at) {
    doc.text(`Digital ${new Date(spk.pemberi_signed_at).toLocaleString('id-ID')}`, leftX + colW / 2, y + 4, { align: 'center' })
  }
  if (spk.signed_at) {
    doc.text(`Digital ${new Date(spk.signed_at).toLocaleString('id-ID')}`, rightX + colW / 2, y + 4, { align: 'center' })
  }

  // ── Watermark: HANYA paket gratis. Paket berbayar dicetak bersih. ──
  if (perluWatermark(planId)) {
    const jml = doc.getNumberOfPages()
    for (let i = 1; i <= jml; i++) {
      doc.setPage(i)
      doc.saveGraphicsState()
      // setGState tersedia pada jsPDF modern; bila tidak, watermark tetap
      // dicetak dengan warna abu muda tanpa transparansi.
      const gs = (doc as unknown as { GState?: (o: object) => unknown; setGState?: (s: unknown) => void })
      try { if (gs.GState && gs.setGState) gs.setGState(gs.GState({ opacity: 0.12 })) } catch { /* abaikan */ }
      doc.setTextColor(120, 130, 145)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(46)
      doc.text(TEKS_WATERMARK, W / 2, 160, { align: 'center', angle: 35 })
      doc.restoreGraphicsState()
    }
    doc.setPage(jml)
  }

  doc.save(`${spk.nomor.replace(/[^\w-]+/g, '_')}.pdf`)
}
