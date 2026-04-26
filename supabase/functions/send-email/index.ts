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
  type: 'welcome' | 'receipt' | 'renewal_reminder'
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
