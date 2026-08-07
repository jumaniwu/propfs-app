// ============================================================
// PropFS — Satu tempat untuk nama model Gemini, dan cara menanyakannya
//
// Dua masalah yang bertemu di sini.
//
// Pertama, nama model tersebar di enam berkas sebagai teks. Setiap kali Google
// mengganti atau menghentikan sebuah nama, perbaikannya menuntut ubah kode dan
// deploy ulang — dan sampai itu terjadi fiturnya mati tanpa sebab yang terlihat.
// Nama model bukan keputusan yang berulang di enam tempat; ia satu daftar
// keinginan, dan yang benar-benar dipakai adalah yang tersedia di antaranya.
//
// Kedua, tidak ada cara mengetahui model apa yang BOLEH dipakai sebuah kunci.
// Pertanyaan "bisa tidak naik ke model yang lebih pintar" selama ini hanya bisa
// dijawab dengan menebak nama lalu menunggu 404. Google menyediakan daftarnya
// lewat ListModels; aplikasi tinggal bertanya. Menanyakan lebih murah dan lebih
// jujur daripada menebak, dan hasilnya tidak pernah basi.
//
// Ditambah pemeriksaan bentuk kunci — sebab kredensial Google ada banyak macam
// dan hanya satu yang berlaku di sini. Menempelkan token yang salah jenis
// menghasilkan penolakan yang bunyinya sama persis dengan kunci yang benar
// tetapi belum diizinkan, sehingga waktunya habis untuk memperbaiki hal yang
// tidak rusak.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/**
 * Urutan keinginan untuk percakapan & pembacaan foto — terbaru di depan.
 *
 * Ini DAFTAR KEINGINAN, bukan janji. Yang dipakai adalah nama pertama yang
 * benar-benar ada pada kunci yang terpasang; sisanya cadangan. Menambahkan
 * model baru cukup di sini, dan nama yang sudah dihentikan tidak menggagalkan
 * apa pun karena memang tidak akan terpilih.
 *
 * Daftarnya sengaja bertahan di jalur FLASH. Model Pro memang lebih pintar,
 * tetapi tarif tokennya beberapa kali lipat, dan menaikkannya diam-diam berarti
 * melipatgandakan tagihan tanpa seorang pun memutuskannya. Kenaikan biaya
 * adalah keputusan pemilik tagihan, bukan efek samping dari sebuah daftar.
 * Bila suatu saat Pro memang dikehendaki, tinggal disisipkan di sini —
 * dengan sadar, dan tarifnya sudah terdaftar di biayaAi.ts.
 */
export const MODEL_TEKS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const

/**
 * Model yang DIKENAL lebih baik, tetapi tidak dipakai otomatis.
 *
 * Dua sebab, dan keduanya berlaku pada tiap panggilan.
 *
 * Nama yang belum tentu ada tidak boleh berada di jalur panas. Sempat
 * `gemini-3-flash` ditaruh paling depan supaya aplikasi "naik sendiri" ketika
 * Google merilisnya; akibatnya setiap panggilan mengetuk nama itu lebih dulu
 * dan menunggu penolakan sebelum mencoba yang benar-benar ada — satu perjalanan
 * sia-sia untuk setiap pesan, ditanggung pemakai yang sedang menunggu di
 * lapangan dengan sinyal seadanya.
 *
 * Model Pro punya masalah kedua: tarif tokennya beberapa kali lipat. Menaikkan
 * biaya adalah keputusan pemilik tagihan, bukan efek samping dari sebuah daftar.
 *
 * Daftar ini dipakai HANYA untuk membandingkan dengan katalog Google di halaman
 * Tes Koneksi: bila salah satunya ternyata tersedia, panel menyebutkannya, dan
 * pemindahannya ke MODEL_TEKS dilakukan dengan sadar.
 */
export const MODEL_LEBIH_BAIK = ['gemini-3-flash', 'gemini-3-pro-preview', 'gemini-2.5-pro'] as const

/** Nama lama; disimpan supaya pemanggil yang sudah ada tidak putus. */
export const MODEL_PREMIUM = MODEL_LEBIH_BAIK

/**
 * Model untuk panggilan tunggal yang tidak punya perulangan sendiri.
 *
 * Diberi nama, bukan diambil lewat MODEL_TEKS[0]/[1]. Indeks diam-diam
 * berpindah makna ketika daftarnya diurutkan ulang — dan itu sudah terjadi
 * sekali: mengeluarkan satu nama dari depan membuat setiap pemanggil
 * `MODEL_TEKS[1]` mendadak memakai model cadangan tanpa ada yang mengubahnya.
 */
export const MODEL_UTAMA = MODEL_TEKS[0]
export const MODEL_CADANGAN = MODEL_TEKS[MODEL_TEKS.length - 1]

/** Urutan keinginan untuk model yang MENGHASILKAN gambar. */
export const MODEL_GAMBAR = [
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
] as const

// ── Bentuk kunci ────────────────────────────────────────────────────────────

export type BentukKunci = 'api_key' | 'oauth' | 'terlalu_pendek' | 'bukan_kunci'

export interface PeriksaKunci {
  bentuk: BentukKunci
  /** Layak dikirim ke Google sama sekali. */
  layak: boolean
  /** Satu kalimat, siap ditampilkan. */
  pesan: string
}

/** API key Gemini: diawali AIzaSy, 39 karakter, tanpa titik maupun spasi. */
const POLA_API_KEY = /^AIza[0-9A-Za-z_-]{35}$/

/**
 * Periksa bentuk kunci SEBELUM mengirimnya.
 *
 * Google memakai beberapa jenis kredensial yang serupa sekilas: API key,
 * access token OAuth (`ya29.…`), dan token sesi (`AQ.…`). Hanya API key yang
 * berlaku pada `?key=` di Generative Language API. Yang lain ditolak dengan
 * 401/403 — bunyinya sama persis dengan kunci sah yang belum diizinkan, jadi
 * tanpa pemeriksaan ini orang akan menghabiskan waktu membetulkan izin,
 * penagihan, dan pembatasan domain untuk kunci yang memang tidak akan pernah
 * dipakai.
 */
export function periksaKunci(kunci: unknown): PeriksaKunci {
  const k = String(kunci ?? '').trim()

  if (!k) {
    return { bentuk: 'bukan_kunci', layak: false, pesan: 'Kunci masih kosong.' }
  }
  if (POLA_API_KEY.test(k)) {
    return { bentuk: 'api_key', layak: true, pesan: 'Bentuknya benar (API key Gemini).' }
  }
  if (/^ya29\./.test(k) || /^AQ\./.test(k) || /^1\/\//.test(k)) {
    return {
      bentuk: 'oauth',
      layak: false,
      pesan: 'Ini token OAuth/sesi Google, bukan API key. Token seperti ini tidak berlaku di '
        + 'Gemini API dan akan selalu ditolak. Ambil API key di Google AI Studio — bentuknya '
        + 'diawali "AIzaSy" dan panjangnya 39 karakter.',
    }
  }
  if (k.length < 39) {
    return {
      bentuk: 'terlalu_pendek',
      layak: false,
      pesan: `Kunci ini hanya ${k.length} karakter; API key Gemini panjangnya 39. `
        + 'Kemungkinan tersalin sebagian.',
    }
  }
  return {
    bentuk: 'bukan_kunci',
    layak: false,
    pesan: 'Bentuknya tidak seperti API key Gemini, yang selalu diawali "AIzaSy" dan '
      + 'panjangnya 39 karakter. Periksa apakah yang tersalin memang kuncinya.',
  }
}

// ── Daftar model dari Google ────────────────────────────────────────────────

export interface ModelGemini {
  /** Nama pendek yang dipakai di URL, mis. "gemini-2.5-flash". */
  nama: string
  /** Nama yang enak dibaca, dari Google. */
  tampil: string
  /** Bisa dipakai untuk percakapan/analisis. */
  bisaGenerate: boolean
  /** Menghasilkan gambar — yaitu, mahal. */
  gambar: boolean
}

interface ModelMentah {
  name?: unknown
  displayName?: unknown
  supportedGenerationMethods?: unknown
}

/**
 * Saring balasan ListModels menjadi daftar yang benar-benar bisa dipakai.
 *
 * Google mengembalikan juga model embedding dan penghitung token, yang tidak
 * ada gunanya di sini. Menampilkan semuanya membuat daftar panjang yang justru
 * menyulitkan pertanyaan yang sedang diajukan: "mana yang bisa saya pakai".
 */
export function saringModel(mentah: unknown): ModelGemini[] {
  const daftar = (mentah as { models?: unknown })?.models
  if (!Array.isArray(daftar)) return []

  const hasil: ModelGemini[] = []
  for (const m of daftar as ModelMentah[]) {
    const penuh = String(m?.name ?? '')
    const nama = penuh.replace(/^models\//, '').trim()
    if (!nama) continue

    const metode = Array.isArray(m?.supportedGenerationMethods)
      ? (m.supportedGenerationMethods as unknown[]).map(String)
      : []
    const bisaGenerate = metode.includes('generateContent')
    if (!bisaGenerate) continue

    hasil.push({
      nama,
      tampil: String(m?.displayName ?? nama).trim() || nama,
      bisaGenerate,
      gambar: /-image|image-generation/.test(nama),
    })
  }
  return hasil
}

/**
 * Nama pertama dari daftar keinginan yang benar-benar tersedia.
 *
 * Mengembalikan null bila tak satu pun cocok — itu keadaan yang harus terlihat,
 * bukan ditutup dengan menebak nama lain. Menebak menghasilkan 404 yang
 * terbaca seperti kegagalan izin, dan sebabnya jadi kabur lagi.
 */
export function pilihModel(
  tersedia: readonly string[] | readonly ModelGemini[],
  keinginan: readonly string[],
): string | null {
  const nama = new Set(
    (tersedia as readonly (string | ModelGemini)[])
      .map(t => (typeof t === 'string' ? t : t?.nama))
      .filter(Boolean)
      .map(n => String(n).replace(/^models\//, '')),
  )
  return keinginan.find(k => nama.has(k)) ?? null
}

/**
 * Model yang lebih baru daripada yang sedang dipakai — bila memang ada.
 *
 * Inilah jawaban atas "bisa tidak naik ke model yang lebih pintar", diambil
 * dari katalog Google saat itu juga alih-alih dari ingatan siapa pun.
 */
export function adaYangLebihBaik(
  tersedia: readonly ModelGemini[] | readonly string[],
  sedangDipakai: string,
  keinginan: readonly string[] = [...MODEL_LEBIH_BAIK, ...MODEL_TEKS],
): string | null {
  const terbaik = pilihModel(tersedia, keinginan)
  if (!terbaik || terbaik === sedangDipakai) return null

  const iTerbaik = keinginan.indexOf(terbaik)
  const iSekarang = keinginan.indexOf(sedangDipakai)
  // Model yang tidak ada di daftar keinginan dianggap paling belakang, supaya
  // apa pun yang terdaftar terhitung sebagai kenaikan.
  return iTerbaik < (iSekarang === -1 ? Infinity : iSekarang) ? terbaik : null
}
