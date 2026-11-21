// ============================================================
// "Koneksi terlalu lama tidak menjawab" — padahal sinyalnya ada.
//
// GEJALANYA: halaman hasil FS sering berganti menjadi "Hasil belum bisa
// dibuka", dan "Coba lagi" tidak menolong, walau HP tersambung 5G.
//
// SEBABNYA: sebelum setiap permintaan data, supabase-js menyegarkan token
// login yang hampir habis — dan semua permintaan data MENUNGGU penyegaran
// itu. Permintaan penyegarannya tidak punya batas waktu. Sesudah HP bangun
// atau pindah jaringan, sambungan lama yang tersendat membuatnya menunggu
// selama yang diizinkan peramban, dan selama itu tidak satu pun permintaan
// data berangkat. Halaman hasil menyerah sesudah 8 detik — dan galatnya
// menutup hasil yang sebenarnya sudah ada di perangkat.
//
// Diuji dengan halaman hasil asli di peramban, penyegaran pertama dibuat
// tersendat: kode lama → layar galat, supabase-js menggantung, "Coba lagi"
// tetap gagal, nol permintaan sampai ke server. Kode ini → hasil tetap
// tampil dengan pita, penyegaran diputus di detik ke-10 dan diulang lewat
// sambungan baru, lalu tersambung.
// ============================================================
import { readFileSync } from 'node:fs'
import { fetchBerbatas, urlAuth, batasUntukUrl, BATAS_AUTH_MS, BATAS_AUTH_INTERAKTIF_MS } from '../src/lib/fetchBerbatas.ts'
import { keadaanMuat, PESAN_LAMBAT } from '../src/lib/muatHasil.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const baca = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const tidur = ms => new Promise(r => setTimeout(r, ms))
const AUTH = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token'
const REST = 'https://x.supabase.co/rest/v1/projects?select=*'

/** fetch tiruan: `macet` = tidak pernah menjawab kecuali dibatalkan. */
function fetchTiruan({ macet = false, lama = 5 } = {}) {
  const panggilan = []
  const f = (input, init = {}) => {
    panggilan.push({ input, init })
    return new Promise((ok_, gagal) => {
      const s = init.signal
      if (s?.aborted) return gagal(s.reason)
      s?.addEventListener('abort', () => gagal(s.reason), { once: true })
      if (!macet) setTimeout(() => ok_(new Response('{}', { status: 200 })), lama)
    })
  }
  return { f, panggilan }
}

// ── 1. Hanya permintaan ke server login yang dibatasi ────────────────
{
  assert(urlAuth(AUTH) && urlAuth('https://x.supabase.co/auth/v1/user'), 'server login dikenali')
  assert(!urlAuth(REST) && !urlAuth('https://x.supabase.co/storage/v1/object/a.jpg'), 'data & berkas tidak ikut dibatasi')
  assert(BATAS_AUTH_MS >= 5000 && BATAS_AUTH_MS <= 20000, `batasnya masuk akal (${BATAS_AUTH_MS} ms)`)
  assert(batasUntukUrl(AUTH) === BATAS_AUTH_MS, 'penyegaran token: batas pendek — seluruh aplikasi menunggunya')
  assert(batasUntukUrl('https://x.supabase.co/auth/v1/user') === BATAS_AUTH_MS, 'baca pengguna: batas pendek')
  assert(batasUntukUrl('https://x.supabase.co/auth/v1/token?grant_type=password') === BATAS_AUTH_INTERAKTIF_MS,
    'login: batas longgar — tidak diulang otomatis')
  assert(batasUntukUrl('https://x.supabase.co/auth/v1/signup') === BATAS_AUTH_INTERAKTIF_MS, 'daftar: batas longgar')
  assert(BATAS_AUTH_INTERAKTIF_MS > BATAS_AUTH_MS, 'yang ditekan pemakai lebih sabar daripada yang berjalan di belakang')
  assert(batasUntukUrl(REST) === null && batasUntukUrl('https://x.supabase.co/storage/v1/object/a.jpg') === null,
    'data & berkas tidak dibatasi di sini')

  const t = fetchTiruan()
  const ff = fetchBerbatas(t.f)
  const init = { method: 'GET' }
  await ff(REST, init)
  assert(t.panggilan[0].init === init && !t.panggilan[0].init.signal, 'permintaan data diteruskan apa adanya')
}

// ── 2. Penyegaran yang tersendat DIPUTUS ─────────────────────────────
{
  const t = fetchTiruan({ macet: true })
  const ff = fetchBerbatas(t.f, u => urlAuth(u) ? 40 : null)
  const mulai = Date.now()
  let galat = null
  try { await ff(AUTH, { method: 'POST' }) } catch (e) { galat = e }
  const lama = Date.now() - mulai
  assert(galat && galat.name === 'TimeoutError', 'yang tersendat berakhir dengan galat waktu habis, bukan menggantung')
  assert(/tidak menjawab/.test(galat.message), 'pesannya bisa dibaca')
  assert(lama >= 35 && lama < 400, `diputus tepat di batasnya (${lama} ms)`)

  // Tanpa pembatas, penyegaran yang sama menggantung — itulah gejalanya.
  const t2 = fetchTiruan({ macet: true })
  const hasil = await Promise.race([t2.f(AUTH, {}).then(() => 'selesai', () => 'gagal'), tidur(150).then(() => 'MENGGANTUNG')])
  assert(hasil === 'MENGGANTUNG', 'pembanding: tanpa batas, penyegaran tersendat tidak pernah selesai')

  // Yang lancar tidak terganggu.
  const t3 = fetchTiruan({ lama: 5 })
  const res = await fetchBerbatas(t3.f, () => 200)(AUTH, {})
  assert(res.status === 200, 'penyegaran yang lancar selesai seperti biasa')

  // Pembatalan dari pemanggil tetap dihormati.
  const t4 = fetchTiruan({ macet: true })
  const ctrl = new AbortController()
  const janji = fetchBerbatas(t4.f, () => 5000)(AUTH, { signal: ctrl.signal })
  setTimeout(() => ctrl.abort(new Error('dibatalkan pemanggil')), 10)
  let g4 = null
  try { await janji } catch (e) { g4 = e }
  assert(g4 && /pemanggil/.test(g4.message), 'pembatalan pemanggil ikut memutus')
  const ctrl2 = new AbortController(); ctrl2.abort(new Error('sudah batal'))
  let g5 = null
  try { await fetchBerbatas(fetchTiruan({ macet: true }).f, () => 5000)(AUTH, { signal: ctrl2.signal }) } catch (e) { g5 = e }
  assert(g5 && /sudah batal/.test(g5.message), 'sinyal yang sudah batal langsung memutus')

  // Bentuk masukan lain: URL & Request.
  const t6 = fetchTiruan({ macet: true })
  let g6 = null
  try { await fetchBerbatas(t6.f, u => urlAuth(u) ? 30 : null)(new URL(AUTH), {}) } catch (e) { g6 = e }
  assert(g6?.name === 'TimeoutError', 'masukan URL juga dikenali')
}

// ── 3. Dipasang di klien Supabase ────────────────────────────────────
{
  const sb = baca('src/lib/supabase.ts')
  assert(/global: \{[\s\S]*fetch: fetchBerbatas\(\(input, init\) => fetch\(input, init\), batasUntukUrl\)/.test(sb),
    'klien Supabase memakai fetch berbatas untuk server login')
  assert(/lock: async \(_name, _acquireTimeout, fn\) => await fn\(\)/.test(sb), 'pengaturan kunci yang sudah ada tidak berubah')
}

// ── 4. Hasil yang sudah ada tidak ditutup galat ──────────────────────
{
  const K = o => keadaanMuat({ sesiMemuat: false, memuat: false, galat: '', adaHasil: false, ...o })
  assert(K({ galat: PESAN_LAMBAT, adaHasil: true }) === 'siap', 'hasil di perangkat tetap tampil walau server lambat')
  assert(K({ galat: PESAN_LAMBAT }) === 'galat', 'tanpa hasil di perangkat: layar galat tetap muncul')

  const hal = baca('src/pages/ResultPage.tsx')
  assert(/data-pita-galat/.test(hal) && /\{galat && \(/.test(hal), 'galatnya disampaikan sebagai pita di atas hasil')
  assert(/galat === PESAN_LAMBAT\s*\?\s*'Server belum menjawab/.test(hal), 'pita tidak menyuruh memeriksa sinyal yang sebenarnya baik')
  assert(/ulangOtomatis >= 3/.test(hal) && /setTimeout\(\(\) => \{\s*setUlangOtomatis/.test(hal), 'dicoba lagi otomatis, paling banyak tiga kali')
  assert(/if \(!\(tampil\.currentProjectId === id && tampil\.currentResults\)\) setReady\(false\)/.test(hal),
    'mencoba lagi tidak menutup hasil yang sedang dibaca')
}

console.log(`sesi-tersendat: ${ok} pemeriksaan lolos`)
