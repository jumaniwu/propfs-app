// ============================================================
// PropFS — Revisi Purchase Order, dan alamat pengirimannya
//
// CACAT YANG DIPERBAIKI BERKAS INI.
//
// PO memesan 5 ikat kayu. Yang datang 2, dan itu disepakati dengan vendornya
// — sisanya memang tidak jadi. Sampai sekarang PO-nya tetap berdiri di angka
// 5, dan akibatnya berantai:
//
//   - Tagihan vendor untuk 2 ikat selamanya terbaca "kurang bayar".
//   - Sisa hutang yang tidak pernah ada ikut ke laporan keuangan.
//   - Penerimaan selamanya berstatus "datang sebagian", jadi PO itu tidak
//     pernah bisa ditutup dan menumpuk di daftar sebagai pekerjaan tertunda.
//
// Revisi memperbaiki ketiganya sekaligus dengan satu tindakan: menurunkan PO
// ke jumlah yang benar-benar datang.
//
// KENAPA REVISI DI TEMPAT, BUKAN PO BARU. Delivery Order dan pembayaran sudah
// menempel pada PO ini. PO baru memecah keduanya menjadi dua utas yang harus
// dijumlahkan tangan. Dan nomor PO sudah tersebar di WhatsApp vendor — nomor
// baru untuk barang yang sama membuat vendor mengira ada pesanan tambahan.
//
// Yang lama tidak hilang: keadaan sebelum tiap revisi disimpan utuh, dan
// nomornya diberi penanda -Rev1, -Rev2, … supaya dua cetakan PO yang sama
// nomornya tidak pernah tertukar di meja orang.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

import type { PoItem, PurchaseOrder } from './procurement.ts'

/** Berapa kali sebuah PO sudah direvisi. Nol untuk PO yang belum pernah. */
export function revisiKe(po: { revisi_ke?: number | null } | null | undefined): number {
  const n = Number(po?.revisi_ke)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Nomor PO seperti yang harus terbaca orang: `PO/006/08/2026-Rev1`.
 *
 * Penanda ini DITURUNKAN, tidak disimpan. Nomor di basis data tetap polos
 * supaya tetap bisa dicocokkan dengan invoice dan pesan WhatsApp yang sudah
 * terkirim sebelum revisinya ada — dan supaya revisi kedua tidak pernah
 * menghasilkan `PO/006/08/2026-Rev1-Rev2`.
 */
export function nomorPoTampil(
  po: { nomor?: string | null; revisi_ke?: number | null } | null | undefined,
): string {
  const dasar = String(po?.nomor ?? '').trim() || 'PO'
  const ke = revisiKe(po)
  return ke > 0 ? `${dasar}-Rev${ke}` : dasar
}

/** Sudah pernah direvisi? Dipakai untuk memunculkan lencana di daftar. */
export function poDirevisi(po: { revisi_ke?: number | null } | null | undefined): boolean {
  return revisiKe(po) > 0
}

/** Satu baris penerimaan yang dibutuhkan penyusun revisi. */
export interface KurangBarang {
  nama: string
  satuan: string
  dipesan: number
  diterima: number
  kurang: number
}

/**
 * Susun item PO hasil revisi: qty diturunkan ke jumlah yang BENAR-BENAR datang.
 *
 * Barang yang tidak datang sama sekali TIDAK dibuang dari daftar, melainkan
 * dibiarkan berjumlah nol dan disaring belakangan lewat `siapRevisiPo`.
 * Membuangnya di sini menghilangkan jejak bahwa ia pernah dipesan, dan orang
 * yang membaca revisinya berhak melihat apa yang batal.
 *
 * Harga satuan TIDAK disentuh. Revisi ini menjawab "berapa yang datang",
 * bukan "berapa harganya sekarang" — mengubah harga diam-diam saat menurunkan
 * jumlah adalah cara termudah membuat selisih yang tidak bisa dijelaskan.
 */
export function itemRevisiDariKurang(
  items: PoItem[] | null | undefined,
  terima: KurangBarang[] | null | undefined,
): PoItem[] {
  const datang = new Map<string, number>()
  for (const b of terima ?? []) {
    const k = kunci(b?.nama)
    if (k) datang.set(k, Math.max(0, angka(b.diterima)))
  }
  return (items ?? []).map(it => {
    const qtyBaru = datang.has(kunci(it.nama)) ? datang.get(kunci(it.nama))! : angka(it.qty)
    return { ...it, qty: qtyBaru, subtotal: bulatRupiah(qtyBaru * angka(it.harga)) }
  })
}

function kunci(nama: unknown): string {
  return String(nama ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}
function angka(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}
/** Rupiah tidak punya sen. Membiarkan pecahan membuat total PO dan total
 *  tagihan berbeda beberapa perak, dan selisih itu tidak pernah bisa
 *  dijelaskan kepada siapa pun. */
function bulatRupiah(n: number): number {
  return Math.round(angka(n))
}

export interface PeriksaRevisi {
  boleh: boolean
  alasan: string
}

/**
 * Apakah PO ini boleh direvisi sama sekali.
 *
 * PO yang DITOLAK tidak direvisi — ia sudah mati, dan yang dibutuhkan adalah
 * PO baru. PO DRAFT juga tidak: ia belum pernah dikirim ke siapa pun, jadi
 * angkanya cukup diubah biasa lewat Ubah, tanpa meninggalkan riwayat revisi
 * atas dokumen yang belum pernah ada di luar kantor.
 */
export function bolehRevisiPo(
  po: Pick<PurchaseOrder, 'status'> | null | undefined,
): PeriksaRevisi {
  const s = String(po?.status ?? '')
  if (!s) return { boleh: false, alasan: 'PO tidak ditemukan.' }
  if (s === 'ditolak') {
    return { boleh: false, alasan: 'PO yang ditolak tidak direvisi — buat PO baru.' }
  }
  if (s === 'draft') {
    return { boleh: false, alasan: 'PO masih draft — ubah langsung barangnya, belum perlu revisi.' }
  }
  return { boleh: true, alasan: '' }
}

/**
 * Apakah isi revisi yang disusun layak disimpan.
 *
 * Yang ditolak, dan alasannya masing-masing:
 *  - Tanpa alasan tertulis. Revisi mengubah jumlah uang; enam bulan lagi tidak
 *    ada yang ingat kenapa angkanya berubah, dan yang tersisa hanyalah PO yang
 *    kelihatan diutak-atik.
 *  - Semua barang nol. Itu bukan revisi melainkan pembatalan, dan pembatalan
 *    punya jalannya sendiri.
 *  - Tidak ada yang berubah. Menyimpan revisi kosong menambah satu baris
 *    riwayat yang hanya membuat orang mengira ada sesuatu yang terjadi.
 */
export function siapRevisiPo(input: {
  lama: PoItem[] | null | undefined
  baru: PoItem[] | null | undefined
  alasan: string
}): PeriksaRevisi {
  const baru = (input.baru ?? []).filter(it => angka(it.qty) > 0)
  if (String(input.alasan ?? '').trim().length < 3) {
    return { boleh: false, alasan: 'Tulis alasan revisinya — nanti yang membaca perlu tahu kenapa.' }
  }
  if (baru.length === 0) {
    return { boleh: false, alasan: 'Semua barang berjumlah nol. Kalau memang batal, hapus PO-nya.' }
  }
  if (!adaPerubahan(input.lama, input.baru)) {
    return { boleh: false, alasan: 'Tidak ada yang berubah dari PO sebelumnya.' }
  }
  return { boleh: true, alasan: '' }
}

/** Apakah jumlah atau harga ada yang berbeda dari daftar sebelumnya. */
export function adaPerubahan(
  lama: PoItem[] | null | undefined,
  baru: PoItem[] | null | undefined,
): boolean {
  const a = lama ?? []
  const b = baru ?? []
  if (a.length !== b.length) return true
  const peta = new Map(a.map(it => [kunci(it.nama), it]))
  for (const it of b) {
    const asal = peta.get(kunci(it.nama))
    if (!asal) return true
    if (angka(asal.qty) !== angka(it.qty)) return true
    if (angka(asal.harga) !== angka(it.harga)) return true
  }
  return false
}

/**
 * Apakah revisi ini perlu disetujui ulang.
 *
 * Hanya bila totalnya NAIK. Menurunkan PO agar cocok dengan barang yang
 * benar-benar datang adalah koreksi terhadap kenyataan yang sudah terjadi —
 * memintanya menunggu tanda tangan kedua berarti menahan pembukuan atas
 * sesuatu yang tidak bisa diubah lagi. Menaikkannya adalah pesanan tambahan,
 * dan itu memang komitmen belanja baru.
 *
 * Aturan yang sama dijalankan di server (po_revisi); ini salinannya untuk
 * memberi tahu pemakainya SEBELUM ia menekan simpan.
 */
export function perluApprovalUlang(totalLama: number, totalBaru: number): boolean {
  return bulatRupiah(totalBaru) > bulatRupiah(totalLama)
}

/** Kalimat yang menerangkan akibat revisi, ditampilkan sebelum disimpan. */
export function akibatRevisi(totalLama: number, totalBaru: number): string {
  const lama = bulatRupiah(totalLama)
  const baru = bulatRupiah(totalBaru)
  if (baru === lama) return 'Total PO tidak berubah.'
  const selisih = Math.abs(baru - lama).toLocaleString('id-ID')
  return baru < lama
    ? `Total PO turun Rp ${selisih}. Tagihan vendor ikut menyesuaikan, dan PO ini bisa ditutup.`
    : `Total PO naik Rp ${selisih}. Karena bertambah, PO perlu disetujui ulang.`
}

// ── Riwayat ────────────────────────────────────────────────────────────────

export interface BarisRiwayatRevisi {
  ke: number
  pada: string
  oleh: string
  alasan: string
  items: PoItem[]
  subtotal: number
  ppn: number
  total: number
}

/** Baca riwayat revisi dari jsonb apa adanya; yang rusak dilewati diam-diam. */
export function bacaRiwayatRevisi(mentah: unknown): BarisRiwayatRevisi[] {
  if (!Array.isArray(mentah)) return []
  const out: BarisRiwayatRevisi[] = []
  for (const r of mentah) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    out.push({
      ke: angka(o.ke),
      pada: String(o.pada ?? ''),
      oleh: String(o.oleh ?? '').trim() || 'Tidak diketahui',
      alasan: String(o.alasan ?? '').trim(),
      items: Array.isArray(o.items) ? o.items as PoItem[] : [],
      subtotal: angka(o.subtotal),
      ppn: angka(o.ppn),
      total: angka(o.total),
    })
  }
  return out.sort((a, b) => b.ke - a.ke)
}

// ── Alamat pengiriman ──────────────────────────────────────────────────────

export interface AlamatKirim {
  nama: string
  wa: string
  alamat: string
  catatan: string
}

export const ALAMAT_KOSONG: AlamatKirim = { nama: '', wa: '', alamat: '', catatan: '' }

/**
 * Alamat kirim bawaan sebuah PO.
 *
 * Untuk PO PROYEK: alamat proyeklah tujuannya, dan itu sudah tersimpan sebagai
 * lokasi proyek. Mengetiknya ulang tiap kali membuat PO adalah pekerjaan yang
 * sudah dilakukan sekali, dan yang diketik ulang itulah yang salah ketik.
 *
 * Untuk PO ALAT dan KANTOR: barangnya diantar ke kantor, jadi alamat
 * perusahaan yang dipakai — bukan proyek mana pun.
 *
 * Nilainya hanya BAWAAN. Yang tersimpan di PO adalah apa yang akhirnya
 * tertulis di formulir, karena pengiriman sering ke gudang atau titik kumpul
 * yang bukan alamat resmi mana pun.
 */
export function alamatKirimAwal(input: {
  jenis?: string | null
  proyek?: { projectName?: string; location?: string } | null
  perusahaan?: { nama?: string; alamat?: string; telepon?: string } | null
  penerima?: { nama?: string; wa?: string } | null
}): AlamatKirim {
  const keProyek = String(input.jenis ?? 'proyek') === 'proyek'
  const proyek = input.proyek
  const per = input.perusahaan

  const alamat = keProyek
    ? teks(proyek?.location)
    : teks(per?.alamat)

  return {
    nama: teks(input.penerima?.nama),
    wa: rapikanWa(input.penerima?.wa ?? (keProyek ? '' : per?.telepon)),
    alamat,
    catatan: '',
  }
}

function teks(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Nomor WA yang bisa ditelepon sopir vendor.
 *
 * Dirapikan, TIDAK divalidasi keras: nomor yang ditulis "0812-3456-7890 (Pak
 * Indra)" tetap berguna bagi manusia yang membacanya di kertas, dan menolaknya
 * hanya membuat orang mengosongkan kolomnya.
 */
export function rapikanWa(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ')
}

export interface PeriksaAlamat {
  boleh: boolean
  alasan: string
}

/**
 * Alamat kirim boleh KOSONG.
 *
 * PO alat kecil yang diambil sendiri ke toko tidak punya alamat pengiriman,
 * dan memaksanya diisi hanya melahirkan alamat karangan yang lebih buruk
 * daripada kolom kosong. Yang diperiksa hanya: kalau ada nama penerima, harus
 * ada cara menghubunginya — nama tanpa nomor tidak menolong sopir yang
 * tersesat di depan gerbang.
 */
export function siapAlamatKirim(a: AlamatKirim | null | undefined): PeriksaAlamat {
  const nama = teks(a?.nama)
  const wa = teks(a?.wa)
  if (nama && !wa) {
    return { boleh: false, alasan: 'Isi nomor HP penerima — sopir vendor perlu bisa menghubunginya.' }
  }
  if (wa && !nama) {
    return { boleh: false, alasan: 'Isi nama penerimanya juga, jangan hanya nomor.' }
  }
  return { boleh: true, alasan: '' }
}

/** Apakah PO ini punya alamat kirim yang layak dicetak. */
export function adaAlamatKirim(po: {
  kirim_nama?: string | null; kirim_wa?: string | null
  kirim_alamat?: string | null; kirim_catatan?: string | null
} | null | undefined): boolean {
  return !!(teks(po?.kirim_nama) || teks(po?.kirim_wa) || teks(po?.kirim_alamat) || teks(po?.kirim_catatan))
}

/**
 * Apakah alamat kirim PO ini BERBEDA dari alamat proyeknya.
 *
 * Dipakai memunculkan keterangan "berbeda dari alamat proyek" — bukan sebagai
 * galat. Berbeda itu wajar (gudang, titik kumpul, rumah mandor); yang tidak
 * wajar adalah berbeda tanpa ada yang menyadarinya.
 */
export function alamatBerbedaDariProyek(
  alamatPo: unknown,
  lokasiProyek: unknown,
): boolean {
  const a = teks(alamatPo).toLowerCase()
  const b = teks(lokasiProyek).toLowerCase()
  if (!a || !b) return false
  return a !== b
}
