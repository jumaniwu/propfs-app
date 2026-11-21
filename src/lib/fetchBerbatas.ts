// ============================================================
// PropFS — Batas waktu untuk permintaan ke server LOGIN Supabase
//
// GEJALANYA: halaman hasil berkata "Koneksi terlalu lama tidak menjawab"
// padahal sinyal penuh; tombol Hitung berputar "Menyimpan…"; daftar yang
// tidak pernah selesai dimuat — sering sesudah HP bangun dari tidur atau
// berpindah jaringan.
//
// SEBABNYA: sebelum SETIAP permintaan data, supabase-js mengambil token login.
// Bila tokennya hampir habis, ia menyegarkannya ke /auth/v1/token — dan
// permintaan data lain MENUNGGU penyegaran itu selesai. Permintaan
// penyegarannya sendiri tidak punya batas waktu. Sambungan yang tersendat
// (umum sesudah HP bangun atau pindah dari Wi-Fi ke seluler) membuatnya
// menunggu selama yang diizinkan peramban — bisa bermenit-menit — dan
// selama itu seluruh aplikasi diam, walau jaringannya sendiri baik.
//
// Dengan batas di sini, penyegaran yang tersendat diputus, dan supabase-js
// mengulangnya sendiri (ia memang mengulang galat jaringan) lewat sambungan
// BARU — yang biasanya langsung berhasil.
//
// Sengaja HANYA untuk server login. Permintaan data dan unggahan berkas
// punya batas waktunya sendiri di masing-masing pemanggil, dan unggahan foto
// di sinyal lemah memang bisa sah memakan waktu lebih lama.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

/** Penyegaran token biasanya selesai di bawah satu detik; di sinyal lemah beberapa detik. */
export const BATAS_AUTH_MS = 10_000

/**
 * Masuk, daftar, kirim OTP, setel ulang sandi: dibatasi LEBIH longgar.
 * Berbeda dari penyegaran token, permintaan ini tidak diulang otomatis oleh
 * supabase-js — memutusnya terlalu cepat di sinyal lemah berarti menggagalkan
 * login yang sebenarnya akan berhasil.
 */
export const BATAS_AUTH_INTERAKTIF_MS = 30_000

/** Permintaan ke server login Supabase. */
export function urlAuth(url: string): boolean {
  return /\/auth\/v1\//.test(url)
}

/**
 * Batas untuk sebuah alamat; null = tidak dibatasi di sini.
 *
 * Yang dijalankan supabase-js DI BELAKANG setiap permintaan data — penyegaran
 * token dan pembacaan pengguna — memakai batas pendek, karena seluruh
 * aplikasi menunggunya. Sisanya dijalankan karena pemakai menekan tombol.
 */
export function batasUntukUrl(url: string): number | null {
  if (!urlAuth(url)) return null
  if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(url) || /\/auth\/v1\/user(\?|$)/.test(url)) {
    return BATAS_AUTH_MS
  }
  return BATAS_AUTH_INTERAKTIF_MS
}

function urlDari(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return String((input as Request)?.url ?? '')
}

/**
 * `fetch` yang memutus permintaan cocok setelah `batasMs`.
 *
 * Sinyal milik pemanggil tetap dihormati: yang mana pun lebih dulu —
 * pembatalan pemanggil atau batas waktu — memutus permintaannya.
 */
export function fetchBerbatas(
  dasar: typeof fetch, batas: (url: string) => number | null = batasUntukUrl,
): typeof fetch {
  return (input: RequestInfo | URL, init: RequestInit = {}) => {
    const batasMs = batas(urlDari(input))
    if (batasMs === null) return dasar(input, init)
    const ctrl = new AbortController()
    const luar = init?.signal
    if (luar) {
      if (luar.aborted) ctrl.abort(luar.reason)
      else luar.addEventListener('abort', () => ctrl.abort(luar.reason), { once: true })
    }
    // Pengatur waktunya TIDAK dihentikan begitu kepala jawaban tiba: badan
    // jawaban yang tersendat sama macetnya. Memutus permintaan yang sudah
    // selesai dibaca tidak berpengaruh apa pun.
    setTimeout(() => ctrl.abort(new DOMException(
      `Server login tidak menjawab dalam ${Math.round(batasMs / 1000)} detik.`, 'TimeoutError')), batasMs)
    return dasar(input, { ...init, signal: ctrl.signal })
  }
}
