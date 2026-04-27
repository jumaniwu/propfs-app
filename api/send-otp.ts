export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { email, code, name } = await req.json();
    const apiKey = process.env.VITE_RESEND_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key Resend tidak ditemukan di Environment Variables' }), { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'PropFS Verification <noreply@propfs.id>',
        to: [email],
        subject: `${code} adalah kode verifikasi PropFS Anda`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            <h2 style="color: #1e293b;">Halo ${name},</h2>
            <p style="color: #475569; font-size: 16px;">Gunakan kode OTP di bawah ini untuk memverifikasi akun PropFS Anda:</p>
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #b45309;">${code}</span>
            </div>
            <p style="color: #94a3b8; font-size: 14px;">Kode ini hanya berlaku selama 10 menit.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} PropFS by PT. Mettaland Batam Sukses</p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), { 
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
