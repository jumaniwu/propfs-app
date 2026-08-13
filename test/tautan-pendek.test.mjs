// Test tautan publik versi pendek: jalur, asal situs, token, dan jaminan
// bahwa tautan lama tidak ikut mati.
import {
  ALFABET_TOKEN, PANJANG_TOKEN, POLA_TAUTAN,
  jalurTautan, basisSitus, tautanPublik, tokenValid, tokenPendek, tokenSudahPendek,
} from '../src/lib/tautanPendek.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Alfabet ────────────────────────────────────────────────────────────────
assert(ALFABET_TOKEN.length === 31, 'alfabet berisi 31 karakter')
for (const buruk of ['0', '1', 'I', 'L', 'O']) {
  assert(!ALFABET_TOKEN.includes(buruk), `karakter mudah tertukar "${buruk}" tidak dipakai`)
}
assert(new Set(ALFABET_TOKEN).size === ALFABET_TOKEN.length, 'tidak ada karakter kembar')
assert(ALFABET_TOKEN === ALFABET_TOKEN.toUpperCase(), 'alfabet seluruhnya huruf besar')

// Entropi harus tetap jauh di atas kebutuhan meski tautannya pendek.
const bit = PANJANG_TOKEN * Math.log2(ALFABET_TOKEN.length)
assert(bit > 55, `12 karakter memberi ${bit.toFixed(1)} bit — masih di atas 55`)

// ── POLA_TAUTAN ────────────────────────────────────────────────────────────
const jenisSemua = Object.keys(POLA_TAUTAN)
assert(jenisSemua.length === 9, 'sembilan jenis tautan publik terdaftar')

for (const [jenis, p] of Object.entries(POLA_TAUTAN)) {
  assert(p.pendek.startsWith('/'), `${jenis}: jalur pendek diawali /`)
  assert(!p.pendek.endsWith('/'), `${jenis}: jalur pendek tidak diakhiri /`)
  assert(p.pendek.length <= p.lama.length, `${jenis}: jalur pendek tidak lebih panjang dari yang lama`)
}

// Awalan pendek tidak boleh bertabrakan satu sama lain.
const pendekSemua = Object.values(POLA_TAUTAN).map(p => p.pendek)
assert(new Set(pendekSemua).size === pendekSemua.length, 'tiap jenis punya awalan pendek sendiri')

// ...termasuk bila hurufnya dibesarkan. Pencocokan rute React Router tidak
// peka huruf besar, jadi '/L' dan '/l' adalah jalur yang SAMA.
const pendekKecil = pendekSemua.map(p => p.toLowerCase())
assert(new Set(pendekKecil).size === pendekKecil.length,
  `awalan tetap berbeda walau huruf besar/kecil disamakan (${pendekKecil.join(', ')})`)

// Awalan pendek tidak boleh menabrak halaman aplikasi yang sudah ada.
const HALAMAN_APLIKASI = [
  '/auth', '/home', '/dashboard', '/input', '/result', '/report', '/pricing',
  '/profile', '/siteplan', '/payment', '/kontraktor', '/cost-control',
  '/cost-report', '/admin', '/legal', '/reset-password', '/tim',
]
for (const p of pendekSemua) {
  assert(!HALAMAN_APLIKASI.includes(p), `awalan ${p} tidak menabrak halaman aplikasi`)
}

// ── jalurTautan: jalur lama WAJIB ikut terdaftar ───────────────────────────
// Inilah yang menjaga tautan yang sudah tersebar di WhatsApp tetap terbuka.
for (const jenis of jenisSemua) {
  const jalur = jalurTautan(jenis)
  assert(jalur.includes(POLA_TAUTAN[jenis].pendek), `${jenis}: jalur pendek terdaftar`)
  assert(jalur.includes(POLA_TAUTAN[jenis].lama), `${jenis}: jalur LAMA tetap terdaftar`)
}
assert(jalurTautan('po').length === 1, 'po tidak didaftarkan dua kali karena jalurnya sama')
assert(jalurTautan('vendor_daftar').length === 2, 'vendor_daftar punya dua jalur')

// ── basisSitus ─────────────────────────────────────────────────────────────
assert(basisSitus('https://www.propfs.id') === 'https://propfs.id', 'www dibuang')
assert(basisSitus('https://propfs.id') === 'https://propfs.id', 'tanpa www tidak berubah')
assert(basisSitus('http://www.propfs.id') === 'http://propfs.id', 'skema http ikut ditangani')
assert(basisSitus('https://WWW.propfs.id') === 'https://propfs.id', 'www huruf besar ikut dibuang')
assert(basisSitus('https://propfs.id/') === 'https://propfs.id', 'garis miring di ujung dibuang')
assert(basisSitus('http://localhost:5173') === 'http://localhost:5173', 'localhost dipertahankan apa adanya')
assert(basisSitus('https://propfs-app.vercel.app') === 'https://propfs-app.vercel.app',
  'pratinjau Vercel dipertahankan')
// "www" di tengah nama bukan awalan dan tidak boleh ikut terpotong.
assert(basisSitus('https://wwwtest.id') === 'https://wwwtest.id', 'nama yang kebetulan diawali www tidak dirusak')

// ── tautanPublik ───────────────────────────────────────────────────────────
const t = 'K7M2P9QR4T6V'
assert(tautanPublik('vendor_daftar', t, 'https://www.propfs.id') === `https://propfs.id/v/${t}`,
  'tautan vendor memakai jalur pendek dan tanpa www')
assert(tautanPublik('po', t, 'https://propfs.id') === `https://propfs.id/po/${t}`, 'po memakai /po')
assert(tautanPublik('spk_sign', t, 'https://propfs.id') === `https://propfs.id/s/${t}`, 'spk memakai /s')
assert(tautanPublik('opname', t, 'https://propfs.id') === `https://propfs.id/o/${t}`, 'opname memakai /o')

// Yang penting bagi pengguna: tautannya jauh lebih pendek dari sebelumnya.
const lamaSekali = 'https://www.propfs.id/vendor/daftar/270d656e72ff460caf685899f4f3f11d'
const sekarang = tautanPublik('vendor_daftar', t, 'https://www.propfs.id')
assert(sekarang.length < lamaSekali.length / 2,
  `tautan baru (${sekarang.length}) kurang dari separuh yang lama (${lamaSekali.length})`)

// ── tokenValid ─────────────────────────────────────────────────────────────
assert(tokenValid(t), 'token pendek bentuk baru sah')
assert(tokenValid('270d656e72ff460caf685899f4f3f11d'), 'token UUID lama tetap sah')
assert(tokenValid('270D656E72FF460CAF685899F4F3F11D'), 'heksadesimal huruf besar tetap sah')
assert(!tokenValid(''), 'token kosong ditolak')
assert(!tokenValid(null) && !tokenValid(undefined), 'null/undefined ditolak')
assert(!tokenValid(12345678), 'bukan teks ditolak')
assert(!tokenValid('ABC'), 'token terlalu pendek ditolak')
assert(!tokenValid('A'.repeat(65)), 'token terlalu panjang ditolak')
assert(!tokenValid('K7M2/../etc'), 'karakter jalur ditolak')
assert(!tokenValid('K7M2 P9QR4T6V'), 'spasi di tengah ditolak')
assert(!tokenValid('K7M2-P9QR4T6V'), 'tanda hubung ditolak')

// ── tokenPendek ────────────────────────────────────────────────────────────
const acak = tokenPendek()
assert(acak.length === PANJANG_TOKEN, 'panjang bawaan 12')
assert([...acak].every(c => ALFABET_TOKEN.includes(c)), 'seluruh karakter berasal dari alfabet')
assert(tokenValid(acak), 'token yang dihasilkan dianggap sah')
assert(tokenPendek(6).length === 6, 'panjang bisa ditentukan')

// Nilai acak di ujung rentang tidak boleh keluar dari alfabet.
assert(tokenPendek(4, () => 0) === ALFABET_TOKEN[0].repeat(4), 'acak 0 memakai karakter pertama')
assert(tokenPendek(4, () => 0.999999) === ALFABET_TOKEN[ALFABET_TOKEN.length - 1].repeat(4),
  'acak mendekati 1 memakai karakter terakhir')
assert([...tokenPendek(50, () => 1)].every(c => ALFABET_TOKEN.includes(c)),
  'acak tepat 1 tidak menghasilkan undefined')

// Dua panggilan berturut-turut praktis tidak mungkin sama.
assert(tokenPendek() !== tokenPendek(), 'dua token berbeda')

// ── tokenSudahPendek ───────────────────────────────────────────────────────
// Menentukan kapan pemilik ditawari menerbitkan ulang tautannya. Token lama
// TIDAK boleh diganti diam-diam, jadi ini murni penanda tampilan.
assert(tokenSudahPendek(t), 'token 12 karakter dianggap sudah pendek')
assert(!tokenSudahPendek('270d656e72ff460caf685899f4f3f11d'), 'token UUID 32 karakter dianggap panjang')
assert(tokenSudahPendek('ABCDEFGH'), 'token lebih pendek dari 12 tetap dianggap pendek')
assert(!tokenSudahPendek(''.padEnd(13, 'A')), '13 karakter sudah dianggap panjang')
assert(!tokenSudahPendek(null) && !tokenSudahPendek(undefined), 'tanpa token bukan "sudah pendek"')
assert(!tokenSudahPendek(12345678), 'bukan teks bukan "sudah pendek"')
assert(tokenSudahPendek(`  ${t}  `), 'spasi di tepi tidak membuatnya terhitung panjang')

console.log(`✅ tautanPendek: ${ok} assertion lolos`)
