// ============================================================
// PropFS — Supabase Edge Function: Send Auto Emails via Resend
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ReqBody {
  type: 'welcome' | 'receipt' | 'renewal_reminder' | 'spk_sign'
  email_to: string
  payload: any // e.g., name, invoice_id, etc.
}

/** Isian dari luar TIDAK pernah masuk mentah ke HTML email. */
const esc = (v: unknown): string => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Subjek email: satu baris, tidak berujung panjang. */
const subjek = (v: unknown): string => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, 80)

/** Perbandingan waktu-konstan untuk kunci servis. */
function samaPersis(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let beda = 0
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return beda === 0
}

/**
 * Situs resmi untuk tautan di dalam email.
 *
 * Tautan TIDAK PERNAH diambil apa adanya dari permintaan. Yang diambil hanya
 * tokennya; asal situsnya selalu situs resmi.
 */
const SITUS = (Deno.env.get('SITUS_PUBLIK') ?? 'https://propfs.id').replace(/\/+$/, '')

function tautanSpk(link: unknown): string | null {
  const m = String(link ?? '').match(/\/(?:s|spk\/sign)\/([A-Za-z0-9]{8,64})\/?(?:[?#].*)?$/)
  return m ? `${SITUS}/s/${m[1]}` : null
}

const balas = (status: number, isi: unknown) => new Response(JSON.stringify(isi), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('Resend API key missing')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Siapa yang memanggil ────────────────────────────────────────────
    //
    // Kunci servis (server sendiri) boleh semua jenis; pengguna
    // yang login sungguhan HANYA boleh spk_sign — satu-satunya jenis yang
    // memang dikirim dari aplikasi. Kuitansi "LUNAS" dan email sambutan tidak
    // pernah dikirim dari browser, jadi tidak ada alasan membukanya.
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    const dariServer = samaPersis(bearer, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const body: ReqBody = await req.json()
    const JENIS = ['welcome', 'receipt', 'renewal_reminder', 'spk_sign']
    if (!JENIS.includes(body?.type)) return balas(400, { error: 'Jenis email tidak dikenal' })

    if (!dariServer) {
      const { data, error } = await supabaseAdmin.auth.getUser(bearer)
      if (error || !data?.user) return balas(401, { error: 'Harus login' })
      if (body.type !== 'spk_sign') return balas(403, { error: 'Jenis email ini hanya dikirim server' })
    }

    const kepada = String(body.email_to ?? '').trim()
    if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(kepada) || kepada.length > 254) {
      return balas(400, { error: 'Alamat email tidak sah' })
    }
    body.email_to = kepada

    // Seluruh isian di-escape SEKALI di sini, lalu templat memakai `p`.
    const mentah = (body.payload ?? {}) as Record<string, unknown>
    const p: Record<string, string> = {}
    for (const [k, v] of Object.entries(mentah)) p[k] = esc(v)

    let tautan = ''
    if (body.type === 'spk_sign') {
      const t = tautanSpk(mentah.link)
      if (!t) return balas(400, { error: 'Tautan SPK tidak sah' })
      tautan = t
    }
    let subject = ''
    let htmlContent = ''

    if (body.type === 'welcome') {
      subject = 'Selamat Datang di PropFS 🎉'
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Halo ${p.name || ''}, Selamat Datang!</h2>
          <p>Terima kasih telah mendaftar di PropFS. Kami siap membantu mempercepat analisa kelayakan proyek properti Anda.</p>
          <a href="https://propfs.id/home" style="display:inline-block; padding: 10px 20px; background: #1a1a2e; color: #C9A84C; text-decoration: none; border-radius: 5px;">Mulai Proyek Pertama</a>
        </div>
      `
    } else if (body.type === 'receipt') {
      subject = subjek(`[LUNAS] PropFS Invoice - ${mentah.invoice_number ?? ''}`)
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Pembayaran Berhasil Diterima ✅</h2>
          <p>Halo, terima kasih! Pembayaran untuk nomor invoice <strong>${p.invoice_number}</strong> sebesar <strong>Rp ${Number(p.amount).toLocaleString('id-ID')}</strong> telah lunas.</p>
          <p>Paket Anda kini telah diaktifkan sampai <strong>${p.period_end}</strong>.</p>
          <p>Klik tombol di bawah untuk melihat rincian Invoice atau unduh PDF via Profile Anda.</p>
          <a href="https://propfs.id/profile" style="display:inline-block; padding: 10px 20px; background: #C9A84C; color: #1a1a2e; text-decoration: none; border-radius: 5px;">Buka Profile</a>
        </div>
      `
    } else if (body.type === 'spk_sign') {
      subject = subjek(`SPK ${mentah.nomor ?? ''} — mohon tanda tangan digital`)
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; color:#1a2530;">
          <h2 style="color:#0D1B2A;">Surat Perintah Kerja untuk Anda 📄</h2>
          <p>Halo <strong>${p.vendor_name || ''}</strong>,</p>
          <p>Kami menerbitkan Surat Perintah Kerja berikut:</p>
          <table style="border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:4px 12px 4px 0; color:#666;">Nomor</td><td><strong>${p.nomor}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#666;">Proyek</td><td><strong>${p.project_name || '-'}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#666;">Nilai Kontrak</td><td><strong>Rp ${Number(p.nilai || 0).toLocaleString('id-ID')}</strong></td></tr>
          </table>
          <p>Mohon baca dan tanda tangani secara <strong>digital</strong> melalui tombol di bawah — cukup dibuka dari HP, tanda tangan menggunakan jari.</p>
          <a href="${tautan}" style="display:inline-block; padding: 12px 24px; background: #0D1B2A; color: #C9A84C; text-decoration: none; border-radius: 8px; font-weight:bold;">Baca &amp; Tandatangani SPK</a>
          <p style="color:#888; font-size:12px; margin-top:16px;">Jika tombol tidak berfungsi, salin link ini ke browser:<br/>${tautan}</p>
        </div>
      `
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from: 'PropFS <noreply@propfs.id>',
        to: [body.email_to],
        subject: subject,
        html: htmlContent
      })
    })

    const resendData = await resendRes.json()
    if (!resendRes.ok) throw new Error(resendData.message || 'Resend error')

    // Log the sent email
    await supabaseAdmin.from('email_logs').insert({
      email_to: body.email_to,
      email_type: body.type,
      subject: subject,
      status: 'sent',
      resend_message_id: resendData.id
    })

    return new Response(JSON.stringify({ status: 'ok', id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('Email API Error:', error)
    return balas(400, { error: 'Gagal mengirim email' })
  }
})
