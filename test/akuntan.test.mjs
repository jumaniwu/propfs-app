// Test logika Modul Akuntan (laba rugi, inventori, neraca, opname).
import { hitungLabaRugi, hitungInventori, hitungNeraca, progresOpname, penerimaanInventori } from '../src/lib/akuntan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const pemasukan = [
  { id: '1', tanggal: '2026-07-01', sumber: 'Modal awal', kategori: 'modal', jumlah: 100_000_000 },
  { id: '2', tanggal: '2026-07-10', sumber: 'Termin 1', kategori: 'termin', jumlah: 50_000_000 },
  { id: '3', tanggal: '2026-08-02', sumber: 'Unit A-1', kategori: 'penjualan', jumlah: 30_000_000 },
]
const pengeluaran = [
  { id: 'a', tipe: 'material', tanggal: '2026-07-05', keterangan: 'Beli semen', namaMaterial: 'Semen 50kg', volume: 100, satuan: 'sak', hargaSatuan: 60_000, kategori: 'bangunan', jumlah: 6_000_000, status: 'Dicatat' },
  { id: 'b', tipe: 'upah', tanggal: '2026-07-12', keterangan: 'Upah cor', kategori: 'bangunan', jumlah: 4_000_000, status: 'Dicatat' },
  { id: 'c', tipe: 'operasional', tanggal: '2026-08-01', keterangan: 'BBM', kategori: 'operasional', jumlah: 1_000_000, status: 'Dicatat' },
]

// Laba rugi
const lr = hitungLabaRugi(pemasukan, pengeluaran)
assert(lr.totalPemasukan === 180_000_000, 'total pemasukan')
assert(lr.totalPengeluaran === 11_000_000, 'total pengeluaran')
assert(lr.laba === 169_000_000, 'laba = pemasukan - pengeluaran')
assert(lr.perBulan.length === 2, 'dua bulan terdata')
assert(lr.perBulan[0].bulan === '2026-07' && lr.perBulan[0].laba === 140_000_000, 'laba Juli')
assert(lr.perBulan[1].laba === 29_000_000, 'laba Agustus')
assert(lr.pemasukanPerKategori.find(p => p.kategori === 'Modal Disetor')?.jumlah === 100_000_000, 'kategori modal')

// Inventori: 100 sak masuk @60rb, 40 terpakai → stok 60, nilai 3.6jt
const inv = hitungInventori(pengeluaran, [
  { id: 'x', tanggal: '2026-07-20', nama: 'semen 50KG', satuan: 'sak', qty: -40 },
])
assert(inv.length === 1, 'material tergabung case-insensitive')
assert(inv[0].masuk === 100 && inv[0].keluar === 40 && inv[0].stok === 60, 'stok = masuk - keluar')
assert(Math.round(inv[0].hargaRata) === 60_000, 'harga rata dari pembelian')
assert(Math.round(inv[0].nilai) === 3_600_000, 'nilai stok')

// Neraca: kas = 180jt - 11jt = 169jt; persediaan 3.6jt; modal 100jt
const nr = hitungNeraca(pemasukan, pengeluaran, inv)
assert(nr.kas === 169_000_000, 'kas')
assert(Math.round(nr.persediaan) === 3_600_000, 'persediaan')
assert(nr.modalDisetor === 100_000_000, 'modal disetor')
assert(nr.totalAset === nr.totalPasiva, 'neraca seimbang: aset = pasiva')
assert(nr.seimbang === true, 'flag seimbang')

// Opname
const pct = progresOpname([
  { uraian: 'Pasang bata', satuan: 'm2', vol_rencana: 100, vol_realisasi: 50 },
  { uraian: 'Plester', satuan: 'm2', vol_rencana: 100, vol_realisasi: 150 }, // over → dibatasi 100
])
assert(pct === 75, 'progres opname dibatasi 100% per item (' + pct + ')')
assert(progresOpname([]) === 0, 'opname kosong = 0')

console.log('akuntan:', ok, 'assert lulus')

// ── cloudSync: merge terbaru-menang & union ─────────────────────────────────
const { mergeNewest, unionById } = await import('../src/lib/cloudSync.ts')
{
  const local = [
    { id: 'A', at: '2026-07-23T10:00:00Z', src: 'local' },  // lebih baru dari cloud
    { id: 'C', at: '2026-07-20T00:00:00Z', src: 'local' },  // hanya lokal
  ]
  const cloud = [
    { id: 'A', at: '2026-07-22T00:00:00Z', src: 'cloud' },
    { id: 'B', at: '2026-07-21T00:00:00Z', src: 'cloud' },  // hanya cloud
  ]
  const { merged, toPush } = mergeNewest(local, cloud, x => x.id, x => x.at)
  assert(merged.length === 3, 'merge: union 3 proyek')
  assert(merged.find(x => x.id === 'A').src === 'local', 'merge: versi terbaru menang')
  assert(merged.find(x => x.id === 'B').src === 'cloud', 'merge: proyek cloud dipertahankan')
  assert(merged[0].id === 'A', 'merge: urut terbaru dulu')
  assert(toPush.length === 2 && toPush.every(x => x.src === 'local'), 'merge: yang perlu di-push = lokal baru/unik')

  const u = unionById([{ id: '1', v: 'a' }], [{ id: '1', v: 'b' }, { id: '2', v: 'c' }], x => x.id)
  assert(u.length === 2 && u.find(x => x.id === '1').v === 'a', 'union: lokal menang, unik ditambah')
}
console.log('cloudSync: lulus')

// ── Penerimaan barang (DO) & pemakaian lapangan masuk ke inventori ─────────
// Barang yang dikonfirmasi diterima harus langsung tercatat sebagai stok,
// bukan menunggu seseorang mencatat notanya lagi secara manual.
{
  const inv = hitungInventori([], [],
    [{ nama: 'Besi Beton 12mm', satuan: 'Batang', qty: 50, harga: 120_000 }],
    [])
  assert(inv.length === 1, 'DO membuat baris inventori baru')
  assert(inv[0].masuk === 50 && inv[0].stok === 50, 'qty DO jadi stok')
  assert(inv[0].dariPenerimaan === 50, 'sumbernya tercatat sebagai penerimaan')
  assert(inv[0].hargaRata === 120_000, 'harga satuan diambil dari PO')
  assert(inv[0].nilai === 6_000_000, 'nilai stok = qty x harga PO')
  assert(inv[0].satuan === 'Batang', 'satuan ikut dari surat jalan')
  assert(inv[0].mungkinDobel === false, 'satu sumber saja tidak ditandai dobel')
}

// Pemakaian di lapangan mengurangi stok — kolom Keluar akhirnya berarti.
{
  const inv = hitungInventori([], [],
    [{ nama: 'Semen', satuan: 'sak', qty: 100, harga: 60_000 }],
    [{ nama: 'semen', satuan: 'sak', qty: 30 }])
  assert(inv.length === 1, 'nama beda huruf besar-kecil tetap satu baris')
  assert(inv[0].keluar === 30 && inv[0].dariLapangan === 30, 'pemakaian jadi keluar')
  assert(inv[0].stok === 70, 'stok = masuk - pemakaian')
  assert(inv[0].nilai === 70 * 60_000, 'nilai mengikuti sisa stok')
}

// Nota pembelian + surat jalan untuk barang yang sama tidak dijumlah diam-diam.
{
  const inv = hitungInventori(
    [{ id: 'a', tipe: 'material', tanggal: '2026-07-01', namaMaterial: 'Triplek', volume: 30, satuan: 'lbr', jumlah: 4_500_000 }],
    [],
    [{ nama: 'Triplek', satuan: 'lbr', qty: 30, harga: 150_000 }], [])
  assert(inv[0].mungkinDobel === true, 'dua sumber untuk satu barang ditandai')
  assert(inv[0].dariPembelian === 30 && inv[0].dariPenerimaan === 30, 'kedua sumber tetap terlihat terpisah')
}

// Penyesuaian manual tanpa harga tidak boleh menaikkan nilai persediaan.
{
  const inv = hitungInventori([], [{ id: 'x', tanggal: '2026-07-01', nama: 'Paku', satuan: 'kg', qty: 10 }],
    [{ nama: 'Paku', satuan: 'kg', qty: 90, harga: 20_000 }], [])
  assert(inv[0].masuk === 100 && inv[0].dariPenyesuaian === 10, 'penyesuaian ikut menambah masuk')
  assert(inv[0].nilai === 90 * 20_000, 'nilai tetap sebesar yang benar-benar dibeli')
}

// Masukan cacat tidak merusak tabel.
{
  const inv = hitungInventori([], [],
    [{ nama: '  ', qty: 5 }, { nama: 'A', qty: -5 }, { nama: 'B', qty: 3 }],
    [{ nama: 'B', qty: NaN }])
  assert(inv.length === 2, 'baris tanpa nama diabaikan')
  assert(inv.find(r => r.nama === 'A').masuk === 0, 'qty negatif diabaikan')
  assert(inv.find(r => r.nama === 'B').keluar === 0, 'qty NaN diabaikan')
}

// ── penerimaanInventori: rakit DO + PO jadi baris siap hitung ──────────────
{
  const pos = [
    { id: 'po1', project_name: 'Griya Asri', items: [{ nama: 'Besi 12mm', satuan: 'btg', harga: 120_000 }] },
    { id: 'po2', project_name: 'Proyek Lain', items: [{ nama: 'Semen', satuan: 'sak', harga: 60_000 }] },
  ]
  const dos = [
    { po_id: 'po1', items: [{ nama: 'Besi 12mm', satuan: 'btg', qty: 50 }] },
    { po_id: 'po2', items: [{ nama: 'Semen', satuan: 'sak', qty: 100 }] },
    { po_id: 'hilang', items: [{ nama: 'Entah', qty: 1 }] },
  ]
  const satu = penerimaanInventori(dos, pos, 'Griya Asri')
  assert(satu.length === 1, 'hanya DO milik proyek yang diminta')
  assert(satu[0].harga === 120_000, 'harga satuan diambil dari item PO yang namanya cocok')
  assert(satu[0].qty === 50 && satu[0].satuan === 'btg', 'qty dari DO, satuan ikut terbawa')

  assert(penerimaanInventori(dos, pos, '').length === 2,
    'tanpa nama proyek: konsolidasi semua proyek, DO tanpa PO tetap dibuang')
  assert(penerimaanInventori(dos, pos, 'griya asri').length === 1, 'nama proyek tidak peka huruf besar')

  const tanpaHarga = penerimaanInventori(
    [{ po_id: 'po1', items: [{ nama: 'Barang Tak Dipesan', qty: 2 }] }], pos, 'Griya Asri')
  assert(tanpaHarga[0].harga === 0, 'barang di luar daftar PO masuk tanpa nilai, bukan menebak harga')

  assert(penerimaanInventori([], [], '').length === 0, 'data kosong aman')
  assert(penerimaanInventori([{ po_id: 'po1' }], pos, 'Griya Asri').length === 0, 'DO tanpa items aman')
}

console.log(`akuntan-inventori: ${ok} assert lulus (kumulatif)`)

// ── PO tanpa nama proyek tetap menemukan proyeknya lewat request ───────────
// Kolom project_name PO diisi dari proyek yang kebetulan aktif saat PO dibuat,
// jadi PO yang dibuat langsung dari Home bisa kosong. Barangnya tetap harus
// masuk stok proyek yang benar.
{
  const pos = [
    { id: 'po1', project_name: '', items: [{ request_id: 'r1', nama: 'Besi 12mm', satuan: 'btg', harga: 120_000 }] },
    { id: 'po2', project_name: '', items: [{ request_id: 'r9', nama: 'Semen', satuan: 'sak', harga: 60_000 }] },
  ]
  const dos = [
    { po_id: 'po1', items: [{ nama: 'Besi 12mm', satuan: 'btg', qty: 50 }] },
    { po_id: 'po2', items: [{ nama: 'Semen', satuan: 'sak', qty: 10 }] },
  ]
  const requests = [
    { id: 'r1', project_name: 'Ruko Pak Soni' },
    { id: 'r9', project_name: 'Proyek Lain' },
  ]

  assert(penerimaanInventori(dos, pos, 'Ruko Pak Soni').length === 0,
    'tanpa data request, PO tanpa nama proyek memang tidak ketemu')

  const pulih = penerimaanInventori(dos, pos, 'Ruko Pak Soni', requests)
  assert(pulih.length === 1, 'hanya DO yang requestnya milik proyek itu')
  assert(pulih[0].nama === 'Besi 12mm' && pulih[0].harga === 120_000,
    'harga tetap terbaca dari item PO')

  assert(penerimaanInventori(dos, pos, 'Proyek Lain', requests).length === 1,
    'proyek lain menemukan DO-nya sendiri, bukan milik tetangga')

  // Nama proyek yang benar tetap menang tanpa perlu rantai request.
  const langsung = penerimaanInventori(
    [{ po_id: 'po3', items: [{ nama: 'Bata', qty: 5 }] }],
    [{ id: 'po3', project_name: 'Ruko Pak Soni', items: [] }],
    'Ruko Pak Soni', requests)
  assert(langsung.length === 1, 'PO yang nama proyeknya benar tidak butuh rantai request')

  // Request tanpa proyek tidak boleh menjadi pintu masuk ke semua proyek.
  assert(penerimaanInventori(dos, pos, 'Ruko Pak Soni', [{ id: 'r1' }]).length === 0,
    'request tanpa nama proyek tidak dianggap cocok')
}

console.log(`akuntan-do-proyek: ${ok} assert lulus (kumulatif)`)

// ── Nota yang sudah jadi surat jalan tidak menambah stok dua kali ──────────
{
  const nota = { id: 'a', tipe: 'material', tanggal: '2026-07-01', namaMaterial: 'Besi',
    volume: 50, satuan: 'btg', jumlah: 6_000_000 }
  const doItem = [{ nama: 'Besi', satuan: 'btg', qty: 50, harga: 120_000 }]

  const dobel = hitungInventori([nota], [], doItem, [])
  assert(dobel[0].masuk === 100 && dobel[0].mungkinDobel === true,
    'tanpa penanda, nota + surat jalan memang terhitung dua kali dan ditandai')

  const rapi = hitungInventori([{ ...nota, doId: 'do1' }], [], doItem, [])
  assert(rapi[0].masuk === 50, 'nota bertanda surat jalan tidak lagi menambah stok')
  assert(rapi[0].dariPembelian === 0 && rapi[0].dariPenerimaan === 50,
    'stoknya sepenuhnya milik surat jalan')
  assert(rapi[0].mungkinDobel === false, 'tidak ada lagi yang perlu diperiksa manusia')
  assert(rapi[0].nilai === 50 * 120_000, 'nilainya dari harga PO, bukan dijumlah dengan nota')
}

console.log(`akuntan-nota-do: ${ok} assert lulus (kumulatif)`)
