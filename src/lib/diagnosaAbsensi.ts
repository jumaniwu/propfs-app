// ============================================================
// PropFS — Kenapa rekap absensi kosong
//
// KENAPA BERKAS INI ADA.
//
// "Belum ada absensi tercatat" muncul untuk tiga keadaan yang sama sekali
// berbeda, dan orang yang membacanya tidak bisa membedakan mana yang sedang
// terjadi:
//
//   1. Permintaannya GAGAL. Penolakan RLS, migrasi yang belum dijalankan,
//      jaringan putus — semuanya ditelan menjadi daftar kosong oleh
//      `.catch(() => setReports([]))`, lalu layarnya berkata seolah memang
//      belum ada yang mengisi absen.
//   2. Buku ini memang masih kosong.
//   3. Laporannya ADA, tapi tak satu pun membawa absensi — misalnya karena
//      semuanya masuk ke buku KEMBAR yang lain, atau karena laporan itu
//      dikirim sebelum absensi ada.
//
// Keadaan pertama yang paling berbahaya, karena berbunyi seperti keadaan
// kedua. Yang membacanya menyimpulkan datanya hilang, padahal datanya utuh
// dan hanya tidak terambil — atau sebaliknya, menyangka belum diisi padahal
// mandor sudah mengisinya sebulan penuh.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export interface KeadaanAbsensi {
  /** Pesan kegagalan pemuatan, bila permintaannya ditolak. */
  galat?: string
  /** Laporan yang berhasil dimuat untuk buku ini. */
  jumlahLaporan: number
  /** Di antaranya, yang benar-benar membawa baris absensi. */
  jumlahBerabsensi: number
  /** Buku LAIN dengan nama proyek yang sama, beserta jumlah laporannya. */
  bukuLain?: Array<{ nama: string; jumlah: number }>
}

export interface HasilDiagnosaAbsensi {
  nada: 'galat' | 'kosong' | 'tanpaAbsensi' | 'adaDiBukuLain' | 'ada'
  judul: string
  pesan: string
  /** Langkah yang bisa ditempuh sekarang; kosong bila memang tidak ada. */
  saran?: string
}

/**
 * Pilih kalimat yang menjelaskan keadaan yang SEBENARNYA.
 *
 * Urutannya penting. Kegagalan pemuatan diperiksa lebih dulu daripada
 * apa pun, karena angka-angka di bawahnya tidak berarti apa-apa bila
 * daftarnya tidak pernah sampai.
 */
export function diagnosaAbsensi(k: KeadaanAbsensi | null | undefined): HasilDiagnosaAbsensi {
  const jumlahLaporan = Math.max(0, k?.jumlahLaporan ?? 0)
  const berabsensi = Math.max(0, k?.jumlahBerabsensi ?? 0)
  const lain = (k?.bukuLain ?? []).filter(b => b.jumlah > 0)
  const totalLain = lain.reduce((s, b) => s + b.jumlah, 0)

  if (k?.galat) {
    return {
      nada: 'galat',
      judul: 'Laporan gagal dimuat',
      pesan: `${k.galat} Jadi ini BUKAN berarti datanya hilang —`
        + ' daftarnya tidak pernah sampai ke layar ini.',
      saran: 'Coba muat ulang halaman. Kalau tetap gagal, jalankan'
        + ' migration_klaim_keanggotaan.sql di Supabase SQL Editor —'
        + ' penolakan izin baca paling sering datang dari sana.',
    }
  }

  if (berabsensi > 0) {
    return {
      nada: 'ada',
      judul: `${berabsensi} laporan berisi absensi`,
      pesan: `Dari ${jumlahLaporan} laporan di buku ini.`,
    }
  }

  // Laporannya tidak ada di buku ini, tapi ada di buku lain dengan nama yang
  // sama. Inilah gejala buku kembar, dan yang dibutuhkan bukan mengisi ulang
  // apa pun melainkan menggabungkan bukunya.
  if (jumlahLaporan === 0 && totalLain > 0) {
    return {
      nada: 'adaDiBukuLain',
      judul: 'Buku ini kosong, tapi ada buku lain yang berisi',
      pesan: `Buku ini tidak punya satu laporan pun, sementara ${lain.length} buku lain`
        + ` dengan nama proyek yang sama menyimpan ${totalLain} laporan.`
        + ' Datanya tidak hilang — hanya masuk ke buku yang berbeda.',
      saran: 'Tutup panel ini, lalu tekan "Gabungkan jadi 1 buku" pada'
        + ' peringatan buku kembar di daftar buku. Jangan menghapus bukunya.',
    }
  }

  if (jumlahLaporan === 0) {
    return {
      nada: 'kosong',
      judul: 'Belum ada laporan masuk',
      pesan: 'Buku ini belum menerima satu laporan pun dari lapangan.',
      saran: 'Absensi diisi mandor lewat Link Pekerja, di dalam form laporan'
        + ' harian yang sama.',
    }
  }

  // Ada laporannya, tapi tidak satu pun membawa absensi. Ini keadaan yang
  // paling sering disalahartikan sebagai data hilang.
  const catatanLain = totalLain > 0
    ? ` ${totalLain} laporan lain ada di buku kembar — kalau absensinya di sana,`
      + ' gabungkan bukunya dulu.'
    : ''
  return {
    nada: 'tanpaAbsensi',
    judul: `${jumlahLaporan} laporan ada, tapi tanpa absensi`,
    pesan: `Laporannya tidak hilang — semuanya masih terbaca di tab "Laporan Harian".`
      + ` Yang tidak ada hanya daftar absennya: tak satu pun dari ${jumlahLaporan} laporan`
      + ` itu membawa nama tukang yang masuk.${catatanLain}`,
    saran: 'Absensi diisi mandor di dalam form laporan harian yang sama, pada'
      + ' bagian absen. Laporan yang dikirim tanpa bagian itu tetap tersimpan,'
      + ' hanya tidak menyumbang hari kerja.',
  }
}
