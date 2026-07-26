// Test tautan WhatsApp: normalisasi nomor Indonesia & isi pesan akun.
import {
  nomorWaInternasional, waKe, pesanAkunBaru, pesanIngatkanAkun,
  pesanPasswordBaru, JALUR_LOGIN_TIM,
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
  nama: 'Jumani', jabatan: 'Manager', username: 'jumani', kode: 'PFS-4K7M',
  password: 'qwerty123', origin: 'https://propfs.id', perusahaan: 'PT Cyrus Mobile',
})
assert(baru.includes('PFS-4K7M'), 'pesan akun baru memuat Kode Perusahaan')
assert(baru.includes('jumani'), 'pesan akun baru memuat User ID')
assert(baru.includes('qwerty123'), 'pesan akun baru memuat password')
assert(baru.includes(`https://propfs.id${JALUR_LOGIN_TIM}`), 'pesan akun baru memuat tautan login tim')
assert(!baru.includes('https://propfs.id/auth'), 'pesan akun baru TIDAK mengarah ke login akun utama')
assert(baru.includes('Manager'), 'pesan akun baru memuat jabatan')
assert(baru.includes('PT Cyrus Mobile'), 'pesan akun baru menyebut nama perusahaan')

// tanpa nama perusahaan pesan tetap utuh
const tanpaPt = pesanAkunBaru({
  nama: 'Budi', jabatan: 'Pengawas', username: 'budi', kode: 'PFS-9XQZ',
  password: 'abcd1234', origin: 'https://propfs.id',
})
assert(tanpaPt.includes('PFS-9XQZ') && tanpaPt.includes('abcd1234'), 'tanpa nama perusahaan tetap lengkap')

const ingat = pesanIngatkanAkun({
  nama: 'Jumani', jabatan: 'Manager', username: 'jumani', kode: 'PFS-4K7M',
  origin: 'https://propfs.id',
})
assert(ingat.includes('jumani') && ingat.includes('PFS-4K7M'), 'pengingat memuat User ID & kode')
assert(ingat.includes(`https://propfs.id${JALUR_LOGIN_TIM}`), 'pengingat memuat tautan login tim')
assert(!ingat.toLowerCase().includes('qwerty'), 'pengingat TIDAK memuat password')
assert(ingat.includes('admin perusahaan'), 'pengingat mengarahkan ke admin perusahaan')

const reset = pesanPasswordBaru({
  nama: 'Budi', username: 'budi', kode: 'PFS-9XQZ',
  password: 'Zx9kQm2p', origin: 'https://propfs.id',
})
assert(reset.includes('Zx9kQm2p'), 'pesan reset memuat password baru')
assert(reset.includes('PFS-9XQZ') && reset.includes('budi'), 'pesan reset memuat kode & User ID')
assert(reset.includes(`https://propfs.id${JALUR_LOGIN_TIM}`), 'pesan reset memuat tautan login tim')

console.log(`✅ waLink: ${ok} assertion lolos`)
