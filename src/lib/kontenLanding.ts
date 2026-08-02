// ============================================================
// PropFS — Menyelaraskan konten landing dengan bawaan terbaru
//
// Halaman depan punya DUA sumber: nilai bawaan di kode, dan salinan yang
// tersimpan di app_settings begitu admin pernah menyunting lewat CMS. Yang
// tersimpan selalu menang — memang harus begitu, kalau tidak setiap rilis akan
// menghapus tulisan yang sudah disusun admin.
//
// Akibatnya, ketika kode membawa naskah baru (modul baru dirilis, produknya
// berganti fokus), halaman depan TIDAK ikut berubah. Yang terlihat pemakainya:
// naskah baru berkelebat sekejap saat halaman dibuka — itu render pertama dari
// nilai bawaan — lalu tergantikan naskah lama begitu salinan CMS selesai
// diambil. Terlihat seperti kerusakan, padahal justru bekerja sesuai rancangan.
//
// Modul ini tidak menimpa apa pun sendiri. Tugasnya cuma satu: menunjukkan
// BAGIAN MANA yang berbeda dari bawaan terbaru, supaya admin bisa mengambilnya
// per bagian. Menimpa otomatis akan membuang tulisan yang mungkin sengaja
// disusun — dan itu kerusakan yang sebenarnya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export type KunciSeksi =
  | 'branding' | 'hero' | 'suitableFor' | 'features'
  | 'auxiliaryProducts' | 'marketingHighlight' | 'footer' | 'faq'

export interface SeksiLanding {
  kunci: KunciSeksi
  label: string
  /** Penjelasan singkat isi bagian ini, untuk ditampilkan di layar. */
  isi: string
}

/**
 * Urutannya mengikuti urutan bagian di halaman depan, bukan abjad — admin
 * membandingkannya sambil menggulir halamannya sendiri.
 */
export const SEKSI_LANDING: SeksiLanding[] = [
  { kunci: 'branding', label: 'Branding', isi: 'Nama situs, tagline, logo, favicon.' },
  { kunci: 'hero', label: 'Hero', isi: 'Judul utama, subjudul, hashtag, gambar.' },
  { kunci: 'suitableFor', label: 'Cocok Untuk', isi: 'Daftar jenis pemakai yang disasar.' },
  { kunci: 'features', label: 'Modul', isi: 'Kartu modul yang ditawarkan.' },
  { kunci: 'auxiliaryProducts', label: 'Produk Pendamping', isi: 'Produk tambahan di luar modul utama.' },
  { kunci: 'marketingHighlight', label: 'Sorotan', isi: 'Blok ajakan besar beserta gambarnya.' },
  { kunci: 'footer', label: 'Footer', isi: 'Kontak, alamat, WhatsApp, hak cipta.' },
  { kunci: 'faq', label: 'FAQ', isi: 'Pertanyaan yang sering ditanyakan.' },
]

/**
 * Bandingkan dua nilai apa adanya.
 *
 * Urutan kunci objek TIDAK dianggap perbedaan: dua salinan yang isinya sama
 * tetapi ditulis dengan urutan kunci berbeda adalah hal yang lumrah setelah
 * data bolak-balik lewat JSON, dan melaporkannya sebagai "berbeda" akan
 * membuat daftar ini penuh berisik yang tidak bisa ditindaklanjuti.
 */
export function samaIsinya(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  const arrA = Array.isArray(a), arrB = Array.isArray(b)
  if (arrA !== arrB) return false
  if (arrA && arrB) {
    const x = a as unknown[], y = b as unknown[]
    // Urutan larik JUSTRU berarti — itu urutan tampil di halaman.
    return x.length === y.length && x.every((v, i) => samaIsinya(v, y[i]))
  }

  const x = a as Record<string, unknown>, y = b as Record<string, unknown>
  const kunci = new Set([...Object.keys(x), ...Object.keys(y)])
  for (const k of kunci) {
    if (!samaIsinya(x[k], y[k])) return false
  }
  return true
}

export interface BedaSeksi extends SeksiLanding {
  /** true bila isi tersimpan berbeda dari bawaan terbaru. */
  berbeda: boolean
}

/** Bagian mana saja yang isinya berbeda dari bawaan terbaru. */
export function bandingkanSeksi(
  tersimpan: Record<string, unknown> | null | undefined,
  bawaan: Record<string, unknown>,
): BedaSeksi[] {
  return SEKSI_LANDING.map(s => ({
    ...s,
    berbeda: !samaIsinya(tersimpan?.[s.kunci], bawaan?.[s.kunci]),
  }))
}

/**
 * Salin SATU bagian dari bawaan ke konten tersimpan.
 *
 * Objek baru dikembalikan; masukannya tidak disentuh. Bagian lain tidak ikut
 * berubah — itulah gunanya memilih per bagian: naskah modul boleh diperbarui
 * tanpa menghapus alamat kantor yang sudah benar.
 */
export function pakaiBawaanSeksi<T extends Record<string, unknown>>(
  tersimpan: T, bawaan: Record<string, unknown>, kunci: KunciSeksi,
): T {
  if (!SEKSI_LANDING.some(s => s.kunci === kunci)) return tersimpan
  return { ...tersimpan, [kunci]: salin(bawaan?.[kunci]) } as T
}

/** Salin seluruh bagian yang berbeda sekaligus. */
export function pakaiBawaanSemua<T extends Record<string, unknown>>(
  tersimpan: T, bawaan: Record<string, unknown>,
): T {
  let hasil = tersimpan
  for (const s of SEKSI_LANDING) {
    hasil = pakaiBawaanSeksi(hasil, bawaan, s.kunci)
  }
  return hasil
}

/**
 * Salinan dalam, supaya menyunting hasilnya tidak diam-diam mengubah
 * DEFAULT_LANDING_CONTENT yang dipakai bersama seluruh aplikasi.
 */
function salin<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(salin) as unknown as T
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = salin(x)
  return out as T
}

/** Kalimat ringkas untuk kepala panel, mis. "3 bagian berbeda dari bawaan". */
export function ringkasBeda(daftar: BedaSeksi[]): string {
  const n = daftar.filter(d => d.berbeda).length
  if (n === 0) return 'Semua bagian sudah sama dengan bawaan terbaru.'
  return `${n} bagian berbeda dari bawaan terbaru.`
}
