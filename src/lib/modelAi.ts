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

/**
 * Model gambar HEMAT — dan ini yang dipakai kalau tidak ada yang memilih.
 *
 * Ditulis terpisah dari jalur Pro karena satu kejadian yang mahal. Pada 16
 * Agustus 2026, `gemini-3-pro-image-preview` disisipkan ke DEPAN satu-satunya
 * daftar gambar yang ada. Sejak itu setiap render masterplan, setiap render
 * dari CAD, dan setiap ketukan "Rapikan foto" di Marcom memakai model termahal
 * di keluarga Gemini — tanpa seorang pun memutuskannya, dan tanpa satu baris
 * pun di layar yang menyebutkannya. Tagihan hari itu melonjak ke Rp 530 ribu.
 *
 * Daftar model TEKS di atas sudah lama menolak hal yang sama, dengan alasan
 * yang berlaku persis sama di sini: kenaikan biaya adalah keputusan pemilik
 * tagihan, bukan efek samping dari sebuah daftar. Yang kurang dulu hanyalah
 * menerapkannya pada gambar — padahal justru di gambar selisihnya berlipat,
 * bukan berpersen.
 */
export const MODEL_GAMBAR_HEMAT = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
] as const

/**
 * Model gambar MUTU TINGGI — hanya dipakai bila dipilih dengan sadar.
 *
 * Hasilnya memang lebih baik, dan untuk render presentasi ke pemilik proyek
 * itu bisa sepadan. Yang tidak sepadan adalah membayarnya tanpa tahu: karena
 * itu ia hanya bisa dicapai lewat pilihan di layar yang menyebutkan
 * perkiraan harganya lebih dulu (lihat lib/mutuGambar.ts).
 *
 * Jalur hematnya tetap disambung di belakang sebagai cadangan: bila model Pro
 * belum tersedia pada kunci yang terpasang, rendernya tetap jadi.
 */
export const MODEL_GAMBAR_TINGGI = [
  'gemini-3-pro-image-preview',
  ...MODEL_GAMBAR_HEMAT,
] as const

/** Urutan keinginan bawaan untuk model yang MENGHASILKAN gambar. */
export const MODEL_GAMBAR = MODEL_GAMBAR_HEMAT

// Pemeriksaan bentuk kunci dulu ada di sini, dipakai kotak "uji kunci lain"
// di halaman admin. Keduanya hilang bersama kuncinya: sejak kunci pindah ke
// server, browser tidak lagi memegang apa pun untuk diperiksa. Yang masih
// memeriksa bentuk adalah api/ai.ts — di sanalah kuncinya berada, dan di sana
// pemeriksaannya hanya MENJELASKAN penolakan, tidak menolak.

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
