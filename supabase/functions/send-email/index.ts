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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('Resend API key missing')
    
    // Check Auth (Service role or valid user)
    // Only internal systems or the user themselves should trigger this securely
    // In production, best to use triggers and invoke from DB using pg_net

    const body: ReqBody = await req.json()
    let subject = ''
    let htmlContent = ''

    if (body.type === 'welcome') {
      subject = 'Selamat Datang di PropFS 🎉'
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Halo ${body.payload.name || ''}, Selamat Datang!</h2>
          <p>Terima kasih telah mendaftar di PropFS. Kami siap membantu mempercepat analisa kelayakan proyek properti Anda.</p>
          <a href="https://propfs.id/home" style="display:inline-block; padding: 10px 20px; background: #1a1a2e; color: #C9A84C; text-decoration: none; border-radius: 5px;">Mulai Proyek Pertama</a>
        </div>
      `
    } else if (body.type === 'receipt') {
      subject = `[LUNAS] PropFS Invoice - ${body.payload.invoice_number}`
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Pembayaran Berhasil Diterima ✅</h2>
          <p>Halo, terima kasih! Pembayaran untuk nomor invoice <strong>${body.payload.invoice_number}</strong> sebesar <strong>Rp ${Number(body.payload.amount).toLocaleString('id-ID')}</strong> telah lunas.</p>
          <p>Paket Anda kini telah diaktifkan sampai <strong>${body.payload.period_end}</strong>.</p>
          <p>Klik tombol di bawah untuk melihat rincian Invoice atau unduh PDF via Profile Anda.</p>
          <a href="https://propfs.id/profile" style="display:inline-block; padding: 10px 20px; background: #C9A84C; color: #1a1a2e; text-decoration: none; border-radius: 5px;">Buka Profile</a>
        </div>
      `
    } else if (body.type === 'spk_sign') {
      subject = `SPK ${body.payload.nomor} — mohon tanda tangan digital`
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; color:#1a2530;">
          <h2 style="color:#0D1B2A;">Surat Perintah Kerja untuk Anda 📄</h2>
          <p>Halo <strong>${body.payload.vendor_name || ''}</strong>,</p>
          <p>Kami menerbitkan Surat Perintah Kerja berikut:</p>
          <table style="border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:4px 12px 4px 0; color:#666;">Nomor</td><td><strong>${body.payload.nomor}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#666;">Proyek</td><td><strong>${body.payload.project_name || '-'}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#666;">Nilai Kontrak</td><td><strong>Rp ${Number(body.payload.nilai || 0).toLocaleString('id-ID')}</strong></td></tr>
          </table>
          <p>Mohon baca dan tanda tangani secara <strong>digital</strong> melalui tombol di bawah — cukup dibuka dari HP, tanda tangan menggunakan jari.</p>
          <a href="${body.payload.link}" style="display:inline-block; padding: 12px 24px; background: #0D1B2A; color: #C9A84C; text-decoration: none; border-radius: 8px; font-weight:bold;">Baca &amp; Tandatangani SPK</a>
          <p style="color:#888; font-size:12px; margin-top:16px;">Jika tombol tidak berfungsi, salin link ini ke browser:<br/>${body.payload.link}</p>
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
