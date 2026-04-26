// ============================================================
// PropFS — PPN Settings Hook
// Reads PPN rate from Supabase app_settings (admin-controlled)
// Falls back to 11% if not set
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULT_PPN_RATE = 0.11   // 11%
const CACHE_KEY        = 'propfs:ppn_rate'
const CACHE_TTL_MS     = 5 * 60_000  // 5 minutes

let cached: { rate: number; ts: number } | null = null

export async function fetchPPNRate(): Promise<number> {
  // Serve from memory cache
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.rate

  // Try localStorage cache first (offline)
  try {
    const ls = localStorage.getItem(CACHE_KEY)
    if (ls) {
      const parsed = JSON.parse(ls)
      if (Date.now() - parsed.ts < CACHE_TTL_MS) {
        cached = parsed
        return parsed.rate
      }
    }
  } catch { /* ignore */ }

  // Fetch from Supabase
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'ppn_rate')
      .maybeSingle()

    const rate = data?.value ?? DEFAULT_PPN_RATE
    const entry = { rate: Number(rate), ts: Date.now() }
    cached = entry
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    return entry.rate
  } catch {
    return DEFAULT_PPN_RATE
  }
}

export function usePPNRate() {
  const [ppnRate, setPpnRate] = useState<number>(DEFAULT_PPN_RATE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPPNRate().then(r => {
      setPpnRate(r)
      setLoading(false)
    })
  }, [])

  const ppnPct = Math.round(ppnRate * 100)  // e.g. 11

  return { ppnRate, ppnPct, loading }
}

// Invalidate cache (call after admin saves new PPN)
export function invalidatePPNCache() {
  cached = null
  localStorage.removeItem(CACHE_KEY)
}
