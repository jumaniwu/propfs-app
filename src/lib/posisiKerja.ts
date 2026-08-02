// ============================================================
// PropFS — Di mana pemakai sedang berada, ditulis di alamatnya sendiri
//
// Gejalanya: memuat ulang halaman di tengah pekerjaan selalu melempar kembali
// ke daftar proyek. Proyek yang sedang dibuka hilang, menu yang sedang dibuka
// hilang, dan pekerjaannya harus dicari ulang dari awal.
//
// Penyebabnya bukan pemuatan ulang itu sendiri, melainkan bahwa posisi kerja
// tidak pernah tercatat di mana pun yang bertahan. Ia hanya ada di state React:
//
//   1. Deep-link `?tab=…&project=…` dibaca sekali saat halaman dibuka, lalu
//      query-nya SENGAJA DIHAPUS ("bersihkan query"). Sejak itu alamatnya
//      tinggal `/cost-control` — tidak lagi menyebut sedang di mana.
//   2. Berpindah menu atau membuka proyek tidak pernah menyentuh alamat.
//   3. Proyek yang sedang dibuka tidak disimpan di mana pun; setiap pemuatan
//      ulang dimulai dari nol.
//
// Ketiganya bertemu di satu akibat: memuat ulang = kembali ke titik awal.
//
// Modul ini menjadikan ALAMAT sebagai catatan posisi. Alamat adalah satu-
// satunya tempat yang bertahan melewati pemuatan ulang, ikut tersalin saat
// tautannya dikirim ke orang lain, dan bekerja dengan tombol kembali peramban
// tanpa perlu diurus sendiri.
//
// Tanpa DOM & tanpa React supaya bisa diuji di Node.
// ============================================================

/** Menu di workspace proyek. Urutannya mengikuti sidebar. */
export const TAB_KERJA = [
  'overview', 'rab', 'material', 'realisasi', 'kurva_s',
  'akuntan', 'spk', 'lapangan', 'laporan', 'settings',
] as const

export type TabKerja = typeof TAB_KERJA[number]

export interface PosisiKerja {
  /** Id proyek yang sedang dibuka. */
  proyek?: string
  /** Menu yang sedang dibuka. */
  tab?: TabKerja
  /** Sub-menu di dalam menu itu (mis. sub-tab Akuntan). */
  sub?: string
}

const bersih = (v: unknown): string => String(v ?? '').trim()

function keSearchParams(x: string | URLSearchParams | null | undefined): URLSearchParams {
  if (x instanceof URLSearchParams) return x
  return new URLSearchParams(bersih(x))
}

/**
 * Baca posisi kerja dari alamat.
 *
 * Nilai yang tidak dikenali DIABAIKAN, bukan diteruskan apa adanya. Alamat bisa
 * datang dari mana saja — tautan lama, salah ketik, tautan yang dipotong saat
 * disalin lewat WhatsApp — dan `tab=xyz` yang diteruskan begitu saja akan
 * menghasilkan layar kosong tanpa satu pun menu yang cocok.
 */
export function bacaPosisi(sumber: string | URLSearchParams | null | undefined): PosisiKerja {
  const q = keSearchParams(sumber)
  const proyek = bersih(q.get('project'))
  const tab = bersih(q.get('tab'))
  const sub = bersih(q.get('sub'))

  const hasil: PosisiKerja = {}
  if (proyek) hasil.proyek = proyek
  if ((TAB_KERJA as readonly string[]).includes(tab)) hasil.tab = tab as TabKerja
  if (sub) hasil.sub = sub
  return hasil
}

/**
 * Tulis posisi kerja menjadi alamat.
 *
 * Urutan kuncinya tetap (project, tab, sub) supaya dua posisi yang sama selalu
 * menghasilkan teks yang sama — itulah yang membuat perbandingan di
 * `samaPosisi` bisa dipakai untuk mencegah penulisan berulang ke riwayat
 * peramban.
 *
 * Bagian yang kosong tidak ditulis: `?tab=rab&sub=` hanya membuat alamatnya
 * panjang tanpa menambah keterangan apa pun.
 */
export function tulisPosisi(p: PosisiKerja = {}): URLSearchParams {
  const q = new URLSearchParams()
  const proyek = bersih(p.proyek)
  const sub = bersih(p.sub)
  if (proyek) q.set('project', proyek)
  if (p.tab && (TAB_KERJA as readonly string[]).includes(p.tab)) q.set('tab', p.tab)
  if (sub) q.set('sub', sub)
  return q
}

/** Apakah alamat saat ini sudah menggambarkan posisi ini. */
export function samaPosisi(
  sekarang: string | URLSearchParams | null | undefined,
  posisi: PosisiKerja,
): boolean {
  return keSearchParams(sekarang).toString() === tulisPosisi(posisi).toString()
}

/**
 * Sub-menu yang sah untuk sebuah halaman, dengan nilai bawaan bila tidak
 * dikenali.
 *
 * Dipakai halaman ber-sub-tab di luar workspace (Procurement, Material
 * Lapangan) yang punya daftar sub-menunya sendiri.
 */
export function subSah<T extends string>(
  nilai: unknown,
  pilihan: readonly T[],
  bawaan: T,
): T {
  const v = bersih(nilai)
  return (pilihan as readonly string[]).includes(v) ? (v as T) : bawaan
}
