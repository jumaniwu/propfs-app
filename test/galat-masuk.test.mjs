// ============================================================
// Pesan kegagalan masuk.
//
// Yang diuji di sini satu hal: apakah kalimatnya menyebut penyebab yang BENAR.
//
// Sebelumnya, salah ketik password ditampilkan sebagai "Gagal Terhubung"
// beserta saran memeriksa internet dan verifikasi akun. Dua saran itu
// mengirim orang memeriksa hal yang tidak rusak, sementara yang rusak —
// passwordnya — tidak pernah disebut. Orang lalu mengira aplikasinya
// bermasalah, bukan ketikannya.
// ============================================================
import { pesanGalatMasuk } from '../src/lib/galatMasuk.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Password salah: BUKAN masalah koneksi ─────────────────────────────────
{
  const g = pesanGalatMasuk(new Error('Invalid login credentials'))
  assert(g.judul === 'Email atau Password Salah', `judulnya: ${g.judul}`)
  assert(!/terhubung|koneksi|internet/i.test(g.judul + g.isi),
    'tidak menuduh koneksi — justru karena tersambunglah server sempat menjawab')
  assert(!/invalid|credentials/i.test(g.judul + g.isi), 'tidak ada bahasa Inggris tersisa')
  assert(g.sarankanReset, 'menawarkan atur ulang password — satu-satunya tindakan yang menolong')
  // Huruf besar-kecil password adalah penyebab yang paling sering, dan paling
  // jarang terpikirkan orang.
  assert(/huruf besar/i.test(g.isi), `menyebut huruf besar-kecil: ${g.isi}`)
}
assert(pesanGalatMasuk('invalid login credentials').judul === 'Email atau Password Salah',
  'teks telanjang, huruf kecil')
assert(pesanGalatMasuk({ message: 'Invalid credentials' }).judul === 'Email atau Password Salah',
  'objek bergaya galat Supabase')

// ── Email belum diverifikasi ──────────────────────────────────────────────
{
  const g = pesanGalatMasuk(new Error('Email not confirmed'))
  assert(g.judul === 'Email Belum Diverifikasi', g.judul)
  assert(/spam/i.test(g.isi), 'menyebut folder spam — di situlah emailnya biasanya')
  assert(!g.sarankanReset, 'atur ulang password tidak menolong di sini')
}

// ── Terlalu sering mencoba ────────────────────────────────────────────────
{
  const g = pesanGalatMasuk(new Error('Too many requests'))
  assert(g.judul === 'Terlalu Sering Mencoba', g.judul)
  assert(/bukan akun yang diblokir/i.test(g.isi),
    'menenangkan: ini pengaman otomatis, bukan akun mati')
}

// ── Akun tidak ada ────────────────────────────────────────────────────────
assert(pesanGalatMasuk(new Error('User not found')).judul === 'Akun Tidak Ditemukan', 'user not found')

// ── BARU di sini koneksi boleh disalahkan ─────────────────────────────────
for (const t of ['Failed to fetch', 'NetworkError when attempting to fetch', 'Load failed', 'Waktu habis']) {
  const g = pesanGalatMasuk(new Error(t))
  assert(g.judul === 'Tidak Ada Koneksi', `"${t}" → ${g.judul}`)
  assert(/internet/i.test(g.isi), 'barulah menyuruh memeriksa internet')
}

// ── Yang tidak dikenali ditampilkan apa adanya ────────────────────────────
//
// Pesan asing lebih baik daripada pesan yang salah dengan percaya diri.
{
  const g = pesanGalatMasuk(new Error('Something weird from Supabase'))
  assert(g.judul === 'Gagal Masuk', g.judul)
  assert(g.isi === 'Something weird from Supabase', 'isinya tidak dikarang ulang')
  assert(!g.sarankanReset, 'tidak menawarkan tindakan yang belum tentu menolong')
}

// ── Masukan rusak tidak menjatuhkan halaman masuk ─────────────────────────
for (const x of [null, undefined, '', '   ', {}, 0, [], new Error('')]) {
  const g = pesanGalatMasuk(x)
  assert(typeof g.judul === 'string' && g.judul.length > 0, `selalu ada judul untuk ${JSON.stringify(x)}`)
  assert(typeof g.isi === 'string' && g.isi.length > 0, 'selalu ada isi')
  assert(typeof g.sarankanReset === 'boolean', 'selalu boolean')
}
assert(pesanGalatMasuk(null).judul === 'Gagal Masuk', 'null jatuh ke bawaan')
assert(/support@propfs\.id/.test(pesanGalatMasuk(null).isi), 'bawaan menyebut ke mana harus bertanya')

console.log(`galat-masuk: ${ok} assert lulus`)
