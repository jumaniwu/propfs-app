// ============================================================
// Kwitansi digital & kewajiban e-Meterai.
//
// Dua hal yang diuji keras di sini, karena keduanya salah tanpa terlihat salah:
//
//   1. AMBANG METERAI. UU No. 10/2020 berbunyi "lebih dari Rp5.000.000" —
//      persis lima juta TIDAK wajib. Salah membacanya berarti membuang kuota
//      pada dokumen yang tidak memerlukannya, atau melewatkannya pada yang
//      memerlukan sehingga dokumennya lemah sebagai alat bukti.
//
//   2. TERBILANG. "seratus" bukan "satu ratus", "seribu" bukan "satu ribu",
//      "sebelas" bukan "satu puluh satu". Kwitansi dengan terbilang keliru
//      dipersoalkan justru ketika ia paling dibutuhkan — dan angka di baris
//      atasnya tetap terlihat benar.
// ============================================================
import {
  AMBANG_MATERAI, TARIF_MATERAI, perluMaterai, statusMaterajAwal, nomorKwitansi,
  terbilang, sisaKuota, bolehBubuhMaterai, siapKirimKwitansi, pesanWaKwitansi,
  KWITANSI_KOSONG, LABEL_STATUS_MATERAI, TONE_STATUS_MATERAI, LABEL_METODE_TERIMA,
} from '../src/lib/kwitansi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Ambang meterai: "LEBIH DARI" lima juta ───────────────────────────
assert(AMBANG_MATERAI === 5_000_000, 'ambangnya lima juta')
assert(TARIF_MATERAI === 10_000, 'tarifnya sepuluh ribu, satu tarif sejak 2021')
assert(perluMaterai(5_000_001) === true, 'lima juta lebih satu rupiah: WAJIB')
assert(perluMaterai(5_000_000) === false,
  'persis lima juta: TIDAK wajib — undang-undangnya berbunyi "lebih dari"')
assert(perluMaterai(4_999_999) === false, 'di bawahnya jelas tidak')
assert(perluMaterai(250_000_000) === true, 'termin besar wajib')
assert(perluMaterai(0) === false, 'nol tidak')
assert(perluMaterai(-9_000_000) === false, 'nilai negatif tidak dianggap wajib')
assert(perluMaterai('7000000') === true, 'angka berupa teks tetap terbaca')
assert(perluMaterai('bukan angka') === false, 'yang tidak terbaca tidak dipaksa wajib')
assert(perluMaterai(null) === false && perluMaterai(undefined) === false, 'kosong aman')
assert(perluMaterai(NaN) === false, 'NaN tidak lolos jadi "wajib"')
// Nilai yang tidak masuk akal TIDAK diputuskan di sini. `perluMaterai`
// menjawab pertanyaan hukum tentang sebuah nominal; nominal yang rusak bukan
// nominal, dan yang menahannya adalah gerbang lain yang lebih ketat.
assert(perluMaterai(Infinity) === false, 'tak hingga bukan nominal yang sah')
{
  const rusak = { ...KWITANSI_KOSONG, penerima_dari: 'A', untuk_pembayaran: 'B',
    penanda_nama: 'C', jumlah: Number.NaN }
  assert(siapKirimKwitansi(rusak).boleh === false,
    'dan nominal rusak tetap tidak bisa dikirim — tertahan di syarat "nominal harus di atas nol"')
  assert(siapKirimKwitansi({ ...rusak, jumlah: Infinity }).boleh === true,
    'catatan: tak hingga lolos gerbang ">0"; ia mustahil datang dari form maupun kolom numeric')
}

assert(statusMaterajAwal(9_000_000) === 'menunggu', 'yang wajib lahir sebagai menunggu')
assert(statusMaterajAwal(1_000_000) === 'tidak_perlu', 'yang tidak wajib lahir sebagai tidak perlu')

// ── 2. Terbilang ────────────────────────────────────────────────────────
const t = terbilang
assert(t(0) === 'Nol rupiah', 'nol')
assert(t(1) === 'Satu rupiah', 'satu')
assert(t(11) === 'Sebelas rupiah', 'sebelas — BUKAN "satu puluh satu"')
assert(t(12) === 'Dua belas rupiah', 'dua belas')
assert(t(20) === 'Dua puluh rupiah', 'dua puluh')
assert(t(21) === 'Dua puluh satu rupiah', 'dua puluh satu')
assert(t(100) === 'Seratus rupiah', 'seratus — BUKAN "satu ratus"')
assert(t(101) === 'Seratus satu rupiah', 'seratus satu')
assert(t(200) === 'Dua ratus rupiah', 'dua ratus')
assert(t(1000) === 'Seribu rupiah', 'seribu — BUKAN "satu ribu"')
assert(t(1500) === 'Seribu lima ratus rupiah', 'seribu lima ratus')
assert(t(2000) === 'Dua ribu rupiah', 'dua ribu')
assert(t(1_000_000) === 'Satu juta rupiah', 'satu juta — di sini "satu" memang benar')
assert(t(1_000_000_000) === 'Satu miliar rupiah', 'satu miliar')
assert(t(1_000_000_000_000) === 'Satu triliun rupiah', 'satu triliun')

// Angka yang benar-benar dipakai pada kwitansi termin.
assert(t(2_390_000) === 'Dua juta tiga ratus sembilan puluh ribu rupiah', `2.390.000: ${t(2_390_000)}`)
assert(t(250_000_000) === 'Dua ratus lima puluh juta rupiah', `250 juta: ${t(250_000_000)}`)
assert(t(1_250_500_000) === 'Satu miliar dua ratus lima puluh juta lima ratus ribu rupiah',
  `1,2505 miliar: ${t(1_250_500_000)}`)
assert(t(15_000_000) === 'Lima belas juta rupiah', `15 juta: ${t(15_000_000)}`)
assert(t(110_000) === 'Seratus sepuluh ribu rupiah', `110 ribu: ${t(110_000)}`)
assert(t(111_111) === 'Seratus sebelas ribu seratus sebelas rupiah', `111.111: ${t(111_111)}`)

// Sen dibuang, bukan dibulatkan ke atas: kwitansi menyatakan uang yang
// BENAR-BENAR diterima, dan menambahkannya walau satu rupiah adalah salah.
assert(t(1_500_000.9) === 'Satu juta lima ratus ribu rupiah', 'pecahan dipotong, tidak dibulatkan naik')
assert(t(-5000) === 'Lima ribu rupiah', 'nilai negatif tetap terbaca sebagai angkanya')
assert(t(null) === 'Nol rupiah' && t('') === 'Nol rupiah', 'kosong & null aman')
assert(t('2390000') === 'Dua juta tiga ratus sembilan puluh ribu rupiah', 'teks berangka terbaca')
assert(!/\s{2}/.test(t(1_250_500_000)), 'tidak ada spasi ganda')
assert(!/undefined|NaN/.test(t(999_999_999)), 'tidak ada sisa teknis yang bocor ke dokumen')

// ── 3. Nomor kwitansi ───────────────────────────────────────────────────
{
  const d = new Date('2026-08-14T00:00:00Z')
  assert(nomorKwitansi(7, d) === 'KW/2026/08/0007', `nomornya berurut per bulan: ${nomorKwitansi(7, d)}`)
  assert(nomorKwitansi(1, d) === 'KW/2026/08/0001', 'yang pertama')
  assert(nomorKwitansi(0, d) === 'KW/2026/08/0001', 'urutan nol tetap menghasilkan nomor sah')
  assert(nomorKwitansi(12345, d) === 'KW/2026/08/12345', 'lebih dari empat angka tidak dipotong')
}

// ── 4. Kuota e-Meterai ──────────────────────────────────────────────────
assert(sisaKuota({ dibeli: 100, terpakai: 37 }) === 63, 'sisa kuota dihitung')
assert(sisaKuota({ dibeli: 10, terpakai: 10 }) === 0, 'habis')
assert(sisaKuota({ dibeli: 5, terpakai: 9 }) === 0, 'tidak pernah negatif')
assert(sisaKuota(null) === 0 && sisaKuota(undefined) === 0, 'tanpa data aman')

// ── 5. Kapan meterai BOLEH dibubuhkan ───────────────────────────────────
//
// Alasannya dikembalikan, bukan sekadar boleh/tidak: tombol mati tanpa sebab
// membuat orang mengira fiturnya rusak, lalu mengirim kwitansinya tanpa
// meterai — persis akibat yang ingin dicegah.
const KUOTA = { dibeli: 10, terpakai: 3 }
{
  const r = bolehBubuhMaterai({ jumlah: 9_000_000, materai_status: 'menunggu' }, KUOTA, true)
  assert(r.boleh === true, 'wajib + kuota ada + penyedia siap: boleh')
}
{
  const r = bolehBubuhMaterai({ jumlah: 3_000_000, materai_status: 'tidak_perlu' }, KUOTA, true)
  assert(r.boleh === false && /tidak wajib/i.test(r.alasan),
    'nominal kecil ditolak, dengan alasan yang menenangkan bukan menakutkan')
}
{
  const r = bolehBubuhMaterai({ jumlah: 9_000_000, materai_status: 'terbubuh' }, KUOTA, true)
  assert(r.boleh === false && /sudah terbubuh/i.test(r.alasan),
    'yang sudah bermeterai tidak dibubuhi dua kali — itu kuota terbuang')
}
{
  const r = bolehBubuhMaterai({ jumlah: 9_000_000, materai_status: 'menunggu' }, KUOTA, false)
  assert(r.boleh === false && /distributor resmi/i.test(r.alasan),
    'penyedia belum terhubung: alasannya menyebut langkah nyatanya')
}
{
  const r = bolehBubuhMaterai({ jumlah: 9_000_000, materai_status: 'menunggu' },
    { dibeli: 4, terpakai: 4 }, true)
  assert(r.boleh === false && /kuota/i.test(r.alasan), 'kuota habis ditolak dengan sebabnya')
}
{
  const r = bolehBubuhMaterai({ jumlah: 9_000_000, materai_status: 'menunggu' }, null, true)
  assert(r.boleh === false, 'tanpa data kuota dianggap belum punya, bukan tak terbatas')
}

// ── 6. INTI: yang wajib bermeterai tidak boleh dikirim tanpa meterai ────
//
// Bukan karena aplikasinya rewel. Dokumen yang sudah dipegang konsumen tidak
// bisa ditarik kembali untuk dimeterai belakangan; yang bisa ditunda adalah
// pengirimannya, bukan meterainya.
const LENGKAP = {
  ...KWITANSI_KOSONG, nomor: 'KW/2026/08/0007', tanggal: '2026-08-14',
  penerima_dari: 'Bapak Andi', untuk_pembayaran: 'Termin 2 Ruko A-3',
  jumlah: 250_000_000, penanda_nama: 'Jumani', materai_status: 'menunggu',
}
{
  const r = siapKirimKwitansi(LENGKAP)
  assert(r.boleh === false, '250 juta tanpa meterai: TIDAK boleh dikirim')
  assert(/wajib bermeterai/i.test(r.alasan), 'dan alasannya menyebut kewajibannya')
  assert(/tidak bisa ditarik kembali/i.test(r.alasan),
    'beserta sebab mengapa tidak bisa dikerjakan belakangan')
}
{
  const r = siapKirimKwitansi({ ...LENGKAP, materai_status: 'terbubuh' })
  assert(r.boleh === true, 'setelah meterainya terbubuh, boleh dikirim')
}
{
  const kecil = { ...LENGKAP, jumlah: 2_000_000, materai_status: 'tidak_perlu' }
  assert(siapKirimKwitansi(kecil).boleh === true, 'nominal kecil boleh dikirim tanpa meterai')
}
{
  assert(siapKirimKwitansi({ ...LENGKAP, penerima_dari: '' }).alasan.includes('penyetor'),
    'yang kurang disebutkan namanya, bukan ditolak diam-diam')
  assert(siapKirimKwitansi({ ...LENGKAP, jumlah: 0 }).boleh === false, 'nominal nol ditolak')
  assert(siapKirimKwitansi({ ...LENGKAP, penanda_nama: '' }).boleh === false,
    'tanpa penanda tangan ditolak')
  assert(siapKirimKwitansi(KWITANSI_KOSONG).boleh === false, 'yang kosong ditolak')
}

// ── 7. Pesan WhatsApp ───────────────────────────────────────────────────
{
  const TAUTAN = 'https://propfs.id/r/ABCD2345MNPQ'
  const p = pesanWaKwitansi({ ...LENGKAP, materai_status: 'terbubuh' }, TAUTAN)
  assert(p.includes(TAUTAN), 'tautan kwitansinya ada')
  assert(p.includes('Bapak Andi') && p.includes('Rp 250.000.000'), 'nama & nominal ikut')
  assert(p.includes('KW/2026/08/0007'), 'nomor kwitansinya ikut')
  assert(/e-Meterai/i.test(p), 'menyebut meterainya bila memang sudah terbubuh')

  // Menyebut meterai pada dokumen yang belum bermeterai berarti menyatakan
  // sesuatu yang tidak benar tentang kekuatan hukum dokumen itu sendiri.
  const belum = pesanWaKwitansi({ ...LENGKAP, materai_status: 'menunggu' }, TAUTAN)
  assert(!/e-Meterai/i.test(belum), 'dan TIDAK menyebutnya bila belum')
  assert(belum.includes(TAUTAN), 'tautannya tetap ada')
}

// ── 8. Label lengkap ────────────────────────────────────────────────────
for (const s of ['tidak_perlu', 'menunggu', 'terbubuh', 'gagal']) {
  assert(LABEL_STATUS_MATERAI[s] && TONE_STATUS_MATERAI[s], `label & warna status ${s} ada`)
}
for (const m of ['transfer', 'tunai', 'giro', 'lainnya']) {
  assert(LABEL_METODE_TERIMA[m], `label metode ${m} ada`)
}

console.log(`kwitansi: ${ok} assert lulus`)
