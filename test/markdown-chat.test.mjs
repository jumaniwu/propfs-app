// ============================================================
// Membuktikan bahwa tabel rekap dari AI benar-benar menjadi TABEL.
//
// Instruksi sistem sejak dulu berbunyi "tampilkan tabel rekap markdown", dan
// model memang mengirimnya. Yang hilang adalah penggambarnya: halaman Chat AI
// menyalin sebagian kecil penggambar milik tab Realisasi, tanpa bagian tabel.
// Jadi rekap nota keluar sebagai deretan pipa di halaman yang paling sering
// dipakai — "format chat dulu lebih rapi, kalau perlu tabel dia munculin tabel".
// ============================================================
import { uraikanMarkdown, potongGaya, selBaris } from '../src/lib/markdownChat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const jenisnya = t => uraikanMarkdown(t).map(b => b.jenis)

// ── 1. Balasan sungguhan atas satu foto nota ────────────────────────────
const BALASAN = `Baik, saya sudah baca notanya. Berikut rekapnya:

## Rekap Nota A123 — Toko Bangunan Maju

| Item | Qty | Satuan | Harga Satuan | Total |
|---|---|---|---|---|
| Semen Portland 50kg | 20 | sak | Rp 58.000 | Rp 1.160.000 |
| Besi Beton 10mm | 15 | btg | Rp 82.000 | Rp 1.230.000 |
| **Total** | | | | **Rp 2.390.000** |

Beberapa hal yang perlu dikonfirmasi:
- Tanggal nota tidak terbaca jelas
- Apakah ini pembelian tunai atau tempo?`

{
  const blok = uraikanMarkdown(BALASAN)
  const tabel = blok.find(b => b.jenis === 'tabel')
  assert(tabel, 'tabel rekapnya dikenali sebagai TABEL, bukan paragraf berisi pipa')
  assert(tabel.kepala.length === 5, `lima kolom terbaca (${tabel.kepala.join(' | ')})`)
  assert(tabel.kepala[3] === 'Harga Satuan', 'judul kolomnya utuh')
  assert(tabel.baris.length === 3, 'tiga baris data — baris pemisah tidak ikut terhitung')
  assert(tabel.baris[0][0] === 'Semen Portland 50kg', 'baris pertama adalah data, bukan pemisah')
  assert(tabel.baris[1][4] === 'Rp 1.230.000', 'nilai di kolom terakhir tidak tergeser')

  assert(blok.some(b => b.jenis === 'judul' && b.teks.startsWith('Rekap Nota')),
    'judul "##" menjadi judul, bukan tercetak apa adanya berikut pagarnya')
  const daftar = blok.find(b => b.jenis === 'daftar')
  assert(daftar && daftar.butir.length === 2, 'dua butir pertanyaannya menjadi daftar')
  assert(daftar.urut === false, 'daftar tak berurut')
}

// ── 2. INI CACAT LAMANYA: sel kosong menggeser seluruh kolom ────────────
//
// Penggambar lama memakai `.filter(c => c.trim())`, yang MEMBUANG sel kosong.
// Pada baris total di atas — qty, satuan, dan harga satuan semuanya kosong —
// "Rp 2.390.000" akan naik ke kolom Qty. Tabel yang salah lebih berbahaya
// daripada tabel yang tidak muncul: angkanya terbaca, hanya di kolom keliru.
{
  const tabel = uraikanMarkdown(BALASAN).find(b => b.jenis === 'tabel')
  const total = tabel.baris[2]
  assert(total.length === 5, 'baris total tetap lima sel')
  assert(total[0] === '**Total**', 'labelnya di kolom pertama')
  assert(total[1] === '' && total[2] === '' && total[3] === '', 'sel kosong TIDAK dibuang')
  assert(total[4] === '**Rp 2.390.000**',
    'sehingga totalnya tetap di kolom Total — bukan naik ke kolom Qty')
}

// ── 3. Tabel tanpa baris pemisah tidak kehilangan data ──────────────────
//
// Penggambar lama memakai `slice(2)` tanpa memeriksa. Bila model melewatkan
// baris `|---|`, baris data pertama ikut termakan diam-diam.
{
  const t = uraikanMarkdown('| A | B |\n| 1 | 2 |\n| 3 | 4 |').find(b => b.jenis === 'tabel')
  assert(t.baris.length === 2, 'kedua baris datanya utuh meski tanpa baris pemisah')
  assert(t.baris[0][0] === '1', 'baris pertama tidak dimakan')
}
{
  const t = uraikanMarkdown('| A | B |\n|:--|--:|\n| 1 | 2 |').find(b => b.jenis === 'tabel')
  assert(t.baris.length === 1 && t.baris[0][0] === '1',
    'pemisah dengan tanda rata (:--) tetap dikenali sebagai pemisah')
}
{
  // Baris cacat tidak boleh merusak tabelnya.
  const t = uraikanMarkdown('| A | B | C |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |')
    .find(b => b.jenis === 'tabel')
  assert(t.baris[0].length === 3 && t.baris[0][2] === '', 'yang kurang diisi kosong')
  assert(t.baris[1].length === 3, 'yang berlebih dipotong')
}
{
  const blok = uraikanMarkdown('| bukan tabel, cuma satu baris berpipa')
  assert(blok[0].jenis === 'paragraf', 'satu baris berpipa tanpa isi tetap kalimat biasa')
}

// ── 4. Gaya dalam baris ─────────────────────────────────────────────────
{
  const p = potongGaya('Total **Rp 2.390.000** untuk nota `A123`')
  assert(p.filter(s => s.gaya === 'tebal')[0].teks === 'Rp 2.390.000', 'tebal terbaca')
  assert(p.filter(s => s.gaya === 'kode')[0].teks === 'A123', 'kode sebaris terbaca')
  assert(p.map(s => s.teks).join('') === 'Total Rp 2.390.000 untuk nota A123',
    'dan tidak ada huruf yang hilang saat dipotong')
}
assert(potongGaya('').length === 1, 'teks kosong tetap satu bagian, bukan nol')
assert(potongGaya(null)[0].teks === '', 'null aman')
assert(potongGaya('2 ** 3 ** 4').every(s => s.gaya === 'biasa' || s.teks.trim()),
  'bintang yang bukan penanda tidak menelan teks')

// ── 5. Sisanya ──────────────────────────────────────────────────────────
assert(jenisnya('### Judul kecil')[0] === 'judul', 'judul tiga pagar')
assert(uraikanMarkdown('# Besar')[0].tingkat === 1, 'tingkat judul terbaca')
assert(uraikanMarkdown('#bukan judul')[0].jenis === 'paragraf', 'pagar tanpa spasi bukan judul')
{
  const d = uraikanMarkdown('1. Satu\n2. Dua\n3. Tiga')[0]
  assert(d.jenis === 'daftar' && d.urut === true && d.butir.length === 3, 'daftar bernomor')
  assert(d.butir[2] === 'Tiga', 'isinya tanpa nomornya')
}
assert(uraikanMarkdown('* a\n* b')[0].butir.length === 2, 'butir dengan bintang')
assert(uraikanMarkdown('```\nhalo\n```')[0].jenis === 'kode', 'pagar kode dikenali')
assert(uraikanMarkdown('```json\n{"a":1}\n```')[0].isi === '{"a":1}', 'isinya tanpa pagarnya')
assert(uraikanMarkdown('---')[0] === undefined, 'garis pemisah di awal tidak menyisakan jeda kosong')
assert(uraikanMarkdown('')?.length === 0, 'teks kosong menghasilkan nol blok')
assert(uraikanMarkdown(null).length === 0, 'null aman')
{
  const j = jenisnya('a\n\n\n\nb')
  assert(j.filter(x => x === 'jeda').length === 1,
    'baris kosong beruntun tidak menjadi tumpukan jeda — balasan model penuh dengannya')
  assert(j[j.length - 1] !== 'jeda', 'dan tidak menyisakan jeda menggantung di akhir')
}

console.log(`markdown-chat: ${ok} assert lulus`)
