// ============================================================
// PropFS — Kenapa halaman hasil FS berputar terus
//
// Halaman `/result/:id` memuat proyeknya di dalam sebuah `async function init()`
// yang TIDAK punya satu pun penanganan galat, dan `setReady(true)` ada di baris
// terakhirnya. Akibatnya lurus: apa pun yang melempar di tengah jalan — sesi
// kedaluwarsa, jaringan putus, RLS menolak — membuat baris itu tidak pernah
// tercapai. Yang terlihat pemakai hanya lingkaran berputar, selamanya, tanpa
// satu pun keterangan.
//
// Dan ada bentuk kedua yang lebih licik: permintaan yang TIDAK melempar dan
// TIDAK selesai. Di ponsel yang berpindah dari 5G ke tanpa sinyal, `fetch`
// bisa menggantung tanpa batas. Tidak ada galat untuk ditangkap, karena
// memang tidak ada galat — hanya janji yang tidak pernah ditepati. Karena itu
// batas waktu di bawah bukan pelengkap, melainkan bagian dari perbaikannya.
//
// Sebab ketiga, berbeda lagi: tautan hasil sering dibuka LANGSUNG, dan pada
// pembukaan pertama sesinya belum selesai dimuat. Pemuatnya melihat `user`
// masih null, pulang tanpa mengambil apa pun, lalu halamannya berkata "belum
// ada hasil" atas proyek yang datanya baik-baik saja.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/**
 * Batas waktu memuat hasil.
 *
 * Delapan detik, bukan dua belas. Angkanya diturunkan setelah alurnya diukur
 * sungguhan: penjaga sesi di authStore sudah menahan halaman ini sampai 5
 * detik lebih dulu, dan batas ini menyusul SETELAHNYA — bukan bersamaan.
 * Dengan dua belas detik, pesan galat pertama baru muncul di detik ketujuh
 * belas, dan yang menunggu sudah lama menyimpulkan aplikasinya rusak.
 *
 * Tidak lebih pendek dari delapan: sinyal satu bar di lapangan memang selama
 * itu, dan memutusnya menggagalkan permintaan yang sebenarnya masih akan
 * berhasil.
 */
export const BATAS_MUAT_MS = 8_000

/**
 * Kabar untuk yang sedang menunggu, menurut sudah berapa lama.
 *
 * Lingkaran berputar yang tidak berubah selama belasan detik tidak bisa
 * dibedakan dari yang macet. Menambahkan satu baris yang BERUBAH sudah cukup
 * membuktikan aplikasinya masih bekerja — dan itu menahan orang dari menutup
 * paksa halaman tepat sebelum datanya sampai.
 */
export function pesanTunggu(detik: number): string {
  const d = Math.max(0, Math.floor(Number(detik) || 0))
  if (d < 4) return 'Memuat hasil analisa...'
  if (d < 8) return 'Masih memuat — koneksinya sedang lambat.'
  return 'Koneksi lambat sekali. Sebentar lagi akan muncul pesannya.'
}

/**
 * Berapa lama menunggu sesi sebelum menyerah.
 *
 * Sesi yang sudah tersimpan di perangkat terbaca hampir seketika; yang
 * memakan waktu hanya penyegaran token ke server. Enam detik cukup untuk yang
 * pertama dan tidak membuang waktu menunggu yang kedua — sebab bila token
 * memang tidak bisa disegarkan, menunggu lebih lama tidak mengubah apa pun.
 */
export const TUNGGU_SESI_MS = 6_000

export const PESAN_SESI_TAK_SIAP = 'Sesi login belum siap. Masuk kembali,'
  + ' lalu buka lagi tautan hasilnya.'

export const PESAN_LAMBAT = 'Koneksi terlalu lama tidak menjawab.'
  + ' Periksa sinyal, lalu coba muat ulang.'

/**
 * Jalankan sebuah janji dengan batas waktu.
 *
 * Yang dijaga BUKAN galat, melainkan ketiadaan galat: permintaan yang
 * menggantung tidak pernah menolak dan tidak pernah selesai, sehingga
 * `try/catch` sekalipun tidak akan pernah dijalankan.
 *
 * Pengatur waktunya selalu dibersihkan. Tanpa itu, setiap pembukaan halaman
 * meninggalkan satu timer hidup — dan pada halaman yang dibuka-tutup berkali-
 * kali, timer-timer itu menumpuk.
 */
export function denganBatasWaktu<T>(
  janji: Promise<T>, ms = BATAS_MUAT_MS, pesan = PESAN_LAMBAT,
): Promise<T> {
  return new Promise<T>((selesai, gagal) => {
    const timer = setTimeout(() => gagal(new Error(pesan)), Math.max(1, ms))
    janji.then(
      v => { clearTimeout(timer); selesai(v) },
      e => { clearTimeout(timer); gagal(e) },
    )
  })
}

export type KeadaanMuat = 'tunggu-sesi' | 'memuat' | 'galat' | 'kosong' | 'siap'

/**
 * Apa yang harus digambar layar sekarang.
 *
 * Urutannya disengaja. `galat` diperiksa SEBELUM `kosong`: halaman yang gagal
 * memuat dan halaman yang proyeknya memang belum dihitung terlihat sama dari
 * luar, tetapi yang pertama masih bisa diperbaiki dengan mencoba lagi dan yang
 * kedua tidak. Menyebut keduanya "belum ada hasil" mengirim orang menghitung
 * ulang proyek yang datanya sebenarnya baik-baik saja.
 */
export function keadaanMuat(k: {
  /** Sesi login masih dimuat, dan belum pernah selesai sekali pun. */
  sesiMemuat: boolean
  memuat: boolean
  galat: string
  adaHasil: boolean
}): KeadaanMuat {
  if (k.sesiMemuat) return 'tunggu-sesi'
  if (k.memuat) return 'memuat'
  if (k.galat) return 'galat'
  return k.adaHasil ? 'siap' : 'kosong'
}

/**
 * Pesan galat yang bisa dibaca orang.
 *
 * Yang dilihat pemakai jangan pernah "[object Object]" atau nama tabel
 * database. Bagi yang membacanya di lapangan, keduanya sama-sama berarti
 * "rusak" — dan tidak satu pun memberi tahu apa yang bisa ia lakukan.
 */
export function pesanGalatMuat(e: unknown): string {
  const mentah = e instanceof Error ? e.message : String(e ?? '')
  const t = mentah.trim()
  if (!t || t === '[object Object]') {
    return 'Hasil analisa gagal dimuat. Coba muat ulang halamannya.'
  }
  if (/failed to fetch|networkerror|load failed/i.test(t)) {
    return 'Tidak bisa menghubungi server. Periksa koneksi, lalu coba lagi.'
  }
  // JWT/401: sesinya habis. Ini satu-satunya galat yang jalan keluarnya bukan
  // "coba lagi" melainkan masuk ulang — dan menyuruh orang mencoba lagi
  // berulang kali atas sesi yang mati adalah menyuruhnya gagal berulang kali.
  if (/jwt|401|unauthorized|token/i.test(t)) {
    return 'Sesi login sudah berakhir. Masuk kembali untuk membuka hasilnya.'
  }
  if (/permission|denied|403|row-level/i.test(t)) {
    return 'Tidak punya akses ke proyek ini. Pastikan dibuka dari akun yang membuatnya.'
  }
  return t
}

/** Galat ini menuntut masuk ulang, bukan mencoba lagi. */
export function perluMasukUlang(pesan: unknown): boolean {
  return /sesi login (sudah berakhir|belum siap)/i.test(String(pesan ?? ''))
}


// ── Jam yang selamat dari pemasangan ulang ──────────────────────────────────
//
// Halaman hasil ternyata DIPASANG ULANG berkali-kali selama sesi belum
// stabil: setiap peristiwa auth merender ulang pohon di atasnya, dan komponen
// ini lahir kembali dari nol. Akibatnya setiap `setTimeout` dan setiap
// pencacah detik di dalamnya ikut kembali ke nol — sehingga batas waktu enam
// detik TIDAK PERNAH tercapai, betapapun lamanya orang menunggu. Yang
// terlihat: lingkaran berputar yang benar-benar abadi.
//
// Jamnya karena itu disimpan di luar komponen. Ia bertahan melintasi
// pemasangan ulang, dan hanya diatur ulang ketika yang ditunggu memang
// berganti — proyek lain, atau percobaan baru yang diminta pemakai.

const jam = new Map<string, number>()

/** Mulai menghitung untuk sebuah kunci; pemanggilan berikutnya tidak mengulang. */
export function mulaiJam(kunci: string, sekarang = Date.now()): void {
  if (!jam.has(kunci)) jam.set(kunci, sekarang)
}

/** Atur ulang jam sebuah kunci — dipakai ketika pemakai menekan "coba lagi". */
export function ulangJam(kunci: string, sekarang = Date.now()): void {
  jam.set(kunci, sekarang)
}

/** Sudah berapa milidetik sejak jam ini dimulai. */
export function lamaJam(kunci: string, sekarang = Date.now()): number {
  const mulai = jam.get(kunci)
  return mulai === undefined ? 0 : Math.max(0, sekarang - mulai)
}

/** Buang jam yang tidak dipakai lagi supaya petanya tidak tumbuh selamanya. */
export function bersihkanJam(kunci: string): void {
  jam.delete(kunci)
}
