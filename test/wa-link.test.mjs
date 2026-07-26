// Test tautan WhatsApp: normalisasi nomor Indonesia & isi pesan akun.
import {
  nomorWaInternasional, waKe, pesanAkunBaru, pesanIngatkanAkun,
} from '../src/lib/waLink.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Normalisasi nomor ──────────────────────────────────────────────────────
assert(nomorWaInternasional('081533717771') === '6281533717771', '08… menjadi 628…')
assert(nomorWaInternasional('6281533717771') === '6281533717771', '62… dibiarkan')
assert(nomorWaInternasional('+62 815-3371-7771') === '6281533717771', 'plus, spasi, dan strip dibersihkan')
assert(nomorWaInternasional('(0815) 3371 7771') === '6281533717771', 'tanda kurung dibersihkan')
assert(nomorWaInternasional('81533717771') === '6281533717771', 'diawali 8 diberi kode 62')
assert(nomorWaInternasional('0085363666656') === '6285363666656', 'nol berlebih dipangkas')

assert(nomorWaInternasional('') === null, 'kosong ditolak')
assert(nomorWaInternasional(null) === null, 'null ditolak')
assert(nomorWaInternasional(undefined) === null, 'undefined ditolak')
assert(nomorWaInternasional('0812') === null, 'terlalu pendek ditolak')
assert(nomorWaInternasional('0812345678901234') === null, 'terlalu panjang ditolak')
assert(nomorWaInternasional('12025550123') === null, 'nomor negara lain ditolak')
assert(nomorWaInternasional('abcd') === null, 'bukan angka ditolak')

// ── waKe ───────────────────────────────────────────────────────────────────
const l1 = waKe('081533717771', 'Halo dunia')
assert(l1.startsWith('https://wa.me/6281533717771?text='), 'nomor valid langsung menuju chat orangnya')
assert(l1.includes('Halo%20dunia'), 'pesan ikut ter-encode')

const l2 = waKe('', 'Halo')
assert(l2.startsWith('https://wa.me/?text='), 'nomor kosong jatuh ke pemilih kontak')

// baris baru & karakter khusus aman
const l3 = waKe('081533717771', 'Baris 1\nBaris 2 & lanjut')
assert(l3.includes('%0A') && l3.includes('%26'), 'baris baru dan & ter-encode dengan benar')

// ── Isi pesan ──────────────────────────────────────────────────────────────
const baru = pesanAkunBaru({
  nama: 'Jumani', jabatan: 'Manager', email: 'jumani.wu93@gmail.com',
  password: 'qwerty123', origin: 'https://propfs.id',
})
assert(baru.includes('jumani.wu93@gmail.com'), 'pesan akun baru memuat User ID')
assert(baru.includes('qwerty123'), 'pesan akun baru memuat password')
assert(baru.includes('https://propfs.id/auth'), 'pesan akun baru memuat tautan login')
assert(baru.includes('Manager'), 'pesan akun baru memuat jabatan')
assert(baru.includes('ganti password'), 'pesan akun baru mengingatkan ganti password')

const ingat = pesanIngatkanAkun({
  nama: 'Jumani', jabatan: 'Manager', email: 'jumani.wu93@gmail.com', origin: 'https://propfs.id',
})
assert(ingat.includes('jumani.wu93@gmail.com'), 'pengingat memuat User ID')
assert(ingat.includes('https://propfs.id/auth'), 'pengingat memuat tautan login')
assert(!ingat.toLowerCase().includes('qwerty'), 'pengingat TIDAK memuat password')
assert(ingat.includes('Lupa Password'), 'pengingat mengarahkan ke Lupa Password')

console.log(`✅ waLink: ${ok} assertion lolos`)
