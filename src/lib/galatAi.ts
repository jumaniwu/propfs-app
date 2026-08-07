// ============================================================
// PropFS — Membaca kegagalan layanan AI, dan mengatakannya apa adanya
//
// Sebelumnya SEMUA kegagalan dilaporkan sebagai "layanan AI sedang sangat
// sibuk, coba lagi dalam ±1 menit". Untuk kegagalan yang benar-benar
// kepadatan, kalimat itu benar. Untuk 403 Permission denied — kunci API
// ditolak Google — kalimat itu menyesatkan dengan cara yang paling merugikan:
// pemakainya menunggu semenit, mencoba lagi, gagal lagi, dan mengulanginya
// sepanjang hari, sementara yang perlu diperbaiki adalah SETELAN kunci dan
// tidak akan pernah membaik dengan sendirinya.
//
// Kegagalan yang tidak bisa membaik juga TIDAK BOLEH DIULANG. Mengulang 403
// dua kali per model untuk dua model hanya menghabiskan delapan detik hidup
// pemakainya untuk menunggu jawaban yang sudah pasti sama.
//
// Rincian teknis mentah tidak ditempelkan ke pesan. Sebelumnya JSON galat
// lengkap ikut tercetak di gelembung chat lewat `<!-- Debug: … -->` yang
// dikira komentar HTML tak terlihat — padahal isi chat dirender sebagai teks,
// jadi seluruhnya terbaca pemakai.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export type JenisGalat =
  | 'kunci' | 'kuota' | 'sibuk' | 'jaringan' | 'waktu' | 'ukuran' | 'gambar' | 'lain'

/** Yang paling perlu ditindak didahulukan bila satu upaya gagal beragam. */
const PRIORITAS: JenisGalat[] =
  ['kunci', 'kuota', 'ukuran', 'gambar', 'waktu', 'jaringan', 'sibuk', 'lain']

/**
 * Kenali jenis kegagalan dari pesan galat apa pun.
 *
 * Dicocokkan pada TEKS karena itulah satu-satunya yang tersedia: pemanggilnya
 * sudah membungkus respons HTTP menjadi Error jauh sebelum sampai ke sini.
 */
export function jenisGalat(pesan: unknown): JenisGalat {
  const t = String(
    pesan instanceof Error ? pesan.message : typeof pesan === 'string' ? pesan : JSON.stringify(pesan ?? ''),
  ).toLowerCase()
  if (!t.trim()) return 'lain'

  // Galat dari perantara /api/ai — bukan dari Google.
  //
  // Diperiksa PALING DULU dan berdasarkan namanya, bukan kode statusnya.
  // NO_SERVER_KEY memakai status 500, dan 500 masuk keranjang "sedang padat" —
  // sehingga kunci server yang belum dipasang dilaporkan sebagai kepadatan
  // Google, lalu diulang berkali-kali menunggu sesuatu yang tidak akan datang.
  // Persis kesalahan yang modul ini dibuat untuk menghentikannya, terulang
  // lewat kode status milik kami sendiri.
  // Anggaran waktu kita sendiri yang habis — bukan gangguan jaringan.
  //
  // Dibedakan karena akibatnya berlawanan: gangguan jaringan layak diulang,
  // sedangkan tenggat yang terlampaui berarti percobaan berikutnya akan
  // terputus di tempat yang sama. Sempat keduanya disamakan, dan pengaman
  // yang dipasang untuk menghentikan penungguan justru melipatgandakannya.
  if (t.includes('waktu_habis')) return 'waktu'

  // Muatan terlalu besar untuk fungsi serverless.
  //
  // Vercel menjawabnya dengan 413 berupa HALAMAN HTML, bukan JSON, dan halaman
  // itu tidak menyebut ukuran sama sekali. Tanpa dikenali, ia jatuh ke "lain"
  // yang layak diulang — sehingga foto yang terlalu besar dikirim ulang
  // berkali-kali, masing-masing sampai batas waktunya, dan tak satu pun bisa
  // berhasil. Ukuran tidak berubah karena dicoba lagi.
  if (/\b413\b/.test(t) || t.includes('payload_too_large') || t.includes('payload too large')
    || t.includes('request entity too large')) return 'ukuran'

  // Gambarnya sampai, tetapi Google tidak bisa membacanya.
  if (t.includes('unable to process input image')
    || t.includes('invalid image') || t.includes('image is not valid')
    || t.includes('unsupported mime type')) return 'gambar'

  if (t.includes('no_server_key')) return 'kunci'
  if (t.includes('model_not_allowed')) return 'lain'

  // Kuota yang DINYATAKAN eksplisit didahulukan.
  //
  // Pesan 429 dari Google berbunyi "You exceeded your current quota, please
  // check your plan and billing details" — memuat kata "billing". Karena
  // cabang kunci di bawah ikut mencocokkan kata itu, kuota habis sempat
  // terbaca sebagai masalah kunci, dan orang dikirim memperbaiki penagihan
  // project yang sebenarnya tidak apa-apa. Kode 429 dan RESOURCE_EXHAUSTED
  // tidak pernah ambigu; keduanya diputuskan lebih dulu.
  if (/\b429\b/.test(t) || t.includes('resource_exhausted')
    || t.includes('exceeded your current quota')) return 'kuota'

  // Kunci/izin — tidak akan membaik dengan menunggu.
  if (/\b(401|403)\b/.test(t)
    || t.includes('permission denied') || t.includes('permission_denied')
    || t.includes('unauthenticated') || t.includes('api key not valid')
    || t.includes('api_key_invalid') || t.includes('invalid api key')
    || t.includes('service_disabled') || t.includes('has not been used in project')
    || t.includes('no gemini key') || t.includes('no openrouter key') || t.includes('no groq key')
    || t.includes('billing')) return 'kunci'

  // Kuota habis — bisa membaik, tetapi biasanya baru besok.
  if (/\b429\b/.test(t) || t.includes('rate_limit') || t.includes('rate limit')
    || t.includes('resource_exhausted') || t.includes('quota')) return 'kuota'

  // Jaringan pemakai.
  if (t.includes('failed to fetch') || t.includes('networkerror') || t.includes('load failed')
    || t.includes('aborted') || t.includes('aborterror') || t.includes('timeout')
    || t.includes('timed out')) return 'jaringan'

  // Sisi layanan sedang padat — inilah satu-satunya yang pantas disebut "sibuk".
  if (/\b(500|502|503|504)\b/.test(t) || t.includes('overload') || t.includes('unavailable')
    || t.includes('internal error') || t.includes('empty response')) return 'sibuk'

  return 'lain'
}

/**
 * Layakkah upayanya diulang?
 *
 * `kunci` tidak: menunggu tidak mengubah izin. `kuota` juga tidak dalam satu
 * sesi — kuota harian tidak pulih dalam hitungan detik, dan mengulanginya
 * hanya menambah panggilan yang sudah pasti ditolak.
 */
export function bisaDiulang(jenis: JenisGalat): boolean {
  return jenis === 'sibuk' || jenis === 'jaringan' || jenis === 'lain'
}

export interface RingkasGalat {
  jenis: JenisGalat
  /** Kalimat yang ditampilkan ke pemakai. */
  pesan: string
  /** Rincian teknis ringkas — untuk console dan (bagi superadmin) satu baris. */
  teknis: string
}

export interface OpsiRingkas {
  /** Pesannya menyertakan gambar: jalur cadangan tanpa gambar tidak berlaku. */
  adaGambar?: boolean
  /** Superadmin diberi satu baris teknis; pemakai biasa tidak. */
  superadmin?: boolean
}

const PESAN: Record<JenisGalat, (o: OpsiRingkas) => string> = {
  kunci: o => (o.superadmin
    ? 'Kunci layanan AI ditolak oleh Google (izin/403).\n\n'
    : 'Layanan AI sedang tidak bisa dipakai karena setelan di sisi kami.\n\n')
    + (o.superadmin
      ? 'Menunggu tidak akan menolong — setelannya yang perlu diperbaiki. Yang biasanya jadi sebab:\n'
        + '• API "Generative Language" belum diaktifkan di project kuncinya\n'
        + '• Kunci dibatasi ke domain/IP tertentu, dan propfs.id belum termasuk\n'
        + '• Penagihan (billing) project sedang bermasalah\n\n'
        + 'Sementara itu, isi nota bisa diketik manual.'
      : 'Ini setelan di sisi kami, bukan kesalahan Anda — dan tidak akan pulih dengan menunggu. '
        + 'Mohon beri tahu admin. Sementara itu, isi nota bisa diketik manual. 🙏'),

  kuota: o => 'Kuota layanan AI sudah terpakai habis.\n\n'
    + (o.superadmin
      ? 'Kuota harian Gemini tercapai. Ia pulih pada pergantian hari (waktu Pasifik AS), '
        + 'atau bisa dinaikkan lewat penagihan project.'
      : 'Biasanya pulih besok. Sementara itu, isi nota bisa diketik manual. 🙏'),

  sibuk: o => 'Layanan AI sedang sangat padat saat ini.\n\n'
    + 'Silakan coba lagi dalam ±1 menit, atau ketik isi nota secara manual. 🙏'
    + (o.adaGambar ? '\n\n*Tanpa foto, AI biasanya menjawab lebih cepat.*' : ''),

  jaringan: () => 'Koneksi terputus saat menghubungi layanan AI.\n\n'
    + 'Periksa sinyal atau Wi-Fi Anda, lalu kirim ulang. 🙏',

  ukuran: () => 'Lampirannya terlalu besar untuk dikirim sekaligus.\n\n'
    + 'Kirim satu foto saja per pesan, atau foto ulang dari jarak lebih dekat — '
    + 'foto yang lebih rapat pada notanya justru lebih mudah dibaca AI.',

  gambar: () => 'Fotonya sampai, tetapi AI tidak bisa membacanya.\n\n'
    + 'Biasanya karena terlalu buram, terlalu gelap, atau formatnya tidak lazim. '
    + 'Coba foto ulang dengan cahaya cukup dan nota terbentang rata — atau ketik isinya manual.',

  waktu: o => 'AI belum selesai membaca dalam waktu yang wajar.\n\n'
    + (o.adaGambar
      ? 'Foto yang besar atau banyak sekaligus membuatnya lama. Coba kirim satu foto saja, '
        + 'atau ketik isi notanya — itu justru paling cepat.'
      : 'Coba kirim ulang. Bila berulang, pesan yang lebih pendek biasanya selesai lebih cepat.'),

  lain: o => 'Layanan AI tidak bisa memproses pesan ini.\n\n'
    + 'Silakan coba lagi, atau ketik isi nota secara manual. 🙏'
    + (o.adaGambar ? '\n\n*Foto yang sangat besar kadang ditolak — coba foto yang lebih kecil.*' : ''),
}

/** Ringkas rincian teknis menjadi satu baris pendek yang masih berguna. */
export function ringkasTeknis(errors: unknown[], maks = 160): string {
  const bagian = (errors ?? [])
    .map(e => String(e instanceof Error ? e.message : e ?? ''))
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!bagian.length) return ''

  // Yang berguna hanya nama model + kode/kata kunci galatnya, bukan seluruh
  // badan JSON yang dikembalikan layanan.
  const padat = bagian.map(t => {
    const model = /^([\w.-]+)(\[\d+\])?:/.exec(t)?.[1] ?? ''
    const kode = /\b(400|401|403|429|500|502|503|504)\b/.exec(t)?.[1] ?? ''
    const sebab = /(PERMISSION_DENIED|RESOURCE_EXHAUSTED|SERVICE_DISABLED|API_KEY_INVALID|UNAUTHENTICATED|RATE_LIMIT|OVERLOAD)/i
      .exec(t)?.[1] ?? ''
    const inti = [kode, sebab.toUpperCase()].filter(Boolean).join(' ')
    // Sisanya dipotong SETELAH awalan "model[n]: " dibuang, supaya nama
    // modelnya tidak tercetak dua kali dalam satu baris.
    const sisa = t.replace(/^[\w.-]+(\[\d+\])?:\s*/, '').slice(0, 40)
    return [model, inti || sisa].filter(Boolean).join(' → ')
  })

  // Upaya yang gagal dengan cara yang sama tidak perlu diulang penyebutannya.
  const unik = [...new Set(padat)]
  const teks = unik.join(' · ')
  return teks.length <= maks ? teks : `${teks.slice(0, maks - 1)}…`
}

/**
 * Satu ringkasan dari seluruh upaya yang gagal.
 *
 * Bila upayanya gagal dengan cara berbeda-beda, yang dipilih adalah yang
 * paling bisa ditindak — bukan yang terakhir. Salah menyebut masalah izin
 * sebagai "sedang sibuk" persis kesalahan yang membuat orang menunggu
 * sepanjang hari tanpa hasil.
 */
export function ringkasGalatAi(errors: unknown[], opsi: OpsiRingkas = {}): RingkasGalat {
  const jenisSemua = (errors ?? []).map(jenisGalat)
  const jenis = PRIORITAS.find(j => jenisSemua.includes(j)) ?? 'lain'
  const teknis = ringkasTeknis(errors ?? [])

  let pesan = PESAN[jenis](opsi)
  // Rincian teknis HANYA untuk superadmin, satu baris, tanpa JSON mentah.
  if (opsi.superadmin && teknis) pesan += `\n\nRincian teknis: ${teknis}`
  return { jenis, pesan, teknis }
}
