import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Security check: Ensure this is called by Vercel Cron
  // You need to set CRON_SECRET in Vercel Environment Variables
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ message: 'Missing Supabase environment variables' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Calculate the date exactly 14 days from today
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    
    // Create start and end of that day to filter properly
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 2. Query subscriptions expiring in 14 days
    const { data: expiringSubs, error: subsError } = await supabase
      .from('subscriptions')
      .select('user_id, plan_id, expired_at, id')
      .eq('status', 'active')
      .gte('expired_at', startOfDay.toISOString())
      .lte('expired_at', endOfDay.toISOString());

    if (subsError) throw new Error(`Query Error: ${subsError.message}`);

    if (!expiringSubs || expiringSubs.length === 0) {
      return res.status(200).json({ message: 'No subscriptions expiring in 14 days.' });
    }

    // 3. Process each expiring subscription
    const results = [];
    for (const sub of expiringSubs) {
      // Get user email from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', sub.user_id)
        .single();

      if (!profile || !profile.email) {
        results.push({ user_id: sub.user_id, status: 'failed', reason: 'Email not found' });
        continue;
      }

      // Check if we already sent a reminder to prevent duplicates
      const { data: existingLog } = await supabase
        .from('email_logs')
        .select('id')
        .eq('user_id', sub.user_id)
        .eq('email_type', 'renewal_reminder')
        .gte('created_at', startOfDay.toISOString()) // Only check for today
        .maybeSingle();

      if (existingLog) {
        results.push({ user_id: sub.user_id, status: 'skipped', reason: 'Already sent today' });
        continue;
      }

      // 4. Send Email via Resend API
      // If RESEND_API_KEY is not set, we simulate the success (for testing/development)
      let emailStatus = 'sent';
      let messageId = 'simulated_id';

      const resendKey = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY;

      if (resendKey) {
        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #0f172a;">Pengingat Masa Aktif PropFS</h2>
            <p>Halo ${profile.full_name},</p>
            <p>Masa aktif paket <strong>${sub.plan_id.toUpperCase()}</strong> Anda akan berakhir dalam <strong>14 hari</strong> pada tanggal ${new Date(sub.expired_at).toLocaleDateString('id-ID')}.</p>
            <p>Pastikan Anda memperpanjang layanan agar proyek, RAB, dan data Cost Control Anda tetap dapat diakses tanpa hambatan.</p>
            <br>
            <a href="https://propfs.id/payment?plan_id=${sub.plan_id}" style="background-color: #d4af37; color: #111; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Perpanjang Sekarang</a>
            <br><br>
            <p>Terima kasih,<br>Tim PropFS</p>
          </div>
        `;

        try {
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendKey}`
            },
            body: JSON.stringify({
              from: 'PropFS <noreply@propfs.id>',
              to: profile.email,
              subject: 'Pemberitahuan: Paket PropFS Anda akan berakhir dalam 14 Hari',
              html: emailHtml
            })
          });

          const resendData = await resendResponse.json();
          if (!resendResponse.ok) {
            emailStatus = 'failed';
            console.error('Resend API Error:', resendData);
          } else {
            messageId = resendData.id;
          }
        } catch (err) {
          emailStatus = 'failed';
          console.error('Fetch to Resend failed:', err);
        }
      } else {
        console.log(`[SIMULATION] Sending reminder email to ${profile.email}`);
      }

      // 5. Log the email
      await supabase.from('email_logs').insert({
        user_id: sub.user_id,
        email_to: profile.email,
        email_type: 'renewal_reminder',
        subject: 'Pemberitahuan: Paket PropFS Anda akan berakhir dalam 14 Hari',
        status: emailStatus,
        resend_message_id: messageId,
      });

      results.push({ user_id: sub.user_id, email: profile.email, status: emailStatus });
    }

    return res.status(200).json({
      message: 'Cron execution completed',
      processed: results.length,
      details: results
    });

  } catch (err: any) {
    console.error('Cron error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
