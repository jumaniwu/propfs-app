// Test penyatuan daftar proyek antar-perangkat.
import {
  gabungProyek, sisipkanProyek, ringkasSinkron, kalimatSinkron, waktuUbah,
  gabungIsiProyek, gabungNisan, tandaiDihapus, nisanProyek, UMUR_NISAN_HARI,
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


// ── Dua perangkat menyunting proyek yang SAMA ──────────────────────────────
//
// Ini kejadian nyata, bukan pengandaian: laptop menampilkan 26 transaksi
// (Rp 46,79 juta) sementara ponsel menampilkan 46 (Rp 109,42 juta) untuk
// proyek yang sama. Dua puluh baris hilang tanpa pesan apa pun — karena
// penggabungnya MEMILIH salah satu dokumen, bukan menyatukan isinya.
{
  const { gabungIsiProyek } = await import('../src/lib/sinkronProyek.ts')

  const laptop = {
    info: { id: 'p1', projectName: 'Ruko Pak Soni' },
    updatedAt: '2026-08-14T10:00:00.000Z',
    realisasiEntries: [
      { id: 'a', jumlah: 1000 },
      { id: 'b', jumlah: 2000 },
    ],
  }
  const ponsel = {
    info: { id: 'p1', projectName: 'Ruko Pak Soni' },
    updatedAt: '2026-08-14T12:59:00.000Z',
    realisasiEntries: [
      { id: 'a', jumlah: 1000 },
      { id: 'c', jumlah: 3000 },
      { id: 'd', jumlah: 4000 },
    ],
  }

  const satu = gabungIsiProyek(laptop, ponsel)
  const id = satu.realisasiEntries.map(e => e.id).sort().join(',')
  assert(id === 'a,b,c,d', `SEMUA baris kedua perangkat terbawa: ${id}`)
  assert(satu.realisasiEntries.length === 4, 'empat baris, bukan dua atau tiga')

  // Ini yang dulu terjadi: dokumen ponsel lebih baru, jadi baris "b" milik
  // laptop lenyap.
  assert(satu.realisasiEntries.some(e => e.id === 'b'),
    'baris milik perangkat yang menyimpan lebih DULU tidak dibuang')

  const hasil = gabungProyek([laptop], [ponsel])
  assert(hasil.gabungan[0].realisasiEntries.length === 4,
    'dan gabungProyek pun menyatukan isinya, bukan memilih salah satu')
  assert(hasil.perluDorong.length === 1,
    'hasil gabungannya didorong balik supaya cloud ikut lengkap')
}
{
  const { gabungIsiProyek } = await import('../src/lib/sinkronProyek.ts')
  // Baris yang sama disunting di kedua sisi: versi dari dokumen yang lebih
  // baru yang menang.
  const tua = { info: { id: 'p' }, updatedAt: '2026-08-01T00:00:00.000Z',
    realisasiEntries: [{ id: 'x', jumlah: 100 }] }
  const muda = { info: { id: 'p' }, updatedAt: '2026-08-02T00:00:00.000Z',
    realisasiEntries: [{ id: 'x', jumlah: 999 }] }
  const satu = gabungIsiProyek(tua, muda)
  assert(satu.realisasiEntries.length === 1, 'tidak menggandakan baris dengan id sama')
  assert(satu.realisasiEntries[0].jumlah === 999, 'versi yang lebih baru yang dipakai')
  assert(gabungIsiProyek(muda, tua).realisasiEntries[0].jumlah === 999,
    'urutan argumen tidak mengubah hasilnya')
}
{
  const { gabungIsiProyek } = await import('../src/lib/sinkronProyek.ts')
  const a = { info: { id: 'p' }, updatedAt: '2026-08-01T00:00:00.000Z' }
  const b = { info: { id: 'p' }, updatedAt: '2026-08-02T00:00:00.000Z', projectName: 'baru' }
  const satu = gabungIsiProyek(a, b)
  assert(satu.projectName === 'baru', 'medan biasa tetap dari dokumen yang lebih baru')
  assert(!satu.realisasiEntries, 'proyek tanpa entri tidak diberi daftar kosong karangan')
}


// ── NISAN: penghapusan yang bertahan melewati penggabungan ─────────────────
//
// Keluhannya: "sudah hapus terus tapi dia mengulang, seperti tidak menyimpan
// apa yang sudah update."
//
// Sebabnya mendasar dan bukan soal penyimpanan sama sekali. Penggabungan
// menyatukan baris dari KEDUA sisi, dan penyatuan seperti itu tidak bisa
// menyatakan penghapusan: ketiadaan sebuah baris di satu sisi tidak bisa
// dibedakan dari "belum pernah ada di sisi itu". Baris yang dihapus di HP
// karena itu hidup lagi dari salinan laptop — dihapus, kembali, dihapus,
// kembali.
//
// Berkas ini dulu memuat alasan kenapa itu "dipilih dengan sadar": baris yang
// muncul kembali terlihat dan bisa dihapus lagi. Alasan itu keliru pada satu
// titik — menghapusnya lagi tidak menyelesaikan apa pun, karena penghapusan
// berikutnya menghasilkan dokumen yang sekali lagi hanya TIDAK MEMUAT baris
// itu.
{
  const KEMARIN = '2026-08-20T00:00:00.000Z'
  const HARI_INI = '2026-08-21T00:00:00.000Z'

  // Laptop belum tahu; HP sudah menghapus baris b.
  const laptop = {
    info: { id: 'p1' }, updatedAt: KEMARIN,
    realisasiEntries: [{ id: 'a', jumlah: 1 }, { id: 'b', jumlah: 2 }],
  }
  const hp = {
    info: { id: 'p1' }, updatedAt: HARI_INI,
    realisasiEntries: [{ id: 'a', jumlah: 1 }],
    dihapus: [{ id: 'b', at: HARI_INI }],
  }

  const satu = gabungIsiProyek(laptop, hp)
  const idSatu = satu.realisasiEntries.map(e => e.id)
  assert(!idSatu.includes('b'), 'baris yang dihapus TIDAK hidup lagi — inti perbaikannya')
  assert(idSatu.includes('a'), 'yang tidak dihapus tetap ada')
  assert(satu.dihapus.some(n => n.id === 'b'), 'nisannya ikut terbawa ke hasil')

  // Arahnya tidak boleh berpengaruh: satu perangkat yang menghapus sudah cukup,
  // dan yang belum tahu bukan berarti tidak setuju.
  const balik = gabungIsiProyek(hp, laptop)
  assert(!balik.realisasiEntries.map(e => e.id).includes('b'),
    'urutan argumen tidak mengubah hasilnya')

  // Dan ini yang menghentikan LINGKARANNYA: hasil gabungan itu digabung lagi
  // dengan salinan laptop yang masih lama — persis yang terjadi pada
  // sinkronisasi berikutnya.
  const putaranKedua = gabungIsiProyek(satu, laptop)
  assert(!putaranKedua.realisasiEntries.map(e => e.id).includes('b'),
    'putaran berikutnya pun tidak menghidupkannya kembali')
  const putaranKetiga = gabungIsiProyek(putaranKedua, laptop)
  assert(!putaranKetiga.realisasiEntries.map(e => e.id).includes('b'),
    'dan seterusnya — lingkarannya berhenti')

  // Baris yang dihapus lalu SENGAJA dibuat ulang dengan id baru tetap hidup:
  // yang dicatat penghapusannya adalah id, bukan isinya.
  const buatUlang = gabungIsiProyek(satu, {
    info: { id: 'p1' }, updatedAt: '2026-08-22T00:00:00.000Z',
    realisasiEntries: [{ id: 'b-baru', jumlah: 2 }],
  })
  assert(buatUlang.realisasiEntries.map(e => e.id).includes('b-baru'),
    'baris baru dengan id lain tidak ikut tertahan nisan')
}

// ── Nisan: menyatukan, mengingat yang terbaru, melupakan yang usang ────────
{
  const SEKARANG = Date.parse('2026-08-21T00:00:00.000Z')
  const hari = (n) => new Date(SEKARANG - n * 86400000).toISOString()

  const g = gabungNisan([{ id: 'a', at: hari(1) }], [{ id: 'b', at: hari(2) }], SEKARANG)
  assert(g.length === 2, 'kedua sisi disatukan')

  // Yang paling baru menang: baris yang dihapus lagi setelah sempat dibuat
  // ulang harus memakai tanggal penghapusan yang TERAKHIR, karena tanggal
  // itulah yang menentukan kapan ia boleh dilupakan.
  const dua = gabungNisan([{ id: 'a', at: hari(10) }], [{ id: 'a', at: hari(1) }], SEKARANG)
  assert(dua.length === 1, 'id yang sama tidak digandakan')
  assert(dua[0].at === hari(1), 'yang dipakai tanggal terbaru')

  // Yang sudah lewat umurnya dibuang supaya daftarnya tidak tumbuh selamanya.
  const usang = gabungNisan([{ id: 'a', at: hari(UMUR_NISAN_HARI + 1) }], [], SEKARANG)
  assert(usang.length === 0, 'nisan kedaluwarsa dibuang')
  const masih = gabungNisan([{ id: 'a', at: hari(UMUR_NISAN_HARI - 1) }], [], SEKARANG)
  assert(masih.length === 1, 'yang masih dalam umurnya dipertahankan')
  assert(UMUR_NISAN_HARI >= 90,
    'umurnya harus jauh lebih lama daripada jeda terlama sebuah HP proyek tidak dibuka')

  // Nisan TANPA tanggal tidak dibuang: ketiadaan tanggal berarti asalnya tidak
  // diketahui, dan membuang penghapusan yang tidak diketahui umurnya berarti
  // menghidupkan kembali baris yang sudah sengaja dihapus.
  assert(gabungNisan([{ id: 'a' }], [], SEKARANG).length === 1, 'nisan tanpa tanggal dipertahankan')

  assert(gabungNisan([{ id: '' }], [], SEKARANG).length === 0, 'id kosong dibuang')
  assert(gabungNisan(null, undefined, SEKARANG).length === 0, 'masukan kosong aman')
}

// ── tandaiDihapus ────────────────────────────────────────────────────────
{
  const p = { info: { id: 'p1' }, realisasiEntries: [{ id: 'a' }, { id: 'b' }] }
  const t = tandaiDihapus(p, ['b'], '2026-08-21T00:00:00.000Z')
  assert(nisanProyek(t).some(n => n.id === 'b'), 'penghapusan tercatat')
  assert(t.realisasiEntries.length === 2, 'barisnya sendiri tidak ikut disentuh di sini')
  assert(tandaiDihapus(p, []) === p, 'tanpa id: dokumen yang sama, bukan salinan baru')
  assert(nisanProyek({}).length === 0, 'dokumen tanpa nisan aman')
  assert(nisanProyek(null).length === 0, 'null aman')
}

// ── Penghapusan DIDORONG ke cloud, bukan dianggap tidak ada yang baru ─────
//
// Cacat yang kebalikannya: setelah sebuah baris dihapus, hasil gabungan lebih
// SEDIKIT daripada salinan cloud. Pemeriksaan lama hanya menanyakan "apakah
// lebih banyak" — jawabannya tidak, cloud tetap memuat baris yang sudah
// dihapus, dan penggabungan berikutnya menghidupkannya kembali. Lingkaran yang
// sama, hanya berpindah tempat.
{
  const HARI_INI = '2026-08-21T00:00:00.000Z'
  const lokal = {
    info: { id: 'p1' }, updatedAt: HARI_INI,
    realisasiEntries: [{ id: 'a' }],
    dihapus: [{ id: 'b', at: HARI_INI }],
  }
  const cloud = {
    info: { id: 'p1' }, updatedAt: '2026-08-20T00:00:00.000Z',
    realisasiEntries: [{ id: 'a' }, { id: 'b' }],
  }
  const { perluDorong } = gabungProyek([lokal], [cloud])
  assert(perluDorong.length === 1, 'penghapusan menjadi alasan mendorong ke cloud')
  assert(!perluDorong[0].realisasiEntries.map(e => e.id).includes('b'),
    'yang didorong sudah tanpa baris yang dihapus')
  assert(perluDorong[0].dihapus.some(n => n.id === 'b'),
    'berikut nisannya, supaya perangkat lain ikut berhenti menghidupkannya')
}

console.log(`sinkron-proyek: ${ok} assert lulus`)
