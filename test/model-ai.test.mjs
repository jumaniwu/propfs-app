// Test pemilihan model Gemini dari katalog Google.
import {
  MODEL_TEKS, MODEL_GAMBAR, MODEL_LEBIH_BAIK, saringModel, pilihModel, adaYangLebihBaik,
} from '../src/lib/modelAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// Pemeriksaan bentuk kunci pindah ke api/ai.ts bersama kuncinya. Di sana ia
// hanya menjelaskan penolakan, tidak menolak — bentuk kunci ditentukan Google
// dan bisa berubah kapan saja; memblokir berarti suatu hari menolak kunci yang
// sebenarnya sah.

// ── Menyaring balasan ListModels ─────────────────────────────────────────
const MENTAH = {
  models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-image', displayName: 'Nano Banana', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', displayName: 'Embedding 004', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
  ],
}
{
  const m = saringModel(MENTAH)
  assert(m.length === 3, `hanya yang bisa generateContent yang lolos: ${m.length}`)
  assert(!m.some(x => /embedding/.test(x.nama)), 'model embedding tidak ikut — ia tak menjawab pertanyaan ini')
  assert(m[0].nama === 'gemini-2.5-flash', 'awalan "models/" dibuang')
  assert(m[0].tampil === 'Gemini 2.5 Flash', 'nama bacaan dari Google dipakai')
  assert(m.find(x => x.nama === 'gemini-2.5-flash-image').gambar === true,
    'model gambar ditandai — dialah yang mahal')
  assert(m.find(x => x.nama === 'gemini-2.5-pro').gambar === false, 'model teks tidak salah ditandai')
}
{
  const tanpaNama = saringModel({ models: [{ supportedGenerationMethods: ['generateContent'] }] })
  assert(tanpaNama.length === 0, 'entri tanpa nama dilewati, bukan menghasilkan baris kosong')
}
{
  const m = saringModel({ models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }] })
  assert(m[0].tampil === 'gemini-x', 'tanpa displayName, namanya sendiri yang dipakai')
}
assert(saringModel(null).length === 0, 'null aman')
assert(saringModel({}).length === 0, 'balasan tanpa models aman')
assert(saringModel({ models: 'bukan array' }).length === 0, 'bentuk tak terduga aman')

// ── Memilih dari daftar keinginan ────────────────────────────────────────
{
  const tersedia = saringModel(MENTAH)
  assert(pilihModel(tersedia, MODEL_TEKS) === 'gemini-2.5-flash',
    'yang terpilih adalah keinginan pertama yang benar-benar tersedia')
  assert(pilihModel(tersedia, MODEL_GAMBAR) === 'gemini-2.5-flash-image',
    'untuk gambar, daftar keinginannya sendiri')

  // Model Pro TERSEDIA pada kunci ini, tetapi tidak boleh terpilih sendiri:
  // tarifnya beberapa kali lipat, dan menaikkan biaya adalah keputusan pemilik
  // tagihan — bukan efek samping dari sebuah daftar.
  assert(tersedia.some(m => m.nama === 'gemini-2.5-pro'), 'prasyarat: Pro memang ada di katalog')
  assert(!MODEL_TEKS.includes('gemini-2.5-pro'), 'Pro tidak masuk daftar pemakaian otomatis')
  assert(MODEL_LEBIH_BAIK.includes('gemini-2.5-pro'), 'ia terdaftar terpisah, untuk dipilih dengan sadar')

  // Nama yang belum tentu ada tidak boleh berada di jalur panas: ia diketuk
  // lebih dulu pada SETIAP pesan dan menunggu penolakan sebelum mencoba yang
  // benar-benar ada — satu perjalanan sia-sia untuk setiap panggilan.
  assert(MODEL_TEKS.every(m => /^gemini-2\./.test(m)),
    `jalur panas hanya berisi nama yang sudah pasti ada: ${MODEL_TEKS.join(', ')}`)
  assert(MODEL_LEBIH_BAIK.includes('gemini-3-flash'),
    'nama yang belum tentu ada dipindah ke daftar saran, bukan dihapus')
}
{
  // Nama yang sudah dihentikan tidak menggagalkan apa pun: ia cuma tidak terpilih.
  assert(pilihModel(['gemini-2.0-flash'], MODEL_TEKS) === 'gemini-2.0-flash',
    'kalau hanya yang lama tersedia, itu yang dipakai')
}
assert(pilihModel([], MODEL_TEKS) === null,
  'tak ada yang cocok dikatakan null — bukan ditutup dengan menebak nama lain')
assert(pilihModel(['models/gemini-2.5-flash'], MODEL_TEKS) === 'gemini-2.5-flash',
  'menerima nama yang masih berawalan models/')
assert(pilihModel(['sesuatu-yang-lain'], MODEL_TEKS) === null, 'nama asing tidak dipaksa cocok')

// ── "Bisa tidak naik ke model yang lebih pintar" ─────────────────────────
{
  const tersedia = saringModel(MENTAH)
  assert(adaYangLebihBaik(tersedia, 'gemini-2.5-flash') === 'gemini-2.5-pro',
    'Pro tersedia di katalog, jadi disebut sebagai saran — tetapi tetap tidak dipakai sendiri')
  assert(adaYangLebihBaik(['gemini-2.5-flash'], 'gemini-2.5-flash') === null,
    'kalau memang tidak ada yang lebih baik, tidak mengarang saran')
  assert(adaYangLebihBaik(tersedia, 'gemini-2.0-flash', MODEL_TEKS) === 'gemini-2.5-flash',
    'dibatasi ke jalur Flash, kenaikannya adalah Flash yang lebih baru')
  assert(adaYangLebihBaik(['gemini-2.0-flash'], 'gemini-2.0-flash') === null,
    'satu-satunya yang tersedia bukan kenaikan')
  assert(adaYangLebihBaik([], 'gemini-2.5-flash') === null, 'daftar kosong tidak mengarang saran')
}
{
  // Model yang sedang dipakai tetapi tidak ada di daftar keinginan dianggap
  // paling belakang — apa pun yang terdaftar terhitung kenaikan.
  assert(adaYangLebihBaik(['gemini-2.0-flash'], 'model-lama-entah-apa') === 'gemini-2.0-flash',
    'model tak dikenal diperlakukan sebagai paling belakang')
}

console.log(`model-ai: ${ok} assert lulus`)
