// Test penyambung nota → Purchase Order → surat jalan.
import {
  namaSama, sisaBarangPo, cocokkanNotaKePo, usulanDo, ringkasCocok,
} from '../src/lib/notaKePo.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── namaSama ───────────────────────────────────────────────────────────────
assert(namaSama('Besi Beton 12mm', 'besi beton 12mm'), 'tidak peka huruf besar')
assert(namaSama('Besi  Beton   12mm', 'Besi Beton 12mm'), 'spasi berlebih diabaikan')
assert(namaSama('Besi Beton 12mm', 'Besi Beton 12mm SNI'), 'nama yang lebih panjang tetap dianggap sama')
assert(!namaSama('Besi Beton 12mm', 'Besi Beton 10mm'), 'ukuran berbeda bukan barang yang sama')
assert(!namaSama('Besi 12', 'Paku 12'), 'berbagi satu kata tidak cukup')
assert(!namaSama('', 'Besi'), 'nama kosong tidak pernah cocok')
assert(!namaSama('sak', 'Semen sak besar'), 'potongan terlalu pendek tidak menyamakan')

// ── sisaBarangPo ───────────────────────────────────────────────────────────
const PO = {
  id: 'po1', nomor: 'PO/001/07/2026', status: 'terkirim', vendor_nama: 'Toko Berkah',
  items: [
    { nama: 'Besi Beton 12mm', satuan: 'Batang', qty: 100, harga: 120_000 },
    { nama: 'Semen Portland 50kg', satuan: 'sak', qty: 200, harga: 60_000 },
  ],
}
{
  const s = sisaBarangPo(PO, [])
  assert(s.length === 2 && s[0].sisa === 100, 'tanpa DO, seluruh pesanan masih tersisa')
  assert(s[0].harga === 120_000, 'harga satuan ikut terbawa')

  const sebagian = sisaBarangPo(PO, [{ po_id: 'po1', items: [{ nama: 'Besi Beton 12mm', qty: 40 }] }])
  assert(sebagian.find(x => x.nama === 'Besi Beton 12mm').sisa === 60, 'pengiriman bertahap mengurangi sisa')
  assert(sebagian.find(x => x.nama === 'Semen Portland 50kg').sisa === 200, 'barang lain tidak ikut berkurang')

  const lebih = sisaBarangPo(PO, [{ po_id: 'po1', items: [{ nama: 'Besi Beton 12mm', qty: 150 }] }])
  assert(lebih.find(x => x.nama === 'Besi Beton 12mm').sisa === 0, 'kelebihan kirim tidak membuat sisa negatif')

  assert(sisaBarangPo(PO, [{ po_id: 'po-lain', items: [{ nama: 'Besi Beton 12mm', qty: 99 }] }])[0].sisa === 100,
    'DO milik PO lain tidak mengurangi sisa PO ini')
  assert(sisaBarangPo({ id: 'x' }, []).length === 0, 'PO tanpa items aman')
}

// ── cocokkanNotaKePo ───────────────────────────────────────────────────────
const nota = [
  { id: 'e1', nama: 'Besi Beton 12mm', satuan: 'Batang', qty: 50, harga: 120_000 },
  { id: 'e2', nama: 'Semen Portland 50kg', satuan: 'sak', qty: 100, harga: 60_000 },
]
{
  const c = cocokkanNotaKePo(nota, [PO], [], 'Toko Berkah')
  assert(c.length === 1, 'satu PO cocok')
  assert(c[0].pasangan.length === 2, 'kedua barang berpasangan')
  assert(c[0].vendorCocok === true, 'nama vendor ikut cocok')
  assert(c[0].takCocok.length === 0, 'tidak ada barang di luar PO')
  assert(c[0].pasangan[0].qty === 50, 'qty usulan mengikuti nota bila masih di bawah sisa')
}

// Nota melebihi sisa: yang diusulkan dibatasi sisa, bukan angka di nota.
{
  const c = cocokkanNotaKePo(
    [{ nama: 'Besi Beton 12mm', qty: 500 }], [PO],
    [{ po_id: 'po1', items: [{ nama: 'Besi Beton 12mm', qty: 80 }] }])
  assert(c[0].pasangan[0].qty === 20, 'usulan dibatasi sisa PO')
}

// PO yang barangnya sudah datang semua tidak ditawarkan lagi.
{
  const c = cocokkanNotaKePo(nota, [PO],
    [{ po_id: 'po1', items: [{ nama: 'Besi Beton 12mm', qty: 100 }, { nama: 'Semen Portland 50kg', qty: 200 }] }])
  assert(c.length === 0, 'PO yang lengkap tidak ditawarkan')
}

// Status PO menentukan apakah barangnya masuk akal datang.
{
  for (const status of ['draft', 'menunggu_approval', 'disetujui', 'ditolak']) {
    assert(cocokkanNotaKePo(nota, [{ ...PO, status }]).length === 0,
      `PO berstatus ${status} belum bisa menerima barang`)
  }
  assert(cocokkanNotaKePo(nota, [{ ...PO, status: 'selesai' }]).length === 1,
    'PO selesai masih bisa menerima sisa kiriman')
}

// Beberapa PO: yang paling banyak cocok menang, vendor jadi penguat.
{
  const poB = { id: 'po2', nomor: 'PO/002', status: 'terkirim', vendor_nama: 'Toko Lain',
    items: [{ nama: 'Besi Beton 12mm', satuan: 'Batang', qty: 100, harga: 119_000 }] }
  const c = cocokkanNotaKePo(nota, [poB, PO], [], 'Toko Berkah')
  assert(c.length === 2, 'keduanya ditawarkan, bukan dipilihkan diam-diam')
  assert(c[0].po.id === 'po1', 'yang paling banyak barang cocok diurutkan lebih dulu')

  // Sama-sama satu barang cocok: vendor yang menentukan urutan.
  const satu = [{ nama: 'Besi Beton 12mm', qty: 10 }]
  const c2 = cocokkanNotaKePo(satu, [poB, PO], [], 'Toko Berkah')
  assert(c2[0].po.id === 'po1', 'vendor yang cocok naik peringkat')
}

// Barang di nota yang tidak ada di PO dilaporkan, bukan dibuang diam-diam.
{
  const c = cocokkanNotaKePo(
    [...nota, { nama: 'Kopi Tubruk', qty: 2 }], [PO], [], 'Toko Berkah')
  assert(c[0].takCocok.length === 1 && c[0].takCocok[0].nama === 'Kopi Tubruk',
    'barang di luar PO dilaporkan terpisah')
  assert(c[0].pasangan.length === 2, 'barang yang cocok tetap berpasangan')
}

// Satu barang PO tidak boleh dipakai dua baris nota sekaligus.
{
  const c = cocokkanNotaKePo(
    [{ nama: 'Besi Beton 12mm', qty: 10 }, { nama: 'Besi Beton 12mm SNI', qty: 10 }],
    [PO], [], '')
  assert(c[0].pasangan.length === 1, 'satu barang PO hanya dipasangkan sekali')
  assert(c[0].takCocok.length === 1, 'baris nota kedua dilaporkan tak cocok')
}

// Masukan kosong / cacat.
assert(cocokkanNotaKePo([], [PO]).length === 0, 'nota kosong tidak mengusulkan apa-apa')
assert(cocokkanNotaKePo([{ nama: '', qty: 5 }], [PO]).length === 0, 'barang tanpa nama diabaikan')
assert(cocokkanNotaKePo([{ nama: 'Besi Beton 12mm', qty: 0 }], [PO]).length === 0, 'qty nol diabaikan')
assert(cocokkanNotaKePo(nota, []).length === 0, 'tanpa PO tidak ada usulan')

// ── usulanDo ───────────────────────────────────────────────────────────────
{
  const c = cocokkanNotaKePo(nota, [PO], [], 'Toko Berkah')[0]
  const d = usulanDo(c, { nomorNota: 'INV-77', tanggalNota: '2026-07-20', tanggalTerima: '2026-07-21', penerima: 'Pak Yono' })
  assert(d.po_id === 'po1', 'surat jalan menempel ke PO yang benar')
  assert(d.nomor_nota === 'INV-77' && d.tanggal_nota === '2026-07-20', 'nomor & tanggal nota terbawa untuk jatuh tempo')
  assert(d.items.length === 2, 'kedua barang masuk surat jalan')
  assert(d.items[0].nama === 'Besi Beton 12mm' && d.items[0].satuan === 'Batang',
    'nama & satuan memakai versi PO supaya sisa PO bisa mencapai nol')

  const tanpa = usulanDo(c, {})
  assert(tanpa.tanggal_nota === null, 'tanpa tanggal nota, dibiarkan kosong bukan ditebak')
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tanpa.tanggal_terima), 'tanggal terima jatuh ke hari ini')
}

// ── ringkasCocok ───────────────────────────────────────────────────────────
{
  const c = cocokkanNotaKePo([...nota, { nama: 'Kopi', qty: 1 }], [PO], [], 'Toko Berkah')[0]
  const r = ringkasCocok(c)
  assert(/2 barang cocok dengan PO\/001/.test(r), 'ringkasan menyebut jumlah & nomor PO')
  assert(/Toko Berkah/.test(r), 'ringkasan menyebut vendor')
  assert(/1 barang di luar PO/.test(r), 'ringkasan menyebut yang tidak cocok')
}

console.log(`nota-ke-po: ${ok} assert lulus`)
