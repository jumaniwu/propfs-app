// ============================================================
// PropFS — Unit terjual yang diketik harus benar-benar tercatat
//
// Simulasi penjualan membatasi angka yang diketik dengan:
//
//     const clamped = Math.min(val, maxUnit - totalSudah, maxUnit)
//     if (clamped > 0) newPenjualan.push(...)
//
// Dua cacat di dua baris itu, dan keduanya DIAM.
//
// PERTAMA: ketika `maxUnit` masih 0 — jumlah unit tipe itu belum diisi, atau
// tipe apartemen yang unitnya dihitung dari data lain — `clamped` selalu 0,
// dan barisnya tidak pernah ditambahkan. Yang mengetik melihat angkanya
// kembali ke nol, mengetik lagi, kembali nol lagi. Tidak ada satu pun
// keterangan bahwa yang kurang adalah jumlah unitnya.
//
// KEDUA: bahkan ketika batasnya wajar, angka yang MELEBIHI sisa dipotong
// tanpa dikatakan. Yang mengetik 50 lalu melihat 30 menyangka aplikasinya
// salah hitung — padahal sisanya memang tinggal 30.
//
// Akibat gabungannya: `penjualan` tetap kosong, dan seluruh pendapatan
// terhitung Rp 0 selamanya. Itulah "hitungan pendapatan tidak mau hitung".
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BatasUnit {
  /** Angka yang benar-benar dicatat. */
  nilai: number
  /** Kosong bila angkanya diterima apa adanya. */
  alasan: string
  /** Jumlah unit tipe ini belum diisi — itu yang menghalangi, bukan angkanya. */
  perluJumlahUnit: boolean
}

/**
 * Berapa unit yang boleh dicatat, dan MENGAPA bila tidak sebanyak yang diketik.
 *
 * `maksUnit` bernilai 0 diperlakukan sebagai "belum diisi", BUKAN sebagai
 * "tidak boleh menjual satu pun". Bedanya menentukan: yang pertama punya
 * jalan keluar — isi jumlah unitnya — sementara yang kedua terdengar seperti
 * larangan tanpa sebab.
 */
export function batasUnit(
  diketik: unknown, maksUnit: unknown, sudahDiFaseLain: unknown,
): BatasUnit {
  const val = Math.max(0, Math.floor(angka(diketik)))
  const maks = Math.max(0, Math.floor(angka(maksUnit)))
  const lain = Math.max(0, Math.floor(angka(sudahDiFaseLain)))

  if (maks <= 0) {
    return {
      // Angkanya TETAP dicatat. Menolaknya berarti membuang pekerjaan orang
      // demi kolom lain yang belum diisi — dan kolom itu bisa diisi sesudahnya.
      nilai: val,
      alasan: val > 0
        ? 'Jumlah unit tipe ini belum diisi di Step 3, jadi belum bisa dicek batasnya.'
        : '',
      perluJumlahUnit: val > 0,
    }
  }

  const sisa = Math.max(0, maks - lain)
  if (val > sisa) {
    return {
      nilai: sisa,
      alasan: sisa === 0
        ? `Seluruh ${maks} unit tipe ini sudah dijadwalkan di fase lain.`
        : `Sisa unit tipe ini tinggal ${sisa} dari ${maks}.`,
      perluJumlahUnit: false,
    }
  }
  return { nilai: val, alasan: '', perluJumlahUnit: false }
}

export interface BarisJual { tipeId: string; fase: number; unitTerjual: number }

/**
 * Pasang satu angka ke jadwal penjualan.
 *
 * Nol DICATAT sebagai penghapusan baris, bukan diabaikan: mengosongkan sebuah
 * fase adalah perubahan yang disengaja, dan mengabaikannya membuat angka lama
 * menempel di sana tanpa bisa dihapus.
 */
export function pasangUnit(
  penjualan: BarisJual[] | null | undefined,
  tipeId: unknown, fase: unknown, unit: unknown,
): BarisJual[] {
  const id = String(tipeId ?? '').trim()
  const f = Math.floor(angka(fase))
  const n = Math.max(0, Math.floor(angka(unit)))
  if (!id || f <= 0) return [...(penjualan ?? [])]

  const sisa = (penjualan ?? []).filter(p => !(p.tipeId === id && p.fase === f))
  return n > 0 ? [...sisa, { tipeId: id, fase: f, unitTerjual: n }] : sisa
}

/** Berapa unit tipe ini sudah dijadwalkan di fase SELAIN yang sedang diisi. */
export function unitDiFaseLain(
  penjualan: BarisJual[] | null | undefined, tipeId: unknown, faseIni: unknown,
): number {
  const id = String(tipeId ?? '').trim()
  const f = Math.floor(angka(faseIni))
  return (penjualan ?? [])
    .filter(p => p.tipeId === id && p.fase !== f)
    .reduce((s, p) => s + Math.max(0, angka(p.unitTerjual)), 0)
}

/**
 * Kenapa pendapatan masih nol.
 *
 * Nol yang tidak dijelaskan adalah keluhan yang paling sering datang dari
 * layar ini: seluruh angka biaya terisi, dan satu-satunya baris yang penting
 * berbunyi Rp 0 tanpa sebab yang bisa ditebak.
 */
export function alasanPendapatanNol(k: {
  adaTipe: boolean
  adaJadwal: boolean
  adaHarga: boolean
}): string {
  if (!k.adaTipe) return 'Belum ada tipe bangunan. Tambahkan di Step 3.'
  if (!k.adaJadwal) {
    return 'Belum ada unit yang dijadwalkan terjual. Isi Simulasi Penjualan —'
      + ' pendapatan dihitung dari unit terjual, bukan dari jumlah unit yang dibangun.'
  }
  if (!k.adaHarga) {
    return 'Harga jual per unit masih nol. Periksa margin di Step 5.'
  }
  return ''
}
