import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PLAN_PRICES: Record<string, number> = {
  starter: 149000,
  pro: 399000,
  enterprise: 999000,
  // Add-on prices fallback (will be overridden by DB value if available)
  addon_fs: 75000,
  addon_cost: 50000,
};

const ADDON_TYPES = ['addon_fs', 'addon_cost'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for React frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { plan_id, months = 1, invoice_id, total_idr, gross_amount } = req.body;

  if (!plan_id) {
    return res.status(400).json({ message: 'plan_id is required' });
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.VITE_MIDTRANS_SERVER_KEY;
  if (!serverKey || serverKey.startsWith('isi_')) {
    return res.status(500).json({ message: 'Server key Midtrans belum dikonfigurasi di environment variables Vercel.' });
  }

  // Auto-detect production environment based on key prefix or env var
  const isProd = process.env.MIDTRANS_ENV === 'production' || process.env.VERCEL_ENV === 'production' || !serverKey.startsWith('SB-');
  
  const midtransUrl = isProd
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  // Authorization header Base64(SERVER_KEY + ":")
  const authString = Buffer.from(`${serverKey}:`).toString('base64');
  // orderId must be <= 50 chars for Midtrans. UUID(36) + '_' + timestamp(13) = 50 chars exactly.
  const orderId = invoice_id ? `${invoice_id}_${Date.now()}` : `MANUAL_${Date.now()}`;

  // For add-on types, read price from DB if available
  let basePrice = PLAN_PRICES[plan_id] ?? 149000;

  if (ADDON_TYPES.includes(plan_id) && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const settingKey = plan_id === 'addon_fs' ? 'addon_fs_price' : 'addon_cost_price';
      const { data } = await supabase.from('app_settings').select('value').eq('key', settingKey).maybeSingle();
      if (data?.value && typeof data.value === 'number') basePrice = data.value;
    } catch { /* use fallback */ }
  }

  // Add-on purchases are one-time (no months multiplier, no discount, no PPN)
  let grossAmount: number;
  if (ADDON_TYPES.includes(plan_id)) {
    grossAmount = total_idr || gross_amount || basePrice;
  } else {
    // If total_idr is passed by frontend, trust it (frontend already calculated PPN properly)
    if (total_idr || gross_amount) {
      grossAmount = total_idr || gross_amount;
    } else {
      let subtotal = basePrice * Number(months);
      if (Number(months) === 3) subtotal = Math.round(subtotal * 0.90);
      if (Number(months) === 12) subtotal = Math.round(subtotal * 0.80);
      
      let ppnRate = 0.11; // Fallback
      if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
          const { data } = await supabase.from('app_settings').select('value').eq('key', 'ppn_rate').maybeSingle();
          if (data?.value !== undefined) ppnRate = Number(data.value);
        } catch { /* use fallback */ }
      }
      const ppn = Math.round(subtotal * ppnRate);
      grossAmount = subtotal + ppn;
    }
  }

  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    item_details: [
      {
        id: plan_id,
        price: grossAmount,
        quantity: 1,
        name: plan_id === 'addon_fs'
          ? 'PropFS - Tambah 1 Slot Proyek Feasibility Study'
          : plan_id === 'addon_cost'
          ? 'PropFS - Tambah 1 Slot Proyek Cost Control'
          : `PropFS - Paket ${plan_id.charAt(0).toUpperCase() + plan_id.slice(1)} (${months} Bulan)`,
      },
    ],
    usage_limit: 1,
    expiry: {
      duration: 1,
      unit: 'days',
    },
  };

  try {
    const response = await fetch(midtransUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = Array.isArray(data.error_messages) ? data.error_messages.join(', ') : 'Midtrans error';
      throw new Error(errMsg);
    }

    return res.status(200).json({
      snapToken: data.token,
      orderId: orderId,
    });
  } catch (error: any) {
    console.error('[Midtrans] Failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}
