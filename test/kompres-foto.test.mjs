// Test pengecilan foto sebelum dikirim ke AI.
import {
  SISI_MAKS, BATAS_KIRIM, ukuranTarget, byteBase64, ukuranTampil,
  muatDikirim, bisaDikecilkan,
} from '../src/lib/kompresFoto.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Inti keluhan: foto ponsel dikirim mentah, dan kini dua kali jalan ────
//
// Foto kamera 4032×3024 dibaca apa adanya menjadi base64 lalu dikirim utuh.
// Sejak kuncinya pindah ke server, foto yang sama menempuh dua perjalanan —
// ponsel → server kami → Google. Yang tadinya lambat menjadi dua kali lambat.
{
  const { lebar, tinggi } = ukuranTarget(4032, 3024)
  assert(Math.max(lebar, tinggi) === SISI_MAKS, `sisi terpanjang jadi ${SISI_MAKS}: ${lebar}×${tinggi}`)
  const rasioAsal = 4032 / 3024
  assert(Math.abs(lebar / tinggi - rasioAsal) < 0.01, 'perbandingan sisinya dipertahankan')
  // Luas piksel turun ~10×; berkasnya turun jauh lebih banyak lagi.
  assert((lebar * tinggi) / (4032 * 3024) < 0.12, 'luas pikselnya tinggal sepersepuluh')
}
{
  // Foto tegak dari ponsel — sisi terpanjangnya yang dibatasi, bukan lebarnya.
  const { lebar, tinggi } = ukuranTarget(3024, 4032)
  assert(tinggi === SISI_MAKS, `foto tegak juga dibatasi di sisi terpanjang: ${lebar}×${tinggi}`)
  assert(lebar < tinggi, 'dan tetap tegak')
}

// ── Yang sudah kecil TIDAK diperbesar ───────────────────────────────────
{
  const u = ukuranTarget(800, 600)
  assert(u.lebar === 800 && u.tinggi === 600,
    'gambar kecil dibiarkan — memperbesar tidak menambah detail, hanya byte')
}
assert(ukuranTarget(SISI_MAKS, 900).lebar === SISI_MAKS, 'yang persis di batas tidak diubah')

// ── Gambar ekstrem tidak boleh menghasilkan kanvas nol ──────────────────
{
  // Panorama yang sangat memanjang: sisi pendeknya bisa dibulatkan jadi nol,
  // dan kanvas berukuran nol menghasilkan berkas kosong — kegagalannya baru
  // terlihat setelah AI menjawab "tidak ada apa-apa di foto ini".
  const u = ukuranTarget(20000, 5)
  assert(u.tinggi >= 1, `sisi pendek tidak pernah nol: ${u.lebar}×${u.tinggi}`)
  assert(u.lebar === SISI_MAKS, 'sisi panjangnya tetap dibatasi')
}
assert(ukuranTarget(0, 0).lebar === 0, 'ukuran nol tidak meledak')
assert(ukuranTarget(-100, -100).lebar === 0, 'ukuran negatif aman')
assert(ukuranTarget(NaN, 100).lebar === 0, 'NaN aman')

// ── Menghitung ukuran dari base64 ───────────────────────────────────────
assert(byteBase64('') === 0, 'kosong nol byte')
assert(byteBase64(null) === 0, 'null aman')
assert(byteBase64('QQ==') === 1, 'padding == dihitung benar')
assert(byteBase64('QUI=') === 2, 'padding = dihitung benar')
assert(byteBase64('QUJD') === 3, 'tanpa padding dihitung benar')
{
  // base64 menggelembungkan sekitar sepertiga — itulah sebabnya foto 4 MB
  // menjadi 5,3 MB saat dikirim.
  const b = byteBase64('A'.repeat(4_000_000))
  assert(Math.abs(b - 3_000_000) < 10, `4 juta karakter base64 ≈ 3 MB: ${b}`)
}

// ── Batas kirim: yang terlalu besar GAGAL, bukan sekadar lambat ─────────
{
  // Foto kamera 5 MB dalam base64 ≈ 6,7 juta karakter.
  const fotoBesar = 'A'.repeat(6_700_000)
  assert(!muatDikirim([fotoBesar]), 'satu foto mentah dari kamera sudah melampaui batas')
  assert(byteBase64(fotoBesar) > BATAS_KIRIM, 'dan memang di atas ambangnya')
}
{
  // Setelah dikecilkan ±300 KB, beberapa lampiran sekaligus pun masih muat —
  // dan satu pesan memang bisa membawa beberapa nota.
  const kecil = 'A'.repeat(400_000)
  assert(muatDikirim([kecil, kecil, kecil]), 'tiga foto yang sudah dikecilkan tetap muat')
}
assert(muatDikirim([]), 'tanpa lampiran selalu muat')
assert(muatDikirim(null), 'null aman')

// ── Hanya gambar yang dikecilkan ────────────────────────────────────────
assert(bisaDikecilkan('image/jpeg') === true, 'JPEG dikecilkan')
assert(bisaDikecilkan('image/png') === true, 'PNG dikecilkan')
assert(bisaDikecilkan('image/heic') === true, 'HEIC dari iPhone dikecilkan')
assert(bisaDikecilkan('application/pdf') === false,
  'PDF diteruskan apa adanya — mengubahnya jadi JPEG akan menghilangkan halaman')
assert(bisaDikecilkan('') === false, 'tanpa tipe, jangan diutak-atik')
assert(bisaDikecilkan(null) === false, 'null aman')

// ── Ukuran yang bisa dibaca orang ───────────────────────────────────────
assert(ukuranTampil(512) === '512 B', 'byte')
assert(ukuranTampil(2048) === '2 KB', 'kilobyte')
assert(ukuranTampil(5_400_000) === '5,1 MB', 'megabyte dengan koma seperti kebiasaan di sini')
assert(ukuranTampil(0) === '0 B', 'nol tetap ditampilkan')
assert(ukuranTampil(null) === '0 B', 'null aman')

console.log(`kompres-foto: ${ok} assert lulus`)
