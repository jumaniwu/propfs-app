// ============================================================
// PropFS — Edge Function: buat akun anggota tim
// Super admin perusahaan (pemilik workspace) membuat User ID + password
// untuk karyawannya. Pembuatan akun butuh service_role, jadi TIDAK boleh
// dilakukan dari browser — karena itu dikerjakan di sini.
//
// Deploy:  supabase functions deploy create-team-user
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

interface Body {
  email: string
  password: string
  nama: string
  jabatan: string
  no_wa?: string
  role: string
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

    // ── 2. Validasi masukan ────────────────────────────────────────────────
    const body = await req.json() as Body
    const email = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''
    const nama = (body.nama ?? '').trim()
    const jabatan = (body.jabatan ?? '').trim()
    const noWa = (body.no_wa ?? '').trim()
    const role = ROLES.includes(body.role) ? body.role : 'viewer'

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonRes({ error: 'Email tidak valid.' }, 400)
    if (password.length < 8) return jsonRes({ error: 'Password minimal 8 karakter.' }, 400)
    if (nama.length < 2) return jsonRes({ error: 'Nama wajib diisi.' }, 400)
    if (jabatan.length < 2) return jsonRes({ error: 'Jabatan wajib diisi.' }, 400)
    if (noWa.length < 8) return jsonRes({ error: 'Nomor WhatsApp wajib diisi.' }, 400)

    const admin = createClient(url, serviceKey)

    // ── 3. Cegah duplikat di workspace yang sama ───────────────────────────
    const { data: sudahAda } = await admin
      .from('team_members').select('id')
      .eq('owner_id', pemilik.id).eq('member_email', email).maybeSingle()
    if (sudahAda) return jsonRes({ error: 'Email ini sudah terdaftar di tim Anda.' }, 409)

    // ── 4. Buat akun (atau pakai akun yang sudah ada di PropFS) ────────────
    let memberId: string | null = null
    const { data: dibuat, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: nama, jabatan, phone: noWa, created_by_team: pemilik.id },
    })

    if (createErr) {
      const pesan = String(createErr.message ?? '')
      const sudahTerdaftar = /already|registered|exists/i.test(pesan)
      if (!sudahTerdaftar) return jsonRes({ error: `Gagal membuat akun: ${pesan}` }, 400)
      // Akun PropFS sudah ada → cukup tautkan ke tim (password tidak diubah)
      const { data: daftar } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      memberId = daftar?.users?.find(u => (u.email ?? '').toLowerCase() === email)?.id ?? null
      if (!memberId) return jsonRes({ error: 'Email sudah dipakai akun lain dan tidak dapat ditautkan.' }, 409)
    } else {
      memberId = dibuat.user?.id ?? null
    }
    if (!memberId) return jsonRes({ error: 'Akun tidak terbentuk.' }, 500)

    // ── 5. Lengkapi profil & daftarkan sebagai anggota tim ─────────────────
    await admin.from('profiles').upsert({
      id: memberId, email, full_name: nama, phone: noWa, is_active: true,
    }, { onConflict: 'id' })

    const { data: anggota, error: teamErr } = await admin.from('team_members').insert({
      owner_id: pemilik.id, member_user_id: memberId, member_email: email,
      nama, jabatan, no_wa: noWa, role, status: 'aktif',
      joined_at: new Date().toISOString(),
    }).select().single()

    if (teamErr) return jsonRes({ error: `Gagal menyimpan anggota: ${teamErr.message}` }, 400)

    return jsonRes({
      ok: true,
      member: anggota,
      sudah_punya_akun: !!createErr,   // true = akun lama, password tidak diubah
    })
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
