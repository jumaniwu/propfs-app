// ============================================================
// PropFS — Siapa yang pantas melihat sambutan "buat proyek FS pertama Anda"
//
// CACAT YANG DIPERBAIKI BERKAS INI.
//
// Karyawan yang baru pertama kali masuk disambut dengan tiga langkah membuat
// proyek Feasibility Study: "Klik tombol + Proyek Baru di dashboard".
//
// Tombol itu tidak ada untuknya. Modul Feasibility Study memang dikunci untuk
// sesi tim — RouteGuards melemparnya kembali ke Kontraktor AI kalau ia
// mencoba membukanya. Jadi yang disodorkan adalah pekerjaan yang mustahil ia
// kerjakan, di layar pertama yang ia lihat, sebagai kesan pertamanya terhadap
// aplikasi ini.
//
// Syaratnya dulu hanya dua: belum pernah ditutup, dan `total_projects_created`
// masih nol. Keduanya SELALU benar untuk karyawan — ia memang tidak pernah
// membuat proyek FS, dan tidak akan pernah. Sambutan itu karena itu bukan
// "belum ditutup", melainkan salah alamat sejak awal.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()

export interface KeadaanSambutan {
  /** Masuk lewat halaman login tim (/tim/masuk). */
  sesiTim: boolean
  /** Workspace perusahaan yang sedang dibuka; null = milik sendiri. */
  workspaceOwner: string | null
  /** Akun yang sedang login. */
  userId: string | null
  /** Sudah pernah ditutup di perangkat ini. */
  sudahDitutup: boolean
  /** Berapa proyek FS yang pernah dibuat akun ini. */
  proyekDibuat: number
}

/**
 * Anggota tim, bukan pemilik akun.
 *
 * Dua bentuknya, dan keduanya harus dikenali:
 *
 *   - masuk lewat halaman login tim — sesinya memang dikunci ke satu
 *     perusahaan sejak awal;
 *   - masuk dengan akun sendiri lalu MENUKAR workspace ke perusahaan lain.
 *     Orangnya sama, tetapi yang sedang ia kerjakan bukan miliknya.
 *
 * Bentuk kedua yang paling mudah terlewat: `sesiTim()` bernilai false, dan
 * tanpa memeriksa workspace-nya ia akan dianggap pemilik.
 */
export function anggotaTim(k: Pick<KeadaanSambutan, 'sesiTim' | 'workspaceOwner' | 'userId'>): boolean {
  if (k?.sesiTim) return true
  const ws = teks(k?.workspaceOwner)
  if (!ws) return false
  // Workspace sendiri yang kebetulan tersimpan bukan berarti anggota tim.
  return ws !== teks(k?.userId)
}

/**
 * Boleh menampilkan sambutan "buat proyek FS pertama Anda"?
 *
 * Karyawan TIDAK PERNAH melihatnya — bukan ditunda, bukan diganti isinya.
 * Menggantinya dengan sambutan lain adalah pekerjaan yang tidak diminta;
 * yang diminta adalah berhenti menyodorkan tombol yang tidak ada untuknya.
 */
export function bolehLihatSambutan(k: KeadaanSambutan | null | undefined): boolean {
  if (!k?.userId) return false
  if (anggotaTim(k)) return false
  if (k.sudahDitutup) return false
  return (Number(k.proyekDibuat) || 0) === 0
}
