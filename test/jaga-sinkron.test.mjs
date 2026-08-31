// ============================================================
// Jangan pernah menulis ke cloud sebelum membacanya.
//
// Data akuntan disimpan sebagai SATU baris berisi seluruh isinya, dan tiap
// perubahan menulis ulang baris itu. Bentuk itu wajar; yang tidak wajar,
// penulisannya tidak pernah menunggu pembacaan.
//
// Jalan kehilangan datanya begini:
//   1. Aplikasi dibuka di tempat penyimpanan lokalnya kosong — peramban baru,
//      APK yang dipasang ulang, cache dibersihkan.
//   2. Pembacaan cloud belum selesai, atau gagal dan kegagalannya hanya masuk
//      console.
//   3. Pemakai menambah SATU pemasukan.
//   4. Penulisan berangkat membawa seluruh keadaan lokal — satu baris itu
//      saja — dan MENIMPA salinan cloud berisi pekerjaan kemarin.
//
// Sejak itu tidak ada yang bisa dipulihkan: yang di cloud sudah tertimpa, yang
// di perangkat memang tidak pernah ada.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buatPenjagaSinkron, tulisanBerbahaya, PESAN_BACA_GAGAL,
} from '../src/lib/jagaSinkron.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Menulis DILARANG sampai pembacaan berhasil ───────────────────
{
  const p = buatPenjagaSinkron()
  assert(p.bolehTulis() === false, 'sebelum membaca: tidak boleh menulis')
  p.tandaiTerbaca()
  assert(p.bolehTulis() === true, 'sesudah membaca berhasil: boleh')
}

// ── 2. Perubahan selama penantian DITAHAN, bukan dibuang ───────────
//
// Ini bedanya menahan dari kehilangan. Yang ditahan tetap ada di penyimpanan
// lokal, dan dikirim setelah digabungkan dengan isi cloud.
{
  const p = buatPenjagaSinkron()
  assert(p.adaTertahan() === false, 'awalnya tidak ada')
  p.tahan(); p.tahan(); p.tahan()
  assert(p.adaTertahan() === true, 'ada yang tertahan')

  p.tandaiTerbaca()
  assert(p.lepasTertahan() === true, 'dilepas sekali sesudah pembacaan')
  assert(p.adaTertahan() === false, 'dan penandanya bersih')
  assert(p.lepasTertahan() === false, 'tidak melahirkan pengiriman kedua')
}

// ── 3. Bisa disetel ulang saat berganti akun ───────────────────────
//
// Tanpa ini, izin menulis milik akun sebelumnya terbawa ke akun berikutnya —
// dan keadaan lokal akun lama bisa menimpa data akun baru.
{
  const p = buatPenjagaSinkron()
  p.tandaiTerbaca(); p.tahan()
  p.setelUlang()
  assert(p.bolehTulis() === false, 'izinnya dicabut')
  assert(p.adaTertahan() === false, 'dan tertahannya dibersihkan')
}

// ── 4. Kosong menimpa berisi: satu-satunya arah yang dilarang ─────
//
// Berisi menimpa apa pun tidak apa-apa — itu memang pekerjaan orangnya. Yang
// menghapus hanya satu arah.
{
  assert(tulisanBerbahaya(0, 12) === true, 'kosong menimpa berisi: BERBAHAYA')
  assert(tulisanBerbahaya(1, 12) === false,
    'satu baris menimpa dua belas tidak dilarang di sini — gabungannya yang '
    + 'mengurus, dan melarangnya akan membuat penghapusan sah jadi mustahil')
  assert(tulisanBerbahaya(0, 0) === false, 'kosong menimpa kosong: tidak apa-apa')
  assert(tulisanBerbahaya(12, 0) === false, 'berisi menimpa kosong: memang begitu')
  assert(tulisanBerbahaya(null, null) === false, 'kosong aman')
  assert(tulisanBerbahaya('x', 'y') === false, 'masukan tak masuk akal aman')
  assert(tulisanBerbahaya(-3, 5) === true, 'angka negatif dianggap nol')
}

// ── 5. Pesannya menerangkan keadaan, bukan menakut-nakuti ────────
{
  assert(/perangkat ini/.test(PESAN_BACA_GAGAL),
    'menenangkan: perubahannya tidak hilang, hanya belum sampai server')
  assert(/jangan tutup/i.test(PESAN_BACA_GAGAL),
    'dan memberi tahu satu hal yang benar-benar bisa dilakukan pemakainya')
}

// ── 6. Store benar-benar memakai penjaganya ─────────────────────
//
// Penjaga yang tidak dipasang tidak menyelamatkan satu baris pun — dan justru
// begitulah cacat ini lahir: penggabungannya sudah benar, penjaganya tidak ada.
{
  const akar = new URL('../src', import.meta.url).pathname
  const store = readFileSync(join(akar, 'store/akuntanStore.ts'), 'utf8')

  assert(/buatPenjagaSinkron\(\)/.test(store), 'penjaganya dibuat')
  assert(/if \(!penjaga\.bolehTulis\(\)\)/.test(store),
    'dan penulisan benar-benar ditahan olehnya')
  assert(/penjaga\.tandaiTerbaca\(\)/.test(store),
    'izin menulis hanya diberikan sesudah pembacaan berhasil')
  assert(/penjaga\.lepasTertahan\(\)/.test(store),
    'yang tertahan dikirim sesudahnya — menahan bukan berarti kehilangan')

  // Pembacaan yang gagal tidak boleh diam.
  const iCatch = store.indexOf("console.warn('[akuntan] muat cloud gagal")
  assert(iCatch > -1, 'kegagalan pembacaan masih dicatat')
  assert(store.slice(iCatch, iCatch + 400).includes('tandaiGagal'),
    'dan sekarang JUGA dilaporkan ke layar — pembacaan yang gagal diam-diam '
    + 'adalah langkah kedua dari jalan yang menghapus data')

  // Penulisan tetap upsert seluruh baris; yang berubah hanya kapan ia boleh.
  assert(/\.upsert\(/.test(store), 'bentuk penyimpanannya tidak diubah')
}

console.log(`jaga-sinkron: ${ok} assert lulus`)
