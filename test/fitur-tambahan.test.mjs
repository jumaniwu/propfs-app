// Test fitur tambahan yang dinyalakan dari backend (FS di dalam Kontraktor AI).
import {
  bacaMode, bacaPetaMode, fiturTerlihat, modeFitur, saringTambahan,
  MODE_FITUR, LABEL_MODE, JELAS_MODE, MODE_BAWAAN,
} from '../src/lib/fiturTambahan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── bacaMode ───────────────────────────────────────────────────────────────
assert(bacaMode('mati') === 'mati', 'mode dikenali apa adanya')
assert(bacaMode('internal') === 'internal', 'internal dikenali')
assert(bacaMode('semua') === 'semua', 'semua dikenali')
assert(bacaMode('SEMUA') === 'semua', 'huruf besar tetap dikenali')
assert(bacaMode('  semua  ') === 'semua', 'spasi di tepi diabaikan')

// Salah ketik JANGAN dianggap menyala — fitur setengah jadi tidak boleh bocor.
assert(bacaMode('semuaa') === MODE_BAWAAN, 'nilai tak dikenal kembali ke bawaan')
assert(bacaMode(undefined) === MODE_BAWAAN, 'tanpa setelan berarti bawaan')
assert(bacaMode(null) === MODE_BAWAAN, 'null berarti bawaan')
assert(bacaMode(123) === MODE_BAWAAN, 'angka bukan mode')
assert(MODE_BAWAAN === 'internal', 'bawaan adalah hanya superadmin, bukan semua orang')
assert(bacaMode('ngawur', 'mati') === 'mati', 'bawaan bisa ditentukan pemanggil')

// Setelan lama yang masih berupa boolean tetap dimengerti.
assert(bacaMode(true) === 'semua', 'true lama berarti semua pengguna')
assert(bacaMode(false) === 'mati', 'false lama berarti dimatikan')
assert(bacaMode('true') === 'semua', 'string true ikut dimengerti')
assert(bacaMode('off') === 'mati', 'off berarti dimatikan')

// ── bacaPetaMode ───────────────────────────────────────────────────────────
{
  const peta = bacaPetaMode({ fs_module: 'semua', leads: 'mati', ' chat ': true })
  assert(peta.fs_module === 'semua', 'kunci terbaca')
  assert(peta.leads === 'mati', 'kunci kedua terbaca')
  assert(peta.chat === 'semua', 'kunci dirapikan dari spasi')
  assert(Object.keys(peta).length === 3, 'tidak ada kunci siluman')
}
assert(Object.keys(bacaPetaMode(null)).length === 0, 'null jadi peta kosong')
assert(Object.keys(bacaPetaMode('bukan objek')).length === 0, 'string bukan peta')
assert(Object.keys(bacaPetaMode(['a'])).length === 0, 'array bukan peta')

// ── fiturTerlihat ──────────────────────────────────────────────────────────
const biasa = { superadmin: false }
const sa = { superadmin: true }

assert(fiturTerlihat('semua', biasa) === true, 'mode semua: pengguna biasa melihat')
assert(fiturTerlihat('internal', biasa) === false, 'mode internal: pengguna biasa tidak melihat')
assert(fiturTerlihat('internal', sa) === true, 'mode internal: superadmin melihat')
assert(fiturTerlihat('semua', sa) === true, 'mode semua: superadmin juga melihat')

// Dimatikan berarti dimatikan — superadmin pun tidak menembusnya.
assert(fiturTerlihat('mati', biasa) === false, 'mode mati: pengguna tidak melihat')
assert(fiturTerlihat('mati', sa) === false, 'mode mati: superadmin pun tidak melihat')

// Langganan tetap berlaku untuk pengguna biasa, tidak untuk superadmin.
assert(fiturTerlihat('semua', { berlangganan: false }) === false,
  'paket yang tidak mengaktifkan fitur tetap menutupnya')
assert(fiturTerlihat('semua', { berlangganan: true }) === true, 'paket aktif membukanya')
assert(fiturTerlihat('semua', { superadmin: true, berlangganan: false }) === true,
  'superadmin menembus pemeriksaan langganan')
assert(fiturTerlihat('semua', {}) === true, 'tanpa keterangan langganan tidak ikut menutup')

// ── modeFitur ──────────────────────────────────────────────────────────────
assert(modeFitur({ fs_module: 'semua' }, 'fs_module') === 'semua', 'mode diambil dari peta')
assert(modeFitur({ fs_module: 'semua' }, 'leads') === MODE_BAWAAN, 'kunci tak tercatat pakai bawaan')
assert(modeFitur(undefined, 'fs_module') === MODE_BAWAAN, 'peta kosong pakai bawaan')

// ── saringTambahan ─────────────────────────────────────────────────────────
{
  const menu = [
    { key: 'rab' },
    { key: 'fs', tambahan: 'fs_module' },
    { key: 'leads', tambahan: 'leads' },
  ]
  const peta = { fs_module: 'semua', leads: 'mati' }

  const untukPengguna = saringTambahan(menu, peta, () => ({ superadmin: false }))
  assert(untukPengguna.map(m => m.key).join(',') === 'rab,fs',
    'menu biasa lolos, fs lolos karena semua, leads tersaring karena mati')

  const untukSa = saringTambahan(menu, peta, () => ({ superadmin: true }))
  assert(untukSa.map(m => m.key).join(',') === 'rab,fs',
    'superadmin pun tidak melihat fitur yang dimatikan')

  const belumDiatur = saringTambahan(menu, {}, () => ({ superadmin: false }))
  assert(belumDiatur.map(m => m.key).join(',') === 'rab',
    'tanpa setelan, fitur tambahan belum ditawarkan ke pengguna')

  const belumDiaturSa = saringTambahan(menu, {}, () => ({ superadmin: true }))
  assert(belumDiaturSa.map(m => m.key).join(',') === 'rab,fs,leads',
    'tanpa setelan, superadmin tetap bisa mengujinya')

  // Keadaan pemakai boleh berbeda per fitur — mis. langganan FS terpisah.
  const perFitur = saringTambahan(
    menu, { fs_module: 'semua', leads: 'semua' },
    kunci => ({ superadmin: false, berlangganan: kunci !== 'fs_module' }),
  )
  assert(perFitur.map(m => m.key).join(',') === 'rab,leads',
    'langganan diperiksa per fitur, bukan sekali untuk semua')
}
assert(saringTambahan([], {}, () => ({})).length === 0, 'daftar kosong aman')
assert(saringTambahan(undefined, {}, () => ({})).length === 0, 'tanpa daftar aman')

// ── Label ──────────────────────────────────────────────────────────────────
assert(MODE_FITUR.length === 3, 'tiga mode')
assert(MODE_FITUR.every(m => LABEL_MODE[m] && JELAS_MODE[m]), 'tiap mode punya label & penjelasan')

console.log(`fitur-tambahan: ${ok} assert lulus`)
