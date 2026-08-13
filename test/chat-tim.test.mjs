// Test Chat Tim: penggabungan pesan orang + kabar sistem, dan bahan KPI.
import {
  susunChat, kelompokHari, labelHari, belumTerbaca, batasTerbaca,
  ringkasChat, proyekDiChat, namaKunci,
} from '../src/lib/chatTim.ts'
import { nilaiKpi, ringkasAnggota, LABEL_KEGIATAN, URUT_KEGIATAN } from '../src/lib/kpiTim.ts'
import { susunNotifikasi } from '../src/lib/notifikasi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const PESAN = [
  { id: 'm1', penulis_id: 'u-yono', penulis_nama: 'Pak Yono', penulis_role: 'pengawas',
    teks: 'Cor kolom lt.2 sudah selesai', created_at: '2026-07-20T09:30:00Z', project_name: 'Ruko Pak Soni' },
  { id: 'm2', penulis_id: 'u-ria', penulis_nama: 'Ibu Ria', penulis_role: 'pm',
    teks: 'Siap, besok saya cek', created_at: '2026-07-20T10:15:00Z', balas_id: 'm1' },
  { id: 'm3', penulis_id: 'u-yono', penulis_nama: 'Pak Yono', penulis_role: 'pengawas',
    teks: '', foto: ['data:image/png;base64,xx'], created_at: '2026-07-21T07:00:00Z' },
]

const KABAR = susunNotifikasi({
  laporan: [{ id: 'l1', created_at: '2026-07-20T08:00:00Z', pelapor: 'Pak Yono',
    kegiatan: 'Cor kolom lt.2', project_name: 'Ruko Pak Soni' }],
  request: [{ id: 'r1', created_at: '2026-07-20T11:00:00Z', pemohon: 'Budi',
    nama: 'Besi 12mm', qty: 50, satuan: 'btg', status: 'menunggu' }],
  ttd: [{ id: 's1', signed_at: '2026-07-21T12:00:00Z', nomor: 'SPK/002', signed_name: 'Ibu Ria' }],
})

// ── susunChat: satu aliran, terlama di atas ────────────────────────────────
const aliran = susunChat(PESAN, KABAR)
assert(aliran.length === 6, `3 pesan + 3 kabar = 6 baris (dapat ${aliran.length})`)
assert(aliran[0].waktu === '2026-07-20T08:00:00Z', 'terlama di atas, seperti aplikasi chat')
assert(aliran[aliran.length - 1].waktu === '2026-07-21T12:00:00Z', 'terbaru di bawah')
assert(aliran.filter(b => b.jenis === 'orang').length === 3, 'tiga pesan orang')
assert(aliran.filter(b => b.jenis === 'sistem').length === 3, 'tiga kabar sistem')

// Id diberi awalan supaya pesan dan kabar tidak pernah bertabrakan kuncinya.
assert(aliran.every(b => /^(pesan|sistem):/.test(b.id)), 'id dibedakan asalnya')

{
  const p = aliran.find(b => b.id === 'pesan:m1')
  assert(p.nama === 'Pak Yono' && p.role === 'pengawas', 'nama & jabatan penulis terbawa')
  assert(p.penulisId === 'u-yono', 'id penulis terbawa untuk pengikatan KPI')
  assert(p.proyek === 'Ruko Pak Soni', 'proyek terbawa')
  assert(aliran.find(b => b.id === 'pesan:m2').balasId === 'm1', 'balasan menyimpan rujukannya')

  const s = aliran.find(b => b.id === 'sistem:laporan:l1')
  assert(s.kategori === 'laporan' && /Pak Yono/.test(s.judul), 'kabar sistem membawa jenis & judul')
  assert(s.oleh === 'Pak Yono', 'kabar sistem menyebut siapa pelakunya')
  assert(s.tautan === '/kontraktor', 'kabar sistem membawa tujuan ketukan')
  assert(aliran.find(b => b.id === 'sistem:request:r1').menunggu === true, 'yang menunggu tindakan ditandai')
}

// Pesan foto tanpa teks tetap ikut; pesan kosong tidak.
assert(aliran.some(b => b.id === 'pesan:m3'), 'pesan berisi foto saja tetap masuk')
assert(susunChat([{ id: 'x', created_at: '2026-07-20T08:00:00Z', teks: '   ' }]).length === 0,
  'pesan tanpa teks & tanpa foto diabaikan')
assert(susunChat([{ id: 'y', teks: 'tanpa waktu' }]).length === 0, 'pesan tanpa waktu diabaikan')
assert(susunChat().length === 0 && susunChat([], []).length === 0, 'masukan kosong aman')

// Urutan tetap sama di pemuatan berikutnya walau waktunya seri.
{
  const seri = [
    { id: 'b', penulis_nama: 'B', teks: 'b', created_at: '2026-07-20T08:00:00Z' },
    { id: 'a', penulis_nama: 'A', teks: 'a', created_at: '2026-07-20T08:00:00Z' },
  ]
  assert(susunChat(seri).map(b => b.id).join() === susunChat(seri).map(b => b.id).join(),
    'waktu seri diputus id, urutannya tetap')
}

// ── Penyaringan proyek ─────────────────────────────────────────────────────
{
  const soni = susunChat(PESAN, KABAR, { proyek: 'Ruko Pak Soni' })
  assert(soni.some(b => b.id === 'pesan:m1'), 'baris proyek itu ikut')
  assert(soni.some(b => b.id === 'pesan:m2'), 'baris TANPA proyek tetap ikut — obrolan umum milik semua')
  assert(soni.length === 6, 'tidak ada yang tersaring: sisanya memang tanpa proyek')

  const lain = susunChat(PESAN, KABAR, { proyek: 'Proyek Lain' })
  assert(!lain.some(b => b.id === 'pesan:m1'), 'baris proyek lain tersaring')
  assert(lain.length === 4, `sisanya yang tanpa proyek (dapat ${lain.length})`)
}
assert(proyekDiChat(aliran).join() === 'Ruko Pak Soni', 'daftar proyek di aliran')
assert(proyekDiChat([]).length === 0, 'aliran kosong tidak punya proyek')

// ── namaKunci ──────────────────────────────────────────────────────────────
assert(namaKunci('Pak Yono') === 'yono', 'sapaan dibuang')
assert(namaKunci('  IBU   Ria ') === 'ria', 'huruf besar & spasi dirapikan')
assert(namaKunci('Yono') === namaKunci('pak yono'), '"Yono" dan "Pak Yono" orang yang sama')
assert(namaKunci('Yono Susilo') !== namaKunci('Yono'),
  'nama depan sama TIDAK dianggap orang yang sama — salah orang lebih buruk daripada tidak tahu')
assert(namaKunci(null) === '' && namaKunci(undefined) === '', 'masukan kosong aman')

// ── kelompokHari ───────────────────────────────────────────────────────────
{
  const kel = kelompokHari(aliran, new Date('2026-07-21T15:00:00Z'))
  assert(kel.length === 2, 'dua hari')
  assert(kel[0].hari === '2026-07-20' && kel[1].hari === '2026-07-21', 'hari urut menaik')
  assert(kel[0].label === 'Kemarin' && kel[1].label === 'Hari ini', 'label hari dekat ditulis kata')
  assert(kel[0].baris.length + kel[1].baris.length === aliran.length, 'tidak ada baris yang hilang')
}
assert(/Senin|Jul/.test(labelHari('2026-07-20', new Date('2026-08-01T00:00:00Z'))),
  'hari jauh ditulis tanggalnya')
assert(labelHari('bukan tanggal') === 'bukan tanggal', 'masukan tidak sah dikembalikan apa adanya')
assert(kelompokHari([]).length === 0, 'aliran kosong tidak punya kelompok')

// ── belumTerbaca ───────────────────────────────────────────────────────────
assert(belumTerbaca(aliran, '2026-07-20T10:15:00Z').length === 3, 'hanya yang lebih baru')
assert(belumTerbaca(aliran, null).length === aliran.length, 'belum pernah dibaca = semuanya baru')
assert(belumTerbaca(aliran, '2026-07-21T12:00:00Z').length === 0, 'batas bersifat inklusif')

// Pesan sendiri tidak pernah dihitung belum terbaca.
{
  const punyaYono = belumTerbaca(aliran, null, 'u-yono')
  assert(punyaYono.length === aliran.length - 2,
    `dua pesan Yono sendiri tidak dihitung (dapat ${punyaYono.length})`)
  assert(!punyaYono.some(b => b.jenis === 'orang' && b.penulisId === 'u-yono'),
    'tidak ada pesan sendiri di daftar belum terbaca')
  assert(punyaYono.some(b => b.jenis === 'sistem' && b.oleh === 'Pak Yono'),
    'kabar SISTEM atas namanya tetap dihitung — itu kabar, bukan pesan yang ia ketik')
}

assert(batasTerbaca(aliran) === '2026-07-21T12:00:00Z', 'batas terbaca = waktu baris terakhir')
assert(batasTerbaca([]).length > 0, 'aliran kosong tetap memberi tanda waktu yang sah')

// ── ringkasChat ────────────────────────────────────────────────────────────
assert(ringkasChat(aliran) === '3 pesan · 3 kabar sistem', `ringkasan: ${ringkasChat(aliran)}`)
assert(ringkasChat([]) === 'belum ada percakapan', 'aliran kosong berbunyi wajar')

// ══ KPI ═══════════════════════════════════════════════════════════════════
const ANGGOTA = [
  { id: 'u-yono', nama: 'Yono', role: 'pengawas' },
  { id: 'u-ria', nama: 'Ria', role: 'pm' },
  { id: 'u-diam', nama: 'Sunardi', role: 'logistik' },
]
const KINI = new Date('2026-07-22T00:00:00Z')

{
  const h = nilaiKpi(aliran, ANGGOTA, { hari: 30, sekarang: KINI })

  assert(h.anggota.length === 3, 'tiga anggota dilaporkan')
  const yono = h.anggota.find(a => a.id === 'u-yono')
  const ria = h.anggota.find(a => a.id === 'u-ria')
  const diam = h.anggota.find(a => a.id === 'u-diam')

  assert(yono.pesan === 2, 'pesan Yono dihitung')
  assert(yono.kegiatan.laporan === 1, 'laporan harian Yono terhubung lewat nama')
  assert(yono.totalKegiatan === 1, 'total kegiatan Yono')
  assert(yono.hariAktif === 2, 'Yono aktif dua hari')
  assert(yono.terakhir === '2026-07-21T07:00:00Z', 'jejak terakhir Yono')

  assert(ria.pesan === 1 && ria.kegiatan.ttd === 1, 'Ria: satu pesan, satu tanda tangan')

  // Yang tidak meninggalkan jejak TETAP muncul — justru itu yang perlu terlihat.
  assert(diam.pesan === 0 && diam.totalKegiatan === 0, 'anggota tanpa jejak tetap dilaporkan')
  assert(diam.hariAktif === 0 && diam.terakhir === '', 'anggota tanpa jejak berangka nol')
  assert(ringkasAnggota(diam) === 'Belum ada jejak di periode ini', 'kalimatnya tidak menuduh')
  assert(/2 pesan/.test(ringkasAnggota(yono)) && /2 hari aktif/.test(ringkasAnggota(yono)),
    `ringkasan Yono: ${ringkasAnggota(yono)}`)

  // Urutan: yang paling banyak jejaknya di atas.
  assert(h.anggota[0].id === 'u-yono' && h.anggota[2].id === 'u-diam', 'terbanyak di atas, kosong di bawah')

  // Nama yang tidak cocok anggota mana pun tidak hilang diam-diam.
  assert(h.belumTerhubung.length === 1 && h.belumTerhubung[0].nama === 'Budi',
    `Budi belum terhubung ke akun mana pun (dapat ${JSON.stringify(h.belumTerhubung)})`)
  assert(h.belumTerhubung[0].jumlah === 1, 'jumlah kejadiannya ikut disebut')

  assert(h.hari === 30 && h.sejak < '2026-07-20', 'rentang periode ikut dilaporkan')
}

// Periode memotong yang di luar jendela.
{
  const h = nilaiKpi(aliran, ANGGOTA, { hari: 1, sekarang: new Date('2026-07-22T00:00:00Z') })
  const yono = h.anggota.find(a => a.id === 'u-yono')
  assert(yono.pesan === 1, `hanya pesan dalam 1 hari terakhir (dapat ${yono.pesan})`)
  assert(yono.kegiatan.laporan === 0, 'laporan di luar jendela tidak dihitung')
}
assert(nilaiKpi(aliran, ANGGOTA, { hari: 0, sekarang: KINI }).hari === 1, 'periode minimal satu hari')
assert(nilaiKpi(aliran, ANGGOTA, { hari: -5, sekarang: KINI }).hari === 1, 'periode negatif tidak diterima')

// Penulis yang tidak terdaftar sebagai anggota tetap muncul, bukan hilang.
{
  const h = nilaiKpi(aliran, [{ id: 'u-ria', nama: 'Ria', role: 'pm' }], { hari: 30, sekarang: KINI })
  assert(h.anggota.some(a => a.nama === 'Pak Yono'),
    'penulis di luar daftar anggota tetap dilaporkan')
}

// Sapaan tidak menghalangi pencocokan.
{
  const h = nilaiKpi(aliran, [{ id: 'x', nama: 'Pak Yono', role: 'pengawas' }], { hari: 30, sekarang: KINI })
  assert(h.anggota.find(a => a.id === 'x').kegiatan.laporan === 1,
    'nama beranakan sapaan tetap cocok')
}

assert(nilaiKpi().anggota.length === 0, 'tanpa masukan aman')
assert(nilaiKpi([], ANGGOTA).anggota.length === 3, 'aliran kosong tetap melaporkan seluruh anggota')

// ── Label kegiatan ─────────────────────────────────────────────────────────
assert(URUT_KEGIATAN.length === 7, 'tujuh jenis kegiatan')
assert(URUT_KEGIATAN.every(j => LABEL_KEGIATAN[j]), 'tiap jenis punya label')

console.log(`chat-tim: ${ok} assert lulus`)
