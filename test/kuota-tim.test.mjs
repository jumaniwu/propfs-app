// Test kuota pengguna tim: batas dasar, slot tambahan, dan biaya.
import {
  ringkasKuota, biayaSlotUser, pesanKuotaPenuh,
  BATAS_ANGGOTA_DEFAULT, HARGA_SLOT_USER_DEFAULT,
} from '../src/lib/kuotaTim.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

assert(BATAS_ANGGOTA_DEFAULT === 5, 'batas bawaan 5 pengguna')
assert(HARGA_SLOT_USER_DEFAULT === 50000, 'harga bawaan slot 50rb')

// ── Kuota normal ───────────────────────────────────────────────────────────
const a = ringkasKuota({ batasDasar: 5, slotTambahan: 0, terpakai: 3 })
assert(a.batas === 5 && a.sisa === 2, 'batas 5, terpakai 3 → sisa 2')
assert(a.bolehTambah && !a.penuh, 'masih boleh menambah pengguna')
assert(Math.abs(a.pakaiPct - 60) < 0.01, 'pemakaian 60%')

// tepat penuh
const b = ringkasKuota({ batasDasar: 5, slotTambahan: 0, terpakai: 5 })
assert(b.sisa === 0 && b.penuh && !b.bolehTambah, 'terpakai = batas → penuh')
assert(b.pakaiPct === 100, 'pemakaian 100% saat penuh')

// slot tambahan menaikkan batas
const c = ringkasKuota({ batasDasar: 5, slotTambahan: 3, terpakai: 5 })
assert(c.batas === 8 && c.sisa === 3 && c.bolehTambah, 'beli 3 slot → batas 8')

// terlampaui (mis. slot tambahan berakhir) tidak menghasilkan sisa negatif
const d = ringkasKuota({ batasDasar: 5, slotTambahan: 0, terpakai: 7 })
assert(d.sisa === 0 && d.penuh, 'melebihi batas tetap sisa 0 dan penuh')
assert(d.pakaiPct === 100, 'pemakaian dibatasi 100%')

// ── Nilai yang hilang / tidak masuk akal ───────────────────────────────────
assert(ringkasKuota(null).batas === BATAS_ANGGOTA_DEFAULT, 'null memakai batas bawaan')
assert(ringkasKuota({}).batas === BATAS_ANGGOTA_DEFAULT, 'objek kosong memakai batas bawaan')
assert(ringkasKuota({ batasDasar: null, terpakai: 1 }).batas === BATAS_ANGGOTA_DEFAULT,
  'batasDasar null memakai bawaan')
assert(ringkasKuota({ batasDasar: 'abc', terpakai: 1 }).batas === BATAS_ANGGOTA_DEFAULT,
  'batasDasar bukan angka memakai bawaan')
assert(ringkasKuota({ batasDasar: -3, terpakai: 0 }).batasDasar === 0, 'angka negatif dijadikan 0')
assert(ringkasKuota({ batasDasar: 5, slotTambahan: -2, terpakai: 0 }).slotTambahan === 0,
  'slot tambahan negatif dijadikan 0')
assert(ringkasKuota({ batasDasar: 5.9, terpakai: 2.7 }).batasDasar === 5, 'angka pecahan dibulatkan ke bawah')

// batas 0 (admin menutup fitur tim) tidak menyebabkan bagi nol
const nol = ringkasKuota({ batasDasar: 0, slotTambahan: 0, terpakai: 0 })
assert(nol.batas === 0 && nol.penuh && nol.pakaiPct === 100, 'batas 0 = selalu penuh, aman')

// ── Biaya slot ─────────────────────────────────────────────────────────────
assert(biayaSlotUser(1) === 50000, '1 slot = 50rb')
assert(biayaSlotUser(3) === 150000, '3 slot = 150rb')
assert(biayaSlotUser(2, 75000) === 150000, 'harga satuan bisa diatur')
assert(biayaSlotUser(0) === 0, '0 slot = 0')
assert(biayaSlotUser(-5) === 0, 'jumlah negatif = 0')
assert(biayaSlotUser(1, -1) === 0, 'harga negatif = 0')

// ── Pesan kuota penuh ──────────────────────────────────────────────────────
const pesan = pesanKuotaPenuh(5)
assert(pesan.includes('5 pengguna'), 'pesan menyebut batas')
assert(pesan.includes('50.000'), 'pesan menyebut harga slot dalam format rupiah')
assert(pesan.includes('nonaktifkan'), 'pesan menawarkan alternatif menonaktifkan pengguna')
assert(pesanKuotaPenuh(8, 75000).includes('75.000'), 'harga pada pesan mengikuti setelan')

console.log(`✅ kuotaTim: ${ok} assertion lolos`)
