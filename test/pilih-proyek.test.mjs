// Test penyaringan daftar menurut proyek yang dipilih di header.
import { saringProyek, SEMUA_PROYEK } from '../src/lib/lingkupProyek.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const baris = [
  { id: 'a', project_name: 'Ruko Pak Soni' },
  { id: 'b', project_name: 'ruko pak soni' },   // penulisan berbeda
  { id: 'c', project_name: '  Ruko Pak Soni ' },// spasi berlebih
  { id: 'd', project_name: 'Proyek Lain' },
  { id: 'e', project_name: '' },                // data lama tanpa proyek
  { id: 'f' },                                  // kolomnya tidak ada
  { id: 'g', project_name: null },
]

// ── Lingkup satu proyek ────────────────────────────────────────────────────
{
  const hasil = saringProyek(baris, 'Ruko Pak Soni').map(r => r.id)
  assert(hasil.includes('a') && hasil.includes('b') && hasil.includes('c'),
    'nama sama walau beda huruf besar & spasi ikut terpilih')
  assert(!hasil.includes('d'), 'proyek lain tidak ikut')
  assert(hasil.includes('e') && hasil.includes('f') && hasil.includes('g'),
    'baris tanpa nama proyek tetap tampil — kalau disembunyikan tidak bisa dijangkau dari mana pun')
  assert(hasil.length === 6, `6 baris lolos (dapat ${hasil.length})`)
}

// Lingkup dengan spasi berlebih tetap bekerja.
assert(saringProyek(baris, '  ruko pak soni  ').length === 6,
  'nama lingkup dirapikan lebih dulu')

// ── Semua proyek ───────────────────────────────────────────────────────────
assert(saringProyek(baris, SEMUA_PROYEK).length === baris.length,
  'lingkup kosong berarti semua proyek, tidak ada yang disaring')
assert(SEMUA_PROYEK === '', 'penanda semua proyek adalah string kosong')

// ── Masukan pinggiran ──────────────────────────────────────────────────────
assert(saringProyek([], 'apa saja').length === 0, 'daftar kosong aman')
assert(saringProyek(baris, 'Proyek Yang Tidak Ada').map(r => r.id).join(',') === 'e,f,g',
  'proyek tak dikenal hanya menyisakan baris tanpa proyek')

// Fungsi tidak boleh mengubah masukannya.
{
  const salinan = [...baris]
  saringProyek(baris, 'Ruko Pak Soni')
  assert(baris.length === salinan.length && baris[0] === salinan[0], 'daftar asli tidak diubah')
}

console.log(`pilih-proyek: ${ok} assert lulus`)
