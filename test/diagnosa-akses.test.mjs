// ============================================================
// Layar yang kosong harus mengatakan KENAPA.
//
// Pilihan proyek di "Isi Laporan Lapangan" milik pengawas kosong, dan
// satu-satunya kalimat yang muncul: "Belum ada buku laporan. Buat dulu di
// Laporan Lapangan."
//
// Kalimat itu KELIRU untuk pengawas — bukunya sudah ada, dan ia memang tidak
// berhak membuatnya sendiri. Tiga keadaan yang sangat berbeda terlihat persis
// sama di layar:
//
//   1. Perusahaannya memang belum punya buku laporan.
//   2. Akun ini belum terhubung ke perusahaan mana pun, jadi seluruh
//      kebijakan akses membacanya sebagai orang luar.
//   3. Fungsi penghubungnya belum ada — migrasinya belum dijalankan.
//
// Berhari-hari menebak-nebak adalah akibat langsung dari satu kalimat yang
// dipakai untuk ketiganya. my_workspaces() menyaring
// `member_user_id = auth.uid()`, jadi daftar workspace yang kosong adalah
// BUKTI bahwa pengikatannya belum jadi — sinyal yang bisa dibaca dari sisi
// aplikasi, tanpa membuka basis data.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diagnosaBuku } from '../src/lib/diagnosaAkses.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const dasar = {
  jumlahBuku: 0, jumlahWorkspace: 0, adaFungsiKlaim: true,
  baruTerikat: 0, sesiTim: false, workspaceOwner: null,
}

// ── 1. Ada bukunya = tidak ada yang perlu dijelaskan ────────────────
{
  const d = diagnosaBuku({ ...dasar, jumlahBuku: 3 })
  assert(d.sebab === '', 'diam ketika memang tidak ada masalah')
  assert(d.bolehCobaHubungkan === false, 'dan tidak menawarkan tombol yang tidak perlu')
}

// ── 2. Migrasinya belum dijalankan ──────────────────────────────────
//
// Ini tidak bisa diperbaiki oleh yang membaca layarnya — tapi bisa
// DIBERITAHUKAN kepada orang yang bisa memperbaikinya.
{
  const d = diagnosaBuku({ ...dasar, adaFungsiKlaim: false })
  assert(/belum terpasang/.test(d.sebab), 'menyebut penghubungnya belum ada')
  assert(/migration_klaim_keanggotaan\.sql/.test(d.saran), 'menyebut berkas mana yang harus dijalankan')
  assert(d.bolehCobaHubungkan === false,
    'tidak menawarkan tombol yang PASTI gagal — fungsinya memang belum ada')
}

// ── 3. Akun belum terhubung ke perusahaan mana pun ──────────────────
//
// Inilah keadaan pengawas yang dilaporkan. Sebabnya hampir selalu satu:
// email di menu Pengguna berbeda dengan email yang dipakai masuk.
{
  const d = diagnosaBuku({ ...dasar, sesiTim: true, jumlahWorkspace: 0 })
  assert(/belum terhubung ke perusahaan/.test(d.sebab), 'menyebut akunnya belum terhubung')
  assert(/email/i.test(d.saran) && /SAMA PERSIS/.test(d.saran), 'menunjuk email sebagai sebab yang paling mungkin')
  assert(/aktif/.test(d.saran), 'dan status keanggotaannya')
  assert(d.bolehCobaHubungkan === true, 'menawarkan mencoba menghubungkan lagi')

  // Sama berlakunya untuk yang menukar workspace, bukan hanya sesi tim.
  const tukar = diagnosaBuku({ ...dasar, sesiTim: false, workspaceOwner: 'u-lain' })
  assert(/belum terhubung/.test(tukar.sebab), 'bentuk kedua ikut dikenali')
}

// ── 4. Terhubung, tapi perusahaannya memang belum punya buku ────────
//
// Kalimatnya harus berbeda untuk anggota tim: menyuruhnya "buat dulu" adalah
// menyuruh mengerjakan yang bukan haknya.
{
  const anggota = diagnosaBuku({ ...dasar, jumlahWorkspace: 1, sesiTim: true })
  assert(/Perusahaan Anda belum punya/.test(anggota.sebab), 'menyebut perusahaannya, bukan dirinya')
  assert(/Minta admin/.test(anggota.saran), 'menyuruh meminta, bukan mengerjakan sendiri')
  assert(anggota.bolehCobaHubungkan === false, 'menghubungkan ulang tidak akan menolong di sini')

  // Pemilik akun sendiri memang boleh membuatnya.
  const pemilik = diagnosaBuku({ ...dasar, jumlahWorkspace: 0, adaFungsiKlaim: true })
  assert(/belum terhubung/.test(pemilik.sebab) || /Belum ada buku/.test(pemilik.sebab),
    'pemilik tanpa workspace tetap mendapat kalimat yang masuk akal')
}

// ── 5. Baru saja tersambung = kabar baik, bukan kegagalan ───────────
{
  const d = diagnosaBuku({ ...dasar, baruTerikat: 1 })
  assert(/baru terhubung/.test(d.sebab), 'menyebut sambungannya baru jadi')
  assert(/muat ulang/i.test(d.saran), 'dan langkah berikutnya')
  assert(d.bolehCobaHubungkan === false, 'tidak perlu mencoba lagi — sudah berhasil')
}

// ── 6. Masukan rusak tidak melempar ─────────────────────────────────
{
  assert(diagnosaBuku(null).sebab === '', 'null aman')
  assert(diagnosaBuku(undefined).sebab === '', 'undefined aman')
  assert(diagnosaBuku({}).sebab.length > 0, 'objek kosong tetap menghasilkan penjelasan')
}

// ── 7. Layar & API benar-benar memakainya ───────────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const hal = readFileSync(join(akar, 'pages/IsiLapanganPage.tsx'), 'utf8')
  const kode = hal.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')

  assert(/diagnosaBuku\(akses\)/.test(kode), 'layar memakai diagnosanya')
  assert(/klaimKeanggotaan\(\)/.test(kode), 'dan mencoba menghubungkan akunnya')
  assert(/myWorkspaces\(\)/.test(kode), 'serta membaca daftar perusahaannya')
  assert(/if \(l\.length === 0\)/.test(kode),
    'hanya saat kosong — tidak ada permintaan tambahan ketika semuanya baik-baik saja')

  const t = readFileSync(join(akar, 'lib/teamApi.ts'), 'utf8')
  assert(/adaFungsi/.test(t), 'klaim membedakan "fungsinya tidak ada" dari "tidak ada yang diikat"')
  assert(/res\.status === 404/.test(t), '404 dibaca sebagai migrasi yang belum dijalankan')
  assert(/return \{ terikat: 0, adaFungsi: true \}/.test(t),
    'jaringan putus TIDAK dianggap bukti fungsinya tidak ada')
}

console.log(`diagnosa-akses: ${ok} assert lulus`)
