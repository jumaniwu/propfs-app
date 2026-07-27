// Test daftar periksa lintas modul dari satu masukan chat AI.
import {
  susunRencana, cocokkanPembayaran, LABEL_MODUL, parsePemasukan, parsePembayaran,
} from '../src/lib/rencanaCatat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const modul = (r, m) => r.langkah.find(l => l.modul === m)

const PO = {
  id: 'po1', nomor: 'PO/001/07/2026', status: 'terkirim', vendor_nama: 'Toko Berkah',
  total: 18_000_000,
  items: [
    { nama: 'Besi Beton 12mm', satuan: 'Batang', qty: 100, harga: 120_000 },
    { nama: 'Semen Portland 50kg', satuan: 'sak', qty: 100, harga: 60_000 },
  ],
}
const BIAYA = [
  { id: 'e1', tipe: 'material', tanggal: '2026-07-20', namaMaterial: 'Besi Beton 12mm',
    volume: 50, satuan: 'Batang', hargaSatuan: 120_000, namaSupplier: 'Toko Berkah', jumlah: 6_000_000 },
  { id: 'e2', tipe: 'upah', tanggal: '2026-07-20', namaTukang: 'Grup Yono', jumlah: 1_200_000 },
]

// ── Daftar periksa ─────────────────────────────────────────────────────────
{
  const r = susunRencana({ added: BIAYA }, { pos: [PO], dos: [] })
  assert(modul(r, 'biaya').rincian === '2 transaksi · Rp 7.200.000', 'biaya diringkas benar')
  assert(modul(r, 'biaya').sudah === true, 'biaya sudah tercatat, tidak menunggu tombol')
  assert(modul(r, 'penerimaan') !== undefined, 'penerimaan ikut terdeteksi dari barangnya')
  assert(modul(r, 'stok').turunan === true, 'stok ditandai turunan, bukan langkah terpisah')
  assert(r.perluKonfirmasi === true, 'ada yang menunggu persetujuan')
  assert(modul(r, 'pemasukan') === undefined, 'modul tanpa isi tidak ditampilkan')
  assert(modul(r, 'pembayaran') === undefined, 'modul tanpa isi tidak ditampilkan')
}

// Hanya upah: tidak menyentuh Procurement maupun stok.
{
  const r = susunRencana({ added: [BIAYA[1]] }, { pos: [PO] })
  assert(modul(r, 'penerimaan') === undefined, 'upah bukan barang')
  assert(modul(r, 'stok') === undefined, 'upah tidak menggerakkan stok')
  assert(r.perluKonfirmasi === false, 'tidak ada yang perlu dikonfirmasi')
}

// Entri yang sudah pernah jadi surat jalan tidak ditawarkan lagi.
{
  const r = susunRencana({ added: [{ ...BIAYA[0], doId: 'do-lama' }] }, { pos: [PO], dos: [] })
  assert(modul(r, 'penerimaan') === undefined, 'entri bertanda doId tidak ditawarkan ulang')
}

// Beberapa PO cocok → pemakainya diberi tahu harus memilih.
{
  const po2 = { ...PO, id: 'po2', nomor: 'PO/002', vendor_nama: 'Toko Lain' }
  const r = susunRencana({ added: [BIAYA[0]] }, { pos: [PO, po2], dos: [] })
  assert(/2 PO mungkin cocok/.test(modul(r, 'penerimaan').catatan), 'diberi tahu ada lebih dari satu calon')
}

// ── Pemasukan ──────────────────────────────────────────────────────────────
{
  const r = susunRencana({
    added: [],
    pemasukan: [{ tanggal: '2026-07-20', sumber: 'Termin 2', kategori: 'termin', jumlah: 250_000_000 }],
  })
  assert(modul(r, 'pemasukan').rincian === '1 pemasukan · Rp 250.000.000', 'pemasukan diringkas benar')
  assert(modul(r, 'pemasukan').sudah === false, 'pemasukan menunggu persetujuan')
  assert(modul(r, 'biaya') === undefined, 'uang masuk tidak dicampur ke biaya')
}

// Nominal nol bukan transaksi.
assert(susunRencana({ pemasukan: [{ jumlah: 0, sumber: 'x' }] }).langkah.length === 0,
  'pemasukan tanpa nominal diabaikan')

// ── cocokkanPembayaran ─────────────────────────────────────────────────────
const POS = [
  { id: 'po1', nomor: 'PO/001', vendor_nama: 'Toko Berkah', total: 10_000_000, status: 'terkirim' },
  { id: 'po2', nomor: 'PO/002', vendor_nama: 'Toko Berkah', total: 3_000_000, status: 'terkirim' },
  { id: 'po3', nomor: 'PO/003', vendor_nama: 'Toko Lain', total: 5_000_000, status: 'terkirim' },
  { id: 'po4', nomor: 'PO/004', vendor_nama: 'Toko Berkah', total: 1_000_000, status: 'draft' },
]
const nol = () => 0
{
  // Nomor PO yang tertulis selalu menang.
  const c = cocokkanPembayaran({ nomorPo: 'PO/002', vendor: 'Toko Lain', jumlah: 999 }, POS, nol)
  assert(c.length === 1 && c[0].id === 'po2', 'nomor PO mengalahkan nama vendor')

  // Tanpa nomor: vendor menyaring, nominal mengurutkan.
  const v = cocokkanPembayaran({ vendor: 'Toko Berkah', jumlah: 3_000_000 }, POS, nol)
  assert(v.length === 2, 'hanya PO milik vendor itu')
  assert(v[0].id === 'po2', 'sisa yang paling dekat dengan nominal bayar didahulukan')

  // PO draft tidak pernah ditagih.
  assert(!v.some(p => p.id === 'po4'), 'PO draft tidak ikut')

  // PO yang sudah lunas tidak ditawarkan lagi.
  const lunas = cocokkanPembayaran({ vendor: 'Toko Berkah', jumlah: 1_000 }, POS,
    id => id === 'po1' ? 10_000_000 : 0)
  assert(!lunas.some(p => p.id === 'po1'), 'PO lunas tidak ditawarkan')
  assert(lunas.every(p => p.sisa > 0), 'semua calon masih punya sisa tagihan')

  // Pembayaran sebagian menyisakan tagihan.
  const cicil = cocokkanPembayaran({ nomorPo: 'PO/001', jumlah: 1_000 }, POS, () => 4_000_000)
  assert(cicil[0].sudahDibayar === 4_000_000 && cicil[0].sisa === 6_000_000, 'sisa tagihan dihitung benar')

  // Vendor tidak dikenal: seluruh PO hidup ditawarkan, bukan nol.
  const asing = cocokkanPembayaran({ vendor: 'Toko Antah Berantah', jumlah: 5_000_000 }, POS, nol)
  assert(asing.length === 3 && asing[0].id === 'po3', 'vendor tak dikenal jatuh ke seluruh PO, diurut nominal')

  assert(cocokkanPembayaran({ jumlah: 100 }, [], nol).length === 0, 'tanpa PO tidak ada calon')
}

// Pembayaran yang tidak menemukan PO tetap dilaporkan, bukan dibuang.
{
  const r = susunRencana(
    { pembayaran: [{ tanggal: '2026-07-21', vendor: 'X', jumlah: 500_000, metode: 'transfer' }] },
    { pos: [], sudahDibayar: nol },
  )
  assert(modul(r, 'pembayaran').rincian === '1 pembayaran · Rp 500.000', 'pembayaran tetap muncul')
  assert(/1 tidak menemukan PO yang cocok/.test(modul(r, 'pembayaran').catatan), 'ketiadaan PO diberitahukan')
  assert(r.pembayaran[0].calon.length === 0, 'calonnya memang kosong')
}

// ── parsePemasukan / parsePembayaran ───────────────────────────────────────
{
  const p = parsePemasukan({ tanggal: '2026-07-01', sumber: 'Termin 1', kategori: 'TERMIN', jumlah: '5000000' })
  assert(p.kategori === 'termin' && p.jumlah === 5_000_000, 'kategori dinormalkan, angka teks dibaca')
  assert(parsePemasukan({ kategori: 'ngawur', jumlah: 1 }).kategori === 'lainnya', 'kategori asing jatuh ke lainnya')
  assert(parsePemasukan({ jumlah: -5 }).jumlah === 0, 'nominal negatif ditolak')
  assert(parsePemasukan({}).sumber === 'Pemasukan', 'sumber kosong diberi nama bawaan')
  assert(/^\d{4}-\d{2}-\d{2}$/.test(parsePemasukan({}).tanggal), 'tanpa tanggal jatuh ke hari ini')

  const b = parsePembayaran({ metode: 'TRANSFER', jumlah: 1_000, nomor_po: 'PO/9' })
  assert(b.metode === 'transfer' && b.nomorPo === 'PO/9', 'metode dinormalkan, nomor_po dikenali')
  assert(parsePembayaran({ metode: 'bitcoin', jumlah: 1 }).metode === 'transfer', 'metode asing jatuh ke transfer')
}

// ── Label modul ────────────────────────────────────────────────────────────
assert(LABEL_MODUL.pemasukan === 'Akuntan · Pemasukan', 'label modul menyebut tempat tujuannya')
assert(Object.keys(LABEL_MODUL).length === 5, 'lima modul yang tersentuh')

// Masukan kosong tidak menghasilkan daftar.
{
  const r = susunRencana({}, {})
  assert(r.langkah.length === 0 && r.perluKonfirmasi === false, 'tanpa apa-apa, tidak ada daftar periksa')
}

console.log(`rencana-catat: ${ok} assert lulus`)
