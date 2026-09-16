// ============================================================
// "Tidak ada isi berkas yang bisa disimpan" — untuk berkas yang justru
// sedang TERPAMPANG di layar yang sama.
//
// Gambar kerja disimpan di Storage, bukan di dalam baris tabel. Penampil
// berkas mengambilnya sebagai Blob, lalu membuat alamat objek URL dengan
// `URL.createObjectURL(blob)` untuk dipakai <img src>.
//
// Sampai sekarang ALAMAT itulah yang dikirim ke penyimpan:
//
//     simpanBerkas(isi.uri, ...)      // "blob:https://propfs.id/6f2a…"
//
// Alamat itu bukan base64 dan bukan data URI, jadi `atob` melemparnya,
// keBlob mengembalikan null, dan yang muncul adalah "Tidak ada isi berkas
// yang bisa disimpan". Gambarnya terlihat baik-baik saja di layar karena
// <img src> memang hanya butuh alamatnya.
//
// Lampiran tagihan tidak terkena: ia tersimpan sebagai data URI di dalam
// barisnya, dan data URI memang bisa dibaca base64. Itu sebabnya cacat ini
// hanya muncul di Gambar Kerja.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { base64Saja } from '../src/lib/unduhBerkas.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const akar = new URL('../src', import.meta.url).pathname
const tanpaKomentar = t => t.split('\n')
  .filter(b => { const x = b.trim(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') })
  .join('\n')

// ── 1. Kenapa alamat blob: tidak bisa dibaca sebagai isi ────────────
{
  const alamat = 'blob:https://propfs.id/6f2a1c44-9b0e-4d21-8f3a-77c0d9e1b2a5'
  assert(base64Saja(alamat) === alamat,
    'alamat blob: dikembalikan apa adanya — tidak ada "data:" untuk dipotong')
  let melempar = false
  try { atob(base64Saja(alamat)) } catch { melempar = true }
  assert(melempar, 'dan atob melemparnya — di situlah isinya jadi null')

  // Data URI, yang dipakai lampiran tagihan, memang terbaca.
  assert(base64Saja('data:image/png;base64,AAAA') === 'AAAA',
    'data URI tetap terbaca — sebabnya lampiran tagihan tidak terkena')
}

// ── 2. Penyimpan menerima alamat blob: sebagai cadangan ─────────────
{
  const kode = tanpaKomentar(readFileSync(join(akar, 'lib/unduhBerkas.ts'), 'utf8'))
  assert(/async function keBlobLengkap/.test(kode), 'ada pembaca yang mengerti alamat blob:')
  assert(/\/\^blob:\/i\.test\(s\)/.test(kode), 'dikenali dari awalannya')
  assert(/await keBlobLengkap\(isi, jenis\)/.test(kode), 'dan dipakai simpanBerkasRinci')

  // http/https SENGAJA tidak ikut: mengambilnya berarti modul ini diam-diam
  // menjangkau jaringan atas nama pemanggilnya, lengkap dengan kredensial
  // dan kegagalan yang bukan miliknya.
  assert(!/\^https\?:/.test(kode), 'alamat http/https tidak ikut diambil')
}

// ── 3. Penampilnya mengirim BERKASNYA, bukan alamatnya ──────────────
//
// Cadangan di nomor 2 menambal gejala. Ini yang memperbaiki sebabnya: blob-nya
// memang ada di tangan penampil sejak awal, dan tidak ada alasan mengirim
// alamat lalu memintanya kembali.
{
  const kode = tanpaKomentar(readFileSync(join(akar, 'components/cost/LihatBerkas.tsx'), 'utf8'))
  assert(/blob: Blob \| null/.test(kode), 'blob disimpan berdampingan dengan uri')
  assert(/simpanBerkas\(isi\.blob \?\? isi\.uri/.test(kode), 'menyimpan memakai blobnya')
  assert(/bukaBerkas\(isi\.blob \?\? isi\.uri/.test(kode), 'membuka juga')
  assert(!/simpanBerkas\(isi\.uri,/.test(kode), 'alamat mentah sudah tidak dikirim lagi')
  assert(!/bukaBerkas\(isi\.uri,/.test(kode), 'tidak di kedua tombol')

  // `uri` TETAP ada: <img src> dan penampil PDF memang memakainya.
  assert(/uri: blob \? URL\.createObjectURL\(blob\)/.test(kode),
    'uri tetap dibuat — ia yang dipakai menampilkan gambarnya')
}

// ── 4. Gambar kerja memang mengambilnya sebagai Blob ────────────────
//
// Kalau suatu saat ini diubah menjadi base64, berkas belasan megabita akan
// disalin dua kali di memori HP — dan base64 sendiri menambah sepertiga
// ukurannya.
{
  const hal = readFileSync(join(akar, 'pages/GambarKerjaPage.tsx'), 'utf8')
  assert(/berkas_blob: await res\.blob\(\)/.test(hal), 'gambar kerja dikirim sebagai Blob')
}

console.log(`simpan-berkas-blob: ${ok} assert lulus`)
