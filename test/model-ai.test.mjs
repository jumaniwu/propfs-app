// Test pemeriksaan bentuk kunci & pemilihan model Gemini.
import {
  MODEL_TEKS, MODEL_GAMBAR, MODEL_PREMIUM, periksaKunci, saringModel, pilihModel, adaYangLebihBaik,
} from '../src/lib/modelAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Inti keluhan: token yang salah jenis ditolak SEBELUM dikirim ─────────
//
// Google memakai beberapa kredensial yang serupa sekilas, dan hanya API key
// yang berlaku di Generative Language API. Token OAuth ditolak dengan 401/403
// — bunyinya sama persis dengan kunci sah yang belum diizinkan. Tanpa
// pemeriksaan ini, waktunya habis membetulkan izin, penagihan, dan pembatasan
// domain untuk kunci yang memang tidak akan pernah dipakai.
{
  // Bentuk token sesi Google — jenis kredensial yang benar-benar sempat
  // dicoba dipasang sebagai kunci Gemini. Nilainya dikarang; yang diuji
  // bentuknya, dan kredensial sungguhan tidak pernah masuk ke repositori.
  const p = periksaKunci('AQ.' + 'Ab8' + 'X'.repeat(48))
  assert(p.bentuk === 'oauth', 'token berawalan AQ. dikenali sebagai token sesi, bukan API key')
  assert(p.layak === false, 'dan tidak dikirim ke Google sama sekali')
  assert(/AIzaSy/.test(p.pesan), 'pesannya menyebut bentuk yang benar')
  assert(/39/.test(p.pesan), 'beserta panjangnya, supaya bisa diperiksa sendiri')
}
assert(periksaKunci('ya29.a0AfH6SMBx-contoh-token-akses-oauth-google').bentuk === 'oauth',
  'access token OAuth juga dikenali')
assert(periksaKunci('1//0gContohRefreshTokenGoogleYangPanjang').bentuk === 'oauth',
  'refresh token juga dikenali')

// ── Kunci yang benar diteruskan ──────────────────────────────────────────
{
  // 'AIza' + 35 karakter = 39.
  const sah = 'AIza' + 'B1abcdefghijklmnopqrstuvwxyz0123456'
  assert(sah.length === 39, `contoh kuncinya memang 39 karakter: ${sah.length}`)
  const p = periksaKunci(sah)
  assert(p.bentuk === 'api_key', 'API key yang benar dikenali')
  assert(p.layak === true, 'dan boleh dikirim')
}
{
  // Spasi di tepi hasil salin-tempel tidak boleh menggagalkan kunci yang sah.
  const p = periksaKunci('  AIza' + 'B1abcdefghijklmnopqrstuvwxyz0123456' + '\n')
  assert(p.layak === true, 'spasi & baris baru dari salin-tempel dirapikan dulu')
}

// ── Kunci yang salah dengan cara lain ────────────────────────────────────
assert(periksaKunci('').bentuk === 'bukan_kunci', 'kosong dikatakan kosong')
assert(periksaKunci(null).layak === false, 'null aman')
{
  const p = periksaKunci('AIzaSyB1abc')
  assert(p.bentuk === 'terlalu_pendek', 'kunci yang tersalin sebagian dikenali')
  assert(/11 karakter/.test(p.pesan), 'panjangnya disebut supaya jelas kurang berapa')
}
{
  const p = periksaKunci('sk-proj-inikunciopenaiyangpanjangsekaliyabukanmilikgoogle')
  assert(p.bentuk === 'bukan_kunci', 'kunci penyedia lain tidak diterima')
  assert(p.layak === false, 'dan tidak dikirim')
}

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
  assert(MODEL_PREMIUM.includes('gemini-2.5-pro'), 'ia terdaftar terpisah, untuk dipilih dengan sadar')
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
  assert(adaYangLebihBaik(tersedia, 'gemini-2.5-flash') === null,
    'sudah memakai Flash terbaru yang tersedia = tidak ada saran kenaikan')
  assert(adaYangLebihBaik(tersedia, 'gemini-2.0-flash') === 'gemini-2.5-flash',
    'dari Flash lama ke Flash baru memang kenaikan, dan namanya disebut')
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
