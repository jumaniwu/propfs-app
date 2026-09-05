// ============================================================
// Upah pekerja yang sudah terdaftar harus bisa diperbaiki di tempat.
//
// Pekerja didaftarkan lebih dulu — sering oleh mandor, di lapangan, sambil
// mencatat nama dan nomor HP. Upah hariannya belum tentu diketahui saat itu:
// angkanya disepakati di kantor, kadang beberapa hari kemudian. Jadi orangnya
// terdaftar dengan upah nol, lalu bekerja, lalu direkap sebagai nol.
//
// Panel rekap sudah MENUNJUKKAN siapa yang upahnya kosong. Yang tidak ada
// adalah cara memperbaikinya dari sana: satu-satunya jalan adalah membuka link
// pekerja di tab lain lalu mendaftarkan ulang orangnya.
//
// Pendaftaran ulang itu berkunci pada NAMA. Salah ketik satu huruf melahirkan
// orang KEDUA, sementara absensi yang sudah tercatat tetap menempel pada yang
// lama — satu orang terpecah menjadi dua di rekap upah. Karena itu penyuntingan
// di sini berdasarkan ID, dan namanya tidak ikut dikirim sama sekali.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bacaAngkaRupiah, selesaiKetik } from '../src/lib/isianRupiah.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const akarSrc = new URL('../src', import.meta.url).pathname
const akarSql = new URL('../supabase/migrations', import.meta.url).pathname
const tanpaKomentarSql = t => t.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
const tanpaKomentarTs = t => t.split('\n').filter(b => !b.trim().startsWith('//') && !b.trim().startsWith('*')).join('\n')

// ── 1. Fungsinya mengubah berdasarkan ID, bukan nama ────────────────
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_upah_pekerja.sql'), 'utf8'))
  assert(/create or replace function public\.field_worker_upah/.test(sql), 'fungsinya ada')
  assert(/where id = p_id and log_id = v_log/.test(sql),
    'dikunci pada id DAN buku laporannya — satu token tidak bisa mengubah proyek lain')
  assert(!/insert into field_workers/.test(sql),
    'tidak pernah menyisipkan pekerja baru; salah ketik tidak bisa melahirkan orang kedua')
  assert(!/set nama/.test(sql) && !/nama =/.test(sql), 'nama tidak pernah disentuh')
  assert(/return found/.test(sql),
    'nol baris dikembalikan apa adanya — bukan dilaporkan sebagai tersimpan')
  assert(/p_upah, 0\) < 0/.test(sql), 'upah minus ditolak')
  assert(/security definer/.test(sql) && /field_logs where report_token = p_token/.test(sql),
    'token yang menentukan buku, diperiksa di dalam fungsi')
}

// ── 2. Borongan menolkan upah harian, tidak meninggalkannya ─────────
//
// Angka lama yang tertinggal di baris borongan akan terbaca kembali sebagai
// tarif harian kalau orangnya suatu saat dikembalikan ke harian.
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_upah_pekerja.sql'), 'utf8'))
  assert(/when v_jenis = 'borongan' then 0/.test(sql), 'borongan menolkan upah hariannya')
}

// ── 3. Aplikasi menolak "tersimpan" yang tidak mengubah apa pun ─────
{
  const fr = tanpaKomentarTs(readFileSync(join(akarSrc, 'lib/fieldReports.ts'), 'utf8'))
  assert(/field_worker_upah/.test(fr), 'fieldReports memanggil field_worker_upah')
  assert(/ok !== true/.test(fr), 'jawaban false dilempar sebagai galat, bukan ditelan')
  assert(/Math\.max\(0,/.test(fr), 'angka minus tidak pernah dikirim')
}

// ── 4. Layarnya menyunting, dan hanya untuk yang benar-benar terdaftar ─
{
  const panel = readFileSync(join(akarSrc, 'components/cost/PanelRekapAbsensi.tsx'), 'utf8')
  const kode = tanpaKomentarTs(panel)
  assert(/function SelUpah/.test(kode), 'ada kolom upah yang bisa disunting')
  assert(/ubahUpah\(token, baris\.pekerja_id/.test(kode), 'yang dikirim id-nya, bukan namanya')
  assert(/!!token && !!baris\.pekerja_id/.test(kode),
    'nama yang hanya ada di absensi lama tidak menawarkan tombol yang akan gagal')
  assert(/belum terdaftar/.test(kode), 'dan sebabnya disebutkan, bukan tombol yang diam')
  assert(/ketikRupiah/.test(kode) && /selesaiKetik/.test(kode),
    'angkanya dibaca gaya Indonesia — titik adalah pemisah ribuan')

  // Panel ini juga dipakai di layar yang tidak berhak mengubah upah.
  assert(/token\?: string/.test(kode), 'token opsional; tanpanya panel tetap utuh dan hanya dibaca')

  const tab = readFileSync(join(akarSrc, 'components/cost/TabLaporanLapangan.tsx'), 'utf8')
  assert(/token=\{openLog\.report_token\}/.test(tab), 'tab laporan memberikan tokennya')
  assert(/onUbahUpah=/.test(tab), 'rekapnya dihitung ulang setelah upah berubah')
}

// ── 5. "150.000" harus terbaca seratus lima puluh ribu ──────────────
//
// Ini bukan uji hiasan. Number("150.000") di JavaScript bernilai 150 — titik
// dibaca sebagai koma desimal. Kolom upah yang salah membacanya akan membayar
// seorang tukang seratus lima puluh rupiah sehari.
{
  assert(bacaAngkaRupiah('150.000') === 150000, 'titik adalah pemisah ribuan, bukan desimal')
  assert(bacaAngkaRupiah('Rp 1.250.000') === 1250000, 'awalan Rp dan titik-titiknya diabaikan')
  assert(selesaiKetik('').nilai === 0, 'kolom yang dikosongkan berarti nol yang disengaja')
  assert(selesaiKetik('0').nilai === 0, 'nol yang diketik tetap nol')
}

console.log(`upah-sunting: ${ok} assert lulus`)
