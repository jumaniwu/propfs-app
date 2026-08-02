// Test perhitungan tagihan langganan.
import { diskonBulan, hitungTagihan, nomorInvoice, akhirPeriode, DISKON_BULAN } from '../src/lib/tagihan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Potongan ─────────────────────────────────────────────────────────────
assert(diskonBulan(1) === 0, 'sebulan tanpa potongan')
assert(diskonBulan(3) === 0.10, '3 bulan potong 10%')
assert(diskonBulan(12) === 0.20, '12 bulan potong 20%')
assert(diskonBulan(6) === 0, '6 bulan belum ada potongannya — jangan mengarang')
assert(diskonBulan(0) === 0 && diskonBulan(-1) === 0, 'bulan tak masuk akal tanpa potongan')
assert(Object.keys(DISKON_BULAN).length === 2, 'hanya dua tingkat potongan yang berlaku')

// ── Hitung tagihan ───────────────────────────────────────────────────────
{
  const t = hitungTagihan(399000, 1, 0.11)
  assert(t.subtotal === 399000, 'sebulan sesuai harga paket')
  assert(t.ppn === 43890, `PPN 11% dari subtotal: ${t.ppn}`)
  assert(t.total === 442890, 'total = subtotal + PPN')
}
{
  const t = hitungTagihan(399000, 3, 0.11)
  assert(t.subtotal === Math.round(399000 * 3 * 0.9), `3 bulan sudah dipotong: ${t.subtotal}`)
  assert(t.subtotal === 1077300, 'angkanya persis')
  assert(t.diskon === 0.10, 'potongannya ikut dilaporkan agar bisa ditampilkan')
}
{
  const t = hitungTagihan(399000, 12, 0.11)
  assert(t.subtotal === 3830400, `12 bulan potong 20%: ${t.subtotal}`)
  assert(t.total === t.subtotal + t.ppn, 'totalnya konsisten')
}
// PPN dihitung dari subtotal yang SUDAH bulat, supaya invoice bisa dijumlah ulang.
{
  const t = hitungTagihan(149000, 3, 0.11)
  assert(t.ppn === Math.round(t.subtotal * 0.11), 'PPN turunan dari subtotal yang tercetak')
  assert(t.subtotal + t.ppn === t.total, 'pembaca invoice bisa menjumlahkan sendiri dan cocok')
}
// Tanpa PPN.
assert(hitungTagihan(100000, 1).total === 100000, 'tanpa PPN totalnya harga saja')

// ── Masukan cacat tidak menghasilkan tagihan aneh ────────────────────────
assert(hitungTagihan(399000, 0).bulan === 1, 'nol bulan dianggap sebulan')
assert(hitungTagihan(399000, -5).bulan === 1, 'bulan negatif tidak boleh')
assert(hitungTagihan(399000, NaN).bulan === 1, 'bulan NaN tidak boleh')
assert(hitungTagihan(-1000, 1).subtotal === 0, 'harga negatif tidak menagih negatif')
assert(hitungTagihan(NaN, 1).subtotal === 0, 'harga NaN jadi nol, bukan NaN di invoice')
assert(Number.isFinite(hitungTagihan(399000, 3, NaN).ppn), 'PPN NaN tidak merembet ke total')
assert(hitungTagihan(399000, 3, NaN).ppn === 0, 'PPN tak terbaca dianggap nol')

// ── Nomor invoice ────────────────────────────────────────────────────────
{
  // Waktu SETEMPAT: pukul 00.30 WIB tanggal 2 tidak boleh tercetak tanggal 1.
  const n = nomorInvoice(new Date(2026, 7, 2, 0, 30), () => 0.4567)
  assert(n === 'INV-20260802-4567', `nomornya sesuai tanggal setempat: ${n}`)
}
assert(/^INV-\d{8}-\d{4}$/.test(nomorInvoice(new Date(2026, 0, 9), () => 0.001)),
  'bentuknya tetap seragam walau urutannya kecil')
assert(nomorInvoice(new Date(2026, 0, 9), () => 0).endsWith('-0000'),
  'urutan kecil tetap empat digit')
assert(/^INV-\d{8}-\d{4}$/.test(nomorInvoice(new Date('ngawur'))),
  'tanggal rusak tidak menghasilkan nomor rusak')

// ── Akhir periode ────────────────────────────────────────────────────────
{
  const a = akhirPeriode(1, new Date(2026, 0, 15))
  assert(a.getMonth() === 1 && a.getDate() === 15, 'sebulan dari 15 Jan = 15 Feb')
}
{
  // 30 hari × bulan (cara lama) menggeser tanggal setiap perpanjangan.
  const a = akhirPeriode(1, new Date(2026, 0, 31))
  assert(a.getMonth() === 1 && a.getDate() === 28,
    `31 Jan + 1 bulan mundur ke akhir Februari, bukan lompat ke Maret: ${a.toDateString()}`)
}
{
  const a = akhirPeriode(12, new Date(2026, 7, 2))
  assert(a.getFullYear() === 2027 && a.getMonth() === 7 && a.getDate() === 2, '12 bulan = tahun depan')
}
assert(akhirPeriode(0, new Date(2026, 0, 1)).getMonth() === 1, 'nol bulan dianggap sebulan')

console.log(`tagihan: ${ok} assert lulus`)
