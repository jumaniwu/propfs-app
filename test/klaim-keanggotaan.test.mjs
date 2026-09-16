// ============================================================
// Keanggotaan tim akhirnya menunjuk akun yang sebenarnya.
//
// `team_members.member_user_id` TIDAK PERNAH DIISI oleh apa pun — tidak oleh
// satu migrasi pun, tidak oleh aplikasi. Kolomnya ada, dibaca di banyak
// tempat, dan selalu NULL.
//
// Yang membacanya adalah is_team_member(p_owner):
//     where t.owner_id = p_owner and t.member_user_id = auth.uid() and ...
//
// NULL tidak pernah sama dengan apa pun, jadi fungsi itu SELALU false. Dan
// fungsi itulah yang menjaga puluhan kebijakan RLS di lima belas berkas
// migrasi, semuanya berbentuk:
//     using (auth.uid() = user_id or public.is_team_member(user_id))
//
// Dengan ruas kanan yang mati, seluruhnya merosot jadi "hanya baris milik
// sendiri". Selama ini tertutupi karena tiap orang membuat barisnya sendiri,
// jadi ruas KIRI selalu menyelamatkannya — sampai baris mulai disimpan atas
// nama perusahaan, dan ruas kiri berhenti berlaku bagi yang membuatnya.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const akarSql = new URL('../supabase/migrations', import.meta.url).pathname
const akarSrc = new URL('../src', import.meta.url).pathname
const tanpaKomentarSql = t => t.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
const tanpaKomentarTs = t => t.split('\n')
  .filter(b => { const x = b.trim(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') })
  .join('\n')

const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_klaim_keanggotaan.sql'), 'utf8'))

// ── 1. Perbaikan data untuk tim yang sudah berjalan ─────────────────
//
// Tanpa ini, tim yang sudah ada harus masuk ulang satu per satu sebelum bisa
// melihat apa pun lagi.
{
  assert(/update public\.team_members t/.test(sql), 'ada perbaikan data')
  assert(/from auth\.users u/.test(sql), 'dicocokkan dengan akun yang benar-benar ada')
  assert(/lower\(btrim\(t\.member_email\)\) = lower\(btrim\(u\.email\)\)/.test(sql),
    'beda huruf besar & spasi berlebih tetap cocok — email diketik manusia')
  assert(/t\.member_user_id is null/.test(sql), 'yang sudah terikat tidak disentuh')
  assert(/raise notice/.test(sql), 'hasilnya dilaporkan, bukan didiamkan')
}

// ── 2. Pengikatan hanya atas email MILIK SENDIRI ────────────────────
//
// Emailnya dibaca dari auth.users berdasarkan auth.uid() — bukan dari
// parameter. Tidak ada masukan yang bisa dipalsukan untuk mengklaim
// keanggotaan orang lain.
{
  assert(/create or replace function public\.team_klaim_keanggotaan\(\)/.test(sql), 'fungsinya ada')
  assert(/select lower\(btrim\(email\)\) into v_email from auth\.users where id = auth\.uid\(\)/.test(sql),
    'email dibaca dari akun pemanggil, bukan dari parameter')
  assert(!/team_klaim_keanggotaan\(\s*p_/.test(sql), 'fungsinya tidak menerima parameter sama sekali')
  assert(/t\.owner_id <> auth\.uid\(\)/.test(sql), 'pemilik tidak menjadi anggota timnya sendiri')
}

// ── 3. STATUS TIDAK DINAIKKAN ───────────────────────────────────────
//
// Anggota yang masih 'diundang' atau sudah 'nonaktif' tetap begitu.
// Menaikkannya sendiri berarti memberi akses kepada orang yang belum atau
// sudah tidak disetujui pemiliknya.
{
  assert(!/set[\s\S]{0,120}status\s*=\s*'aktif'/.test(sql), "status tidak pernah dinaikkan jadi 'aktif'")
  const dml = sql.slice(sql.indexOf('create or replace function public.team_klaim_keanggotaan'))
  assert(!/delete\s+from/i.test(dml), 'tidak ada yang dihapus')
}

// ── 4. Tiap DML punya WHERE ─────────────────────────────────────────
//
// Supabase memuat `safeupdate` untuk peran authenticator: UPDATE tanpa WHERE
// ditolak, dan seluruh pemanggilan gagal.
{
  const re = /\b(delete\s+from|update)\s+(?:only\s+)?([a-zA-Z_][\w.]*)/gi
  let m, pelanggaran = 0
  while ((m = re.exec(sql)) !== null) {
    const sisa = sql.slice(m.index)
    const titik = sisa.indexOf(';')
    if (!/\bwhere\b/i.test(titik > 0 ? sisa.slice(0, titik) : sisa)) pelanggaran++
  }
  assert(pelanggaran === 0, 'tidak ada UPDATE/DELETE tanpa WHERE')
}

// ── 5. Hak panggil dibatasi ─────────────────────────────────────────
{
  assert(/revoke all on function public\.team_klaim_keanggotaan\(\) from public/.test(sql), 'dicabut dari public')
  assert(/grant execute on function public\.team_klaim_keanggotaan\(\) to authenticated/.test(sql),
    'hanya yang sudah login')
  assert(!/to anon/.test(sql), 'tidak pernah untuk anon')
}

// ── 6. Aplikasi memanggilnya, dan SEBELUM membaca daftar ────────────
//
// Anggota yang baru pertama kali masuk belum punya keanggotaan yang terbaca,
// jadi daftarnya akan kosong — dan layar berikutnya menampilkan "belum ada"
// untuk sesuatu yang sebenarnya sudah ada sejak awal.
{
  const t = tanpaKomentarTs(readFileSync(join(akarSrc, 'lib/teamApi.ts'), 'utf8'))
  assert(/rpc\/team_klaim_keanggotaan/.test(t), 'aplikasi memanggil fungsinya')
  const iMyWs = t.indexOf('async myWorkspaces()')
  const potong = t.slice(iMyWs, iMyWs + 400)
  assert(/klaimKeanggotaan\(\)/.test(potong), 'dipanggil di dalam myWorkspaces')
  assert(potong.indexOf('klaimKeanggotaan()') < potong.indexOf('rpc/my_workspaces'),
    'dipanggil SEBELUM daftarnya dibaca')
  // Kegagalannya tidak menghentikan apa pun — daftar workspace tetap tampil
  // walau migrasinya belum dijalankan. Yang berubah sejak diagnosa akses
  // ditambahkan: SEBABNYA ikut dibawa keluar, bukan lagi dilebur jadi angka
  // nol. "Fungsinya belum ada" dan "tidak ada yang perlu diikat" sama-sama
  // nol baris, dan hanya yang pertama yang bisa diperbaiki dengan migrasi.
  const badan = t.slice(t.indexOf('async klaimKeanggotaan()'))
  assert(/catch \{[\s\S]{0,200}return \{ terikat: 0, adaFungsi: true \}/.test(badan),
    'galat jaringan ditelan, dan TIDAK dianggap bukti fungsinya tidak ada')
  assert(!/throw/.test(badan.slice(0, badan.indexOf('},'))),
    'tidak pernah melempar — pemanggilnya hanya membaca daftar workspace')
}

console.log(`klaim-keanggotaan: ${ok} assert lulus`)
