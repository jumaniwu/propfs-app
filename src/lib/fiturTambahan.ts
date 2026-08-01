// ============================================================
// PropFS — Fitur tambahan yang dinyalakan dari backend
//
// Feasibility Study dulunya produk sendiri dengan menu sendiri di navigasi
// bawah. Sekarang ia menjadi FITUR TAMBAHAN di dalam Kontraktor AI: satu ikon
// di grid menu, bukan lagi satu dunia terpisah.
//
// Yang menentukan tampil atau tidaknya bukan kode, melainkan setelan di
// backend — supaya bisa diuji ke sebagian pemakai lebih dulu tanpa merilis
// ulang aplikasi. Tiga keadaan yang mungkin:
//
//   'mati'      — tidak tampil untuk siapa pun, termasuk superadmin.
//   'internal'  — hanya superadmin yang melihatnya (masa uji coba).
//   'semua'     — tampil untuk semua pemakai.
//
// 'internal' sengaja dijadikan BAWAAN. Setelan yang belum pernah diisi berarti
// fiturnya belum diputuskan, dan fitur yang belum diputuskan lebih aman
// terlihat oleh orang dalam saja daripada bocor ke seluruh pelanggan.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export type ModeFitur = 'mati' | 'internal' | 'semua'

export const MODE_FITUR: ModeFitur[] = ['mati', 'internal', 'semua']

export const LABEL_MODE: Record<ModeFitur, string> = {
  mati: 'Dimatikan',
  internal: 'Hanya superadmin',
  semua: 'Semua pengguna',
}

export const JELAS_MODE: Record<ModeFitur, string> = {
  mati: 'Tidak muncul untuk siapa pun, termasuk superadmin.',
  internal: 'Hanya terlihat oleh akun superadmin — untuk uji coba sebelum dirilis.',
  semua: 'Terlihat oleh semua pengguna yang paketnya mengaktifkan fitur ini.',
}

/** Setelan bawaan bila backend belum pernah menyimpan apa pun. */
export const MODE_BAWAAN: ModeFitur = 'internal'

/**
 * Baca satu nilai mode dari setelan backend.
 *
 * Nilai apa pun yang tidak dikenali dikembalikan ke bawaan, bukan dianggap
 * 'semua'. Setelan yang salah ketik tidak boleh berakibat fitur setengah jadi
 * ikut terlihat pelanggan.
 */
export function bacaMode(nilai: unknown, bawaan: ModeFitur = MODE_BAWAAN): ModeFitur {
  const v = String(nilai ?? '').trim().toLowerCase()
  // Nilai lama sempat disimpan sebagai boolean saat setelan ini masih
  // hidup-mati; keduanya tetap dimengerti agar setelan lama tidak hilang.
  if (nilai === true || v === 'true' || v === 'on') return 'semua'
  if (nilai === false || v === 'false' || v === 'off') return 'mati'
  return (MODE_FITUR as string[]).includes(v) ? v as ModeFitur : bawaan
}

/** Ubah nilai mentah dari app_settings menjadi peta kunci → mode. */
export function bacaPetaMode(nilai: unknown): Record<string, ModeFitur> {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai)) return {}
  const hasil: Record<string, ModeFitur> = {}
  for (const [k, v] of Object.entries(nilai as Record<string, unknown>)) {
    const kunci = String(k).trim()
    if (kunci) hasil[kunci] = bacaMode(v)
  }
  return hasil
}

export interface KeadaanPemakai {
  /** Akun superadmin PropFS (bukan pemilik workspace). */
  superadmin?: boolean
  /**
   * Paket langganan pemakai mengaktifkan fitur ini. Mode hanya menentukan
   * fiturnya DITAWARKAN atau tidak — langganan tetap yang menentukan bisa
   * dipakai atau tidak. Tidak diisi berarti tidak ikut diperiksa.
   */
  berlangganan?: boolean
}

/**
 * Apakah fitur tambahan ini pantas ditampilkan.
 *
 * Superadmin menembus pemeriksaan langganan (ia memang melihat semuanya),
 * tetapi TIDAK menembus mode 'mati' — fitur yang sengaja dimatikan biasanya
 * dimatikan karena rusak, dan menyembunyikannya dari orang dalam sekalipun
 * lebih baik daripada membiarkannya dipakai.
 */
export function fiturTerlihat(mode: ModeFitur, pemakai: KeadaanPemakai = {}): boolean {
  if (mode === 'mati') return false
  if (pemakai.superadmin) return true
  if (mode === 'internal') return false
  return pemakai.berlangganan !== false
}

/** Mode sebuah fitur dari peta setelan, lengkap dengan bawaannya. */
export function modeFitur(peta: Record<string, ModeFitur> | undefined, kunci: string): ModeFitur {
  return peta?.[kunci] ?? MODE_BAWAAN
}

/**
 * Saring daftar menu: item yang menyebut `tambahan` hanya lolos bila mode &
 * keadaan pemakainya mengizinkan. Item tanpa `tambahan` selalu lolos —
 * penyaringan lain (paket & role) tetap ditangani pemanggilnya.
 */
export function saringTambahan<T extends { tambahan?: string }>(
  items: T[],
  peta: Record<string, ModeFitur> | undefined,
  pemakai: (kunci: string) => KeadaanPemakai,
): T[] {
  return (items ?? []).filter(i => {
    if (!i?.tambahan) return true
    return fiturTerlihat(modeFitur(peta, i.tambahan), pemakai(i.tambahan))
  })
}
