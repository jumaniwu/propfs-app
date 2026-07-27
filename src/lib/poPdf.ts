// Cetak Purchase Order ke PDF A4 (jspdf) — kop perusahaan, data vendor,
// rincian barang, ringkasan nilai, dan dua blok tanda tangan (pembuat &
// yang menyetujui). Mengikuti pola src/lib/spkPdf.ts agar tampilannya sebangun
// dengan SPK yang sudah dipakai.
import { jsPDF } from 'jspdf'
import { teksTerm, type PurchaseOrder } from './procurement'
import { perluWatermark, TEKS_WATERMARK, type KonteksWatermark } from './branding'
import { kopSaya } from './identitasSaya'
import type { IdentitasLaporan } from './branding'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const tgl = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * @param konteks menentukan watermark. Superadmin dan pengguna berbayar
 *   dicetak bersih — lihat perluWatermark() di branding.ts.
 * @param kop identitas yang dicetak di kepala surat. Diisi eksplisit oleh
 *   halaman PO publik: vendor membukanya tanpa login, jadi cache lokal dan
 *   sesi — keduanya milik perangkat pemakai aplikasi — tidak bisa dipakai.
 */
export function downloadPoPdf(
  po: PurchaseOrder,
  konteks?: string | null | KonteksWatermark,
  kop?: IdentitasLaporan,
): void {
  // Kop: Profil Perusahaan → nama pemilik akun → identitas PropFS. Vendor
  // harus tahu siapa yang memesan, termasuk saat pemesannya perorangan.
  const merek = kop ?? kopSaya()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 16
  const contentW = W - 2 * M
  let y = 20

  const ensure = (need: number) => { if (y + need > 280) { doc.addPage(); y = 20 } }

  // ── Kop surat: latar PUTIH polos ──
  // Sebelumnya pita navy selebar halaman. Surat resmi ke vendor dicetak di
  // atas kop perusahaan pembeli, bukan di atas warna aplikasi — dan blok
  // gelap selebar itu juga memboroskan tinta saat dicetak.
  const tinggiKop = merek.bawaan ? 30 : 34
  doc.setTextColor(13, 27, 42)

  if (merek.bawaan) {
    // Tanpa profil perusahaan: identitas tetap dicantumkan, karena vendor
    // perlu tahu surat ini datang dari mana.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(merek.nama, W / 2, 13, { align: 'center' })
    if (merek.kontak) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.setTextColor(90, 102, 115)
      doc.text(merek.kontak, W / 2, 18, { align: 'center' })
    }
  } else {
    let teksX = M
    if (merek.logo) {
      try {
        doc.addImage(merek.logo, 'PNG', M, 7, 20, 20)
        teksX = M + 25
      } catch { /* logo tidak terbaca — lanjut tanpa logo */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(merek.nama, teksX, 14)
    if (merek.kontak) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.setTextColor(90, 102, 115)
      doc.text(doc.splitTextToSize(merek.kontak, contentW - (teksX - M))[0], teksX, 19.5)
    }
  }

  // Garis tipis sebagai pemisah kop — penanda kepala surat tanpa blok warna.
  doc.setDrawColor(13, 27, 42); doc.setLineWidth(0.6)
  doc.line(M, tinggiKop, W - M, tinggiKop)
  doc.setLineWidth(0.2)

  doc.setTextColor(13, 27, 42)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text('PURCHASE ORDER', W / 2, tinggiKop + 8, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(90, 102, 115)
  doc.text(`Nomor: ${po.nomor}`, W / 2, tinggiKop + 13, { align: 'center' })

  doc.setTextColor(20, 30, 40)
  y = tinggiKop + 21

  // ── Dua kolom: kepada vendor & data PO ──
  const colW = contentW / 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('KEPADA:', M, y)
  doc.text('DATA PESANAN:', M + colW, y)
  y += 4.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)

  const kiri = [
    po.vendor_nama || '-',
    po.vendor_wa ? `WA: ${po.vendor_wa}` : '',
  ].filter(Boolean)
  const kanan = [
    `Tanggal      : ${tgl(po.tanggal)}`,
    `Dibutuhkan   : ${tgl(po.butuh_tanggal)}`,
    `Pembayaran   : ${teksTerm(po.term, po.term_hari)}`,
    po.project_name ? `Proyek       : ${po.project_name}` : '',
  ].filter(Boolean)

  const barisKiri = kiri.flatMap(t => doc.splitTextToSize(t, colW - 4) as string[])
  barisKiri.forEach((t, i) => doc.text(t, M, y + i * 4.2))
  kanan.forEach((t, i) => doc.text(t, M + colW, y + i * 4.2))
  y += Math.max(barisKiri.length, kanan.length) * 4.2 + 6

  // ── Tabel barang ──
  ensure(20)
  const kolom = [
    { label: 'No', w: 10, align: 'center' as const },
    { label: 'Nama Barang', w: contentW - 10 - 20 - 16 - 28 - 30, align: 'left' as const },
    { label: 'Qty', w: 16, align: 'right' as const },
    { label: 'Satuan', w: 20, align: 'center' as const },
    { label: 'Harga', w: 28, align: 'right' as const },
    { label: 'Jumlah', w: 30, align: 'right' as const },
  ]
  const posX: number[] = []
  let acc = M
  for (const k of kolom) { posX.push(acc); acc += k.w }

  const kepalaTabel = () => {
    doc.setFillColor(240, 243, 246)
    doc.rect(M, y - 4.5, contentW, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    kolom.forEach((k, i) => {
      const x = k.align === 'right' ? posX[i] + k.w - 1.5
        : k.align === 'center' ? posX[i] + k.w / 2 : posX[i] + 1.5
      doc.text(k.label, x, y, { align: k.align })
    })
    y += 5
    doc.setFont('helvetica', 'normal')
  }
  y += 4.5
  kepalaTabel()

  const items = po.items ?? []
  items.forEach((it, n) => {
    const nama = doc.splitTextToSize(it.nama || '-', kolom[1].w - 3) as string[]
    const tinggi = Math.max(4.6, nama.length * 4)
    if (y + tinggi > 272) { doc.addPage(); y = 20; kepalaTabel() }
    doc.setFontSize(8)
    doc.text(String(n + 1), posX[0] + kolom[0].w / 2, y, { align: 'center' })
    nama.forEach((t, i) => doc.text(t, posX[1] + 1.5, y + i * 4))
    doc.text(String(it.qty ?? 0), posX[2] + kolom[2].w - 1.5, y, { align: 'right' })
    doc.text(it.satuan || '-', posX[3] + kolom[3].w / 2, y, { align: 'center' })
    doc.text(fmt(it.harga), posX[4] + kolom[4].w - 1.5, y, { align: 'right' })
    doc.text(fmt(it.subtotal), posX[5] + kolom[5].w - 1.5, y, { align: 'right' })
    y += tinggi
    doc.setDrawColor(226, 232, 240)
    doc.line(M, y - 1.2, M + contentW, y - 1.2)
  })

  if (items.length === 0) {
    doc.setFontSize(8); doc.setTextColor(120, 130, 145)
    doc.text('(tidak ada barang)', M + contentW / 2, y, { align: 'center' })
    doc.setTextColor(20, 30, 40)
    y += 6
  }

  // ── Ringkasan nilai ──
  ensure(24)
  y += 3
  const labelX = M + contentW - 62
  const nilaiX = M + contentW
  const baris: Array<[string, string, boolean]> = [
    ['Subtotal', fmt(po.subtotal), false],
    ...(po.ppn_pct > 0
      ? [[`PPN ${po.ppn_pct}%`, fmt(po.ppn), false] as [string, string, boolean]]
      : []),
    ['TOTAL', fmt(po.total), true],
  ]
  for (const [label, nilai, tebal] of baris) {
    doc.setFont('helvetica', tebal ? 'bold' : 'normal')
    doc.setFontSize(tebal ? 10 : 8.5)
    if (tebal) {
      doc.setDrawColor(13, 27, 42)
      doc.line(labelX, y - 4, nilaiX, y - 4)
    }
    doc.text(label, labelX, y)
    doc.text(nilai, nilaiX, y, { align: 'right' })
    y += tebal ? 7 : 4.8
  }

  // ── Catatan ──
  if (po.catatan) {
    ensure(14)
    y += 2
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
    doc.text('Catatan:', M, y); y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    const isi = doc.splitTextToSize(po.catatan, contentW) as string[]
    doc.text(isi, M, y); y += isi.length * 4 + 2
  }

  // ── Dua tanda tangan: pembuat & yang menyetujui ──
  ensure(46)
  y += 4
  const kiriX = M
  const kananX = M + colW
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Dibuat oleh,', kiriX + colW / 2, y, { align: 'center' })
  doc.text('Disetujui oleh,', kananX + colW / 2, y, { align: 'center' })
  doc.setFontSize(7.5); doc.setTextColor(90, 102, 115)
  doc.text(po.pembuat_jabatan || 'Pembuat PO', kiriX + colW / 2, y + 4, { align: 'center' })
  doc.text(po.approver_jabatan || 'Owner / Project Manager', kananX + colW / 2, y + 4, { align: 'center' })
  doc.setTextColor(20, 30, 40)

  const sigY = y + 7
  if (po.pembuat_signature) {
    try { doc.addImage(po.pembuat_signature, 'PNG', kiriX + colW / 2 - 22, sigY, 44, 20) } catch { /* skip */ }
  }
  if (po.approver_signature) {
    try { doc.addImage(po.approver_signature, 'PNG', kananX + colW / 2 - 22, sigY, 44, 20) } catch { /* skip */ }
  }
  y = sigY + 24
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text(`( ${po.pembuat_nama || '________________'} )`, kiriX + colW / 2, y, { align: 'center' })
  doc.text(`( ${po.approver_nama || '________________'} )`, kananX + colW / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90, 102, 115)
  if (po.pembuat_signed_at) {
    doc.text(`Digital ${new Date(po.pembuat_signed_at).toLocaleString('id-ID')}`, kiriX + colW / 2, y + 4, { align: 'center' })
  }
  if (po.approver_signed_at) {
    doc.text(`Digital ${new Date(po.approver_signed_at).toLocaleString('id-ID')}`, kananX + colW / 2, y + 4, { align: 'center' })
  }

  // ── Watermark: HANYA paket gratis. Paket berbayar dicetak bersih. ──
  if (perluWatermark(konteks)) {
    const jml = doc.getNumberOfPages()
    for (let i = 1; i <= jml; i++) {
      doc.setPage(i)
      doc.saveGraphicsState()
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

  doc.save(`${(po.nomor || 'PO').replace(/[^\w-]+/g, '_')}.pdf`)
}
