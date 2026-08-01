// Test matriks hak akses tim Kontraktor AI.
import {
  can, modulTerlihat, ringkasIzin, ROLES, MODUL_LABEL, MENU_KE_MODUL,
} from '../src/lib/teamRoles.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const semuaRole = ROLES.map(r => r.key)
const semuaModul = Object.keys(MODUL_LABEL)

assert(semuaRole.length === 7, '7 jabatan terdaftar')
assert(semuaModul.length === 9, '9 modul terdaftar')
assert(semuaModul.includes('procurement'), 'modul procurement terdaftar')
assert(semuaModul.includes('studi'), 'modul studi (Feasibility Study) terdaftar')

// ── Feasibility Study ──────────────────────────────────────────────────────
// Studi kelayakan adalah pekerjaan kantor, bukan pekerjaan lapangan: yang
// menyusunnya pemilik, yang membacanya manajemen & keuangan. Sisanya tidak
// perlu — dan menampilkannya ke mandor hanya menambah ikon yang tak terpakai.
const lihatStudi = semuaRole.filter(r => can(r, 'studi', 'baca'))
assert(lihatStudi.join(',') === 'pemilik,manajemen,keuangan',
  `yang melihat Feasibility Study: pemilik, manajemen, keuangan (dapat ${lihatStudi.join(',')})`)
const ubahStudi = semuaRole.filter(r => can(r, 'studi', 'tulis'))
assert(ubahStudi.join(',') === 'pemilik', 'hanya pemilik yang menyusun studi kelayakan')
assert(!can('pengawas', 'studi', 'baca'), 'mandor tidak dibebani studi kelayakan')

// ── Procurement ────────────────────────────────────────────────────────────
// Yang boleh menyetujui PO harus sama dengan yang boleh menyetujui material —
// kalau tidak, request bisa lolos approval tetapi PO-nya macet, atau sebaliknya.
for (const r of semuaRole) {
  assert(can(r, 'procurement', 'approve') === can(r, 'material', 'approve'),
    `hak menyetujui PO sejalan dengan material untuk ${r}`)
}
// Logistik membuat PO tetapi tidak menyetujui PO buatannya sendiri.
assert(can('logistik', 'procurement', 'tulis') && !can('logistik', 'procurement', 'approve'),
  'logistik boleh membuat PO tapi tidak menyetujui')
// Keuangan perlu melihat PO untuk pembayaran, tanpa boleh mengubah.
assert(can('keuangan', 'procurement', 'baca') && !can('keuangan', 'procurement', 'tulis'),
  'keuangan hanya melihat PO')
assert(!can('viewer', 'procurement', 'baca'), 'viewer tidak melihat procurement')

// ── Pemilik: akses penuh ke semuanya ───────────────────────────────────────
for (const m of semuaModul) {
  assert(can('pemilik', m, 'baca'), `pemilik boleh baca ${m}`)
  assert(can('pemilik', m, 'tulis'), `pemilik boleh tulis ${m}`)
  assert(can('pemilik', m, 'approve'), `pemilik boleh approve ${m}`)
}

// ── Viewer: baca saja, tidak pernah boleh tulis ────────────────────────────
for (const m of semuaModul) {
  assert(!can('viewer', m, 'tulis'), `viewer tidak boleh tulis ${m}`)
  assert(!can('viewer', m, 'approve'), `viewer tidak boleh approve ${m}`)
}
assert(can('viewer', 'rab', 'baca'), 'viewer boleh melihat RAB')
assert(!can('viewer', 'akuntan', 'baca'), 'viewer tidak melihat modul akuntan')

// ── Hanya pemilik yang boleh mengubah Tim/Pengguna ─────────────────────────
const bisaKelolaTim = semuaRole.filter(r => can(r, 'tim', 'tulis'))
assert(bisaKelolaTim.length === 1 && bisaKelolaTim[0] === 'pemilik',
  'hanya pemilik yang boleh mengelola tim & pengguna')
assert(can('manajemen', 'tim', 'baca') && !can('manajemen', 'tim', 'tulis'),
  'manajemen hanya bisa melihat daftar tim')

// ── Approve material: pemilik, manajemen, PM ───────────────────────────────
const bisaApproveMaterial = semuaRole.filter(r => can(r, 'material', 'approve'))
assert(bisaApproveMaterial.join(',') === 'pemilik,manajemen,pm',
  'yang boleh menyetujui request material: pemilik, manajemen, pm')
assert(can('logistik', 'material', 'tulis'), 'logistik boleh mengubah data material')
assert(!can('logistik', 'material', 'approve'), 'logistik tidak boleh menyetujui request')
assert(can('pengawas', 'material', 'tulis'), 'pengawas boleh catat pemakaian material')

// ── Keuangan tidak menyentuh lapangan; pengawas tidak menyentuh akuntan ────
assert(!can('keuangan', 'lapangan', 'baca'), 'keuangan tidak membuka laporan lapangan')
assert(can('keuangan', 'akuntan', 'tulis'), 'keuangan boleh mengubah data akuntan')
assert(!can('pengawas', 'akuntan', 'baca'), 'pengawas tidak membuka modul akuntan')
assert(can('pm', 'akuntan', 'baca') && !can('pm', 'akuntan', 'tulis'),
  'PM boleh melihat akuntan tapi tidak mengubah')

// ── Logistik: fokus material, tidak lihat biaya & SPK ──────────────────────
assert(!can('logistik', 'realisasi', 'baca'), 'logistik tidak melihat realisasi biaya')
assert(!can('logistik', 'spk', 'baca'), 'logistik tidak melihat SPK')

// ── modulTerlihat konsisten dengan can() ───────────────────────────────────
for (const r of semuaRole) {
  const terlihat = modulTerlihat(r)
  assert(terlihat.every(m => can(r, m, 'baca')), `modulTerlihat(${r}) hanya berisi modul yang boleh dibaca`)
  assert(semuaModul.filter(m => can(r, m, 'baca')).length === terlihat.length,
    `modulTerlihat(${r}) lengkap`)
}
assert(modulTerlihat('pemilik').length === semuaModul.length, 'pemilik melihat semua modul')
assert(modulTerlihat('logistik').join(',') === 'rab,lapangan,material,procurement',
  'logistik melihat RAB, lapangan, material, dan procurement')

// ── ringkasIzin ────────────────────────────────────────────────────────────
const ringkas = ringkasIzin('keuangan')
assert(ringkas.length === semuaModul.length, 'ringkasIzin mengembalikan seluruh modul')
assert(ringkas.find(x => x.modul === 'akuntan').izin === 'rw', 'izin keuangan atas akuntan = rw')
assert(ringkas.find(x => x.modul === 'lapangan').izin === '-', 'izin keuangan atas lapangan = -')

// ── Setiap key menu memetakan ke modul yang valid ──────────────────────────
for (const [menu, modul] of Object.entries(MENU_KE_MODUL)) {
  assert(semuaModul.includes(modul), `menu "${menu}" memetakan ke modul valid`)
}

// ── Role tak dikenal ditolak, bukan error ──────────────────────────────────
assert(!can('entah', 'rab', 'baca'), 'role tak dikenal tidak diberi akses')

console.log(`✅ teamRoles: ${ok} assertion lolos`)
