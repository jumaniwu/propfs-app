// ============================================================
// PropFS — Verifikasi pembayaran, dipanggil aplikasi setelah pop-up Midtrans
//
// Pop-up Midtrans yang berkata "sukses" hanyalah kabar dari browser, dan
// kabar dari browser bisa dikarang. Endpoint ini tidak mempercayainya: ia
// bertanya LANGSUNG ke Midtrans dengan kunci server, lalu menyerahkan
// hasilnya ke modul aktivasi yang sama dengan yang dipakai webhook.
//
// Dengan begitu paket tetap aktif walaupun webhook Midtrans belum diatur
// atau terlambat — dan tidak pernah aktif hanya karena browser bilang begitu.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  aktifkan, dbDariSupabase, cekStatusMidtrans, sudahLunas, penggunaDariToken, idInvoiceDariOrder, urlSupabase,
} from './_lib/aktivasi.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const env = process.env as Record<string, string | undefined>
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  const pengguna = await penggunaDariToken(token, env)
  if (!pengguna) return res.status(401).json({ message: 'Sesi login tidak sah. Masuk ulang lalu coba lagi.' })

  const invoiceId = String(req.body?.invoice_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return res.status(400).json({ message: 'invoice_id tidak sah.' })

  const url = urlSupabase(env)
  const kunciServis = env.SUPABASE_SERVICE_ROLE_KEY
  const serverKey = env.MIDTRANS_SERVER_KEY
  if (!url || !kunciServis || !serverKey) {
    console.error('[verifikasi-bayar] konfigurasi server belum lengkap')
    return res.status(500).json({ message: 'Server pembayaran belum dikonfigurasi.' })
  }
  const sb = createClient(url, kunciServis)

  const { data: inv } = await sb.from('invoices')
    .select('id, user_id, status, midtrans_order_id').eq('id', invoiceId).maybeSingle()
  // Invoice orang lain dijawab SAMA dengan yang tidak ada — keberadaannya
  // bukan urusan penanya.
  if (!inv || inv.user_id !== pengguna) return res.status(404).json({ message: 'Invoice tidak ditemukan.' })
  if (inv.status === 'paid') return res.status(200).json({ status: 'paid', pesan: 'Pembayaran sudah tercatat.' })
  // Hanya transaksi yang dibuat untuk invoice INI: order_id-nya berawalan id
  // invoice tersebut. Kolom midtrans_order_id sendiri tidak cukup dipercaya.
  if (!inv.midtrans_order_id || idInvoiceDariOrder(inv.midtrans_order_id) !== String(inv.id).toLowerCase()) {
    return res.status(409).json({ message: 'Belum ada transaksi Midtrans untuk invoice ini.' })
  }

  let st
  try {
    st = await cekStatusMidtrans(inv.midtrans_order_id, serverKey, env)
  } catch (e) {
    console.error('[verifikasi-bayar] Midtrans tidak menjawab:', e)
    return res.status(502).json({ message: 'Midtrans belum bisa dihubungi. Paket akan aktif otomatis begitu pembayaran terkonfirmasi.' })
  }

  if (!sudahLunas(st)) {
    return res.status(200).json({
      status: st.transaction_status ?? 'unknown',
      pesan: st.transaction_status === 'pending'
        ? 'Menunggu pembayaran. Paket aktif otomatis setelah pembayaran diterima.'
        : 'Pembayaran belum berhasil.',
    })
  }

  const hasil = await aktifkan(dbDariSupabase(sb), {
    orderId: inv.midtrans_order_id,
    dibayar: Number(st.gross_amount),
    metode: st.payment_type || 'midtrans',
  })
  const kode = hasil.status === 'aktif' || hasil.status === 'sudah' ? 200 : 202
  return res.status(kode).json({ status: hasil.status === 'aktif' || hasil.status === 'sudah' ? 'paid' : hasil.status, pesan: hasil.pesan })
}
