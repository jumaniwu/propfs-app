// ============================================================
// PropFS — Edge Function: akun anggota tim
// Super admin perusahaan membuat User ID + password untuk karyawannya, dan
// bisa mengatur ulang password bila karyawan lupa. Keduanya butuh
// service_role, jadi TIDAK boleh dikerjakan dari browser.
//
// Anggota tim TIDAK memakai email pribadinya untuk login. Kombinasi
// Kode Perusahaan + username dipetakan ke email internal
//   <username>@<kode>.tim.propfs.id
// sehingga akun kerja tidak pernah bertabrakan dengan akun PropFS pribadi
// karyawan tersebut. Email asli tetap disimpan sebagai data kontak.
//
// Deploy:  supabase functions deploy create-team-user
// Setelan: matikan "Verify JWT" — fungsi ini memeriksa sesi sendiri.
// Rahasia: SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sudah otomatis tersedia.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const ROLES = ['pemilik', 'manajemen', 'keuangan', 'pm', 'pengawas', 'logistik', 'viewer']
const DOMAIN_TIM = 'tim.propfs.id'
const HURUF_KODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// Batas & harga bawaan bila admin belum mengaturnya di app_settings.
// Harus sama dengan src/lib/kuotaTim.ts.
const BATAS_ANGGOTA_DEFAULT = 5
const HARGA_SLOT_USER_DEFAULT = 50_000

interface Body {
  aksi?: 'buat' | 'reset'
  // aksi 'buat'
  username?: string
  email?: string          // email asli, untuk kontak — bukan untuk login
  password?: string
  nama?: string
  jabatan?: string
  no_wa?: string
  role?: string
  // aksi 'reset'
  member_id?: string
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Sama persis dengan normalUsername() di src/lib/teamLogin.ts. */
function normalUsername(input: string): string {
  return (input ?? '')
    .trim().toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 24)
    .replace(/[._-]+$/, '')
}
function usernameValid(u: string): boolean {
  return u.length >= 3 && /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(u)
}

/** Kode perusahaan pemilik; dibuatkan bila belum ada. */
// deno-lint-ignore no-explicit-any
async function kodePerusahaan(admin: any, ownerId: string): Promise<string> {
  const { data: profil } = await admin
    .from('company_profiles').select('kode').eq('user_id', ownerId).maybeSingle()
  if (profil?.kode) return profil.kode as string

  // buat kode acak yang belum dipakai perusahaan lain
  for (let coba = 0; coba < 12; coba++) {
    let kode = 'PFS-'
    for (let i = 0; i < 4; i++) kode += HURUF_KODE[Math.floor(Math.random() * HURUF_KODE.length)]
    const { data: bentrok } = await admin
      .from('company_profiles').select('user_id').eq('kode', kode).maybeSingle()
    if (bentrok) continue
    const { error } = await admin
      .from('company_profiles').upsert({ user_id: ownerId, kode }, { onConflict: 'user_id' })
    if (!error) return kode
  }
  throw new Error('Gagal membuat Kode Perusahaan. Coba lagi.')
}

/** Angka dari app_settings; nilainya bisa berupa JSON number maupun string. */
// deno-lint-ignore no-explicit-any
async function setelanAngka(admin: any, key: string, bawaan: number): Promise<number> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  const n = Math.floor(Number(String(data?.value ?? '').replace(/"/g, '')))
  return Number.isFinite(n) && n >= 0 ? n : bawaan
}

/**
 * Kuota pengguna tim perusahaan: batas dari paket + slot tambahan yang sudah
 * dibeli. Diperiksa di server karena batas yang hanya dijaga di antarmuka
 * bisa dilewati dengan memanggil fungsi ini langsung.
 */
// deno-lint-ignore no-explicit-any
async function periksaKuota(admin: any, ownerId: string): Promise<string | null> {
  const batasDasar = await setelanAngka(admin, 'max_team_users', BATAS_ANGGOTA_DEFAULT)
  const harga = await setelanAngka(admin, 'addon_user_price', HARGA_SLOT_USER_DEFAULT)

  const { data: profil } = await admin
    .from('profiles').select('addon_user_slots').eq('id', ownerId).maybeSingle()
  const tambahan = Math.max(0, Math.floor(Number(profil?.addon_user_slots ?? 0)) || 0)

  // Pengguna nonaktif tidak ikut dihitung — perusahaan boleh mengganti orang
  // tanpa harus membeli slot baru.
  const { count } = await admin
    .from('team_members').select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId).neq('status', 'nonaktif')

  const batas = batasDasar + tambahan
  if ((count ?? 0) < batas) return null
  return `Kuota pengguna tim sudah penuh (${batas} pengguna). `
    + `Beli slot tambahan Rp ${harga.toLocaleString('id-ID')} per pengguna per bulan, `
    + 'atau nonaktifkan pengguna yang tidak lagi dipakai.'
}

serve(async (req) => {
  // Preflight harus dijawab lebih dulu, sebelum pemeriksaan apa pun — kalau
  // tidak, browser melaporkan "Failed to fetch" tanpa pesan yang berguna.
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // ── 1. Pastikan pemanggil adalah pengguna yang login ───────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return jsonRes({ error: 'Tidak ada sesi login.' }, 401)

    // Token WAJIB dioper eksplisit ke getUser(). Tanpa argumen, supabase-js
    // membaca sesi miliknya sendiri — di Edge Function tidak ada sesi
    // tersimpan, sehingga pemeriksaan selalu gagal.
    const jwt = authHeader.slice('Bearer '.length).trim()
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user: pemilik }, error: authErr } = await asCaller.auth.getUser(jwt)
    if (authErr || !pemilik) {
      const sebab = authErr?.message ?? 'token tidak dikenali'
      return jsonRes({ error: `Sesi login tidak valid (${sebab}). Coba logout lalu login kembali.` }, 401)
    }

    const body = await req.json() as Body
    const admin = createClient(url, serviceKey)
    const password = body.password ?? ''

    // ── 2a. Atur ulang password anggota yang sudah ada ─────────────────────
    if (body.aksi === 'reset') {
      if (password.length < 8) return jsonRes({ error: 'Password minimal 8 karakter.' }, 400)

      const { data: anggota } = await admin
        .from('team_members').select('*')
        .eq('id', body.member_id ?? '').eq('owner_id', pemilik.id).maybeSingle()
      if (!anggota) return jsonRes({ error: 'Anggota tidak ditemukan di tim Anda.' }, 404)
      if (!anggota.member_user_id) return jsonRes({ error: 'Anggota ini belum punya akun login.' }, 400)

      const { error: updErr } = await admin.auth.admin
        .updateUserById(anggota.member_user_id, { password })
      if (updErr) return jsonRes({ error: `Gagal mengatur password: ${updErr.message}` }, 400)

      return jsonRes({ ok: true, member: anggota })
    }

    // ── 2b. Buat akun anggota baru ─────────────────────────────────────────
    const username = normalUsername(body.username ?? '')
    const emailAsli = (body.email ?? '').trim().toLowerCase()
    const nama = (body.nama ?? '').trim()
    const jabatan = (body.jabatan ?? '').trim()
    const noWa = (body.no_wa ?? '').trim()
    const role = ROLES.includes(body.role ?? '') ? body.role! : 'viewer'

    if (!usernameValid(username)) {
      return jsonRes({ error: 'User ID minimal 3 karakter, hanya huruf, angka, titik, strip, atau garis bawah.' }, 400)
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailAsli)) return jsonRes({ error: 'Email tidak valid.' }, 400)
    if (password.length < 8) return jsonRes({ error: 'Password minimal 8 karakter.' }, 400)
    if (nama.length < 2) return jsonRes({ error: 'Nama wajib diisi.' }, 400)
    if (jabatan.length < 2) return jsonRes({ error: 'Jabatan wajib diisi.' }, 400)
    if (noWa.length < 8) return jsonRes({ error: 'Nomor WhatsApp wajib diisi.' }, 400)

    // ── 3a. Kuota pengguna tim ─────────────────────────────────────────────
    const penuh = await periksaKuota(admin, pemilik.id)
    if (penuh) return jsonRes({ error: penuh, kuota_penuh: true }, 409)

    const kode = await kodePerusahaan(admin, pemilik.id)
    const loginEmail = `${username}@${kode.toLowerCase()}.${DOMAIN_TIM}`

    // ── 3. Cegah User ID kembar di perusahaan yang sama ────────────────────
    const { data: sudahAda } = await admin
      .from('team_members').select('id')
      .eq('owner_id', pemilik.id).ilike('username', username).maybeSingle()
    if (sudahAda) {
      return jsonRes({ error: `User ID "${username}" sudah dipakai di tim Anda. Pilih User ID lain.` }, 409)
    }

    // ── 4. Buat akun. Email internal tidak mungkin bentrok dengan akun
    //      pribadi siapa pun, jadi kegagalan di sini memang kesalahan nyata.
    const { data: dibuat, error: createErr } = await admin.auth.admin.createUser({
      email: loginEmail, password, email_confirm: true,
      user_metadata: {
        full_name: nama, jabatan, phone: noWa, email_kontak: emailAsli,
        akun_tim: true, kode_perusahaan: kode, created_by_team: pemilik.id,
      },
    })
    if (createErr || !dibuat?.user?.id) {
      const pesan = String(createErr?.message ?? 'akun tidak terbentuk')
      // Sisa akun dari percobaan sebelumnya yang gagal di tengah jalan.
      if (/already|registered|exists/i.test(pesan)) {
        return jsonRes({
          error: `User ID "${username}" pernah dibuat tapi tidak tercatat di daftar tim. `
            + 'Pilih User ID lain, atau hapus anggota lama lebih dulu.',
        }, 409)
      }
      return jsonRes({ error: `Gagal membuat akun: ${pesan}` }, 400)
    }
    const memberId = dibuat.user.id

    // ── 5. Lengkapi profil & daftarkan sebagai anggota tim ─────────────────
    await admin.from('profiles').upsert({
      id: memberId, email: emailAsli, full_name: nama, phone: noWa, is_active: true,
    }, { onConflict: 'id' })

    const { data: anggota, error: teamErr } = await admin.from('team_members').insert({
      owner_id: pemilik.id, member_user_id: memberId,
      member_email: emailAsli, username, login_email: loginEmail,
      nama, jabatan, no_wa: noWa, role, status: 'aktif',
      joined_at: new Date().toISOString(),
    }).select().single()

    if (teamErr) {
      // Jangan tinggalkan akun yatim yang tidak muncul di daftar tim.
      await admin.auth.admin.deleteUser(memberId).catch(() => {})
      return jsonRes({ error: `Gagal menyimpan anggota: ${teamErr.message}` }, 400)
    }

    return jsonRes({ ok: true, member: anggota, kode, login_email: loginEmail })
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
