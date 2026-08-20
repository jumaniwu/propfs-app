// ============================================================
// PropFS — Membuka kembali berkas yang sudah tersimpan
//
// Tagihan vendor menyimpan foto/PDF aslinya, dan kartu tagihannya menuliskan
// nama berkas itu. Tetapi tidak ada satu pun jalan untuk MEMBUKANYA — sehingga
// nomor rekening yang tertulis di foto nota, yang justru dibutuhkan untuk
// mentransfer, hanya bisa dilihat dengan membuka WhatsApp lagi.
//
// Menyimpan bukti tanpa menyediakan cara melihatnya sama saja tidak
// menyimpannya. Modul ini bagian yang bisa salah tanpa terlihat salah:
// menyusun ulang base64 menjadi berkas yang benar-benar bisa dibuka peramban.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/** Jenis yang bisa ditampilkan langsung di layar tanpa aplikasi lain. */
const GAMBAR = /^image\/(jpeg|jpg|png|webp|gif|heic|heif|avif)$/i

export function bisaTampilInline(mime: unknown): boolean {
  return GAMBAR.test(String(mime ?? '').trim())
}

export function adalahPdf(mime: unknown): boolean {
  return /^application\/pdf$/i.test(String(mime ?? '').trim())
}

/**
 * Data URI dari base64 yang tersimpan.
 *
 * Yang disimpan adalah base64 TELANJANG — tanpa awalan `data:…;base64,` —
 * karena itulah bentuk yang diminta Gemini pada `inlineData`. Menempelkannya
 * apa adanya ke `src` menghasilkan gambar rusak tanpa pesan galat apa pun:
 * peramban hanya menampilkan ikon kosong, dan tidak ada yang tahu sebabnya.
 *
 * Bila yang tersimpan ternyata SUDAH berupa data URI (baris lama, atau sumber
 * lain), ia dikembalikan apa adanya alih-alih dibungkus dua kali.
 */
export function dataUriBerkas(mime: unknown, base64: unknown): string {
  const b = String(base64 ?? '').trim()
  if (!b) return ''
  if (/^data:/i.test(b)) return b
  const m = String(mime ?? '').trim() || 'application/octet-stream'
  return `data:${m};base64,${b}`
}

/** Base64 telanjang dari data yang mungkin sudah berupa data URI. */
export function base64Telanjang(data: unknown): string {
  const s = String(data ?? '').trim()
  if (!s) return ''
  return /^data:/i.test(s) ? s.slice(s.indexOf(',') + 1) : s
}

/**
 * Nama berkas yang aman dipakai saat menyimpan.
 *
 * Nama datang dari perangkat vendor dan tidak pernah diperiksa siapa pun.
 * Garis miring di dalamnya membuat unduhan tersimpan di tempat yang tidak
 * diduga; nama kosong membuat berkasnya tersimpan tanpa ekstensi dan tidak
 * bisa dibuka dengan ketukan.
 */
export function namaBerkasAman(nama: unknown, mime: unknown, cadangan = 'lampiran'): string {
  const bersih = String(nama ?? '').trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120)
  if (bersih) return bersih
  const ext = adalahPdf(mime) ? 'pdf'
    : bisaTampilInline(mime) ? String(mime).split('/')[1].toLowerCase().replace('jpeg', 'jpg')
    : 'bin'
  return `${cadangan}.${ext}`
}

/** Keterangan singkat untuk berkas yang tidak bisa ditampilkan di layar. */
export function keteranganBerkas(mime: unknown): string {
  if (adalahPdf(mime)) return 'PDF'
  if (bisaTampilInline(mime)) return 'Gambar'
  const m = String(mime ?? '').trim()
  return m ? m.split('/').pop()!.toUpperCase() : 'Berkas'
}

/**
 * Nama tombol yang membuka berkas — mengikuti tempat aplikasinya berjalan.
 *
 * "Buka di tab baru" adalah kalimat peramban. Di dalam APK tidak ada tab, dan
 * yang muncul ketika tombolnya ditekan adalah menu Bagikan Android: WhatsApp,
 * Drive, pembaca PDF. Menyebutnya "tab baru" di sana bukan sekadar salah
 * istilah — orang menunggu tab yang tidak akan pernah muncul, lalu
 * menyimpulkan tombolnya rusak.
 */
export function labelBuka(diApk: boolean): string {
  return diApk ? 'Buka dengan aplikasi lain' : 'Buka di tab baru'
}

/**
 * Kalimat pada layar untuk berkas yang tidak bisa ditampilkan di dalam
 * halaman.
 *
 * Ditulis sebagai PERINTAH, bukan sebagai laporan.
 *
 * Versi sebelumnya berbunyi "PDF ini dibuka di tab baru" — kalimat yang
 * mengabarkan sesuatu yang BELUM terjadi, di layar tempat belum ada apa pun
 * yang dibuka. Yang membacanya menyimpulkan berkasnya sudah terbuka di suatu
 * tempat yang tidak bisa ia temukan, lalu berhenti mencari tombol yang
 * sebenarnya ada di bawah layar.
 */
export function ajakanBuka(mime: unknown, diApk: boolean): string {
  const apa = keteranganBerkas(mime)
  return diApk
    ? `${apa} tidak bisa ditampilkan di sini. Ketuk tombol di bawah untuk membukanya dengan aplikasi pembaca PDF, atau mengirimnya ke WhatsApp.`
    : `${apa} tidak bisa ditampilkan di sini. Ketuk tombol di bawah untuk membukanya di tab baru.`
}
