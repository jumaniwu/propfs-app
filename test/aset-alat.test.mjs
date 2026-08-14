// ============================================================
// Aset & alat kerja: penyusutan garis lurus.
//
// Yang diuji keras di sini adalah BATAS-BATASNYA, bukan rumus pokoknya.
// Rumus garis lurus salah sekali pun akan langsung terlihat; yang tidak
// terlihat adalah:
//
//   - umur ekonomis 0 → pembagian dengan nol → Infinity yang mengalir tanpa
//     hambatan sampai ke neraca dan membuat total asetnya "∞";
//   - alat yang umurnya sudah lewat → penyusutan terus berjalan → nilai buku
//     MINUS → aset yang mengurangi total aset, kebalikan dari yang seharusnya
//     terjadi pada barang yang masih ada di gudang;
//   - tanggal beli di masa depan (salah ketik tahun) → bulan berjalan negatif
//     → nilai buku lebih besar daripada harga belinya.
//
// Ketiganya menghasilkan neraca yang tetap "seimbang" dan tetap salah.
// ============================================================
import {
  bulanBerjalan, penyusutanBulanan, akumulasiPenyusutan, nilaiBuku, sisaUmur,
  masihDimiliki, totalAsetTetap, totalPerolehan, penyusutanBulanIni,
  lokasiAlat, siapSimpanAset, ASET_KOSONG, PILIHAN_UMUR,
  LABEL_KONDISI, TONE_KONDISI,
} from '../src/lib/asetAlat.ts'
import { hitungNeraca } from '../src/lib/akuntan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, toleransi = 1) => Math.abs(a - b) <= toleransi

// Genset 60 juta, umur 5 tahun, residu 0 → 1 juta sebulan.
const GENSET = {
  id: 'a1', nama: 'Genset 5000W', kode: 'GEN-01', merek: 'Honda', nomor_seri: 'SN123',
  tanggal_beli: '2026-01-15', harga: 60_000_000, umur_bulan: 60, nilai_residu: 0,
  kondisi: 'baik', lokasi_project_id: null, lokasi_nama: '', pemegang: '',
  po_id: null, catatan: '', dilepas_at: null,
}
const JULI = new Date('2026-07-15T00:00:00Z')

// ── 1. Rumus pokok ─────────────────────────────────────────────────────────
assert(penyusutanBulanan(GENSET) === 1_000_000, '60 juta / 60 bulan = 1 juta sebulan')
assert(bulanBerjalan(GENSET, JULI) === 6, 'Januari 15 → Juli 15 = 6 bulan penuh')
assert(akumulasiPenyusutan(GENSET, JULI) === 6_000_000, 'enam bulan = 6 juta')
assert(nilaiBuku(GENSET, JULI) === 54_000_000, 'nilai bukunya 54 juta')
assert(sisaUmur(GENSET, JULI) === 54, 'sisa umurnya 54 bulan')

// Bulan dihitung PENUH — tanggal 14 belum genap enam bulan.
assert(bulanBerjalan(GENSET, new Date('2026-07-14T00:00:00Z')) === 5,
  'sehari sebelum genap masih dihitung lima bulan, bukan enam')

// Residu ikut mengurangi dasar penyusutan, bukan hasil akhirnya.
const berResidu = { ...GENSET, nilai_residu: 12_000_000 }
assert(penyusutanBulanan(berResidu) === 800_000, '(60jt − 12jt) / 60 = 800 ribu sebulan')
assert(nilaiBuku(berResidu, JULI) === 55_200_000, '60jt − 4,8jt = 55,2jt')

// ── 2. Umur ekonomis nol: TIDAK boleh melahirkan Infinity ──────────────────
const takDisusutkan = { ...GENSET, umur_bulan: 0 }
assert(penyusutanBulanan(takDisusutkan) === 0, 'umur 0 = tidak disusutkan, bukan dibagi nol')
assert(Number.isFinite(penyusutanBulanan(takDisusutkan)), 'hasilnya angka, bukan Infinity')
assert(akumulasiPenyusutan(takDisusutkan, JULI) === 0, 'tidak ada akumulasi')
assert(nilaiBuku(takDisusutkan, JULI) === 60_000_000, 'nilainya tetap harga perolehan')
assert(sisaUmur(takDisusutkan, JULI) === 0, 'sisa umurnya nol, bukan minus tak hingga')
assert(penyusutanBulanan({ ...GENSET, umur_bulan: -12 }) === 0, 'umur minus juga aman')

// ── 3. Umur sudah lewat: penyusutan BERHENTI, tidak jadi minus ─────────────
const LAMA = new Date('2035-01-15T00:00:00Z') // sembilan tahun, umurnya lima
assert(bulanBerjalan(GENSET, LAMA) === 108, 'sembilan tahun = 108 bulan berjalan')
assert(akumulasiPenyusutan(GENSET, LAMA) === 60_000_000,
  'akumulasinya berhenti di harga perolehan, tidak 108 juta')
assert(nilaiBuku(GENSET, LAMA) === 0, 'nilai bukunya nol, TIDAK minus')
assert(nilaiBuku(GENSET, LAMA) >= 0, 'tidak pernah negatif')
assert(sisaUmur(GENSET, LAMA) === 0, 'sisa umurnya nol')

// Dengan residu, ia berhenti di residunya — bukan di nol.
assert(nilaiBuku(berResidu, LAMA) === 12_000_000,
  'yang punya nilai residu berhenti di residunya, bukan turun ke nol')
assert(akumulasiPenyusutan(berResidu, LAMA) === 48_000_000, 'akumulasi maksimalnya 48 juta')

// ── 4. Tanggal beli di masa depan ──────────────────────────────────────────
const belumDibeli = { ...GENSET, tanggal_beli: '2027-01-15' }
assert(bulanBerjalan(belumDibeli, JULI) === 0, 'belum dibeli: nol bulan, bukan minus enam')
assert(akumulasiPenyusutan(belumDibeli, JULI) === 0, 'belum menyusut sama sekali')
assert(nilaiBuku(belumDibeli, JULI) === 60_000_000,
  'nilainya tepat harga perolehan — tidak melebihi, yang akan terjadi bila bulannya minus')

// ── 5. Alat yang sudah dilepas ─────────────────────────────────────────────
const dilepas = { ...GENSET, dilepas_at: '2026-04-15' }
assert(masihDimiliki(GENSET) === true, 'yang belum dilepas masih dimiliki')
assert(masihDimiliki(dilepas) === false, 'yang sudah dilepas tidak lagi dimiliki')
assert(masihDimiliki({ ...GENSET, dilepas_at: '   ' }) === true, 'spasi saja bukan tanda dilepas')
assert(bulanBerjalan(dilepas, JULI) === 3,
  'penyusutan berhenti di tanggal pelepasan, tidak terus berjalan sampai hari ini')
assert(nilaiBuku(dilepas, JULI) === 57_000_000, 'nilainya beku di saat dilepas')

// ── 6. Masukan yang tidak berbentuk aset ───────────────────────────────────
for (const buruk of [null, undefined, {}, { harga: 'abc' }, { harga: NaN }]) {
  assert(Number.isFinite(penyusutanBulanan(buruk)), `penyusutan aman untuk ${JSON.stringify(buruk)}`)
  assert(Number.isFinite(nilaiBuku(buruk)), `nilai buku aman untuk ${JSON.stringify(buruk)}`)
  assert(nilaiBuku(buruk) >= 0, 'tidak pernah negatif')
  assert(bulanBerjalan(buruk) === 0, 'bulan berjalan nol')
}
assert(nilaiBuku({ ...GENSET, harga: -5_000_000 }) === 0, 'harga minus dianggap nol')
assert(bulanBerjalan({ ...GENSET, tanggal_beli: 'bukan tanggal' }, JULI) === 0,
  'tanggal yang tidak terbaca tidak menghasilkan NaN bulan')
assert(Number.isFinite(nilaiBuku({ ...GENSET, tanggal_beli: 'bukan tanggal' }, JULI)),
  'nilai bukunya tetap angka')

// Residu yang melebihi harga tidak boleh membuat nilai buku > harga.
const residuGila = { ...GENSET, nilai_residu: 999_000_000 }
assert(nilaiBuku(residuGila, JULI) === 60_000_000,
  'residu yang melebihi harga dibatasi pada harganya sendiri')

// ── 7. Total lintas alat ───────────────────────────────────────────────────
{
  const daftar = [
    GENSET,                                            // 54 jt di Juli
    { ...GENSET, id: 'a2', harga: 12_000_000, umur_bulan: 24 }, // 12jt − 3jt = 9 jt
    { ...GENSET, id: 'a3', dilepas_at: '2026-03-15' },  // sudah dilepas
  ]
  assert(totalAsetTetap(daftar, JULI) === 54_000_000 + 9_000_000,
    'yang sudah dilepas TIDAK ikut menambah aset — barangnya sudah tidak ada')
  assert(totalPerolehan(daftar) === 60_000_000 + 12_000_000,
    'harga perolehan juga hanya yang masih dimiliki')
  assert(dekat(penyusutanBulanIni(daftar, JULI), 1_000_000 + 500_000),
    'beban penyusutan bulan ini dari kedua alat yang masih hidup')

  // Alat yang umurnya sudah habis tidak lagi membebani laba.
  assert(penyusutanBulanIni([GENSET], LAMA) === 0,
    'alat yang umurnya habis berhenti membebani laba')

  assert(totalAsetTetap(null) === 0, 'daftar null aman')
  assert(totalAsetTetap([]) === 0, 'daftar kosong aman')
  assert(penyusutanBulanIni(null) === 0, 'penyusutan daftar null aman')
}

// ── 8. Neraca TETAP SEIMBANG dengan aset tetap ─────────────────────────────
//
// Inilah jaminan yang paling penting. Harga beli alat sudah keluar dari kas
// dan sudah tercatat sebagai pengeluaran; nilai bukunya ditambahkan kembali ke
// laba supaya yang membebani laba hanyalah penyusutannya. Kalau aljabarnya
// salah, neracanya akan tetap tercetak — hanya angkanya yang bohong.
{
  const masuk = [
    { id: 'm1', tanggal: '2026-01-05', sumber: 'Modal', kategori: 'modal', jumlah: 200_000_000 },
    { id: 'm2', tanggal: '2026-02-05', sumber: 'Termin 1', kategori: 'termin', jumlah: 300_000_000 },
  ]
  const keluar = [
    // Pembelian gensetnya sendiri — tetap tercatat sebagai uang yang keluar.
    { id: 'k1', tanggal: '2026-01-15', kategori: 'alat', jumlah: 60_000_000 },
    { id: 'k2', tanggal: '2026-03-01', kategori: 'bangunan', jumlah: 80_000_000 },
  ]
  const stok = [{ nilai: 25_000_000 }]
  const AT = totalAsetTetap([GENSET], JULI) // 54 juta

  const n = hitungNeraca(masuk, keluar, stok, AT)
  assert(n.seimbang === true, 'neraca dengan aset tetap TETAP seimbang')
  assert(n.asetTetap === 54_000_000, 'aset tetapnya nilai buku, bukan harga perolehan')
  assert(n.totalAset === n.totalPasiva, 'aset dan pasiva persis sama')
  assert(n.kas === 500_000_000 - 140_000_000, 'kas tidak berubah oleh aset tetap')
  assert(n.totalAset === n.kas + n.persediaan + n.asetTetap, 'total aset = kas + stok + alat')

  // Yang tersisa membebani laba tepat sebesar akumulasi penyusutannya.
  const tanpaAlat = hitungNeraca(masuk, [keluar[1]], stok, 0)
  assert(tanpaAlat.labaBerjalan - n.labaBerjalan === akumulasiPenyusutan(GENSET, JULI),
    'beban yang tersisa dari gensetnya tepat sebesar penyusutannya — bukan seluruh harganya')

  // Bawaan 0: hasil identik dengan sebelum perubahan. Jaminan tanpa regresi.
  const lama = hitungNeraca(masuk, keluar, stok)
  assert(lama.asetTetap === 0, 'tanpa argumen keempat, aset tetapnya nol')
  assert(lama.totalAset === lama.kas + lama.persediaan, 'perilaku lama utuh')
  assert(lama.seimbang === true, 'dan tetap seimbang')

  // Masukan yang tidak masuk akal tidak boleh merusak neraca.
  for (const buruk of [NaN, Infinity, -5_000_000, 'abc', null, undefined]) {
    const x = hitungNeraca(masuk, keluar, stok, buruk)
    assert(Number.isFinite(x.totalAset), `total aset tetap angka untuk asetTetap=${buruk}`)
    assert(x.seimbang === true, `neraca tetap seimbang untuk asetTetap=${buruk}`)
    assert(x.asetTetap >= 0, 'aset tetap tidak pernah negatif')
  }
}

// ── 9. Lokasi alat ─────────────────────────────────────────────────────────
{
  const PROYEK = [{ id: 'p1', nama: 'Noble Cove' }, { id: 'p2', nama: 'Ruko Pak Soni' }]
  assert(lokasiAlat(GENSET, PROYEK) === 'Gudang', 'tanpa lokasi proyek berarti di gudang')
  assert(lokasiAlat({ ...GENSET, lokasi_project_id: 'p1' }, PROYEK) === 'Noble Cove',
    'nama proyek dibaca dari daftar, bukan dari salinan yang tersimpan')
  // Nama proyek yang berubah ikut terbarui — itulah sebabnya dibaca dari daftar.
  assert(lokasiAlat({ ...GENSET, lokasi_project_id: 'p1', lokasi_nama: 'Nama Lama' }, PROYEK)
    === 'Noble Cove', 'daftar menang atas salinan lama')
  // Proyek yang sudah dihapus jatuh ke salinan namanya.
  assert(lokasiAlat({ ...GENSET, lokasi_project_id: 'p9', lokasi_nama: 'Proyek Lama' }, PROYEK)
    === 'Proyek Lama', 'proyek yang sudah tidak ada memakai nama yang tersimpan')
  assert(lokasiAlat({ ...GENSET, lokasi_project_id: 'p9' }, PROYEK) === 'Proyek (tidak dikenal)',
    'tanpa keduanya, dikatakan tidak dikenal — bukan dibiarkan kosong')
  assert(lokasiAlat(dilepas, PROYEK) === 'Sudah dilepas', 'yang dilepas dikatakan apa adanya')
  assert(lokasiAlat(null, PROYEK) === 'Gudang', 'null aman')
  assert(lokasiAlat(GENSET, null) === 'Gudang', 'daftar proyek null aman')
}

// ── 10. Gerbang simpan ─────────────────────────────────────────────────────
{
  assert(siapSimpanAset(GENSET).boleh === true, 'aset lengkap boleh disimpan')
  assert(siapSimpanAset({ ...GENSET, nama: '  ' }).boleh === false, 'nama kosong ditolak')
  assert(siapSimpanAset({ ...GENSET, tanggal_beli: '' }).boleh === false, 'tanggal kosong ditolak')
  assert(siapSimpanAset({ ...GENSET, tanggal_beli: 'kemarin' }).boleh === false,
    'tanggal yang tidak terbaca ditolak — kalau lolos, seluruh penyusutannya jadi nol diam-diam')
  // Harga nol DITOLAK, berbeda dari baris PO yang harganya boleh menyusul.
  assert(siapSimpanAset({ ...GENSET, harga: 0 }).boleh === false,
    'aset bernilai nol ditolak: tidak menambah apa pun ke neraca dan tidak menyusut apa pun')
  assert(siapSimpanAset({ ...GENSET, umur_bulan: 0 }).boleh === true,
    'umur nol SAH — itu pilihan "tidak disusutkan", bukan kesalahan')
  assert(siapSimpanAset({ ...GENSET, umur_bulan: -1 }).boleh === false, 'umur minus ditolak')
  assert(siapSimpanAset({ ...GENSET, nilai_residu: -1 }).boleh === false, 'residu minus ditolak')
  assert(siapSimpanAset({ ...GENSET, nilai_residu: 99_000_000_000 }).boleh === false,
    'residu melebihi harga ditolak')
  assert(siapSimpanAset({}).boleh === false, 'objek kosong ditolak')
  assert(siapSimpanAset(null).boleh === false, 'null ditolak, bukan melempar')
  assert(siapSimpanAset(GENSET).alasan === '', 'yang lolos tanpa alasan')
  assert(siapSimpanAset({ ...GENSET, harga: 0 }).alasan.length > 0, 'yang ditolak selalu beralasan')
}

// ── 11. Label & pilihan ────────────────────────────────────────────────────
for (const k of ['baik', 'perlu_servis', 'rusak']) {
  assert(LABEL_KONDISI[k], `label kondisi ${k} ada`)
  assert(TONE_KONDISI[k], `tone kondisi ${k} ada`)
}
assert(ASET_KOSONG.kondisi === 'baik', 'aset baru bawaannya kondisi baik')
assert(ASET_KOSONG.umur_bulan === 60, 'umur bawaannya lima tahun')
assert(ASET_KOSONG.dilepas_at === null, 'aset baru belum dilepas')
assert(PILIHAN_UMUR.some(p => p.bulan === 0), 'ada pilihan "tidak disusutkan"')
assert(PILIHAN_UMUR.every(p => p.label && p.bulan >= 0), 'setiap pilihan berlabel dan tidak minus')

console.log(`aset-alat: ${ok} assert lulus`)
