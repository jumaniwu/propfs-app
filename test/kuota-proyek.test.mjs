// Test kuota proyek: superadmin, kesepakatan khusus, dan paket.
import {
  hitungKuota, bolehBuat, sisaKuota, ringkasKuota, bacaBatasManual, labelBatas,
  TAK_TERBATAS,
} from '../src/lib/kuotaProyek.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Urutan mutlak: superadmin > sistem > manual > paket ────────────────────
assert(hitungKuota({ superadmin: true }).batas === null, 'superadmin tak terbatas')
assert(hitungKuota({ superadmin: true }).sumber === 'superadmin', 'sumbernya disebut')

// Superadmin menang atas APA PUN — termasuk batas manual nol dan paket nol.
assert(hitungKuota({ superadmin: true, manual: 0, paket: 0, langgananAktif: true }).batas === null,
  'superadmin menang atas batas manual nol')
assert(hitungKuota({ superadmin: true, manual: 3 }).batas === null,
  'superadmin menang atas batas manual berapa pun')

// Langganan berbayar dimatikan seluruh sistem (masa promosi).
assert(hitungKuota({ langgananAktif: false, paket: 1 }).batas === null, 'sistem promosi: tak terbatas')
assert(hitungKuota({ langgananAktif: false, paket: 1 }).sumber === 'sistem', 'sumbernya sistem')
assert(hitungKuota({ langgananAktif: false, manual: 2 }).batas === null,
  'promosi menang atas batas manual')

// Kesepakatan khusus menang atas paket — itulah gunanya.
{
  const k = hitungKuota({ manual: 12, paket: 3, langgananAktif: true })
  assert(k.batas === 12 && k.sumber === 'manual', 'batas manual menang atas paket')
  assert(/disetel manual/.test(k.label), `label menyebut asalnya: ${k.label}`)
}
assert(hitungKuota({ manual: TAK_TERBATAS, paket: 3 }).batas === null,
  'manual -1 berarti tak terbatas')
// Nol adalah keputusan sadar untuk mengunci — bukan "belum diatur".
assert(hitungKuota({ manual: 0, paket: 5 }).batas === 0, 'manual nol benar-benar nol, bukan diabaikan')
assert(hitungKuota({ manual: 0, paket: 5 }).sumber === 'manual', 'nol tetap tercatat sebagai manual')

// Tanpa kesepakatan khusus: paket + slot tambahan.
assert(hitungKuota({ paket: 3 }).batas === 3, 'paket saja')
assert(hitungKuota({ paket: 3, slotTambahan: 2 }).batas === 5, 'slot tambahan menambah paket')
assert(hitungKuota({ paket: 3 }).sumber === 'paket', 'sumbernya paket')

// Slot tambahan TIDAK menambah batas manual: angka yang disepakati harus tetap
// berlaku apa adanya.
assert(hitungKuota({ manual: 12, paket: 3, slotTambahan: 5 }).batas === 12,
  'slot tambahan tidak menggeser kesepakatan manual')

// ── Masukan yang aneh tidak boleh meledak ─────────────────────────────────
assert(hitungKuota().batas === 0, 'tanpa masukan sama sekali = nol')
assert(hitungKuota({}).batas === 0, 'objek kosong = nol')
assert(hitungKuota({ paket: -5 }).batas === 0, 'paket negatif dijepit ke nol')
assert(hitungKuota({ paket: 3, slotTambahan: -9 }).batas === 3, 'slot negatif diabaikan')
assert(hitungKuota({ paket: 'tiga' }).batas === 0, 'paket bukan angka = nol')
assert(hitungKuota({ paket: 2.9 }).batas === 2, 'pecahan dipotong, bukan dibulatkan ke atas')

// ── bacaBatasManual: kosong ≠ nol ─────────────────────────────────────────
assert(bacaBatasManual(null) === null, 'null = ikut paket')
assert(bacaBatasManual(undefined) === null, 'undefined = ikut paket')
assert(bacaBatasManual('') === null, 'string kosong = ikut paket')
assert(bacaBatasManual('   ') === null, 'spasi saja = ikut paket')
assert(bacaBatasManual('abc') === null, 'bukan angka = ikut paket')
assert(bacaBatasManual(0) === 0, 'nol adalah nol, BUKAN ikut paket')
assert(bacaBatasManual('0') === 0, 'nol dari form tetap nol')
assert(bacaBatasManual(12) === 12, 'angka biasa')
assert(bacaBatasManual('12') === 12, 'angka dari form')
assert(bacaBatasManual(-1) === TAK_TERBATAS, '-1 = tak terbatas')
assert(bacaBatasManual(-5) === TAK_TERBATAS, 'negatif apa pun = tak terbatas, bukan minus lima proyek')

// ── bolehBuat ─────────────────────────────────────────────────────────────
const takTerbatas = hitungKuota({ superadmin: true })
const tiga = hitungKuota({ paket: 3 })
const nol = hitungKuota({ manual: 0 })

assert(bolehBuat(0, tiga) === true, 'kosong boleh')
assert(bolehBuat(2, tiga) === true, 'di bawah batas boleh')
assert(bolehBuat(3, tiga) === false, 'tepat di batas tidak boleh lagi')
assert(bolehBuat(99, tiga) === false, 'di atas batas tidak boleh')
assert(bolehBuat(0, nol) === false, 'batas nol menutup sejak awal')

assert(bolehBuat(0, takTerbatas) === true, 'tak terbatas selalu boleh')
assert(bolehBuat(9999, takTerbatas) === true, 'tak terbatas tidak punya ujung')

// ── sisaKuota ─────────────────────────────────────────────────────────────
assert(sisaKuota(1, tiga) === 2, 'sisa dihitung benar')
assert(sisaKuota(5, tiga) === 0, 'sisa tidak pernah negatif')
assert(sisaKuota(0, takTerbatas) === null, 'tak terbatas tidak punya sisa')

// ── Label ─────────────────────────────────────────────────────────────────
assert(labelBatas(null) === 'Tak terbatas', 'label tak terbatas')
assert(labelBatas(3) === '3 proyek', 'label berangka')
assert(ringkasKuota(1, tiga) === '1 dari 3 proyek terpakai', `ringkasan: ${ringkasKuota(1, tiga)}`)
assert(ringkasKuota(7, takTerbatas) === '7 proyek · tak terbatas', 'ringkasan tak terbatas')
assert(ringkasKuota(-2, tiga) === '0 dari 3 proyek terpakai', 'terpakai negatif dianggap nol')

console.log(`kuota-proyek: ${ok} assert lulus`)
