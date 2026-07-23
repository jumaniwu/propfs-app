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
