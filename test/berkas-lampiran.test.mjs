// ============================================================
// Membuka kembali berkas yang sudah tersimpan.
//
// Cacat yang diperbaiki: tagihan vendor menyimpan foto notanya dan kartunya
// menuliskan nama berkas itu, tetapi tidak ada satu pun jalan MEMBUKANYA.
// Padahal nomor rekening untuk transfer justru tertulis di foto itu.
//
// Yang diuji di sini terutama satu hal yang gagal TANPA PESAN GALAT: base64
// telanjang yang ditempel apa adanya ke `src`. Peramban hanya menampilkan
// ikon kosong — tidak ada yang tahu sebabnya, dan tidak ada yang bisa dicari.
// ============================================================
import {
  bisaTampilInline, adalahPdf, dataUriBerkas, base64Telanjang,
  namaBerkasAman, keteranganBerkas, labelBuka, ajakanBuka,
} from '../src/lib/berkasLampiran.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const B64 = '/9j/4AAQSkZJRg=='

// ── 1. Data URI: inti perbaikannya ──────────────────────────────────────
assert(dataUriBerkas('image/jpeg', B64) === `data:image/jpeg;base64,${B64}`,
  'base64 telanjang dibungkus menjadi data URI yang bisa dibuka peramban')
assert(dataUriBerkas('application/pdf', B64) === `data:application/pdf;base64,${B64}`,
  'PDF juga')
{
  // Baris lama bisa saja sudah menyimpan data URI utuh. Membungkusnya lagi
  // menghasilkan "data:image/jpeg;base64,data:image/jpeg;base64,…" yang gagal
  // diam-diam, persis seperti cacat yang sedang diperbaiki.
  const sudah = `data:image/png;base64,${B64}`
  assert(dataUriBerkas('image/jpeg', sudah) === sudah, 'yang sudah data URI tidak dibungkus dua kali')
}
assert(dataUriBerkas('', B64) === `data:application/octet-stream;base64,${B64}`,
  'tanpa mime tetap menghasilkan URI yang sah, bukan "data:;base64,"')
assert(dataUriBerkas('image/jpeg', '') === '', 'tanpa isi menghasilkan kosong, bukan URI cacat')
assert(dataUriBerkas('image/jpeg', null) === '', 'null aman')
assert(dataUriBerkas(null, null) === '', 'keduanya null aman')

// ── 2. Arah sebaliknya ──────────────────────────────────────────────────
assert(base64Telanjang(`data:image/jpeg;base64,${B64}`) === B64, 'awalan data URI dilepas')
assert(base64Telanjang(B64) === B64, 'yang sudah telanjang dibiarkan')
assert(base64Telanjang('') === '' && base64Telanjang(null) === '', 'kosong & null aman')

// ── 3. Mana yang bisa ditampilkan di layar ──────────────────────────────
for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'IMAGE/JPEG']) {
  assert(bisaTampilInline(m) === true, `${m} bisa ditampilkan langsung`)
}
assert(bisaTampilInline('application/pdf') === false, 'PDF tidak ditampilkan sebagai gambar')
assert(bisaTampilInline('') === false && bisaTampilInline(null) === false, 'kosong & null aman')
assert(adalahPdf('application/pdf') === true, 'PDF dikenali')
assert(adalahPdf('APPLICATION/PDF') === true, 'huruf besar pun')
assert(adalahPdf('image/jpeg') === false, 'gambar bukan PDF')

// ── 4. Nama berkas yang aman disimpan ───────────────────────────────────
//
// Nama datang dari perangkat vendor dan tidak pernah diperiksa siapa pun.
assert(namaBerkasAman('nota toko.jpg', 'image/jpeg') === 'nota toko.jpg', 'nama wajar dibiarkan')
assert(namaBerkasAman('../../etc/passwd', 'image/jpeg') === '..-..-etc-passwd',
  'garis miring dibuang — unduhan tidak boleh mendarat di tempat yang tidak diduga')
assert(!namaBerkasAman('../../etc/passwd', 'image/jpeg').includes('/'),
  'dan hasilnya benar-benar datar, tanpa sisa pemisah folder')
assert(!namaBerkasAman('a/b\\c?d%e*f:g|h"i<j>k', 'image/jpeg').match(/[/\\?%*:|"<>]/),
  'seluruh aksara berbahaya dibuang')
assert(namaBerkasAman('', 'image/jpeg') === 'lampiran.jpg',
  'nama kosong diberi nama & ekstensi — tanpa ekstensi ia tidak bisa dibuka dengan ketukan')
assert(namaBerkasAman('', 'image/png') === 'lampiran.png', 'ekstensi mengikuti jenisnya')
assert(namaBerkasAman(null, 'application/pdf') === 'lampiran.pdf', 'PDF dapat .pdf')
assert(namaBerkasAman('', 'entah/apa') === 'lampiran.bin', 'jenis asing tetap dapat nama')
assert(namaBerkasAman('x'.repeat(400), 'image/jpeg').length <= 120, 'nama raksasa dipotong')
assert(namaBerkasAman('', 'image/jpeg', 'tagihan') === 'tagihan.jpg', 'cadangan bisa diganti')

// ── 5. Keterangan singkat ───────────────────────────────────────────────
assert(keteranganBerkas('application/pdf') === 'PDF', 'PDF')
assert(keteranganBerkas('image/jpeg') === 'Gambar', 'gambar')
assert(keteranganBerkas('') === 'Berkas', 'tanpa jenis tetap punya sebutan')


// ── Kalimat pada layar: PERINTAH, bukan laporan ────────────────────────────
//
// Versi sebelumnya berbunyi "PDF ini dibuka di tab baru" — mengabarkan sesuatu
// yang BELUM terjadi, di layar tempat belum ada apa pun yang dibuka. Yang
// membacanya menyimpulkan berkasnya sudah terbuka di suatu tempat yang tidak
// bisa ia temukan, lalu berhenti mencari tombol yang sebenarnya ada di bawah
// layar. Persis keluhan "tidak bisa buka file tagihan dari vendor".
{
  const web = ajakanBuka('application/pdf', false)
  assert(/PDF/.test(web), 'menyebut jenis berkasnya')
  assert(/Ketuk tombol di bawah/.test(web), 'MENYURUH, bukan mengabarkan')
  assert(!/^PDF ini dibuka/.test(web), 'tidak lagi mengaku sudah membuka sesuatu')
  assert(/tab baru/.test(web), 'di peramban, tab baru memang istilah yang benar')

  // Di dalam APK tidak ada tab. Menyebutnya "tab baru" di sana membuat orang
  // menunggu tab yang tidak akan pernah muncul.
  const apk = ajakanBuka('application/pdf', true)
  assert(!/tab baru/.test(apk), 'di APK TIDAK menyebut tab — tidak ada tab di sana')
  assert(/WhatsApp|aplikasi pembaca/.test(apk), 'menyebut yang benar-benar akan muncul')

  assert(labelBuka(false) === 'Buka di tab baru', 'label peramban')
  assert(labelBuka(true) === 'Kirim / Buka', 'label APK — pendek, muat satu baris di 390px')
  assert(labelBuka(true).length < labelBuka(false).length + 4,
    'tidak lebih panjang daripada label peramban; tombolnya berdampingan di layar sempit')
  assert(labelBuka(true) !== labelBuka(false), 'keduanya memang berbeda')

  assert(/Gambar/.test(ajakanBuka('image/png', false)), 'jenis lain ikut disebut')
  assert(ajakanBuka(null, false).length > 20, 'mime kosong tetap menghasilkan kalimat utuh')
}

console.log(`berkas-lampiran: ${ok} assert lulus`)
