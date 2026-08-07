// ============================================================
// Test SELURUH jalur AI dari ujung ke ujung, dengan Google palsu.
//
// Semua cacat yang ditemukan pemakainya hari ini — kunci server yang dilaporkan
// sebagai "layanan sedang padat", kuota habis yang didiagnosis sebagai masalah
// penagihan, nama model spekulatif yang diketuk lebih dulu pada tiap pesan,
// gelembung galat yang dikirim balik ke model — lolos karena setiap bagiannya
// diuji sendiri-sendiri dan tidak ada yang menguji rangkaiannya.
//
// Berkas ini menutup celah itu: ia menjalankan handler /api/ai sungguhan dengan
// Google dan Supabase yang dipalsukan, lalu memeriksa apa yang sampai ke
// pengklasifikasi galat di sisi klien. Yang diperiksa adalah PERILAKU
// rangkaiannya, bukan potongan-potongannya.
// ============================================================
import handler from '../api/ai.ts'
import { jenisGalat, bisaDiulang } from '../src/lib/galatAi.ts'
import { diagnosaAi } from '../src/lib/diagnosaAi.ts'
import { MODEL_TEKS, MODEL_UTAMA } from '../src/lib/modelAi.ts'
import { riwayatUntukModel } from '../src/lib/riwayatChat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Perkakas: server palsu & penampung respons ──────────────────────────
function buatRes() {
  const r = {
    kode: 200, badan: '', header: {},
    status(k) { r.kode = k; return r },
    setHeader(k, v) { r.header[k] = v; return r },
    json(o) { r.badan = JSON.stringify(o); return r },
    send(t) { r.badan = String(t); return r },
  }
  return r
}
const req = (body, token = 'token-sah') => ({
  method: 'POST', headers: { authorization: `Bearer ${token}` }, body,
})

/** Ganti fetch global: Supabase selalu meloloskan, Google dijawab sesuai skenario. */
function pasangJaringan(jawabGoogle) {
  const dipanggil = []
  globalThis.fetch = async (url, opsi) => {
    const u = String(url)
    dipanggil.push(u)
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200 }
    return jawabGoogle(u, opsi)
  }
  return dipanggil
}
const jawaban = (status, obj) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  text: async () => JSON.stringify(obj),
  json: async () => obj,
})

const ENV_ASLI = { ...process.env }
function pasangEnv(tambahan) {
  for (const k of Object.keys(process.env)) if (/GEMINI|SUPABASE/i.test(k)) delete process.env[k]
  process.env.SUPABASE_URL = 'https://contoh.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'anon-palsu'
  Object.assign(process.env, tambahan)
}

// ── 1. Kunci server belum dipasang ──────────────────────────────────────
//
// Yang terjadi di lapangan: layar berbunyi "Layanan AI sedang sangat padat,
// coba lagi dalam ±1 menit" — untuk keadaan yang tidak akan pernah pulih
// sendiri, lalu diulang berkali-kali. Sebabnya perantara menjawab 500, dan 500
// masuk keranjang kepadatan.
{
  pasangEnv({ VITE_GEMINI_API_KEY: 'kunci-lama-yang-bocor' })
  pasangJaringan(() => jawaban(200, {}))
  const res = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [] }), res)

  assert(res.kode === 500, 'tanpa kunci server, permintaannya ditolak di gerbang')
  assert(res.badan.includes('NO_SERVER_KEY'), 'dengan sebab yang bisa dikenali')
  assert(res.badan.includes('VITE_GEMINI_API_KEY'),
    'dan menyebut nama variabel yang benar-benar dilihat server')
  assert(!res.badan.includes('kunci-lama-yang-bocor'),
    'NILAI kuncinya tidak pernah ikut — hanya namanya')

  const teks = `${res.kode} ${res.badan}`
  assert(jenisGalat(teks) === 'kunci', 'di sisi klien terbaca sebagai masalah kunci')
  assert(jenisGalat(teks) !== 'sibuk', 'dan BUKAN kepadatan, meski statusnya 500')
  assert(bisaDiulang(jenisGalat(teks)) === false, 'jadi tidak diulang sia-sia')
  const dg = diagnosaAi(res.kode, res.badan)
  assert(/VITE_/.test(dg.perbaikan), 'perbaikannya menyebut temuan itu, bukan kalimat generik')
  assert(dg.sumber === 'kami', 'dan tidak dinisbahkan kepada Google')
}

// ── 2. Kuota habis — kalimat Google memuat kata "billing" ───────────────
//
// Yang terjadi di lapangan: didiagnosis sebagai project yang belum tertaut akun
// penagihan, sehingga orang memeriksa sesuatu yang sudah benar.
{
  pasangEnv({ GEMINI_API_KEY: 'AIza' + 'x'.repeat(35) })
  const PESAN = 'You exceeded your current quota, please check your plan and billing details. '
    + 'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits'
  pasangJaringan(() => jawaban(429, { error: { code: 429, message: PESAN, status: 'RESOURCE_EXHAUSTED' } }))

  const res = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [] }), res)

  assert(res.kode === 429, 'status dari Google diteruskan apa adanya')
  assert(res.badan.includes('exceeded your current quota'),
    'beserta kalimatnya — di situlah sebab dan perbaikannya tertulis')

  const teks = `${res.kode} ${res.badan}`
  assert(jenisGalat(teks) === 'kuota', 'terbaca sebagai kuota')
  assert(jenisGalat(teks) !== 'kunci', 'dan BUKAN masalah kunci, meski memuat kata "billing"')
  assert(diagnosaAi(res.kode, res.badan).sebab === 'kuota', 'diagnosisnya juga kuota')
  assert(diagnosaAi(res.kode, res.badan).sebab !== 'billing', 'bukan penagihan')
}

// ── 3. 403 yang MEMANG soal izin tidak boleh ikut tergeser ──────────────
{
  pasangEnv({ GEMINI_API_KEY: 'AIza' + 'x'.repeat(35) })
  pasangJaringan(() => jawaban(403, {
    error: {
      code: 403, status: 'PERMISSION_DENIED',
      message: 'Generative Language API has not been used in project 481923 before or it is disabled.',
    },
  }))
  const res = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [] }), res)

  assert(jenisGalat(`${res.kode} ${res.badan}`) === 'kunci', '403 tetap masalah kunci/izin')
  const dg = diagnosaAi(res.kode, res.badan)
  assert(dg.sebab === 'api_mati', 'dan sebabnya dipersempit ke API yang belum diaktifkan')
  assert(dg.sumber === 'google', 'kalimatnya memang dari Google')
  assert(/generativelanguage/.test(dg.tautan ?? ''), 'diarahkan ke halaman yang tepat')
}

// ── 4. Perantara tetap berpagar ─────────────────────────────────────────
{
  pasangEnv({ GEMINI_API_KEY: 'AIza' + 'x'.repeat(35) })

  // Tanpa sesi: perantara terbuka sama saja dengan kunci terbuka.
  pasangJaringan(() => jawaban(200, {}))
  globalThis.fetch = async u =>
    String(u).includes('/auth/v1/user') ? { ok: false, status: 401 } : jawaban(200, {})
  const r1 = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [] }, 'token-palsu'), r1)
  assert(r1.kode === 401, 'sesi yang tidak sah ditolak')
  assert(r1.badan.includes('UNAUTHENTICATED'), 'dengan sebab yang jelas')

  // Model di luar daftar: jangan sampai perantara menjadi pintu ke seluruh
  // katalog Google atas tanggungan kami.
  const dipanggil = pasangJaringan(() => jawaban(200, {}))
  const r2 = buatRes()
  await handler(req({ model: 'gemini-3-ultra-super-mahal', contents: [] }), r2)
  assert(r2.kode === 400, 'model di luar daftar ditolak')
  assert(r2.badan.includes('MODEL_NOT_ALLOWED'), 'dengan sebab yang jelas')
  assert(!dipanggil.some(u => u.includes('generativelanguage')),
    'dan permintaannya TIDAK pernah sampai ke Google — tidak ada biaya yang timbul')

  // GET tidak boleh dilayani sama sekali.
  const r3 = buatRes()
  await handler({ method: 'GET', headers: {}, body: {} }, r3)
  assert(r3.kode === 405, 'hanya POST yang dilayani')
}

// ── 5. Jalur berhasil: model yang dipakai, dan hanya SATU panggilan ─────
//
// Sempat nama model yang belum tentu ada ditaruh paling depan, sehingga tiap
// pesan mengetuknya lebih dulu dan menunggu penolakan — satu perjalanan
// sia-sia untuk setiap panggilan.
{
  pasangEnv({ GEMINI_API_KEY: 'AIza' + 'x'.repeat(35) })
  const dipanggil = pasangJaringan(() => jawaban(200, {
    candidates: [{ content: { parts: [{ text: 'Baik, saya catat 10 sak semen.' }] } }],
  }))
  const res = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [{ parts: [{ text: 'halo' }] }] }), res)

  assert(res.kode === 200, 'jalur berhasil diteruskan apa adanya')
  assert(res.badan.includes('10 sak semen'), 'beserta jawabannya')
  const keGoogle = dipanggil.filter(u => u.includes('generativelanguage'))
  assert(keGoogle.length === 1, `hanya satu panggilan ke Google: ${keGoogle.length}`)
  assert(keGoogle[0].includes(MODEL_UTAMA), `dan memakai model utama: ${MODEL_UTAMA}`)
  assert(MODEL_TEKS.every(m => /^gemini-2\./.test(m)),
    'daftar model panas hanya berisi nama yang sudah pasti ada')
}

// ── 6. Kunci tidak pernah bocor lewat jawaban ───────────────────────────
{
  const KUNCI = 'AIza' + 'RAHASIA'.padEnd(35, 'z')
  pasangEnv({ GEMINI_API_KEY: KUNCI })
  pasangJaringan(() => jawaban(403, { error: { message: 'Requests from referer are blocked.' } }))
  const res = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [] }), res)

  assert(!res.badan.includes(KUNCI), 'kunci tidak pernah ikut di badan jawaban')
  assert(!JSON.stringify(res.header).includes(KUNCI), 'maupun di headernya')
  assert(res.header['X-PropFS-Bentuk-Kunci'] === 'api_key',
    'yang disampaikan hanya BENTUKNYA, sebagai keterangan atas penolakan')
}
{
  // Kunci yang salah jenis: bentuknya disampaikan, tetapi tetap dikirim —
  // memblokir berarti suatu hari menolak kunci yang sebenarnya sah.
  pasangEnv({ GEMINI_API_KEY: 'AQ.' + 'x'.repeat(48) })
  const dipanggil = pasangJaringan(() => jawaban(403, { error: { message: 'API key not valid.' } }))
  const res = buatRes()
  await handler(req({ model: MODEL_UTAMA, contents: [] }), res)
  assert(dipanggil.some(u => u.includes('generativelanguage')),
    'kunci yang bentuknya aneh TETAP dicoba — Google yang memutuskan, bukan kita')
  assert(res.header['X-PropFS-Bentuk-Kunci'] === 'oauth', 'bentuknya dilaporkan sebagai keterangan')
}

// ── 7. Riwayat yang teracuni tidak menular ke pesan berikutnya ──────────
//
// Yang terjadi di lapangan: Gemini menjawab dengan BERHASIL tetapi menolak
// membaca foto sambil menyebut kuota — karena ia membaca gelembung galat lama
// di riwayat sebagai ucapannya sendiri.
{
  const riwayat = [
    { id: 'system-start', role: 'assistant', text: 'Kirim foto nota…' },
    { id: '1', role: 'user', text: 'Tes' },
    { id: '2', role: 'assistant', text: '⚠️ Kuota layanan AI sudah terpakai habis.' },
    { id: '3', role: 'assistant', text: 'GEMINI_API_KEY belum terbaca di server.' },
    { id: '4', role: 'user', text: 'Beli semen 10 sak' },
    { id: '5', role: 'assistant', text: 'Baik, saya catat 10 sak semen Rp 650.000.' },
  ]
  const bersih = riwayatUntukModel(riwayat)
  const teksGabung = bersih.map(p => p.text).join(' ')
  assert(!/kuota/i.test(teksGabung), 'kalimat kuota tidak ikut dikirim ke model')
  assert(!/GEMINI_API_KEY/.test(teksGabung), 'begitu pula diagnosis kunci server')
  assert(/10 sak semen/.test(teksGabung), 'tetapi jawaban sungguhan tetap terbawa sebagai konteks')
  assert(bersih.length === 3, `sisanya utuh: ${bersih.length}`)
}

Object.assign(process.env, ENV_ASLI)
console.log(`alur-ai: ${ok} assert lulus`)
