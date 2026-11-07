// Sengaja TIDAK ada jalan mundur ke nama berawalan VITE_.
//
// Setiap variabel berawalan VITE_ disisipkan Vite ke dalam bundel yang diunduh
// setiap pengunjung. Menerimanya di sini membuat nama yang berbahaya itu
// tampak sah — dan begitu seseorang memakainya, rahasianya langsung terbaca
// publik tanpa satu pun tanda. Kunci Gemini sudah pernah bocor persis begitu,
// dipakai orang lain, dan project-nya disuspend Google.
//
// ── Memulai pembayaran ──────────────────────────────────────────────────────
//
// Nilai yang ditagih ke Midtrans diambil dari INVOICE DI DATABASE, dan
// invoice itu harus milik pemanggil serta nilainya harus menutup harga resmi
// paketnya. Versi sebelumnya menagih angka yang dikirim browser apa adanya —
// "frontend already calculated PPN properly" — tanpa memeriksa siapa
// pemanggilnya.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  dbDariSupabase, hargaResmiServer, cukup, bulanDariPeriode, penggunaDariToken,
  KUNCI_HARGA_ADDON, urlSupabase,
} from './_lib/aktivasi.js';

const ADDON_NAMES: Record<string, string> = {
  addon_fs: 'PropFS - Tambah 1 Slot Proyek Feasibility Study',
  addon_cost: 'PropFS - Tambah 1 Slot Proyek Kontraktor AI',
  addon_user: 'PropFS - Tambah 1 Pengguna Tim (1 Bulan)',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const env = process.env as Record<string, string | undefined>;

  const serverKey = env.MIDTRANS_SERVER_KEY;
  if (!serverKey || serverKey.startsWith('isi_')) {
    return res.status(500).json({ message: 'Server key Midtrans belum dikonfigurasi di environment variables Vercel.' });
  }
  const url = urlSupabase(env);
  const kunciServis = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kunciServis) {
    return res.status(500).json({ message: 'Server pembayaran belum dikonfigurasi.' });
  }

  // ── Siapa yang membayar ─────────────────────────────────────────────────
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const pengguna = await penggunaDariToken(token, env);
  if (!pengguna) return res.status(401).json({ message: 'Sesi login tidak sah. Masuk ulang lalu coba lagi.' });

  const invoiceId = String(req.body?.invoice_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    return res.status(400).json({
      message: 'Invoice belum tersimpan di server. Ulangi pembelian dari halaman Harga.',
    });
  }

  const sb = createClient(url, kunciServis);
  const { data: inv } = await sb.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!inv || inv.user_id !== pengguna) return res.status(404).json({ message: 'Invoice tidak ditemukan.' });
  if (inv.status === 'paid') return res.status(409).json({ message: 'Invoice ini sudah lunas.' });

  // ── Berapa yang ditagih ─────────────────────────────────────────────────
  const db = dbDariSupabase(sb);
  const resmi = hargaResmiServer(inv, await db.bacaSumberHarga());
  if (resmi === null) {
    return res.status(409).json({
      message: 'Paket ini belum bisa dibeli — tidak ada di katalog atau harganya belum diatur. Ulangi pembelian dari halaman Harga.',
    });
  }
  const total = Math.round(Number(inv.total_idr) || 0);
  if (total <= 0 || !cukup(total, resmi)) {
    console.warn(`[initiate-payment] invoice ${inv.id} bernilai ${total}, harga resmi ${resmi} — ditolak`);
    return res.status(409).json({
      message: 'Nilai invoice tidak sesuai harga paket saat ini. Ulangi pembelian dari halaman Harga.',
    });
  }

  const isProd = env.MIDTRANS_ENV === 'production' || env.VERCEL_ENV === 'production' || !serverKey.startsWith('SB-');
  const midtransUrl = isProd
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  const authString = Buffer.from(`${serverKey}:`).toString('base64');

  // UUID(36) + '_' + waktu(13) = 50 karakter, batas Midtrans.
  const orderId = `${inv.id}_${Date.now()}`;
  const planId = String(inv.plan_id);
  const bulan = bulanDariPeriode(inv.period_start, inv.period_end);

  const payload = {
    transaction_details: { order_id: orderId, gross_amount: total },
    item_details: [{
      id: planId,
      price: total,
      quantity: 1,
      name: ADDON_NAMES[planId]
        ?? `PropFS - Paket ${planId.charAt(0).toUpperCase() + planId.slice(1)}`
          + (planId in KUNCI_HARGA_ADDON ? '' : ` (${bulan} Bulan)`),
    }],
    usage_limit: 1,
    expiry: { duration: 1, unit: 'days' },
  };

  try {
    const response = await fetch(midtransUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${authString}` },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const errMsg = Array.isArray(data.error_messages) ? data.error_messages.join(', ') : 'Midtrans error';
      throw new Error(errMsg);
    }

    // Dicatat supaya /api/verifikasi-bayar bisa menanyakan transaksi ini ke
    // Midtrans. Kegagalannya tidak membatalkan pembayaran: webhook masih bisa
    // menemukan invoicenya dari bentuk order_id.
    const { error: errCatat } = await sb.from('invoices')
      .update({ midtrans_order_id: orderId }).eq('id', inv.id).neq('status', 'paid');
    if (errCatat) console.error('[initiate-payment] gagal mencatat order_id:', errCatat.message);

    return res.status(200).json({ snapToken: data.token, orderId });
  } catch (error: any) {
    console.error('[Midtrans] Failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}
