// Test pemilihan model dari katalog Google.
import {
  versiModel, jalurModel, layakPercakapan, flashTerbaik, lebihBaru,
  modelPilihan, simpanModelPilihan, urutanModel,
} from '../src/lib/pilihanModel.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// Katalog nyata dari kunci pemakainya — 42 model, sebagiannya terlihat di layar.
const KATALOG = [
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001', 'gemini-2.0-flash-lite',
  'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts',
  'gemma-4-26b-a4b-it', 'gemma-4-31b-it',
  'gemini-flash-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash-image', 'text-embedding-004',
]

// ── Inti: nama model dibaca dari katalog, bukan ditebak ─────────────────
//
// Dua tebakan sudah merugikan: "Gemini 3 tidak ada" ternyata keliru, dan
// `gemini-3-flash` yang ditaruh di depan membuat setiap pesan mengetuk nama
// yang belum tentu ada lalu menunggu penolakan.
{
  assert(flashTerbaik(KATALOG) === 'gemini-2.5-flash',
    `dari katalog itu, Flash terbaik yang PASTI ada: ${flashTerbaik(KATALOG)}`)
}
{
  // Begitu Google merilis Gemini 3 Flash, katalognya berubah dan pilihannya
  // ikut — tanpa satu baris kode pun diubah, dan tanpa menebak namanya.
  const baru = [...KATALOG, 'gemini-3-flash-preview']
  assert(flashTerbaik(baru) === 'gemini-3-flash-preview',
    'versi lebih tinggi menang begitu ia benar-benar muncul di katalog')
}
{
  const baru = [...KATALOG, 'gemini-3-flash']
  assert(flashTerbaik(baru) === 'gemini-3-flash', 'nama yang lebih ringkas menang di versi sama')
}

// ── Yang TIDAK boleh terpilih ───────────────────────────────────────────
{
  const t = flashTerbaik(KATALOG)
  assert(!/tts/.test(t), 'model text-to-speech bukan untuk membaca nota')
  assert(!/-image/.test(t), 'model gambar bukan untuk percakapan — dan jauh lebih mahal')
  assert(!/-lite/.test(t), 'varian lite kualitas bacanya di bawah Flash biasa')
  assert(!/^gemma/.test(t), 'Gemma bukan Gemini')
  assert(jalurModel(t) === 'flash', 'dan tetap di jalur Flash, bukan Pro')
}
assert(layakPercakapan('gemini-2.5-flash-image') === false, 'model gambar ditolak')
assert(layakPercakapan('gemini-2.5-flash-preview-tts') === false, 'tts ditolak')
assert(layakPercakapan('text-embedding-004') === false, 'embedding ditolak')
assert(layakPercakapan('gemma-4-31b-it') === false, 'gemma ditolak')
assert(layakPercakapan('gemini-2.5-flash') === true, 'flash biasa diterima')
assert(layakPercakapan('') === false, 'kosong ditolak')
assert(layakPercakapan(null) === false, 'null aman')

// ── Pro tidak pernah menang sendiri ─────────────────────────────────────
//
// Tarif tokennya beberapa kali lipat, dan pemiliknya baru saja menanggung
// tagihan yang tidak ia lakukan. Naik ke Pro tetap bisa — dengan DIPILIH.
{
  assert(KATALOG.includes('gemini-2.5-pro'), 'prasyarat: Pro memang ada di katalog')
  assert(flashTerbaik(KATALOG) !== 'gemini-2.5-pro', 'tetapi tidak pernah terpilih otomatis')
  assert(flashTerbaik(['gemini-2.5-pro']) === null,
    'katalog berisi Pro saja pun tidak dipaksa — biarkan cadangan tetap yang bekerja')
}

// ── Alias "…-latest" hanya jalan terakhir ───────────────────────────────
{
  // Ia bisa berpindah ke model lain kapan saja tanpa ada yang memutuskan, dan
  // perpindahan diam-diam itulah yang sudah dua kali merepotkan di sini.
  assert(versiModel('gemini-flash-latest') === 99, 'alias dianggap paling baru…')
  assert(flashTerbaik(KATALOG) !== 'gemini-flash-latest', '…tetapi kalah dari nama yang pasti')
  assert(flashTerbaik(['gemini-flash-latest']) === 'gemini-flash-latest',
    'baru dipakai bila memang tidak ada nama pasti')
}

// ── Membaca versi & jalur ───────────────────────────────────────────────
assert(versiModel('gemini-3-flash') === 3, 'versi bulat terbaca')
assert(versiModel('gemini-2.5-flash') === 2.5, 'versi desimal terbaca')
assert(versiModel('gemma-4-31b-it') === 0, 'yang bukan gemini tidak diberi versi')
assert(versiModel('') === 0, 'kosong nol')
assert(versiModel(null) === 0, 'null aman')
assert(jalurModel('gemini-2.5-pro') === 'pro', 'jalur pro dikenali')
assert(jalurModel('gemma-4-31b-it') === 'lain', 'yang lain dikenali')

// ── "Ini kenaikan atau bukan" ───────────────────────────────────────────
assert(lebihBaru('gemini-3-flash', 'gemini-2.5-flash') === true, '3 lebih baru dari 2.5')
assert(lebihBaru('gemini-2.5-flash', 'gemini-3-flash') === false, 'dan tidak sebaliknya')
assert(lebihBaru('gemini-2.5-pro', 'gemini-2.5-flash') === false,
  'versi sama bukan kenaikan — berpindah tanpa alasan menukar yang terbukti dengan yang belum')
assert(lebihBaru('bukan-model', 'gemini-2.5-flash') === false, 'nama asing bukan kenaikan')

// ── Menyimpan pilihan ───────────────────────────────────────────────────
{
  const simpanan = new Map()
  globalThis.localStorage = {
    getItem: k => simpanan.get(k) ?? null,
    setItem: (k, v) => simpanan.set(k, v),
    removeItem: k => simpanan.delete(k),
  }
  assert(modelPilihan() === null, 'tanpa pilihan, null')

  simpanModelPilihan('gemini-3-flash-preview')
  assert(modelPilihan() === 'gemini-3-flash-preview', 'pilihan tersimpan')

  // Yang tidak layak tidak boleh tersimpan — model gambar di jalur percakapan
  // berarti tiap pesan biasa membayar tarif gambar.
  simpanModelPilihan('gemini-2.5-flash-image')
  assert(modelPilihan() === null, 'model gambar ditolak, dan pilihan lama ikut dibersihkan')

  simpanModelPilihan('gemini-2.5-flash')
  simpanModelPilihan('')
  assert(modelPilihan() === null, 'mengosongkan berarti kembali ke bawaan')
}
{
  // Tanpa localStorage sama sekali — jangan meledak, cukup tidak lengket.
  delete globalThis.localStorage
  assert(modelPilihan() === null, 'tanpa penyimpanan aman')
  simpanModelPilihan('gemini-3-flash')
  assert(modelPilihan() === null, 'dan menyimpannya pun tidak meledak')
}

// ── Urutan untuk jalur panas ────────────────────────────────────────────
const BAWAAN = ['gemini-2.5-flash', 'gemini-2.0-flash']
{
  const u = urutanModel(BAWAAN, 'gemini-3-flash-preview')
  assert(u[0] === 'gemini-3-flash-preview', 'pilihan admin dicoba lebih dulu')
  assert(u.includes('gemini-2.5-flash') && u.includes('gemini-2.0-flash'),
    'cadangan TIDAK PERNAH dibuang — model bisa dihentikan Google kapan saja, '
    + 'dan yang menyelamatkan saat itu adalah nama lama yang masih hidup')
  assert(u.length === 3, 'tanpa duplikat')
}
{
  const u = urutanModel(BAWAAN, 'gemini-2.5-flash')
  assert(u.length === 2, 'pilihan yang sudah ada di bawaan tidak digandakan')
  assert(u[0] === 'gemini-2.5-flash', 'dan tetap didahulukan')
}
assert(urutanModel(BAWAAN, null).join() === BAWAAN.join(), 'tanpa pilihan, urutan bawaan apa adanya')

console.log(`pilihan-model: ${ok} assert lulus`)
