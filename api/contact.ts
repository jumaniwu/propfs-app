// ============================================================
// PropFS — Vercel Serverless: Contact Form via Resend
// POST /api/contact
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, message } = req.body ?? {}

  // Validate inputs
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Semua field wajib diisi (nama, email, pesan).' })
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Format email tidak valid.' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY

  if (!RESEND_API_KEY) {
    console.error('[contact] Missing RESEND_API_KEY env var')
    return res.status(500).json({ error: 'Server email tidak terkonfigurasi.' })
  }

  try {
    const payload = {
      // Using resend.dev as from address because domain propfs.id is not verified yet
      // Once domain is verified at resend.com/domains, change to: noreply@propfs.id
      from: 'PropFS Contact Form <onboarding@resend.dev>',
      // Email goes to the Resend account owner's email until domain is verified
      to: ['propfs.id@gmail.com'],
      reply_to: email,
      subject: `[PropFS] Pesan Baru dari ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
          <div style="background: #0f172a; padding: 32px; border-radius: 16px; margin-bottom: 24px; text-align: center;">
            <h1 style="color: #f59e0b; font-size: 28px; margin: 0; letter-spacing: -0.5px;">PropFS</h1>
            <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0; font-size: 13px;">Contact Form Notification</p>
          </div>
          <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0f172a; font-size: 20px; margin: 0 0 24px; font-weight: 800;">Pesan Baru Masuk 📬</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px; background: #f8fafc; border-radius: 8px 8px 0 0; font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid #e2e8f0;">Nama</td>
                <td style="padding: 12px; background: #f8fafc; border-radius: 8px 8px 0 0; border-bottom: 1px solid #e2e8f0;"></td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 12px 16px; font-size: 16px; font-weight: 700; color: #0f172a;">${name}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 12px 16px; background: #f8fafc; font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">Email</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 12px 16px;">
                  <a href="mailto:${email}" style="color: #f59e0b; font-weight: 700; font-size: 15px; text-decoration: none;">${email}</a>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 12px 16px; background: #f8fafc; font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">Pesan</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 16px; font-size: 15px; color: #334155; line-height: 1.7; border-bottom: 1px solid #e2e8f0;">${message.replace(/\n/g, '<br/>')}</td>
              </tr>
            </table>
            <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 12px; border: 1px solid #fde68a;">
              <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 600;">
                💡 Balas langsung ke email pengirim: <a href="mailto:${email}" style="color: #d97706; font-weight: 800;">${email}</a>
              </p>
            </div>
          </div>
          <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">
            Email ini dikirim dari form kontak di <a href="https://propfs.id" style="color: #f59e0b;">propfs.id</a>
          </p>
        </div>
      `
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('[contact] Resend error:', resendData)
      throw new Error(resendData.message || 'Gagal mengirim email.')
    }

    return res.status(200).json({ success: true, id: resendData.id })
  } catch (err: any) {
    console.error('[contact] Error:', err.message)
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan server.' })
  }
}
