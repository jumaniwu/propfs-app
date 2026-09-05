// ============================================================
// Alat pemeriksa migrasi harus memeriksa objek yang BENAR-BENAR dibuat.
//
// CEK_MIGRASI.sql melaporkan ❌ BELUM untuk dua migrasi yang sudah dijalankan
// berkali-kali. Sebabnya bukan migrasinya:
//
//   migration_pekerja_lapangan.sql membuat `field_workers`,
//     tetapi probe-nya memeriksa `pekerja_lapangan`.
//   migration_gambar_kerja.sql membuat `project_drawings`,
//     tetapi probe-nya memeriksa `gambar_kerja`.
//
// Keduanya nama yang MASUK AKAL — persis nama berkas migrasinya — dan
// keduanya tidak pernah ada. Hasilnya selalu ❌, tidak peduli berapa kali
// migrasinya dijalankan, dan yang membacanya dikirim mengerjakan sesuatu yang
// sudah selesai. Dua kali.
//
// Alat pemeriksa yang berbohong lebih buruk daripada tidak ada alat pemeriksa:
// yang pertama menghabiskan waktu orang dan menutupi masalah yang sebenarnya.
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const dir = new URL('../supabase/migrations', import.meta.url).pathname
const tanpaKomentar = t => t.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')

// ── Apa yang sungguh-sungguh dibuat oleh migrasi ────────────────────
const tabel = new Set(), fungsi = new Set()
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql') && f !== 'CEK_MIGRASI.sql')) {
  const kode = tanpaKomentar(readFileSync(join(dir, f), 'utf8'))
  for (const m of kode.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)) {
    tabel.add(m[1].toLowerCase().replace(/^public\./, ''))
  }
  for (const m of kode.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)/gi)) {
    fungsi.add(m[1].toLowerCase().replace(/^public\./, ''))
  }
}
assert(tabel.size > 20 && fungsi.size > 40, 'objek migrasinya terbaca')

// ── Setiap probe harus menunjuk sesuatu yang ada ────────────────────
const cek = tanpaKomentar(readFileSync(join(dir, 'CEK_MIGRASI.sql'), 'utf8'))
const salah = []
for (const m of cek.matchAll(/to_regclass\('public\.(\w+)'\)/g)) {
  if (!tabel.has(m[1].toLowerCase())) salah.push(`tabel '${m[1]}'`)
}
for (const m of cek.matchAll(/proname\s*=\s*'(\w+)'/g)) {
  if (!fungsi.has(m[1].toLowerCase())) salah.push(`fungsi '${m[1]}'`)
}
assert(salah.length === 0,
  'setiap probe menunjuk objek yang benar-benar dibuat migrasi. Tidak ketemu: ' + salah.join(', '))

// Pemeriksanya sendiri harus bisa menangkap — kalau tidak, ia hanya hiasan.
{
  const palsu = "to_regclass('public.tabel_yang_tidak_pernah_ada') is not null"
  const tertangkap = [...palsu.matchAll(/to_regclass\('public\.(\w+)'\)/g)]
    .filter(m => !tabel.has(m[1].toLowerCase())).length
  assert(tertangkap === 1, 'probe yang salah sasaran memang tertangkap')
}

// ── Dua nama yang dulu salah, disebut namanya ───────────────────────
{
  assert(/to_regclass\('public\.field_workers'\)/.test(cek),
    'migration_pekerja_lapangan diperiksa lewat field_workers')
  assert(!/to_regclass\('public\.pekerja_lapangan'\)/.test(cek),
    'nama pekerja_lapangan yang tidak pernah ada sudah tidak dipakai')
  assert(/to_regclass\('public\.project_drawings'\)/.test(cek),
    'migration_gambar_kerja diperiksa lewat project_drawings')
  assert(!/to_regclass\('public\.gambar_kerja'\)/.test(cek),
    'nama gambar_kerja yang tidak pernah ada sudah tidak dipakai')
}

// ── ADA saja tidak cukup untuk fungsi yang pernah rusak ─────────────
//
// Versi pertama field_log_gabung memakai `delete from peta_pekerja;` — DELETE
// tanpa WHERE, yang ditolak Supabase. Fungsinya ADA, dan probe yang hanya
// memeriksa keberadaannya akan berkata ✅ SUDAH untuk versi yang tidak pernah
// bisa berhasil — sementara pemakainya melihat galat di layar.
{
  assert(/prosrc not like '%peta_pekerja%'/.test(cek),
    'versi lama field_log_gabung yang rusak dikenali sebagai BELUM')
  assert(/prosrc like '%unnest\(v_lama%'/.test(cek),
    'dan versi yang benar dikenali dari isinya')
}

// ── Migrasi baru punya barisnya sendiri ─────────────────────────────
{
  for (const f of ['migration_buku_milik_perusahaan.sql', 'migration_upah_pekerja.sql',
                   'migration_gabung_buku.sql']) {
    assert(cek.includes(f), `${f} punya baris di CEK_MIGRASI`)
  }
}

console.log(`cek-migrasi: ${ok} assert lulus (${tabel.size} tabel, ${fungsi.size} fungsi dipindai)`)
