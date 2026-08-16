// ============================================================
// PropFS — Menerjemahkan kegagalan masuk menjadi kalimat yang menolong
//
// CACAT YANG DIPERBAIKI BERKAS INI.
//
// Salah ketik password menghasilkan layar seperti ini:
//
//     Gagal Terhubung
//     Pesan: Invalid login credentials. Pastikan internet stabil dan
//     akun sudah terverifikasi.
//
// Tiga hal salah sekaligus. Judulnya menuduh KONEKSI, padahal koneksinya
// baik-baik saja — justru karena tersambunglah server sempat menjawab.
// Pesannya berbahasa Inggris, kepada pemakai yang seluruh aplikasinya
// berbahasa Indonesia. Dan saran yang diberikan ("periksa internet",
// "verifikasi akun") mengirim orang memeriksa dua hal yang tidak rusak,
// sementara yang rusak — passwordnya — tidak pernah disebut.
//
// Yang terjadi berikutnya bisa ditebak: orang mengira aplikasinya bermasalah,
// bukan ketikannya.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

export interface PesanGalat {
  judul: string
  isi: string
  /** Menawarkan tautan "Lupa Password?" — hanya bila memang itu masalahnya. */
  sarankanReset: boolean
}

const BAWAAN: PesanGalat = {
  judul: 'Gagal Masuk',
  isi: 'Coba lagi sebentar lagi. Bila terus berulang, hubungi support@propfs.id.',
  sarankanReset: false,
}

/**
 * Terjemahkan galat autentikasi menjadi kalimat yang menyebut penyebab yang
 * BENAR — dan hanya menyarankan tindakan yang memang menolong.
 */
export function pesanGalatMasuk(galat: unknown): PesanGalat {
  const teks = String(
    (galat && typeof galat === 'object' && 'message' in galat
      ? (galat as { message?: unknown }).message
      : galat) ?? '',
  ).trim()

  if (!teks) return BAWAAN
  const t = teks.toLowerCase()

  // Yang paling sering, dan yang selama ini paling salah dijelaskan.
  if (t.includes('invalid login credentials') || t.includes('invalid credentials')) {
    return {
      judul: 'Email atau Password Salah',
      isi: 'Periksa lagi ketikannya. Huruf besar-kecil pada password ikut dihitung.',
      sarankanReset: true,
    }
  }

  if (t.includes('email not confirmed') || t.includes('not confirmed')) {
    return {
      judul: 'Email Belum Diverifikasi',
      isi: 'Buka email pendaftaran Anda (periksa juga folder spam) lalu klik tautan verifikasinya.',
      sarankanReset: false,
    }
  }

  if (t.includes('too many requests') || t.includes('rate limit') || t.includes('over_email_send_rate')) {
    return {
      judul: 'Terlalu Sering Mencoba',
      isi: 'Tunggu sekitar satu menit, lalu coba lagi. Ini pengaman otomatis, bukan akun yang diblokir.',
      sarankanReset: false,
    }
  }

  if (t.includes('user not found') || t.includes('user does not exist')) {
    return {
      judul: 'Akun Tidak Ditemukan',
      isi: 'Email ini belum terdaftar. Periksa ejaannya, atau daftar lebih dulu.',
      sarankanReset: false,
    }
  }

  // BARU di sini koneksi boleh disalahkan — dan hanya kalau memang itu
  // yang dikatakan galatnya.
  if (
    t.includes('failed to fetch') || t.includes('networkerror') || t.includes('network error')
    || t.includes('timeout') || t.includes('waktu habis') || t.includes('load failed')
  ) {
    return {
      judul: 'Tidak Ada Koneksi',
      isi: 'Periksa sambungan internet HP Anda, lalu coba masuk lagi.',
      sarankanReset: false,
    }
  }

  // Yang tidak dikenali ditampilkan APA ADANYA, tanpa tuduhan yang mengarang.
  // Pesan asing lebih baik daripada pesan yang salah dengan percaya diri.
  return { judul: 'Gagal Masuk', isi: teks, sarankanReset: false }
}
