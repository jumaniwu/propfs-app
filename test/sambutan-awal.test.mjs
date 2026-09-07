// ============================================================
// Karyawan tidak disambut dengan pekerjaan yang mustahil ia kerjakan.
//
// Karyawan yang baru pertama kali masuk disambut tiga langkah membuat proyek
// Feasibility Study: "Klik tombol + Proyek Baru di dashboard".
//
// Tombol itu tidak ada untuknya. Modul Feasibility Study memang dikunci untuk
// sesi tim — RouteGuards melemparnya kembali ke Kontraktor AI kalau ia
// mencoba membukanya. Jadi yang disodorkan adalah pekerjaan yang mustahil, di
// layar pertama yang ia lihat, sebagai kesan pertamanya terhadap aplikasi.
//
// Syaratnya dulu hanya dua: belum pernah ditutup, dan total_projects_created
// masih nol. Keduanya SELALU benar untuk karyawan — ia memang tidak pernah
// membuat proyek FS, dan tidak akan pernah. Sambutannya bukan "belum
// ditutup", melainkan salah alamat sejak awal.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anggotaTim, bolehLihatSambutan } from '../src/lib/sambutanAwal.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const PEMILIK = { sesiTim: false, workspaceOwner: null, userId: 'u-saya', sudahDitutup: false, proyekDibuat: 0 }

// ── 1. Pemilik akun baru tetap disambut ─────────────────────────────
{
  assert(bolehLihatSambutan(PEMILIK) === true, 'pemilik akun baru melihat sambutan')
  assert(bolehLihatSambutan({ ...PEMILIK, proyekDibuat: 1 }) === false,
    'yang sudah punya proyek tidak perlu disambut lagi')
  assert(bolehLihatSambutan({ ...PEMILIK, sudahDitutup: true }) === false,
    'yang sudah menutupnya tidak diganggu lagi')
}

// ── 2. Karyawan lewat halaman login tim: TIDAK PERNAH ───────────────
{
  const karyawan = { ...PEMILIK, sesiTim: true, workspaceOwner: 'u-perusahaan', userId: 'u-irlandy' }
  assert(anggotaTim(karyawan) === true, 'dikenali sebagai anggota tim')
  assert(bolehLihatSambutan(karyawan) === false, 'tidak melihat sambutan')

  // Dan bukan sekadar "ditunda sampai ditutup" — tetap tidak, walau segar.
  assert(bolehLihatSambutan({ ...karyawan, sudahDitutup: false, proyekDibuat: 0 }) === false,
    'tetap tidak, walau belum pernah ditutup dan proyeknya nol')
}

// ── 3. Bentuk kedua yang paling mudah terlewat ──────────────────────
//
// Masuk dengan akun sendiri, lalu MENUKAR workspace ke perusahaan lain.
// `sesiTim` bernilai false di sini; tanpa memeriksa workspace-nya ia akan
// dianggap pemilik.
{
  const tukar = { ...PEMILIK, sesiTim: false, workspaceOwner: 'u-perusahaan-lain', userId: 'u-saya' }
  assert(anggotaTim(tukar) === true, 'menukar workspace = sedang jadi anggota tim')
  assert(bolehLihatSambutan(tukar) === false, 'dan tidak disambut di sana')
}

// ── 4. Workspace SENDIRI yang tersimpan bukan berarti anggota tim ───
//
// Kalau tidak dibedakan, pemilik yang pernah membuka penukar workspace lalu
// kembali ke miliknya sendiri akan kehilangan sambutannya tanpa sebab.
{
  const sendiri = { ...PEMILIK, workspaceOwner: 'u-saya', userId: 'u-saya' }
  assert(anggotaTim(sendiri) === false, 'workspace sendiri bukan tim')
  assert(bolehLihatSambutan(sendiri) === true, 'pemiliknya tetap disambut')
}

// ── 5. Keadaan yang tidak jelas tidak menampilkan apa pun ───────────
//
// Belum ada user = sesinya belum siap. Menampilkan sambutan di saat itu
// berarti menyapa orang yang belum tentu baru.
{
  assert(bolehLihatSambutan({ ...PEMILIK, userId: null }) === false, 'tanpa user, tidak tampil')
  assert(bolehLihatSambutan(null) === false, 'null tidak melempar')
  assert(bolehLihatSambutan(undefined) === false, 'undefined tidak melempar')
  assert(anggotaTim({ sesiTim: false, workspaceOwner: '   ', userId: 'u' }) === false,
    'workspace berisi spasi dibaca kosong, bukan perusahaan lain')
}

// ── 6. Layarnya benar-benar memakai penjaga ini ─────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const panel = readFileSync(join(akar, 'components/home/PanelAkun.tsx'), 'utf8')
  const kode = panel.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')

  assert(/bolehLihatSambutan\(/.test(kode), 'PanelAkun memakai bolehLihatSambutan')
  assert(/sesiTim: sesiTim\(\)/.test(kode), 'sesi tim ikut diperiksa')
  assert(/workspaceOwner: getWorkspaceOwner\(\)/.test(kode), 'workspace aktif ikut diperiksa')

  // Syarat lama tidak boleh tertinggal sebagai satu-satunya penjaga.
  assert(!/!localStorage\.getItem\(`propfs_welcome_shown_\$\{user\.id\}`\)\s*\n\s*&&/.test(kode),
    'syarat lama yang hanya memeriksa localStorage & jumlah proyek sudah tidak berdiri sendiri')
}

console.log(`sambutan-awal: ${ok} assert lulus`)
