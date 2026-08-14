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
  terbilang, sisaKuota, bolehBubuhMaterai, siapKirimKwitansi, siapSimpanKwitansi,
  pesanWaKwitansi,
  peringatanMaterai, TAUTAN_EMETERAI, berkasUntukKonsumen,
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
  // DIREVISI: kewajiban meterai TIDAK LAGI menahan pengiriman.
  //
  // Pembubuhannya dikerjakan sendiri di situs e-Meterai, dan menahan
  // dokumennya di sini berarti menahan pekerjaan yang memang harus keluar dari
  // aplikasi ini dulu. Kewajibannya tetap DIKATAKAN, tetapi yang memutuskan
  // kapan mengirim adalah orang yang mengerjakannya.
  const r = siapKirimKwitansi(LENGKAP)
  assert(r.boleh === true, '250 juta tanpa meterai TETAP boleh dikirim — tidak lagi ditahan')

  const p = peringatanMaterai(LENGKAP)
  assert(p, 'tetapi peringatannya ada')
  assert(/wajib bermeterai/i.test(p), 'menyebut kewajibannya')
  assert(/UU No. 10\/2020/.test(p), 'beserta dasar hukumnya')
  assert(/Unduh PDF/i.test(p), 'dan langkah nyatanya: unduh, bubuhkan, tandai')
  assert(/^https:\/\//.test(TAUTAN_EMETERAI), 'tautan situs resminya tersedia')
}
{
  // Setelah ditandai sudah dibubuhkan sendiri, peringatannya hilang.
  assert(peringatanMaterai({ ...LENGKAP, materai_status: 'terbubuh' }) === '',
    'yang sudah bermeterai tidak diperingatkan lagi')
  assert(peringatanMaterai({ jumlah: 2_000_000, materai_status: 'tidak_perlu' }) === '',
    'yang tidak wajib tidak pernah diperingatkan')
  assert(peringatanMaterai({}) === '', 'masukan kosong aman')
}
{
  const r = siapKirimKwitansi({ ...LENGKAP, materai_status: 'terbubuh' })
  assert(r.boleh === true, 'setelah meterainya terbubuh, tentu boleh dikirim')
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

// ── 6b. Menyimpan dan mengirim adalah dua peristiwa yang berbeda ────────
//
// Formulir kwitansi kini hanya MENYIMPAN. Unduh PDF, pembubuhan meterai, dan
// pengiriman ke konsumen dikerjakan dari daftar kwitansi terbit, karena
// ketiganya berulang dan terjadi pada waktu yang berlainan.
//
// Yang dijaga di sini: gerbang simpan tidak boleh ikut menuntut hal-hal yang
// hanya diperlukan saat mengirim. Kwitansi yang isinya sudah lengkap tetap
// layak tersimpan meskipun nomor WhatsApp konsumennya baru dicari besok —
// kalau tidak, satu kolom kosong membuat seluruh pekerjaan pengisian hilang.
{
  assert(siapSimpanKwitansi(LENGKAP).boleh === true, 'yang lengkap boleh disimpan')
  assert(siapSimpanKwitansi(LENGKAP).alasan === '', 'tanpa alasan penolakan')

  assert(siapSimpanKwitansi({ ...LENGKAP, penerima_wa: '' }).boleh === true,
    'tanpa nomor WhatsApp TETAP boleh disimpan — itu syarat mengirim, bukan menyimpan')
  assert(siapSimpanKwitansi({ ...LENGKAP, penanda_signature: null }).boleh === true,
    'belum ditandatangani pun boleh disimpan')
  assert(siapSimpanKwitansi({ ...LENGKAP, materai_status: 'menunggu' }).boleh === true,
    'belum bermeterai tidak menahan penyimpanan')

  assert(siapSimpanKwitansi({ ...LENGKAP, penerima_dari: '   ' }).boleh === false,
    'nama penyetor berisi spasi saja tetap dianggap kosong')
  assert(siapSimpanKwitansi({ ...LENGKAP, penerima_dari: '' }).alasan.includes('penyetor'),
    'alasannya disebutkan, bukan ditolak diam-diam')
  assert(siapSimpanKwitansi({ ...LENGKAP, untuk_pembayaran: '' }).alasan.includes('Uraian'),
    'uraian pembayaran kosong ditolak dengan alasannya')
  assert(siapSimpanKwitansi({ ...LENGKAP, jumlah: 0 }).boleh === false, 'nominal nol ditolak')
  assert(siapSimpanKwitansi({ ...LENGKAP, jumlah: -5 }).boleh === false, 'nominal minus ditolak')
  assert(siapSimpanKwitansi({ ...LENGKAP, penanda_nama: '' }).boleh === false,
    'tanpa nama penanda tangan ditolak')
  assert(siapSimpanKwitansi(KWITANSI_KOSONG).boleh === false, 'yang kosong ditolak')

  // Masukan yang tidak berbentuk kwitansi sama sekali tidak boleh melempar:
  // gerbang ini dipanggil pada tiap ketikan di dalam formulir.
  assert(siapSimpanKwitansi({}).boleh === false, 'objek kosong ditolak, bukan melempar')
  assert(siapSimpanKwitansi(null).boleh === false, 'null ditolak, bukan melempar')
  assert(siapSimpanKwitansi(undefined).boleh === false, 'undefined ditolak, bukan melempar')
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

// ── Yang dikirim ke konsumen: versi bermeterai bila ada ─────────────────
//
// Mengirim PDF bersih padahal versi bermeterainya sudah diunggah berarti
// konsumen memegang dokumen yang lebih lemah daripada yang sudah dibayar
// meterainya — dan tidak ada yang akan menyadarinya sampai dipersoalkan.
assert(berkasUntukKonsumen({ materai_status: 'terbubuh', materai_pdf: 'data:application/pdf;base64,AA' })
  === 'bermeterai', 'versi bermeterai yang dikirim bila sudah diunggah')
assert(berkasUntukKonsumen({ materai_status: 'terbubuh', materai_pdf: '' }) === 'bersih',
  'ditandai terbubuh tetapi berkasnya belum ada: yang dikirim tetap yang bersih')
assert(berkasUntukKonsumen({ materai_status: 'menunggu', materai_pdf: 'data:x' }) === 'bersih',
  'berkas ada tetapi belum ditandai: belum dianggap bermeterai')
assert(berkasUntukKonsumen({ materai_status: 'tidak_perlu' }) === 'bersih',
  'yang tidak wajib memakai PDF biasa')
assert(berkasUntukKonsumen({}) === 'bersih', 'masukan kosong aman')
{
  const p = peringatanMaterai(LENGKAP)
  assert(/unggah kembali/i.test(p), `peringatannya menyebut langkah unggahnya: ${p}`)
}

console.log(`kwitansi: ${ok} assert lulus`)
