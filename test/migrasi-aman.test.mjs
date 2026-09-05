// ============================================================
// DELETE dan UPDATE di migrasi HARUS punya WHERE.
//
// Penggabungan buku laporan gagal di produksi dengan pesan
// "DELETE requires a WHERE clause". Yang menyebabkannya bukan pekerjaan
// utamanya, melainkan satu baris pembersihan: `delete from peta_pekerja;` —
// tabel sementara milik fungsi itu sendiri.
//
// Supabase memuat ekstensi `safeupdate` untuk peran `authenticator`. Ekstensi
// itu MENOLAK setiap DELETE atau UPDATE tanpa WHERE, di mana pun ia berada,
// termasuk di dalam fungsi. PostgreSQL biasa tidak memuatnya.
//
// Itu sebabnya migrasinya lulus sepenuhnya saat diuji terhadap PostgreSQL 16
// lokal — delapan belas pemeriksaan hijau — lalu gagal pada percobaan pertama
// di Supabase. Lingkungan ujinya tidak bisa melihat cacat jenis ini sama
// sekali, jadi penjagaannya harus berupa pembacaan sumber.
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const dir = new URL('../supabase/migrations', import.meta.url).pathname
const berkas = readdirSync(dir).filter(f => f.endsWith('.sql'))
assert(berkas.length > 10, 'berkas migrasinya ketemu')

// Kata "update" dan "delete" muncul di banyak tempat yang BUKAN pernyataan
// DML, dan semuanya dikenali dari kata SEBELUMNYA — bukan sesudahnya:
//
//   `on conflict (…) do update set …`  — upsert
//   `create policy … for update …`     — definisi policy RLS
//   `before/after update on …`         — definisi trigger
//
// Karena itu jendelanya menengok ke BELAKANG. Versi pertama pemeriksa ini
// hanya membaca ke depan dari kata "update", jadi seluruh upsert di repositori
// ditandai sebagai pelanggaran — dan pemeriksa yang ramai dengan alarm palsu
// akan dimatikan orang, bukan diperbaiki.
const abaikan = new RegExp([
  'on\\s+conflict[\\s\\S]{0,240}?do\\s*$',        // upsert: … do update set
  '\\bfor\\s*$',                                   // policy: create policy … for update
  '\\b(before|after|instead\\s+of)\\b[\\w\\s]{0,60}$', // trigger: after insert or update or delete on …
].join('|'), 'i')

/** Satu pelanggaran = pernyataan DML tanpa WHERE. Dipakai juga oleh uji-diri. */
function cariPelanggaran(mentah) {
  // Teks di dalam tanda kutip dibuang lebih dulu. Nama policy seperti
  // "Users can update own invoices" mengandung kata "update" yang bukan
  // pernyataan apa pun, dan menandainya membuat pemeriksa ini berbunyi untuk
  // hal yang tidak bisa diperbaiki siapa pun.
  const kode = mentah.replace(/'(?:[^']|'')*'/g, "''").replace(/"[^"]*"/g, '""')
  const hasil = []
  const re = /\b(delete\s+from|update)\s+(?:only\s+)?([a-zA-Z_][\w.\"]*)/gi
  let m
  while ((m = re.exec(kode)) !== null) {
    const sebelum = kode.slice(Math.max(0, m.index - 240), m.index)
    if (abaikan.test(sebelum)) continue
    const sisa = kode.slice(m.index)
    const titik = sisa.indexOf(';')
    const pernyataan = titik > 0 ? sisa.slice(0, titik) : sisa.slice(0, 500)
    if (!/\bwhere\b/i.test(pernyataan)) {
      hasil.push(pernyataan.split('\n')[0].trim().slice(0, 80))
    }
  }
  return hasil
}

const pelanggaran = []
for (const f of berkas) {
  const mentah = readFileSync(join(dir, f), 'utf8')
  const kode = mentah.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
  for (const p of cariPelanggaran(kode)) pelanggaran.push(`${f}: ${p}`)
}
assert(pelanggaran.length === 0,
  'tidak ada DELETE/UPDATE tanpa WHERE:\n  ' + pelanggaran.join('\n  '))

// ── Pemeriksanya sendiri harus benar-benar bisa menangkap ───────────────
//
// Uji yang tidak pernah gagal untuk apa pun tidak menjaga apa pun. Ini
// menjalankan pola yang sama pada teks yang sengaja melanggar.
{
  // Yang MELANGGAR — termasuk baris persis yang menggagalkan produksi.
  const melanggar = cariPelanggaran(
    'delete from peta_pekerja;\nupdate field_logs set user_id = null;')
  assert(melanggar.length === 2, 'dua pelanggaran nyata tertangkap')

  // Yang TIDAK melanggar, dan dulu salah ditandai.
  const aman = cariPelanggaran(`
    insert into t (id) values (1) on conflict (id) do update set nama = 'x';
    create policy "p" on t for update using (auth.uid() = id);
    create trigger tg before update on t for each row execute function f();
    create trigger tg2 after insert or update or delete on t
      for each row execute function f();
    create policy "Users can update own invoices" on t for all using (true);
    delete from t where id = 1;
    update t set a = 1 where id = 2;
  `)
  assert(aman.length === 0, 'upsert, policy (termasuk yang namanya memuat kata update), dan trigger tidak ditandai')
}

// ── Fungsi penggabungan tidak lagi memakai tabel sementara ──────────────
{
  const sql = readFileSync(join(dir, 'migration_gabung_buku.sql'), 'utf8')
  const kode = sql.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
  assert(!/create\s+temp\s+table/i.test(kode),
    'petanya berupa larik, bukan tabel sementara yang perlu dibersihkan')
  assert(/unnest\(v_lama, v_baru\)/.test(kode), 'peta id lama→baru dibaca lewat unnest')
}

// ── Buku laporan disimpan atas nama PERUSAHAAN ─────────────────────────
//
// RLS berbunyi `auth.uid() = user_id or is_team_member(user_id)`, dan
// is_team_member hanya berlaku satu arah. Buku yang disimpan atas nama
// pengawas tidak akan pernah terlihat oleh pemilik perusahaan.
{
  const akarSrc = new URL('../src', import.meta.url).pathname
  const fr = readFileSync(join(akarSrc, 'lib/fieldReports.ts'), 'utf8')
  const kode = fr.split('\n').filter(b => !b.trim().startsWith('//') && !b.trim().startsWith('*')).join('\n')
  assert(/user_id: pemilikData\(\)/.test(kode), 'createLog memakai pemilik workspace')
  assert(/dataOwnerId\(\)/.test(kode), 'diambil dari dataOwnerId, sumber yang sama dengan procurement')
  assert(!/user_id: uid\(\)/.test(kode), 'tidak lagi disimpan atas nama akun yang menekan tombol')
}

console.log(`migrasi-aman: ${ok} assert lulus (${berkas.length} berkas migrasi dipindai)`)
