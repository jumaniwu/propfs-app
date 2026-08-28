// ============================================================
// Revisi PO, dan alamat pengirimannya.
//
// Revisi mengubah JUMLAH UANG pada dokumen yang sudah dikirim ke vendor. Yang
// diuji di sini karena itu bukan "fungsinya jalan", melainkan hal-hal yang
// kalau salah membuat orang tidak bisa menjelaskan selisih:
//
//   1. Harga satuan TIDAK ikut berubah saat jumlah diturunkan.
//   2. Revisi kosong dan revisi tanpa alasan ditolak sebelum tersimpan.
//   3. Nomor -Rev tidak pernah bertumpuk jadi -Rev1-Rev2.
//   4. Menurunkan tidak minta approval; menaikkan minta.
// ============================================================
import {
  revisiKe, nomorPoTampil, poDirevisi,
  itemRevisiDariKurang, bolehRevisiPo, siapRevisiPo, adaPerubahan,
  perluApprovalUlang, akibatRevisi, bacaRiwayatRevisi,
  alamatKirimAwal, siapAlamatKirim, adaAlamatKirim, alamatBerbedaDariProyek,
  rapikanWa, ALAMAT_KOSONG, satuanDiperbaiki,
} from '../src/lib/revisiPo.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const ITEM = (nama, qty, harga, satuan = 'Ikat') =>
  ({ nama, satuan, qty, harga, subtotal: qty * harga })

// ── 1. Nomor tampil ────────────────────────────────────────────────────────
assert(nomorPoTampil({ nomor: 'PO/006/08/2026' }) === 'PO/006/08/2026', 'belum direvisi: polos')
assert(nomorPoTampil({ nomor: 'PO/006/08/2026', revisi_ke: 0 }) === 'PO/006/08/2026', 'nol: polos')
assert(nomorPoTampil({ nomor: 'PO/006/08/2026', revisi_ke: 1 }) === 'PO/006/08/2026-Rev1', 'Rev1')
assert(nomorPoTampil({ nomor: 'PO/006/08/2026', revisi_ke: 3 }) === 'PO/006/08/2026-Rev3', 'Rev3')
// Penanda DITURUNKAN dari nomor polos, jadi revisi kedua tidak pernah
// menghasilkan PO/006/08/2026-Rev1-Rev2.
assert(nomorPoTampil({ nomor: 'PO/006/08/2026', revisi_ke: 2 }) === 'PO/006/08/2026-Rev2',
  'tidak bertumpuk')
assert(nomorPoTampil(null) === 'PO', 'null aman')
assert(nomorPoTampil({ nomor: '  ' }) === 'PO', 'nomor kosong punya cadangan')
assert(revisiKe({ revisi_ke: -3 }) === 0, 'negatif dianggap belum pernah')
assert(revisiKe({ revisi_ke: 'x' }) === 0, 'bukan angka aman')
assert(revisiKe({ revisi_ke: 2.7 }) === 2, 'dibulatkan ke bawah')
assert(poDirevisi({ revisi_ke: 1 }) && !poDirevisi({}), 'lencana revisi')

// ── 2. Menyusun item revisi dari barang yang datang ────────────────────────
{
  const items = [ITEM('Paku 2.5', 1, 50000, 'box'), ITEM('Kayu uk 2x2', 5, 120000)]
  const terima = [
    { nama: 'Paku 2.5', satuan: 'box', dipesan: 1, diterima: 1, kurang: 0 },
    { nama: 'Kayu uk 2x2', satuan: 'Ikat', dipesan: 5, diterima: 2, kurang: 3 },
  ]
  const baru = itemRevisiDariKurang(items, terima)
  assert(baru.length === 2, 'jumlah barisnya tetap')
  assert(baru[0].qty === 1 && baru[0].subtotal === 50000, 'yang lengkap tidak diubah')
  assert(baru[1].qty === 2, 'kayu turun ke 2 — yang benar-benar datang')
  assert(baru[1].subtotal === 240000, 'subtotal ikut turun')
  // Harga satuan TIDAK boleh ikut berubah. Mengubahnya diam-diam saat
  // menurunkan jumlah adalah cara termudah membuat selisih tak terjelaskan.
  assert(baru[1].harga === 120000, 'harga satuan tetap 120.000')

  // Nama dicocokkan tanpa peduli huruf besar dan spasi berlebih — DO diketik
  // orang lain di hari yang berbeda.
  const beda = itemRevisiDariKurang(items, [
    { nama: '  KAYU   UK 2x2 ', satuan: 'Ikat', dipesan: 5, diterima: 4, kurang: 1 },
  ])
  assert(beda[1].qty === 4, 'nama beda huruf besar & spasi tetap cocok')
  assert(beda[0].qty === 1, 'barang yang tidak disebut penerimaan dibiarkan apa adanya')

  // Yang tidak datang sama sekali TETAP di daftar, berjumlah nol — jejak
  // bahwa ia pernah dipesan tidak dihapus di sini.
  const nol = itemRevisiDariKurang(items, [
    { nama: 'Kayu uk 2x2', satuan: 'Ikat', dipesan: 5, diterima: 0, kurang: 5 },
  ])
  assert(nol.length === 2 && nol[1].qty === 0, 'yang batal tetap terlihat, berjumlah nol')

  assert(itemRevisiDariKurang(null, null).length === 0, 'null aman')
  assert(itemRevisiDariKurang(items, null).length === 2, 'tanpa penerimaan: apa adanya')
}

// ── 3. PO mana yang boleh direvisi ─────────────────────────────────────────
assert(bolehRevisiPo({ status: 'terkirim' }).boleh, 'PO terkirim boleh')
assert(bolehRevisiPo({ status: 'selesai' }).boleh, 'PO selesai boleh — barangnya sudah dihitung')
assert(bolehRevisiPo({ status: 'disetujui' }).boleh, 'PO disetujui boleh')
{
  const tolak = bolehRevisiPo({ status: 'ditolak' })
  assert(!tolak.boleh && tolak.alasan.includes('PO baru'), `ditolak → buat baru: ${tolak.alasan}`)
  const draft = bolehRevisiPo({ status: 'draft' })
  assert(!draft.boleh && draft.alasan.includes('ubah'), `draft → cukup diubah: ${draft.alasan}`)
  assert(!bolehRevisiPo(null).boleh, 'null aman')
  assert(!bolehRevisiPo({ status: '' }).boleh, 'status kosong aman')
}

// ── 4. Isi revisi yang layak disimpan ──────────────────────────────────────
{
  const lama = [ITEM('Kayu', 5, 100)]
  const baru = [ITEM('Kayu', 2, 100)]

  assert(siapRevisiPo({ lama, baru, alasan: 'Datang 2 dari 5' }).boleh, 'revisi wajar')

  const tanpaAlasan = siapRevisiPo({ lama, baru, alasan: '  ' })
  assert(!tanpaAlasan.boleh && tanpaAlasan.alasan.includes('alasan'),
    'tanpa alasan ditolak — enam bulan lagi tidak ada yang ingat kenapa')
  assert(!siapRevisiPo({ lama, baru, alasan: 'ok' }).boleh, 'alasan dua huruf belum menjelaskan apa pun')

  const semuaNol = siapRevisiPo({ lama, baru: [ITEM('Kayu', 0, 100)], alasan: 'batal semua' })
  assert(!semuaNol.boleh && semuaNol.alasan.includes('hapus'),
    'semua nol itu pembatalan, bukan revisi')

  const takBerubah = siapRevisiPo({ lama, baru: lama, alasan: 'iseng' })
  assert(!takBerubah.boleh && takBerubah.alasan.includes('Tidak ada yang berubah'),
    'revisi kosong tidak menambah baris riwayat')
}

// ── 5. Deteksi perubahan ───────────────────────────────────────────────────
{
  const a = [ITEM('Kayu', 5, 100), ITEM('Paku', 1, 50)]
  assert(!adaPerubahan(a, a), 'sama persis')
  assert(!adaPerubahan(a, [ITEM('Paku', 1, 50), ITEM('Kayu', 5, 100)]), 'urutan tidak dihitung berubah')
  assert(adaPerubahan(a, [ITEM('Kayu', 4, 100), ITEM('Paku', 1, 50)]), 'qty berubah')
  assert(adaPerubahan(a, [ITEM('Kayu', 5, 110), ITEM('Paku', 1, 50)]), 'harga berubah')
  assert(adaPerubahan(a, [ITEM('Kayu', 5, 100)]), 'barang dihapus')
  assert(adaPerubahan(a, [...a, ITEM('Semen', 2, 70)]), 'barang ditambah')
  assert(adaPerubahan(a, [ITEM('Kayu', 5, 100), ITEM('Pakuu', 1, 50)]), 'nama berbeda')
  assert(!adaPerubahan(null, null), 'null aman')
  assert(adaPerubahan(null, a), 'dari kosong ke berisi')
}

// ── 6. Kapan approval harus diulang ────────────────────────────────────────
//
// Menurunkan = koreksi terhadap kenyataan yang sudah terjadi. Menahannya
// menunggu tanda tangan berarti menahan pembukuan atas sesuatu yang tidak bisa
// diubah lagi. Menaikkan = pesanan tambahan, dan itu komitmen belanja baru.
assert(!perluApprovalUlang(600000, 240000), 'turun: tidak perlu approval ulang')
assert(!perluApprovalUlang(600000, 600000), 'sama: tidak perlu')
assert(perluApprovalUlang(600000, 700000), 'naik: perlu approval ulang')
assert(!perluApprovalUlang(600000, 600000.4), 'beda pecahan rupiah bukan kenaikan')
{
  const turun = akibatRevisi(600000, 240000)
  assert(turun.includes('turun') && turun.includes('360.000'), `selisih disebut: ${turun}`)
  assert(turun.includes('ditutup'), 'menyebut PO bisa ditutup')
  const naik = akibatRevisi(240000, 600000)
  assert(naik.includes('naik') && naik.includes('disetujui ulang'), `akibat kenaikan: ${naik}`)
  assert(akibatRevisi(100, 100).includes('tidak berubah'), 'tanpa selisih')
}

// ── 7. Riwayat ─────────────────────────────────────────────────────────────
{
  const r = bacaRiwayatRevisi([
    { ke: 1, pada: '2026-08-15', oleh: 'Indra', alasan: 'kurang', items: [ITEM('Kayu', 5, 100)], total: 500 },
    { ke: 2, pada: '2026-08-16', oleh: '', alasan: 'kurang lagi', items: [], total: 200 },
  ])
  assert(r.length === 2, 'dua baris')
  assert(r[0].ke === 2, 'terbaru lebih dulu')
  assert(r[0].oleh === 'Tidak diketahui', 'nama kosong tetap punya sebutan')
  assert(bacaRiwayatRevisi(null).length === 0, 'null aman')
  assert(bacaRiwayatRevisi('bukan array').length === 0, 'teks aman')
  assert(bacaRiwayatRevisi([null, 5, {}]).length === 1, 'yang bukan objek dibuang')
}

// ── 8. Alamat kirim ────────────────────────────────────────────────────────
{
  const proyek = { projectName: 'Ruko Pak Soni', location: 'Jl. Merdeka 12, Jambi' }
  const perusahaan = { nama: 'PT Contoh', alamat: 'Jl. Kantor 1', telepon: '0741-123' }

  // PO PROYEK → alamat proyek. Inilah inti permintaannya: alamatnya sudah
  // pernah diketik sekali, dan yang diketik ulang itulah yang salah ketik.
  const p = alamatKirimAwal({ jenis: 'proyek', proyek, perusahaan })
  assert(p.alamat === 'Jl. Merdeka 12, Jambi', 'PO proyek → alamat proyek')

  // PO ALAT & KANTOR → alamat kantor, bukan proyek mana pun.
  assert(alamatKirimAwal({ jenis: 'alat', proyek, perusahaan }).alamat === 'Jl. Kantor 1',
    'PO alat → alamat kantor')
  assert(alamatKirimAwal({ jenis: 'kantor', proyek, perusahaan }).alamat === 'Jl. Kantor 1',
    'PO kantor → alamat kantor')
  assert(alamatKirimAwal({ jenis: 'kantor', proyek, perusahaan }).wa === '0741-123',
    'telepon kantor ikut untuk PO kantor')
  // PO proyek TIDAK memakai telepon kantor: yang menerima barang di lapangan
  // bukan orang kantor, dan nomor kantor hanya membuat sopir menelepon salah
  // orang.
  assert(p.wa === '', 'PO proyek tidak memakai telepon kantor')

  // Jenis kosong dianggap proyek — sama dengan jenisPo().
  assert(alamatKirimAwal({ proyek, perusahaan }).alamat === 'Jl. Merdeka 12, Jambi',
    'jenis kosong = proyek')

  const dengan = alamatKirimAwal({ jenis: 'proyek', proyek, penerima: { nama: ' Indra ', wa: ' 0812 ' } })
  assert(dengan.nama === 'Indra' && dengan.wa === '0812', 'penerima dirapikan')

  assert(alamatKirimAwal({}).alamat === '', 'tanpa data apa pun: kosong, bukan melempar')
  assert(alamatKirimAwal({ proyek: { location: '  Jl.   A   B ' } }).alamat === 'Jl. A B',
    'spasi berlebih dirapikan')
}

// ── 9. Alamat: WAJIB untuk PO proyek, longgar untuk alat & kantor ─────────
//
// Aturannya dibedakan menurut jenis PO, dan pembedaan itu yang penting.
//
// PO PROYEK diantar ke lokasi. Alamat kosong di sini tidak berhenti sebagai
// kolom kosong: blok "DIKIRIM KE" hanya digambar bila ada isinya, jadi PO-nya
// TERCETAK tanpa tujuan antar sama sekali — dan yang menanggungnya sopir yang
// membongkar satu truk material di proyek yang salah.
//
// PO ALAT & KANTOR sering diambil sendiri ke toko. Memaksa alamat diisi di
// situ hanya melahirkan alamat karangan, yang lebih buruk daripada kosong
// karena terbaca seperti alamat sungguhan.
{
  // — PO proyek —
  const kosongProyek = siapAlamatKirim(ALAMAT_KOSONG, 'proyek')
  assert(!kosongProyek.boleh, 'PO proyek TIDAK BOLEH tanpa alamat')
  assert(/alamat pengiriman/i.test(kosongProyek.alasan), 'alasannya menyebut alamat')
  assert(/tercetak tanpa tujuan antar/i.test(kosongProyek.alasan),
    'dan menyebut AKIBATNYA, bukan sekadar "wajib diisi"')

  const tanpaNama = siapAlamatKirim({ ...ALAMAT_KOSONG, alamat: 'Jl. A' }, 'proyek')
  assert(!tanpaNama.boleh && /nama penerima/i.test(tanpaNama.alasan), 'nama penerima wajib')

  const tanpaWa = siapAlamatKirim({ ...ALAMAT_KOSONG, alamat: 'Jl. A', nama: 'Indra' }, 'proyek')
  assert(!tanpaWa.boleh && /nomor HP/i.test(tanpaWa.alasan), 'nomor HP wajib')

  const lengkap = siapAlamatKirim({ alamat: 'Jl. A', nama: 'Indra', wa: '0812', catatan: '' }, 'proyek')
  assert(lengkap.boleh, 'lengkap: boleh')

  // — PO alat & kantor —
  assert(siapAlamatKirim(ALAMAT_KOSONG, 'alat').boleh, 'PO alat: kosong SAH')
  assert(siapAlamatKirim(ALAMAT_KOSONG, 'kantor').boleh, 'PO kantor: kosong SAH')
  assert(siapAlamatKirim(null, 'alat').boleh, 'null aman')
  assert(siapAlamatKirim({ ...ALAMAT_KOSONG, alamat: 'Jl. A' }, 'alat').boleh, 'alamat saja boleh')

  // Bawaan tanpa jenis TIDAK BOLEH mendadak mewajibkan apa pun: pemanggil
  // lama yang belum menyebut jenisnya harus tetap berperilaku seperti dulu.
  assert(siapAlamatKirim(ALAMAT_KOSONG).boleh, 'tanpa jenis: tetap longgar seperti sebelumnya')

  const namaSaja = siapAlamatKirim({ ...ALAMAT_KOSONG, nama: 'Indra' }, 'alat')
  assert(!namaSaja.boleh && namaSaja.alasan.includes('nomor HP'),
    'nama tanpa nomor tidak menolong sopir yang tersesat di gerbang')
  const waSaja = siapAlamatKirim({ ...ALAMAT_KOSONG, wa: '0812' }, 'alat')
  assert(!waSaja.boleh && waSaja.alasan.includes('nama'), 'nomor tanpa nama ditolak')
  assert(siapAlamatKirim({ nama: 'Indra', wa: '0812', alamat: '', catatan: '' }, 'alat').boleh,
    'keduanya ada')
}
assert(rapikanWa('  0812-3456-7890  (Pak Indra) ') === '0812-3456-7890 (Pak Indra)',
  'nomor tetap berguna bagi manusia yang membacanya, tidak divalidasi keras')

// ── 10. Ada / berbeda ──────────────────────────────────────────────────────
assert(!adaAlamatKirim({}), 'PO lama tanpa kolom apa pun')
assert(!adaAlamatKirim(null), 'null aman')
assert(adaAlamatKirim({ kirim_alamat: 'Jl. A' }), 'alamat saja sudah dianggap ada')
assert(adaAlamatKirim({ kirim_catatan: 'lewat gerbang belakang' }), 'catatan saja pun ada')
assert(!adaAlamatKirim({ kirim_alamat: '   ' }), 'spasi bukan alamat')

assert(alamatBerbedaDariProyek('Gudang Simpang IV', 'Jl. Merdeka 12'), 'gudang ≠ proyek')
assert(!alamatBerbedaDariProyek('Jl. Merdeka 12', 'jl.  merdeka 12'),
  'beda huruf besar & spasi bukan alamat berbeda')
assert(!alamatBerbedaDariProyek('', 'Jl. Merdeka 12'), 'kosong tidak dianggap berbeda')
assert(!alamatBerbedaDariProyek('Jl. A', ''), 'proyek tanpa lokasi tidak dianggap berbeda')


// ── Satuan ikut bisa diperbaiki ────────────────────────────────────────────
//
// PO tertulis "1 Kg paku" padahal yang dipesan "1 Kotak". Salah ketik, bukan
// salah jumlah.
//
// Sebelum ini, koreksi itu MUSTAHIL: jumlahnya benar, harganya benar, jadi
// `adaPerubahan` menjawab "tidak ada yang berubah" dan `siapRevisiPo`
// menolak menyimpan — sementara dokumen yang dipegang vendor tetap salah, dan
// barang yang datang dihitung dengan satuan yang tidak pernah dipakai siapa
// pun di gudang.
{
  const lama = [{ nama: 'Paku kayu 3 inch', satuan: 'Kg', qty: 1, harga: 100000, subtotal: 100000 }]

  // Hanya satuannya yang berubah — jumlah dan harga persis sama.
  const satuanSaja = [{ ...lama[0], satuan: 'Kotak' }]
  assert(adaPerubahan(lama, satuanSaja) === true,
    'satuan yang berbeda DIHITUNG sebagai perubahan — tanpa ini koreksinya mustahil')

  const siap = siapRevisiPo({ lama, baru: satuanSaja, alasan: 'Satuan salah ketik, seharusnya Kotak' })
  assert(siap.boleh === true, 'dan revisinya boleh disimpan')

  // Perbandingannya longgar: mengetik ulang dengan huruf besar bukan revisi.
  assert(adaPerubahan(lama, [{ ...lama[0], satuan: 'KG' }]) === false, 'beda huruf besar-kecil: bukan perubahan')
  assert(adaPerubahan(lama, [{ ...lama[0], satuan: ' Kg ' }]) === false, 'spasi di tepi diabaikan')
  assert(adaPerubahan(lama, lama) === false, 'tanpa perubahan apa pun tetap ditolak')

  // Harga TIDAK ikut disesuaikan sendiri. "Dulu per Kg, sekarang per Kotak,
  // jadi harganya dikali sekian" adalah mengarang angka yang tidak pernah
  // disepakati vendor.
  assert(satuanSaja[0].harga === lama[0].harga, 'harga satuan tidak ikut berubah')
  assert(satuanSaja[0].subtotal === lama[0].subtotal, 'subtotal pun tidak')

  // Total tidak berubah, jadi tidak perlu disetujui ulang: ini koreksi
  // keterangan, bukan komitmen belanja baru.
  assert(perluApprovalUlang(100000, 100000) === false, 'koreksi satuan tidak menuntut approval ulang')
}

// ── Satuan tidak boleh DIKOSONGKAN ────────────────────────────────────────
//
// Lebih buruk daripada satuan yang salah: PO bertuliskan "5" tanpa keterangan
// apa pun, dan vendor menebak sendiri.
{
  const lama = [{ nama: 'Paku', satuan: 'Kg', qty: 2, harga: 50000, subtotal: 100000 }]
  const kosong = [{ ...lama[0], satuan: '' }]
  const p = siapRevisiPo({ lama, baru: kosong, alasan: 'perbaikan satuan' })
  assert(p.boleh === false, 'satuan kosong ditolak')
  assert(/Paku/.test(p.alasan), 'alasannya menyebut barang MANA yang kosong')
  assert(/[Ss]atuan/.test(p.alasan), 'dan menyebut apa yang kurang')

  // Baris yang memang dibatalkan (qty 0) tidak ikut diperiksa satuannya —
  // ia disaring lebih dulu, dan menuntut satuan pada barang yang batal hanya
  // menghalangi revisi yang sah.
  const batal = [
    { nama: 'Paku', satuan: 'Kg', qty: 2, harga: 50000, subtotal: 100000 },
    { nama: 'Semen', satuan: '', qty: 0, harga: 60000, subtotal: 0 },
  ]
  const lamaDua = [
    { nama: 'Paku', satuan: 'Kg', qty: 3, harga: 50000, subtotal: 150000 },
    { nama: 'Semen', satuan: 'Sak', qty: 1, harga: 60000, subtotal: 60000 },
  ]
  assert(siapRevisiPo({ lama: lamaDua, baru: batal, alasan: 'semen tidak datang' }).boleh === true,
    'barang yang batal tidak dituntut satuannya')
}

// ── satuanDiperbaiki: menandai koreksi, bukan perubahan pesanan ───────────
//
// Keduanya terlihat sama di layar — angka yang berubah — padahal yang satu
// berarti "barangnya datang kurang" dan yang lain "dulu salah ketik".
{
  const a = { nama: 'Paku', satuan: 'Kg', qty: 1, harga: 1, subtotal: 1 }
  assert(satuanDiperbaiki(a, { ...a, satuan: 'Kotak' }) === true, 'satuan berbeda: ditandai')
  assert(satuanDiperbaiki(a, { ...a, satuan: 'kg' }) === false, 'beda huruf saja: bukan koreksi')
  assert(satuanDiperbaiki(a, a) === false, 'sama: bukan koreksi')
  assert(satuanDiperbaiki(a, { ...a, satuan: '' }) === false,
    'satuan kosong bukan "koreksi" — ia kolom yang belum diisi, dan ditolak di tempat lain')
  assert(satuanDiperbaiki(null, undefined) === false, 'masukan kosong aman')
}

console.log(`revisi-po: ${ok} assert lulus`)
