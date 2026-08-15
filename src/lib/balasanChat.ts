// ============================================================
// PropFS — Membersihkan balasan AI sebelum ditampilkan
//
// CACAT YANG DIPERBAIKI BERKAS INI.
//
// Balasan AI membawa blok ```json di akhirnya — itulah perintah yang dibaca
// sistem untuk mencatat, mengubah, dan menghapus transaksi. Bloknya memang
// sudah dibuang sebelum ditampilkan.
//
// Yang TIDAK dibuang adalah kalimat yang memperkenalkannya:
//
//     "Berikut data JSON untuk pencatatan sistem:"
//     "Berikut perintah JSON untuk menghapus data duplikat tersebut dari sistem:"
//
// Kalimat itu tertinggal sendirian di ujung balasan, menunjuk sesuatu yang
// tidak ada. Pemakainya bukan programmer; ia melihat aplikasinya menjanjikan
// sesuatu lalu tidak memberikannya, dan kata "JSON" adalah isi perut sistem
// yang tidak pernah perlu ia lihat.
//
// Dua lapis: prompt melarang menulisnya, dan berkas ini membuangnya bila
// ditulis juga. Model bahasa tidak selalu menurut, jadi lapis kedua bukan
// kemewahan.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/**
 * Kalimat pengantar yang menunjuk blok data yang sudah dibuang.
 *
 * Dicocokkan hanya di UJUNG teks. Kata "JSON" di tengah penjelasan bisa saja
 * memang jawaban atas pertanyaan pemakainya — membuangnya di sana berarti
 * memotong kalimat yang dimintanya sendiri.
 */
const PENGANTAR = new RegExp(
  // Baris TERAKHIR, yang menyebut data sistem, DAN berakhir titik dua.
  //
  // Titik dua itu syarat yang menentukan. Tanpanya, kalimat seperti "Format
  // JSON dipakai sistem untuk bertukar data, Pak." — jawaban sah atas
  // pertanyaan pemakainya sendiri — ikut terbuang, dan aplikasinya menolak
  // menjawab hal yang ditanyakan kepadanya. Titik dua adalah tanda bahwa
  // kalimat itu MENUNJUK sesuatu yang menyusul, bukan menerangkan sesuatu.
  String.raw`(?:^|\n)[^\n]{0,140}\b(?:json|blok (?:kode|data)|kode di ?bawah)\b[^\n]{0,80}:\s*$`,
  'i',
)

/** Sisa pagar blok kode yang terlanjur separuh, mis. ``` tanpa penutup. */
const PAGAR_MENGGANTUNG = /\n\s*`{3,}\s*[a-z]*\s*$/i

/**
 * Buang kalimat pengantar data yang sudah tidak ada, berulang sampai bersih.
 *
 * Berulang karena AI kadang menulis dua baris sekaligus — satu kalimat ajakan
 * dan satu baris judul — dan membuang satu saja menyisakan yang lain.
 */
export function bersihkanBalasan(teks: unknown): string {
  let s = String(teks ?? '').replace(/\r\n/g, '\n')

  for (let putaran = 0; putaran < 4; putaran++) {
    const sebelum = s
    s = s.replace(PAGAR_MENGGANTUNG, '')
    s = s.replace(PENGANTAR, '')
    s = s.replace(/[\s\n]+$/, '')
    if (s === sebelum) break
  }

  return s.trim()
}

/**
 * Apakah teks yang siap tampil masih menyebut isi perut sistem.
 *
 * Dipakai uji, bukan alur biasa: bila ini pernah bernilai true pada balasan
 * yang sudah dibersihkan, berarti ada bentuk kalimat baru yang belum dikenali.
 */
export function masihBocor(teks: unknown): boolean {
  return /\bjson\b/i.test(String(teks ?? ''))
}
