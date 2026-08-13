// ============================================================
// Vendor memakai AI tanpa punya akun — dan pagarnya harus benar-benar memagari.
//
// Ini permukaan serangan baru: sampai sekarang /api/ai hanya bisa dipanggil
// pengguna yang sudah masuk. Sekarang sepotong token di dalam tautan WhatsApp
// juga membukanya — dan tautan WhatsApp diteruskan orang.
//
// Jadi yang diuji di sini bukan "vendor bisa memakai AI", melainkan hal yang
// sebaliknya: SEMUA yang tidak boleh, tetap tidak boleh. Kunci Gemini yang
// sama pernah membuat project-nya disuspend; membuka pintu kedua tanpa pagar
// berarti mengulang persis kejadian itu.
// ============================================================
import handler from '../api/ai.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

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

process.env.SUPABASE_URL = 'https://contoh.supabase.co'
process.env.SUPABASE_ANON_KEY = 'anon-palsu'
process.env.GEMINI_API_KEY = 'AIza' + 'x'.repeat(35)

const TOKEN_HIDUP = 'ABCD2345MNPQ'
let dipanggilGoogle = 0
let dimintaKeGoogle = null
let rpcDipanggil = 0

/** Supabase palsu: sesi pengguna SELALU ditolak, hanya token undangan yang hidup. */
function pasangJaringan() {
  dipanggilGoogle = 0; dimintaKeGoogle = null; rpcDipanggil = 0
  globalThis.fetch = async (url, opsi) => {
    const u = String(url)
    if (u.includes('/auth/v1/user')) return { ok: false, status: 401 }
    if (u.includes('/rpc/invoice_ai_boleh')) {
      rpcDipanggil++
      const b = JSON.parse(opsi.body)
      return { ok: true, status: 200, json: async () => b.p_token === TOKEN_HIDUP }
    }
    dipanggilGoogle++
    dimintaKeGoogle = JSON.parse(opsi.body)
    return {
      ok: true, status: 200, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    }
  }
}

const kirim = async (badan, undanganToken) => {
  pasangJaringan()
  const res = buatRes()
  await handler({
    method: 'POST',
    headers: {
      authorization: 'Bearer sesi-tidak-berlaku',
      ...(undanganToken === undefined ? {} : { 'x-propfs-undangan': undanganToken }),
    },
    body: badan,
  }, res)
  return res
}

const FOTO = { model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [
  { text: 'Baca invoice ini' },
  { inlineData: { data: 'AAAA', mimeType: 'image/jpeg' } },
] }] }

// ── 1. Yang memang dituju: vendor bisa membaca invoicenya ───────────────
{
  const res = await kirim(FOTO, TOKEN_HIDUP)
  assert(res.kode === 200, 'vendor dengan tautan hidup boleh memakai AI')
  assert(rpcDipanggil === 1, 'izinnya ditanyakan ke basis data, bukan disimpulkan dari bentuk token')
  assert(dipanggilGoogle === 1, 'dan permintaannya benar-benar sampai ke Google')
  assert(dimintaKeGoogle.contents[0].parts.some(p => p.inlineData),
    'lengkap dengan foto invoicenya')
}

// ── 2. Tanpa tautan, tetap tertutup ─────────────────────────────────────
{
  const res = await kirim(FOTO, undefined)
  assert(res.kode === 401, 'tanpa sesi dan tanpa tautan: ditolak')
  assert(dipanggilGoogle === 0, 'dan kunci Gemini tidak tersentuh sama sekali')
}
{
  const res = await kirim(FOTO, 'TOKENPALSUXX')
  assert(res.kode === 401, 'token yang tidak dikenali basis data ditolak')
  assert(dipanggilGoogle === 0, 'tanpa menyentuh Google')
}
{
  const res = await kirim(FOTO, 'ABC')
  assert(res.kode === 401, 'token terlalu pendek ditolak')
  assert(rpcDipanggil === 0, 'bahkan tanpa menanyakannya ke basis data')
}
{
  const res = await kirim(FOTO, 'X'.repeat(500))
  assert(res.kode === 401, 'token raksasa ditolak sebelum dikirim ke mana pun')
  assert(rpcDipanggil === 0, 'juga tanpa perjalanan ke basis data')
}

// ── 3. Izin tamu JAUH lebih sempit daripada izin pengguna ───────────────
//
// Tautan WhatsApp diteruskan orang. Yang memegangnya cuma perlu membaca satu
// lembar invoice — bukan seluruh katalog Google atas tanggungan kami.
{
  const res = await kirim({ ...FOTO, model: 'gemini-2.5-pro' }, TOKEN_HIDUP)
  assert(res.kode === 400, 'jalur Pro tidak dibuka untuk tamu — tarif tokennya berlipat')
  assert(dipanggilGoogle === 0, 'dan tidak sempat sampai ke Google')
}
{
  const res = await kirim({ ...FOTO, model: 'gemini-2.5-flash-image' }, TOKEN_HIDUP)
  assert(res.kode === 400, 'model gambar juga tidak — di situ tarifnya melonjak')
}
{
  const res = await kirim({ ...FOTO, model: 'gemini-2.5-flash-preview-tts' }, TOKEN_HIDUP)
  assert(res.kode === 400, 'model suara juga tidak')
}
{
  const res = await kirim({ aksi: 'daftarModel' }, TOKEN_HIDUP)
  assert(res.kode === 403, 'katalog model bukan urusan tamu')
  assert(dipanggilGoogle === 0, 'dan tidak diteruskan')
}
{
  // Muatan raksasa membakar kuota kami tanpa menghasilkan apa pun.
  const besar = { model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [
    { inlineData: { data: 'A'.repeat(5_000_000), mimeType: 'image/jpeg' } },
  ] }] }
  const res = await kirim(besar, TOKEN_HIDUP)
  assert(res.kode === 413, 'badan yang kelewat besar ditolak')
  assert(dipanggilGoogle === 0, 'sebelum menyentuh Google')
  assert(/terlalu besar/i.test(res.badan), 'dengan kalimat yang bisa dikerjakan vendornya')
}

// ── 4. Pengguna yang sudah masuk tidak ikut terbatasi ───────────────────
//
// Pagar tamu tidak boleh bocor ke jalur utama: Chat AI memakai model yang sama
// dan sesekali model gambar, dan mempersempitnya diam-diam akan mematikan
// fitur yang tidak ada hubungannya dengan invoice.
{
  globalThis.fetch = async (url, opsi) => {
    const u = String(url)
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200 }
    dimintaKeGoogle = JSON.parse(opsi.body)
    return {
      ok: true, status: 200, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ candidates: [] }),
    }
  }
  const res = buatRes()
  await handler({ method: 'POST', headers: { authorization: 'Bearer sesi-sah' },
    body: { model: 'gemini-2.5-pro', contents: [] } }, res)
  assert(res.kode === 200, 'pengguna yang sudah masuk tetap boleh memakai Pro')
}

console.log(`invoice-tamu: ${ok} assert lulus`)
