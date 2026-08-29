// ============================================================
// Cap tanggal & jam DI ATAS fotonya.
//
// Foto serah-terima gunanya membuktikan dua hal: keadaan alatnya, dan KAPAN
// keadaan itu direkam. Tanggal yang hanya tersimpan di baris database
// membuktikan yang kedua hanya bagi yang percaya pada barisnya — dan seluruh
// perselisihan soal alat lecet justru berlangsung di WhatsApp, tempat
// barisnya tidak ikut.
//
// Yang diuji di sini: capnya terbaca di kedua ukuran foto yang nyata, ia
// tidak menutupi barang yang difoto, dan ketika terpaksa dipotong yang
// dikorbankan keterangannya — TIDAK PERNAH waktunya.
// ============================================================
import { tekesCap, ukuranCap, letakCap, capMuat, capPas } from '../src/lib/capWaktu.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const WAKTU = new Date(2026, 7, 21, 8, 17, 0) // 21 Agustus 2026, 08:17 waktu setempat

// ── 1. Teksnya untuk dibaca orang di layar HP, bukan diurai mesin ──────
{
  assert(tekesCap(WAKTU) === '21 Agu 2026 · 08:17', 'tanggal & jam saja')
  assert(tekesCap(WAKTU, 'Serah genset') === '21 Agu 2026 · 08:17 · Serah genset',
    'keterangan menyusul di belakang waktunya')
  assert(!/T\d\d:|Z$|GMT/.test(tekesCap(WAKTU)),
    'bukan ISO — yang membacanya mandor yang sedang berdebat, sekilas, di lapangan')
}

// ── 2. Jam berangka satu tetap dua digit ──────────────────────────────
//
// "8:7" terbaca seperti nomor, bukan jam.
{
  assert(/ 08:07$/.test(tekesCap(new Date(2026, 7, 21, 8, 7))), 'menit satu digit diberi nol')
  assert(/ 00:00$/.test(tekesCap(new Date(2026, 7, 21, 0, 0))), 'tengah malam bukan 24:00')
  assert(/ 23:59$/.test(tekesCap(new Date(2026, 7, 21, 23, 59))), 'jam 23 bukan 11')
}

// ── 3. Waktu yang tidak masuk akal tidak menghasilkan "Invalid Date" ──
//
// Cap bertuliskan "NaN NaN NaN" dibakar permanen ke dalam gambarnya — dan
// tidak bisa dicabut lagi setelah fotonya beredar.
{
  assert(tekesCap('bukan tanggal', 'Serah genset') === 'Serah genset',
    'tanggal rusak: keterangannya saja, bukan NaN')
  assert(tekesCap('bukan tanggal') === '', 'tanpa keduanya: kosong, bukan "Invalid Date"')
  assert(!/NaN|Invalid/.test(tekesCap(undefined, 'x')), 'tidak pernah membocorkan NaN')
  assert(tekesCap(Date.parse('2026-08-21T08:17:00')) !== '', 'angka milidetik diterima')
  assert(tekesCap('2026-08-21T08:17:00') !== '', 'string ISO diterima')
}

// ── 4. Ukuran ikut lebar gambarnya, tidak tetap ───────────────────────
//
// Foto 640 piksel dan foto 2000 piksel sama-sama ditampilkan selebar layar,
// jadi cap 14 piksel yang pas pada yang pertama menjadi goresan tak terbaca
// pada yang kedua.
{
  assert(ukuranCap(2000).fontPx > ukuranCap(640).fontPx, 'gambar lebih besar: huruf lebih besar')
  assert(ukuranCap(300).fontPx >= 11, 'ada lantainya: di bawah 11 px tidak terbaca setelah WhatsApp memampatkannya lagi')
  assert(ukuranCap(6000).fontPx <= 48, 'ada langit-langitnya: cap raksasa menutupi barang yang difoto')
  assert(ukuranCap(0).fontPx >= 11 && Number.isFinite(ukuranCap(0).fontPx), 'lebar nol aman')
  assert(Number.isFinite(ukuranCap('x').fontPx), 'masukan tak masuk akal aman')
  assert(ukuranCap(1000).tinggiBidang > ukuranCap(1000).fontPx,
    'bidangnya lebih tinggi daripada hurufnya — huruf mepet tepi bidang sulit dibaca')
}

// ── 5. Capnya selalu di DASAR gambar ─────────────────────────────────
//
// Bagian atas foto lapangan hampir selalu langit atau atap; yang dipotret
// orang justru sering ada di sepertiga atas bingkai.
{
  const L = letakCap(1000, 750)
  assert(L.atasBidang + L.tinggiBidang === 750, 'bidangnya menempel persis di dasar')
  assert(L.atasBidang > 750 / 2, 'jauh di bawah tengah gambar')
  assert(L.baseline > L.atasBidang && L.baseline <= 750,
    'garis dasar teks di dalam bidangnya, tidak jatuh keluar gambar')
  assert(L.baseline < L.atasBidang + L.tinggiBidang,
    'sedikit di atas dasar: ekor huruf g/y/p tidak terpotong tepi gambar')
  assert(L.padKiri > 0, 'teksnya tidak menempel tepi kiri')
}

// ── 6. Gambar yang lebih pendek daripada capnya tidak menghasilkan minus ─
//
// Koordinat negatif menggambar bidang di luar kanvas: capnya hilang sama
// sekali, dan tidak ada yang tahu ia hilang.
{
  const kecil = letakCap(200, 10)
  assert(kecil.atasBidang >= 0, 'tidak pernah minus')
  assert(Number.isFinite(kecil.baseline), 'baseline tetap angka')
  assert(letakCap(1000, 0).atasBidang >= 0, 'tinggi nol aman')
  assert(letakCap(null, null).atasBidang >= 0, 'kosong aman')
}

// ── 7. Muat atau tidak ───────────────────────────────────────────────
{
  assert(capMuat('21 Agu 2026 · 08:17', 1000) === true, 'waktu saja muat di 1000 px')
  assert(capMuat('x'.repeat(400), 400) === false, 'yang kepanjangan tidak muat')
  assert(capMuat('', 1000) === false, 'kosong tidak perlu digambar sama sekali')
}

// ── 8. Yang dikorbankan keterangannya, TIDAK PERNAH waktunya ─────────
//
// Urutan pengorbanan ini seluruh gunanya modul ini. Keterangan masih
// tercatat di barisnya; tanggal pada foto yang beredar di WhatsApp tidak ada
// di mana pun selain di gambar itu.
{
  const panjang = 'Serah terima genset 5000 watt untuk pekerjaan cor lantai dua blok B'
  const hasil = capPas(WAKTU, panjang, 480)
  assert(/^21 Agu 2026 · 08:17/.test(hasil), 'tanggal & jam selamat')
  assert(hasil.length < tekesCap(WAKTU, panjang).length, 'keterangannya memang dipendekkan')
  assert(capMuat(hasil, 480), 'dan hasilnya benar-benar muat')

  // Sempit sekali: keterangannya habis, waktunya tetap ada.
  const sempit = capPas(WAKTU, panjang, 160)
  assert(/21 Agu 2026/.test(sempit), 'di lebar mana pun, tanggalnya tidak pernah dibuang')

  // Yang sudah muat tidak diutak-atik.
  assert(capPas(WAKTU, 'Pinjam', 1200) === tekesCap(WAKTU, 'Pinjam'),
    'yang sudah muat dibiarkan utuh, tanpa elipsis yang tidak perlu')
  assert(capPas(WAKTU, '', 1000) === '21 Agu 2026 · 08:17', 'tanpa keterangan')
  assert(!/undefined|null|NaN/.test(capPas(WAKTU, undefined, 1000)), 'keterangan kosong aman')
}

console.log(`cap-waktu: ${ok} assert lulus`)
