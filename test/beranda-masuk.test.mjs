// Test rute beranda: ke mana pemakai mendarat setiap kali masuk.
import {
  rutaMasuk, bacaRencanaTertunda, rutaTagihan, rutaSetelahMasuk,
  RUTA_KONTRAKTOR, RUTA_FS, RUTA_LANGGANAN,
} from '../src/lib/berandaMasuk.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Inti permintaan: pelanggan Kontraktor AI mendarat di Kontraktor AI ────
assert(rutaMasuk({ kontraktor: true }) === RUTA_KONTRAKTOR,
  'pelanggan Kontraktor AI langsung ke Home Kontraktor, bukan dashboard akun')
assert(rutaMasuk({ kontraktor: true, fs: true }) === RUTA_KONTRAKTOR,
  'punya keduanya pun Kontraktor AI yang didahulukan')
assert(RUTA_KONTRAKTOR === '/kontraktor', 'berandanya memang Home Kontraktor AI')
assert(rutaMasuk({ kontraktor: true }) !== '/home', 'dashboard akun lama tidak lagi jadi tujuan')

// Karyawan tidak punya langganan sendiri — ia menumpang langganan perusahaan.
assert(rutaMasuk({ sesiTim: true }) === RUTA_KONTRAKTOR,
  'sesi tim selalu mendarat di Kontraktor AI walau tak punya langganan sendiri')
assert(rutaMasuk({ sesiTim: true, kontraktor: false, fs: true }) === RUTA_KONTRAKTOR,
  'sesi tim tidak pernah dilempar ke Feasibility Study')

// Pelanggan FS saja tetap mendarat di tempat yang berguna baginya.
assert(rutaMasuk({ fs: true }) === RUTA_FS, 'pelanggan FS saja mendarat di dashboard FS')

// ── Lingkaran pengalihan: yang harus dicegah ─────────────────────────────
// Kalau penolakan fitur melempar ke beranda, dan beranda menghitung rute yang
// baru saja ditolak, pemakainya terjebak selamanya. Karena itu tanpa akses
// apa pun, berandanya BUKAN rute yang dijaga fitur.
{
  const tanpaAkses = rutaMasuk({})
  assert(tanpaAkses === RUTA_LANGGANAN, 'tanpa langganan, berandanya halaman paket')
  assert(tanpaAkses !== RUTA_KONTRAKTOR && tanpaAkses !== RUTA_FS,
    'beranda tanpa akses tidak boleh rute yang dijaga fitur — itu lingkaran pengalihan')
  assert(rutaMasuk() === RUTA_LANGGANAN, 'tanpa masukan pun aman')
  assert(rutaMasuk({ kontraktor: false, fs: false }) === RUTA_LANGGANAN, 'keduanya mati sama saja')
}

// ── Rencana tertunda dari URL ────────────────────────────────────────────
{
  const r = bacaRencanaTertunda('?create_invoice=pro&months=3', null)
  assert(r?.plan === 'pro' && r.bulan === 3, 'paket & lama langganan terbaca dari URL')
}
assert(bacaRencanaTertunda('?create_invoice=starter', null)?.bulan === 1,
  'tanpa months dianggap 1 bulan')
assert(bacaRencanaTertunda('?create_invoice=free', null) === null,
  'paket gratis tidak menerbitkan tagihan')
assert(bacaRencanaTertunda('', null) === null, 'tanpa apa-apa berarti tidak ada rencana')
assert(bacaRencanaTertunda(null, null) === null, 'masukan kosong aman')
assert(bacaRencanaTertunda('?create_invoice=', null) === null, 'nilai kosong bukan rencana')
assert(bacaRencanaTertunda('?create_invoice=pro&months=nol', null)?.bulan === 1,
  'months ngawur jatuh ke 1, bukan NaN yang merusak harga')
assert(bacaRencanaTertunda('?create_invoice=pro&months=-6', null)?.bulan === 1,
  'months negatif tidak boleh jadi harga negatif')

// ── Rencana tertunda dari simpanan (kembali lewat tautan konfirmasi email) ──
{
  // Inilah jalan yang gampang terlupakan: pemakai memilih paket saat mendaftar,
  // pergi ke email, lalu kembali dengan URL yang sudah bersih dari parameter.
  const r = bacaRencanaTertunda('', JSON.stringify({ plan: 'pro', months: 12 }))
  assert(r?.plan === 'pro' && r.bulan === 12, 'pilihan paket saat mendaftar tidak hilang')
}
{
  // URL menang: itu tindakan yang baru saja dilakukan.
  const r = bacaRencanaTertunda('?create_invoice=starter', JSON.stringify({ plan: 'pro' }))
  assert(r?.plan === 'starter', 'pilihan terbaru dari URL mengalahkan simpanan lama')
}
assert(bacaRencanaTertunda('', '{bukan json') === null,
  'simpanan rusak tidak boleh menggagalkan proses masuk')
assert(bacaRencanaTertunda('', JSON.stringify({ plan: 'free' })) === null,
  'simpanan paket gratis diabaikan')
assert(bacaRencanaTertunda('', JSON.stringify({})) === null, 'simpanan tanpa paket diabaikan')
assert(bacaRencanaTertunda('', JSON.stringify({ plan: 'pro' }))?.bulan === 1,
  'simpanan tanpa months dianggap 1 bulan')

// ── rutaTagihan ──────────────────────────────────────────────────────────
assert(rutaTagihan('pro') === '/home?create_invoice=pro', 'satu bulan tidak perlu months')
assert(rutaTagihan('pro', 3) === '/home?create_invoice=pro&months=3', 'lebih dari sebulan disebut')
assert(rutaTagihan('a b') === '/home?create_invoice=a%20b', 'nama paket aneh tetap aman di URL')

// ── rutaSetelahMasuk ─────────────────────────────────────────────────────
assert(rutaSetelahMasuk({ kontraktor: true }, 'pro', 3) === '/home?create_invoice=pro&months=3',
  'ada tagihan: diterbitkan dulu')
assert(rutaSetelahMasuk({ kontraktor: true }, 'free') === RUTA_KONTRAKTOR,
  'paket gratis langsung ke beranda, tanpa tagihan')
assert(rutaSetelahMasuk({ kontraktor: true }, null) === RUTA_KONTRAKTOR,
  'tanpa paket langsung ke beranda')
assert(rutaSetelahMasuk({ kontraktor: true }, '') === RUTA_KONTRAKTOR, 'paket kosong sama saja')
assert(rutaSetelahMasuk({}, null) === RUTA_LANGGANAN, 'tanpa akses & tanpa paket ke halaman paket')

console.log(`beranda-masuk: ${ok} assert lulus`)
