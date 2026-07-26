// ============================================================
// PropFS — Kuota pengguna tim (logika murni, tanpa DOM)
// Satu langganan Kontraktor AI mencakup sejumlah pengguna tim. Bila
// perusahaan butuh lebih, mereka membeli slot tambahan per pengguna per
// bulan — mengikuti pola add-on slot proyek yang sudah ada.
// ============================================================

/** Batas bawaan bila admin belum mengatur `max_team_users` di backend. */
export const BATAS_ANGGOTA_DEFAULT = 5

/** Harga bawaan slot pengguna tambahan per bulan, bila belum diatur. */
export const HARGA_SLOT_USER_DEFAULT = 50_000

export interface KuotaTim {
  /** Batas dari paket langganan (app_settings.max_team_users). */
  batasDasar: number
  /** Slot tambahan yang sudah dibeli perusahaan. */
  slotTambahan: number
  /** Anggota yang sudah terdaftar (aktif maupun diundang). */
  terpakai: number
}

export interface RingkasanKuota extends KuotaTim {
  /** batasDasar + slotTambahan. */
  batas: number
  /** Sisa slot; tidak pernah negatif. */
  sisa: number
  /** true bila masih boleh menambah pengguna. */
  bolehTambah: boolean
  /** true bila slot sudah terpakai semua atau terlampaui. */
  penuh: boolean
  /** Persentase pemakaian 0–100, untuk bar indikator. */
  pakaiPct: number
}

const bulat = (n: unknown, bawaan = 0) => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? Math.max(0, v) : bawaan
}

/**
 * Hitung ringkasan kuota dari angka mentah backend. Nilai yang hilang atau
 * tidak masuk akal dikembalikan ke bawaan agar halaman Tim tetap berguna
 * walau `max_team_users` belum diatur di backend.
 */
export function ringkasKuota(k: Partial<KuotaTim> | null | undefined): RingkasanKuota {
  const batasDasar = k?.batasDasar === undefined || k?.batasDasar === null
    ? BATAS_ANGGOTA_DEFAULT
    : bulat(k.batasDasar, BATAS_ANGGOTA_DEFAULT)
  const slotTambahan = bulat(k?.slotTambahan)
  const terpakai = bulat(k?.terpakai)

  const batas = batasDasar + slotTambahan
  const sisa = Math.max(0, batas - terpakai)
  return {
    batasDasar, slotTambahan, terpakai, batas, sisa,
    bolehTambah: terpakai < batas,
    penuh: terpakai >= batas,
    pakaiPct: batas > 0 ? Math.min(100, (terpakai / batas) * 100) : 100,
  }
}

/** Biaya sebulan untuk menambah `jumlah` pengguna. */
export function biayaSlotUser(jumlah: number, hargaSatuan = HARGA_SLOT_USER_DEFAULT): number {
  return Math.max(0, bulat(jumlah)) * Math.max(0, bulat(hargaSatuan))
}

/**
 * Pesan yang ditampilkan saat kuota habis. Ditulis di sini agar teksnya sama
 * di aplikasi maupun di Edge Function.
 */
export function pesanKuotaPenuh(batas: number, harga = HARGA_SLOT_USER_DEFAULT): string {
  return `Kuota pengguna tim sudah penuh (${batas} pengguna). `
    + `Beli slot tambahan Rp ${harga.toLocaleString('id-ID')} per pengguna per bulan, `
    + 'atau nonaktifkan pengguna yang tidak lagi dipakai.'
}
