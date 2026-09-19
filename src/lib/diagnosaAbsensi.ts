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
  /**
   * Berapa laporan yang SUNGGUH ada di buku ini, dihitung lewat jalur
   * bertoken yang tidak tunduk pada RLS.
   *
   * Ini satu-satunya cara membedakan "memang kosong" dari "ada tapi tidak
   * boleh dibaca". RLS tidak pernah melempar galat: ia mengembalikan
   * `200 []`, persis seperti tabel yang memang tidak punya isi. Tanpa
   * pembanding ini, penyaringan izin tidak bisa dibedakan dari kekosongan
   * oleh siapa pun — termasuk oleh aplikasinya sendiri.
   */
  tersembunyi?: number
}

export interface HasilDiagnosaAbsensi {
  nada: 'galat' | 'tersaring' | 'kosong' | 'tanpaAbsensi' | 'adaDiBukuLain' | 'ada'
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
    // Waktu habis dan penolakan izin adalah dua kegagalan yang berbeda, dan
    // saran yang keliru lebih buruk daripada tidak ada saran: menyuruh orang
    // menjalankan migrasi database padahal jaringannya yang putus membuatnya
    // membongkar hal yang tidak rusak.
    const waktuHabis = /waktu habis|timeout|aborted|failed to fetch|network/i.test(k.galat)
    return {
      nada: 'galat',
      judul: waktuHabis ? 'Waktu habis saat memuat' : 'Laporan gagal dimuat',
      pesan: `${k.galat} Jadi ini BUKAN berarti datanya hilang —`
        + ' daftarnya tidak pernah sampai ke layar ini.',
      saran: waktuHabis
        ? 'Coba lagi, sebaiknya lewat Wi-Fi. Kalau di komputer bisa dibuka'
          + ' sementara di ponsel tidak, itu soal besarnya data yang diangkut,'
          + ' bukan soal izin — jangan menjalankan migrasi apa pun untuk ini.'
        : 'Coba muat ulang halaman. Kalau tetap gagal, jalankan'
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

  // Laporannya ADA, tapi akun ini tidak diizinkan membacanya.
  //
  // Diperiksa sebelum kekosongan mana pun, karena inilah satu-satunya
  // keadaan di mana layar kosong benar-benar berbohong: datanya utuh, jumlahnya
  // diketahui, dan satu-satunya yang kurang adalah izin.
  const tersembunyi = Math.max(0, k?.tersembunyi ?? 0)
  if (tersembunyi > jumlahLaporan) {
    const tak = tersembunyi - jumlahLaporan
    return {
      nada: 'tersaring',
      judul: `${tak} laporan ada, tapi tidak boleh dibaca akun ini`,
      pesan: `Buku ini sebenarnya berisi ${tersembunyi} laporan`
        + `${jumlahLaporan > 0 ? `, tapi hanya ${jumlahLaporan} yang terbaca` : ''}.`
        + ' Datanya TIDAK hilang — izin bacanya yang belum terpasang. Buku ini'
        + ' dibuat atas nama akun lain (biasanya pengawas), dan akun Anda belum'
        + ' terikat sebagai anggota timnya.',
      saran: 'Jalankan migration_klaim_keanggotaan.sql di Supabase SQL Editor,'
        + ' lalu migration_buku_milik_perusahaan.sql — urutannya begitu.'
        + ' Menerbitkan ulang aplikasi lewat GitHub TIDAK menjalankan SQL;'
        + ' migrasi hanya berjalan kalau ditempel sendiri di SQL Editor.',
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
