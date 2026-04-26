// ============================================================
// PropFS — Supabase Edge Function: Create Payment (Midtrans)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ReqBody {
  plan_id: string
  months: number
}

const PLAN_PRICES: Record<string, number> = {
  starter:    149_000,
  pro:        399_000,
  enterprise: 999_000,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Get User
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // 2. Parse Body & Calculate Price
    const body: ReqBody = await req.json()
    const basePrice = PLAN_PRICES[body.plan_id]
    if (!basePrice) throw new Error('Invalid plan_id')

    let subtotal = basePrice * (body.months || 1)
    if (body.months === 3) subtotal = Math.round(subtotal * 0.90)
    if (body.months === 12) subtotal = Math.round(subtotal * 0.80)

    // Fetch PPN from DB (Admin-controlled)
    // Needs Service Role to bypass RLS if app_settings is restricted
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: ppnData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'ppn_rate')
      .single()

    const ppnRate = ppnData?.value ? Number(ppnData.value) : 0.11
    const ppn = Math.round(subtotal * ppnRate)
    const grandTotal = subtotal + ppn

    // 3. Generate Invoice Number (Simulated here, but better if handle via Trigger)
    // The DB trigger handles the generic INV-..., so we don't set it manually here.
    
    // Calculate periods
    const pStart = new Date()
    const pEnd = new Date()
    pEnd.setMonth(pEnd.getMonth() + body.months)

    // 4. Create Invoice Record in DB
    const { data: invoice, error: invError } = await supabaseAdmin
      .from('invoices')
      .insert({
        user_id: user.id,
        plan_id: body.plan_id,
        period_start: pStart.toISOString().split('T')[0],
        period_end: pEnd.toISOString().split('T')[0],
        subtotal_idr: subtotal,
        ppn_idr: ppn,
        total_idr: grandTotal,
        status: 'pending'
      })
      .select()
      .single()
      
    if (invError) throw invError

    // 5. Call Midtrans Snap API
    const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
    if (!serverKey) throw new Error('Misconfigured Environment: Midtrans Server Key missing')

    const isProd = Deno.env.get('MIDTRANS_ENV') === 'production'
    const midtransUrl = isProd
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions'

    const orderId = `${invoice.id.split('-')[0]}-${Date.now()}` // Short unique order ID

    // Update invoice with order ID
    await supabaseAdmin.from('invoices').update({ midtrans_order_id: orderId }).eq('id', invoice.id)

    // Format item details
    const itemDetails = [
      {
        id: `PLAN-${body.plan_id.toUpperCase()}`,
        price: subtotal,
        quantity: 1,
        name: `PropFS ${body.plan_id.toUpperCase()} (${body.months} Bulan)`
      },
      {
        id: 'TAX-PPN',
        price: ppn,
        quantity: 1,
        name: `PPN (${Math.round(ppnRate * 100)}%)`
      }
    ]

    const midtransBody = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grandTotal
      },
      customer_details: {
        first_name: user?.user_metadata?.full_name || 'PropFS User',
        email: user.email
      },
      item_details: itemDetails,
      custom_field1: invoice.id // Store our internal invoice UUID
    }

    const midtransRes = await fetch(midtransUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(serverKey + ':')}`
      },
      body: JSON.stringify(midtransBody)
    })

    const midtransData = await midtransRes.json()

    if (!midtransRes.ok || !midtransData.token) {
      console.error('Midtrans Error:', midtransData)
      throw new Error(midtransData.error_messages?.[0] || 'Midtrans error')
    }

    return new Response(
      JSON.stringify({
        snapToken: midtransData.token,
        invoiceId: invoice.id,
        orderId: orderId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('API Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
