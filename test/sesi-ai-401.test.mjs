// ============================================================
// "Sesi Anda tidak terbaca" untuk orang yang jelas-jelas sedang memakai
// aplikasinya.
//
// Chat AI menolak dengan 401 dan menyarankan keluar lalu masuk kembali —
// untuk sesi yang sebenarnya masih sah dan hanya perlu DISEGARKAN.
//
// Token Supabase berumur satu jam. Aplikasi ini dibuka berjam-jam di
// lapangan, jadi kedaluwarsa di tengah pemakaian bukan kasus tepi: itu
// kejadian harian.
//
// Dua hal bertemu, dan keduanya sendirian sudah cukup menghasilkan 401 itu:
//
//   1. Cadangan token dari penyimpanan browser tidak memeriksa masa berlaku
//      sama sekali. Ketika Supabase lambat menjawab — sinyal lemah di
//      lapangan, persis keadaan yang membuat batas waktunya ada — yang
//      dikirim adalah token MATI. Server menolaknya dengan yakin.
//
//   2. Tidak ada yang memicu penyegaran ketika 401 datang. Penyegarannya ada
//      dan otomatis; yang tidak ada adalah yang membangunkannya.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bacaTokenSimpanan, masihSegar } from '../src/lib/tokenSesi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

/** JWT palsu dengan klaim exp — hanya bagian tengahnya yang dibaca. */
function jwt(expDetik) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ exp: expDetik })}.tandatangan`
}
function gudang(isi) {
  const kunci = Object.keys(isi)
  return {
    length: kunci.length,
    key: (i) => kunci[i] ?? null,
    getItem: (k) => isi[k] ?? null,
  }
}

const SEKARANG = 1_800_000_000_000            // waktu acuan, ms
const detik = ms => Math.floor(ms / 1000)

// ── 1. Token mati TIDAK dipakai sebagai cadangan ────────────────────
{
  const mati = jwt(detik(SEKARANG) - 60)      // kedaluwarsa semenit lalu
  const g = gudang({ 'sb-abcdefgh-auth-token': JSON.stringify({ access_token: mati }) })

  assert(masihSegar(mati, SEKARANG) === false, 'token itu memang sudah mati')
  assert(bacaTokenSimpanan(g, SEKARANG) === '',
    'token mati diabaikan — kosong lebih jujur daripada 401 yang meyakinkan')
}

// ── 2. Token yang masih hidup tetap dipakai ─────────────────────────
//
// Kalau tidak, cadangannya berhenti menjadi cadangan dan setiap permintaan
// menunggu jaringan — persis yang dulu membuat "AI sedang membaca… 114s".
{
  const hidup = jwt(detik(SEKARANG) + 3600)
  const g = gudang({ 'sb-abcdefgh-auth-token': JSON.stringify({ access_token: hidup }) })
  assert(bacaTokenSimpanan(g, SEKARANG) === hidup, 'token yang masih berlaku tetap dikembalikan')

  // Bentuk lama Supabase (currentSession) ikut terbaca.
  const lama = gudang({ 'sb-x-auth-token': JSON.stringify({ currentSession: { access_token: hidup } }) })
  assert(bacaTokenSimpanan(lama, SEKARANG) === hidup, 'bentuk currentSession ikut terbaca')
}

// ── 3. Yang hampir mati juga ditolak ────────────────────────────────
//
// Token yang tinggal beberapa detik akan mati di tengah perjalanan
// permintaannya. Jeda aman itu gunanya.
{
  const nyaris = jwt(detik(SEKARANG) + 5)
  const g = gudang({ 'sb-x-auth-token': JSON.stringify({ access_token: nyaris }) })
  assert(bacaTokenSimpanan(g, SEKARANG) === '', 'sisa beberapa detik tidak dianggap cukup')
}

// ── 4. Masukan rusak tidak melempar ─────────────────────────────────
{
  assert(bacaTokenSimpanan(null) === '', 'tanpa penyimpanan, kosong')
  assert(bacaTokenSimpanan(gudang({ 'sb-x-auth-token': '{rusak' }), SEKARANG) === '',
    'isi yang rusak tidak melempar')
  assert(bacaTokenSimpanan(gudang({ 'lain': JSON.stringify({ access_token: jwt(detik(SEKARANG) + 99) }) }), SEKARANG) === '',
    'kunci yang bukan milik Supabase tidak dibaca')
}

// ── 5. 401 memicu penyegaran, lalu SATU kali ulang ──────────────────
{
  const kode = readFileSync(new URL('../src/lib/gemini.ts', import.meta.url).pathname, 'utf8')
    .split('\n').filter(b => { const x = b.trim(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') })
    .join('\n')

  assert(/async function tokenSegar\(\)/.test(kode), 'ada pengambil token yang benar-benar baru')
  assert(/lupakanToken\(\)/.test(kode), 'ingatan lama dibuang lebih dulu — kalau tidak, yang diambil itu lagi')
  assert(/refreshSession\(\)/.test(kode), 'menyegarkan sungguhan, bukan hanya membaca ulang')
  assert(/res\.status !== 401 \|\| undangan/.test(kode),
    'hanya 401, dan tamu tidak ikut — ia memang tidak punya sesi untuk disegarkan')

  // Sekali. Perulangan tanpa batas pada 401 berarti memutar tanpa akhir untuk
  // sesi yang memang sudah tidak sah.
  const badan = kode.slice(kode.indexOf('async function kirim('), kode.indexOf('async function kirimSekali('))
  assert((badan.match(/kirimSekali\(/g) || []).length === 2, 'dicoba tepat sekali lagi, tidak berulang')
  assert(/if \(!segar\) return res/.test(badan),
    'gagal menyegarkan berarti jawaban 401 yang ASLI diteruskan, bukan ditelan')

  // Anggaran waktunya tidak boleh diberikan penuh lagi.
  assert(/batasMs - \(Date\.now\(\) - mulaiSemua\)/.test(badan),
    'percobaan kedua memakai SISA anggaran, bukan jatah penuh yang baru')
}

console.log(`sesi-ai-401: ${ok} assert lulus`)
