// ============================================================
// Yang tertulis di baris belanja: NAMA BARANGNYA.
//
// Buku pengeluaran menampilkan `keterangan` sebagai judul tiap baris. Untuk
// nota yang diketik rapi itu kebetulan berisi nama barang; untuk yang lain ia
// hanya kalimat — "Pembelian alat kerja Noble Cove". Empat baris berturut-
// turut berbunyi sama, dan tidak ada satu pun cara mengetahui barang apa yang
// dibeli selain membuka notanya.
//
// Padahal nama barangnya SUDAH tersimpan di `namaMaterial` sejak awal. Yang
// keliru hanya kolom mana yang ditampilkan.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  judulBaris, anakJudul, tanpaNamaBarang, cocokPo, kalimatCocok, perluDilihat,
  kunciBarang, selisihBerarti,
} from '../src/lib/namaBelanja.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Nama barang MENANG atas keterangan ────────────────────────────
//
// Keterangan boleh berisi kalimat apa pun — dari mana barangnya, untuk
// pekerjaan apa, siapa yang membeli. Kalimat itu tidak menjawab pertanyaan
// yang sedang ditanyakan orang yang menggulir daftar ini: barang apa.
{
  assert(judulBaris({
    tipe: 'material', namaMaterial: 'Besi Ulir 16mm',
    keterangan: 'Pembelian alat kerja Noble Cove',
  }) === 'Besi Ulir 16mm', 'nama barang yang jadi judul')

  assert(judulBaris({ tipe: 'material', keterangan: 'Pembelian alat kerja' })
    === 'Pembelian alat kerja', 'tanpa nama barang: keterangan dipakai, bukan kosong')

  assert(judulBaris({ tipe: 'upah', namaTukang: 'Ujang', keterangan: 'Upah minggu 3' })
    === 'Ujang', 'baris upah: nama tukangnya')

  assert(judulBaris({}) === '(tanpa nama)', 'benar-benar kosong tetap terbaca')
  assert(judulBaris(null) === '(tanpa nama)', 'kosong aman')
  assert(judulBaris({ namaMaterial: '   ' }) === '(tanpa nama)', 'spasi saja bukan nama')
}

// ── 2. Keterangan TIDAK diulang di bawah judul ──────────────────────
//
// Ketika judulnya sendiri diambil dari keterangan — karena nama barangnya
// kosong — menampilkannya lagi membuat barisnya tampak seperti kesalahan
// render.
{
  assert(anakJudul({ namaMaterial: 'Besi Ulir 16mm', keterangan: 'Untuk pile cap' })
    === 'Untuk pile cap', 'keterangan tampil sebagai baris kedua')
  assert(anakJudul({ keterangan: 'Pembelian alat kerja' }) === '',
    'judul yang berasal dari keterangan tidak diulang di bawahnya')
  assert(anakJudul({ namaMaterial: 'Semen' }) === '', 'tanpa keterangan: kosong')
  assert(anakJudul(null) === '', 'kosong aman')
}

// ── 3. Baris material tanpa nama barang bisa ditandai ──────────────
//
// Dipakai mengajak memperbaikinya — bukan sebagai galat. Baris lama banyak
// yang begini dan semuanya tetap sah.
{
  assert(tanpaNamaBarang({ tipe: 'material', keterangan: 'Beli alat' }) === true, 'material tanpa nama')
  assert(tanpaNamaBarang({ tipe: 'material', namaMaterial: 'Semen' }) === false, 'ada namanya')
  assert(tanpaNamaBarang({ tipe: 'upah', keterangan: 'Upah' }) === false,
    'baris upah tidak pernah dituntut punya nama barang')
  assert(tanpaNamaBarang({ tipe: 'operasional' }) === false, 'operasional juga tidak')
  assert(tanpaNamaBarang(null) === false, 'kosong aman')
}

// ── 4. Kunci pembanding nama barang ────────────────────────────────
{
  assert(kunciBarang('Besi Ulir 16mm') === kunciBarang('besi  ulir  16 mm'),
    'beda spasi & huruf besar dianggap sama')
  assert(kunciBarang('Triplek 9mm SPL') !== kunciBarang('Triplek 12mm SPL'),
    'ukuran berbeda tetap barang berbeda')
  assert(kunciBarang(null) === '', 'kosong aman')
}

// ── 5. Cocokkan ke PO lewat surat jalan ────────────────────────────
const dos = [{ id: 'd1', po_id: 'po1', nomor_do: 'DO/1', nomor_nota: 'A40637' }]
const pos = [{
  id: 'po1', nomor: 'PO/015/08/2026',
  items: [
    { nama: 'Besi Ulir 16mm', qty: 52, satuan: 'batang', harga: 198000, subtotal: 10296000 },
    { nama: 'Kawat Ikat', qty: 5, satuan: 'roll', harga: 65000, subtotal: 325000 },
  ],
}]
{
  const c = cocokPo({ doId: 'd1', namaMaterial: 'Besi Ulir 16mm', hargaSatuan: 198000 }, dos, pos)
  assert(c && c.nomor === 'PO/015/08/2026', 'PO-nya ketemu lewat doId')
  assert(c.item.nama === 'Besi Ulir 16mm', 'barangnya ketemu di PO')
  assert(c.selisih === 0, 'harganya sama')
  assert(kalimatCocok(c) === 'PO/015/08/2026',
    'yang cocok sempurna cukup menyebut nomornya — menandai semuanya membuat yang penting tenggelam')
  assert(perluDilihat(c) === false, 'tidak perlu diperhatikan')

  // Lewat nomor nota, bukan doId.
  const lewatNota = cocokPo({ nomorNota: 'A 40637', namaMaterial: 'Kawat Ikat' }, dos, pos)
  assert(lewatNota && lewatNota.item.nama === 'Kawat Ikat',
    'nota "A 40637" dan "A40637" adalah nota yang sama')
}

// ── 6. Harga nota berbeda dari PO: itu yang mau dilihat orang ──────
{
  const c = cocokPo({ doId: 'd1', namaMaterial: 'Besi Ulir 16mm', hargaSatuan: 210000 }, dos, pos)
  assert(c.selisih === 12000, 'selisihnya dihitung')
  assert(/lebih mahal/.test(kalimatCocok(c)), 'arahnya disebut')
  assert(/12.000/.test(kalimatCocok(c)), 'dan angkanya')
  assert(perluDilihat(c) === true, 'ditandai supaya terlihat sebelum dibayar')

  const murah = cocokPo({ doId: 'd1', namaMaterial: 'Besi Ulir 16mm', hargaSatuan: 190000 }, dos, pos)
  assert(/lebih murah/.test(kalimatCocok(murah)), 'lebih murah juga disebut, bukan diabaikan')
}

// ── 7. Selisih TIDAK dihitung bila salah satu sisinya kosong ──────
//
// Nol di salah satu sisi akan melahirkan "selisih" sebesar harga penuh —
// angka yang menakutkan dan tidak berarti apa-apa.
{
  assert(cocokPo({ doId: 'd1', namaMaterial: 'Besi Ulir 16mm' }, dos, pos).selisih === 0,
    'harga nota belum diisi: bukan selisih')
  const poTanpaHarga = [{ id: 'po1', nomor: 'PO/1', items: [{ nama: 'Semen', qty: 1, satuan: 'sak', harga: 0 }] }]
  assert(cocokPo({ doId: 'd1', namaMaterial: 'Semen', hargaSatuan: 70000 }, dos, poTanpaHarga).selisih === 0,
    'harga PO belum diisi: bukan selisih')
}

// ── 8. Barang di luar PO justru yang paling perlu dilihat ─────────
{
  const c = cocokPo({ doId: 'd1', namaMaterial: 'Paku 3 inci', hargaSatuan: 25000 }, dos, pos)
  assert(c && c.item === null, 'PO ketemu, barangnya tidak')
  assert(/tidak ada di PO/.test(kalimatCocok(c)), 'dikatakan terang-terangan')
  assert(perluDilihat(c) === true, 'dan ditandai')
}

// ── 9. Kecocokan PERSIS didahulukan ───────────────────────────────
//
// Dibalik urutannya, "Besi Beton 10mm" akan menempel pada "Besi Beton 12mm"
// hanya karena keduanya diawali huruf yang sama.
{
  const poDua = [{ id: 'po1', nomor: 'PO/1', items: [
    { nama: 'Besi Beton 12mm', qty: 1, satuan: 'btg', harga: 100000 },
    { nama: 'Besi Beton 10mm', qty: 1, satuan: 'btg', harga: 80000 },
  ] }]
  const c = cocokPo({ doId: 'd1', namaMaterial: 'Besi Beton 10mm', hargaSatuan: 80000 }, dos, poDua)
  assert(c.item.nama === 'Besi Beton 10mm', 'yang persis yang menang, bukan yang pertama mirip')
  assert(c.selisih === 0, 'sehingga harganya pun dibandingkan ke baris yang benar')
}

// ── 10. Tanpa tautan yang bisa dibuktikan, tidak menebak ──────────
//
// Nama toko sengaja tidak dipakai: satu vendor bisa memasok lima PO sekaligus,
// dan menempelkan PO yang salah jauh lebih buruk daripada tidak menempelkan
// apa-apa.
{
  assert(cocokPo({ namaSupplier: 'PT. MATA AIR SOLO', namaMaterial: 'Kawat Ikat' }, dos, pos) === null,
    'nama toko saja tidak cukup')
  assert(cocokPo({ doId: 'entah' }, dos, pos) === null, 'doId yang tidak ada')
  assert(cocokPo(null, dos, pos) === null, 'kosong aman')
  assert(cocokPo({ doId: 'd1' }, dos, []) === null, 'DO ketemu tapi PO-nya hilang')
  assert(kalimatCocok(null) === '', 'kosong aman')
  assert(perluDilihat(null) === false, 'kosong aman')
}

// ── 12. Selisih pembulatan TIDAK diributkan ────────────────────────
//
// Harga satuan di baris belanja sering hasil BAGI: Rp 10.300.000 ÷ 52 batang
// = Rp 198.077, sementara PO menuliskan Rp 198.000. Selisih Rp 77 itu
// pembulatan, bukan kelebihan tagihan — dan menandainya membuat hampir setiap
// baris menyala. Peringatan yang selalu menyala berhenti dibaca, dan yang
// hilang justru selisih yang benar-benar perlu ditanyakan.
//
// Ditemukan dengan menjalankan data yang bentuknya seperti data sungguhan,
// bukan angka bulat yang dikarang.
{
  const c = cocokPo(
    { doId: 'd1', namaMaterial: 'Besi Ulir 16mm', hargaSatuan: 198077 }, dos, pos)
  assert(c.selisih === 77, 'selisihnya tetap dihitung apa adanya')
  assert(perluDilihat(c) === false, 'tetapi tidak ditandai — itu pembulatan')
  assert(kalimatCocok(c) === 'PO/015/08/2026', 'kalimatnya cukup nomor PO-nya')

  // Dua syarat, keduanya harus terpenuhi.
  assert(selisihBerarti(12000, 198000) === true, 'Rp 12.000 dari Rp 198.000: berarti')
  assert(selisihBerarti(77, 198000) === false, 'Rp 77: pembulatan')
  assert(selisihBerarti(200, 200000) === false,
    'tanpa ambang rupiah, besi Rp 200.000 ribut karena selisih Rp 200')
  assert(selisihBerarti(5000, 5000) === true,
    'tanpa ambang persentase, barang Rp 5.000 yang naik dua kali lipat lolos')
  assert(selisihBerarti(-12000, 198000) === true, 'lebih murah pun diperiksa sama')
  assert(selisihBerarti(0, 198000) === false, 'tidak ada selisih')
  assert(selisihBerarti(5000, 0) === true, 'harga PO tidak diketahui: jangan diam-diam melewatkan')
  assert(selisihBerarti(null, null) === false, 'kosong aman')
}

// ── 11. Yang ditampilkan layar memang judulnya, bukan keterangan ──
{
  const akar = new URL('../src', import.meta.url).pathname
  const tab = readFileSync(join(akar, 'components/cost/TabRealisasiBiaya.tsx'), 'utf8')
  assert(/judulBaris\(e\)/.test(tab), 'kartu memakai judulBaris')
  assert(!/text-xs font-semibold text-navy truncate">\{e\.keterangan\}/.test(tab),
    'keterangan tidak lagi menjadi judul — itu yang membuat empat baris berbunyi sama')

  const ai = readFileSync(join(akar, 'lib/ai-realisasi.ts'), 'utf8')
  assert(/namaMaterial. WAJIB|WAJIB.*namaMaterial/s.test(ai),
    'model diminta selalu mengisi nama barang, karena di situlah asal baris tanpa nama')
}

console.log(`nama-belanja: ${ok} assert lulus`)
