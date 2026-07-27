// Test penyatuan nama material supaya stok satu barang tidak terbagi.
import { normalNama, awalanUtuh, petaNamaBaku, pengelompokNama } from '../src/lib/namaMaterial.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── normalNama ─────────────────────────────────────────────────────────────
assert(normalNama('Triplek 9mm Pku') === 'triplek 9mm pku', 'huruf diseragamkan')
assert(normalNama('  Triplek   9mm  Pku ') === 'triplek 9mm pku', 'spasi berlebih dirapikan')
assert(normalNama('Triplek 9mm Pku @130lmbr/pallet') === 'triplek 9mm pku',
  'keterangan setelah @ dibuang')
assert(normalNama('Semen 50kg @ Rp58.000') === 'semen 50kg', 'harga yang ikut terketik dibuang')
assert(normalNama('Triplek 9mm Pku (pallet)') === 'triplek 9mm pku', 'catatan dalam kurung dibuang')
assert(normalNama('Besi [SNI] 12mm') === 'besi 12mm', 'kurung siku di tengah juga dibuang')
assert(normalNama('Paku Triplek 1”') === 'paku triplek 1"', 'tanda kutip inci diseragamkan')
assert(normalNama('Paku Triplek 1″') === 'paku triplek 1"', 'kutip ganda prima ikut diseragamkan')
assert(normalNama('Kayu 2x3 -') === 'kayu 2x3', 'pemisah menggantung dipangkas')
assert(normalNama('') === '' && normalNama(null) === '' && normalNama(undefined) === '',
  'masukan kosong aman')

// ── awalanUtuh ─────────────────────────────────────────────────────────────
assert(awalanUtuh('triplek 9mm pku', 'triplek 9mm pku 130lmbr') === true,
  'keterangan tambahan setelah spasi dianggap barang yang sama')
assert(awalanUtuh('kayu 2x3', 'kayu 2x3x4') === false,
  'ukuran berbeda TIDAK digabung — tidak ada spasi setelah awalannya')
assert(awalanUtuh('besi 12', 'besi 120mm') === false, 'angka yang menyambung bukan awalan utuh')
assert(awalanUtuh('semen', 'semen gresik') === true, 'merek tambahan dianggap barang yang sama')
assert(awalanUtuh('abc', 'abc def') === true, 'tiga huruf sudah cukup jelas')
assert(awalanUtuh('ab', 'ab cd') === false, 'nama terlalu pendek tidak boleh jadi induk')
assert(awalanUtuh('sama', 'sama') === false, 'nama yang identik bukan urusan awalan')
assert(awalanUtuh('', 'apa saja') === false, 'nama kosong tidak pernah cocok')
assert(awalanUtuh('panjang sekali', 'pendek') === false, 'yang panjang bukan awalan yang pendek')

// ── petaNamaBaku ───────────────────────────────────────────────────────────
{
  const p = petaNamaBaku([
    'Triplek 9mm Pku',
    'Triplek 9mm Pku @130lmbr/pallet',
    'Paku Triplek 1"',
  ])
  assert(p.get('triplek 9mm pku') === 'triplek 9mm pku', 'nama terpendek jadi baku')
  assert(p.get('paku triplek 1"') === 'paku triplek 1"',
    'barang lain yang kebetulan mengandung kata sama tidak ikut tergabung')
}

// Rantai bertingkat berakhir di nama terpendek.
{
  const p = petaNamaBaku(['Besi', 'Besi Beton', 'Besi Beton 12mm SNI'])
  assert(p.get('besi beton 12mm sni') === 'besi', 'rantai diselesaikan sampai ujung')
  assert(p.get('besi beton') === 'besi', 'tingkat tengah ikut mengarah ke ujung')
}

// Nama yang tidak berhubungan tetap berdiri sendiri.
{
  const p = petaNamaBaku(['Semen Gresik', 'Semen Tiga Roda'])
  assert(p.get('semen gresik') === 'semen gresik' && p.get('semen tiga roda') === 'semen tiga roda',
    'dua merek berbeda tidak digabung')
}

assert(petaNamaBaku([]).size === 0, 'daftar kosong aman')
assert(petaNamaBaku(['', '   ']).size === 0, 'nama kosong dibuang')

// ── pengelompokNama ────────────────────────────────────────────────────────
{
  const g = pengelompokNama([
    'Triplek 9mm Pku @130lmbr/pallet',
    'Triplek 9mm Pku',
    'triplek 9mm pku (pallet)',
    'Paku Triplek 1"',
  ])
  const k = g.kunci('Triplek 9mm Pku @130lmbr/pallet')
  assert(k === g.kunci('Triplek 9mm Pku'), 'ketiga penulisan jatuh ke satu kelompok')
  assert(k === g.kunci('triplek 9mm pku (pallet)'), 'termasuk yang memakai kurung')
  assert(g.kunci('Paku Triplek 1"') !== k, 'barang lain tetap terpisah')

  assert(g.tampilan('Triplek 9mm Pku @130lmbr/pallet') === 'Triplek 9mm Pku',
    'yang ditampilkan penulisan asli terpendek, huruf besarnya utuh')

  // Nama yang belum pernah terdaftar tetap bisa ditanya.
  assert(g.kunci('Barang Baru') === 'barang baru', 'nama asing dinormalkan apa adanya')
  assert(g.tampilan('Barang Baru') === 'Barang Baru', 'nama asing ditampilkan apa adanya')
}

// Kelompok memilih penulisan terpendek, bukan yang pertama muncul.
{
  const g = pengelompokNama(['Semen Portland 50kg Tipe I', 'Semen Portland 50kg'])
  assert(g.tampilan('Semen Portland 50kg Tipe I') === 'Semen Portland 50kg',
    'yang panjang mengikuti yang pendek')
}

assert(pengelompokNama([]).kunci('X') === 'x', 'pengelompok kosong tetap bisa dipakai')

console.log(`nama-material: ${ok} assert lulus`)
