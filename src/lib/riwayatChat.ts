// ============================================================
// PropFS — Memilah mana yang layak dikirim balik ke AI sebagai riwayat
//
// Gelembung galat adalah tampilan, bukan percakapan. Tetapi ia disimpan di
// daftar pesan yang sama dengan jawaban sungguhan, dan seluruh daftar itu
// dikirim balik ke Gemini sebagai riwayat pada setiap pesan berikutnya.
//
// Akibatnya model membaca kalimat-kalimat itu sebagai UCAPANNYA SENDIRI:
//
//   "Kuota layanan AI sudah terpakai habis."
//   "GEMINI_API_KEY belum terbaca di server."
//   Kata Google: "You exceeded your current quota…"
//
// lalu meneruskan peran itu dengan patuh — "Mohon maaf, saya tidak dapat
// memproses lampiran gambar karena kuota penggunaan terlampaui" — meskipun
// permintaannya barusan BERHASIL dan kuotanya sudah pulih. Kegagalan yang
// sudah lewat menular ke percakapan yang sebenarnya sehat, dan satu-satunya
// jalan keluar bagi pemakainya adalah menekan "Bersihkan" tanpa pernah tahu
// mengapa.
//
// Lebih buruk lagi, gelembung itu ikut tersimpan. Jadi memperbaiki sebab
// aslinya tidak menyembuhkan percakapan yang sudah telanjur teracuni.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export interface PesanRiwayat {
  id?: string
  role: 'user' | 'assistant'
  text?: string
  files?: unknown[]
  /** Ditandai saat gelembungnya dibuat dari sebuah galat. */
  galat?: boolean
}

/**
 * Ciri gelembung galat, untuk riwayat yang TERLANJUR tersimpan tanpa penanda.
 *
 * Penanda `galat` menyelesaikan masalah untuk pesan baru, tetapi riwayat lama
 * sudah berada di penyimpanan pemakai tanpa penanda apa pun. Tanpa pengenalan
 * berdasarkan isi, percakapan yang sudah teracuni akan tetap meracuni dirinya
 * sendiri sampai dibersihkan manual — dan tidak ada yang memberi tahu bahwa
 * itu yang perlu dilakukan.
 *
 * Semuanya adalah kalimat yang ditulis aplikasi ini sendiri, bukan tebakan
 * atas kalimat orang.
 */
const CIRI_GALAT: RegExp[] = [
  /^⚠️/,
  /^Kuota layanan AI sudah terpakai habis/,
  /^Layanan AI sedang (sangat padat|tidak bisa dipakai)/,
  /^Koneksi terputus saat menghubungi layanan AI/,
  /^Layanan AI tidak bisa memproses pesan ini/,
  /^GEMINI_API_KEY belum terbaca di server/,
  /^Kunci layanan AI ditolak oleh Google/,
  /\bKata Google: "/,
  /\bKata server kami: "/,
  /\bRincian teknis: /,
]

/** Apakah gelembung ini lahir dari sebuah galat, bukan dari jawaban AI. */
export function pesanGalat(p: PesanRiwayat | null | undefined): boolean {
  if (!p) return false
  if (p.galat === true) return true
  // Hanya balasan AI yang bisa menjadi gelembung galat; apa pun yang diketik
  // pemakai adalah percakapan sungguhan, betapapun mirip bunyinya.
  if (p.role !== 'assistant') return false
  const t = String(p.text ?? '').trim()
  return t.length > 0 && CIRI_GALAT.some(c => c.test(t))
}

/**
 * Riwayat yang layak dikirim ke model.
 *
 * Membuang dua hal: sapaan pembuka yang bukan percakapan, dan gelembung galat
 * yang bukan ucapan model. Sisanya diteruskan apa adanya — memangkas lebih
 * jauh berarti membuang konteks yang justru dibutuhkan untuk memahami nota
 * yang sedang dibicarakan.
 */
export function riwayatUntukModel<T extends PesanRiwayat>(pesan: readonly T[] | null | undefined): T[] {
  return (pesan ?? []).filter(p =>
    p && !(p.role === 'assistant' && p.id === 'system-start') && !pesanGalat(p),
  )
}
