// ============================================================
// PropFS — Pencatatan pemakaian AI (Zustand + localStorage)
//
// Halaman AI Billing dulu buta terhadap panggilan yang paling mahal, karena
// dua hal sekaligus:
//
//   1. Hanya Chat AI yang memanggil recordUsage. Tiga tempat yang memanggil
//      model GAMBAR — render masterplan AI Architect, render dari CAD/PDF, dan
//      "Rapikan foto" di Marcom — tidak mencatat apa pun.
//   2. Biayanya dipatok per PENYEDIA dan hanya per token. Model gambar tidak
//      ditagih per token keluaran; ia ditagih PER GAMBAR, dan satu gambar
//      setara puluhan kali satu percakapan teks. Jadi seandainya pun tercatat,
//      angkanya akan jauh di bawah kenyataan.
//
// Akibatnya angka di aplikasi tidak bisa dicocokkan dengan tagihan di Google,
// dan ketika tagihannya melonjak tidak ada cara mengetahui fitur mana yang
// menyebabkannya — padahal itulah satu-satunya pertanyaan yang penting saat itu.
//
// Tarifnya kini diambil per MODEL dari biayaAi.ts, dan jumlah gambar dicatat
// terpisah dari jumlah token.
// ============================================================
import { create } from 'zustand'
import { hitungBiaya } from '../lib/biayaAi'

// ── Types ─────────────────────────────────────────────────────
export type AIProvider = 'gemini' | 'groq' | 'openrouter'
export type AIFeature  =
  | 'rab_parser'
  | 'realisasi_chat'
  | 'material_schedule'
  | 'render_masterplan'   // AI Architect — SATU gambar berbayar per sudut
  | 'render_cad'          // render dari file CAD/PDF
  | 'marcom_foto'         // "Rapikan foto" di Marcom

/** Nama yang bisa dibaca orang, dipakai di panel AI Billing. */
export const LABEL_FITUR: Record<AIFeature, string> = {
  rab_parser:        'Upload RAB',
  realisasi_chat:    'Chat AI',
  material_schedule: 'Jadwal Material',
  render_masterplan: 'AI Architect (gambar)',
  render_cad:        'Render CAD (gambar)',
  marcom_foto:       'Marcom — Rapikan Foto (gambar)',
}

export interface AIUsageEntry {
  id: string
  timestamp: string      // ISO
  feature: AIFeature
  provider: AIProvider
  model: string
  inputTokens: number
  outputTokens: number
  /** Berapa gambar berbayar yang dihasilkan panggilan ini. */
  images: number
  costUSD: number
  costIDR: number
  /** Bagian biaya yang datang dari gambar — biasanya inilah yang mendominasi. */
  costImageIDR: number
}

export interface MonthlyUsageSummary {
  month: string          // "2026-04" YYYY-MM
  totalInputTokens: number
  totalOutputTokens: number
  totalImages: number
  totalCostUSD: number
  totalCostIDR: number
  /** Bagian tagihan yang berasal dari pembuatan gambar. */
  totalCostImageIDR: number
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
    /** Jumlah gambar berbayar. Wajib diisi oleh pemanggil model gambar. */
    images?: number
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
  let totalImages = 0, totalCostImageIDR = 0

  for (const e of monthEntries) {
    totalInputTokens  += e.inputTokens
    totalOutputTokens += e.outputTokens
    totalCostUSD      += e.costUSD
    totalCostIDR      += e.costIDR
    // Catatan lama tidak punya kolom ini; jangan biarkan menjadi NaN dan
    // merusak seluruh ringkasan bulan itu.
    totalImages       += e.images ?? 0
    totalCostImageIDR += e.costImageIDR ?? 0

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
    totalImages,
    totalCostUSD,
    totalCostIDR,
    totalCostImageIDR,
    byFeature,
    byProvider,
    callCount: monthEntries.length
  }
}

export const useUsageStore = create<UsageStore>((set, get) => ({
  entries: loadEntries(),
  currentMonthSummary: null,

  recordUsage: ({ feature, provider, model, inputTokens, outputTokens, images = 0 }) => {
    // Tarifnya dibaca per model, dan gambar dihitung terpisah dari token.
    const biaya = hitungBiaya({
      model,
      tokenMasukan:  inputTokens,
      tokenKeluaran: outputTokens,
      gambar:        images,
    })

    const entry: AIUsageEntry = {
      id:            crypto.randomUUID(),
      timestamp:     new Date().toISOString(),
      feature,
      provider,
      model,
      inputTokens,
      outputTokens,
      images,
      costUSD:       biaya.usd,
      costIDR:       biaya.idr,
      costImageIDR:  biaya.idrGambar,
    }

    const updated = [...get().entries, entry]
    saveEntries(updated)
    set({ entries: updated })
    get().refreshSummary()

    console.log(
      `[Usage] ${feature}/${model} | in:${inputTokens} out:${outputTokens}`
      + `${images ? ` img:${images}` : ''} | Rp${biaya.idr}`,
    )
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

/**
 * Catat satu panggilan model GAMBAR.
 *
 * Dibuat sebagai fungsi tersendiri karena tiga tempat pemanggil model gambar
 * tersebar di modul yang berbeda dan tak satu pun dari mereka mencatat apa pun
 * sebelumnya — itulah sebabnya tagihan yang melonjak tidak bisa ditelusuri ke
 * fiturnya. Sengaja tidak pernah melempar: kegagalan mencatat tidak boleh
 * menggagalkan render yang sudah terlanjur dibayar.
 */
export function catatGambar(
  feature: AIFeature, model: string, jumlah = 1, promptText = '',
): void {
  try {
    useUsageStore.getState().recordUsage({
      feature,
      provider:     'gemini',
      model,
      inputTokens:  estimateTokens(promptText),
      outputTokens: 0,
      images:       jumlah,
    })
  } catch { /* pencatatan tidak boleh mematikan fiturnya */ }
}
