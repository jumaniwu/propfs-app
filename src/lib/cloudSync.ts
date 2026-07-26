// Util sinkronisasi cloud: gabungkan data lokal (per perangkat) dengan data
// Supabase (lintas perangkat). Versi terbaru menang; item yang hanya ada di
// salah satu sisi tetap dipertahankan. Murni & bisa diuji di Node.

export interface MergeResult<T> {
  /** hasil gabungan, terurut terbaru dulu */
  merged: T[]
  /** item lokal yang lebih baru / belum ada di cloud — perlu di-push */
  toPush: T[]
}

export function mergeNewest<T>(
  local: T[],
  cloud: T[],
  idOf: (t: T) => string,
  updatedAtOf: (t: T) => string,
): MergeResult<T> {
  const map = new Map<string, T>()
  for (const c of cloud) map.set(idOf(c), c)
  const toPush: T[] = []
  for (const l of local) {
    const c = map.get(idOf(l))
    if (!c || Date.parse(updatedAtOf(l)) > Date.parse(updatedAtOf(c))) {
      map.set(idOf(l), l)
      toPush.push(l)
    }
  }
  const merged = [...map.values()].sort(
    (a, b) => Date.parse(updatedAtOf(b)) - Date.parse(updatedAtOf(a)),
  )
  return { merged, toPush }
}

/** Gabungan union dua daftar ber-ID (untuk entri pemasukan/penyesuaian). */
export function unionById<T>(a: T[], b: T[], idOf: (t: T) => string): T[] {
  const map = new Map<string, T>()
  for (const x of a) map.set(idOf(x), x)
  for (const x of b) if (!map.has(idOf(x))) map.set(idOf(x), x)
  return [...map.values()]
}

// ── Penghapusan yang ikut tersinkron (tombstone) ─────────────────────────────
//
// Union saja TIDAK cukup: entri yang dihapus di perangkat ini masih ada di
// cloud, sehingga pemuatan berikutnya menghidupkannya kembali — inilah sebab
// satu pemasukan bisa tampil dua kali (satu di proyek, satu di "Non Proyek").
// Karena itu penghapusan dicatat sebagai nisan (tombstone) yang ikut
// disinkronkan, dan hasil gabungan selalu membuang id yang sudah bernisan.

export interface Nisan {
  id: string
  /** Kapan dihapus, ISO string. */
  at: string
}

/** Nisan yang lebih tua dari ini dibuang — id acak tidak akan dipakai ulang. */
export const UMUR_NISAN_HARI = 180

/** Gabungkan dua daftar nisan; yang paling baru menang. */
export function gabungNisan(a: Nisan[], b: Nisan[], sekarang = new Date()): Nisan[] {
  const batas = sekarang.getTime() - UMUR_NISAN_HARI * 86_400_000
  const map = new Map<string, Nisan>()
  for (const n of [...a, ...b]) {
    if (!n?.id) continue
    const waktu = Date.parse(n.at)
    // Tanggal tidak terbaca dianggap masih berlaku, supaya penghapusan tidak
    // hilang hanya karena datanya cacat.
    if (Number.isFinite(waktu) && waktu < batas) continue
    const ada = map.get(n.id)
    if (!ada || Date.parse(n.at) > Date.parse(ada.at)) map.set(n.id, n)
  }
  return [...map.values()]
}

/**
 * Gabungkan daftar lokal & cloud dengan menghormati penghapusan dari kedua
 * sisi. Hasilnya idempoten: memuat ulang berapa kali pun tidak menambah
 * maupun menghidupkan entri.
 */
export function gabungDenganNisan<T>(
  local: T[],
  cloud: T[],
  idOf: (t: T) => string,
  nisanLokal: Nisan[] = [],
  nisanCloud: Nisan[] = [],
  sekarang = new Date(),
): { entries: T[]; nisan: Nisan[] } {
  const nisan = gabungNisan(nisanLokal, nisanCloud, sekarang)
  const dihapus = new Set(nisan.map(n => n.id))
  const entries = unionById(local, cloud, idOf).filter(x => !dihapus.has(idOf(x)))
  return { entries, nisan }
}
