// ============================================================
// Melacak SATU FOTO dari ujung ke ujung, dan membuktikan ia sampai utuh.
//
// Sampai sekarang tiap perbaikan menyentuh satu bagian saja: kunci, wilayah
// server, ukuran foto, anggaran waktu. Yang belum pernah dibuktikan adalah
// pertanyaan yang sebenarnya: apakah BYTE FOTONYA benar-benar sampai ke Google
// dalam bentuk yang bisa dibaca.
//
// Berkas ini menjalankan handler /api/ai yang sungguhan dengan Google palsu,
// lalu memeriksa apa yang diterima Google — bukan apa yang kita kira dikirim.
// ============================================================
import handler from '../api/ai.ts'
import { jenisGalat, bisaDiulang } from '../src/lib/galatAi.ts'
import { diagnosaAi } from '../src/lib/diagnosaAi.ts'
import { MODEL_UTAMA } from '../src/lib/modelAi.ts'
import { byteBase64, ukuranTampil, BATAS_KIRIM } from '../src/lib/kompresFoto.ts'

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
const jawaban = (status, obj, teks) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: () => 'application/json' },
  text: async () => teks ?? JSON.stringify(obj),
  json: async () => obj,
})

process.env.SUPABASE_URL = 'https://contoh.supabase.co'
process.env.SUPABASE_ANON_KEY = 'anon-palsu'
process.env.GEMINI_API_KEY = 'AIza' + 'x'.repeat(35)

/** Foto nota tiruan: 95 KB, seukuran hasil pengecilan sungguhan. */
const FOTO_B64 = Buffer.from('JPEGPALSU'.repeat(11_000)).toString('base64')

/** Badan permintaan persis seperti yang disusun ai-realisasi.ts. */
const badanDenganFoto = () => ({
  model: MODEL_UTAMA,
  systemInstruction: { parts: [{ text: 'Kamu asisten keuangan proyek.' }] },
  contents: [{
    role: 'user',
    parts: [
      { text: 'Analisis lampiran ini dan ekstrak semua transaksi.' },
      { inlineData: { data: FOTO_B64, mimeType: 'image/jpeg' } },
    ],
  }],
  generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
})

// ── 1. Byte fotonya sampai ke Google, utuh, tanpa berubah ───────────────
{
  let diterimaGoogle = null
  globalThis.fetch = async (url, opsi) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, status: 200 }
    diterimaGoogle = JSON.parse(opsi.body)
    return jawaban(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
  }

  const res = buatRes()
  await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: badanDenganFoto() }, res)

  assert(res.kode === 200, 'permintaan berlampiran foto diteruskan')
  assert(diterimaGoogle !== null, 'Google memang dipanggil')

  const parts = diterimaGoogle.contents[0].parts
  const bagianFoto = parts.find(p => p.inlineData)
  assert(bagianFoto, 'bagian gambar ADA di badan yang diterima Google')
  assert(bagianFoto.inlineData.data === FOTO_B64,
    'dan byte-nya sama persis — tidak terpotong, tidak berubah')
  assert(bagianFoto.inlineData.mimeType === 'image/jpeg', 'mimeType-nya ikut, bukan hilang')
  assert(parts.some(p => p.text), 'teks perintahnya juga ikut')

  // `model` dipakai untuk memilih URL, dan TIDAK boleh ikut ke badan —
  // Google menolak medan yang tidak dikenalnya.
  assert(!('model' in diterimaGoogle), 'nama model tidak ikut mengotori badan permintaan')
  assert(diterimaGoogle.systemInstruction, 'instruksi sistem tetap terbawa')
  assert(diterimaGoogle.generationConfig, 'setelan generasi tetap terbawa')
}

// ── 2. Ukurannya masuk akal untuk satu permintaan ───────────────────────
{
  const byte = byteBase64(FOTO_B64)
  assert(byte < BATAS_KIRIM, `foto hasil pengecilan (${ukuranTampil(byte)}) jauh di bawah ambang kirim`)
  const seluruhBadan = JSON.stringify(badanDenganFoto()).length
  assert(seluruhBadan < 4_000_000,
    `seluruh badan permintaan (${ukuranTampil(seluruhBadan)}) muat di batas fungsi serverless`)
}

// ── 3. Beberapa foto sekaligus tetap utuh ───────────────────────────────
{
  let diterima = null
  globalThis.fetch = async (url, opsi) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, status: 200 }
    diterima = JSON.parse(opsi.body)
    return jawaban(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
  }
  const tiga = {
    model: MODEL_UTAMA,
    contents: [{
      role: 'user',
      parts: [
        { text: 'Tiga nota sekaligus' },
        { inlineData: { data: 'AAAA', mimeType: 'image/jpeg' } },
        { inlineData: { data: 'BBBB', mimeType: 'image/png' } },
        { inlineData: { data: 'CCCC', mimeType: 'application/pdf' } },
      ],
    }],
  }
  await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: tiga }, buatRes())
  const parts = diterima.contents[0].parts.filter(p => p.inlineData)
  assert(parts.length === 3, 'ketiga lampiran sampai, tidak ada yang tercecer')
  assert(parts.map(p => p.inlineData.data).join() === 'AAAA,BBBB,CCCC', 'urutannya terjaga')
  assert(parts[2].inlineData.mimeType === 'application/pdf',
    'PDF diteruskan sebagai PDF — Gemini memang bisa membacanya langsung')
}

// ── 4. Badan terlalu besar: 413 dari Vercel, bukan dari Google ──────────
//
// Fungsi serverless membatasi ukuran badan permintaan. Kelebihannya dijawab
// dengan 413 berupa HALAMAN HTML, bukan JSON — dan halaman itu tidak menyebut
// ukuran sama sekali. Bila 413 tidak dikenali, ia jatuh ke kategori "lain"
// yang LAYAK DIULANG: foto yang terlalu besar akan dikirim ulang berkali-kali,
// masing-masing sampai batas waktunya, dan tak satu pun akan berhasil.
{
  const HTML_413 = '<!DOCTYPE html><html><head><title>413: FUNCTION_PAYLOAD_TOO_LARGE</title>'
    + '</head><body><h1>413</h1><p>FUNCTION_PAYLOAD_TOO_LARGE</p></body></html>'
  assert(jenisGalat(`413 ${HTML_413}`) === 'ukuran',
    '413 dikenali sebagai masalah ukuran')
  assert(bisaDiulang('ukuran') === false,
    'dan TIDAK diulang — foto yang sama akan selalu terlalu besar')

  const dg = diagnosaAi(413, HTML_413)
  assert(dg.sebab === 'terlalu_besar', 'diagnosisnya menyebut ukuran')
  assert(/foto/i.test(dg.perbaikan), 'dengan langkah yang bisa dikerjakan pemakainya')
  assert(!/JSON|DOCTYPE|<html/i.test(dg.apa + dg.perbaikan), 'tanpa memuntahkan HTML ke layar')
}

// ── 5. Google menolak gambarnya: sebabnya harus sampai ke layar ─────────
{
  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, status: 200 }
    return jawaban(400, {
      error: {
        code: 400, status: 'INVALID_ARGUMENT',
        message: 'Unable to process input image. Please retry or report in https://developers.generativeai.google/guide/troubleshooting',
      },
    })
  }
  const res = buatRes()
  await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: badanDenganFoto() }, res)

  assert(res.kode === 400, 'penolakan Google diteruskan apa adanya')
  assert(res.badan.includes('Unable to process input image'),
    'beserta kalimatnya — di situlah sebabnya tertulis')
  const dg = diagnosaAi(res.kode, res.badan)
  assert(dg.sebab === 'gambar_ditolak', 'dikenali sebagai gambar yang tidak terbaca')
  assert(/foto/i.test(dg.perbaikan), 'dan diberi langkah yang masuk akal')
}

console.log(`jalur-foto: ${ok} assert lulus`)
