// Test penjalanan daftar periksa lintas modul (pemasukan · barang datang · bayar).
import { catatRencana, ringkasHasil, GagalSebagian } from '../src/lib/catatRencana.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

/** Alat palsu yang mencatat setiap panggilan, supaya urutannya bisa diperiksa. */
function alatPalsu(gagal = {}) {
  const jejak = []
  return {
    jejak,
    simpanPemasukan(p) {
      if (gagal.pemasukan) throw new Error('pemasukan meledak')
      jejak.push(['pemasukan', p.sumber, p.jumlah])
    },
    nomorDo: () => 'DO/007/07/2026',
    async simpanDo(d) {
      if (gagal.do) throw new Error('surat jalan meledak')
      jejak.push(['do', d.nomor_do, d.items.length, d.po_id])
      return { id: 'do-baru' }
    },
    tandaiEntri(entryId, doId) { jejak.push(['tandai', entryId, doId]) },
    async simpanBayar(b) {
      if (gagal.bayar) throw new Error('pembayaran meledak')
      jejak.push(['bayar', b.po_id, b.jumlah, b.catatan])
      return {}
    },
  }
}

const RENCANA = {
  biaya: [
    { id: 'e1', tipe: 'material', tanggal: '2026-07-20', nomorNota: 'NT-88', jumlah: 1000 },
    { id: 'e2', tipe: 'upah', tanggal: '2026-07-20', jumlah: 500 },
  ],
  pemasukan: [
    { tanggal: '2026-07-20', sumber: 'Termin 2', kategori: 'termin', jumlah: 250000 },
  ],
  penerimaan: [
    {
      po: { id: 'po-A', nomor: 'PO/001' },
      pasangan: [
        { nota: { id: 'e1' }, po: { nama: 'Semen', satuan: 'sak' }, qty: 20 },
        { nota: { id: 'e9' }, po: { nama: 'Pasir', satuan: 'm3' }, qty: 3 },
      ],
      takCocok: [],
    },
    { po: { id: 'po-B', nomor: 'PO/002' }, pasangan: [{ nota: { id: 'e1' }, po: { nama: 'Semen' }, qty: 5 }], takCocok: [] },
  ],
  pembayaran: [
    { usul: { tanggal: '2026-07-21', jumlah: 5000, metode: 'transfer' }, calon: [{ id: 'po-A' }, { id: 'po-B' }] },
    { usul: { tanggal: '2026-07-22', jumlah: 7000, metode: 'tunai', catatan: 'lunas' }, calon: [] },
  ],
  stokMasuk: 1,
  langkah: [],
  perluKonfirmasi: true,
}

// ── Jalur normal ───────────────────────────────────────────────────────────
{
  const alat = alatPalsu()
  const hasil = await catatRencana(RENCANA, { po: 0, bayar: [0] }, alat)

  const urut = alat.jejak.map(j => j[0])
  assert(urut[0] === 'pemasukan', 'pemasukan dijalankan lebih dulu')
  assert(urut.indexOf('do') < urut.indexOf('bayar'), 'barang datang sebelum pembayaran')

  assert(alat.jejak[0][1] === 'Termin 2' && alat.jejak[0][2] === 250000, 'isi pemasukan diteruskan utuh')

  const doCall = alat.jejak.find(j => j[0] === 'do')
  assert(doCall[1] === 'DO/007/07/2026', 'nomor DO diambil dari alat, bukan ditebak')
  assert(doCall[3] === 'po-A', 'PO yang dipilih (indeks 0) yang dipakai')
  assert(doCall[2] === 2, 'dua barang masuk surat jalan')

  const tandai = alat.jejak.filter(j => j[0] === 'tandai')
  assert(tandai.length === 2, 'tiap entri nota ditandai doId agar stok tidak dobel')
  assert(tandai.every(t => t[2] === 'do-baru'), 'doId yang ditandai berasal dari DO yang baru dibuat')

  const bayar = alat.jejak.filter(j => j[0] === 'bayar')
  assert(bayar.length === 1, 'hanya pembayaran yang punya PO yang dicatat')
  assert(bayar[0][1] === 'po-A', 'PO pilihan pertama dipakai')
  assert(hasil.tanpaPo === 1, 'pembayaran tanpa PO dihitung, bukan didiamkan')
  assert(hasil.selesai.join(' · ') === '1 pemasukan · 2 barang datang · 1 pembayaran',
    `ringkasan menyebut semuanya (dapat: ${hasil.selesai.join(' · ')})`)
}

// ── Pilihan PO yang berbeda ────────────────────────────────────────────────
{
  const alat = alatPalsu()
  await catatRencana(RENCANA, { po: 1, bayar: [1] }, alat)
  assert(alat.jejak.find(j => j[0] === 'do')[3] === 'po-B', 'PO kedua bisa dipilih')
  assert(alat.jejak.find(j => j[0] === 'bayar')[1] === 'po-B', 'PO pembayaran bisa dipilih')
}

// PO boleh TIDAK dipilih sama sekali — notanya tetap jadi biaya, hanya tidak
// dicatat sebagai barang datang.
{
  const alat = alatPalsu()
  const hasil = await catatRencana(RENCANA, { po: -1, bayar: [0] }, alat)
  assert(!alat.jejak.some(j => j[0] === 'do'), 'po: -1 berarti tidak mencatat penerimaan')
  assert(!alat.jejak.some(j => j[0] === 'tandai'), 'tanpa DO tidak ada entri yang ditandai')
  assert(!hasil.selesai.some(s => /barang datang/.test(s)), 'ringkasan tidak mengaku mencatat barang')
}

// Indeks di luar jangkauan tidak boleh meledak.
{
  const alat = alatPalsu()
  const hasil = await catatRencana(RENCANA, { po: 99, bayar: [99, 99] }, alat)
  assert(!alat.jejak.some(j => j[0] === 'do'), 'indeks PO di luar jangkauan diabaikan')
  assert(hasil.tanpaPo === 2, 'pembayaran tanpa PO yang sah ikut dilewati')
}

// Tanpa pilihan sama sekali, yang teratas yang dipakai.
{
  const alat = alatPalsu()
  await catatRencana(RENCANA, {}, alat)
  assert(alat.jejak.find(j => j[0] === 'do')[3] === 'po-A', 'bawaan memakai calon teratas')
}

// ── Catatan bawaan pembayaran ──────────────────────────────────────────────
{
  const alat = alatPalsu()
  const r = { ...RENCANA, pembayaran: [{ usul: { tanggal: '2026-07-21', jumlah: 1, metode: 'transfer' }, calon: [{ id: 'po-A' }] }] }
  await catatRencana(r, { po: -1 }, alat)
  assert(alat.jejak.find(j => j[0] === 'bayar')[3] === 'Otomatis dari chat AI',
    'pembayaran tanpa catatan tetap punya asal-usul')
}

// ── Kegagalan: yang sudah tersimpan tetap dilaporkan ───────────────────────
{
  const alat = alatPalsu({ bayar: true })
  let ditangkap = null
  try { await catatRencana(RENCANA, { po: 0, bayar: [0] }, alat) } catch (e) { ditangkap = e }
  assert(ditangkap instanceof GagalSebagian, 'kegagalan dibungkus GagalSebagian')
  assert(/pembayaran meledak/.test(ditangkap.message), 'pesan asli tidak hilang')
  assert(ditangkap.selesai.join(',') === '1 pemasukan,2 barang datang',
    'langkah yang sudah berhasil ikut dilaporkan agar tidak dicatat dua kali')
}
{
  const alat = alatPalsu({ do: true })
  let ditangkap = null
  try { await catatRencana(RENCANA, { po: 0 }, alat) } catch (e) { ditangkap = e }
  assert(ditangkap.selesai.join(',') === '1 pemasukan', 'gagal di tengah tetap menyebut yang lolos')
  assert(!alat.jejak.some(j => j[0] === 'bayar'), 'langkah setelah kegagalan tidak dijalankan')
}

// ── Rencana kosong ─────────────────────────────────────────────────────────
{
  const alat = alatPalsu()
  const hasil = await catatRencana(null, {}, alat)
  assert(hasil.selesai.length === 0 && hasil.tanpaPo === 0, 'rencana null aman')
  assert(alat.jejak.length === 0, 'tidak ada yang ditulis tanpa rencana')

  const kosong = await catatRencana(
    { biaya: [], pemasukan: [], penerimaan: [], pembayaran: [], stokMasuk: 0, langkah: [], perluKonfirmasi: false },
    {}, alat)
  assert(kosong.selesai.length === 0, 'rencana tanpa langkah tidak melaporkan apa pun')
}

// ── ringkasHasil ───────────────────────────────────────────────────────────
assert(ringkasHasil({ selesai: ['1 pemasukan'], tanpaPo: 0 }) === '1 pemasukan', 'ringkasan sederhana')
assert(/dilewati/.test(ringkasHasil({ selesai: ['1 pemasukan'], tanpaPo: 2 })), 'yang dilewati ikut disebut')
assert(ringkasHasil({ selesai: [], tanpaPo: 0 }) === 'Tidak ada yang perlu dicatat.', 'hasil kosong berbunyi wajar')

console.log(`catat-rencana: ${ok} assert lulus`)
