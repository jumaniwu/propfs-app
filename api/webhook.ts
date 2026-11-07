// Sengaja TIDAK ada jalan mundur ke nama berawalan VITE_.
//
// Setiap variabel berawalan VITE_ disisipkan Vite ke dalam bundel yang diunduh
// setiap pengunjung. Menerimanya di sini membuat nama yang berbahaya itu
// tampak sah — dan begitu seseorang memakainya, rahasianya langsung terbaca
// publik tanpa satu pun tanda. Kunci Gemini sudah pernah bocor persis begitu,
// dipakai orang lain, dan project-nya disuspend Google.
//
// ── Notifikasi pembayaran Midtrans ──────────────────────────────────────────
//
// Tanda tangannya diperiksa di sini; seluruh keputusan sesudahnya — berapa
// yang harus dibayar, paket apa yang diaktifkan, apakah sudah pernah
// diproses — ada di api/_lib/aktivasi.ts, yang juga dipakai
// /api/verifikasi-bayar. Satu tempat, supaya dua jalur tidak pernah memutus
// pembayaran yang sama dengan cara yang berbeda.
//
// Versi sebelumnya mengaktifkan langganan lewat
// `upsert(..., { onConflict: 'user_id' })`, padahal subscriptions tidak punya
// kunci unik pada user_id saja — hanya (user_id, product) bersyarat. Upsert
// itu ditolak database, hasilnya tidak diperiksa, dan invoice berubah lunas
// sementara paketnya tidak pernah aktif.

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { aktifkan, dbDariSupabase, urlSupabase } from './_lib/aktivasi.js';

/** Perbandingan waktu-konstan; string kosong tidak pernah cocok. */
function samaPersis(a: string, b: string): boolean {
  // Panjang dibandingkan dalam BYTE: timingSafeEqual melempar galat bila
  // panjang byte-nya berbeda, dan tanda tangan kiriman bisa berisi apa saja.
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

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
      fraud_status = '',
      payment_type = '',
    } = body;

    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return res.status(500).json({ message: 'Server key not configured' });

    // Ping "Test notification URL" dari dashboard Midtrans: dijawab OK tanpa
    // mengubah apa pun.
    if (!order_id || String(order_id).startsWith('payment_notif_test')) {
      return res.status(200).json({ status: 'OK', message: 'Test ping received' });
    }

    const hashed = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
      .digest('hex');
    if (!samaPersis(hashed, String(signature_key))) {
      return res.status(403).json({ message: 'Invalid signature' });
    }

    const kunciServis = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!kunciServis) {
      console.error('[Webhook] SUPABASE_SERVICE_ROLE_KEY belum disetel');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const supabase = createClient(urlSupabase(process.env), kunciServis);
    const db = dbDariSupabase(supabase);

    const lunas = transaction_status === 'settlement'
      || (transaction_status === 'capture' && (!fraud_status || fraud_status === 'accept'));

    if (lunas) {
      const hasil = await aktifkan(db, {
        orderId: String(order_id),
        dibayar: Number(gross_amount),
        metode: String(payment_type || 'midtrans'),
      });
      console.log(`[Webhook] order_id=${order_id} → ${hasil.status}: ${hasil.pesan}`);
      // Midtrans hanya perlu tahu notifikasinya diterima. Keadaan yang perlu
      // ditinjau sudah tercatat di invoice-nya; mengembalikan galat hanya
      // membuat Midtrans mengirim ulang hal yang sama berkali-kali.
      return res.status(200).json({ status: 'OK', hasil: hasil.status });
    }

    if (transaction_status === 'expire' || transaction_status === 'cancel') {
      const inv = await db.cariInvoice(String(order_id));
      // Invoice yang SUDAH lunas tidak pernah dikembalikan menjadi kedaluwarsa.
      // Notifikasi lama untuk transaksi yang gagal bisa datang sesudah
      // pembayaran berikutnya berhasil.
      if (inv) {
        await supabase.from('invoices').update({ status: 'expired' })
          .eq('id', inv.id).neq('status', 'paid');
      }
    }

    return res.status(200).json({ status: 'OK' });
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
