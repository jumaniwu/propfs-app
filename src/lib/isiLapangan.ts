// ============================================================
// PropFS — Mengisi laporan lapangan DARI DALAM aplikasi
//
// Sampai sekarang satu-satunya jalan mengisi laporan harian adalah Link
// Pekerja: tautan bertoken yang dibuka di peramban luar. Untuk mandor yang
// memang tidak punya akun, itu tepat — ia tidak perlu login sama sekali.
//
// Untuk project manager dan pengawas yang SUDAH ada di dalam aplikasi, itu
// justru menyusahkan: aplikasinya harus ditinggalkan, dan tombol kembali
// membawa mereka ke halaman yang tidak menyegarkan dirinya — sehingga yang
// baru saja diisi tidak terlihat, dan tidak ada cara mengetahui apakah
// laporannya benar-benar masuk selain mengisinya lagi.
//
// Yang dipakai di sini TETAP jalur data yang sama: token buku laporan milik
// proyek yang dipilih. Membuat jalur kedua ke tabel yang sama berarti dua
// tempat yang bisa berselisih — dan seluruh sesi ini sudah penuh contoh apa
// yang terjadi setelahnya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()
const kunci = (v: unknown): string => teks(v).toLowerCase()

export interface BukuPilihan {
  id: string
  nama: string
  token: string
}

/**
 * Buku laporan yang bisa diisi, siap dipakai dropdown.
 *
 * Buku tanpa token DIBUANG: tanpa token tidak ada cara mengirim apa pun, dan
 * menawarkannya berarti menjanjikan sesuatu yang pasti gagal di ketukan
 * terakhir — setelah seluruh formulirnya diisi.
 */
export function pilihanBuku(
  logs: Array<{ id?: string; project_name?: string; report_token?: string }> | null | undefined,
): BukuPilihan[] {
  const hasil: BukuPilihan[] = []
  for (const l of logs ?? []) {
    const token = teks(l?.report_token)
    const id = teks(l?.id)
    if (!token || !id) continue
    hasil.push({ id, nama: teks(l?.project_name) || 'Tanpa nama proyek', token })
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
}

const KUNCI_TERAKHIR = 'propfs:isi-lapangan:buku'

type Laci = Pick<Storage, 'getItem' | 'setItem'>

function laci(l?: Laci): Laci | null {
  if (l) return l
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/**
 * Buku mana yang dibuka lebih dulu.
 *
 * Yang terakhir dipakai, bila ia masih ada. Pengawas mengisi proyek yang sama
 * setiap hari; memaksanya memilih ulang tiap kali membuka layar adalah satu
 * ketukan yang terbuang setiap hari selamanya.
 *
 * Kalau yang terakhir sudah tidak ada — bukunya dihapus, atau ia berpindah
 * perangkat — jatuh ke satu-satunya yang ada, dan hanya bila memang tinggal
 * satu. Menebak di antara beberapa proyek berisiko mengirim laporan ke proyek
 * yang salah, dan itu jauh lebih merugikan daripada satu ketukan.
 */
export function bukuAwal(
  daftar: BukuPilihan[] | null | undefined, l?: Laci,
): string {
  const d = daftar ?? []
  if (d.length === 0) return ''
  const laciNya = laci(l)
  try {
    const simpan = teks(laciNya?.getItem(KUNCI_TERAKHIR))
    if (simpan && d.some(x => x.id === simpan)) return simpan
  } catch { /* penyimpanan tidak tersedia */ }
  return d.length === 1 ? d[0].id : ''
}

export function ingatBuku(id: unknown, l?: Laci): void {
  const laciNya = laci(l)
  try { if (teks(id)) laciNya?.setItem(KUNCI_TERAKHIR, teks(id)) } catch { /* tidak apa-apa */ }
}

/**
 * Nama pengisi yang diusulkan.
 *
 * Diambil dari akun yang sedang masuk. Halaman bertoken memang harus bertanya
 * — mandor di sana tidak punya akun — tetapi di dalam aplikasi namanya sudah
 * diketahui, dan menanyakannya lagi setiap hari hanya mengundang ejaan yang
 * berbeda-beda. Rekap absensi memecah "Yono", "yono", dan "Pak Yono" menjadi
 * tiga orang.
 */
export function namaPengisi(
  profil: { nama?: string | null; email?: string | null } | null | undefined,
): string {
  const n = teks(profil?.nama)
  if (n) return n
  const e = teks(profil?.email)
  return e ? e.split('@')[0] : ''
}

export interface PeriksaIsi { boleh: boolean; alasan: string }

/** Apakah layar ini bisa dipakai sekarang. */
export function siapIsi(
  daftar: BukuPilihan[] | null | undefined, bukuId: unknown,
): PeriksaIsi {
  const d = daftar ?? []
  if (d.length === 0) {
    return {
      boleh: false,
      alasan: 'Belum ada buku laporan. Buat dulu di Laporan Lapangan,'
        + ' lalu proyeknya akan muncul di daftar ini.',
    }
  }
  if (!teks(bukuId)) return { boleh: false, alasan: 'Pilih dulu proyek yang mau diisi.' }
  if (!d.some(x => x.id === teks(bukuId))) {
    return { boleh: false, alasan: 'Proyek yang dipilih sudah tidak ada. Pilih yang lain.' }
  }
  return { boleh: true, alasan: '' }
}

/** Buku yang sedang dipilih. */
export function bukuTerpilih(
  daftar: BukuPilihan[] | null | undefined, bukuId: unknown,
): BukuPilihan | null {
  return (daftar ?? []).find(x => x.id === teks(bukuId)) ?? null
}

/**
 * Apakah dua nama proyek mengacu pada hal yang sama.
 *
 * Dipakai menyalakan proyek yang sedang aktif di aplikasi sebagai pilihan
 * awal, tanpa memaksakannya bila namanya tidak cocok.
 */
export function cocokProyek(a: unknown, b: unknown): boolean {
  const x = kunci(a), y = kunci(b)
  return !!x && x === y
}
