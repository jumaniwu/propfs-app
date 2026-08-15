// ============================================================
// Pengelompokan daftar per bulan.
//
// Dua hal yang diuji keras, karena keduanya salah tanpa terlihat salah:
//
//   1. BULAN DIBACA DARI TEKS, bukan lewat `new Date()`. Tanggal di aplikasi
//      ini berbentuk `YYYY-MM-DD` tanpa zona waktu. `new Date('2026-08-01')`
//      adalah tengah malam UTC — di setiap zona waktu barat ia menjadi
//      31 Juli setempat, dan SELURUH transaksi tanggal 1 pindah ke bulan
//      sebelumnya. Tidak ada yang akan menyadarinya kecuali totalnya
//      dibandingkan dengan buku.
//
//   2. BARIS TANPA TANGGAL TIDAK BOLEH HILANG. Membuangnya membuat data
//      lenyap dari layar tanpa jejak; menaruhnya di bulan berjalan membuatnya
//      mengaku baru.
// ============================================================
import {
  bulanDari, labelBulanPanjang, bulanBerjalan, kelompokPerBulan,
  pilihanBulan, saringBulan, SEMUA_BULAN, TANPA_TANGGAL,
} from '../src/lib/kelompokBulan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. bulanDari: dibaca dari teks ─────────────────────────────────────────
assert(bulanDari('2026-08-14') === '2026-08', 'tanggal biasa')
assert(bulanDari('2026-08-14T03:00:00Z') === '2026-08', 'cap waktu ISO juga terbaca')
assert(bulanDari('2026-01-01') === '2026-01', 'tanggal 1 Januari tetap Januari')

// INTI: tanggal 1 tidak boleh pindah bulan, apa pun zona waktunya.
assert(bulanDari('2026-08-01') === '2026-08',
  'tanggal 1 Agustus tetap Agustus — bukan Juli, yang akan terjadi bila lewat new Date()')
assert(bulanDari('2026-12-01') === '2026-12', 'tanggal 1 Desember tetap Desember')
assert(bulanDari('2026-01-01T00:00:00Z') === '2026-01',
  'tengah malam 1 Januari tetap Januari, bukan Desember tahun lalu')

assert(bulanDari('2026-13-01') === TANPA_TANGGAL, 'bulan 13 tidak ada')
assert(bulanDari('2026-00-01') === TANPA_TANGGAL, 'bulan 00 tidak ada')
assert(bulanDari('') === TANPA_TANGGAL, 'kosong')
assert(bulanDari(null) === TANPA_TANGGAL, 'null aman')
assert(bulanDari(undefined) === TANPA_TANGGAL, 'undefined aman')
assert(bulanDari('kemarin') === TANPA_TANGGAL, 'teks bebas')
assert(bulanDari('2026-8-14') === TANPA_TANGGAL, 'bulan satu digit bukan bentuk yang dipakai')

// ── 2. Label ───────────────────────────────────────────────────────────────
assert(labelBulanPanjang('2026-08') === 'Agustus 2026', 'nama bulan Indonesia')
assert(labelBulanPanjang('2026-01') === 'Januari 2026', 'Januari')
assert(labelBulanPanjang('2026-12') === 'Desember 2026', 'Desember')
assert(labelBulanPanjang(TANPA_TANGGAL) === 'Tanpa tanggal', 'kelompok tanpa tanggal berlabel jelas')
assert(labelBulanPanjang('ngawur') === 'ngawur', 'yang tak dikenal dikembalikan apa adanya')
assert(labelBulanPanjang(null) === '', 'null aman')

assert(/^\d{4}-\d{2}$/.test(bulanBerjalan()), 'bulan berjalan berbentuk YYYY-MM')
assert(bulanBerjalan(new Date(2026, 7, 14)) === '2026-08', 'Agustus = 08, bukan 8')
assert(bulanBerjalan(new Date(2026, 0, 1)) === '2026-01', 'Januari berpadding nol')

// ── 3. Pengelompokan ───────────────────────────────────────────────────────
const AGUSTUS = new Date(2026, 7, 14)
const BARIS = [
  { id: 'a', tanggal: '2026-08-14', nilai: 5_000_000 },
  { id: 'b', tanggal: '2026-08-01', nilai: 240_000 },
  { id: 'c', tanggal: '2026-07-20', nilai: 1_000_000 },
  { id: 'd', tanggal: '2026-06-05', nilai: 2_900_000 },
  { id: 'e', tanggal: '2026-07-02', nilai: 500_000 },
  { id: 'f', tanggal: '', nilai: 777 },
]
{
  const k = kelompokPerBulan(BARIS, b => b.tanggal, { nilai: b => b.nilai, hariIni: AGUSTUS })

  assert(k.length === 4, 'tiga bulan + satu kelompok tanpa tanggal')
  assert(k.map(x => x.bulan).join(',') === `2026-08,2026-07,2026-06,${TANPA_TANGGAL}`,
    'terbaru lebih dulu, tanpa-tanggal paling akhir')

  assert(k[0].berjalan === true, 'Agustus adalah bulan berjalan')
  assert(k[1].berjalan === false, 'Juli sudah lewat')
  assert(k[3].berjalan === false, 'tanpa tanggal bukan bulan berjalan — ia tidak mengaku baru')

  assert(k[0].baris.length === 2 && k[0].total === 5_240_000, 'Agustus: dua baris, totalnya benar')
  assert(k[1].baris.length === 2 && k[1].total === 1_500_000, 'Juli: dua baris')
  assert(k[3].baris.length === 1, 'baris tanpa tanggal TIDAK hilang')
  assert(k[0].label === 'Agustus 2026', 'kelompok berlabel nama bulan')

  // Urutan di dalam kelompok mengikuti urutan masukan — pemanggil yang
  // mengurutkannya, bukan modul ini.
  assert(k[0].baris[0].id === 'a' && k[0].baris[1].id === 'b', 'urutan dalam kelompok utuh')

  // Tidak ada baris yang hilang, berapa pun kelompoknya.
  const jumlah = k.reduce((s, x) => s + x.baris.length, 0)
  assert(jumlah === BARIS.length, `seluruh ${BARIS.length} baris terhitung, bukan ${jumlah}`)
}

// Tanpa fungsi nilai, totalnya nol — bukan NaN.
{
  const k = kelompokPerBulan(BARIS, b => b.tanggal, { hariIni: AGUSTUS })
  assert(k.every(x => x.total === 0), 'tanpa fungsi nilai, total nol')
  assert(k.every(x => Number.isFinite(x.total)), 'dan tetap angka')
}

// Nilai yang bukan angka tidak boleh melahirkan NaN yang menular ke total.
{
  const k = kelompokPerBulan(
    [{ t: '2026-08-01', v: 'abc' }, { t: '2026-08-02', v: 100 }],
    b => b.t, { nilai: b => b.v, hariIni: AGUSTUS },
  )
  assert(k[0].total === 100, 'nilai yang bukan angka dihitung nol, bukan merusak seluruh total')
}

// Masukan yang tidak berbentuk daftar.
assert(kelompokPerBulan(null, b => b.t).length === 0, 'null aman')
assert(kelompokPerBulan(undefined, b => b.t).length === 0, 'undefined aman')
assert(kelompokPerBulan([], b => b.t).length === 0, 'kosong aman')
assert(kelompokPerBulan([null, undefined], b => b?.t).length === 0, 'baris null dilewati')

// Bulan berjalan yang tidak punya baris sama sekali: tidak dibuatkan kelompok
// kosong. Kotak kosong bertuliskan "Agustus 2026 (0)" tidak menerangkan apa pun.
{
  const k = kelompokPerBulan([{ t: '2026-06-05' }], b => b.t, { hariIni: AGUSTUS })
  assert(k.length === 1 && k[0].bulan === '2026-06', 'bulan tanpa isi tidak dibuatkan kelompok')
  assert(k[0].berjalan === false, 'dan bulan lama tetap terlipat')
}

// ── 4. Pemilih bulan ───────────────────────────────────────────────────────
{
  const k = kelompokPerBulan(BARIS, b => b.tanggal, { hariIni: AGUSTUS })
  const p = pilihanBulan(k)

  assert(p[0].nilai === SEMUA_BULAN, '"Semua bulan" selalu paling atas')
  assert(p[0].jumlah === BARIS.length, 'jumlahnya seluruh baris')
  assert(p[0].label.includes(String(BARIS.length)), 'jumlahnya ikut tertulis')
  assert(p.length === k.length + 1, 'satu pilihan per kelompok, plus "semua"')
  assert(p[1].label === 'Agustus 2026 (2)', 'label memuat nama bulan dan jumlahnya')

  // Bulan yang tidak punya isi tidak pernah ditawarkan.
  assert(p.every(x => x.jumlah > 0), 'tidak ada pilihan bulan kosong')

  assert(pilihanBulan(null)[0].jumlah === 0, 'null aman')
  assert(pilihanBulan([]).length === 1, 'kosong tetap punya "Semua bulan"')
}

// ── 5. Penyaringan ─────────────────────────────────────────────────────────
{
  const k = kelompokPerBulan(BARIS, b => b.tanggal, { hariIni: AGUSTUS })

  assert(saringBulan(k, SEMUA_BULAN).length === k.length, '"semua" tidak menyaring apa pun')
  assert(saringBulan(k, '').length === k.length, 'pilihan kosong sama dengan "semua"')

  const juli = saringBulan(k, '2026-07')
  assert(juli.length === 1 && juli[0].bulan === '2026-07', 'satu bulan tersaring')
  // INTI: bulan lama yang DIPILIH SENGAJA harus terbuka. Orang yang memilih
  // Juli ingin melihat isinya, bukan satu baris terlipat bertuliskan "Juli".
  assert(juli[0].berjalan === true, 'bulan yang dipilih sengaja ditampilkan terbuka')
  assert(juli[0].baris.length === 2, 'isinya utuh')

  // Menyaring tidak boleh mengubah kelompok aslinya.
  assert(k[1].berjalan === false, 'kelompok asli tidak ikut berubah')

  assert(saringBulan(k, '2026-01').length === 0, 'bulan tanpa isi menghasilkan kosong')
  assert(saringBulan(null, '2026-07').length === 0, 'null aman')
  assert(saringBulan(k, TANPA_TANGGAL)[0].bulan === TANPA_TANGGAL, 'tanpa-tanggal bisa dipilih juga')
}

console.log(`kelompok-bulan: ${ok} assert lulus`)
