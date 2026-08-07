// ============================================================
// Membuktikan bahwa pengambilan token TIDAK BISA menggantung.
//
// Inilah bug yang membuat layar menunjukkan "AI sedang membaca… 114s" pada
// halaman yang menjanjikan berhenti di 70 detik: `await token()` berada di
// depan `fetch`, jadi AbortController memutus sambungan yang belum ada, dan
// penyegaran token yang menggantung menahan seluruh pekerjaan selamanya.
//
// Yang diuji di sini bukan "fungsinya jalan", melainkan tepat sifat itu:
// beri ia janji yang TIDAK PERNAH selesai, lalu buktikan ia tetap menjawab.
// ============================================================
import {
  BATAS_TOKEN_MS, JEDA_AMAN_MS, bacaTokenSimpanan, batasToken, masihSegar,
  denganBatas, tokenIngatan, ingatToken, lupakanToken,
} from '../src/lib/tokenSesi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = exp => `eyJhbGciOiJIUzI1NiJ9.${b64url({ sub: 'u1', exp })}.tandatangan`

const DETIK = 1000
const SEKARANG = 1_800_000_000_000
const segar = jwt(Math.floor((SEKARANG + 3600 * DETIK) / 1000))
const basi  = jwt(Math.floor((SEKARANG - 60 * DETIK) / 1000))

// ── 1. Yang menggantung tetap dijawab ───────────────────────────────────
//
// Ini inti perbaikannya. Sebelum ini, sebuah janji yang tidak pernah selesai
// di depan fetch berarti gelembung berputar tanpa akhir — tanpa hasil, tanpa
// galat, dan tanpa cara pemakainya tahu apa yang terjadi.
{
  const menggantung = new Promise(() => {})
  const mulai = Date.now()
  const hasil = await denganBatas(menggantung, 30, 'cadangan')
  assert(hasil === 'cadangan', 'janji yang tidak pernah selesai tetap menghasilkan cadangan')
  assert(Date.now() - mulai < 500, 'dan menjawabnya cepat, bukan menunggu selamanya')
}
{
  // Janji yang DITOLAK juga tidak boleh melempar: yang memanggilnya berada di
  // depan pekerjaan lain, dan galat di sini menghentikan pekerjaan itu.
  const hasil = await denganBatas(Promise.reject(new Error('jaringan mati')), 50, 'cadangan')
  assert(hasil === 'cadangan', 'janji yang ditolak jatuh ke cadangan, bukan melempar')
}
{
  const hasil = await denganBatas(Promise.resolve('asli'), 1000, 'cadangan')
  assert(hasil === 'asli', 'yang selesai tepat waktu tetap dipakai, bukan cadangannya')
}
{
  // Yang cepat tidak boleh ikut menunggu batasnya habis.
  const mulai = Date.now()
  await denganBatas(Promise.resolve('asli'), 5000, 'x')
  assert(Date.now() - mulai < 200, 'dan tidak ikut menunggu sampai batas waktu habis')
}
assert(BATAS_TOKEN_MS <= 5000,
  'batas pengambilan token jauh lebih pendek daripada anggaran membaca foto — '
  + 'ia mengambil dari jatah yang sama')

// ── 2. Membaca token dari penyimpanan, tanpa jaringan ───────────────────
const gudang = isi => ({
  length: Object.keys(isi).length,
  key: i => Object.keys(isi)[i] ?? null,
  getItem: k => isi[k] ?? null,
})
{
  const g = gudang({ 'sb-ciazztqmkhzrgbaqfyyz-auth-token': JSON.stringify({ access_token: segar }) })
  assert(bacaTokenSimpanan(g) === segar, 'token terbaca dari penyimpanan Supabase')
}
{
  // Versi Supabase yang lebih baru membungkusnya base64. Keduanya harus
  // terbaca: pemakainya bisa saja belum memuat ulang setelah pustakanya naik.
  const isi = 'base64-' + Buffer.from(JSON.stringify({ access_token: segar })).toString('base64')
  assert(bacaTokenSimpanan(gudang({ 'sb-abc-auth-token': isi })) === segar,
    'bentuk base64- juga terbaca')
}
{
  const g = gudang({ 'sb-abc-auth-token': JSON.stringify({ currentSession: { access_token: segar } }) })
  assert(bacaTokenSimpanan(g) === segar, 'bentuk lama (currentSession) juga terbaca')
}
assert(bacaTokenSimpanan(gudang({ 'lain-lain': 'x' })) === '', 'kunci yang bukan sesi diabaikan')
assert(bacaTokenSimpanan(gudang({ 'sb-abc-auth-token': '{rusak' })) === '',
  'isi yang rusak tidak meledak')
assert(bacaTokenSimpanan(null) === '', 'tanpa penyimpanan aman')
assert(bacaTokenSimpanan(undefined) === '', 'undefined aman')

// ── 3. Membaca masa berlaku dari JWT-nya sendiri ────────────────────────
assert(batasToken(segar) === Math.floor((SEKARANG + 3600 * DETIK) / 1000) * 1000,
  'batas waktu dibaca dari klaim exp')
assert(batasToken('bukan-jwt') === 0, 'yang bukan JWT tidak diberi masa berlaku')
assert(batasToken('') === 0, 'kosong nol')
assert(batasToken(null) === 0, 'null aman')
assert(masihSegar(segar, SEKARANG) === true, 'token satu jam lagi masih segar')
assert(masihSegar(basi, SEKARANG) === false, 'token yang sudah lewat tidak segar')
{
  // Jeda aman: token yang mati 30 detik lagi tidak dipakai untuk pekerjaan
  // yang sendirinya bisa memakan 70 detik.
  const hampir = jwt(Math.floor((SEKARANG + 30 * DETIK) / 1000))
  assert(masihSegar(hampir, SEKARANG) === false,
    'yang tinggal 30 detik ditolak — panggilan AI sendiri bisa lebih lama dari itu')
  assert(JEDA_AMAN_MS >= 30 * DETIK, 'jeda amannya memang selebar itu')
}

// ── 4. Ingatan proses: pesan kedua tidak menyentuh apa pun ──────────────
{
  lupakanToken()
  assert(tokenIngatan(SEKARANG) === '', 'awalnya kosong')
  ingatToken(segar, SEKARANG)
  assert(tokenIngatan(SEKARANG) === segar, 'token segar diingat')
  assert(tokenIngatan(SEKARANG + 3600 * DETIK) === '',
    'dan dilupakan sendiri begitu masa berlakunya lewat — bukan dipakai sampai ditolak 401')

  lupakanToken()
  ingatToken(basi, SEKARANG)
  assert(tokenIngatan(SEKARANG) === '', 'token basi tidak pernah masuk ingatan')
  ingatToken('bukan-jwt', SEKARANG)
  assert(tokenIngatan(SEKARANG) === '', 'yang tidak terbaca juga tidak')
  lupakanToken()
}

// ── 5. Bentuk kegagalan yang benar ──────────────────────────────────────
//
// Bila token benar-benar tidak bisa didapat, permintaannya TETAP dikirim.
// Perantara menjawab 401 dalam sedetik, dan 401 itu sudah punya kalimatnya
// sendiri: "Keluar lalu masuk kembali." Kabar buruk dalam sedetik jauh lebih
// berguna daripada gelembung yang berputar selamanya.
{
  const { diagnosaAi } = await import('../src/lib/diagnosaAi.ts')
  const dg = diagnosaAi(401, JSON.stringify({
    error: { code: 401, status: 'UNAUTHENTICATED', message: 'Silakan masuk dulu untuk memakai fitur AI.' },
  }))
  assert(dg.sebab === 'perantara_tanpa_sesi' || /masuk/i.test(dg.perbaikan),
    `401 dari perantara diberi langkah yang bisa dikerjakan: ${dg.perbaikan?.slice(0, 60)}`)
}

console.log(`token-sesi: ${ok} assert lulus`)
