// Test sinkronisasi dengan penghapusan (tombstone) — mencegah entri yang
// sudah dihapus muncul kembali dari cloud dan tampil dobel.
import {
  gabungNisan, gabungDenganNisan, unionById, UMUR_NISAN_HARI,
} from '../src/lib/cloudSync.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const kini = new Date('2026-07-26T00:00:00Z')
const id = x => x.id
const hariLalu = n => new Date(kini.getTime() - n * 86_400_000).toISOString()

// ── gabungNisan ────────────────────────────────────────────────────────────
const n1 = gabungNisan(
  [{ id: 'a', at: hariLalu(1) }],
  [{ id: 'b', at: hariLalu(2) }],
  kini,
)
assert(n1.length === 2, 'nisan dari kedua sisi digabung')

// id sama → yang paling baru menang
const n2 = gabungNisan(
  [{ id: 'a', at: '2026-07-20T00:00:00Z' }],
  [{ id: 'a', at: '2026-07-25T00:00:00Z' }],
  kini,
)
assert(n2.length === 1 && n2[0].at === '2026-07-25T00:00:00Z', 'nisan terbaru menang')

// nisan kedaluwarsa dibuang
const n3 = gabungNisan([{ id: 'lama', at: hariLalu(UMUR_NISAN_HARI + 1) }], [], kini)
assert(n3.length === 0, 'nisan lebih tua dari batas umur dibuang')
const n4 = gabungNisan([{ id: 'masih', at: hariLalu(UMUR_NISAN_HARI - 1) }], [], kini)
assert(n4.length === 1, 'nisan yang belum kedaluwarsa dipertahankan')

// data cacat tidak merusak
assert(gabungNisan([{ id: 'x', at: 'bukan-tanggal' }], [], kini).length === 1,
  'tanggal tidak terbaca dianggap masih berlaku')
assert(gabungNisan([{ at: hariLalu(1) }], [], kini).length === 0, 'nisan tanpa id diabaikan')
assert(gabungNisan([], [], kini).length === 0, 'tanpa nisan aman')

// ── gabungDenganNisan: inti perbaikan ──────────────────────────────────────
// Kasus nyata: entri lama masih ada di cloud, sudah dihapus di perangkat ini,
// lalu pengguna menambahkan entri baru untuk proyek yang benar.
const lokal = [{ id: 'baru', nama: 'DP Pak Soni', projectId: 'p-soni' }]
const cloud = [{ id: 'lama', nama: 'DP Pak Soni', projectId: undefined }]
const hasil = gabungDenganNisan(lokal, cloud, id, [{ id: 'lama', at: hariLalu(1) }], [], kini)

assert(hasil.entries.length === 1, 'entri yang sudah dihapus tidak dihidupkan kembali')
assert(hasil.entries[0].id === 'baru', 'hanya entri baru yang bertahan')
assert(hasil.nisan.length === 1, 'nisan diteruskan agar ikut tersimpan ke cloud')

// tanpa nisan, perilaku lama memang menghasilkan dobel — ini buktinya
const tanpaNisan = unionById(lokal, cloud, id)
assert(tanpaNisan.length === 2, 'union tanpa nisan memang menghasilkan dua entri (bug lama)')

// penghapusan dari sisi cloud juga dihormati (perangkat lain yang menghapus)
const dariCloud = gabungDenganNisan(
  [{ id: 'x' }, { id: 'y' }], [{ id: 'x' }], id,
  [], [{ id: 'x', at: hariLalu(1) }], kini,
)
assert(dariCloud.entries.length === 1 && dariCloud.entries[0].id === 'y',
  'penghapusan dari perangkat lain ikut berlaku')

// idempoten: memuat ulang hasilnya tidak berubah
const ulang = gabungDenganNisan(hasil.entries, cloud, id, hasil.nisan, [], kini)
assert(ulang.entries.length === 1 && ulang.entries[0].id === 'baru', 'pemuatan ulang tetap satu entri')
const ulang2 = gabungDenganNisan(ulang.entries, cloud, id, ulang.nisan, [], kini)
assert(ulang2.entries.length === 1, 'pemuatan ketiga tetap stabil')

// nisan kedaluwarsa tidak lagi menahan entri (id acak tak dipakai ulang)
const kedaluwarsa = gabungDenganNisan(
  [], [{ id: 'z' }], id, [{ id: 'z', at: hariLalu(UMUR_NISAN_HARI + 5) }], [], kini,
)
assert(kedaluwarsa.entries.length === 1, 'setelah nisan kedaluwarsa entri cloud kembali terbaca')

// entri yang tidak pernah dihapus tetap utuh dari kedua sisi
const utuh = gabungDenganNisan([{ id: 'a' }], [{ id: 'b' }], id, [], [], kini)
assert(utuh.entries.length === 2, 'entri dari kedua sisi tetap dipertahankan')
assert(gabungDenganNisan([], [], id).entries.length === 0, 'data kosong aman')
assert(UMUR_NISAN_HARI === 180, 'umur nisan bawaan 180 hari')

console.log(`✅ cloudSync nisan: ${ok} assertion lolos`)
