// ============================================================
// PropFS — Angka yang diketik tidak boleh dikembalikan ke nilai lama
//
// `RupiahInput` menyimpan dua kebenaran: `value` dari induknya, dan
// `displayValue` miliknya sendiri. Dua cacat membuat keduanya berselisih, dan
// yang terlihat pemakai adalah angka yang "balik ke harga default terus".
//
// PERTAMA — saat kehilangan fokus:
//
//     const num = parseDisplay(displayValue) || value
//
// `|| value` menyalakan diri ketika hasil bacanya NOL. Mengosongkan kolom
// untuk mengetik harga baru menghasilkan nol, sehingga nilai LAMA dipasang
// kembali ke layar — sementara induknya sudah menerima nol. Sejak itu yang
// tampil dan yang tersimpan berbeda, dan pemakainya mengetik ulang berkali-
// kali sambil melihat angka lama kembali muncul.
//
// KEDUA — saat mengetik:
//
//     if (min !== undefined && num < min) return
//
// Berhenti TANPA memperbarui apa pun. Setiap ketukan yang untuk sementara
// menghasilkan angka di bawah batas ditelan — dan mengetik "3.500.000" selalu
// melewati "3" lebih dulu. Kolomnya tampak macet pada nilai lamanya.
//
// Belum ada yang memakai `min`/`max` hari ini, tetapi jebakannya sudah
// terpasang: pemakai pertama yang menyetelnya akan menemukan kolomnya tidak
// bisa diketik sama sekali, dan tidak ada galat yang menunjuk ke sini.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

/** Baca angka dari tulisan bergaya Indonesia: titik = ribuan. */
export function bacaAngkaRupiah(teks: unknown): number {
  const t = String(teks ?? '').replace(/[^\d]/g, '')
  if (!t) return 0
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : 0
}

export function tampilRupiah(n: unknown): string {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v.toLocaleString('id-ID') : ''
}

export interface HasilKetik {
  /** Angka yang diteruskan ke induk. */
  nilai: number
  /** Yang ditampilkan di kolom. */
  tampil: string
  /** Angkanya dipotong oleh batas — kosong bila tidak. */
  alasan: string
}

/**
 * Olah satu ketukan.
 *
 * TIDAK PERNAH berhenti tanpa hasil. Angka di luar batas DIPOTONG dan
 * sebabnya dikembalikan — bukan diabaikan. Mengabaikannya berarti kolom yang
 * tidak bisa diketik sama sekali, karena setiap angka besar selalu melewati
 * angka kecil di tengah jalan.
 */
export function ketikRupiah(
  mentah: unknown, batas: { min?: number; max?: number } = {},
): HasilKetik {
  const n = bacaAngkaRupiah(mentah)
  const { min, max } = batas

  if (max !== undefined && n > max) {
    return { nilai: max, tampil: tampilRupiah(max), alasan: `Maksimal ${tampilRupiah(max)}.` }
  }
  // Batas bawah TIDAK dipaksakan saat mengetik, hanya saat selesai. Memaksanya
  // di tiap ketukan membuat angka apa pun yang lebih besar mustahil diketik:
  // "3.500.000" selalu melewati "3" lebih dulu.
  return { nilai: n, tampil: tampilRupiah(n), alasan: '' }
}

/**
 * Olah saat kolom ditinggalkan.
 *
 * Yang tampil dan yang tersimpan DISAMAKAN, dan yang menang adalah yang
 * diketik — termasuk ketika yang diketik adalah kosong. Kolom yang sengaja
 * dikosongkan berarti nol; mengembalikan nilai lama ke sana adalah menolak
 * perubahan yang jelas-jelas disengaja.
 */
export function selesaiKetik(
  tampilSekarang: unknown, batas: { min?: number; max?: number } = {},
): HasilKetik {
  const n = bacaAngkaRupiah(tampilSekarang)
  const { min, max } = batas

  if (max !== undefined && n > max) {
    return { nilai: max, tampil: tampilRupiah(max), alasan: `Maksimal ${tampilRupiah(max)}.` }
  }
  // Batas bawah baru berlaku di sini — dan hanya bila kolomnya memang diisi.
  // Kolom kosong berarti nol yang disengaja, bukan pelanggaran batas bawah.
  if (min !== undefined && n > 0 && n < min) {
    return { nilai: min, tampil: tampilRupiah(min), alasan: `Minimal ${tampilRupiah(min)}.` }
  }
  return { nilai: n, tampil: tampilRupiah(n), alasan: '' }
}
