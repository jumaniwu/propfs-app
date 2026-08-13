// ============================================================
// Tagihan yang dikirim vendor sendiri.
//
// Yang diuji di sini bukan "fungsinya jalan", melainkan hal-hal yang bila
// salah TIDAK TERLIHAT SALAH di layar: titik ribuan yang terbaca sebagai
// desimal, tanggal 03/04 yang terbaca sebagai 3 April atau 4 Maret, dan
// tagihan yang berbeda dari PO-nya tetapi terlihat sama.
// ============================================================
import {
  angkaRupiah, tanggalIso, bersihkanItem, uraikanInvoiceAi, hitungTotalInvoice,
  bandingkanDenganPo, statusDariSelisih, siapDikirim, perintahBacaInvoice,
  INVOICE_KOSONG, LABEL_STATUS_INVOICE, TONE_STATUS_INVOICE,
} from '../src/lib/invoiceVendor.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Angka: titik ribuan Indonesia ────────────────────────────────────
//
// "1.160.000" yang terbaca sebagai 1,16 tetap terlihat seperti angka yang
// masuk akal di layar — dan selisihnya sejuta.
assert(angkaRupiah('Rp 1.160.000') === 1160000, 'rupiah dengan titik ribuan')
assert(angkaRupiah('1.160.000') === 1160000, 'titik ribuan tanpa Rp')
assert(angkaRupiah('1160000') === 1160000, 'polos')
assert(angkaRupiah(1160000) === 1160000, 'sudah angka')
assert(angkaRupiah('58.000') === 58000, 'tiga angka di belakang titik = ribuan, bukan desimal')
assert(angkaRupiah('1.234.567,50') === 1234567.5, 'koma desimal Indonesia terbaca')
assert(angkaRupiah('1,234,567.50') === 1234567.5, 'bentuk Inggris pun terbaca')
assert(angkaRupiah('12,5') === 12.5, 'desimal pendek')
assert(angkaRupiah('') === 0, 'kosong nol')
assert(angkaRupiah(null) === 0, 'null aman')
assert(angkaRupiah('bukan angka') === 0, 'teks bukan angka jadi nol, bukan NaN')
assert(angkaRupiah(NaN) === 0, 'NaN tidak lolos')

// ── 2. Tanggal: hari-bulan, bukan bulan-hari ────────────────────────────
//
// Nota Indonesia hampir selalu dd/mm. Membacanya terbalik menggeser jatuh
// tempo tanpa ada yang salah terlihat.
assert(tanggalIso('03/04/2026') === '2026-04-03', '03/04 = 3 April, bukan 4 Maret')
assert(tanggalIso('13-08-2026') === '2026-08-13', 'pemisah strip')
assert(tanggalIso('13.8.26') === '2026-08-13', 'tahun dua angka & bulan satu angka')
assert(tanggalIso('2026-08-13') === '2026-08-13', 'yang sudah ISO dibiarkan')
assert(tanggalIso('2026-08-13T10:00:00Z') === '2026-08-13', 'ISO berjam dipotong')
assert(tanggalIso('32/01/2026') === '', 'tanggal mustahil ditolak, bukan digeser')
assert(tanggalIso('13/13/2026') === '', 'bulan mustahil ditolak')
assert(tanggalIso('') === '' && tanggalIso(null) === '', 'kosong & null aman')

// ── 3. Membaca balasan AI ───────────────────────────────────────────────
const BALASAN_AI = `Baik, saya sudah membaca invoicenya.

\`\`\`json
{
  "nomor_invoice": "INV/2026/0123",
  "tanggal": "13/08/2026",
  "jatuh_tempo": "2026-09-12",
  "items": [
    { "nama": "Semen Portland 50kg", "satuan": "sak", "qty": 20, "harga": "58.000", "subtotal": "1.160.000" },
    { "nama": "Besi Beton 10mm", "satuan": "btg", "qty": 15, "harga": 82000, "subtotal": 1230000 }
  ],
  "subtotal": "2.390.000",
  "ppn": 0,
  "total": "2.390.000"
}
\`\`\``
{
  const inv = uraikanInvoiceAi(BALASAN_AI)
  assert(inv, 'blok JSON di dalam balasan berteks tetap terbaca')
  assert(inv.nomor_invoice === 'INV/2026/0123', 'nomor invoice terbaca')
  assert(inv.tanggal === '2026-08-13', 'tanggal dinormalkan ke ISO')
  assert(inv.items.length === 2, 'dua baris barang')
  assert(inv.items[0].harga === 58000, 'harga bertitik ribuan terbaca sebagai 58.000')
  assert(inv.items[0].subtotal === 1160000, 'begitu pula subtotalnya')
  assert(inv.total === 2390000, 'total terbaca')
}
{
  // Blok tanpa pagar — model sering melewatkannya.
  const inv = uraikanInvoiceAi('{"nomor_invoice":"A1","items":[],"total":5000}')
  assert(inv && inv.total === 5000, 'JSON telanjang tetap terbaca')
}
{
  // Total yang tidak disebut dihitung dari isinya, bukan dibiarkan nol —
  // tagihan bertotal nol akan lolos pemeriksaan sebagai "tidak ada apa-apa".
  const inv = uraikanInvoiceAi('{"items":[{"nama":"Pasir","qty":2,"harga":300000}]}')
  assert(inv.items[0].subtotal === 600000, 'subtotal dihitung bila tidak tertulis')
  assert(inv.total === 600000, 'dan totalnya ikut')
}
assert(uraikanInvoiceAi('tidak ada json sama sekali') === null, 'tanpa JSON menghasilkan null')
assert(uraikanInvoiceAi('```json\n{rusak\n```') === null, 'JSON rusak menghasilkan null, bukan meledak')
assert(uraikanInvoiceAi('') === null && uraikanInvoiceAi(null) === null, 'kosong & null aman')
{
  // Subtotal yang TERTULIS dipercaya, tidak dihitung ulang: nota sering
  // memuat potongan atau pembulatan yang hilang bila qty x harga dipaksakan.
  const it = bersihkanItem({ nama: 'Cat', qty: 3, harga: 100000, subtotal: 280000 })
  assert(it.subtotal === 280000, 'potongan pada subtotal tidak dihapus diam-diam')
}
assert(bersihkanItem({}).satuan === 'unit', 'satuan kosong diberi bawaan')
assert(bersihkanItem(null).nama === '', 'item null aman')

// ── 4. INTI FITURNYA: tagihan dibandingkan dengan PO ────────────────────
const PO_ITEMS = [
  { nama: 'Semen Portland 50kg', satuan: 'sak', qty: 20, harga: 58000, subtotal: 1160000 },
  { nama: 'Besi Beton 10mm', satuan: 'btg', qty: 15, harga: 82000, subtotal: 1230000 },
]
const PO_TOTAL = 2390000
{
  const inv = uraikanInvoiceAi(BALASAN_AI)
  const s = bandingkanDenganPo(inv, PO_ITEMS, PO_TOTAL)
  assert(s.length === 0, 'tagihan yang persis sama dengan PO tidak menimbulkan selisih')
  assert(statusDariSelisih(s) === 'cocok', 'dan statusnya cocok')
}
{
  // Harga naik diam-diam — inilah yang paling sering dan paling mahal.
  const inv = { total: 2490000, items: [
    { nama: 'Semen Portland 50kg', satuan: 'sak', qty: 20, harga: 63000, subtotal: 1260000 },
    { nama: 'Besi Beton 10mm', satuan: 'btg', qty: 15, harga: 82000, subtotal: 1230000 },
  ] }
  const s = bandingkanDenganPo(inv, PO_ITEMS, PO_TOTAL)
  assert(s.some(x => x.jenis === 'harga' && x.nama === 'Semen Portland 50kg'),
    'harga yang berbeda dari PO ditandai')
  assert(s.some(x => x.jenis === 'total'), 'dan totalnya ikut ditandai')
  assert(s.find(x => x.jenis === 'harga').pesan.includes('Rp 63.000'), 'pesannya menyebut angkanya')
  assert(s.find(x => x.jenis === 'total').pesan.includes('lebih'), 'menyebut arah selisihnya')
  assert(statusDariSelisih(s) === 'selisih', 'statusnya selisih')
}
{
  const inv = { total: PO_TOTAL, items: [
    { nama: 'Semen Portland 50kg', satuan: 'sak', qty: 25, harga: 58000, subtotal: 1450000 },
  ] }
  const s = bandingkanDenganPo(inv, PO_ITEMS, PO_TOTAL)
  assert(s.some(x => x.jenis === 'qty' && x.po === 20 && x.invoice === 25), 'qty berbeda ditandai')
}
{
  const inv = { total: PO_TOTAL, items: [
    { nama: 'Ongkos kirim', satuan: 'ls', qty: 1, harga: 150000, subtotal: 150000 },
  ] }
  const s = bandingkanDenganPo(inv, PO_ITEMS, PO_TOTAL)
  assert(s.some(x => x.jenis === 'item_asing'), 'barang yang tidak ada di PO ditandai')
  assert(s.find(x => x.jenis === 'item_asing').pesan.includes('tidak ada di PO'), 'dengan sebabnya')
}
{
  // Beda huruf besar & spasi ganda BUKAN selisih. Kalau dianggap selisih,
  // penandanya berbunyi pada hampir setiap tagihan — dan penanda yang selalu
  // berbunyi berhenti dibaca, lalu selisih yang sungguhan ikut terlewat.
  const inv = { total: PO_TOTAL, items: [
    { nama: 'SEMEN  PORTLAND 50KG', satuan: 'sak', qty: 20, harga: 58000, subtotal: 1160000 },
  ] }
  const s = bandingkanDenganPo(inv, PO_ITEMS, PO_TOTAL)
  assert(s.length === 0, 'huruf besar dan spasi ganda bukan selisih')
}
{
  // Pembulatan PPN memang menghasilkan beda beberapa rupiah pada dokumen yang
  // sebenarnya identik.
  const s = bandingkanDenganPo({ total: PO_TOTAL + 300, items: [] }, PO_ITEMS, PO_TOTAL)
  assert(s.length === 0, 'beda Rp 300 masih di dalam toleransi')
  const s2 = bandingkanDenganPo({ total: PO_TOTAL + 50000, items: [] }, PO_ITEMS, PO_TOTAL)
  assert(s2.length === 1, 'beda Rp 50.000 tidak')
}
{
  const s = bandingkanDenganPo({ total: PO_TOTAL - 500000, items: [] }, PO_ITEMS, PO_TOTAL)
  assert(s[0].pesan.includes('kurang'), 'tagihan yang lebih KECIL pun ditandai — bisa jadi tertinggal')
}
assert(bandingkanDenganPo({ items: [], total: 0 }, null, 0).length === 0, 'PO kosong aman')
assert(bandingkanDenganPo({ items: null, total: 0 }, PO_ITEMS, 0).length === 0, 'items null aman')

// ── 5. Menjumlahkan ─────────────────────────────────────────────────────
{
  const t = hitungTotalInvoice([{ subtotal: 1160000 }, { subtotal: 1230000 }], 262900)
  assert(t.subtotal === 2390000, 'subtotal dijumlah')
  assert(t.total === 2652900, 'PPN ditambahkan')
}
assert(hitungTotalInvoice([]).total === 0, 'kosong nol')
assert(hitungTotalInvoice(null).total === 0, 'null aman')

// ── 6. Syarat kirim ─────────────────────────────────────────────────────
{
  const lengkap = {
    ...INVOICE_KOSONG, nomor_invoice: 'INV/1', tanggal: '2026-08-13',
    items: [{ nama: 'Semen', satuan: 'sak', qty: 1, harga: 58000, subtotal: 58000 }],
    total: 58000, dikirim_oleh: 'Budi',
  }
  assert(siapDikirim(lengkap).boleh === true, 'yang lengkap boleh dikirim')
  assert(siapDikirim({ ...lengkap, nomor_invoice: '' }).alasan.includes('Nomor'),
    'yang kurang ditolak DENGAN menyebut apa yang kurang')
  assert(siapDikirim({ ...lengkap, items: [] }).boleh === false, 'tanpa barang ditolak')
  assert(siapDikirim({ ...lengkap, total: 0 }).boleh === false, 'total nol ditolak')
  assert(siapDikirim({ ...lengkap, dikirim_oleh: '' }).boleh === false, 'tanpa nama pengirim ditolak')
  assert(siapDikirim(INVOICE_KOSONG).boleh === false, 'yang kosong ditolak')
}

// ── 7. Perintah untuk AI memuat isi PO ──────────────────────────────────
//
// Tanpa itu, "Semen Portland 50kg" pada PO menjadi "SEMEN PC 50 KG" pada
// tagihan, dan pembanding di atas melaporkan barang asing alih-alih cocok.
{
  const p = perintahBacaInvoice(PO_ITEMS)
  assert(p.includes('Semen Portland 50kg'), 'nama barang PO disertakan ke model')
  assert(p.includes('58000'), 'beserta harganya')
  assert(/JANGAN menebak/i.test(p), 'dan larangan menebak — yang kosong terlihat, yang salah tidak')
  assert(p.includes('"nomor_invoice"'), 'bentuk JSON-nya dicontohkan')
  assert(perintahBacaInvoice(null).includes('tidak ada rincian PO'), 'PO kosong tetap menghasilkan perintah')
}

// ── 8. Label lengkap untuk setiap status ────────────────────────────────
for (const s of ['masuk', 'cocok', 'selisih', 'disetujui', 'ditolak', 'dibayar']) {
  assert(LABEL_STATUS_INVOICE[s], `label status ${s} ada`)
  assert(TONE_STATUS_INVOICE[s], `warna status ${s} ada`)
}

// ── 9. Tautan kirim tagihan BENAR-BENAR ikut di pesan WA ────────────────
//
// Inilah permintaan intinya, dan justru yang paling mudah hilang tanpa
// ketahuan: tautan kedua hanya ada bila penerbitan tokennya berhasil. Bila
// penerbitan itu diam-diam gagal, pesannya tetap terkirim dan terlihat normal
// — hanya tanpa jalan bagi vendor mengirim tagihannya. Kegagalan yang tidak
// terlihat seperti kegagalan adalah yang paling lama tidak ketahuan.
{
  const { pesanWaPo } = await import('../src/lib/procurement.ts')
  const po = { nomor: 'PO/2026/0007', vendor_nama: 'Toko Maju', total: 2390000,
    term: 'term', term_hari: 30 }
  const LINK_PO = 'https://propfs.id/po/ABCD2345MNPQ'
  const LINK_INV = 'https://propfs.id/n/WXYZ6789HJKL'

  const pesan = pesanWaPo(po, LINK_PO, LINK_INV)
  assert(pesan.includes(LINK_PO), 'tautan PO ada di pesan')
  assert(pesan.includes(LINK_INV), 'tautan kirim tagihan JUGA ada')
  assert(pesan.indexOf(LINK_INV) > pesan.indexOf(LINK_PO),
    'dan letaknya di BAWAH tautan PO, seperti yang diminta')
  assert(/invoice/i.test(pesan.split(LINK_INV)[0].split(LINK_PO)[1]),
    'dengan kalimat yang menerangkan tautan itu untuk apa — tautan telanjang tidak diklik siapa pun')
  assert(pesan.includes('PO/2026/0007') && pesan.includes('Rp 2.390.000'),
    'nomor dan nilainya tetap terbawa')
  assert(pesan.includes('Tempo 30 hari'), 'termin pembayarannya juga')

  // Tanpa tautan kedua, pesannya harus tetap utuh dan wajar — tidak menyisakan
  // baris kosong menggantung atau kalimat ajakan yang menunjuk ke mana pun.
  const tanpa = pesanWaPo(po, LINK_PO, null)
  assert(tanpa.includes(LINK_PO), 'tanpa tautan tagihan, tautan PO tetap ada')
  assert(!/invoice/i.test(tanpa), 'dan ajakan menagih tidak ikut tercetak tanpa tautannya')
  assert(!/\n\n\n/.test(tanpa), 'tanpa baris kosong menggantung')
  assert(pesanWaPo(po, LINK_PO).includes(LINK_PO), 'argumen ketiga boleh tidak diisi')
}

console.log(`invoice-vendor: ${ok} assert lulus`)
