// Test notifikasi yang diturunkan dari data lapangan yang sudah ada.
import {
  susunNotifikasi, belumDibaca, lencana, waktuLalu, ringkasNotifikasi,
  LABEL_JENIS, PERLU_TINDAKAN,
} from '../src/lib/notifikasi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const jenisDari = (list, j) => list.filter(n => n.jenis === j)

const SUMBER = {
  laporan: [{ id: 'l1', created_at: '2026-07-20T08:00:00Z', pelapor: 'Pak Yono', kegiatan: 'Cor kolom lt.2', project_name: 'Ruko Pak Soni' }],
  pakai: [{ id: 'u1', created_at: '2026-07-20T09:00:00Z', pelapor: 'Yono', nama: 'Semen', qty: 20, satuan: 'sak' }],
  request: [
    { id: 'r1', created_at: '2026-07-20T10:00:00Z', pemohon: 'Yono', nama: 'Besi 12mm', qty: 50, satuan: 'btg', status: 'menunggu', urgensi: 'darurat' },
    { id: 'r2', created_at: '2026-07-19T10:00:00Z', pemohon: 'Budi', nama: 'Paku', qty: 5, satuan: 'kg', status: 'disetujui', urgensi: 'normal' },
  ],
  terima: [{ id: 'd1', created_at: '2026-07-20T11:00:00Z', nomor_do: 'DO/001', penerima: 'Gudang', items: [{}, {}] }],
  ttd: [
    { id: 's1', signed_at: '2026-07-20T12:00:00Z', nomor: 'SPK/002', signed_name: 'Ibu Ria' },
    { id: 's2', signed_at: null, nomor: 'SPK/003', vendor_name: 'Belum ttd' },
  ],
  opname: [
    { id: 'o1', filled_at: '2026-07-20T13:00:00Z', judul: 'Opname Juli', filled_by: 'Pengawas' },
    { id: 'o2', filled_at: null, judul: 'Belum diisi' },
  ],
}

// ── Bentuk daftar ──────────────────────────────────────────────────────────
const semua = susunNotifikasi(SUMBER)
assert(semua.length === 7, `7 kabar dari 6 sumber (dapat ${semua.length})`)
assert(semua[0].jenis === 'opname', 'terbaru di atas')
assert(semua[semua.length - 1].jenis === 'request', 'terlama di bawah')

// Yang belum terjadi tidak dijadikan kabar.
assert(jenisDari(semua, 'ttd').length === 1, 'SPK yang belum ditandatangani bukan kabar')
assert(jenisDari(semua, 'opname').length === 1, 'opname yang belum diisi bukan kabar')

// Isi tiap kabar menyebut siapa dan apa.
{
  const l = jenisDari(semua, 'laporan')[0]
  assert(/Pak Yono/.test(l.judul) && /Cor kolom/.test(l.rincian), 'laporan menyebut pelapor & kegiatan')
  assert(l.proyek === 'Ruko Pak Soni', 'proyek ikut terbawa')

  const u = jenisDari(semua, 'pakai')[0]
  assert(/memakai Semen/.test(u.judul) && /20 sak/.test(u.rincian), 'pemakaian menyebut barang & jumlah')
  assert(u.tautan === '/kontraktor/material', 'pemakaian menuju Material Lapangan')

  const d = jenisDari(semua, 'terima')[0]
  assert(/DO\/001/.test(d.judul) && /2 jenis barang/.test(d.rincian), 'surat jalan menyebut nomor & jumlah barang')
  assert(d.tautan === '/kontraktor/procurement', 'surat jalan menuju Procurement')
}

// ── Yang menunggu tindakan ─────────────────────────────────────────────────
{
  const req = jenisDari(semua, 'request')
  const menunggu = req.find(n => /Besi/.test(n.judul))
  const sudah = req.find(n => /Paku/.test(n.judul))
  assert(menunggu.menunggu === true, 'request berstatus menunggu ditandai perlu tindakan')
  assert(/menunggu persetujuan/.test(menunggu.rincian), 'status ditulis apa adanya')
  assert(/DARURAT/.test(menunggu.rincian), 'urgensi selain normal ditonjolkan')
  assert(sudah.menunggu === false, 'request yang sudah disetujui tidak menunggu')
  assert(!/NORMAL/.test(sudah.rincian), 'urgensi normal tidak perlu ditonjolkan')
}
assert(PERLU_TINDAKAN.includes('request') && PERLU_TINDAKAN.includes('ttd'),
  'request & tanda tangan tergolong perlu tindakan')

// ── Waktu kejadian: created_at menang atas tanggal ketikan ─────────────────
{
  const n = susunNotifikasi({
    laporan: [{ id: 'x', created_at: '2026-07-20T08:00:00Z', tanggal: '2026-07-01', pelapor: 'A' }],
  })
  assert(n[0].waktu === '2026-07-20T08:00:00Z',
    'jam masuknya baris dipakai, bukan tanggal yang diketik pelapor')

  const tanpaJam = susunNotifikasi({ laporan: [{ id: 'y', tanggal: '2026-07-05', pelapor: 'B' }] })
  assert(tanpaJam[0].waktu.startsWith('2026-07-05T23:59:59'),
    'tanggal tanpa jam dianggap akhir hari agar tidak selalu kalah urut')

  assert(susunNotifikasi({ laporan: [{ id: 'z', pelapor: 'C' }] }).length === 0,
    'tanpa waktu sama sekali, bukan kabar')
}

// Baris tanpa nama barang diabaikan — kabarnya tidak akan bisa dibaca.
assert(susunNotifikasi({ pakai: [{ id: 'p', created_at: '2026-07-20T08:00:00Z', nama: '' }] }).length === 0,
  'pemakaian tanpa nama material diabaikan')

// ── belumDibaca ────────────────────────────────────────────────────────────
assert(belumDibaca(semua, '2026-07-20T10:30:00Z').length === 3,
  'hanya yang lebih baru dari tanda waktu terakhir dibaca')
assert(belumDibaca(semua, null).length === semua.length, 'belum pernah dibaca berarti semuanya baru')
assert(belumDibaca(semua, '').length === semua.length, 'tanda waktu kosong sama dengan belum pernah dibaca')
assert(belumDibaca(semua, '2099-01-01T00:00:00Z').length === 0, 'sudah dibaca semua')
// Tepat sama dengan tanda waktu berarti SUDAH terbaca, bukan baru.
assert(belumDibaca(semua, '2026-07-20T13:00:00Z').length === 0, 'batas bersifat inklusif')

// ── lencana ────────────────────────────────────────────────────────────────
assert(lencana(0) === '', 'nol tidak menampilkan lencana')
assert(lencana(7) === '7', 'angka kecil apa adanya')
assert(lencana(247) === '99+', 'angka besar dipendekkan')
assert(lencana(99) === '99' && lencana(100) === '99+', 'batasnya tepat di 99')
assert(lencana(-3) === '', 'angka negatif diabaikan')

// ── waktuLalu ──────────────────────────────────────────────────────────────
const kini = new Date('2026-07-20T12:00:00Z')
assert(waktuLalu('2026-07-20T11:59:30Z', kini) === 'baru saja', 'di bawah semenit')
assert(waktuLalu('2026-07-20T11:30:00Z', kini) === '30 menit lalu', 'menit')
assert(waktuLalu('2026-07-20T09:00:00Z', kini) === '3 jam lalu', 'jam')
assert(waktuLalu('2026-07-18T12:00:00Z', kini) === '2 hari lalu', 'hari')
assert(waktuLalu('2026-07-06T12:00:00Z', kini) === '2 minggu lalu', 'minggu')
assert(waktuLalu('2026-05-20T12:00:00Z', kini) === '2 bulan lalu', 'bulan')
assert(waktuLalu('2026-07-20T12:00:30Z', kini) === 'baru saja', 'waktu di masa depan tidak jadi angka negatif')
assert(waktuLalu('bukan tanggal', kini) === '', 'masukan tidak sah aman')

// ── ringkasNotifikasi ──────────────────────────────────────────────────────
assert(/1 perlu tindakan/.test(ringkasNotifikasi(semua)), 'ringkasan menyebut yang perlu tindakan')
assert(/7 kabar/.test(ringkasNotifikasi(semua)), 'ringkasan menyebut jumlah kabar')
assert(ringkasNotifikasi([]) === 'belum ada kabar', 'daftar kosong berbunyi wajar')


// ── Tagihan vendor ─────────────────────────────────────────────────────────
//
// Tagihan yang masuk tanpa terlihat siapa pun akan menumpuk sampai vendornya
// menagih lewat telepon. Itulah yang membuat jenis ini PERLU_TINDAKAN.
{
  const n = susunNotifikasi({ invoice: [
    { id: 'v1', created_at: '2026-08-13T04:00:00.000Z', vendor_nama: 'Toko Maju',
      nomor_invoice: 'INV/0123', total: 2390000, po_nomor: 'PO/2026/0007',
      status: 'masuk', dikirim_oleh: 'Budi', project_name: 'Ruko A' },
  ] })
  assert(n.length === 1, 'tagihan menjadi satu kabar')
  assert(n[0].jenis === 'invoice', 'jenisnya invoice')
  assert(n[0].menunggu === true, 'dan ia menunggu tindakan')
  assert(PERLU_TINDAKAN.includes('invoice'), 'jenisnya memang terdaftar perlu tindakan')
  assert(/Toko Maju/.test(n[0].judul), 'judulnya menyebut vendornya')
  assert(/INV\/0123/.test(n[0].rincian) && /2.390.000/.test(n[0].rincian),
    `rincian menyebut nomor dan nilainya: ${n[0].rincian}`)
  assert(/PO\/2026\/0007/.test(n[0].rincian), 'serta PO yang ditagihnya')
  assert(n[0].tautan === '/kontraktor/procurement', 'diketuk membawa ke tempat memprosesnya')
  assert(n[0].oleh === 'Budi', 'pengirimnya terbawa')
  assert(n[0].proyek === 'Ruko A', 'proyeknya terbawa')
}
{
  // Yang sudah selesai tidak boleh terus menahan lencana. Lencana yang tidak
  // pernah kembali ke nol berhenti berarti apa-apa.
  const n = susunNotifikasi({ invoice: [
    { id: 'a', created_at: '2026-08-13T04:00:00.000Z', status: 'dibayar' },
    { id: 'b', created_at: '2026-08-13T05:00:00.000Z', status: 'ditolak' },
    { id: 'c', created_at: '2026-08-13T06:00:00.000Z', status: 'disetujui' },
    { id: 'd', created_at: '2026-08-13T07:00:00.000Z', status: 'selisih' },
  ] })
  assert(n.filter(x => x.menunggu).length === 1, 'hanya yang belum diputuskan yang menunggu')
  assert(n.find(x => x.menunggu).id === 'invoice:d', 'yaitu yang berselisih')
}
{
  const n = susunNotifikasi({ invoice: [{ id: 'x' }] })
  assert(n.length === 0, 'baris tanpa waktu dilewati, bukan diberi waktu karangan')
}
assert(susunNotifikasi({ invoice: [] }).length === 0, 'daftar invoice kosong aman')

// ── Label & masukan kosong ─────────────────────────────────────────────────
assert(Object.keys(LABEL_JENIS).length === 7, 'tujuh jenis kabar')
assert(susunNotifikasi().length === 0, 'tanpa sumber, tidak ada kabar')
assert(susunNotifikasi({}).length === 0, 'sumber kosong aman')

// Urutan tetap sama di pemuatan berikutnya walau waktunya seri.
{
  const seri = { laporan: [
    { id: 'b', created_at: '2026-07-20T08:00:00Z', pelapor: 'B' },
    { id: 'a', created_at: '2026-07-20T08:00:00Z', pelapor: 'A' },
  ] }
  const satu = susunNotifikasi(seri).map(n => n.id).join(',')
  const dua = susunNotifikasi(seri).map(n => n.id).join(',')
  assert(satu === dua && satu.startsWith('laporan:a'), 'waktu seri diputus id, urutannya tetap')
}

console.log(`notifikasi: ${ok} assert lulus`)
