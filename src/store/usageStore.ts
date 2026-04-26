// ============================================================
// PropFS — AI Usage Tracking Store (Zustand + localStorage)
// Tracks token usage per user per month for subscription billing
// ============================================================
import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────
export type AIProvider = 'gemini' | 'groq' | 'openrouter'
export type AIFeature  = 'rab_parser' | 'realisasi_chat' | 'material_schedule'

// Cost per 1000 tokens in USD (approximate)
const PROVIDER_COST_PER_1K: Record<AIProvider, { input: number; output: number }> = {
  gemini:      { input: 0.000100, output: 0.000400 },
  groq:        { input: 0.000590, output: 0.000790 },
  openrouter:  { input: 0.000150, output: 0.000600 },
}

const USD_TO_IDR = 16300

export interface AIUsageEntry {
  id: string
  timestamp: string      // ISO
  feature: AIFeature
  provider: AIProvider
  model: string
  inputTokens: number
  outputTokens: number
  costUSD: number
  costIDR: number
}

export interface MonthlyUsageSummary {
  month: string          // "2026-04" YYYY-MM
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUSD: number
  totalCostIDR: number
  byFeature: Record<AIFeature, { calls: number; costIDR: number }>
  byProvider: Record<AIProvider, { calls: number; costIDR: number }>
  callCount: number
}

// Per-plan monthyly budgets in IDR
export const PLAN_AI_BUDGET_IDR: Record<string, number> = {
  free:       0,
  starter:    10_000,    // Rp 10.000 / bulan
  pro:        50_000,    // Rp 50.000 / bulan
  enterprise: 200_000,  // Rp 200.000 / bulan
  unlimited:  Infinity,
}

interface UsageStore {
  entries: AIUsageEntry[]
  currentMonthSummary: MonthlyUsageSummary | null

  // Record a single AI call
  recordUsage: (params: {
    feature: AIFeature
    provider: AIProvider
    model: string
    inputTokens: number
    outputTokens: number
  }) => void

  // Compute current month summary
  refreshSummary: () => void

  // Get budget remaining
  getBudgetRemaining: (planId: string) => number
  getBudgetUsedPercent: (planId: string) => number

  // Clear old data (> 3 months)
  pruneOldEntries: () => void
  clearAll: () => void
}

const STORAGE_KEY = 'propfs-ai-usage'

function loadEntries(): AIUsageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveEntries(entries: AIUsageEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch { /* Storage full - prune later */ }
}

function currentMonth() {
  return new Date().toISOString().substring(0, 7)
}

function buildSummary(entries: AIUsageEntry[]): MonthlyUsageSummary {
  const month = currentMonth()
  const monthEntries = entries.filter(e => e.timestamp.startsWith(month))

  const byFeature = {} as Record<AIFeature, { calls: number; costIDR: number }>
  const byProvider = {} as Record<AIProvider, { calls: number; costIDR: number }>

  let totalInputTokens = 0, totalOutputTokens = 0, totalCostUSD = 0, totalCostIDR = 0

  for (const e of monthEntries) {
    totalInputTokens  += e.inputTokens
    totalOutputTokens += e.outputTokens
    totalCostUSD      += e.costUSD
    totalCostIDR      += e.costIDR

    if (!byFeature[e.feature]) byFeature[e.feature] = { calls: 0, costIDR: 0 }
    byFeature[e.feature].calls  += 1
    byFeature[e.feature].costIDR += e.costIDR

    if (!byProvider[e.provider]) byProvider[e.provider] = { calls: 0, costIDR: 0 }
    byProvider[e.provider].calls  += 1
    byProvider[e.provider].costIDR += e.costIDR
  }

  return {
    month,
    totalInputTokens,
    totalOutputTokens,
    totalCostUSD,
    totalCostIDR,
    byFeature,
    byProvider,
    callCount: monthEntries.length
  }
}

export const useUsageStore = create<UsageStore>((set, get) => ({
  entries: loadEntries(),
  currentMonthSummary: null,

  recordUsage: ({ feature, provider, model, inputTokens, outputTokens }) => {
    const rates    = PROVIDER_COST_PER_1K[provider]
    const costUSD  = (inputTokens * rates.input + outputTokens * rates.output) / 1000
    const costIDR  = Math.round(costUSD * USD_TO_IDR)

    const entry: AIUsageEntry = {
      id:            crypto.randomUUID(),
      timestamp:     new Date().toISOString(),
      feature,
      provider,
      model,
      inputTokens,
      outputTokens,
      costUSD,
      costIDR,
    }

    const updated = [...get().entries, entry]
    saveEntries(updated)
    set({ entries: updated })
    get().refreshSummary()

    console.log(`[Usage] ${feature}/${provider} | in:${inputTokens} out:${outputTokens} | Rp${costIDR}`)
  },

  refreshSummary: () => {
    const summary = buildSummary(get().entries)
    set({ currentMonthSummary: summary })
  },

  getBudgetRemaining: (planId: string): number => {
    const { currentMonthSummary } = get()
    const budget = PLAN_AI_BUDGET_IDR[planId] ?? PLAN_AI_BUDGET_IDR.starter
    const used   = currentMonthSummary?.totalCostIDR ?? 0
    return Math.max(0, budget - used)
  },

  getBudgetUsedPercent: (planId: string): number => {
    const { currentMonthSummary } = get()
    const budget = PLAN_AI_BUDGET_IDR[planId] ?? PLAN_AI_BUDGET_IDR.starter
    if (budget === 0 || budget === Infinity) return 0
    const used = currentMonthSummary?.totalCostIDR ?? 0
    return Math.min(100, Math.round((used / budget) * 100))
  },

  pruneOldEntries: () => {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    const pruned = get().entries.filter(e => new Date(e.timestamp) >= cutoff)
    saveEntries(pruned)
    set({ entries: pruned })
  },

  clearAll: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ entries: [], currentMonthSummary: null })
  }
}))

// ── Helper: Estimate token count from text (rough approximation) ──
export function estimateTokens(text: string): number {
  // ~4 chars per token is a safe approximation for Indonesian/English text
  return Math.ceil(text.length / 4)
}
