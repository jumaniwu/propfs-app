// ============================================================
// Pengamanan hak akses, data email, dan fungsi pengirim email — dijaga
// supaya tidak mundur.
//
// Migrasinya sudah DIJALANKAN SUNGGUHAN di PostgreSQL 16 terhadap tiruan
// Supabase (skema auth, peran anon/authenticated/service_role, kebijakan
// RLS persis produksi). Tes di sini menjaga bentuknya supaya tidak mundur,
// dan menguji langsung fungsi-fungsi pengaman yang bisa dijalankan di Node.
// ============================================================
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const baca = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = t => t.split('\n').filter(b => !/^\s*--/.test(b)).join('\n')

// ── 1. Penjaga kolom profil ─────────────────────────────────────────
{
  const sql = baca('supabase/migrations/migration_kunci_keamanan.sql')
  const kode = tanpaKomentar(sql)

  for (const k of ['role', 'custom_features', 'is_active', 'trial_started_at', 'trial_expires_at',
                   'is_trial_extended', 'addon_fs_slots', 'addon_cost_slots', 'addon_user_slots',
                   'kuota_fs', 'kuota_kontraktor', 'referral_code']) {
    assert(new RegExp(`'${k}'`).test(kode), `kolom ${k} dijaga`)
  }

  // Kolom yang SAH diubah sendiri tidak boleh ikut terkunci.
  for (const k of ['full_name', 'company', 'phone', 'total_projects_created']) {
    assert(!new RegExp(`'${k}'`).test(kode.match(/terjaga constant[\s\S]*?\];/)[0]),
      `${k} tidak ikut dikunci — ${k === 'total_projects_created'
        ? 'ia diubah RPC yang dipanggil browser atas nama pengguna' : 'pengguna memang boleh mengubahnya'}`)
  }

  assert(/to_jsonb\(new\)/.test(kode) && /to_jsonb\(old\)/.test(kode),
    'kolom dibandingkan lewat to_jsonb — NEW.x pada kolom yang tidak ada mematikan semua penyimpanan profil')
  assert(!/new\.(custom_features|addon_user_slots|kuota_fs|is_trial_extended)\b/i.test(kode),
    'tidak menyebut kolom opsional lewat NEW.x')

  assert(/if auth\.uid\(\) is null then\s+return new;/.test(kode),
    'tanpa identitas pengguna (webhook, cron, SQL Editor) tetap boleh')
  assert(/exists \(select 1 from profiles where id = auth\.uid\(\) and role = 'superadmin'\)/.test(kode),
    'status superadmin dibaca dari baris TERSIMPAN — dari NEW, percobaan naik pangkat meluluskan dirinya sendiri')
  assert(/if tg_op = 'INSERT' then\s+[\s\S]*?new\.role := 'user';/.test(kode),
    'profil baru selalu mulai sebagai user, apa pun yang dikirim')
  assert(/coalesce\(baru ->> 'trial_status', ''\) <> 'trial_expired'/.test(kode),
    'masa coba boleh diakhiri, tidak boleh dihidupkan kembali')
  assert(/\(lama ->> 'referred_by'\) is not null/.test(kode),
    "perujuk diisi sekali — dibaca dengan ->> karena -> menghasilkan 'null' jsonb yang BUKAN NULL")
  assert(/before insert or update on public\.profiles/.test(kode), 'berlaku untuk INSERT dan UPDATE')
  assert(/security definer set search_path = public/.test(kode), 'search_path dikunci')
  assert(/errcode = '42501'/.test(kode), 'ditolak sebagai insufficient_privilege, bukan galat acak')
}

// ── 2. RLS tabel yang terbuka ───────────────────────────────────────
{
  const kode = tanpaKomentar(baca('supabase/migrations/migration_kunci_keamanan.sql'))
  assert(/alter table public\.email_logs enable row level security/.test(kode), 'RLS email_logs dinyalakan')
  assert(/alter table public\.budget_configs enable row level security/.test(kode), 'RLS budget_configs dinyalakan')
  assert(/to_regclass\('public\.email_logs'\) is not null/.test(kode), 'tidak meledak bila tabelnya tidak ada')
  assert(/email_logs_superadmin_baca[\s\S]*?is_superadmin\(\)/.test(kode), 'superadmin tetap bisa membaca')
  assert(!/to (anon|public)\b/i.test(kode), 'tidak ada yang dibuka untuk anon')

  // Tidak ada satu pun yang menghapus data — permintaan pemilik yang berulang.
  assert(!/\b(drop\s+table|truncate|delete\s+from|drop\s+column)\b/i.test(kode), 'tidak ada perintah penghapus data')
  assert(!/drop\s+policy/i.test(kode), 'tidak ada kebijakan lama yang dibuang')
  assert(!/^\s*update\s/im.test(kode), 'tidak ada baris data yang diubah')
}

// ── 3. Tidak ada kunci Resend di berkas mana pun ────────────────────
//
// Repo ini PUBLIK. Kunci yang pernah tertempel tetap ada di riwayatnya —
// karena itu ia HARUS diganti di dashboard Resend; menghapusnya dari sini
// hanya mencegah yang berikutnya.
{
  const berkas = execSync('git ls-files', { cwd: new URL('..', import.meta.url).pathname })
    .toString().split('\n').filter(f => /\.(ts|tsx|js|mjs|json|sql|md|html|env|example|toml)$/.test(f))
  const pola = /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/
  const kena = berkas.filter(f => { try { return pola.test(baca(f)) } catch { return false } })
  assert(kena.length === 0, `tidak ada kunci berbentuk Resend di berkas yang dilacak: ${kena.join(', ')}`)
  assert(!existsSync(new URL('../api/send-otp.ts', import.meta.url)),
    '/api/send-otp sudah tidak ada — tidak dipanggil siapa pun, tapi tetap ter-deploy sebagai relai terbuka')
}

// ── 4. payment-webhook: rahasia wajib, isian di-escape ──────────────
{
  const ts = baca('supabase/functions/payment-webhook/index.ts')
  assert(/PAYMENT_WEBHOOK_SECRET/.test(ts), 'memakai rahasia bersama')
  assert(/rahasia\.length < 16[\s\S]{0,200}status: 503/.test(ts), 'gagal tertutup bila rahasianya belum dipasang')
  assert(/samaPersis\(req\.headers\.get\('x-propfs-webhook-secret'\)/.test(ts), 'header diperiksa waktu-konstan')
  assert(/\$\{esc\(newRecord\.invoice_number\)\}/.test(ts), 'nomor invoice di-escape')
  assert(!/\$\{newRecord\.invoice_number\}<\/p>/.test(ts), 'tidak ada lagi nomor invoice mentah di HTML')
  assert(!/error: error\.message/.test(ts), 'galat tidak membocorkan apakah user_id terdaftar')
}

// ── 5. send-email: identitas, jenis, dan tautan ─────────────────────
{
  const ts = baca('supabase/functions/send-email/index.ts')
  assert(/supabaseAdmin\.auth\.getUser\(bearer\)/.test(ts), 'pemanggil yang bukan server harus login sungguhan')
  assert(/if \(body\.type !== 'spk_sign'\) return balas\(403/.test(ts),
    'pengguna hanya boleh spk_sign — kuitansi LUNAS palsu tidak bisa dikirim dari browser')
  assert(!/body\.payload\./.test(ts), 'tidak ada isian mentah yang masuk templat')
  assert(/href="\$\{tautan\}"/.test(ts), 'tautan di email adalah tautan resmi hasil tautanSpk')
  assert(!/href="\$\{p\.link\}"/.test(ts), 'tautan dari permintaan tidak pernah dipakai apa adanya')

  // Fungsi pengamannya dijalankan langsung, bukan hanya dibaca bentuknya.
  const ambil = nama => ts.match(new RegExp(`(?:const|function) ${nama}[\\s\\S]*?\\n(?:\\}|\\s*\\.replace[^\\n]*\\n)`))[0]
  const Deno = { env: { get: () => undefined } }
  const js = [
    ts.match(/const esc = [\s\S]*?\.replace\(\/'\/g, '&#39;'\)/)[0],
    ts.match(/function samaPersis[\s\S]*?\n\}/)[0],
    ts.match(/const SITUS = [^\n]*/)[0],
    ts.match(/function tautanSpk[\s\S]*?\n\}/)[0],
  ].join('\n').replace(/: (string|unknown|boolean)( \| null)?/g, '')
  const { esc, samaPersis, tautanSpk } = new Function('Deno', `${js}; return { esc, samaPersis, tautanSpk }`)(Deno)

  assert(tautanSpk('https://propfs.id/s/K7M2P9QR4T6V') === 'https://propfs.id/s/K7M2P9QR4T6V', 'tautan sah tetap')
  assert(tautanSpk('https://halaman-tiruan.com/s/K7M2P9QR4T6V') === 'https://propfs.id/s/K7M2P9QR4T6V',
    'host tiruan DIGANTI situs resmi — penyerang tidak bisa memilih tujuan tautannya')
  assert(tautanSpk('http://localhost:5173/spk/sign/270d656e72ff460caf685899f4f3f11d')
    === 'https://propfs.id/s/270d656e72ff460caf685899f4f3f11d', 'tautan lama dari pratinjau/APK tetap terkirim, dengan situs resmi')
  assert(tautanSpk('https://halaman-tiruan.com/masuk') === null, 'tautan yang bukan SPK ditolak')
  assert(tautanSpk('javascript:alert(1)') === null, 'javascript: ditolak')
  assert(tautanSpk('https://propfs.id/s/AB12') === null, 'token terlalu pendek ditolak')
  assert(tautanSpk('https://propfs.id/s/K7M2P9QR"><img') === null, 'token berisi karakter HTML ditolak')
  assert(tautanSpk(undefined) === null, 'tanpa tautan tidak meledak')

  assert(esc('<a href="x">') === '&lt;a href=&quot;x&quot;&gt;', 'HTML di-escape')
  assert(esc(null) === '' && esc(undefined) === '', 'kosong jadi kosong, bukan "null"')

  assert(samaPersis('kunci-servis-panjang', 'kunci-servis-panjang'), 'kunci yang sama cocok')
  assert(!samaPersis('kunci-servis-panjanG', 'kunci-servis-panjang'), 'beda satu huruf ditolak')
  assert(!samaPersis('', ''), 'DUA STRING KOSONG TIDAK COCOK — kunci servis yang tak terpasang tidak boleh sama dengan bearer yang tak dikirim')
}

// ── 6. Endpoint server yang lain ────────────────────────────────────
{
  const cron = baca('api/cron-reminders.ts')
  // Komentar dibuang dulu: catatan di berkas itu SENGAJA mengutip kode lama.
  const cronKode = cron.split('\n').filter(b => !/^\s*\/\//.test(b)).join('\n')
  assert(!/if \(process\.env\.CRON_SECRET && /.test(cronKode), 'pemeriksaan yang terlewat bila rahasianya kosong sudah tidak ada')
  assert(/if \(process\.env\.CRON_SECRET && /.test(cron), 'alasannya tetap tercatat sebagai komentar')
  assert(/rahasiaCron\.length < 16[\s\S]{0,200}status\(503\)/.test(cron), 'cron gagal tertutup')

  const kontak = baca('api/contact.ts')
  assert(/const name = esc\(mentah\.name\)/.test(kontak) && /const message = esc\(mentah\.message\)/.test(kontak),
    'isian formulir kontak di-escape')
  assert(/\[\^\\s@<>"'\]\+@/.test(kontak), 'alamat email tidak boleh memuat karakter HTML')
}

// ── 7. Pemeriksa jejak pembobolan hanya membaca ─────────────────────
{
  const cek = tanpaKomentar(baca('supabase/migrations/CEK_KEAMANAN.sql'))
  assert(!/\b(insert|update|delete|drop|truncate|alter|create)\b/i.test(cek), 'CEK_KEAMANAN tidak mengubah apa pun')
  for (const kata of ['superadmin', 'tanpa invoice lunas', 'di bawah harga', 'Masa coba', 'custom_features', 'Slot add-on']) {
    assert(cek.includes(kata), `memeriksa jejak: ${kata}`)
  }
  assert(/to_jsonb\(p\) ->> 'trial_expires_at'/.test(cek), 'kolom opsional dibaca lewat to_jsonb')

  const mig = baca('supabase/migrations/CEK_MIGRASI.sql')
  assert(/migration_kunci_keamanan\.sql/.test(mig), 'CEK_MIGRASI mengenali migrasi ini')
}

console.log(`kunci-keamanan: ${ok} assert lulus`)
