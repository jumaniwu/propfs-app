// ============================================================
// Buku pengeluaran yang tahu keadaan sebenarnya.
//
// Yang dijaga paling keras di sini adalah BIAYA GANDA. Satu nota yang terhitung
// dua kali ikut ke laba rugi, ke neraca, dan ke perbandingan terhadap RAB —
// dan tidak ada yang menyadarinya sampai seseorang menghitung ulang dengan
// tangan. Karena itu setiap jalan yang bisa melahirkan baris kembar diuji di
// sini, bukan hanya jalan yang benar.
//
// Yang kedua: label "Lunas" yang menempel pada nota yang KELIRU. Itu lebih
// berbahaya daripada tidak ada label — orang berhenti menagih hutang yang
// sebenarnya masih berjalan.
// ============================================================
import {
  doUntukEntri, statusEntri, catatanBayar, penerimaanBelumTercatat,
  barisDariSuratJalan, ringkasUsul,
} from '../src/lib/sinkronRealisasi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const PO = {
  id: 'po-1', nomor: 'PO/007/08/2026', vendor_nama: 'Global Bangunan Seraya',
  tanggal: '2026-08-01', total: 5_053_000,
  items: [
    { nama: 'Triplek 9mm Jambi', satuan: 'Lbr', qty: 31, harga: 163_000, subtotal: 5_053_000 },
  ],
}
const PO2 = {
  id: 'po-2', nomor: 'PO/008/08/2026', vendor_nama: 'Global Bangunan Seraya',
  tanggal: '2026-08-03', total: 1_200_000,
  items: [{ nama: 'Paku Kayu 3"', satuan: 'box', qty: 10, harga: 120_000, subtotal: 1_200_000 }],
}
const DO = {
  id: 'do-1', po_id: 'po-1', nomor_do: 'DO/001', nomor_nota: '00104/CR/GBS/08/2026',
  tanggal_nota: '2026-08-06', tanggal_terima: '2026-08-06', penerima: 'Budi',
  items: [{ nama: 'Triplek 9mm Jambi', satuan: 'Lbr', qty: 31 }],
  catatan: '', foto: [],
}
const BAYAR_SEBAGIAN = [{ id: 'b1', po_id: 'po-1', jumlah: 2_000_000 }]
const BAYAR_LUNAS = [{ id: 'b1', po_id: 'po-1', jumlah: 5_053_000 }]

// ── 1. Tautan yang bisa dibuktikan, dan HANYA itu ───────────────────────
assert(doUntukEntri({ doId: 'do-1' }, [DO]) === DO, 'tautan lewat doId')
assert(doUntukEntri({ nomorNota: '00104/CR/GBS/08/2026' }, [DO]) === DO, 'tautan lewat nomor nota')
assert(doUntukEntri({ nomorNota: '  00104/cr/gbs/08/2026 ' }, [DO]) === DO,
  'huruf besar-kecil & spasi bukan pembeda')
assert(doUntukEntri({ nomorNota: 'nota-lain' }, [DO]) === null, 'nota lain tidak ditautkan')
assert(doUntukEntri({}, [DO]) === null, 'tanpa penanda apa pun: tidak ditautkan')
assert(doUntukEntri({ doId: 'do-1' }, []) === null, 'tanpa surat jalan aman')
assert(doUntukEntri({ doId: 'do-1' }, null) === null, 'null aman')
{
  // Nama toko SENGAJA tidak dipakai. Satu toko bisa memasok banyak PO, dan
  // menempelkan status bayar PO yang salah membuat orang mengira hutangnya
  // sudah lunas padahal belum.
  const e = { namaSupplier: 'Global Bangunan Seraya' }
  assert(doUntukEntri(e, [DO]) === null, 'kemiripan nama toko BUKAN tautan')
}
{
  // Nomor nota kembar pada dua surat jalan bukan tautan — itu tanda ada yang
  // keliru, dan menebak salah satunya menyembunyikan kekeliruan itu.
  const kembar = { ...DO, id: 'do-2', po_id: 'po-2' }
  assert(doUntukEntri({ nomorNota: DO.nomor_nota }, [DO, kembar]) === null,
    'nota yang muncul di dua surat jalan tidak ditebak')
}

// ── 2. Status bayar yang sebenarnya ─────────────────────────────────────
{
  const s = statusEntri({ doId: 'do-1' }, [DO], [PO, PO2], [])
  assert(s.po === PO, 'PO-nya ketemu')
  assert(s.status === 'belum', 'tanpa pembayaran: belum')
  assert(s.sisa === 5_053_000, 'sisanya penuh')
  assert(/Belum lunas/.test(catatanBayar(s)), 'catatannya berbunyi belum lunas')
  assert(/Rp 5.053.000/.test(catatanBayar(s)), 'menyebut angkanya')
  assert(/Global Bangunan Seraya/.test(catatanBayar(s)), 'dan kepada siapa')
}
{
  const s = statusEntri({ doId: 'do-1' }, [DO], [PO], BAYAR_SEBAGIAN)
  assert(s.status === 'sebagian', 'dibayar sebagian')
  assert(s.sisa === 3_053_000, 'sisanya dihitung')
  assert(/kurang Rp 3.053.000/.test(catatanBayar(s)), `catatannya: ${catatanBayar(s)}`)
}
{
  const s = statusEntri({ doId: 'do-1' }, [DO], [PO], BAYAR_LUNAS)
  assert(s.status === 'lunas', 'lunas')
  // Yang lunas tidak diberi catatan: menandai SEMUA baris membuat catatannya
  // berhenti dibaca, dan yang hilang justru "belum lunas".
  assert(catatanBayar(s) === '', 'yang lunas tidak diberi catatan apa pun')
}
{
  const s = statusEntri({ nomorNota: 'entah' }, [DO], [PO], [])
  assert(s.po === null && s.status === null, 'entri tanpa tautan tidak diberi status karangan')
  assert(catatanBayar(s) === '', 'dan tanpa catatan')
}
{
  // Surat jalan yang PO-nya sudah dihapus: jangan meledak, jangan mengarang.
  const s = statusEntri({ doId: 'do-1' }, [DO], [], [])
  assert(s.po === null && s.status === null, 'PO hilang tidak menghasilkan status')
  assert(s.doId === 'do-1', 'tetapi tautan surat jalannya tetap dilaporkan')
}

// ── 3. INTI: yang sudah tercatat TIDAK diusulkan lagi ───────────────────
{
  const sudah = [{ id: 'e1', doId: 'do-1', jumlah: 5_053_000, tanggal: '2026-08-06',
    keterangan: 'x', kategori: 'bangunan', status: '✅ Dicatat', tipe: 'material' }]
  assert(penerimaanBelumTercatat([DO], [PO], sudah, []).length === 0,
    'surat jalan yang sudah punya baris biaya TIDAK diusulkan lagi')
}
{
  // Diketik manual tanpa tautan doId, tetapi nomor notanya sama. Ini jalan
  // paling mudah melahirkan biaya ganda, dan justru yang paling tidak terlihat.
  const manual = [{ id: 'e1', nomorNota: '00104/CR/GBS/08/2026', jumlah: 5_053_000,
    tanggal: '2026-08-06', keterangan: 'x', kategori: 'bangunan',
    status: '✅ Dicatat', tipe: 'material' }]
  assert(penerimaanBelumTercatat([DO], [PO], manual, []).length === 0,
    'nota yang sama sudah diketik manual pun tidak diusulkan — biaya ganda dicegah')
}
{
  const usul = penerimaanBelumTercatat([DO], [PO], [], [])
  assert(usul.length === 1, 'yang benar-benar belum tercatat memang diusulkan')
  assert(usul[0].po === PO && usul[0].suratJalan === DO, 'membawa PO & surat jalannya')
  assert(usul[0].status === 'belum', 'beserta status bayarnya')
  assert(usul[0].total === 5_053_000, `totalnya benar: ${usul[0].total}`)
  assert(usul[0].entri.length === 1, 'satu baris barang')
  assert(usul[0].entri[0].doId === 'do-1',
    'baris usulannya SUDAH ditandai doId — sekali dicatat, ia tidak akan diusulkan lagi')
}
assert(penerimaanBelumTercatat([], [PO], [], []).length === 0, 'tanpa surat jalan: tidak ada usul')
assert(penerimaanBelumTercatat([DO], [], [], []).length === 0, 'PO hilang: dilewati, tidak meledak')
assert(penerimaanBelumTercatat(null, null, null, null).length === 0, 'semua null aman')
{
  // PO yang barangnya BELUM datang bukan biaya. Membukukannya berarti mencatat
  // uang yang belum tentu keluar.
  const usul = penerimaanBelumTercatat([], [PO, PO2], [], [])
  assert(usul.length === 0, 'PO tanpa surat jalan tidak pernah menjadi usulan biaya')
}

// ── 4. Baris yang dibuat: QTY dari surat jalan, HARGA dari PO ───────────
{
  // Kiriman sebagian: 20 dari 31 lembar. Memakai qty PO akan membukukan
  // 11 lembar yang belum datang sebagai biaya.
  const sebagian = { ...DO, items: [{ nama: 'Triplek 9mm Jambi', satuan: 'Lbr', qty: 20 }] }
  const baris = barisDariSuratJalan(sebagian, PO)
  assert(baris[0].volume === 20, 'qty diambil dari yang BENAR-BENAR datang')
  assert(baris[0].hargaSatuan === 163_000, 'harga diambil dari PO')
  assert(baris[0].jumlah === 3_260_000, `nilainya 20 x 163.000 = ${baris[0].jumlah}`)
}
{
  const b = barisDariSuratJalan(DO, PO)[0]
  assert(b.namaSupplier === 'Global Bangunan Seraya', 'toko terbawa')
  assert(b.nomorNota === '00104/CR/GBS/08/2026', 'nomor nota terbawa')
  assert(b.tanggal === '2026-08-06', 'tanggal nota dipakai')
  assert(b.tipe === 'material', 'jenisnya material')
  assert(/PO\/007\/08\/2026/.test(b.keterangan), 'keterangannya menyebut PO asalnya')
  assert(!/lunas/i.test(b.status),
    'status pembayaran TIDAK dibekukan ke dalam teks — ia berubah begitu vendornya dibayar')
}
{
  // Barang yang ada di surat jalan tetapi tidak di PO: tetap dicatat, dengan
  // harga nol. Menghilangkannya berarti barang yang datang tidak terlihat.
  const asing = { ...DO, items: [{ nama: 'Barang tak terduga', satuan: 'pcs', qty: 3 }] }
  const baris = barisDariSuratJalan(asing, PO)
  assert(baris.length === 1 && baris[0].hargaSatuan === 0,
    'barang di luar PO tetap muncul, harganya nol untuk diisi manusia')
}
{
  const nol = { ...DO, items: [{ nama: 'X', satuan: 'pcs', qty: 0 }] }
  assert(barisDariSuratJalan(nol, PO).length === 0, 'baris berqty nol dibuang')
  const kosong = { ...DO, items: [{ nama: '', satuan: 'pcs', qty: 5 }] }
  assert(barisDariSuratJalan(kosong, PO).length === 0, 'baris tanpa nama dibuang')
  assert(barisDariSuratJalan({ ...DO, items: null }, PO).length === 0, 'items null aman')
}
{
  const tanpaTanggalNota = { ...DO, tanggal_nota: null }
  assert(barisDariSuratJalan(tanpaTanggalNota, PO)[0].tanggal === '2026-08-06',
    'tanpa tanggal nota, dipakai tanggal terima — bukan hari ini')
}

// ── 5. Ringkasan ────────────────────────────────────────────────────────
{
  const r = ringkasUsul(penerimaanBelumTercatat([DO], [PO], [], []))
  assert(/1 penerimaan barang/.test(r), 'menyebut jumlah penerimaan')
  assert(/Rp 5.053.000/.test(r), 'menyebut nilainya')
}
assert(ringkasUsul([]) === '', 'tanpa usul, tanpa kalimat')

console.log(`sinkron-realisasi: ${ok} assert lulus`)
