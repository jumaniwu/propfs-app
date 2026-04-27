// ============================================================
// PropFS — Invoice & Payment Helper (Frontend)
// ============================================================
import { supabase } from './supabase'
import { fetchPPNRate } from '../hooks/usePPNRate'

// ── Types ────────────────────────────────────────────────────
export interface Invoice {
  id: string
  invoice_number: string
  user_id: string
  plan_id: string
  period_start: string
  period_end: string
  subtotal_idr: number
  ppn_idr: number
  total_idr: number
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
  payment_method?: string
  midtrans_order_id?: string
  paid_at?: string
  created_at: string
}

// ── Plan Prices ──────────────────────────────────────────────
export const PLAN_PRICES_IDR: Record<string, number> = {
  starter:    149_000,
  pro:        399_000,
  enterprise: 999_000,
}

// ── Calculate invoice amounts (fetches live PPN from Supabase) ────
export async function calculateInvoice(planId: string, months: number = 1) {
  const basePrice = PLAN_PRICES_IDR[planId] ?? 0
  let subtotal = basePrice * months

  // Diskon untuk paket panjang
  if (months === 3)  subtotal = Math.round(subtotal * 0.90)  // 10% off
  if (months === 12) subtotal = Math.round(subtotal * 0.80)  // 20% off

  const ppnRate = await fetchPPNRate()
  const ppn     = Math.round(subtotal * ppnRate)
  const total   = subtotal + ppn

  return { subtotal, ppn, total, ppnRate, ppnPct: Math.round(ppnRate * 100) }
}

// ── Get user invoices ─────────────────────────────────────────
export async function getUserInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[Invoice] Failed to load:', error)
    return []
  }
  return (data ?? []) as Invoice[]
}

export async function initiatePayment(planId: string, months: number = 1, invoiceId?: string, totalIdr?: number): Promise<{
  snapToken: string
  orderId: string
} | null> {
  try {
    const response = await fetch('/api/initiate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        months,
        invoice_id: invoiceId,
        total_idr: totalIdr   // pass the real amount so backend doesn't need DB
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.message || 'Gagal memulai pembayaran')
    }

    return await response.json()
  } catch (e: any) {
    console.error('[Payment] Initiate failed:', e)
    throw new Error(e.message || 'Gagal memulai pembayaran. Coba lagi dalam beberapa saat.')
  }
}

// ── Load Midtrans Snap.js ─────────────────────────────────────
let snapLoaded = false

export function loadMidtransSnap(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (snapLoaded || (window as any).snap) {
      snapLoaded = true
      return resolve()
    }

    const isProduction = import.meta.env.VITE_MIDTRANS_ENV === 'production'
    const clientKey   = import.meta.env.VITE_MIDTRANS_CLIENT_KEY

    if (!clientKey) {
      console.warn('[Midtrans] No client key set. Using demo mode.')
      return resolve()
    }

    const script = document.createElement('script')
    script.src = isProduction
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js'
    script.setAttribute('data-client-key', clientKey)
    script.onload  = () => { snapLoaded = true; resolve() }
    script.onerror = () => reject(new Error('Gagal memuat Midtrans Snap'))
    document.head.appendChild(script)
  })
}

// ── Open Midtrans Snap popup ──────────────────────────────────
export async function openPaymentPopup(
  snapToken: string,
  onSuccess?: (result: any) => void,
  onError?:   (result: any) => void,
  onPending?: (result: any) => void
): Promise<void> {
  await loadMidtransSnap()
  const snap = (window as any).snap

  if (!snap) {
    alert('Midtrans Snap gagal dimuat. Pastikan koneksi internet Anda stabil dan coba refresh halaman.')
    return
  }

  snap.pay(snapToken, {
    onSuccess: (result: any) => {
      console.log('[Midtrans] Payment success:', result)
      onSuccess?.(result)
    },
    onPending: (result: any) => {
      console.log('[Midtrans] Payment pending:', result)
      onPending?.(result)
    },
    onError: (result: any) => {
      console.error('[Midtrans] Payment error:', result)
      onError?.(result)
    },
    onClose: () => {
      console.log('[Midtrans] Payment popup closed by user')
    }
  })
}

// ── Generate simple PDF invoice (client-side fallback) ────────
export function generateInvoicePDF(invoice: Invoice) {
  // Simple print-based PDF generation
  const planNames: Record<string, string> = {
    starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise'
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${invoice.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a2e; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .logo { font-size: 28px; font-weight: 900; color: #C9A84C; }
        .invoice-number { font-size: 14px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f8f8; font-weight: bold; }
        .total-row { font-weight: bold; font-size: 16px; }
        .status { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-paid { background: #d1fae5; color: #065f46; }
        .footer { margin-top: 60px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo">PropFS</div>
          <p style="color:#666;font-size:12px">Feasibility Study & Cost Control System</p>
          <p style="color:#666;font-size:12px">PT. Mettaland Batam Sukses</p>
          <p style="color:#666;font-size:12px">Batam Centre, Kepulauan Riau</p>
        </div>
        <div style="text-align:right">
          <h1 style="font-size:24px;margin:0">INVOICE</h1>
          <p class="invoice-number">${invoice.invoice_number}</p>
          <p class="invoice-number">Tanggal: ${new Date(invoice.created_at).toLocaleDateString('id-ID', { dateStyle: 'long' })}</p>
          <span class="status ${invoice.status === 'paid' ? 'status-paid' : ''}">${invoice.status === 'paid' ? 'LUNAS ✅' : invoice.status.toUpperCase()}</span>
        </div>
      </div>

      <table>
        <tr><th>Deskripsi</th><th>Periode</th><th style="text-align:right">Harga</th></tr>
        <tr>
          <td>Langganan PropFS ${planNames[invoice.plan_id] ?? invoice.plan_id}</td>
          <td>${new Date(invoice.period_start).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} – ${new Date(invoice.period_end).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</td>
          <td style="text-align:right">Rp ${invoice.subtotal_idr.toLocaleString('id-ID')}</td>
        </tr>
        <tr>
          <td colspan="2">PPN 11%</td>
          <td style="text-align:right">Rp ${invoice.ppn_idr.toLocaleString('id-ID')}</td>
        </tr>
        <tr class="total-row" style="background:#f8f8f8">
          <td colspan="2">TOTAL</td>
          <td style="text-align:right">Rp ${invoice.total_idr.toLocaleString('id-ID')}</td>
        </tr>
      </table>

      ${invoice.payment_method ? `<p style="color:#666;font-size:12px">Metode Pembayaran: ${invoice.payment_method}</p>` : ''}
      ${invoice.paid_at ? `<p style="color:#666;font-size:12px">Dibayar: ${new Date(invoice.paid_at).toLocaleDateString('id-ID', { dateStyle: 'long' })}</p>` : ''}

      <div class="footer">
        <p>Dokumen ini digenerate secara otomatis oleh sistem PropFS.</p>
        <p>Pertanyaan: hello@propfs.id | +62 811 0000 000</p>
      </div>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.print()
  }
}
