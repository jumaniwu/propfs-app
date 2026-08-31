// ============================================================
// Angka yang diketik tidak boleh dikembalikan ke nilai lama.
//
// `RupiahInput` menyimpan dua kebenaran: `value` dari induknya, dan
// `displayValue` miliknya sendiri. Dua cacat membuat keduanya berselisih, dan
// yang terlihat pemakai adalah harga yang "balik ke default terus".
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bacaAngkaRupiah, tampilRupiah, ketikRupiah, selesaiKetik,
} from '../src/lib/isianRupiah.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Kolom yang DIKOSONGKAN berarti nol, bukan nilai lama ─────────
//
// Inilah cacat yang membuat harga "balik" itu. `parseDisplay(display) || value`
// menyalakan diri ketika hasil bacanya nol — yaitu tepat ketika kolomnya
// dikosongkan untuk diisi angka baru. Nilai lama dipasang kembali ke layar
// sementara induknya sudah menerima nol.
{
  const h = selesaiKetik('')
  assert(h.nilai === 0, 'kosong berarti nol')
  assert(h.tampil === '', 'dan kolomnya tetap kosong, bukan diisi angka lama')

  // Prasyarat: begini bentuk lamanya berperilaku.
  const nilaiLama = 6000000
  assert((0 || nilaiLama) === nilaiLama,
    'rumus lama mengembalikan nilai lama begitu hasil bacanya nol')
}

// ── 2. Setiap ketukan MENGHASILKAN sesuatu ────────────────────────
//
// Dulu `if (num < min) return` berhenti tanpa memperbarui apa pun. Mengetik
// "3.500.000" selalu melewati "3" lebih dulu, jadi setiap ketukan awal
// ditelan dan kolomnya tampak macet pada nilai lamanya.
{
  const batas = { min: 1_000_000 }
  let hasil = ''
  for (const ketukan of ['3', '35', '350', '3500', '35000', '350000', '3500000']) {
    hasil = ketikRupiah(ketukan, batas).tampil
  }
  assert(hasil === '3.500.000', 'angka besar bisa diketik walau melewati angka kecil di tengah')
  assert(ketikRupiah('3', batas).nilai === 3,
    'ketukan pertama TIDAK ditelan — batas bawah belum berlaku saat mengetik')
}

// ── 3. Batas bawah berlaku saat SELESAI, dan hanya bila diisi ─────
{
  const batas = { min: 1_000_000 }
  const kecil = selesaiKetik('500', batas)
  assert(kecil.nilai === 1_000_000, 'dinaikkan ke batas bawah')
  assert(/Minimal/.test(kecil.alasan), 'dan sebabnya dikatakan')

  const kosong = selesaiKetik('', batas)
  assert(kosong.nilai === 0,
    'kolom kosong berarti nol yang disengaja, bukan pelanggaran batas bawah')
  assert(kosong.alasan === '', 'jadi tidak perlu diprotes')
}

// ── 4. Batas atas dipotong, tidak ditelan ────────────────────────
{
  const h = ketikRupiah('99999999999', { max: 1_000_000 })
  assert(h.nilai === 1_000_000, 'dipotong ke batas')
  assert(/Maksimal/.test(h.alasan), 'dan dikatakan')
  assert(h.tampil === '1.000.000', 'kolomnya ikut menunjukkan yang sebenarnya tersimpan')
}

// ── 5. Titik ribuan dibaca benar ─────────────────────────────────
{
  assert(bacaAngkaRupiah('3.500.000') === 3500000, 'titik = pemisah ribuan')
  assert(bacaAngkaRupiah('Rp 3.500.000') === 3500000, 'awalan Rp diabaikan')
  assert(bacaAngkaRupiah('') === 0, 'kosong')
  assert(bacaAngkaRupiah(null) === 0, 'kosong aman')
  assert(bacaAngkaRupiah('abc') === 0, 'omong kosong: nol, bukan NaN')
  assert(!Number.isNaN(bacaAngkaRupiah({})), 'objek tidak menghasilkan NaN')
}

// ── 6. Tampilan nol adalah kolom kosong, bukan "0" ──────────────
{
  assert(tampilRupiah(0) === '', 'nol: kosong, supaya placeholder-nya terlihat')
  assert(tampilRupiah(3500000) === '3.500.000', 'dipisah ribuan')
  assert(tampilRupiah(null) === '', 'kosong aman')
  assert(tampilRupiah(NaN) === '', 'NaN tidak bocor ke layar')
}

// ── 7. Komponennya benar-benar memakai aturan ini ──────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const komp = readFileSync(join(akar, 'components/shared/RupiahInput.tsx'), 'utf8')
  const kode = komp.split('\n').filter(b => !b.trim().startsWith('*') && !b.trim().startsWith('//')
    && !b.trim().startsWith('/**')).join('\n')

  assert(!/parseDisplay\(displayValue\) \|\| value/.test(kode),
    'nilai lama tidak lagi dihidupkan kembali saat kolom dikosongkan')
  assert(!/if \(min !== undefined && num < min\) return/.test(kode),
    'ketukan tidak lagi ditelan oleh batas bawah')
  assert(/ketikRupiah\(/.test(kode) && /selesaiKetik\(/.test(kode),
    'keduanya lewat aturan yang bisa diuji')
  assert(/if \(h\.nilai !== value\) onChange\(h\.nilai\)/.test(kode),
    'induknya diberi tahu saat kolom ditinggalkan — supaya yang tampil dan '
    + 'yang tersimpan tidak pernah berselisih')
}

console.log(`isian-rupiah: ${ok} assert lulus`)
