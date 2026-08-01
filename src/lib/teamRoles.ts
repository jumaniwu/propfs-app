// ============================================================
// PropFS — Tim & Role Kontraktor AI (logika murni, tanpa DOM)
// Menentukan modul apa yang boleh dibuka/diubah tiap jabatan.
// Dipakai bersama oleh Home (grid menu), sidebar workspace, dan
// tombol aksi di modul material/SPK.
// ============================================================

export type TeamRole =
  | 'pemilik'      // pemilik akun / direktur — akses penuh
  | 'manajemen'    // manajer/admin kantor — hampir penuh, bisa approve
  | 'keuangan'     // akunting/finance
  | 'pm'           // project manager / site manager
  | 'pengawas'     // pengawas lapangan / mandor
  | 'logistik'     // logistik / gudang
  | 'viewer'       // klien / pemantau, baca saja

export type Modul =
  | 'rab'          // RAB & Material Schedule
  | 'realisasi'    // Realisasi biaya, Kurva S
  | 'akuntan'      // Akuntan, konsolidasi
  | 'spk'          // SPK digital
  | 'lapangan'     // Laporan harian, kalender progres
  | 'material'     // Penggunaan & request material
  | 'procurement'  // Vendor, katalog harga, purchase order
  | 'studi'        // Feasibility Study — fitur tambahan, bukan pekerjaan lapangan
  | 'leads'        // Cari Leads — calon konsumen & tindak lanjutnya
  | 'tim'          // Tim, pengguna, pengaturan

export type Aksi = 'baca' | 'tulis' | 'approve'

export interface RoleInfo {
  key: TeamRole
  label: string
  /** Penjelasan singkat untuk ditampilkan saat memilih jabatan. */
  deskripsi: string
}

export const ROLES: RoleInfo[] = [
  { key: 'pemilik', label: 'Pemilik / Direktur', deskripsi: 'Akses penuh ke semua modul, termasuk mengelola pengguna.' },
  { key: 'manajemen', label: 'Manajemen / Admin', deskripsi: 'Hampir semua modul dan bisa menyetujui permintaan material.' },
  { key: 'keuangan', label: 'Keuangan / Akunting', deskripsi: 'Fokus pada realisasi biaya, akuntan, dan laporan konsolidasi.' },
  { key: 'pm', label: 'Project Manager', deskripsi: 'Mengelola RAB, SPK, laporan lapangan, dan menyetujui material.' },
  { key: 'pengawas', label: 'Pengawas / Mandor', deskripsi: 'Mengisi laporan lapangan dan pemakaian material.' },
  { key: 'logistik', label: 'Logistik / Gudang', deskripsi: 'Mengelola material: pemakaian, permintaan, dan stok.' },
  { key: 'viewer', label: 'Viewer / Klien', deskripsi: 'Hanya melihat laporan, tidak bisa mengubah data.' },
]

export const MODUL_LABEL: Record<Modul, string> = {
  rab: 'RAB & Material Schedule',
  realisasi: 'Realisasi Biaya & Kurva S',
  akuntan: 'Akuntan & Konsolidasi',
  spk: 'SPK Digital',
  lapangan: 'Laporan Lapangan',
  material: 'Material (Pakai & Request)',
  procurement: 'Procurement (Vendor & PO)',
  studi: 'Feasibility Study',
  leads: 'Cari Leads',
  tim: 'Tim & Pengaturan',
}

/** '-' tidak boleh sama sekali, 'r' baca, 'rw' baca+tulis, 'rwa' + menyetujui. */
type Izin = '-' | 'r' | 'rw' | 'rwa'

// Procurement: yang boleh MENYETUJUI PO sama dengan yang boleh menyetujui
// material — pemilik, manajemen, dan PM. Logistik membuat PO tetapi tidak
// menyetujui PO buatannya sendiri; keuangan hanya melihat untuk keperluan
// pembayaran; pengawas melihat agar tahu barang sudah dipesan atau belum.
const MATRIKS: Record<TeamRole, Record<Modul, Izin>> = {
  pemilik:   { rab: 'rwa', realisasi: 'rwa', akuntan: 'rwa', spk: 'rwa', lapangan: 'rwa', material: 'rwa', procurement: 'rwa', studi: 'rwa',   leads: 'rwa', tim: 'rwa' },
  manajemen: { rab: 'rw',  realisasi: 'rw',  akuntan: 'rw',  spk: 'rw',  lapangan: 'rw',  material: 'rwa', procurement: 'rwa', studi: 'r',   leads: 'rwa', tim: 'r' },
  keuangan:  { rab: 'r',   realisasi: 'rw',  akuntan: 'rw',  spk: 'r',   lapangan: '-',   material: 'r',   procurement: 'r',   studi: 'r',   leads: 'r',   tim: '-' },
  pm:        { rab: 'rw',  realisasi: 'rw',  akuntan: 'r',   spk: 'rw',  lapangan: 'rw',  material: 'rwa', procurement: 'rwa', studi: '-',   leads: 'rw',  tim: '-' },
  pengawas:  { rab: 'r',   realisasi: 'r',   akuntan: '-',   spk: 'r',   lapangan: 'rw',  material: 'rw',  procurement: 'r',   studi: '-',   leads: '-',   tim: '-' },
  logistik:  { rab: 'r',   realisasi: '-',   akuntan: '-',   spk: '-',   lapangan: 'r',   material: 'rw',  procurement: 'rw',  studi: '-',   leads: '-',   tim: '-' },
  viewer:    { rab: 'r',   realisasi: 'r',   akuntan: '-',   spk: 'r',   lapangan: 'r',   material: 'r',   procurement: '-',   studi: '-',   leads: '-',   tim: '-' },
}

/** Apakah `role` boleh melakukan `aksi` pada `modul`. */
export function can(role: TeamRole, modul: Modul, aksi: Aksi = 'baca'): boolean {
  const izin = MATRIKS[role]?.[modul] ?? '-'
  if (izin === '-') return false
  if (aksi === 'baca') return true
  if (aksi === 'tulis') return izin === 'rw' || izin === 'rwa'
  return izin === 'rwa'
}

/** Daftar modul yang boleh dibuka role ini (untuk menyaring menu & sidebar). */
export function modulTerlihat(role: TeamRole): Modul[] {
  return (Object.keys(MODUL_LABEL) as Modul[]).filter(m => can(role, m, 'baca'))
}

/** Ringkasan izin satu role untuk ditampilkan di tabel Role & Akses. */
export function ringkasIzin(role: TeamRole): Array<{ modul: Modul; label: string; izin: Izin }> {
  return (Object.keys(MODUL_LABEL) as Modul[]).map(m => ({
    modul: m, label: MODUL_LABEL[m], izin: MATRIKS[role][m],
  }))
}

export const IZIN_LABEL: Record<Izin, string> = {
  '-': 'Tidak ada akses',
  r: 'Lihat saja',
  rw: 'Lihat & ubah',
  rwa: 'Lihat, ubah & setujui',
}

/** Peta menu Home/sidebar → modul, agar penyaringan role konsisten. */
export const MENU_KE_MODUL: Record<string, Modul> = {
  overview: 'rab', rab: 'rab', material: 'rab', arsitek: 'rab',
  realisasi: 'realisasi', kurva_s: 'realisasi', laporan: 'realisasi',
  akuntan: 'akuntan', konsolidasi: 'akuntan',
  spk: 'spk',
  lapangan: 'lapangan',
  material_lapangan: 'material',
  procurement: 'procurement',
  feasibility: 'studi',
  leads: 'leads',
  tim: 'tim', settings: 'tim',
}
