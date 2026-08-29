// ============================================================
// PropFS — Daftar upah yang bisa dicetak, berikut absensinya
//
// Daftar gaji yang hanya berupa angka total tidak bisa dipertanggungjawabkan.
// Tukang yang merasa dibayar kurang bertanya "berapa hari saya masuk?", dan
// selembar kertas bertuliskan satu jumlah tidak menjawab apa pun — yang
// menjawab hanya rekap absensinya, dan rekap itu tinggal di layar orang lain.
//
// Karena itu kedua-duanya dicetak di dokumen yang SAMA: daftar upahnya di
// halaman depan, rincian kehadiran per orang di belakangnya. Dua berkas
// terpisah akan terpisah juga nasibnya — yang satu ikut dibawa, yang satu
// tertinggal, tepat pada saat perselisihannya terjadi.
//
// Ada juga slip per orang, karena itu yang benar-benar diserahkan: seorang
// tukang tidak perlu — dan tidak seharusnya — melihat upah rekan-rekannya.
// ============================================================
import { jsPDF } from 'jspdf'
import { simpanPdf } from './unduhBerkas'
import type { IdentitasLaporan } from './branding'
import { labelStatus } from './absensiPekerja'
import type { UpahPekerja } from './pekerjaLapangan'

const rp = (n: number) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`

/**
 * Nilai upah untuk dicetak.
 *
 * Borongan dicetak sebagai TULISAN, bukan angka. Mencetak "Rp 0" untuk orang
 * yang dibayar borongan adalah pernyataan yang salah di atas kertas yang ia
 * bawa pulang — dan kertas jauh lebih sulit diralat daripada layar.
 */
export function nilaiUpahCetak(r: { upah: number | null; jenis: string }): string {
  if (r.jenis === 'borongan' || r.upah === null) return 'Borongan'
  return rp(r.upah)
}

export interface IsiUpah {
  judul: string
  periode: string
  namaProyek: string
  baris: UpahPekerja[]
  totalUpah: number
  totalHok: number
  jumlahBorongan: number
  /** Rincian kehadiran per tanggal, untuk halaman lampiran. */
  rincian?: Array<{ tanggal: string; nama: string; status: string; lembur: number }>
}

function kop(doc: jsPDF, merek: IdentitasLaporan, isi: IsiUpah, W: number, M: number): number {
  doc.setFillColor(13, 27, 42)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  let x = M
  if (!merek.bawaan && merek.logo) {
    try { doc.addImage(merek.logo, 'PNG', M, 4, 16, 16); x = M + 21 } catch { /* logo tidak terbaca */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(merek.bawaan ? 'PropFS' : merek.nama, x, 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  if (merek.kontak) doc.text(doc.splitTextToSize(merek.kontak, W - x - M)[0], x, 15.5)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(isi.judul.toUpperCase(), W - M, 11, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(isi.periode, W - M, 15.5, { align: 'right' })

  doc.setTextColor(20, 30, 40)
  let y = 32
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(isi.namaProyek || 'Proyek', M, y)
  y += 6
  return y
}

/**
 * Daftar upah satu periode, A4 tegak.
 *
 * Tegak, bukan melintang: yang membacanya menandatangani kolom paling kanan
 * satu per satu, dan tangan yang memegang pena bergerak turun — bukan
 * menyeberang.
 */
export function buatUpahPdf(isi: IsiUpah, merek: IdentitasLaporan): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W = 210, H = 297, M = 15
  let y = kop(doc, merek, isi, W, M)

  // Lebar kolom. Kolom TANDA TANGAN sengaja paling lebar setelah nama:
  // daftar upah tanpa tempat tanda tangan bukan bukti pembayaran, hanya
  // hitungan — dan yang dibutuhkan ketika ada yang menyangkal sudah dibayar
  // justru tanda tangannya.
  const kol = [
    { t: 'Nama', w: 42 }, { t: 'Peran', w: 26 }, { t: 'HOK', w: 13 },
    { t: 'Lembur', w: 15 }, { t: 'Upah/Hari', w: 26 }, { t: 'Jumlah', w: 28 },
    { t: 'Tanda Tangan', w: 30 },
  ]

  const barisKepala = () => {
    doc.setFillColor(240, 242, 245)
    doc.rect(M, y, W - 2 * M, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    let x = M + 2
    for (const c of kol) { doc.text(c.t, x, y + 4.7); x += c.w }
    y += 7
  }
  barisKepala()

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  for (const r of isi.baris) {
    // Halaman baru SEBELUM barisnya digambar, bukan sesudah. Baris yang
    // separuhnya jatuh ke tepi bawah membuat angka upah terpotong — dan yang
    // terpotong di atas kertas tidak bisa digulir untuk dilihat sisanya.
    if (y > H - 40) {
      doc.addPage(); y = kop(doc, merek, isi, W, M); barisKepala()
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    }
    let x = M + 2
    const sel = [
      doc.splitTextToSize(r.nama, kol[0].w - 3)[0] ?? '',
      doc.splitTextToSize(r.peran || '-', kol[1].w - 3)[0] ?? '',
      String(r.hok),
      r.jamLembur ? `${r.jamLembur} jam` : '-',
      r.jenis === 'borongan' ? '-' : rp(r.upahHarian),
      nilaiUpahCetak(r),
    ]
    sel.forEach((t, i) => { doc.text(t, x, y + 4.5); x += kol[i].w })
    // Garis tanda tangan, bukan kotak kosong: garis memberi tahu di mana
    // penanya harus turun.
    doc.setDrawColor(190, 196, 204)
    doc.line(x, y + 5.5, x + kol[6].w - 4, y + 5.5)
    doc.setDrawColor(226, 230, 235)
    doc.line(M, y + 7, W - M, y + 7)
    y += 7.5
  }

  y += 3
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.text(`TOTAL (${isi.baris.length} pekerja · ${isi.totalHok} HOK)`, M + 2, y + 4)
  doc.text(rp(isi.totalUpah), M + 2 + kol[0].w + kol[1].w + kol[2].w + kol[3].w + kol[4].w, y + 4)
  y += 9

  // Borongan disebut TERANG-TERANGAN, karena kalau tidak, total yang lebih
  // kecil daripada jumlah orang di daftar terbaca seperti kesalahan hitung.
  if (isi.jumlahBorongan > 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7)
    doc.setTextColor(110, 120, 130)
    doc.text(
      `${isi.jumlahBorongan} pekerja borongan tidak ikut dalam total di atas —`
      + ' upahnya dihitung per pekerjaan, bukan per hari.', M, y)
    doc.setTextColor(20, 30, 40)
    y += 6
  }

  if (isi.rincian?.length) lampiranAbsensi(doc, isi, merek, W, H, M)
  return doc
}

/**
 * Halaman lampiran: kehadiran per tanggal.
 *
 * Inilah yang menjawab "berapa hari saya masuk". Tanpa halaman ini, daftar
 * upahnya hanya sebuah jumlah yang harus dipercaya.
 */
function lampiranAbsensi(
  doc: jsPDF, isi: IsiUpah, merek: IdentitasLaporan, W: number, H: number, M: number,
): void {
  doc.addPage()
  let y = kop(doc, merek, { ...isi, judul: 'Lampiran — Absensi' }, W, M)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.setTextColor(110, 120, 130)
  doc.text('Rincian kehadiran yang menjadi dasar hitungan upah di halaman depan.', M, y)
  doc.setTextColor(20, 30, 40)
  y += 6

  const kol = [{ t: 'Tanggal', w: 30 }, { t: 'Nama', w: 70 }, { t: 'Status', w: 42 }, { t: 'Lembur', w: 28 }]
  const kepala = () => {
    doc.setFillColor(240, 242, 245); doc.rect(M, y, W - 2 * M, 6.5, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    let x = M + 2
    for (const c of kol) { doc.text(c.t, x, y + 4.4); x += c.w }
    y += 6.5
    doc.setFont('helvetica', 'normal')
  }
  kepala()

  for (const b of isi.rincian ?? []) {
    if (y > H - 20) {
      doc.addPage(); y = kop(doc, merek, { ...isi, judul: 'Lampiran — Absensi' }, W, M); kepala()
    }
    let x = M + 2
    const sel = [
      b.tanggal,
      doc.splitTextToSize(b.nama, kol[1].w - 3)[0] ?? '',
      labelStatus(b.status),
      b.lembur ? `${b.lembur} jam` : '-',
    ]
    sel.forEach((t, i) => { doc.text(t, x, y + 4.3); x += kol[i].w })
    doc.setDrawColor(232, 236, 240); doc.line(M, y + 6, W - M, y + 6)
    y += 6.5
  }
}

/** Nama berkas, aman untuk sistem berkas mana pun. */
export function namaFileUpah(namaProyek: string, periode: string): string {
  const aman = (s: string) => String(s ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_')
  return `Upah_${aman(namaProyek) || 'Proyek'}_${aman(periode) || 'Periode'}.pdf`
}

export async function unduhUpahPdf(isi: IsiUpah, merek: IdentitasLaporan): Promise<boolean> {
  return await simpanPdf(buatUpahPdf(isi, merek), namaFileUpah(isi.namaProyek, isi.periode))
}
