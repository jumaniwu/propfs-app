import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAN_PRICES: Record<string, number> = {
  starter: 149000,
  pro: 399000,
  enterprise: 999000,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { plan_id, months = 1, invoice_id } = req.body;

  // 1. Get/Create Invoice (If not provided, we might need to find current pending)
  let invoice;
  if (invoice_id) {
    const { data } = await supabase.from('invoices').select('*').eq('id', invoice_id).single();
    invoice = data;
  }

  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  // 2. Prepare Midtrans Payload
  const serverKey = process.env.VITE_MIDTRANS_SERVER_KEY!;
  const authString = Buffer.from(`${serverKey}:`).toString('base64');
  const isProd = process.env.VITE_MIDTRANS_ENV === 'production';
  const midtransUrl = isProd 
    ? 'https://app.midtrans.com/snap/v1/transactions' 
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  const orderId = `INV-${invoice.id}-${Date.now()}`;
  
  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: invoice.total_idr,
    },
    item_details: [
      {
        id: plan_id,
        price: invoice.total_idr,
        quantity: 1,
        name: `PropFS Subscription - ${plan_id.toUpperCase()}`,
      },
    ],
    usage_limit: 1,
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
    if (!response.ok) throw new Error(data.error_messages?.[0] || 'Midtrans error');

    return res.status(200).json({
      snapToken: data.token,
      orderId: orderId,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}
