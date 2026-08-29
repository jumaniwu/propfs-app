// ============================================================
// PropFS — PO milik proyek mana
//
// Buku pengeluaran dipegang PER PROYEK, tetapi PO disimpan satu kolam untuk
// seluruh workspace. Panel "Sudah ada di Procurement" karena itu menawarkan
// SETIAP surat jalan kepada SETIAP proyek: membuka Noble Cove menampilkan
// pembelian kayu milik proyek Pak Soni, lengkap dengan tombol "Catat ke buku
// pengeluaran".
//
// Yang terjadi berikutnya bukan sekadar salah tempat. Satu ketukan di proyek
// yang keliru membukukan biaya itu di sana; ketukan yang sama di proyek yang
// benar membukukannya lagi. Dua-duanya mengalir ke laba rugi, ke neraca, dan
// ke perbandingan terhadap RAB — dan tidak ada yang menyadarinya sampai
// seseorang menghitung ulang dengan tangan.
//
// Yang memutuskan `project_name` di PO-nya. Ia dicocokkan menurut NAMA, bukan
// id, karena PO lahir dari sisi lapangan yang tidak mengenal id proyek di
// cost store — pola yang sama sudah dipakai TabAkuntan.
//
// PO TANPA nama proyek tidak disembunyikan, dan itu keputusan yang disengaja:
// menyembunyikannya membuatnya tidak bisa dicatat dari layar mana pun. Ia
// ditandai supaya yang mencatatnya tahu bahwa proyeknya belum pasti — lihat
// `poTanpaProyek`.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()
const kunci = (v: unknown): string => teks(v).toLowerCase()

/** PO ini belum menyebut proyek mana pun. */
export function poTanpaProyek(po: { project_name?: string | null } | null | undefined): boolean {
  return !teks(po?.project_name)
}

/**
 * PO ini milik proyek yang sedang dibuka.
 *
 * Nama proyek kosong berarti "semua proyek" — dipakai lingkup konsolidasi,
 * tempat memang semuanya boleh terlihat.
 */
export function poMilikProyek(
  po: { project_name?: string | null } | null | undefined, namaProyek: unknown,
): boolean {
  const target = kunci(namaProyek)
  if (!target) return true
  return kunci(po?.project_name) === target
}

/**
 * Apakah usul ini boleh ditawarkan di buku pengeluaran proyek ini.
 *
 * PO proyek LAIN tidak pernah ikut. PO tanpa proyek ikut, karena ia harus
 * bisa dijangkau dari suatu tempat — tetapi pemanggilnya wajib menandainya.
 */
export function usulUntukProyek<T extends { po: { project_name?: string | null } }>(
  usul: T[] | null | undefined, namaProyek: unknown,
): T[] {
  return (usul ?? []).filter(u => poMilikProyek(u.po, namaProyek) || poTanpaProyek(u.po))
}

/**
 * Peringatan untuk PO yang belum menyebut proyeknya.
 *
 * Menyebut AKIBATNYA, bukan sekadar "proyek kosong". Yang membacanya harus
 * mengerti bahwa mencatatnya di dua proyek menghasilkan biaya ganda — itulah
 * satu-satunya alasan peringatan ini ada.
 */
export function peringatanTanpaProyek(nomorPo: unknown): string {
  return `${teks(nomorPo) || 'PO ini'} belum menyebut proyek.`
    + ' Catat hanya di satu proyek — kalau dicatat di dua, biayanya terhitung dua kali.'
}

/**
 * Pilihan proyek pada formulir PO.
 *
 * "Tanpa proyek" sengaja diletakkan PALING BAWAH, bukan sebagai pilihan
 * pertama. Ia jalan keluar untuk pembelian yang memang bukan milik proyek
 * mana pun, bukan bawaan yang dipilih orang karena ia yang paling dekat
 * dengan jari.
 */
export function pilihanProyekPo(
  daftar: ReadonlyArray<{ nama?: string; projectName?: string }> | null | undefined,
): Array<{ nilai: string; label: string }> {
  const nama: string[] = []
  for (const p of daftar ?? []) {
    const n = teks(p?.nama ?? p?.projectName)
    if (n && !nama.some(x => kunci(x) === kunci(n))) nama.push(n)
  }
  return [
    ...nama.map(n => ({ nilai: n, label: n })),
    { nilai: '', label: 'Tanpa proyek (umum)' },
  ]
}
