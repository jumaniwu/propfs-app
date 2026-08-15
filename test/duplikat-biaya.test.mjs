// ============================================================
// Biaya yang tercatat dua kali.
//
// Ini bukan uji pengandaian: duplikatnya BENAR-BENAR terjadi pada data
// pemakainya. 42 transaksi menjadi 46, material Rp 69,3 juta menjadi Rp 77,4
// juta — karena nota yang sama diketik "A 40637" oleh manusia dan dibaca
// "A40637" oleh AI. Satu spasi.
//
// Angka dan nama di bawah diambil apa adanya dari layar pemakainya.
// ============================================================
import {
  normalNota, normalNama, bandingkanEntri, cariDuplikat, duplikatPasti,
  nilaiDuplikat, ringkasDuplikat, saringEntriBaru,
} from '../src/lib/duplikatBiaya.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Penyebabnya: nomor nota yang ditulis berbeda ─────────────────────
assert(normalNota('A 40637') === 'a40637', 'spasi di dalam nomor nota dibuang')
assert(normalNota('A-40637') === 'a40637', 'strip juga')
assert(normalNota('a40637') === 'a40637', 'yang sudah rapat dibiarkan')
assert(normalNota('A 40637') === normalNota('A40637'),
  'INI CACATNYA: "A 40637" dan "A40637" harus dianggap nota YANG SAMA')
assert(normalNota('00104/CR/GBS/08/2026') === '00104crgbs082026', 'garis miring dibuang')
assert(normalNota('') === '' && normalNota(null) === '', 'kosong & null aman')
assert(normalNama('TOKO PERMATA') === normalNama('Toko Permata'), 'nama toko: huruf besar bukan pembeda')
assert(normalNama('Global  Bangunan Seraya') === normalNama('GLOBAL BANGUNAN SERAYA'),
  'spasi ganda pun bukan pembeda')

// ── 2. Kejadian nyata dari layar pemakainya ─────────────────────────────
const LAMA = {
  id: 'e-lama', tipe: 'material', tanggal: '2026-07-27',
  keterangan: 'Pembelian besi untuk proyek', namaMaterial: 'Besi Beton 12mm',
  namaSupplier: 'Toko Permata', nomorNota: 'A 40637', volume: 50, satuan: 'batang',
  jumlah: 5_783_500, kategori: 'bangunan', status: '✅ Dicatat',
}
const BARU = {
  id: 'e-baru', tipe: 'material', tanggal: '2026-07-27',
  keterangan: 'Besi Beton 12mm — dari PO/006/07/2026', namaMaterial: 'Besi Beton 12mm',
  namaSupplier: 'TOKO PERMATA', nomorNota: 'A40637', volume: 50, satuan: 'Batang',
  jumlah: 5_783_500, kategori: 'bangunan', status: '✅ Dicatat', doId: 'do-9',
}
{
  const c = bandingkanEntri(LAMA, BARU)
  assert(c.kembar === true, 'kedua baris besi itu dikenali sebagai kejadian yang SAMA')
  assert(c.keyakinan === 'pasti', 'dengan keyakinan penuh — nomor nota & nominalnya sama')
  assert(/A 40637/.test(c.sebab), `sebabnya disebutkan: ${c.sebab}`)
}

// ── 3. Yang BUKAN duplikat, dan harus tetap aman ────────────────────────
{
  // Nominal berbeda: dua pembelian berbeda, walau notanya sama (nota bisa
  // memuat banyak barang yang dicatat satu per satu).
  const c = bandingkanEntri(LAMA, { ...BARU, jumlah: 2_040_000 })
  assert(c.kembar === false, 'nominal berbeda bukan duplikat')
}
{
  // Nomor nota yang BERBEDA adalah bukti keduanya dua kejadian. Melanjutkan ke
  // dugaan tanggal+toko akan menghapus pembelian yang sah.
  const c = bandingkanEntri(LAMA, { ...BARU, nomorNota: 'B 99999' })
  assert(c.kembar === false, 'nota yang berbeda bukan duplikat, walau tanggal & nominal sama')
}
{
  const c = bandingkanEntri(LAMA, { ...BARU, tanggal: '2026-07-28', nomorNota: '' })
  assert(c.kembar === false, 'tanpa nota dan beda tanggal: bukan duplikat')
}
{
  const c = bandingkanEntri({ ...LAMA, jumlah: 0 }, { ...BARU, jumlah: 0 })
  assert(c.kembar === false, 'dua baris bernilai nol tidak dipasangkan')
}
{
  // Dua kotak paku Rp 120.000 dari toko yang sama pada hari yang sama MEMANG
  // bisa dibeli dua kali. Tanpa nomor nota, ini hanya dugaan.
  const a = { id: 'a', tanggal: '2026-07-25', jumlah: 120_000,
    namaSupplier: 'Toko Bangunan', namaMaterial: 'Paku kayu' }
  const c = bandingkanEntri(a, { ...a, id: 'b' })
  assert(c.kembar === true && c.keyakinan === 'mungkin',
    'kemiripan tanpa nota hanya menjadi DUGAAN, bukan kepastian')
}

// ── 4. Mencari di seluruh buku ──────────────────────────────────────────
{
  const buku = [LAMA, { ...LAMA, id: 'x', nomorNota: 'B1', jumlah: 30_000 }, BARU]
  const d = cariDuplikat(buku)
  assert(d.length === 1, 'satu pasangan ditemukan')
  assert(d[0].asli.id === 'e-lama' && d[0].kembar.id === 'e-baru',
    'yang DIPERTAHANKAN adalah yang tercatat lebih dulu')
  assert(nilaiDuplikat(d) === 5_783_500, 'nilai yang terhitung dua kali dihitung')
  assert(duplikatPasti(d).length === 1, 'dan ia termasuk yang pasti')
  assert(/Rp 5.783.500/.test(ringkasDuplikat(d)), `ringkasannya: ${ringkasDuplikat(d)}`)
}
{
  // Tiga baris kembar TIDAK menghasilkan tiga pasangan. Kalau iya, menghapus
  // semuanya akan menghapus biaya yang memang ada.
  const tiga = [LAMA, { ...BARU, id: 'b2' }, { ...BARU, id: 'b3' }]
  const d = cariDuplikat(tiga)
  assert(d.length === 2, 'tiga baris kembar → dua yang ditawarkan dihapus, satu dipertahankan')
  assert(d.every(p => p.asli.id === 'e-lama'), 'keduanya menunjuk baris pertama sebagai aslinya')
}
assert(cariDuplikat([]).length === 0, 'buku kosong aman')
assert(cariDuplikat(null).length === 0, 'null aman')
assert(cariDuplikat([LAMA]).length === 0, 'satu baris tidak pernah kembar dengan dirinya')
assert(ringkasDuplikat([]) === '', 'tanpa duplikat, tanpa kalimat')

// ── 5. AI tidak boleh memasukkan yang sudah ada ─────────────────────────
//
// Nota yang sudah difoto dan dicatat sering difoto lagi — oleh orang berbeda,
// atau oleh orang yang sama karena lupa.
{
  const { diterima, ditolak } = saringEntriBaru([BARU], [LAMA])
  assert(ditolak.length === 1 && diterima.length === 0,
    'nota yang sudah ada di buku TIDAK dimasukkan lagi oleh AI')
}
{
  const lain = { ...BARU, id: 'lain', nomorNota: 'C 777', jumlah: 99_000 }
  const { diterima, ditolak } = saringEntriBaru([BARU, lain], [LAMA])
  assert(diterima.length === 1 && diterima[0].id === 'lain', 'yang benar-benar baru tetap masuk')
  assert(ditolak.length === 1, 'yang kembar disaring')
}
{
  // Satu foto nota bisa terbaca menghasilkan dua baris yang sama persis.
  const { diterima } = saringEntriBaru([BARU, { ...BARU, id: 'b2' }], [])
  assert(diterima.length === 1, 'baris kembar DI DALAM satu bacaan pun disaring')
}
{
  // Yang cuma "mungkin" tetap masuk: menolak diam-diam pembelian yang sah
  // jauh lebih merugikan daripada satu baris yang perlu diperiksa manusia.
  const a = { id: 'a', tanggal: '2026-07-25', jumlah: 120_000,
    namaSupplier: 'Toko Bangunan', keterangan: 'x', kategori: 'bangunan',
    status: 'x', tipe: 'material' }
  const { diterima, ditolak } = saringEntriBaru([{ ...a, id: 'b' }], [a])
  assert(diterima.length === 1 && ditolak.length === 0,
    'dugaan tanpa nota TIDAK disaring otomatis — ia hanya masuk daftar tinjauan')
}
assert(saringEntriBaru(null, null).diterima.length === 0, 'null aman')
assert(saringEntriBaru([], [LAMA]).diterima.length === 0, 'tanpa entri baru aman')

// ── Kembar yang LOLOS di produksi, 15 Agustus 2026 ─────────────────────
//
// Kejadian nyata. AI mencatat pembelian kayu yang sama dua kali karena
// keterangan yang ditulisnya berbeda kata:
//
//   "Kayu 2x3x14 ft untuk Ruko..."   Rp 4.445.000
//   "Pembelian kayu 2x3x14 ft..."    Rp 4.445.000
//
// Tanggal sama, toko sama, nominal sama, dan 127 batang sama. Keduanya tanpa
// nomor nota, jadi `pasti` tidak menyala; dan `mungkin` tidak pernah disaring.
// Yang tidak pernah dipakai padahal sudah ada di setiap entri: VOLUME.
{
  const A = {
    tanggal: '2026-08-15', jumlah: 4_445_000, nomorNota: '',
    namaSupplier: 'Yohannes Ralaph Boyce', namaMaterial: 'Kayu 2x3x14 ft',
    volume: 127, satuan: 'batang',
  }
  const B = { ...A, namaMaterial: 'Kayu 2x3x14 ft', nomorNota: '-' }

  const c = bandingkanEntri(A, B)
  assert(c.kembar === true, 'kembarnya terdeteksi')
  assert(c.keyakinan === 'kuat',
    `dengan volume yang sama, keyakinannya KUAT — bukan sekadar mungkin (${c.keyakinan})`)
  assert(/127/.test(c.sebab), `jumlahnya disebut dalam alasannya: ${c.sebab}`)

  // Dan inilah yang sesungguhnya diperbaiki: ia kini DISARING saat disimpan.
  const { diterima, ditolak } = saringEntriBaru([{ id: 'b2', ...B }], [{ id: 'a1', ...A }])
  assert(diterima.length === 0, 'yang kembar kuat tidak ikut tersimpan')
  assert(ditolak.length === 1, 'dan dilaporkan sebagai ditolak, bukan hilang diam-diam')

  // Nomor nota yang BERBEDA tetap membatalkan segalanya — itu bukti dua
  // kejadian, sekuat apa pun kemiripan lainnya.
  const beda = bandingkanEntri({ ...A, nomorNota: 'A-001' }, { ...B, nomorNota: 'A-002' })
  assert(beda.kembar === false, 'nota berbeda tetap menang atas seluruh kemiripan')
}

// ── Yang MEMANG bisa dibeli dua kali tidak boleh ikut tersaring ────────
//
// Batas antara "kuat" dan "mungkin" ada di sini, dan salah menariknya berarti
// menghapus biaya yang nyata.
{
  const paku = {
    tanggal: '2026-08-15', jumlah: 120_000, nomorNota: '',
    namaSupplier: 'Global Bangunan Seraya', namaMaterial: 'Paku kayu 2.5"',
    volume: 1, satuan: 'box',
  }
  // Volume sama, tapi ini memang bisa terjadi dua kali dalam sehari — dan
  // tetap disaring, karena seluruh buktinya cocok. Yang membedakannya dari
  // pembelian sah adalah nomor nota; tanpa nota, tidak ada yang bisa
  // membedakannya, jadi ia dilaporkan lewat `ditolak`.
  const c = bandingkanEntri(paku, { ...paku })
  assert(c.keyakinan === 'kuat', 'seluruh bukti cocok = kuat')

  // Volume BERBEDA menurunkannya kembali jadi dugaan.
  const bedaVolume = bandingkanEntri(paku, { ...paku, volume: 2, jumlah: 120_000 })
  assert(bedaVolume.kembar === true, 'masih dianggap mirip')
  assert(bedaVolume.keyakinan === 'mungkin',
    'jumlah yang berbeda menurunkannya jadi dugaan — tidak disaring otomatis')

  // Dan yang "mungkin" tetap tersimpan.
  const { diterima } = saringEntriBaru(
    [{ id: 'x', ...paku, volume: 2 }], [{ id: 'y', ...paku }],
  )
  assert(diterima.length === 1, 'yang cuma mungkin TETAP tersimpan, tidak ditolak diam-diam')

  // Volume nol/kosong tidak boleh dianggap "sama".
  const tanpaVolume = bandingkanEntri(
    { ...paku, volume: 0 }, { ...paku, volume: 0 },
  )
  assert(tanpaVolume.keyakinan === 'mungkin',
    'volume nol bukan bukti — dua entri tanpa jumlah tidak jadi kuat')
}

console.log(`duplikat-biaya: ${ok} assert lulus`)
