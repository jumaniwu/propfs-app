// Test penerjemahan penolakan Gemini menjadi langkah perbaikan.
import { diagnosaAi, pesanPenyedia, ceritaDiagnosa } from '../src/lib/diagnosaAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// Badan respons Google, disalin sesuai bentuk aslinya.
const badan = (message, status = 'PERMISSION_DENIED', code = 403) =>
  JSON.stringify({ error: { code, message, status } })

// ── Inti keluhan: empat keadaan berbeda yang semuanya berbunyi 403 ───────
{
  const dg = diagnosaAi(403, badan(
    'Requests from referer https://propfs.id/ are blocked.', 'PERMISSION_DENIED'))
  assert(dg.sebab === 'kunci_dibatasi', 'referer diblokir = pembatasan domain')
  assert(/propfs\.id/.test(dg.perbaikan), 'perbaikannya menyebut domain yang harus didaftarkan')
  assert(/credentials/.test(dg.tautan ?? ''), 'diarahkan ke halaman Credentials, bukan ke Billing')
}
{
  const dg = diagnosaAi(403, badan(
    'Generative Language API has not been used in project 481923 before or it is disabled.',
    'SERVICE_DISABLED'))
  assert(dg.sebab === 'api_mati', 'SERVICE_DISABLED = API belum diaktifkan')
  assert(/generativelanguage/.test(dg.tautan ?? ''), 'diarahkan ke halaman ENABLE API-nya')
  assert(dg.sebab !== 'billing',
    'dan TIDAK dikira masalah penagihan meski pesan Google memuat kata "billing"')
}
{
  const dg = diagnosaAi(403, badan("Consumer 'projects/481923' has been suspended.", 'CONSUMER_SUSPENDED'))
  assert(dg.sebab === 'project_suspend', 'suspend dikenali sendiri')
  assert(/tidak pulih dengan membayar/i.test(dg.perbaikan),
    'dikatakan terus terang bahwa membayar tidak menyelesaikannya — inilah yang paling mahal bila salah')
}
{
  const dg = diagnosaAi(403, badan(
    'This API method requires billing to be enabled.', 'PERMISSION_DENIED'))
  assert(dg.sebab === 'billing', 'billing yang memang billing tetap dikenali')
  assert(/project yang dibayar/i.test(dg.perbaikan),
    'diingatkan bahwa saldo hanya berlaku untuk project yang tertaut')
}

// ── Semuanya 403, tetapi perbaikannya berlainan ──────────────────────────
{
  const kasus = [
    'Requests from referer https://propfs.id/ are blocked.',
    'Generative Language API has not been used in project 481923 before or it is disabled.',
    "Consumer 'projects/481923' has been suspended.",
    'This API method requires billing to be enabled.',
  ].map(m => diagnosaAi(403, badan(m)))
  assert(new Set(kasus.map(k => k.sebab)).size === 4,
    'empat pesan 403 menghasilkan empat sebab berbeda, bukan satu "PERMISSION_DENIED"')
  assert(new Set(kasus.map(k => k.perbaikan)).size === 4, 'dan empat langkah perbaikan berbeda')
}

// ── Kunci salah vs kunci tidak terkirim ──────────────────────────────────
{
  const dg = diagnosaAi(400, badan('API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT', 400))
  assert(dg.sebab === 'kunci_salah', 'kunci tidak sah dikenali')
  assert(/redeploy/i.test(dg.perbaikan),
    'diingatkan redeploy — mengubah env di Vercel tanpa deploy ulang tidak berlaku')
}
assert(diagnosaAi(401, badan('Method doesn\'t allow unregistered callers', 'UNAUTHENTICATED', 401)).sebab
  === 'kunci_salah', 'permintaan tanpa kunci dikenali')
assert(diagnosaAi(undefined, 'No Gemini key').sebab === 'kunci_salah',
  'kunci yang belum dipasang di aplikasi juga masuk kategori kunci')

// ── Sisanya ──────────────────────────────────────────────────────────────
assert(diagnosaAi(429, badan('You exceeded your current quota.', 'RESOURCE_EXHAUSTED', 429)).sebab === 'kuota',
  '429 = kuota')
assert(diagnosaAi(404, badan('models/gemini-9-ultra is not found', 'NOT_FOUND', 404)).sebab === 'model_tak_ada',
  'nama model tidak dikenal')
assert(diagnosaAi(503, '').sebab === 'padat', '503 = padat')
assert(diagnosaAi(undefined, 'TypeError: Failed to fetch').sebab === 'jaringan', 'gagal fetch = jaringan')

// Yang bukan urusan setelan kami tidak boleh menyuruh admin mengubah setelan.
assert(diagnosaAi(503, '').sisiKami === false, 'kepadatan bukan salah setelan kami')
assert(diagnosaAi(undefined, 'Failed to fetch').sisiKami === false, 'jaringan pemakai bukan setelan kami')
assert(diagnosaAi(403, badan('Requests from referer x are blocked.')).sisiKami === true,
  'pembatasan kunci memang setelan kami')

// ── Tidak dikenali: jujur, dan tetap berguna ─────────────────────────────
{
  const dg = diagnosaAi(418, badan('Sesuatu yang benar-benar baru', 'ANEH', 418))
  assert(dg.sebab === 'tidak_dikenali', 'yang tak dikenali tidak dipaksakan masuk kategori')
  assert(dg.asli === 'Sesuatu yang benar-benar baru',
    'tetapi kalimat asli Google tetap dibawa — di situlah jawabannya biasanya berada')
}
{
  const dg = diagnosaAi(undefined, '')
  assert(dg.sebab === 'tidak_dikenali' && dg.asli === '', 'badan kosong tidak meledak')
  assert(dg.perbaikan.length > 0, 'dan tetap memberi langkah berikutnya')
}
assert(diagnosaAi(undefined, null).sebab === 'tidak_dikenali', 'null aman')
assert(diagnosaAi(undefined, undefined).asli === '', 'undefined aman')

// ── Mengambil kalimat asli dari badan apa pun ────────────────────────────
assert(pesanPenyedia(badan('Halo')) === 'Halo', 'JSON utuh terbaca')
assert(pesanPenyedia('{"message":"Langsung di akar"}') === 'Langsung di akar', 'message di akar terbaca')
{
  // Pemanggil memangkas badan galat, jadi JSON sering sampai dalam keadaan
  // terpotong. Justru di situlah kalimatnya paling dibutuhkan.
  const potong = badan('Requests from referer https://propfs.id/ are blocked.').substring(0, 90)
  const p = pesanPenyedia(potong)
  assert(/Requests from referer/.test(p), `JSON terpotong tetap terbaca: ${p}`)
  assert(!p.includes('{'), 'dan hasilnya bukan JSON mentah')
}
assert(pesanPenyedia('bukan json sama sekali') === 'bukan json sama sekali', 'teks polos diteruskan')
assert(pesanPenyedia('') === '', 'kosong tetap kosong')
assert(pesanPenyedia(null) === '', 'null aman')
{
  const p = pesanPenyedia(JSON.stringify({ error: { message: 'Tanda "kutip" di dalam' } }))
  assert(p === 'Tanda "kutip" di dalam', 'escape di dalam pesan tidak merusak pembacaan')
}

// ── Cerita untuk superadmin ──────────────────────────────────────────────
{
  const dg = diagnosaAi(403, badan('Requests from referer https://propfs.id/ are blocked.'))
  const c = ceritaDiagnosa(dg)
  assert(/Perbaikan:/.test(c), 'ada bagian perbaikan')
  assert(c.includes('console.cloud.google.com'), 'tautannya ikut supaya tidak perlu dicari')
  assert(/Kata Google:/.test(c), 'kalimat asli Google ikut ditampilkan')
  assert(!c.includes('{'), 'tanpa JSON mentah')
}
{
  const c = ceritaDiagnosa(diagnosaAi(503, ''))
  assert(!/Kata Google/.test(c), 'tanpa pesan asli, tidak mengarang kutipan kosong')
}
{
  const panjang = 'x'.repeat(500)
  const c = ceritaDiagnosa(diagnosaAi(403, badan(panjang)))
  assert(c.includes('…'), 'kutipan yang kepanjangan dipotong dengan tanda')
  assert(c.length < 700, `dan ceritanya tetap terbaca: ${c.length} karakter`)
}

console.log(`diagnosa-ai: ${ok} assert lulus`)
