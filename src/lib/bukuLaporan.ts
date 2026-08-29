// ============================================================
// PropFS — Buku laporan lapangan itu milik proyek mana
//
// Halaman Laporan Lapangan menampilkan JUDUL proyek yang sedang dibuka di
// kepala layar, lalu di bawahnya menampilkan SELURUH buku laporan milik semua
// proyek tanpa satu pun penanda. Membuka proyek "Ruko Pak Soni" memperlihatkan
// kartu bertuliskan "Rumah Noble Cove", dan tidak ada apa pun yang mengatakan
// bahwa itu buku proyek lain.
//
// Yang terjadi berikutnya bisa ditebak. Buku yang terlihat dianggap "buku
// proyek ini"; link pekerjanya dibagikan ke mandor Pak Soni; laporan harian
// dan absensinya masuk ke buku Noble Cove. Ketika dicari di proyek Pak Soni,
// tidak ada apa-apa di sana — dan yang tampak dari luar adalah laporan yang
// HILANG.
//
// Buku milik proyek lain TIDAK disembunyikan, dan itu disengaja: laporan yang
// terlanjur masuk ke sana harus tetap bisa dibuka dan dipindahkan. Yang berubah
// adalah ia dipisahkan dan diberi nama proyeknya, sehingga tidak ada lagi yang
// bisa keliru membagikannya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()
const kunci = (v: unknown): string => teks(v).toLowerCase()

export interface BukuRingkas {
  id?: string
  project_name?: string | null
}

/** Buku ini milik proyek yang sedang dibuka. */
export function bukuMilikProyek(buku: BukuRingkas | null | undefined, namaProyek: unknown): boolean {
  const target = kunci(namaProyek)
  if (!target) return true
  return kunci(buku?.project_name) === target
}

export interface KelompokBuku<T> {
  /** Buku proyek ini — dan buku lama yang belum menyebut proyek. */
  milikProyek: T[]
  /** Buku proyek lain. Ditampilkan, tetapi terpisah dan diberi nama. */
  proyekLain: T[]
}

/**
 * Pisahkan buku menurut pemiliknya.
 *
 * Buku TANPA nama proyek ikut ke kelompok pertama. Data lama banyak yang
 * begitu — dibuat sebelum nama proyek ikut disimpan — dan membuangnya ke
 * "proyek lain" akan membuat satu-satunya buku yang dimiliki sebagian orang
 * tampak seperti milik orang lain.
 */
export function kelompokkanBuku<T extends BukuRingkas>(
  daftar: T[] | null | undefined, namaProyek: unknown,
): KelompokBuku<T> {
  const milikProyek: T[] = []
  const proyekLain: T[] = []
  for (const b of daftar ?? []) {
    if (!teks(namaProyek) || !teks(b?.project_name) || bukuMilikProyek(b, namaProyek)) {
      milikProyek.push(b)
    } else {
      proyekLain.push(b)
    }
  }
  return { milikProyek, proyekLain }
}

export interface PeriksaBuat { boleh: boolean; alasan: string }

/**
 * Apakah buku baru boleh dibuat sekarang.
 *
 * Dua penolakan, dan keduanya menutup jalan yang selama ini terbuka:
 *
 * Tanpa proyek aktif, buku lama dibuat bernama harfiah "Proyek" — nama yang
 * tidak cocok dengan proyek mana pun, sehingga bukunya melayang selamanya di
 * antara semua proyek.
 *
 * Buku KEDUA untuk proyek yang sama membelah laporannya menjadi dua tempat,
 * dan yang membagikan link tidak punya cara mengetahui mana yang dipakai
 * mandor. Rekap absensi lalu menghitung setengahnya, dan upah yang dibayar
 * kurang tanpa ada yang tahu sebabnya.
 */
export function bolehBuatBuku(
  daftar: BukuRingkas[] | null | undefined, namaProyek: unknown,
): PeriksaBuat {
  const nama = teks(namaProyek)
  if (!nama) {
    return {
      boleh: false,
      alasan: 'Buka proyeknya dulu lewat Daftar Proyek. Buku laporan harus menempel'
        + ' pada satu proyek — kalau tidak, laporan yang masuk tidak ketemu lagi.',
    }
  }
  const ada = (daftar ?? []).find(b => kunci(b?.project_name) === kunci(nama))
  if (ada) {
    return {
      boleh: false,
      alasan: `Proyek ${nama} sudah punya buku laporan. Pakai yang sudah ada —`
        + ' buku kedua membelah laporannya ke dua tempat, dan mandor tidak tahu mana yang dipakai.',
    }
  }
  return { boleh: true, alasan: '' }
}

/**
 * Kalimat ketika proyek ini belum punya buku sama sekali, padahal buku lain
 * kelihatan di layar.
 *
 * Inilah jawaban atas "kenapa laporannya hilang". Menyebutnya terang-terangan
 * jauh lebih berguna daripada layar kosong: yang membacanya baru saja mengira
 * bukunya lenyap.
 */
export function pesanBelumPunyaBuku(namaProyek: unknown, jumlahLain: number): string {
  const nama = teks(namaProyek) || 'Proyek ini'
  const dasar = `${nama} belum punya buku laporan.`
  if (jumlahLain > 0) {
    return `${dasar} ${jumlahLain} buku di bawah milik proyek lain —`
      + ' laporan yang dikirim lewat link itu masuk ke proyek tersebut, bukan ke sini.'
  }
  return `${dasar} Klik "Buat Buku Laporan" untuk mulai.`
}
