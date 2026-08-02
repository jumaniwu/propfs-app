// Test penyatuan daftar proyek antar-perangkat.
import {
  gabungProyek, sisipkanProyek, ringkasSinkron, kalimatSinkron, waktuUbah,
} from '../src/lib/sinkronProyek.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const P = (id, updatedAt, extra = {}) => ({ info: { id, projectName: id }, updatedAt, ...extra })
const ids = (list) => list.map(p => p.info.id).join(',')

// ── Keadaan yang dilaporkan: HP punya 2, laptop punya 1 ────────────────────
{
  // Laptop: hanya "ruko" tersimpan lokal. Cloud memuat keduanya.
  const lokal = [P('ruko', '2026-08-02T05:00:00Z')]
  const cloud = [P('ruko', '2026-08-02T05:00:00Z'), P('rumah', '2026-08-02T04:00:00Z')]
  const h = gabungProyek(lokal, cloud)
  assert(h.gabungan.length === 2, 'proyek dari cloud ikut muncul di laptop')
  assert(ids(h.baruDariCloud) === 'rumah', 'yang ditarik dari cloud disebut')
  assert(h.perluDorong.length === 0, 'tidak ada yang perlu didorong')
}
{
  // HP: "rumah" baru dibuat, belum ada di cloud. TIDAK BOLEH hilang.
  const lokal = [P('ruko', '2026-08-02T05:00:00Z'), P('rumah', '2026-08-02T06:00:00Z')]
  const cloud = [P('ruko', '2026-08-02T05:00:00Z')]
  const h = gabungProyek(lokal, cloud)
  assert(h.gabungan.length === 2, 'proyek yang hanya ada di perangkat ini TIDAK hilang')
  assert(ids(h.perluDorong) === 'rumah', 'yang belum ada di cloud ditandai untuk didorong')
  assert(h.baruDariCloud.length === 0, 'tidak ada yang baru dari cloud')
}

// Kedua sisi punya proyek yang tidak dimiliki sisi lain: keduanya bertahan.
{
  const h = gabungProyek([P('a', '2026-08-01T00:00:00Z')], [P('b', '2026-08-01T00:00:00Z')])
  assert(h.gabungan.length === 2, 'tidak ada sisi yang dikorbankan')
  assert(ids(h.perluDorong) === 'a' && ids(h.baruDariCloud) === 'b', 'arah masing-masing benar')
}

// ── Id sama: yang lebih baru menang ───────────────────────────────────────
{
  const lokal = [P('ruko', '2026-08-02T06:00:00Z', { realisasi: 46.8 })]
  const cloud = [P('ruko', '2026-08-02T05:00:00Z', { realisasi: 32.7 })]
  const h = gabungProyek(lokal, cloud)
  assert(h.gabungan.length === 1, 'tidak digandakan')
  assert(h.gabungan[0].realisasi === 46.8, 'yang lebih baru menang')
  assert(ids(h.perluDorong) === 'ruko', 'yang lebih baru didorong ke cloud')
}
{
  const lokal = [P('ruko', '2026-08-02T04:00:00Z', { realisasi: 32.7 })]
  const cloud = [P('ruko', '2026-08-02T06:00:00Z', { realisasi: 46.8 })]
  const h = gabungProyek(lokal, cloud)
  assert(h.gabungan[0].realisasi === 46.8, 'cloud yang lebih baru menang atas lokal')
  assert(h.perluDorong.length === 0, 'yang kalah baru tidak didorong balik')
}
// Waktu sama: cloud dipertahankan, tidak ada dorongan sia-sia.
{
  const h = gabungProyek([P('x', '2026-08-02T05:00:00Z')], [P('x', '2026-08-02T05:00:00Z')])
  assert(h.perluDorong.length === 0, 'waktu seri tidak memicu dorongan berulang')
}

// ── Data cacat ────────────────────────────────────────────────────────────
assert(waktuUbah({ updatedAt: 'bukan tanggal' }) === 0, 'tanda waktu tak terbaca dianggap paling tua')
assert(waktuUbah({}) === 0, 'tanpa tanda waktu dianggap paling tua')
{
  // Yang tanda waktunya rusak tidak boleh menang atas yang jelas.
  const h = gabungProyek([P('x', 'ngawur', { v: 'lokal' })], [P('x', '2026-08-02T05:00:00Z', { v: 'cloud' })])
  assert(h.gabungan[0].v === 'cloud', 'data cacat tidak menang atas data yang jelas')
}
{
  // Proyek tanpa id tidak bisa dicocokkan maupun disimpan.
  const h = gabungProyek([{ updatedAt: '2026-08-02T05:00:00Z' }, P('a', '2026-08-02T05:00:00Z')], [])
  assert(h.gabungan.length === 1 && ids(h.gabungan) === 'a', 'proyek tanpa id dibuang')
}
// Cloud memuat dua baris untuk id yang sama (bekas kegagalan): yang terbaru dipakai.
{
  const h = gabungProyek([], [P('x', '2026-08-01T00:00:00Z', { v: 1 }), P('x', '2026-08-02T00:00:00Z', { v: 2 })])
  assert(h.gabungan.length === 1 && h.gabungan[0].v === 2, 'baris cloud kembar dirapikan')
}
assert(gabungProyek().gabungan.length === 0, 'tanpa masukan aman')
assert(gabungProyek([], []).gabungan.length === 0, 'dua sisi kosong aman')

// Urutan: terbaru di depan.
{
  const h = gabungProyek(
    [P('lama', '2026-01-01T00:00:00Z'), P('baru', '2026-08-02T00:00:00Z')], [])
  assert(ids(h.gabungan) === 'baru,lama', 'terbaru di depan')
}

// ── sisipkanProyek: menyimpan satu proyek TIDAK menghapus yang lain ───────
{
  // Inilah inti cacatnya: daftar di memori tertinggal (belum memuat "rumah"
  // yang datang dari cloud), tetapi penyimpanan ditulis dari daftar TERBARU.
  const daftarTerbaru = [P('ruko', '2026-08-02T05:00:00Z'), P('rumah', '2026-08-02T04:00:00Z')]
  const disimpan = P('ruko', '2026-08-02T07:00:00Z', { realisasi: 50 })
  const hasil = sisipkanProyek(daftarTerbaru, disimpan)

  assert(hasil.length === 2, 'proyek lain TIDAK ikut terhapus saat menyimpan satu proyek')
  assert(ids(hasil) === 'ruko,rumah', 'yang baru disimpan di depan')
  assert(hasil[0].realisasi === 50, 'isinya yang terbaru')
  assert(hasil.some(p => p.info.id === 'rumah'), '"rumah" selamat')
  assert(daftarTerbaru.length === 2, 'masukan aslinya tidak diubah')
}
{
  const hasil = sisipkanProyek([], P('baru', '2026-08-02T00:00:00Z'))
  assert(hasil.length === 1, 'daftar kosong menerima proyek baru')
}
{
  const daftar = [P('a', '2026-08-01T00:00:00Z')]
  assert(sisipkanProyek(daftar, { updatedAt: 'x' }).length === 1,
    'proyek tanpa id tidak disisipkan, dan tidak merusak daftar')
}

// ── ringkasSinkron ────────────────────────────────────────────────────────
{
  const r = ringkasSinkron(
    [P('ruko', '2026-08-02T05:00:00Z'), P('rumah', '2026-08-02T04:00:00Z')],
    [P('ruko', '2026-08-02T05:00:00Z')],
  )
  assert(r.lokal === 2 && r.cloud === 1, 'hitungan kedua sisi')
  assert(r.belumNaik === 1, 'satu proyek belum sampai server')
  assert(r.belumTurun === 0, 'tidak ada yang tertinggal di server')
  assert(r.aman === false, 'belum aman selama masih ada yang belum naik')
  assert(/1 proyek BELUM tersimpan di server/.test(kalimatSinkron(r)),
    `kalimatnya menyebut bahayanya: ${kalimatSinkron(r)}`)
}
{
  const sama = [P('a', '2026-08-02T00:00:00Z'), P('b', '2026-08-02T00:00:00Z')]
  const r = ringkasSinkron(sama, sama)
  assert(r.aman === true && r.belumNaik === 0 && r.belumTurun === 0, 'kedua sisi sama = aman')
  assert(/2 proyek tersimpan di server/.test(kalimatSinkron(r)), 'kalimat aman menyebut jumlahnya')
}
{
  const r = ringkasSinkron([], [P('a', '2026-08-02T00:00:00Z')])
  assert(r.belumTurun === 1 && r.aman === true,
    'yang belum ditarik bukan bahaya kehilangan data — datanya justru sudah aman di server')
}
assert(kalimatSinkron(ringkasSinkron([], [])) === 'Belum ada proyek.', 'belum ada proyek berbunyi wajar')

console.log(`sinkron-proyek: ${ok} assert lulus`)
