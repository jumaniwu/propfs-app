// ============================================================
// Memperbaiki baris biaya yang salah ketik.
//
// Keluhannya: "sudah ku suruh perbaiki nominal kurang ribuan tapi ga ke-save".
// Di layar, lima baris "Pembelian alat kerja" berbunyi Rp 135, Rp 60, Rp 15 —
// seperseribu dari yang dimaksud — dan permintaan memperbaikinya dijawab
// "✅ perubahan dicatat" tanpa satu pun angka berubah.
//
// Dua cacat bertemu di situ, dan berkas ini menjaga keduanya tetap tertutup.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  angkaRupiah, bersihkanPatch, terapkanPerubahan, kalimatSunting,
} from '../src/lib/suntingBiaya.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const MEDAN = ['jumlah', 'keterangan', 'tanggal', 'volume', 'hargaSatuan', 'kategori']

// ── 1. Titik adalah pemisah RIBUAN, bukan koma desimal ────────────────
//
// Inilah asal "kurang ribuan" itu. `Number("135.000")` bernilai 135, karena
// JavaScript membaca titik itu sebagai desimal. Rp 135 ribu tersimpan sebagai
// Rp 135 — seperseribu — tanpa satu pun tanda bahwa ada yang salah.
{
  assert(Number('135.000') === 135, 'prasyarat: begini JavaScript membacanya, dan itu salah di sini')
  assert(angkaRupiah('135.000') === 135000, 'dan begini seharusnya')
  assert(angkaRupiah('1.500.000') === 1500000, 'dua pemisah ribuan')
  assert(angkaRupiah('Rp 2.900.000') === 2900000, 'dengan "Rp" dan spasi')
  assert(angkaRupiah('1.500,50') === 1500.5, 'koma tetap desimal')
}

// ── 2. Angka yang sudah berupa number dibiarkan apa adanya ───────────
{
  assert(angkaRupiah(135000) === 135000, 'number lewat begitu saja')
  assert(angkaRupiah(1.5) === 1.5, 'desimal asli tidak dirusak')
  assert(angkaRupiah(0) === 0, 'nol tetap nol')
  assert(angkaRupiah(NaN) === 0, 'NaN tidak menular ke totalnya')
  assert(angkaRupiah(Infinity) === 0, 'tak hingga juga')
}

// ── 3. Singkatan yang memang dipakai di lapangan ─────────────────────
//
// Yang mengetiknya sedang berdiri di proyek, bukan di depan formulir akuntansi.
{
  assert(angkaRupiah('135rb') === 135000, 'rb')
  assert(angkaRupiah('135 ribu') === 135000, 'ribu, dengan spasi')
  assert(angkaRupiah('1,5jt') === 1500000, 'jt dengan koma desimal')
  assert(angkaRupiah('2 juta') === 2000000, 'juta')
  assert(angkaRupiah('1,2 miliar') === 1200000000, 'miliar')
  assert(angkaRupiah('50k') === 50000, 'k')
  // "juta" mengandung "jt" hanya bila polanya diperiksa terbalik; urutan yang
  // salah membuat sisanya ikut terbaca sebagai angka.
  assert(angkaRupiah('3juta') === 3000000, 'juta tidak tertukar dengan jt')
}

// ── 4. Masukan yang tak terbaca menghasilkan 0, bukan NaN ───────────
{
  assert(angkaRupiah('') === 0, 'kosong')
  assert(angkaRupiah(null) === 0, 'null')
  assert(angkaRupiah(undefined) === 0, 'undefined')
  assert(angkaRupiah('entah') === 0, 'omong kosong')
  assert(!Number.isNaN(angkaRupiah({})), 'objek tidak menghasilkan NaN')
}

// ── 5. Nominal 0 dari teks tak terbaca TIDAK menimpa yang sudah benar ─
//
// Kalau ia lewat, permintaan "perbaiki nominalnya" yang gagal dibaca akan
// MENGOSONGKAN angka yang tadinya benar — merusak lebih jauh daripada tidak
// melakukan apa-apa.
{
  const p = bersihkanPatch({ jumlah: 'entah berapa' }, MEDAN)
  assert(!('jumlah' in p), 'angka yang tidak terbaca dibuang, bukan dijadikan 0')

  // Nol yang memang DISENGAJA tetap boleh lewat.
  assert(bersihkanPatch({ jumlah: 0 }, MEDAN).jumlah === 0, 'nol sebagai number: sengaja')
  assert(bersihkanPatch({ jumlah: '0' }, MEDAN).jumlah === 0, 'nol sebagai teks: sengaja')
}

// ── 6. Medan asing dibuang ──────────────────────────────────────────
//
// AI yang mengarang nama medan tidak boleh menyelundupkan apa pun ke baris
// tersimpan — termasuk `id`, yang kalau tertimpa membuat barisnya kehilangan
// jejak ke catatan penghapusan dan ke surat jalannya.
{
  const p = bersihkanPatch(
    { jumlah: '135.000', keterangan: 'Alat kerja', id: 'diganti', racun: 'x' }, MEDAN)
  assert(p.jumlah === 135000, 'medan sah lewat')
  assert(p.keterangan === 'Alat kerja', 'teks tidak diutak-atik')
  assert(!('id' in p), 'id tidak bisa ditimpa')
  assert(!('racun' in p), 'medan asing dibuang')
  assert(!('jumlah' in bersihkanPatch({ jumlah: null }, MEDAN)), 'null bukan perubahan')
  assert(Object.keys(bersihkanPatch(null, MEDAN)).length === 0, 'kosong aman')
}

// ── 7. Id yang tidak ada TIDAK boleh dilaporkan sebagai berhasil ────
//
// Inilah cacat keduanya, dan yang paling merugikan. `map(e => e.id === id ?
// ... : e)` atas id yang tidak ada tidak melempar apa pun dan tidak mengubah
// apa pun. Yang memanggilnya lalu menghitung berapa perubahan yang DIMINTA —
// bukan berapa yang terjadi — dan berkata "✅ 5 perubahan dicatat".
{
  const entries = [
    { id: 'a', jumlah: 135, keterangan: 'Pembelian alat kerja' },
    { id: 'b', jumlah: 60, keterangan: 'Pembelian alat kerja' },
  ]
  const h = terapkanPerubahan(entries, [
    { id: 'a', data: { jumlah: '135.000' } },
    { id: 'zzz', data: { jumlah: '99.000' } },
  ], MEDAN)

  assert(h.berubah.length === 1, 'hanya satu yang sungguh berubah')
  assert(h.hilang.length === 1 && h.hilang[0] === 'zzz', 'yang tidak ketemu dilaporkan')
  assert(h.hasil[0].jumlah === 135000, 'nominalnya benar-benar diperbaiki')
  assert(h.hasil[1].jumlah === 60, 'baris lain tidak tersentuh')
  assert(entries[0].jumlah === 135, 'daftar aslinya tidak diubah di tempat')

  assert(terapkanPerubahan(entries, [{ data: { jumlah: 1 } }], MEDAN).hilang.length === 1,
    'perubahan tanpa id dihitung gagal, bukan diam-diam dibuang')
}

// ── 8. Tambalan yang tidak mengubah apa pun bukan "perubahan" ───────
//
// AI kadang mengulangi nilai yang sudah ada di sana. Melaporkannya sebagai
// berhasil membuat pemakainya mengira permintaannya dikerjakan.
{
  const entries = [{ id: 'a', jumlah: 135000, keterangan: 'Alat' }]
  const sama = terapkanPerubahan(entries, [{ id: 'a', data: { jumlah: 135000 } }], MEDAN)
  assert(sama.berubah.length === 0 && sama.kosong.length === 1, 'nilai yang sama bukan perubahan')

  const hampa = terapkanPerubahan(entries, [{ id: 'a', data: { racun: 'x' } }], MEDAN)
  assert(hampa.berubah.length === 0 && hampa.kosong.length === 1,
    'tambalan yang seluruh medannya dibuang juga bukan perubahan')

  assert(terapkanPerubahan(null, null, MEDAN).hasil.length === 0, 'kosong aman')
}

// ── 9. Kalimatnya menyebut yang GAGAL, bukan hanya yang berhasil ────
//
// Notifikasi yang selalu berbunyi berhasil membuat pemakainya menutup layar,
// dan baru menemukan angkanya masih salah keesokan harinya — ketika ia sudah
// tidak ingat lagi apa yang tadi ia minta.
{
  assert(kalimatSunting({ berubah: [], hilang: [], kosong: [] }) === '',
    'tidak ada apa-apa: tidak usah berbunyi sama sekali')

  const semua = kalimatSunting({ berubah: ['a', 'b'], hilang: [], kosong: [] })
  assert(/2 baris diperbarui/.test(semua), 'semua berhasil: sebutkan jumlahnya')
  assert(!/gagal/.test(semua), 'tanpa kegagalan: tidak menakut-nakuti')

  const campur = kalimatSunting({ berubah: ['a'], hilang: ['z'], kosong: ['y'] })
  assert(/1 baris diperbarui/.test(campur), 'yang berhasil disebut')
  assert(/2 gagal/.test(campur), 'yang gagal juga disebut, dan dihitung benar')
  assert(/sunting/i.test(campur), 'dan diberi jalan keluar yang tidak lewat AI lagi')

  const nihil = kalimatSunting({ berubah: [], hilang: ['z'], kosong: [] })
  assert(/[Tt]idak ada yang berubah/.test(nihil),
    'nol berhasil: dikatakan terang-terangan, BUKAN "perubahan dicatat"')
}

// ── 10. Aturannya dijaga di sumbernya ────────────────────────────────
//
// Ketiganya gampang sekali dikembalikan tanpa sengaja, dan tak satu pun
// menimbulkan galat ketika kembali — yang terjadi hanya angka yang salah
// diam-diam masuk buku.
{
  const akar = new URL('../src', import.meta.url).pathname
  const baca = (rel) => readFileSync(join(akar, rel), 'utf8')

  const ai = baca('lib/ai-realisasi.ts')
  assert(!/Number\(item\.jumlah\)/.test(ai),
    'nominal tidak lagi lewat Number() telanjang — Number("135.000") = 135')
  assert(/angkaAi\(item\.jumlah\)/.test(ai), 'melainkan lewat pembaca yang mengerti titik ribuan')
  assert(/bersihkanPatch\(u\.data/.test(ai),
    'tambalan revisi ikut dibersihkan; dulu hanya `added` yang diperiksa')
  assert(/ATURAN ANGKA/.test(ai), 'dan modelnya diberi tahu bentuk angka yang benar')

  const tab = baca('components/cost/TabRealisasiBiaya.tsx')
  assert(/terapkanPerubahan\(/.test(tab),
    'revisi diterapkan lewat jalur yang melaporkan kegagalan')
  assert(!/changeCount \+= parsedResult\.updated\.length/.test(tab),
    'penghitungnya TIDAK boleh memakai jumlah yang DIMINTA — itu yang dulu '
    + 'membuat "5 perubahan dicatat" muncul padahal nol yang berubah')
  assert(/data-sunting-baris/.test(tab),
    'setiap baris bisa diperbaiki dengan tangan; salah ketik satu angka tidak '
    + 'seharusnya memerlukan percakapan dengan AI')
}

console.log(`sunting-biaya: ${ok} assert lulus`)
