// ============================================================
// PropFS — Berapa proyek yang boleh dibuat (logika murni, tanpa DOM)
//
// Sampai sekarang jawabannya hanya datang dari paket langganan, dan itu tidak
// cukup. Tiga keadaan yang nyata:
//
//   1. SUPERADMIN. Yang mengelola sistem harus bisa membuka apa pun untuk
//      memeriksa keluhan pelanggan. Ia tidak berlangganan apa-apa, dan
//      menghitung kuotanya sama sekali tidak masuk akal.
//   2. KESEPAKATAN KHUSUS. Pelanggan yang menawar di luar paket standar —
//      "kami ambil Kontraktor AI tapi minta 12 proyek" — selama ini hanya bisa
//      dilayani dengan membuat paket baru yang tidak dipakai siapa pun lagi.
//   3. LANGGANAN DIMATIKAN seluruh sistem (masa promosi / uji coba terbuka).
//
// Urutannya sengaja dibuat mutlak dan diperiksa dari atas: superadmin menang
// atas apa pun, lalu keadaan sistem, lalu kesepakatan khusus, baru paket.
// Menyusunnya terbalik akan membuat batas paket diam-diam mengunci akun yang
// justru sedang dipakai memeriksa keluhan.
//
// null pada `batas` berarti TAK TERBATAS — bukan nol, dan bukan "tidak tahu".
// Angka ajaib seperti 999 sengaja dihindari: suatu hari ada yang benar-benar
// butuh 999 proyek, dan kode yang membandingkannya akan salah tanpa suara.
// ============================================================

/** Nilai yang disimpan di basis data untuk "tak terbatas". */
export const TAK_TERBATAS = -1

export type SumberBatas = 'superadmin' | 'sistem' | 'manual' | 'paket'

export interface SumberKuota {
  /** Akun superadmin PropFS — selalu tak terbatas. */
  superadmin?: boolean
  /**
   * Batas manual yang disetel admin untuk pelanggan ini.
   * null/undefined = ikut paket. -1 = tak terbatas. 0 = benar-benar nol.
   */
  manual?: number | null
  /** Batas yang datang dari paket langganan. */
  paket?: number
  /** Slot tambahan yang dibeli terpisah; hanya menambah batas paket. */
  slotTambahan?: number
  /**
   * Sistem langganan berbayar sedang menyala. Bila false (masa promosi),
   * tidak ada yang dibatasi.
   */
  langgananAktif?: boolean
}

export interface HasilKuota {
  /** null = tak terbatas. */
  batas: number | null
  sumber: SumberBatas
  /** Kalimat siap tampil, mis. "12 proyek (disetel manual)". */
  label: string
}

const bulat = (v: unknown, bawaan = 0): number => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : bawaan
}

/**
 * Baca nilai batas manual dari basis data / formulir.
 *
 * Kosong berarti "ikut paket", BUKAN nol. Membedakan keduanya penting: nol
 * adalah keputusan sadar untuk mengunci pelanggan, sedangkan kosong berarti
 * belum ada kesepakatan khusus sama sekali.
 */
export function bacaBatasManual(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = bulat(v, NaN)
  if (!Number.isFinite(n)) return null
  // Angka negatif apa pun dianggap tak terbatas — form yang mengetik "-5"
  // jelas bermaksud "jangan dibatasi", bukan "minus lima proyek".
  return n < 0 ? TAK_TERBATAS : n
}

export function labelBatas(batas: number | null): string {
  return batas === null ? 'Tak terbatas' : `${batas} proyek`
}

const ALASAN: Record<SumberBatas, string> = {
  superadmin: 'akun superadmin',
  sistem: 'langganan berbayar sedang dimatikan',
  manual: 'disetel manual',
  paket: 'dari paket langganan',
}

/**
 * Berapa proyek yang boleh dimiliki akun ini untuk satu produk.
 *
 * Slot tambahan hanya menambah batas PAKET. Bila admin sudah menyetel batas
 * manual, angka itulah kesepakatannya — menambahkan slot di atasnya akan
 * membuat angka yang disepakati tidak lagi berlaku tanpa ada yang menyadarinya.
 */
export function hitungKuota(s: SumberKuota = {}): HasilKuota {
  const jadi = (batas: number | null, sumber: SumberBatas): HasilKuota => ({
    batas, sumber, label: `${labelBatas(batas)} (${ALASAN[sumber]})`,
  })

  if (s.superadmin) return jadi(null, 'superadmin')
  if (s.langgananAktif === false) return jadi(null, 'sistem')

  const manual = bacaBatasManual(s.manual)
  if (manual !== null) {
    return manual === TAK_TERBATAS ? jadi(null, 'manual') : jadi(Math.max(0, manual), 'manual')
  }

  const paket = Math.max(0, bulat(s.paket, 0))
  const tambahan = Math.max(0, bulat(s.slotTambahan, 0))
  return jadi(paket + tambahan, 'paket')
}

/** Apakah masih boleh membuat satu proyek lagi. */
export function bolehBuat(terpakai: number, k: HasilKuota): boolean {
  if (k.batas === null) return true
  return Math.max(0, bulat(terpakai, 0)) < k.batas
}

/** Sisa jatah; null bila tak terbatas. */
export function sisaKuota(terpakai: number, k: HasilKuota): number | null {
  if (k.batas === null) return null
  return Math.max(0, k.batas - Math.max(0, bulat(terpakai, 0)))
}

/** Kalimat siap tampil di layar, mis. "3 dari 10 proyek terpakai". */
export function ringkasKuota(terpakai: number, k: HasilKuota): string {
  const n = Math.max(0, bulat(terpakai, 0))
  if (k.batas === null) return `${n} proyek · tak terbatas`
  return `${n} dari ${k.batas} proyek terpakai`
}
