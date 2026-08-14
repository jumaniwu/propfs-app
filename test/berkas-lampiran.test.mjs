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
  namaBerkasAman, keteranganBerkas,
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

console.log(`berkas-lampiran: ${ok} assert lulus`)
