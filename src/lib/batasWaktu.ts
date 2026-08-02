// ============================================================
// PropFS — Batas waktu untuk satu langkah asinkron.
//
// supabase-js bisa MENGGANTUNG, bukan gagal: ketika sesinya sedang disegarkan,
// ketika kunci antar-tab tidak pernah dilepas, atau ketika jaringannya mati
// separuh. Janji yang tidak pernah selesai tidak pernah masuk ke blok `catch`,
// jadi `try/catch` saja tidak menolong — halamannya diam selamanya.
//
// Itulah alasan sebagian besar modul di aplikasi ini memakai REST langsung
// dengan AbortController. Di tempat yang masih memakai supabase-js, fungsi ini
// memberi jawaban cadangan setelah tenggat, supaya yang gagal adalah SATU
// LANGKAH, bukan seluruh halaman.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

/**
 * Selesaikan `janji`, atau kembalikan `cadangan` bila lewat dari `ms`.
 *
 * Tidak pernah menolak: penolakan pun dijawab dengan cadangan. Pemanggilnya
 * memang tidak punya apa-apa lagi untuk dikerjakan atas kegagalan itu selain
 * memakai nilai cadangannya.
 */
export function batasWaktu<T>(janji: PromiseLike<T>, ms: number, cadangan: T): Promise<T> {
  return new Promise<T>(resolve => {
    let selesai = false
    const jadi = (v: T) => {
      if (selesai) return
      selesai = true
      clearTimeout(jam)
      resolve(v)
    }
    const jam = setTimeout(() => jadi(cadangan), Math.max(0, ms))
    janji.then(jadi, () => jadi(cadangan))
  })
}
