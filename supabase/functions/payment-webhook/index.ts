// ==============================================================================
// PropFS Supabase Edge Function: Webhook Payment & Email Receipt
// ==============================================================================
// Deploy via: supabase functions deploy payment-webhook --no-verify-jwt
//
// Required Secrets:
// - RESEND_API_KEY (re_anGjs5XZ_BkYH9EF28K3RdzFoHfKDo69w)
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// ==============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// Setup your from_email later when the domain is verified on Resend:
const FROM_EMAIL = 'PropFS Finance <hello@propfs.id>' 

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    
    // Check if the webhook comes from Supabase Database Webhook (invoices table)
    // Structure: body.type = 'UPDATE', body.record = { id, status: 'paid', ... }
    if (body.type === 'UPDATE' && body.table === 'invoices') {
      const oldRecord = body.old_record
      const newRecord = body.record

      // Only trigger if status changed from something else TO 'paid'
      if (oldRecord.status !== 'paid' && newRecord.status === 'paid') {
        
        // 1. Setup Supabase Client to fetch User Email
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Get User Email
        const { data: userAuth, error: authError } = await supabase.auth.admin.getUserById(newRecord.user_id)
        if (authError || !userAuth?.user?.email) throw new Error('User not found')
        
        const userEmail = userAuth.user.email
        
        // 3. Format Currency
        const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })
        const totalIdr = formatter.format(newRecord.total_idr)
        
        // 4. Construct Email HTML
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; color: #1a1a2e; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #C9A84C; margin: 0; font-size: 28px;">PropFS</h1>
              <p style="color: #666; margin-top: 5px;">Pembayaran Anda Berhasil</p>
            </div>
            
            <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
               <h2 style="margin-top: 0;">Detail Invoice</h2>
               <p><strong>No. Invoice:</strong> ${newRecord.invoice_number}</p>
               <p><strong>Paket:</strong> ${newRecord.plan_id.toUpperCase()}</p>
               <p><strong>Total Bayar:</strong> ${totalIdr} (Termasuk PPN)</p>
               <p><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">LUNAS ✅</span></p>
            </div>
            
            <p>Halo,</p>
            <p>Terima kasih telah melakukan pembayaran untuk layanan <strong>PropFS</strong>. Akun dan seluruh modul Anda kini telah aktif kembali.</p>
            <p>Anda dapat mengunduh salinan invoice resmi di dalam Dashboard Anda.</p>
            
            <a href="https://app.propfs.id/home" style="display: inline-block; background: #0f172a; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; margin-top: 20px;">
              Akses Dashboard
            </a>
            
            <div style="margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
              &copy; ${new Date().getFullYear()} PT. Mettaland Batam Sukses<br/>
              Pesan ini dibuat secara otomatis, mohon tidak dibalas.
            </div>
          </div>
        `

        // 5. Send via Resend
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
             from: FROM_EMAIL,
             to: [userEmail],
             subject: `🎉 Pembayaran Berhasil - Invoice ${newRecord.invoice_number}`,
             html: htmlContent
          })
        })

        if (!emailRes.ok) {
           const errRes = await emailRes.json()
           console.error('Failed to send email via Resend:', errRes)
           throw new Error('Resend API error')
        }

        return new Response(JSON.stringify({ message: "Receipt sent successfully" }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ message: 'Ignored webhook payload' }), { status: 200 })
    
  } catch (error: any) {
    console.error('Webhook Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
