import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Initialize Supabase (Admin role to bypass RLS)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Needs service_role for DB updates
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
  } = req.body;

  // 1. Verify Signature for security
  const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.VITE_MIDTRANS_SERVER_KEY;
  if (!serverKey) return res.status(500).json({ message: 'Server key not configured' });
  const hashed = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex');

  if (hashed !== signature_key) {
    return res.status(403).json({ message: 'Invalid signature' });
  }

  // 2. Handle status updates
  // Format order_id: "pck_inv_{invoiceId}_{timestamp}"
  // Contoh: "pck_inv_h2z04c3ru_1778664851544"
  // Kita perlu ambil bagian tengah setelah "pck_inv_" dan sebelum timestamp terakhir
  let invoiceId: string
  const orderParts = order_id.split('_')
  if (orderParts.length >= 4 && orderParts[0] === 'pck' && orderParts[1] === 'inv') {
    // Format: pck_inv_{id}_{timestamp} → ambil bagian ke-3
    invoiceId = orderParts[2]
  } else {
    // Fallback: ambil bagian pertama saja
    invoiceId = orderParts[0]
  }
  
  console.log(`[Webhook] Processing order_id=${order_id}, resolved invoiceId=${invoiceId}, status=${transaction_status}`)

  if (transaction_status === 'settlement' || transaction_status === 'capture') {
    // A. Update Invoice Status — coba match via midtrans_order_id dulu (lebih reliable)
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: 'bank_transfer' })
      .or(`midtrans_order_id.eq.${order_id},id.eq.${invoiceId}`)
      .select()
      .single()

    if (invError) {
      console.error('Invoice update error:', invError);
      return res.status(500).json({ message: 'Database error' });
    }

    // B. Create/Update Subscription
    // Plan duration logic: Pro is per month.
    const durationDays = invoice.plan_id === 'pro' ? 30 : 365; // Simple logic
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    await supabase.from('subscriptions').upsert({
      user_id: invoice.user_id,
      plan_id: invoice.plan_id,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      midtrans_order_id: order_id,
    }, { onConflict: 'user_id' });

    console.log(`[Webhook] Invoice ${invoiceId} marked as PAID.`);
  } else if (transaction_status === 'expire' || transaction_status === 'cancel') {
    await supabase.from('invoices').update({ status: 'expired' }).eq('id', invoiceId);
  }

  return res.status(200).json({ status: 'OK' });
}
