// Test perhitungan biaya panggilan AI, termasuk yang menghasilkan gambar.
import {
  TARIF, TARIF_BAWAAN, USD_KE_IDR, tarifModel, modelGambar,
  hitungBiaya, perkiraToken, perkiraBiayaGambar, rupiah,
} from '../src/lib/biayaAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, toleransi = 1e-9) => Math.abs(a - b) <= toleransi

// ── Inti keluhan: gambar TIDAK boleh dihitung sebagai token ──────────────
//
// Cacat lamanya: biaya dihitung per 1.000 token saja. Model gambar tidak
// ditagih per token keluaran — ia ditagih per gambar, dan satu gambar setara
// ribuan token. Jadi panggilan yang paling mahal justru yang paling meleset
// perkiraannya, dan meleset ke arah yang membuatnya tampak murah.
{
  const gambar = hitungBiaya({ model: 'gemini-2.5-flash-image', tokenMasukan: 1500, tokenKeluaran: 50, gambar: 1 })
  const teks   = hitungBiaya({ model: 'gemini-2.5-flash', tokenMasukan: 1500, tokenKeluaran: 50 })
  assert(gambar.idr > teks.idr * 50,
    `satu gambar puluhan kali lipat satu percakapan teks: ${gambar.idr} vs ${teks.idr}`)
  assert(gambar.idrGambar > 0, 'bagian gambar dipisahkan sendiri')
  assert(gambar.idrGambar > gambar.idr * 0.9,
    'dan bagian itulah yang mendominasi — inilah yang menjelaskan tagihan melonjak')
  assert(teks.idrGambar === 0, 'panggilan teks tidak punya bagian gambar')
}
{
  // Tanpa jumlah gambar, model gambar pun hanya ditagih tokennya.
  const a = hitungBiaya({ model: 'gemini-2.5-flash-image', tokenMasukan: 1000, tokenKeluaran: 100 })
  assert(a.idrGambar === 0, 'gambar yang tidak jadi dihasilkan tidak ditagih')
  assert(a.usd > 0, 'tetapi tokennya tetap terhitung')
}

// ── Hitungan token: per 1 JUTA, bukan per 1.000 ──────────────────────────
{
  const b = hitungBiaya({ model: 'gemini-2.5-flash', tokenMasukan: 1_000_000, tokenKeluaran: 0 })
  assert(dekat(b.usd, 0.30), `1 juta token masukan = USD 0,30 — dapat ${b.usd}`)
  assert(b.idr === Math.round(0.30 * USD_KE_IDR), 'rupiahnya ikut kurs yang sama')
}
{
  const b = hitungBiaya({ model: 'gemini-2.5-flash', tokenMasukan: 0, tokenKeluaran: 1_000_000 })
  assert(dekat(b.usd, 2.50), 'token keluaran memakai tarif keluaran, bukan tarif masukan')
}
{
  const b = hitungBiaya({ model: 'gemini-2.5-flash-image', gambar: 3, tokenMasukan: 0, tokenKeluaran: 0 })
  assert(dekat(b.usd, 3 * 0.039), 'tiga gambar = tiga kali tarif per gambar')
}

// ── Satu ketukan yang menghasilkan tiga gambar ───────────────────────────
//
// AI Architect merender satu gambar per sudut, dan tiga sudut sekaligus adalah
// pemakaian biasa. Yang terasa seperti "sekali tekan" sebenarnya tiga kali bayar.
{
  const satu = perkiraBiayaGambar('gemini-2.5-flash-image', 1)
  const tiga = perkiraBiayaGambar('gemini-2.5-flash-image', 3)
  // Toleransi 2 rupiah: pembulatan dilakukan sekali di akhir, bukan per gambar.
  assert(Math.abs(tiga.idrGambar - satu.idrGambar * 3) <= 2, 'tiga sudut memang tiga kali harga gambarnya')
  assert(tiga.idr > 1500, `dan angkanya nyata, bukan receh: ${rupiah(tiga.idr)}`)
  assert(tiga.perkiraan === true, 'selalu ditandai perkiraan — ini tarif daftar, bukan tagihan resmi')
}

// ── Tarif per MODEL, bukan per penyedia ──────────────────────────────────
//
// Cacat lama yang kedua: tarifnya dipatok per penyedia, padahal satu penyedia
// menjual model dengan harga yang berbeda-beda puluhan kali lipat.
assert(tarifModel('gemini-2.5-flash').keluaran !== tarifModel('gemini-2.0-flash').keluaran,
  'dua model dari penyedia yang sama punya tarif berbeda')
assert(modelGambar('gemini-2.5-flash-image') === true, 'model gambar dikenali')
assert(modelGambar('gemini-2.5-flash') === false, 'model teks tidak dikira model gambar')
assert(modelGambar('gemini-2.0-flash-preview-image-generation') === true,
  'model gambar yang lama juga dikenali')

// Model yang belum terdaftar tidak boleh dianggap gratis — menganggapnya nol
// persis cara sebuah tagihan bisa membengkak tanpa terlihat sama sekali.
{
  const t = tarifModel('gemini-9-yang-belum-ada')
  assert(t === TARIF_BAWAAN, 'model tak dikenal memakai tarif bawaan')
  assert(t.masukan > 0 && t.keluaran > 0, 'dan tarif bawaan itu bukan nol')
}
assert(tarifModel(null) === TARIF_BAWAAN, 'null aman')
assert(tarifModel(undefined) === TARIF_BAWAAN, 'undefined aman')
assert(tarifModel('  gemini-2.5-flash  ') === TARIF['gemini-2.5-flash'], 'spasi di tepi tidak menggagalkan')

// ── Masukan yang aneh tidak boleh melahirkan angka yang aneh ─────────────
assert(hitungBiaya({ model: 'gemini-2.5-flash' }).idr === 0, 'tanpa token, biayanya nol')
assert(hitungBiaya({ model: 'gemini-2.5-flash', tokenMasukan: -500 }).idr === 0, 'token negatif diabaikan')
assert(hitungBiaya({ model: 'gemini-2.5-flash-image', gambar: -2 }).idrGambar === 0, 'gambar negatif diabaikan')
assert(hitungBiaya({ model: 'gemini-2.5-flash', tokenMasukan: NaN }).idr === 0, 'NaN tidak menular')
assert(hitungBiaya({ model: 'gemini-2.5-flash-image', gambar: 2.7 }).idrGambar
  === hitungBiaya({ model: 'gemini-2.5-flash-image', gambar: 2 }).idrGambar,
  'gambar pecahan dibulatkan ke bawah — setengah gambar tidak pernah ada')
assert(hitungBiaya({}).idr === 0, 'objek kosong aman')
assert(hitungBiaya(null).idr === 0, 'null aman')

// ── Perkiraan token dari teks ────────────────────────────────────────────
assert(perkiraToken('') === 0, 'teks kosong nol token')
assert(perkiraToken(null) === 0, 'null aman')
assert(perkiraToken('x'.repeat(400)) === 100, '±4 karakter per token')
assert(perkiraToken('abc') === 1, 'sisa dibulatkan ke atas, bukan dibuang')

// ── Tampilan ─────────────────────────────────────────────────────────────
assert(rupiah(1900) === 'Rp 1.900', 'ribuan dipisah titik seperti kebiasaan di sini')
assert(rupiah(0) === 'Rp 0', 'nol tetap ditampilkan')
assert(rupiah(1900.6) === 'Rp 1.901', 'pecahan dibulatkan')
assert(rupiah(null) === 'Rp 0', 'null aman')
assert(rupiah('bukan angka') === 'Rp 0', 'teks aman')

// ── Perbandingan antar fitur: yang dicari ketika tagihan melonjak ────────
{
  // Inilah pertanyaan yang tidak terjawab selama ini: satu hari dengan banyak
  // render menghabiskan berapa dibanding satu hari penuh mengobrol.
  const seharianChat = hitungBiaya({ model: 'gemini-2.5-flash', tokenMasukan: 200_000, tokenKeluaran: 40_000 })
  const tigaPuluhRender = perkiraBiayaGambar('gemini-2.5-flash-image', 30)
  assert(tigaPuluhRender.idr > seharianChat.idr,
    `30 gambar (${rupiah(tigaPuluhRender.idr)}) melampaui chat seharian (${rupiah(seharianChat.idr)})`)
}

console.log(`biaya-ai: ${ok} assert lulus`)
