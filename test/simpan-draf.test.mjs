// ============================================================
// Isian form tidak boleh hilang karena halaman dimuat ulang.
//
// Yang dilaporkan: "saya refresh, semua data hilang — dia tidak auto simpan
// ke database tiap saya isi form". Penyimpanannya memang ada, tetapi rusak di
// empat tempat sekaligus; berkas ini menjaga dua yang bisa diuji tanpa DOM.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buatPenunda, JEDA_SIMPAN_MS, kunciDraf, simpanDraf, bacaDraf, hapusDraf,
  drafLebihBaru, labelSimpan,
} from '../src/lib/simpanDraf.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const tidur = ms => new Promise(r => setTimeout(r, ms))

// Laci palsu, supaya bisa diuji tanpa peramban.
function laciPalsu(rusak = false) {
  const isi = new Map()
  return {
    isi,
    getItem: k => (isi.has(k) ? isi.get(k) : null),
    setItem: (k, v) => { if (rusak) throw new Error('QuotaExceeded'); isi.set(k, v) },
    removeItem: k => { isi.delete(k) },
  }
}

// ── 1. Penundaan MEMBATALKAN pendahulunya ────────────────────────────
//
// Inilah cacat aslinya. `setTimeout(save, 800)` dipanggil pada setiap
// perubahan tanpa pernah membatalkan yang sebelumnya: mengetik dua puluh huruf
// menjadwalkan dua puluh penyimpanan, dan semuanya berangkat. Yang menang
// bukan yang terakhir DIKIRIM melainkan yang terakhir SAMPAI — sehingga muatan
// lama bisa mendarat sesudah yang baru dan menimpanya.
{
  let jalan = 0
  const p = buatPenunda(() => { jalan++ }, 30)
  for (let i = 0; i < 20; i++) p.jadwalkan()
  assert(jalan === 0, 'belum jalan sebelum jedanya lewat')
  assert(p.tertunda() === true, 'ada yang tertunda')
  await tidur(60)
  assert(jalan === 1, 'dua puluh ketukan menghasilkan SATU penyimpanan, bukan dua puluh')
  assert(p.tertunda() === false, 'sudah tidak ada yang tertunda')
}

// ── 2. Bisa dipaksa jalan sekarang ──────────────────────────────────
//
// Dipakai ketika pemakai berpindah halaman: perubahan yang masih menunggu
// jedanya harus berangkat, bukan ikut hilang bersama halamannya.
{
  let jalan = 0
  const p = buatPenunda(() => { jalan++ }, 5000)
  p.jadwalkan()
  p.segera()
  assert(jalan === 1, 'langsung berangkat tanpa menunggu')
  assert(p.tertunda() === false, 'dan jadwalnya bersih')
  p.segera()
  assert(jalan === 1, 'tanpa yang tertunda, "segera" tidak melahirkan penyimpanan hantu')
}

// ── 3. Bisa dibatalkan ─────────────────────────────────────────────
{
  let jalan = 0
  const p = buatPenunda(() => { jalan++ }, 20)
  p.jadwalkan(); p.batal()
  await tidur(50)
  assert(jalan === 0, 'yang dibatalkan tidak jalan')
  p.batal()
  assert(jalan === 0, 'membatalkan yang tidak ada aman')
}

// ── 4. Jedanya masuk akal ──────────────────────────────────────────
{
  assert(JEDA_SIMPAN_MS >= 300, 'jangan satu permintaan per huruf')
  assert(JEDA_SIMPAN_MS <= 1500,
    'jangan terlalu lama — yang berpindah halaman sedetik kemudian tetap harus '
    + 'membawa perubahannya')
}

// ── 5. Draf lokal: ditulis, dibaca, dihapus ────────────────────────
{
  const l = laciPalsu()
  assert(simpanDraf('cb12', { namaProyek: 'Metta' }, l) === true, 'tersimpan')
  const d = bacaDraf('cb12', l)
  assert(d.isi.namaProyek === 'Metta', 'terbaca utuh')
  assert(typeof d.at === 'string' && d.at.length > 10, 'membawa waktunya')
  assert(l.isi.has(kunciDraf('cb12')), 'kuncinya bertanda proyek, tidak saling menimpa')

  simpanDraf('lain', { namaProyek: 'Lain' }, l)
  assert(bacaDraf('cb12', l).isi.namaProyek === 'Metta', 'proyek lain tidak menimpa')

  hapusDraf('cb12', l)
  assert(bacaDraf('cb12', l) === null, 'terhapus')
}

// ── 6. Penyimpanan penuh / dilarang TIDAK menghentikan pengisian ──
//
// Draf itu jaring pengaman, bukan syarat. Mode penyamaran dan kuota penuh
// sama-sama melempar, dan form yang berhenti bekerja karenanya jauh lebih
// merugikan daripada tidak punya draf.
{
  const rusak = laciPalsu(true)
  assert(simpanDraf('cb12', { a: 1 }, rusak) === false, 'melaporkan gagal, tidak melempar')
  assert(bacaDraf('cb12', rusak) === null, 'membaca yang tidak ada aman')

  const l = laciPalsu()
  l.isi.set(kunciDraf('rusak'), '{bukan json')
  assert(bacaDraf('rusak', l) === null, 'isi rusak tidak melempar')

  assert(simpanDraf('', { a: 1 }, l) === false, 'tanpa id: tidak menulis kunci telanjang')
  assert(bacaDraf(null, l) === null, 'kosong aman')
}

// ── 7. Draf hanya menang bila BENAR-BENAR lebih baru ─────────────
//
// Draf basi dari sesi kemarin tidak boleh menimpa pekerjaan yang sudah
// dilakukan di perangkat lain.
{
  const baru = { at: '2026-08-30T10:00:00Z' }
  const lama = { at: '2026-08-01T10:00:00Z' }
  assert(drafLebihBaru(baru, '2026-08-29T10:00:00Z') === true, 'draf lebih baru: dipakai')
  assert(drafLebihBaru(lama, '2026-08-29T10:00:00Z') === false, 'draf basi: server menang')
  assert(drafLebihBaru(baru, baru.at) === false, 'waktu sama: server menang, tidak ada gunanya menukar')

  // Tanpa waktu server sama sekali, draf yang ada dipakai: kehilangan yang
  // pasti lebih buruk daripada memakai salinan yang mungkin sedikit lama.
  assert(drafLebihBaru(baru, null) === true, 'server tanpa waktu: draf dipakai')
  assert(drafLebihBaru(null, '2026-08-29T10:00:00Z') === false, 'tidak ada draf')
  assert(drafLebihBaru({ at: 'ngawur' }, null) === false, 'waktu draf rusak: jangan dipercaya')
}

// ── 8. Kegagalan menyimpan HARUS terlihat ────────────────────────
//
// Selama ini kegagalan tidak meninggalkan jejak apa pun, dan yang mengisi form
// baru mengetahuinya setelah memuat ulang halaman dan menemukan isiannya
// kosong.
{
  assert(labelSimpan('menyimpan') === 'Menyimpan…', 'sedang menyimpan')
  assert(labelSimpan('tersimpan') === 'Tersimpan', 'berhasil')
  assert(labelSimpan('diam') === '', 'diam: tidak usah berisik')

  const gagal = labelSimpan('gagal', true)
  assert(/[Bb]elum tersimpan/.test(gagal), 'kegagalan dikatakan')
  assert(/aman di perangkat/.test(gagal),
    'dan menenangkan: isiannya tidak hilang, hanya belum sampai server')
  assert(!/aman di perangkat/.test(labelSimpan('gagal', false)),
    'tanpa draf: jangan menjanjikan keamanan yang tidak ada')
}

// ── 9. Store benar-benar memakai semua ini ──────────────────────
//
// Modul yang benar tetapi tidak dipasang tidak menyelamatkan satu isian pun —
// dan justru begitulah cacat ini lahir: penyimpanannya ada, penjagaannya tidak.
{
  const akar = new URL('../src', import.meta.url).pathname
  const store = readFileSync(join(akar, 'store/fsStore.ts'), 'utf8')

  assert(!/setTimeout\(\(\) => get\(\)\.saveCurrentProject\(\), 800\)/.test(store),
    'tidak lagi menjadwalkan penyimpanan baru tiap perubahan tanpa membatalkan yang lama')
  assert(/buatPenunda\(/.test(store), 'memakai penunda yang membatalkan pendahulunya')
  assert(/simpanDraf\(/.test(store), 'draf lokal ditulis tiap perubahan')

  // Hasil penyimpanan ke server harus diperiksa.
  assert(/const \{ (data, )?error \} = await supabase\s*\n?\s*\.from\('projects'\)/.test(store)
    || /\.upsert\(/.test(store), 'penyimpanan memeriksa hasilnya')
  assert(/upsert/.test(store),
    'memakai upsert — `update` pada baris yang tidak ada mengenai nol baris dan '
    + 'TIDAK dianggap galat oleh Postgres, jadi proyek yang gagal dibuat '
    + 'menerima setiap penyimpanan berikutnya dengan diam')
}

console.log(`simpan-draf: ${ok} assert lulus`)
