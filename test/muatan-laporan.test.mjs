// ============================================================
// Daftar laporan tidak boleh mengangkut fotonya.
//
// GEJALANYA: rekap absensi Noble Cove terbuka di laptop — 26 HOK, lima
// pekerja, Rp 4.290.000 — tapi di ponsel gagal dengan "Waktu habis".
// Data yang sama, akun yang sama, hasil yang berbeda.
//
// SEBABNYA: `select=*` pada field_reports ikut menarik kolom `photos`, dan
// foto disimpan sebagai data URL base64 DI DALAM barisnya. Satu buku berisi
// foto sebulan bisa puluhan megabita. Lewat wifi permintaannya masih sempat
// selesai dalam 15 detik; lewat data seluler tidak. Bukan lambat — gagal
// sama sekali, lalu terlihat seperti data yang hilang.
//
// Yang paling menyesatkan: panel rekap absensi TIDAK MENAMPILKAN satu foto
// pun. Seluruh muatan itu diangkut untuk dibuang.
//
// Halaman pemilik sudah diperbaiki begini sejak migration_owner_foto_perhari.
// Panel internal tidak pernah ikut. Tes ini menjaga supaya tidak kembali.
// ============================================================
import { readFileSync } from 'node:fs'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const src = readFileSync(new URL('../src/lib/fieldReports.ts', import.meta.url), 'utf8')
const tab = readFileSync(
  new URL('../src/components/cost/TabLaporanLapangan.tsx', import.meta.url), 'utf8')

// ── 1. Kueri daftar tidak menyebut photos ───────────────────────────
{
  assert(/const KOLOM_DAFTAR = '[^']+'/.test(src), 'daftar kolomnya disebutkan satu tempat')
  const kolom = src.match(/const KOLOM_DAFTAR = '([^']+)'/)[1]
  assert(!kolom.includes('photos'), 'photos TIDAK ikut di daftar kolom')
  assert(!kolom.includes('*'), 'bukan select bintang')

  // Yang dibutuhkan layar harus tetap ada — memangkas terlalu banyak
  // memindahkan kerusakannya, bukan memperbaikinya.
  for (const w of ['id', 'log_id', 'tanggal', 'pelapor', 'kegiatan', 'catatan', 'absensi']) {
    assert(kolom.split(',').includes(w), `kolom ${w} tetap dibawa`)
  }
  // absensi WAJIB ada: seluruh rekap HOK dan upah dihitung darinya.
  assert(kolom.split(',').includes('absensi'), 'absensi tetap dibawa — rekap upah bergantung padanya')
}

// ── 2. Kedua jalur daftar memakainya ────────────────────────────────
//
// listReportsTerbaru dipakai lonceng notifikasi dan Chat Tim, keduanya tidak
// pernah menampilkan foto — tapi dulu menarik foto 30 sampai 50 laporan.
{
  const listReports = src.match(/async listReports\(logId\)[\s\S]*?\n  \},/)[0]
  assert(listReports.includes('KOLOM_DAFTAR'), 'listReports memakai daftar kolom')
  assert(!/select=\*/.test(listReports), 'listReports tidak lagi select bintang')

  const terbaru = src.match(/async listReportsTerbaru\([\s\S]*?\n  \},/)[0]
  assert(terbaru.includes('KOLOM_DAFTAR'), 'listReportsTerbaru memakai daftar kolom')
  assert(!/select=\*/.test(terbaru), 'listReportsTerbaru tidak lagi select bintang')

  assert(!/field_reports\?select=\*/.test(src),
    'tidak ada lagi select bintang atas field_reports di mana pun')
}

// ── 3. photos tetap ada bentuknya ───────────────────────────────────
//
// Dikembalikan sebagai larik kosong, bukan undefined: puluhan pembaca
// menulis `r.photos.length` tanpa penjagaan, dan undefined akan meledak di
// tempat yang sama sekali tidak berhubungan dengan perubahan ini.
{
  const listReports = src.match(/async listReports\(logId\)[\s\S]*?\n  \},/)[0]
  assert(/photos: r\.photos \?\? \[\]/.test(listReports), 'photos diisi larik kosong')
  const terbaru = src.match(/async listReportsTerbaru\([\s\S]*?\n  \},/)[0]
  assert(/photos: r\.photos \?\? \[\]/.test(terbaru), 'photos diisi larik kosong juga di sini')
}

// ── 4. Fotonya bisa diambil belakangan ──────────────────────────────
//
// Membuang foto tanpa menyediakan jalan mengambilnya bukan perbaikan,
// melainkan menghapus fitur.
{
  assert(/async fotoLaporan\(id\)/.test(src), 'ada jalan mengambil foto satu laporan')
  const f = src.match(/async fotoLaporan\(id\)[\s\S]*?\n  \},/)[0]
  assert(/select=photos/.test(f), 'yang diminta hanya kolom photos')
  assert(/id=eq\./.test(f), 'dibatasi satu laporan, bukan sebuku')
  assert(/fotoLaporan\(id: string\): Promise<string\[\]>/.test(src), 'tercantum di antarmukanya')

  assert(/fotoLaporan\(/.test(tab), 'layarnya benar-benar memakainya')
  assert(/Lihat foto/.test(tab), 'ada tombol untuk memintanya')
  assert(/Memuat foto/.test(tab), 'keadaan sedang memuat terlihat')
  assert(/Tidak ada foto/.test(tab), 'laporan tanpa foto dikatakan apa adanya')
  assert(/Foto gagal dimuat/.test(tab), 'kegagalan memuat foto disebutkan, tidak diam')
}

// ── 5. Foto tidak diminta dua kali ──────────────────────────────────
{
  const m = tab.match(/async function muatFoto[\s\S]*?\n  \}/)[0]
  assert(/if \(foto\[id\]\)/.test(m), 'yang sudah termuat tidak diambil ulang')
  assert(/setFotoJalan/.test(m), 'tombolnya dimatikan selama permintaannya jalan')
}

console.log(`muatan-laporan: ${ok} assert lulus`)
