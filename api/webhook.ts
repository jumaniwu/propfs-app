import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const {
      order_id = '',
      status_code = '',
      gross_amount = '',
      signature_key = '',
      transaction_status = '',
    } = body;

    // 1. Verify Signature for security
    const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.VITE_MIDTRANS_SERVER_KEY;
    if (!serverKey) return res.status(500).json({ message: 'Server key not configured' });
    
    // For Midtrans "Test notification URL", they might not send a valid signature.
    // If order_id is empty or it's a test payload, we might just return 200 OK to satisfy their ping.
    if (!order_id || String(order_id).startsWith('payment_notif_test')) {
       return res.status(200).json({ status: 'OK', message: 'Test ping received' });
    }

    const hashed = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
      .digest('hex');

    if (hashed !== signature_key) {
      return res.status(403).json({ message: 'Invalid signature' });
    }

    // Initialize Supabase lazily
    if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Webhook] Missing Supabase environment variables');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 2. Handle status updates
    let invoiceId: string = '';
    const orderParts = String(order_id).split('_');
    if (orderParts.length >= 4 && orderParts[0] === 'pck' && orderParts[1] === 'inv') {
      invoiceId = orderParts[2];
    } else {
      invoiceId = orderParts[0];
    }
    
    console.log(`[Webhook] Processing order_id=${order_id}, resolved invoiceId=${invoiceId}, status=${transaction_status}`);

    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: 'bank_transfer' })
        .or(`midtrans_order_id.eq.${order_id},id.eq.${invoiceId}`)
        .select()
        .single();

      if (invError) {
        console.error('Invoice update error:', invError);
        return res.status(500).json({ message: 'Database error', error: invError.message });
      }

      if (invoice) {
        // ── Add-on: increment project slot instead of creating subscription ──
        if (invoice.plan_id === 'addon_fs') {
          await supabase.rpc('increment_addon_slots', { uid: invoice.user_id, slot_col: 'addon_fs_slots' });
          console.log(`[Webhook] FS addon slot added for user ${invoice.user_id}`);
        } else if (invoice.plan_id === 'addon_cost') {
          await supabase.rpc('increment_addon_slots', { uid: invoice.user_id, slot_col: 'addon_cost_slots' });
          console.log(`[Webhook] Cost addon slot added for user ${invoice.user_id}`);
        } else {
          // ── Regular subscription plan ──
          // Calculate duration based on invoice period
          const periodStart = new Date(invoice.period_start).getTime();
          const periodEnd = new Date(invoice.period_end).getTime();
          const durationMs = periodEnd - periodStart;
          
          const now = new Date();
          const expiresAt = new Date(now.getTime() + durationMs);

          await supabase.from('subscriptions').upsert({
            user_id: invoice.user_id,
            plan_id: invoice.plan_id,
            status: 'active',
            started_at: now.toISOString(),
            expired_at: expiresAt.toISOString(),
            midtrans_order_id: order_id,
          }, { onConflict: 'user_id' });
        }
        console.log(`[Webhook] Invoice ${invoiceId} marked as PAID.`);
      }
    } else if (transaction_status === 'expire' || transaction_status === 'cancel') {
      await supabase.from('invoices').update({ status: 'expired' }).eq('id', invoiceId);
    }

    return res.status(200).json({ status: 'OK' });
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    return res.status(500).json({ message: 'Internal Server Error', details: err.message });
  }
}
