// Test pembacaan kegagalan layanan AI.
import { jenisGalat, bisaDiulang, ringkasTeknis, ringkasGalatAi } from '../src/lib/galatAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// Galat yang benar-benar terjadi di lapangan, disalin apa adanya.
const GALAT_403 = 'gemini-2.5-flash[1]: Gemini gemini-2.5-flash error: {"error": {"code": 403, '
  + '"message": "Permission denied: Consumer \'api|propfs\' has been suspended.", "status": "PERMISSION_DENIED"}}'

// ── Inti keluhan: 403 BUKAN "sedang sibuk" ───────────────────────────────
assert(jenisGalat(GALAT_403) === 'kunci', '403 Permission denied dikenali sebagai masalah kunci')
assert(jenisGalat(GALAT_403) !== 'sibuk', 'dan TIDAK dikira kepadatan layanan')
assert(bisaDiulang('kunci') === false,
  'kegagalan izin tidak diulang — menunggu tidak mengubah izin')
{
  const r = ringkasGalatAi([GALAT_403, GALAT_403], { adaGambar: true })
  assert(r.jenis === 'kunci', 'ringkasannya menyebut masalah kunci')
  assert(!/sibuk|padat/i.test(r.pesan), `pesannya tidak lagi berbunyi "sibuk": ${r.pesan.slice(0, 60)}`)
  assert(!/coba lagi dalam/i.test(r.pesan),
    'dan tidak menyuruh menunggu semenit untuk sesuatu yang tidak akan pulih sendiri')
  assert(/admin/i.test(r.pesan), 'pemakai biasa diarahkan ke admin')
  assert(/manual/i.test(r.pesan), 'diberi jalan keluar: ketik manual')
}

// ── Rincian teknis TIDAK bocor ke pemakai biasa ──────────────────────────
{
  const r = ringkasGalatAi([GALAT_403], {})
  assert(!r.pesan.includes('403'), 'kode galat tidak ditempelkan ke pesan pemakai biasa')
  assert(!r.pesan.includes('{'), 'JSON mentah tidak pernah ikut tercetak')
  assert(!r.pesan.includes('Debug'), 'tidak ada lagi blok Debug di gelembung chat')
  assert(!r.pesan.includes('Consumer'), 'nama consumer internal tidak ikut bocor')
  assert(r.teknis.length > 0, 'tapi rinciannya tetap tersedia untuk console')
}
{
  // Superadmin memang perlu tahu — tetapi satu baris, bukan tumpahan JSON.
  const r = ringkasGalatAi([GALAT_403], { superadmin: true })
  assert(/Rincian teknis:/.test(r.pesan), 'superadmin diberi satu baris teknis')
  assert(!r.pesan.includes('{'), 'tetap tanpa JSON mentah')
  assert(r.pesan.split('Rincian teknis:')[1].trim().length < 200, 'ringkas, bukan berparagraf')
  assert(/Generative Language|domain|billing/i.test(r.pesan),
    'dan diberi tahu APA yang harus diperiksa, bukan hanya bahwa ada galat')
}

// ── Jenis-jenis lain ─────────────────────────────────────────────────────
assert(jenisGalat('RATE_LIMIT:gemini-2.5-flash') === 'kuota', 'rate limit = kuota')
assert(jenisGalat('HTTP 429 Too Many Requests') === 'kuota', '429 = kuota')
assert(jenisGalat('{"error":{"status":"RESOURCE_EXHAUSTED"}}') === 'kuota', 'resource exhausted = kuota')
assert(jenisGalat('OVERLOAD:gemini-2.0-flash') === 'sibuk', 'overload = sibuk')
assert(jenisGalat('HTTP 503 Service Unavailable') === 'sibuk', '503 = sibuk')
assert(jenisGalat('Gemini gemini-2.5-flash empty response') === 'sibuk', 'jawaban kosong = sisi layanan')
assert(jenisGalat('TypeError: Failed to fetch') === 'jaringan', 'gagal fetch = jaringan')
assert(jenisGalat('The operation was aborted') === 'jaringan', 'dibatalkan = jaringan')
assert(jenisGalat('No Gemini key') === 'kunci', 'kunci belum dipasang = masalah kunci, bukan sibuk')
assert(jenisGalat('API key not valid. Please pass a valid API key.') === 'kunci', 'kunci salah dikenali')
assert(jenisGalat('sesuatu yang aneh') === 'lain', 'yang tak dikenali jujur disebut lain')
assert(jenisGalat('') === 'lain', 'kosong aman')
assert(jenisGalat(null) === 'lain', 'null aman')
assert(jenisGalat(new Error('403 PERMISSION_DENIED')) === 'kunci', 'menerima objek Error')

assert(bisaDiulang('sibuk') === true, 'kepadatan layak diulang')
assert(bisaDiulang('jaringan') === true, 'gangguan jaringan layak diulang')
assert(bisaDiulang('kuota') === false, 'kuota harian tidak pulih dalam hitungan detik')
assert(bisaDiulang('lain') === true, 'yang tak dikenali diberi satu kesempatan lagi')

// ── Ketika upayanya gagal dengan cara berbeda-beda ───────────────────────
{
  // Yang bisa ditindak didahulukan: menyebut ini "sibuk" akan membuat orang
  // menunggu sepanjang hari untuk masalah izin.
  const r = ringkasGalatAi(['OVERLOAD:gemini-2.0-flash', GALAT_403])
  assert(r.jenis === 'kunci', 'masalah izin menang atas kepadatan')
}
{
  const r = ringkasGalatAi(['HTTP 503', 'Failed to fetch'])
  assert(r.jenis === 'jaringan', 'gangguan jaringan menang atas kepadatan')
}
{
  const r = ringkasGalatAi(['HTTP 503', 'OVERLOAD:x'])
  assert(r.jenis === 'sibuk', 'kalau memang semuanya padat, barulah disebut padat')
  assert(/±1 menit/.test(r.pesan), 'dan barulah pantas menyuruh menunggu semenit')
}
assert(ringkasGalatAi([]).jenis === 'lain', 'tanpa galat pun tidak meledak')
assert(ringkasGalatAi(null).pesan.length > 0, 'null aman')

// ── Pesan menyesuaikan ada-tidaknya gambar ───────────────────────────────
assert(/foto/i.test(ringkasGalatAi(['HTTP 503'], { adaGambar: true }).pesan),
  'saran soal foto hanya muncul bila memang ada foto')
assert(!/foto/i.test(ringkasGalatAi(['HTTP 503'], { adaGambar: false }).pesan),
  'tanpa foto, sarannya tidak menyesatkan')

// ── Ringkas teknis ───────────────────────────────────────────────────────
{
  const t = ringkasTeknis([GALAT_403])
  assert(/gemini-2\.5-flash/.test(t), 'menyebut model yang gagal')
  assert(/403/.test(t) && /PERMISSION_DENIED/.test(t), 'menyebut kode & sebabnya')
  assert(!t.includes('{'), 'tanpa JSON')
  assert(t.length < 100, `benar-benar ringkas: ${t.length} karakter`)
}
{
  // Empat upaya yang gagal dengan cara sama tidak perlu disebut empat kali.
  const t = ringkasTeknis([GALAT_403, GALAT_403, GALAT_403, GALAT_403])
  assert(t.split('·').length === 1, `yang kembar diringkas jadi satu: ${t}`)
}
assert(ringkasTeknis([]) === '', 'tanpa galat tidak mengarang rincian')
assert(ringkasTeknis(['x'.repeat(500)]).length <= 160, 'satu galat panjang sudah dipangkas per bagian')
{
  // Banyak galat yang BERBEDA-BEDA: di sinilah batas keseluruhan bekerja.
  const banyak = Array.from({ length: 30 }, (_, i) => `model-${i}[1]: HTTP 50${i % 4} sesuatu`)
  const t = ringkasTeknis(banyak)
  assert(t.length <= 160, `tetap satu baris pendek: ${t.length} karakter`)
  assert(t.endsWith('…'), 'pemotongannya ditandai, bukan terputus diam-diam')
}

// ── Galat dari perantara /api/ai — bukan dari Google ─────────────────────
//
// Yang terjadi di lapangan: kunci server belum terpasang, perantara menjawab
// 500 NO_SERVER_KEY, dan 500 masuk keranjang "sedang padat" — sehingga layar
// berbunyi "Layanan AI sedang sangat padat, coba lagi dalam ±1 menit" untuk
// sesuatu yang tidak akan pernah pulih sendiri, lalu diulang berkali-kali.
// Persis kesalahan yang modul ini dibuat untuk menghentikannya, terulang lewat
// kode status milik kami sendiri.
{
  const NO_KEY = '500 {"error":{"code":500,"status":"NO_SERVER_KEY",'
    + '"message":"GEMINI_API_KEY belum dipasang di server."}}'
  assert(jenisGalat(NO_KEY) === 'kunci', 'kunci server yang belum dipasang = masalah kunci')
  assert(jenisGalat(NO_KEY) !== 'sibuk', 'dan BUKAN kepadatan, meski statusnya 500')
  assert(bisaDiulang('kunci') === false, 'jadi tidak diulang — menunggu tidak memasang kunci')

  const r = ringkasGalatAi([NO_KEY, NO_KEY])
  assert(!/padat|sibuk/i.test(r.pesan), `pesannya tidak menyebut kepadatan: ${r.pesan.slice(0, 60)}`)
  assert(!/±1 menit/.test(r.pesan), 'dan tidak menyuruh menunggu semenit')
}
{
  // 500 yang memang dari Google tetap dibaca sebagai kepadatan.
  assert(jenisGalat('500 {"error":{"code":500,"status":"INTERNAL"}}') === 'sibuk',
    '500 biasa tetap kepadatan — perbaikannya tidak boleh membutakan yang lain')
}
assert(jenisGalat('400 {"error":{"status":"MODEL_NOT_ALLOWED"}}') === 'lain',
  'model di luar daftar izin perantara bukan masalah kunci maupun kepadatan')

console.log(`galat-ai: ${ok} assert lulus`)
