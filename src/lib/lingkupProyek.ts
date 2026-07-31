// ============================================================
// PropFS — Lingkup proyek untuk halaman berupa daftar
//
// Sistemnya multi-proyek, tetapi beberapa halaman daftar menampilkan seluruh
// proyek sekaligus tanpa penyaring: Material Lapangan dan Procurement. Angka
// dan barang dari proyek berbeda tercampur di satu layar, dan tidak ada cara
// memisahkannya.
//
// Dipisah ke berkas .ts sendiri (bukan di dalam komponennya) supaya bisa diuji
// di Node — Node hanya bisa melucuti tipe dari .ts, tidak dari .tsx.
// ============================================================

/** Penanda "semua proyek" pada pemilih lingkup. */
export const SEMUA_PROYEK = ''

/**
 * Saring baris menurut nama proyek.
 *
 * Baris TANPA nama proyek ikut tampil di lingkup mana pun. Data lama banyak
 * yang begitu, dan menyembunyikannya berarti membuatnya tidak bisa dijangkau
 * dari layar mana pun — jauh lebih merugikan daripada menampilkan sedikit
 * lebih banyak.
 */
export function saringProyek<T extends { project_name?: string | null }>(
  rows: T[], namaProyek: string,
): T[] {
  const target = (namaProyek ?? '').trim().toLowerCase()
  if (!target) return rows
  return rows.filter(r => {
    const nama = (r.project_name ?? '').trim().toLowerCase()
    return nama === '' || nama === target
  })
}
