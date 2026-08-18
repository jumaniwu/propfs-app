// ============================================================
// Mutu render dan harganya sebelum tombolnya ditekan.
//
// Berkas uji ini menjaga satu kejadian supaya tidak terulang. Pada 16 Agustus
// 2026 model gambar termahal disisipkan ke DEPAN satu-satunya daftar model
// gambar yang ada; sejak itu tiap render memakainya, tanpa seorang pun
// memutuskannya, dan halaman AI Billing mencatatnya Rp 0 karena namanya belum
// ada di tabel tarif. Yang pertama memberitahu adalah tagihan Google.
//
// Yang dijaga di sini, berurutan menurut seberapa mahal kalau dilanggar:
//
//   1. BAWAANNYA HEMAT. Mutu tinggi hanya lewat pilihan yang sadar.
//   2. MODEL YANG TIDAK DIKENAL DITEBAK KE ATAS, tidak pernah ke nol.
//   3. Harganya disebutkan sebelum tombolnya ditekan, berikut JUMLAH gambarnya.
// ============================================================
import {
  MUTU_BAWAAN, modelUntukMutu, modelPertama, perkiraanRender, pilihanMutu,
  rupiah, kalimatKonfirmasi, jauhLebihMahal, modelnyaMahal,
} from '../src/lib/mutuGambar.ts'
import { MODEL_GAMBAR, MODEL_GAMBAR_HEMAT, MODEL_GAMBAR_TINGGI } from '../src/lib/modelAi.ts'
import { tarifModel, hitungBiaya, TARIF_BAWAAN } from '../src/lib/biayaAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Bawaannya HEMAT — ini inti perbaikannya ────────────────────────────
assert(MUTU_BAWAAN === 'hemat', 'bawaannya hemat, bukan mutu tinggi')
assert(MODEL_GAMBAR[0] === 'gemini-2.5-flash-image',
  'daftar gambar bawaan dimulai dari Flash Image, BUKAN dari model Pro')
assert(!MODEL_GAMBAR.includes('gemini-3-pro-image-preview'),
  'model Pro tidak boleh ada di jalur bawaan sama sekali — itu yang dulu terjadi')
assert(modelPertama('hemat') === 'gemini-2.5-flash-image', 'mutu hemat memakai Flash Image')
assert(modelPertama('tinggi') === 'gemini-3-pro-image-preview', 'mutu tinggi memakai Pro')

// Jalur hemat tetap disambung di belakang jalur Pro: kalau model Pro belum
// tersedia pada kunci yang terpasang, rendernya tetap jadi.
assert(MODEL_GAMBAR_TINGGI.length > MODEL_GAMBAR_HEMAT.length, 'jalur tinggi punya cadangan')
for (const m of MODEL_GAMBAR_HEMAT) {
  assert(MODEL_GAMBAR_TINGGI.includes(m), `${m} tetap jadi cadangan di jalur tinggi`)
}
assert(modelUntukMutu('tinggi')[1] === MODEL_GAMBAR_HEMAT[0], 'cadangan pertamanya yang hemat')

// ── 2. Model tak dikenal DITEBAK KE ATAS, tidak pernah ke nol ──────────────
//
// Inilah cacat yang membuat lonjakannya tak terlihat: nama yang belum ada di
// tabel jatuh ke tarif bawaan yang perGambar-nya 0. Tabel tidak akan pernah
// mengejar penamaan Google, jadi yang tidak dikenali ditebak dari BENTUKnya.
{
  const pro = tarifModel('gemini-3-pro-image-preview')
  assert(pro.gambar === true, 'model Pro dikenali sebagai model gambar')
  assert(pro.perGambar > 0, 'dan tarif per gambarnya TIDAK NOL — ini yang dulu salah')
  assert(pro.perGambar > tarifModel('gemini-2.5-flash-image').perGambar,
    'lebih mahal daripada Flash Image, sesuai kenyataannya')

  // Nama yang belum pernah ada sama sekali.
  const besok = tarifModel('gemini-4-ultra-image-preview')
  assert(besok.gambar === true, 'model gambar yang belum terdaftar tetap dikenali dari namanya')
  assert(besok.perGambar > 0, 'dan tidak pernah dihitung Rp 0')

  const proTeks = tarifModel('gemini-4-pro')
  assert(proTeks.gambar === false, 'model teks Pro bukan model gambar')
  assert(proTeks.keluaran > TARIF_BAWAAN.keluaran, 'tapi tarifnya ditebak di atas Flash')

  // Yang biasa tetap seperti dulu.
  assert(tarifModel('gemini-2.5-flash').perGambar === 0, 'Flash teks tetap tanpa biaya gambar')
  assert(tarifModel('').perGambar === 0, 'nama kosong tidak mendadak jadi model gambar')
  assert(tarifModel(null).keluaran === TARIF_BAWAAN.keluaran, 'null jatuh ke tarif bawaan')

  assert(modelnyaMahal('gemini-3-pro-image-preview') === true, 'ditandai mahal')
  assert(modelnyaMahal('gemini-2.5-flash') === false, 'yang teks tidak ditandai mahal')
}

// ── 3. Satu ketukan = beberapa gambar berbayar, dan itu HARUS disebut ──────
{
  const satu = perkiraanRender('hemat', 1)
  const tiga = perkiraanRender('hemat', 3)
  assert(tiga.idr > satu.idr * 2.5, 'tiga sudut memang berlipat, bukan sedikit lebih mahal')
  assert(perkiraanRender('hemat', 0).idr === 0, 'nol sudut nol biaya')
  assert(perkiraanRender('hemat', -5).idr === 0, 'jumlah negatif tidak menghasilkan angka aneh')

  const tinggi = perkiraanRender('tinggi', 3)
  assert(tinggi.idr > tiga.idr, 'mutu tinggi memang lebih mahal')
  assert(tinggi.idrGambar > 0, 'dan bagian gambarnya terhitung, bukan nol')

  // Selisihnya harus cukup besar untuk pantas diperingatkan.
  assert(jauhLebihMahal(3) === true, 'selisih hemat vs tinggi pantas diperingatkan')
  assert(jauhLebihMahal(1) === true, 'juga untuk satu gambar')
}

// ── 4. Kalimat konfirmasi menyebut JUMLAH lebih dulu, lalu harga ──────────
//
// Yang paling sering mengejutkan orang bukan tarif per gambarnya, melainkan
// bahwa satu ketukan ternyata tiga kali bayar.
{
  const k = kalimatKonfirmasi('hemat', 3)
  assert(/3 sudut/.test(k), 'menyebut berapa sudut')
  assert(/3 gambar berbayar/.test(k), 'dan menegaskan itu 3 gambar BERBAYAR')
  assert(/Rp/.test(k), 'menyebut perkiraan rupiahnya')
  assert(/bukan tagihan resmi/i.test(k), 'jujur bahwa itu tarif daftar, bukan tagihan')
  assert(/Standar/.test(k), 'menyebut mutu yang sedang dipilih')
  assert(/Mutu Tinggi/.test(kalimatKonfirmasi('tinggi', 2)), 'begitu pula untuk mutu tinggi')
  assert(/minimal satu sudut/i.test(kalimatKonfirmasi('hemat', 0)),
    'nol sudut: menyuruh memilih, bukan menyebut Rp 0')
}

// ── 5. pilihanMutu: dua pilihan berdampingan, keduanya berharga ───────────
{
  const p = pilihanMutu(2)
  assert(p.length === 2, 'dua pilihan')
  assert(p[0].mutu === 'hemat', 'yang hemat lebih dulu — itu yang dianjurkan')
  assert(p.every(x => x.label && x.untuk), 'keduanya punya label dan keterangan pemakaian')
  assert(p.every(x => x.biaya.idr > 0), 'keduanya menyebut harga, tidak ada yang tampak gratis')
  assert(p[1].biaya.idr > p[0].biaya.idr, 'urutannya dari murah ke mahal')
  assert(p[0].model === 'gemini-2.5-flash-image' && p[1].model === 'gemini-3-pro-image-preview',
    'model yang disebut adalah yang benar-benar akan dipakai')
}

// ── 6. rupiah(): dibaca orang, bukan dibaca mesin ─────────────────────────
assert(rupiah(0) === 'Rp 0', 'nol')
assert(rupiah(1500) === 'Rp 1.500', 'ribuan bertitik')
assert(rupiah(1234567) === 'Rp 1.234.567', 'jutaan bertitik')
assert(rupiah(999) === 'Rp 999', 'di bawah seribu tanpa titik')
assert(rupiah('bukan angka') === 'Rp 0', 'masukan tak masuk akal tidak menghasilkan NaN')
assert(rupiah(null) === 'Rp 0', 'null aman')
assert(rupiah(-2500) === '-Rp 2.500', 'negatif tetap terbaca')

// ── 7. hitungBiaya tetap memisahkan gambar dari token ─────────────────────
{
  const b = hitungBiaya({ model: 'gemini-3-pro-image-preview', gambar: 3, tokenMasukan: 7800, tokenKeluaran: 150 })
  assert(b.idrGambar > 0, 'bagian gambarnya terpisah')
  assert(b.idr > b.idrGambar, 'dan tokennya ikut terhitung di atasnya')
  assert(b.perkiraan === true, 'selalu ditandai sebagai perkiraan')
}

console.log(`mutu-gambar: ${ok} assert lulus`)
