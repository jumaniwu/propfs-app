// Test login tim: normalisasi Kode Perusahaan, username, dan email internal.
import {
  normalKode, kodeValid, normalUsername, usernameValid,
  emailInternal, bacaEmailInternal, akunTim, aksesLewatPerusahaan,
  DOMAIN_TIM, AWALAN_KODE,
} from '../src/lib/teamLogin.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── normalKode ─────────────────────────────────────────────────────────────
assert(normalKode('PFS-4K7M') === 'PFS-4K7M', 'kode sudah rapi tidak berubah')
assert(normalKode('pfs-4k7m') === 'PFS-4K7M', 'huruf kecil dinaikkan')
assert(normalKode('pfs 4k7m') === 'PFS-4K7M', 'spasi diabaikan')
assert(normalKode('  pfs4k7m ') === 'PFS-4K7M', 'tanpa strip tetap dikenali')
assert(normalKode('4k7m') === 'PFS-4K7M', 'awalan PFS boleh tidak diketik')
assert(normalKode('') === '', 'kosong tetap kosong')
assert(normalKode(null) === '', 'null aman')
assert(normalKode('PFS') === '', 'hanya awalan tanpa isi = kosong')
assert(AWALAN_KODE === 'PFS-', 'awalan kode PFS-')

// ── kodeValid ──────────────────────────────────────────────────────────────
assert(kodeValid('PFS-4K7M'), 'kode 4 karakter sah')
assert(kodeValid('pfs4k7m'), 'kode sah walau diketik seadanya')
assert(!kodeValid('PFS-4K7'), 'kurang dari 4 karakter ditolak')
assert(!kodeValid('PFS-4K7MX'), 'lebih dari 4 karakter ditolak')
assert(!kodeValid('PFS-4K7O'), 'huruf O yang mudah tertukar ditolak')
assert(!kodeValid('PFS-4K71'), 'angka 1 yang mudah tertukar ditolak')
assert(!kodeValid(''), 'kode kosong tidak sah')

// ── normalUsername ─────────────────────────────────────────────────────────
assert(normalUsername('Budi') === 'budi', 'username jadi huruf kecil')
assert(normalUsername(' Budi Santoso ') === 'budi.santoso', 'spasi jadi titik')
assert(normalUsername('budi@lapangan') === 'budilapangan', 'karakter aneh dibuang')
assert(normalUsername('..budi') === 'budi', 'titik di depan dibuang')
assert(normalUsername('a'.repeat(40)).length === 24, 'dipotong maksimal 24 karakter')
assert(normalUsername(null) === '', 'null aman')

// ── usernameValid ──────────────────────────────────────────────────────────
assert(usernameValid('budi'), 'username biasa sah')
assert(usernameValid('budi.santoso'), 'titik boleh')
assert(usernameValid('pm_01'), 'garis bawah & angka boleh')
assert(!usernameValid('ab'), 'kurang dari 3 karakter ditolak')
assert(normalUsername('.budi.') === 'budi', 'titik di kedua ujung dibuang')
assert(!usernameValid('...'), 'hanya tanda baca ditolak')
assert(!usernameValid(''), 'kosong ditolak')

// ── emailInternal ──────────────────────────────────────────────────────────
assert(emailInternal('Budi', 'pfs-4k7m') === `budi@pfs-4k7m.${DOMAIN_TIM}`,
  'email internal digabung dari username + kode')
assert(emailInternal('Budi Santoso', 'PFS-4K7M') === `budi.santoso@pfs-4k7m.${DOMAIN_TIM}`,
  'spasi pada nama ikut dinormalkan')
assert(emailInternal('ab', 'PFS-4K7M') === '', 'username tidak sah = email kosong')
assert(emailInternal('budi', 'PFS-4K7') === '', 'kode tidak sah = email kosong')
assert(emailInternal('', '') === '', 'dua-duanya kosong aman')

// dua perusahaan boleh punya username yang sama
assert(emailInternal('admin', 'PFS-4K7M') !== emailInternal('admin', 'PFS-9XQZ'),
  'username sama di perusahaan berbeda menghasilkan akun berbeda')

// ── bacaEmailInternal ──────────────────────────────────────────────────────
const dibaca = bacaEmailInternal(`budi@pfs-4k7m.${DOMAIN_TIM}`)
assert(dibaca?.username === 'budi' && dibaca?.kode === 'PFS-4K7M', 'email internal bisa dibaca balik')
assert(bacaEmailInternal('budi@gmail.com') === null, 'email pribadi bukan akun tim')
assert(bacaEmailInternal('budi@pfs-4k7m.contoh.com') === null, 'domain lain ditolak')
assert(bacaEmailInternal(null) === null, 'null aman')
assert(akunTim(`sari@pfs-9xqz.${DOMAIN_TIM}`) === true, 'akunTim mengenali email internal')
assert(akunTim('jumani.wu@gmail.com') === false, 'akun pribadi bukan akun tim')

// bolak-balik konsisten
const balik = bacaEmailInternal(emailInternal('logistik.1', 'PFS-7HJK'))
assert(balik?.username === 'logistik.1' && balik?.kode === 'PFS-7HJK', 'bolak-balik konsisten')

// ── aksesLewatPerusahaan ───────────────────────────────────────────────────
const kini = new Date('2026-07-26T00:00:00Z')

// Keputusan backend selalu menang — termasuk perusahaan yang haknya datang
// dari superadmin/custom_features sehingga tidak punya baris langganan.
assert(aksesLewatPerusahaan({ owner_akses: true, owner_plan: 'free' }, kini),
  'owner_akses true memberi akses walau paket terbaca free')
assert(!aksesLewatPerusahaan({ owner_akses: false, owner_plan: 'pro', owner_plan_expires: '2027-01-01' }, kini),
  'owner_akses false menolak walau paket terlihat aktif')
assert(aksesLewatPerusahaan({ owner_plan: 'pro', owner_plan_expires: '2027-01-01' }, kini),
  'paket berbayar yang belum lewat memberi akses')
assert(aksesLewatPerusahaan({ owner_plan: 'pro', owner_plan_expires: null }, kini),
  'tanggal kosong dianggap tanpa batas')
assert(!aksesLewatPerusahaan({ owner_plan: 'pro', owner_plan_expires: '2026-01-01' }, kini),
  'paket berbayar yang sudah lewat tidak memberi akses')
assert(!aksesLewatPerusahaan({ owner_plan: 'free' }, kini), 'paket gratis tanpa trial tidak memberi akses')
assert(aksesLewatPerusahaan({ owner_plan: 'free', owner_trial_expires: '2026-08-30' }, kini),
  'masa uji coba perusahaan yang masih jalan memberi akses')
assert(!aksesLewatPerusahaan({ owner_plan: 'free', owner_trial_expires: '2026-06-01' }, kini),
  'masa uji coba yang sudah lewat tidak memberi akses')
assert(!aksesLewatPerusahaan(null, kini), 'tanpa workspace tidak memberi akses')

console.log(`✅ teamLogin: ${ok} assertion lolos`)
