// Test pembacaan surat jalan/nota: penguraian jawaban model, angka & tanggal
// yang ditulis sesuai kebiasaan Indonesia.
import {
  uraiHasilDo, angkaLonggar, tanggalLonggar, instruksiBacaDo, HASIL_KOSONG,
} from '../src/lib/ai-do.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── angkaLonggar ───────────────────────────────────────────────────────────
assert(angkaLonggar(50) === 50, 'angka apa adanya')
assert(angkaLonggar('50') === 50, 'teks angka')
assert(angkaLonggar('1.250') === 1250, 'titik sebagai pemisah ribuan (kebiasaan Indonesia)')
assert(angkaLonggar('1.250.000') === 1250000, 'ribuan bertingkat')
assert(angkaLonggar('1,5') === 1.5, 'koma sebagai desimal')
assert(angkaLonggar('1.250,75') === 1250.75, 'ribuan titik + desimal koma')
assert(angkaLonggar('50 sak') === 50, 'satuan yang ikut tertulis diabaikan')
assert(angkaLonggar('Rp 65.000') === 65000, 'awalan Rp diabaikan')
assert(angkaLonggar('') === 0, 'kosong jadi nol')
assert(angkaLonggar(null) === 0, 'null jadi nol')
assert(angkaLonggar(undefined) === 0, 'undefined jadi nol')
assert(angkaLonggar('abc') === 0, 'bukan angka jadi nol')
assert(angkaLonggar(NaN) === 0, 'NaN jadi nol')
assert(angkaLonggar(Infinity) === 0, 'Infinity jadi nol')

// ── tanggalLonggar ─────────────────────────────────────────────────────────
assert(tanggalLonggar('2026-07-27') === '2026-07-27', 'bentuk ISO')
assert(tanggalLonggar('2026-07-27T10:00:00Z') === '2026-07-27', 'ISO dengan jam dipotong')
assert(tanggalLonggar('27/07/2026') === '2026-07-27', 'hari/bulan/tahun')
assert(tanggalLonggar('27-07-2026') === '2026-07-27', 'pemisah tanda hubung')
assert(tanggalLonggar('27.07.2026') === '2026-07-27', 'pemisah titik')
assert(tanggalLonggar('7/7/2026') === '2026-07-07', 'satu digit')
assert(tanggalLonggar('27/07/26') === '2026-07-27', 'tahun dua digit')
assert(tanggalLonggar('') === null, 'kosong')
assert(tanggalLonggar(null) === null, 'null')
assert(tanggalLonggar('bukan tanggal') === null, 'teks bebas')
assert(tanggalLonggar('32/07/2026') === null, 'tanggal 32 ditolak')
assert(tanggalLonggar('27/13/2026') === null, 'bulan 13 ditolak')
assert(tanggalLonggar('31/02/2026') === null, '31 Februari ditolak, bukan digeser ke Maret')

// ── uraiHasilDo ────────────────────────────────────────────────────────────
const polos = uraiHasilDo(JSON.stringify({
  nomor_do: 'SJ-001', nomor_nota: 'INV-99', tanggal_nota: '2026-07-27',
  items: [{ nama: 'Semen Portland', satuan: 'sak', qty: 50 }], catatan: 'diterima utuh',
}))
assert(polos.nomor_do === 'SJ-001' && polos.nomor_nota === 'INV-99', 'nomor terbaca')
assert(polos.tanggal_nota === '2026-07-27', 'tanggal terbaca')
assert(polos.items.length === 1 && polos.items[0].qty === 50, 'barang terbaca')
assert(polos.catatan === 'diterima utuh', 'catatan terbaca')

// Model hampir selalu membungkus dengan pagar kode atau mendahului dengan
// kalimat pengantar — keduanya harus tetap terbaca.
const berpagar = uraiHasilDo('Berikut hasilnya:\n```json\n{"nomor_do":"SJ-2","items":[]}\n```\nSemoga membantu.')
assert(berpagar.nomor_do === 'SJ-2', 'JSON di dalam pagar kode terbaca')
const tanpaPagar = uraiHasilDo('Ini datanya {"nomor_do":"SJ-3","items":[]} selesai.')
assert(tanpaPagar.nomor_do === 'SJ-3', 'JSON di tengah kalimat terbaca')
assert(uraiHasilDo('```\n{"nomor_do":"SJ-4","items":[]}\n```').nomor_do === 'SJ-4',
  'pagar tanpa penanda bahasa')

// Angka & tanggal di dalam JSON ikut dinormalkan.
const longgar = uraiHasilDo(JSON.stringify({
  tanggal_nota: '27/07/2026',
  items: [{ nama: 'Besi', satuan: 'btg', qty: '1.250' }],
}))
assert(longgar.tanggal_nota === '2026-07-27', 'tanggal gaya Indonesia dinormalkan')
assert(longgar.items[0].qty === 1250, 'qty dengan pemisah ribuan dinormalkan')

// Jawaban rusak tidak boleh melempar galat — pengisian manual harus tetap bisa.
for (const rusak of ['', null, undefined, 'maaf saya tidak bisa membaca', '{rusak', '[]', '{}']) {
  const h = uraiHasilDo(rusak)
  assert(Array.isArray(h.items), `jawaban rusak (${JSON.stringify(rusak)}) tetap menghasilkan bentuk yang utuh`)
  assert(h.tanggal_nota === null || typeof h.tanggal_nota === 'string', 'tanggal bertipe benar')
}
assert(uraiHasilDo('bukan json').items.length === 0, 'tanpa JSON hasilnya kosong')

// Baris tanpa nama dibuang; qty nol dipertahankan sebagai penanda belum kirim.
const kotor = uraiHasilDo(JSON.stringify({
  items: [
    { nama: 'Semen', satuan: 'sak', qty: 10 },
    { nama: '', satuan: 'sak', qty: 99 },
    { nama: '   ', qty: 5 },
    { nama: 'Besi', satuan: 'btg', qty: 0 },
    { nama: 'Pasir', satuan: 'm3', qty: -3 },
  ],
}))
assert(kotor.items.length === 3, 'baris tanpa nama dibuang')
assert(kotor.items.map(i => i.nama).join(',') === 'Semen,Besi,Pasir', 'sisanya urut sesuai dokumen')
assert(kotor.items[1].qty === 0, 'qty nol dipertahankan')
assert(kotor.items[2].qty === 0, 'qty negatif dijadikan nol')

// items bukan larik tidak boleh membuat modul ini gagal.
assert(uraiHasilDo('{"items":"bukan larik"}').items.length === 0, 'items bertipe salah diabaikan')
assert(uraiHasilDo('{"items":[null,3,"x"]}').items.length === 0, 'isi items yang bukan objek diabaikan')

// HASIL_KOSONG tidak boleh ikut termutasi lewat hasil kembalian.
uraiHasilDo('').items.push({ nama: 'x', satuan: '', qty: 1 })
assert(HASIL_KOSONG.items.length === 0, 'HASIL_KOSONG tetap kosong')

// ── instruksiBacaDo ────────────────────────────────────────────────────────
const ins = instruksiBacaDo(['Semen Portland', 'Besi D13'])
assert(ins.includes('nomor_do'), 'bentuk JSON disebut di instruksi')
assert(ins.includes('Semen Portland') && ins.includes('Besi D13'), 'nama barang PO ikut jadi acuan')
assert(/BENAR-BENAR DIKIRIM/i.test(ins), 'ditegaskan qty kirim, bukan qty pesan')
assert(/jangan mengarang/i.test(ins), 'model diminta tidak mengarang angka')
assert(!instruksiBacaDo([]).includes('Barang yang dipesan'), 'tanpa acuan, bagian itu tidak dicetak')
assert(!instruksiBacaDo(['', null]).includes('- \n'), 'nama kosong tidak jadi butir acuan')

console.log(`✅ aiDo: ${ok} assertion lolos`)
