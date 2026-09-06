// ============================================================
// Halaman pemilik rumah gagal terbuka karena kehabisan waktu, bukan hak akses.
//
// Yang terbaca di layar pemilik rumah:
//   "Data gagal: canceling statement due to statement timeout"
//
// Selama ini pesan itu tertutup di balik "HTTP 500", jadi yang terlihat hanya
// "link owner tidak bisa dibuka" — dan dugaannya selalu soal RLS atau migrasi
// yang belum dijalankan. Bukan keduanya.
//
// field_log_by_view_token mengumpulkan SELURUH baris laporan menjadi satu
// jsonb, termasuk `photos` yang berisi foto sebagai data URL base64. Diukur
// pada PostgreSQL 16 dengan 31 laporan × 4 foto: payload 26 MB, 1046 ms di
// server lokal tanpa jaringan sama sekali. Peran `anon` di Supabase punya
// statement_timeout jauh di bawah itu.
//
// Padahal halaman itu HANYA menampilkan foto untuk satu hari yang diketuk.
// Kalendernya sendiri cuma butuh tanggal, kegiatan, dan nama pelapor —
// seluruh foto sebulan diangkut untuk menggambar kotak-kotak angka.
//
// Sesudah dipisah: 9 kB dan 30 ms.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const akarSql = new URL('../supabase/migrations', import.meta.url).pathname
const akarSrc = new URL('../src', import.meta.url).pathname
const tanpaKomentarSql = t => t.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
const tanpaKomentarTs = t => t.split('\n')
  .filter(b => !b.trim().startsWith('//') && !b.trim().startsWith('*') && !b.trim().startsWith('/*'))
  .join('\n')

// ── 1. Daftar kalender tidak lagi membawa foto ──────────────────────
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_owner_foto_perhari.sql'), 'utf8'))

  assert(/to_jsonb\(r\) - 'absensi' - 'photos'/.test(sql),
    'photos dibuang dari daftar, bersama absensi')
  assert(/'foto_jumlah'/.test(sql),
    'jumlahnya tetap dikirim, supaya layar tahu ada foto yang bisa dibuka')

  // absensi RAHASIA, photos hanya BESAR — keduanya dibuang, alasannya beda.
  assert(/- 'absensi'/.test(sql), 'absensi tetap tidak pernah sampai ke pemilik rumah')
  assert(!/select r\.absensi/.test(sql), 'dan tidak dikembalikan lewat pintu lain')
}

// ── 2. Fungsi foto per hari ada, dan dibatasi tokennya ──────────────
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_owner_foto_perhari.sql'), 'utf8'))
  assert(/create or replace function public\.field_log_foto_by_view_token/.test(sql),
    'ada fungsi pengambil foto per hari')
  assert(/l\.view_token = p_token/.test(sql),
    'dibatasi oleh token buku itu — bukan sekadar tanggal')
  assert(/r\.tanggal = p_tanggal/.test(sql), 'satu hari saja, bukan semuanya')
  assert(/grant execute on function public\.field_log_foto_by_view_token\(text, date\) to anon/.test(sql),
    'bisa dipanggil pemilik rumah yang tidak login')
  assert(/revoke all on function public\.field_log_foto_by_view_token\(text, date\) from public/.test(sql),
    'dan tidak terbuka untuk peran public')
}

// ── 3. Indeks, supaya bukan pemindaian penuh ────────────────────────
//
// Pada tabel yang barisnya besar-besar, pemindaian penuh sendiri sudah cukup
// menghabiskan waktu yang tersedia.
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_owner_foto_perhari.sql'), 'utf8'))
  assert(/create index if not exists idx_field_reports_log_tanggal/.test(sql), 'ada indeksnya')
  assert(/on public\.field_reports\(log_id, tanggal desc/.test(sql),
    'urutannya cocok dengan cara datanya dibaca')
}

// ── 4. Aplikasi mengambil foto per hari ─────────────────────────────
{
  const fr = tanpaKomentarTs(readFileSync(join(akarSrc, 'lib/fieldReports.ts'), 'utf8'))
  assert(/getOwnerFoto\(token: string, tanggal: string\)/.test(fr), 'ada getOwnerFoto')
  assert(/field_log_foto_by_view_token/.test(fr), 'memanggil fungsi yang benar')
  assert(/photos: r\.photos \?\? \[\]/.test(fr),
    'daftar tanpa photos tetap aman dibaca — larik kosong, bukan undefined')

  const hal = readFileSync(join(akarSrc, 'pages/ProgressKalenderPage.tsx'), 'utf8')
  const kode = tanpaKomentarTs(hal)
  assert(/getOwnerFoto\(token, selected\)/.test(kode), 'fotonya diambil saat harinya dibuka')
  assert(/\[selected, token\]/.test(kode), 'dan diambil ulang saat pindah hari')
  assert(/foto\.get\(r\.id\)/.test(kode), 'foto dipasangkan ke laporannya lewat id')
  assert(/loading="lazy"/.test(kode), 'gambarnya tidak dipaksa dimuat sekaligus')

  // Kegagalan foto tidak boleh menghapus kegiatan hari itu dari layar.
  assert(/fotoGagal/.test(kode), 'kegagalan mengambil foto punya keadaannya sendiri')
  assert(/gagal dimuat/.test(kode), 'dan disebutkan, bukan berupa ruang kosong')
  assert(/foto_jumlah \?\? r\.photos\.length/.test(kode),
    'jumlah foto dibaca dari server, dengan cadangan untuk data lama')
}

// ── 5. Halaman pekerja tidak ikut berubah ───────────────────────────
//
// field_log_by_report_token memang tidak pernah mengirim laporan, jadi mandor
// tidak terkena persoalan ini. Diperiksa supaya perbaikan di sini tidak
// diam-diam menyeretnya.
{
  const lama = readFileSync(join(akarSql, 'migration_pekerja_lapangan.sql'), 'utf8')
  assert(/returns table \(project_name text, drive_webhook text, pekerja jsonb\)/.test(lama),
    'halaman pekerja tetap mengambil daftar pekerja, bukan laporan berfoto')
}

console.log(`owner-foto: ${ok} assert lulus`)
