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
  const serverKey = process.env.VITE_MIDTRANS_SERVER_KEY!;
  const hashed = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex');

  if (hashed !== signature_key) {
    return res.status(403).json({ message: 'Invalid signature' });
  }

  // 2. Handle status updates
  // Format order_id is assumed to be "INV-{invoice_id}-{timestamp}"
  const invoiceId = order_id.split('-')[1];

  if (transaction_status === 'settlement' || transaction_status === 'capture') {
    // A. Update Invoice Status
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoiceId)
      .select()
      .single();

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
