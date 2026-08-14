// Cetak Purchase Order ke PDF A4 (jspdf) — kop perusahaan, data vendor,
// rincian barang, ringkasan nilai, dan dua blok tanda tangan (pembuat &
// yang menyetujui). Mengikuti pola src/lib/spkPdf.ts agar tampilannya sebangun
// dengan SPK yang sudah dipakai.
import { jsPDF } from 'jspdf'
import { teksTerm, type PurchaseOrder } from './procurement'
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
 * @param kop identitas yang dicetak di kepala surat. Diisi eksplisit oleh
 *   halaman PO publik: vendor membukanya tanpa login, jadi cache lokal dan
 *   sesi — keduanya milik perangkat pemakai aplikasi — tidak bisa dipakai.
 */
export function downloadPoPdf(po: PurchaseOrder, kop?: IdentitasLaporan): void {
  buatPoPdf(po, kop).save(`${(po.nomor || 'PO').replace(/[^\w-]+/g, '_')}.pdf`)
}

/**
 * Susun dokumen PO tanpa mengunduhnya.
 *
 * Dipisah dari `downloadPoPdf` supaya hasilnya bisa DILIHAT saat diuji —
 * cacat tata letak seperti garis tabel yang tidak rapi tidak akan pernah
 * ketahuan dari membaca kode, hanya dari memandang halamannya.
 */
export function buatPoPdf(po: PurchaseOrder, kop?: IdentitasLaporan): jsPDF {
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
  //
  // Digambar sebagai KISI sungguhan: bingkai luar, garis kolom, dan garis
  // antar-baris. Sebelumnya hanya ada garis mendatar tipis di bawah tiap
  // baris, digambar pada `y - 1.2` SETELAH y dimajukan — dan karena teks baris
  // berikutnya menjulang ~2,8 mm di atas garis dasarnya, garis itu memotong
  // huruf baris di bawahnya. Terlihat jelas begitu halamannya dipandang, tidak
  // pernah terlihat dari membaca kodenya.
  //
  // Semua ukuran di bawah dinyatakan sebagai TINGGI SEL, bukan jarak antar
  // garis dasar, supaya baris yang teksnya membungkus dua baris punya napas
  // atas-bawah yang sama dengan baris biasa.
  ensure(24)
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

  const PAD = 2.1            // napas atas & bawah di dalam sel
  const BARIS_TEKS = 3.9     // jarak antar baris teks yang membungkus
  const NAIK_TEKS = 2.9      // tinggi huruf di atas garis dasar pada 8 pt
  const T_KEPALA = 7.4
  const BATAS = 268

  const GARIS_KISI: [number, number, number] = [203, 213, 225]
  const GARIS_TEPI: [number, number, number] = [148, 163, 184]

  /** Garis kolom + bingkai luar untuk potongan tabel di halaman berjalan. */
  const tutupKisi = (atas: number, bawah: number) => {
    if (bawah <= atas) return
    doc.setLineWidth(0.15)
    doc.setDrawColor(...GARIS_KISI)
    for (let i = 1; i < kolom.length; i++) doc.line(posX[i], atas, posX[i], bawah)
    doc.setLineWidth(0.3)
    doc.setDrawColor(...GARIS_TEPI)
    doc.rect(M, atas, contentW, bawah - atas)
  }

  let atasKisi = 0
  const kepalaTabel = () => {
    atasKisi = y
    doc.setFillColor(238, 242, 247)
    doc.rect(M, y, contentW, T_KEPALA, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.setTextColor(13, 27, 42)
    const dasar = y + T_KEPALA / 2 + NAIK_TEKS / 2
    kolom.forEach((k, i) => {
      const x = k.align === 'right' ? posX[i] + k.w - 2
        : k.align === 'center' ? posX[i] + k.w / 2 : posX[i] + 2
      doc.text(k.label, x, dasar, { align: k.align })
    })
    y += T_KEPALA
    // Garis bawah kepala: pembatas tegas antara judul kolom dan isinya.
    doc.setLineWidth(0.3); doc.setDrawColor(...GARIS_TEPI)
    doc.line(M, y, M + contentW, y)
    doc.setFont('helvetica', 'normal')
  }

  y += 2
  kepalaTabel()

  const items = po.items ?? []
  doc.setFontSize(8)
  items.forEach((it, n) => {
    const nama = doc.splitTextToSize(it.nama || '-', kolom[1].w - 4) as string[]
    const tinggi = Math.max(6.6, nama.length * BARIS_TEKS + PAD * 2)

    if (y + tinggi > BATAS) {
      tutupKisi(atasKisi, y)
      doc.addPage(); y = 20
      kepalaTabel()
      doc.setFontSize(8)
    }

    // Garis dasar baris pertama sel — dihitung dari ATAS sel, bukan dari
    // posisi garis sebelumnya.
    const dasar = y + PAD + NAIK_TEKS
    doc.setTextColor(20, 30, 40)
    doc.text(String(n + 1), posX[0] + kolom[0].w / 2, dasar, { align: 'center' })
    nama.forEach((t, i) => doc.text(t, posX[1] + 2, dasar + i * BARIS_TEKS))
    doc.text(String(it.qty ?? 0), posX[2] + kolom[2].w - 2, dasar, { align: 'right' })
    doc.text(it.satuan || '-', posX[3] + kolom[3].w / 2, dasar, { align: 'center' })
    doc.text(fmt(it.harga), posX[4] + kolom[4].w - 2, dasar, { align: 'right' })
    doc.text(fmt(it.subtotal), posX[5] + kolom[5].w - 2, dasar, { align: 'right' })

    y += tinggi
    // Pemisah baris tepat DI BATAS sel — tidak lagi menempel ke teks mana pun.
    if (n < items.length - 1) {
      doc.setLineWidth(0.15); doc.setDrawColor(...GARIS_KISI)
      doc.line(M, y, M + contentW, y)
    }
  })

  if (items.length === 0) {
    // Ditaruh di TENGAH KOLOM nama, bukan di tengah tabel: di tengah tabel
    // teksnya jatuh persis di atas garis kolom dan terlihat seperti cacat
    // cetak, bukan keterangan.
    doc.setFontSize(8); doc.setTextColor(120, 130, 145)
    doc.text('(tidak ada barang)', posX[1] + kolom[1].w / 2, y + PAD + NAIK_TEKS, { align: 'center' })
    doc.setTextColor(20, 30, 40)
    y += 9
  }

  tutupKisi(atasKisi, y)
  doc.setLineWidth(0.2)

  // ── Ringkasan nilai ──
  //
  // Digambar sebagai kotak yang MENYAMBUNG tepi kanan tabel barang, bukan
  // sebagai teks melayang dengan satu garis di atas TOTAL. Vendor membaca
  // angka ini paling akhir dan paling teliti; ia harus terlihat sebagai bagian
  // dari tabel yang sama, bukan catatan tambahan.
  ensure(30)
  const lebarRingkas = 78
  const kiriRingkas = M + contentW - lebarRingkas
  const labelX = kiriRingkas + 3
  const nilaiX = M + contentW - 3

  const baris: Array<[string, string, boolean]> = [
    ['Subtotal', fmt(po.subtotal), false],
    ...(po.ppn_pct > 0
      ? [[`PPN ${po.ppn_pct}%`, fmt(po.ppn), false] as [string, string, boolean]]
      : []),
    ['TOTAL', fmt(po.total), true],
  ]

  const T_RINGKAS = 6.4
  const T_TOTAL = 8.6
  const atasRingkas = y
  for (const [label, nilai, tebal] of baris) {
    const tinggi = tebal ? T_TOTAL : T_RINGKAS
    if (tebal) {
      doc.setFillColor(238, 242, 247)
      doc.rect(kiriRingkas, y, lebarRingkas, tinggi, 'F')
    }
    doc.setFont('helvetica', tebal ? 'bold' : 'normal')
    doc.setFontSize(tebal ? 10 : 8.5)
    doc.setTextColor(13, 27, 42)
    const dasar = y + tinggi / 2 + (tebal ? 1.8 : 1.4)
    doc.text(label, labelX, dasar)
    doc.text(nilai, nilaiX, dasar, { align: 'right' })
    y += tinggi
    if (!tebal) {
      doc.setLineWidth(0.15); doc.setDrawColor(203, 213, 225)
      doc.line(kiriRingkas, y, M + contentW, y)
    }
  }
  doc.setLineWidth(0.3); doc.setDrawColor(148, 163, 184)
  doc.rect(kiriRingkas, atasRingkas, lebarRingkas, y - atasRingkas)
  doc.setLineWidth(0.2)
  doc.setFont('helvetica', 'normal')
  y += 6

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


  return doc
}
