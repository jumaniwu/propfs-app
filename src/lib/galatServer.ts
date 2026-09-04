// ============================================================
// PropFS — Galat dari server harus MENYEBUTKAN sebabnya
//
// Halaman kalender progres yang dibuka pemilik rumah berbunyi persis
// "Gagal (HTTP 500)." dan tidak lebih. Yang membacanya tidak bisa berbuat
// apa-apa, dan yang memperbaikinya tidak bisa menebak apa-apa — status 500
// menutupi sebab yang sangat berbeda-beda: fungsinya belum ada karena
// migrasinya belum dijalankan, tabelnya belum ada, kolomnya berubah, atau
// memang ada kekeliruan di dalam fungsinya.
//
// Sebabnya sebenarnya SELALU dikirim. PostgREST menjawab dengan badan JSON
// berisi `message`, `details`, `hint`, dan `code`; kode pemanggilnya membuang
// seluruhnya lalu menyusun kalimat dari status HTTP saja.
//
// Modul ini mengembalikan yang dibuang itu, dan menerjemahkan kode yang
// paling sering muncul ke kalimat yang menyebut TINDAKANNYA — bukan istilah
// database yang bagi pembacanya sama saja dengan "rusak".
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()

export interface GalatServer {
  /** Kalimat untuk ditampilkan. */
  pesan: string
  /** Kode SQLSTATE / PostgREST bila ada — dipakai menelusuri, bukan ditampilkan. */
  kode: string
  /** Migrasi database yang kemungkinan besar belum dijalankan. */
  perluMigrasi: boolean
}

/**
 * Susun kalimat dari jawaban server.
 *
 * `badan` adalah apa pun yang berhasil dibaca dari respons — objek JSON
 * PostgREST, teks biasa, atau kosong ketika badannya tidak bisa dibaca sama
 * sekali. Ketiganya harus menghasilkan kalimat, karena yang membacanya tidak
 * peduli bentuk jawabannya.
 */
export function bacaGalatServer(
  status: unknown, badan?: unknown, apa = 'Permintaan',
): GalatServer {
  const s = Number(status) || 0
  const obj = (badan && typeof badan === 'object' ? badan : {}) as Record<string, unknown>
  const kode = teks(obj.code)
  const pesanAsli = teks(obj.message) || (typeof badan === 'string' ? teks(badan) : '')

  // Fungsi atau tabel yang belum ada hampir selalu berarti satu hal di sini:
  // migrasinya belum dijalankan di Supabase. Menyebut itu langsung menghemat
  // penelusuran yang panjang, karena pesan aslinya ("function ... does not
  // exist") tidak menunjuk ke mana pun bagi yang membacanya.
  if (kode === '42883' || /function .* does not exist/i.test(pesanAsli)) {
    return {
      pesan: 'Fungsi database yang dibutuhkan halaman ini belum ada.'
        + ' Jalankan migrasi yang tertunda di Supabase SQL Editor'
        + ' (mulai dari CEK_MIGRASI.sql untuk melihat mana yang belum).',
      kode: kode || '42883', perluMigrasi: true,
    }
  }
  if (kode === '42P01' || /relation .* does not exist/i.test(pesanAsli)) {
    return {
      pesan: 'Tabel database yang dibutuhkan halaman ini belum ada.'
        + ' Jalankan migrasi yang tertunda di Supabase SQL Editor.',
      kode: kode || '42P01', perluMigrasi: true,
    }
  }
  if (kode === '42703' || /column .* does not exist/i.test(pesanAsli)) {
    return {
      pesan: 'Ada kolom database yang belum dibuat, jadi datanya tidak bisa diambil.'
        + ' Jalankan migrasi yang tertunda di Supabase SQL Editor.',
      kode: kode || '42703', perluMigrasi: true,
    }
  }
  if (kode === '42501' || s === 403 || /row-level security|permission denied/i.test(pesanAsli)) {
    return {
      pesan: 'Aksesnya ditolak server. Kalau ini tautan yang dibagikan,'
        + ' tautannya mungkin sudah tidak berlaku — terbitkan ulang dari aplikasi.',
      kode: kode || '42501', perluMigrasi: false,
    }
  }
  if (s === 404) {
    return {
      pesan: `${apa} tidak ditemukan. Tautannya mungkin salah atau sudah dihapus.`,
      kode, perluMigrasi: false,
    }
  }
  if (s === 401) {
    return { pesan: 'Sesi login sudah berakhir. Masuk kembali lalu coba lagi.', kode, perluMigrasi: false }
  }
  if (s === 408 || s === 504) {
    return { pesan: 'Server terlalu lama menjawab. Periksa koneksi, lalu coba lagi.', kode, perluMigrasi: false }
  }

  // Sisanya: pesan ASLI dari server ditampilkan apa adanya. Ia mungkin
  // berbahasa Inggris dan berbau teknis, tetapi ia menyebut sesuatu yang bisa
  // ditelusuri — dan itu jauh lebih berguna daripada nomor status sendirian.
  if (pesanAsli) {
    return { pesan: `${apa} gagal: ${pesanAsli}`, kode, perluMigrasi: false }
  }
  return { pesan: `${apa} gagal (HTTP ${s || '?'}). Coba muat ulang halamannya.`, kode, perluMigrasi: false }
}

/**
 * Baca badan respons tanpa pernah melempar.
 *
 * Badan yang sudah terlanjur dibaca, bukan JSON, atau kosong sama sekali
 * tidak boleh menjadi galat baru yang menutupi galat aslinya — itu justru
 * membuat sebabnya makin jauh dari jangkauan.
 */
export async function badanRespons(res: {
  clone?: () => { json: () => Promise<unknown>; text: () => Promise<string> }
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}): Promise<unknown> {
  try {
    const r = res.clone ? res.clone() : res
    if (r.json) {
      try { return await r.json() } catch { /* bukan JSON */ }
    }
    const r2 = res.clone ? res.clone() : res
    if (r2.text) return await r2.text()
  } catch { /* badannya tidak bisa dibaca */ }
  return null
}
