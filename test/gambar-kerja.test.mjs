// ============================================================
// Gambar Kerja & Denah.
//
// Yang dijaga di sini satu kesalahan yang harganya adalah pekerjaan yang harus
// dibongkar: tukang mengerjakan gambar yang sudah dicabut, karena gambar itulah
// yang paling mudah ditemukan.
//
// Karena itu urutan prioritas ujinya bukan "berkasnya tersimpan" melainkan:
//
//   1. MANA YANG BERLAKU tidak boleh bisa disalahpahami.
//   2. Versi lama tidak boleh hilang — ia satu-satunya penjelasan atas apa
//      yang sudah terlanjur dibangun.
//   3. Nama yang diketik orang tidak boleh merusak jalur berkas, karena
//      potongan pertama jalur itulah yang memeriksa hak akses.
// ============================================================
import {
  KATEGORI, LABEL_KATEGORI, kategoriSah, TIPE_DITERIMA, akhiran, tipeDiterima,
  bisaDilihatLangsung, BATAS_UKURAN, ukuranTerbaca, kunciGambar, versiBerikut,
  kelompokkanGambar, potonganAman, jalurBerkas, siapUnggah, tandaVersi,
  ringkasGambar,
} from '../src/lib/gambarKerja.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. MANA YANG BERLAKU — diurut menurut VERSI, bukan waktu unggah ───────
//
// Bedanya terasa ketika seseorang mengunggah revisi LAMA yang tertinggal:
// waktunya paling baru, tetapi versinya bukan yang berlaku. Mengurutkan
// menurut waktu akan menobatkannya sebagai "terbaru" — persis kesalahan yang
// dicegah seluruh modul ini.
{
  const daftar = [
    { id: 'a', nama: 'Denah Lantai 1', versi: 1, created_at: '2026-08-01T00:00:00Z' },
    { id: 'c', nama: 'Denah Lantai 1', versi: 3, created_at: '2026-08-10T00:00:00Z' },
    // Diunggah PALING AKHIR, tetapi versinya versi 2 — bukan yang berlaku.
    { id: 'b', nama: 'Denah Lantai 1', versi: 2, created_at: '2026-08-20T00:00:00Z' },
  ]
  const k = kelompokkanGambar(daftar)
  assert(k.length === 1, 'tiga baris satu nama = SATU gambar dengan tiga versi')
  assert(k[0].terbaru.id === 'c', 'yang BERLAKU adalah versi tertinggi, bukan yang terakhir diunggah')
  assert(k[0].riwayat.length === 2, 'dua versi lama tetap ada')
  assert(k[0].riwayat[0].id === 'b' && k[0].riwayat[1].id === 'a',
    'riwayatnya urut turun: v2 lalu v1')
}

// ── 2. Versi dikelompokkan menurut nama, walau ejaannya beda-beda ─────────
//
// "Denah Lantai 1", "denah lantai 1", dan "Denah  Lantai 1" adalah gambar yang
// sama diketik tiga orang. Kalau dianggap terpisah, tidak satu pun punya
// riwayat versi — dan yang tersisa hanya tiga berkas tanpa hubungan, persis
// keadaan di WhatsApp yang hendak ditinggalkan.
{
  assert(kunciGambar('Denah Lantai 1') === kunciGambar('denah lantai 1'), 'huruf besar-kecil')
  assert(kunciGambar('Denah  Lantai  1') === kunciGambar('Denah Lantai 1'), 'spasi ganda')
  assert(kunciGambar('  Denah Lantai 1 ') === kunciGambar('Denah Lantai 1'), 'spasi tepi')
  assert(kunciGambar('Denah Lantai 1') !== kunciGambar('Denah Lantai 2'), 'lantai beda tetap beda')

  const k = kelompokkanGambar([
    { id: '1', nama: 'Denah Lantai 1', versi: 1 },
    { id: '2', nama: 'denah lantai 1', versi: 2 },
    { id: '3', nama: 'DENAH  LANTAI 1', versi: 3 },
  ])
  assert(k.length === 1, 'tiga ejaan = satu gambar')
  assert(k[0].nama === 'DENAH  LANTAI 1', 'nama yang dipakai adalah ejaan versi TERBARU')

  // Baris tanpa nama tidak bisa dikelompokkan — dilewati, bukan dijadikan
  // kelompok tanpa nama yang tidak bisa dicari siapa pun.
  assert(kelompokkanGambar([{ id: 'x', nama: '', versi: 1 }]).length === 0, 'nama kosong dilewati')
  assert(kelompokkanGambar([]).length === 0, 'daftar kosong aman')
  assert(kelompokkanGambar(null).length === 0, 'null aman')
}

// ── 3. Versi berikutnya selalu di atas yang tertinggi ────────────────────
{
  const daftar = [
    { nama: 'Denah Lantai 1', versi: 1 },
    { nama: 'Denah Lantai 1', versi: 3 },
    { nama: 'Potongan A', versi: 7 },
  ]
  assert(versiBerikut(daftar, 'Denah Lantai 1') === 4,
    'v4, bukan v2 — celah nomor tidak diisi ulang, supaya nomor tidak pernah dipakai dua kali')
  assert(versiBerikut(daftar, 'denah lantai 1') === 4, 'ejaan beda tetap satu urutan')
  assert(versiBerikut(daftar, 'Potongan A') === 8, 'nama lain punya urutannya sendiri')
  assert(versiBerikut(daftar, 'Gambar Baru') === 1, 'nama yang belum ada mulai dari 1')
  assert(versiBerikut([], 'apa pun') === 1, 'daftar kosong: 1')
  assert(versiBerikut(daftar, '') === 1, 'nama kosong: 1, bukan melempar')
}

// ── 4. Nama yang diketik orang tidak boleh merusak jalur berkas ──────────
//
// Garis miring di dalam jalur Storage MEMBUAT FOLDER BARU — dan folder pertama
// itulah yang dipakai memeriksa hak akses. Nama yang keliru bukan sekadar
// berantakan, melainkan bisa membuat berkasnya tidak bisa dibuka siapa pun.
{
  assert(potonganAman('Denah Lt.1/2') === 'Denah-Lt.1-2', 'garis miring dibuang')
  assert(!potonganAman('a/b/c').includes('/'), 'tidak ada garis miring yang lolos')
  assert(potonganAman('Poténsi (revisi)') === 'Potensi-revisi', 'aksen dibuang, kurung jadi tanda hubung, sisa di tepi dirapikan')
  assert(potonganAman('') === 'gambar', 'kosong jatuh ke cadangan')
  assert(potonganAman('///') === 'gambar', 'yang seluruhnya terlarang jatuh ke cadangan')
  assert(potonganAman('x', 'lain') === 'x', 'yang sah dibiarkan')
  assert(potonganAman('a'.repeat(200)).length <= 60, 'nama sangat panjang dipotong')

  const jalur = jalurBerkas({
    ownerId: 'aaaa-bbbb', proyek: 'Ruko Pak Soni',
    nama: 'Denah Lt.1/2', versi: 3, berkasNama: 'denah final REV.pdf',
  })
  const bagian = jalur.split('/')
  assert(bagian[0] === 'aaaa-bbbb',
    'potongan PERTAMA wajib id pemilik — aturan akses bucket memeriksa tepat potongan itu')
  assert(bagian.length === 4, 'empat potongan: pemilik / proyek / gambar / berkas')
  assert(bagian[1] === 'Ruko-Pak-Soni', 'nama proyek dirapikan')
  assert(bagian[3].startsWith('v3-'), 'versinya ada di nama berkas')
  assert(bagian[3].endsWith('.pdf'), 'akhirannya dipertahankan')

  const tanpa = jalurBerkas({ ownerId: '', nama: '', versi: 0, berkasNama: '' })
  assert(tanpa.split('/')[0] === 'tanpa-pemilik', 'tanpa pemilik tetap menghasilkan jalur, bukan melempar')
  assert(tanpa.includes('v1-'), 'versi 0 dinaikkan jadi 1')
}

// ── 5. Yang ditolak, ditolak SEBELUM unggahannya jalan ──────────────────
{
  assert(siapUnggah({ nama: 'Denah', berkasNama: 'a.pdf', ukuran: 1000 }).boleh, 'PDF wajar: boleh')

  const tanpaNama = siapUnggah({ nama: '', berkasNama: 'a.pdf' })
  assert(!tanpaNama.boleh && /Beri nama/.test(tanpaNama.alasan), 'tanpa nama ditolak')
  assert(/Denah Lantai 1/.test(tanpaNama.alasan), 'alasannya memberi CONTOH, bukan cuma menyuruh')

  const tanpaBerkas = siapUnggah({ nama: 'Denah', berkasNama: '' })
  assert(!tanpaBerkas.boleh && /Pilih berkasnya/.test(tanpaBerkas.alasan), 'tanpa berkas ditolak')

  const salahTipe = siapUnggah({ nama: 'Denah', berkasNama: 'gambar.docx' })
  assert(!salahTipe.boleh && /docx/.test(salahTipe.alasan), 'jenis tak didukung ditolak, menyebut jenisnya')
  assert(/pdf/.test(salahTipe.alasan), 'dan menyebutkan yang didukung')

  const terlaluBesar = siapUnggah({ nama: 'Denah', berkasNama: 'a.pdf', ukuran: BATAS_UKURAN + 1 })
  assert(!terlaluBesar.boleh, 'melebihi batas ditolak')
  assert(/MB/.test(terlaluBesar.alasan), 'ukurannya disebut dalam satuan yang dibaca orang')
  assert(/per lembar/.test(terlaluBesar.alasan), 'dan memberi jalan keluar, bukan cuma menolak')

  assert(siapUnggah({ nama: 'Denah', berkasNama: 'a.pdf', ukuran: BATAS_UKURAN }).boleh,
    'pas di batas: boleh')
}

// ── 6. Jenis berkas: DWG diterima walau tidak bisa ditampilkan ──────────
//
// Yang membukanya di kantor punya AutoCAD. Menolak berkas aslinya hanya akan
// membuat orang menyimpannya di tempat lain — yang justru masalah yang sedang
// diselesaikan.
{
  assert(tipeDiterima('rencana.dwg'), 'DWG diterima')
  assert(tipeDiterima('rencana.DXF'), 'huruf besar tetap dikenali')
  assert(!bisaDilihatLangsung('rencana.dwg'), 'tapi tidak bisa ditampilkan di aplikasi')
  assert(bisaDilihatLangsung('denah.pdf'), 'PDF bisa ditampilkan')
  assert(bisaDilihatLangsung('foto.JPG'), 'gambar bisa ditampilkan')
  assert(!tipeDiterima('data.xlsx'), 'yang bukan gambar kerja ditolak')
  assert(!tipeDiterima('tanpa-akhiran'), 'tanpa akhiran ditolak')
  assert(akhiran('a.b.c.pdf') === 'pdf', 'akhiran diambil dari yang terakhir')
  assert(akhiran('') === '', 'kosong aman')
  assert(TIPE_DITERIMA.includes('pdf') && TIPE_DITERIMA.includes('dwg'), 'keduanya terdaftar')
}

// ── 7. Kata "BERLAKU", bukan "terbaru" ─────────────────────────────────
//
// Yang dicari tukang bukan yang paling baru diunggah, melainkan yang boleh
// dikerjakan. Dua hal itu biasanya sama, dan justru karena itu bedanya harus
// disebut dengan kata yang tidak bisa disalahpahami.
assert(tandaVersi(3, true) === 'Versi 3 — BERLAKU', 'yang berlaku ditandai tegas')
assert(tandaVersi(2, false) === 'Versi 2 — sudah diganti', 'yang lama ditandai, bukan disembunyikan')
assert(tandaVersi(0, true) === 'Versi 1 — BERLAKU', 'versi 0 tidak pernah tampil')
assert(tandaVersi('x', false) === 'Versi 1 — sudah diganti', 'bukan angka aman')

// ── 8. Kategori & ukuran terbaca ───────────────────────────────────────
assert(KATEGORI.length === 4, 'empat kategori')
assert(KATEGORI.every(k => k.label && k.untuk), 'tiap kategori menjelaskan isinya')
assert(kategoriSah('struktur') === 'struktur', 'yang sah diterima')
assert(kategoriSah('STRUKTUR') === 'struktur', 'huruf besar dirapikan')
assert(kategoriSah('ngawur') === 'lain', 'yang tak dikenal jatuh ke lain-lain')
assert(kategoriSah(null) === 'lain', 'null aman')
assert(LABEL_KATEGORI.mep === 'MEP', 'label MEP tetap huruf besar')

assert(ukuranTerbaca(500) === '500 B', 'byte')
assert(ukuranTerbaca(2048) === '2 KB', 'kilobyte')
assert(ukuranTerbaca(5 * 1024 * 1024) === '5,0 MB', 'megabyte pakai koma')
assert(ukuranTerbaca(0) === '0 B', 'nol')
assert(ukuranTerbaca('x') === '0 B', 'bukan angka aman')

// ── 9. Ringkasan menyebut yang pernah direvisi ─────────────────────────
{
  assert(ringkasGambar([]) === 'Belum ada gambar kerja', 'kosong disebut apa adanya')
  const k = kelompokkanGambar([
    { id: '1', nama: 'Denah', versi: 1 },
    { id: '2', nama: 'Denah', versi: 2 },
    { id: '3', nama: 'Potongan', versi: 1 },
  ])
  assert(ringkasGambar(k) === '2 gambar · 1 pernah direvisi', 'menyebut jumlah dan yang direvisi')
  assert(ringkasGambar(kelompokkanGambar([{ id: '1', nama: 'Denah', versi: 1 }])) === '1 gambar',
    'tanpa revisi tidak menyebut revisi')
}

console.log(`gambar-kerja: ${ok} assert lulus`)
