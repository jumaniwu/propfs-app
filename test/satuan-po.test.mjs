// ============================================================
// Memesan dalam satuan yang berbeda dari yang diminta lapangan.
//
// Yang dijaga di sini adalah satu kesalahan yang sangat mahal dan sangat
// sunyi: permintaan yang SUDAH dipenuhi penuh tetap tampak terbengkalai di
// panel "Menunggu Dipesan", karena PO-nya memakai satuan dagang (2 Ton)
// sedangkan permintaannya memakai satuan kerja (49 Batang), dan angka 2
// dikurangkan begitu saja dari 49.
//
// Tidak ada yang gagal, tidak ada galat, tidak ada pesan. Yang terjadi hanya:
// barangnya sudah datang, dan sistemnya masih menyuruh memesan lagi.
// ============================================================
import {
  SATUAN_UMUM, satuanSama, satuanDiubah, penuhiBawaan, penuhiBerlaku,
  siapBarisPesan, ringkasPesan, jumlah, barisUntukSimpan,
} from '../src/lib/satuanPo.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const baris = (p = {}) => ({
  satuanRequest: 'Batang', satuanPesan: 'Batang', qty: 10, sisa: 49, ...p,
})

// ── 1. Satuan yang sama adalah satuan yang sama ───────────────────────────
//
// Dibandingkan longgar dengan sengaja: memperlakukan "batang" dan "Batang"
// sebagai berbeda akan memunculkan kolom "memenuhi berapa" pada baris yang
// sebenarnya tidak berubah apa pun.
assert(satuanSama('Batang', 'batang') === true, 'beda huruf besar-kecil tetap sama')
assert(satuanSama(' Batang ', 'Batang') === true, 'spasi di tepi diabaikan')
assert(satuanSama('m  3', 'm 3') === true, 'spasi ganda dirapikan')
assert(satuanSama('Batang', 'Ton') === false, 'Batang bukan Ton')
assert(satuanSama('', '') === true, 'dua-duanya kosong: sama')
assert(satuanSama(null, undefined) === true, 'null dan undefined sama-sama kosong')
assert(satuanDiubah(baris({ satuanPesan: 'Ton' })) === true, 'Ton berbeda dari Batang')
assert(satuanDiubah(baris()) === false, 'satuan tidak diubah')

// ── 2. SATUAN SAMA: tidak ada satu pun yang berubah ───────────────────────
//
// Jalur ini dipakai hampir setiap hari. Ia tidak boleh terusik sama sekali
// oleh kemampuan baru yang hanya dipakai sesekali.
{
  const b = baris({ qty: 10 })
  assert(penuhiBawaan(b) === 10, 'yang dipenuhi = yang dipesan')
  assert(penuhiBerlaku(b) === 10, 'tanpa perlu diisi terpisah')
  assert(siapBarisPesan(b).boleh === true, 'boleh diterbitkan')
  assert(ringkasPesan(b) === '10 Batang', 'ringkasannya polos, tanpa penjelasan tambahan')

  // Batas atas tetap dijaga.
  assert(siapBarisPesan(baris({ qty: 50 })).boleh === false, 'melebihi sisa 49: ditolak')
  assert(/sisa yang belum dipesan hanya 49 Batang/.test(siapBarisPesan(baris({ qty: 50 })).alasan),
    'alasannya menyebut angka dan satuannya')
  assert(siapBarisPesan(baris({ qty: 49 })).boleh === true, 'pas sisa: boleh')
  assert(siapBarisPesan(baris({ qty: 0 })).boleh === false, 'nol: ditolak')
  assert(/belum diisi/i.test(siapBarisPesan(baris({ qty: 0 })).alasan), 'alasannya jelas')

  // `penuhi` TIDAK ikut disimpan bila satuannya sama — satu angka, satu
  // sumber kebenaran.
  const simpan = barisUntukSimpan(baris({ qty: 10, penuhi: 999 }))
  assert(!('penuhi' in simpan), 'penuhi dibuang saat satuannya sama, walau sempat terisi')
  assert(simpan.qty === 10, 'sisanya utuh')
}

// ── 3. SATUAN BERBEDA: inti perbaikannya ─────────────────────────────────
//
// Lapangan minta 49 Batang; pembelian dilakukan 2 Ton. Vendor harus membaca
// "2 Ton"; panel lapangan harus berkurang 49 Batang. Dua angka, dua pembaca.
{
  const b = baris({ satuanPesan: 'Ton', qty: 2, sisa: 49 })

  assert(penuhiBawaan(b) === 49,
    'bawaannya SELURUH sisa — memesan dalam satuan dagang hampir selalu menutup semuanya')
  assert(penuhiBerlaku(b) === 49, 'dan itu yang dipakai bila tidak diisi sendiri')

  // Ini yang dulu rusak: 2 < 49 sehingga lolos, lalu 49 - 2 = 47 tersisa
  // selamanya. Sekarang yang diperiksa dan yang dikurangkan adalah `penuhi`.
  assert(siapBarisPesan(b).boleh === true, '2 Ton yang menutup 49 Batang: boleh')
  assert(ringkasPesan(b) === '2 Ton — menutup 49 Batang dari permintaan lapangan',
    'ringkasannya menyebut KEDUA angka, supaya tidak ada yang perlu menebak')

  const simpan = barisUntukSimpan(b)
  assert(simpan.penuhi === 49, 'penuhi ikut disimpan')
  assert(simpan.qty === 2, 'qty tetap angka vendor')
  assert(simpan.satuanPesan === 'Ton', 'satuan tetap satuan vendor')

  // Boleh menutup sebagian saja — dua truk untuk satu permintaan besar.
  const separuh = baris({ satuanPesan: 'Ton', qty: 1, sisa: 49, penuhi: 25 })
  assert(penuhiBerlaku(separuh) === 25, 'yang diisi sendiri dipakai apa adanya')
  assert(siapBarisPesan(separuh).boleh === true, 'menutup sebagian: boleh')
  assert(barisUntukSimpan(separuh).penuhi === 25, 'angkanya tersimpan')

  // Tidak boleh menutup lebih dari yang diminta.
  const kelebihan = baris({ satuanPesan: 'Ton', qty: 3, sisa: 49, penuhi: 60 })
  assert(siapBarisPesan(kelebihan).boleh === false, 'menutup 60 dari permintaan 49: ditolak')
  assert(/hanya 49 Batang/.test(siapBarisPesan(kelebihan).alasan), 'alasannya menyebut satuan REQUEST')

  // Satuan pesan kosong bukan "sama dengan request" — itu kolom yang lupa diisi.
  const tanpaSatuan = baris({ satuanPesan: '', qty: 2 })
  assert(siapBarisPesan(tanpaSatuan).boleh === false, 'satuan kosong: ditolak')
  assert(/Satuan pesanan belum diisi/.test(siapBarisPesan(tanpaSatuan).alasan), 'alasannya tepat')
}

// ── 4. Sisa nol: tidak ada lagi yang bisa dipesan ────────────────────────
{
  const habis = baris({ satuanPesan: 'Ton', qty: 1, sisa: 0 })
  assert(siapBarisPesan(habis).boleh === false, 'sisa 0: tidak boleh dipesan lagi')
  const nolPenuhi = baris({ satuanPesan: 'Ton', qty: 1, sisa: 49, penuhi: 0 })
  assert(penuhiBerlaku(nolPenuhi) === 49, 'penuhi 0 dianggap belum diisi, jatuh ke bawaan')
}

// ── 5. Masukan yang tidak masuk akal tidak menghasilkan angka aneh ───────
{
  assert(penuhiBawaan(baris({ qty: NaN })) === 0, 'NaN jadi 0')
  assert(penuhiBawaan(baris({ qty: -5 })) === 0, 'negatif jadi 0')
  assert(penuhiBawaan(baris({ satuanPesan: 'Ton', sisa: -3 })) === 0, 'sisa negatif jadi 0')
  assert(siapBarisPesan(baris({ qty: 'dua' })).boleh === false, 'teks bukan jumlah')
  assert(siapBarisPesan(baris({ qty: Infinity })).boleh === false, 'Infinity ditolak')
}

// ── 6. jumlah(): dibaca orang Indonesia ──────────────────────────────────
assert(jumlah(2) === '2', 'bulat tanpa koma')
assert(jumlah(2.5) === '2,5', 'desimal pakai koma')
assert(jumlah(2.0) === '2', 'nol di belakang koma dibuang')
assert(jumlah(0.125) === '0,125', 'tiga angka di belakang koma')
assert(jumlah('x') === '0', 'yang bukan angka jadi 0')

// ── 7. Daftar satuan hanya saran, bukan pagar ────────────────────────────
assert(SATUAN_UMUM.includes('Ton'), 'Ton ada di saran')
assert(SATUAN_UMUM.includes('Batang') && SATUAN_UMUM.includes('Ikat'), 'satuan kayu ada')
assert(SATUAN_UMUM.includes('Rit') && SATUAN_UMUM.includes('Truk'), 'satuan angkut lapangan ada')
{
  // Satuan di luar daftar TETAP boleh — memaksanya masuk daftar hanya membuat
  // orang menulis satuan yang salah supaya formulirnya mau lanjut.
  const aneh = baris({ satuanPesan: 'colt diesel', qty: 1, sisa: 49 })
  assert(siapBarisPesan(aneh).boleh === true, 'satuan di luar daftar tetap diterima')
}

console.log(`satuan-po: ${ok} assert lulus`)
