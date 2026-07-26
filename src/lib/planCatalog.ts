// ============================================================
// PropFS — Katalog langganan (logika murni, tanpa DOM)
// Satu sumber untuk: halaman Landing, halaman Pricing, editor Admin,
// dan penghitungan kuota di authStore.
//
// Ada 3 katalog berbayar + Free Trial:
//   free        — Free Trial
//   fs          — Langganan Feasibility Study
//   kontraktor  — Langganan Kontraktor AI
//   bundle      — Feasibility Study + Kontraktor AI
//
// Harga dan jumlah proyek tiap katalog diatur admin di backend
// (app_settings.plan_catalog), bukan di kode.
// ============================================================

import type { CakupanKatalog } from './produk'

export interface KatalogPaket {
  id: string
  name: string
  /** Produk yang tercakup. null = Free Trial. */
  product: CakupanKatalog
  deskripsi: string
  priceIdr: number
  promoPriceIdr: number | null
  /** Jumlah proyek Feasibility Study yang termasuk. */
  fsProjects: number
  /** Jumlah proyek Kontraktor AI yang termasuk. */
  costProjects: number
  features: Record<string, boolean | number>
  isVisible: boolean
  recommended?: boolean
}

/** Nilai awal — admin menimpanya lewat halaman Paket & Harga. */
export const KATALOG_DEFAULT: KatalogPaket[] = [
  {
    id: 'free', name: 'Free Trial', product: null,
    deskripsi: 'Coba dulu sebelum berlangganan.',
    priceIdr: 0, promoPriceIdr: null, fsProjects: 1, costProjects: 0, isVisible: true,
    features: {
      upload_rab: false, material_schedule: false, kurva_s: false, ai_chat: false,
      export_excel: false, export_pdf: false, multi_user: 1, akuntan: false, spk: false,
      lapangan: false, material_lapangan: false, api_access: false, whitelabel: false,
      priority_support: false, onboarding: false,
    },
  },
  {
    id: 'fs', name: 'Feasibility Study', product: 'feasibility',
    deskripsi: 'Analisa kelayakan proyek properti, AI Architect, dan laporan investasi.',
    priceIdr: 0, promoPriceIdr: null, fsProjects: 0, costProjects: 0, isVisible: true,
    features: {
      upload_rab: false, material_schedule: false, kurva_s: false, ai_chat: false,
      export_excel: true, export_pdf: true, multi_user: 1, akuntan: false, spk: false,
      lapangan: false, material_lapangan: false, api_access: false, whitelabel: false,
      priority_support: false, onboarding: false,
    },
  },
  {
    id: 'kontraktor', name: 'Kontraktor AI', product: 'kontraktor',
    deskripsi: 'RAB, realisasi biaya, akuntan, SPK digital, dan laporan lapangan.',
    priceIdr: 0, promoPriceIdr: null, fsProjects: 0, costProjects: 0, isVisible: true,
    features: {
      upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true,
      export_excel: true, export_pdf: true, multi_user: 3, akuntan: true, spk: true,
      lapangan: true, material_lapangan: true, api_access: false, whitelabel: false,
      priority_support: false, onboarding: false,
    },
  },
  {
    id: 'bundle', name: 'Feasibility Study + Kontraktor AI', product: 'bundle',
    deskripsi: 'Paket lengkap: analisa kelayakan sampai pelaksanaan proyek di lapangan.',
    priceIdr: 0, promoPriceIdr: null, fsProjects: 0, costProjects: 0,
    isVisible: true, recommended: true,
    features: {
      upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true,
      export_excel: true, export_pdf: true, multi_user: 5, akuntan: true, spk: true,
      lapangan: true, material_lapangan: true, api_access: false, whitelabel: true,
      priority_support: true, onboarding: false,
    },
  },
]

/** Fitur yang bisa dinyalakan/dimatikan admin per katalog. */
export const FITUR_KATALOG: Array<{
  key: string; label: string; inputType: 'toggle' | 'number'; suffix?: string
}> = [
  { key: 'upload_rab', label: 'Upload & Parsing RAB Excel (AI)', inputType: 'toggle' },
  { key: 'material_schedule', label: 'Material Schedule Otomatis', inputType: 'toggle' },
  { key: 'kurva_s', label: 'Kurva S Progres Proyek', inputType: 'toggle' },
  { key: 'ai_chat', label: 'AI Chat Realisasi Biaya', inputType: 'toggle' },
  { key: 'akuntan', label: 'Modul Akuntan & Konsolidasi', inputType: 'toggle' },
  { key: 'spk', label: 'SPK Digital & Tanda Tangan', inputType: 'toggle' },
  { key: 'lapangan', label: 'Laporan Lapangan & Kalender', inputType: 'toggle' },
  { key: 'material_lapangan', label: 'Penggunaan & Request Material', inputType: 'toggle' },
  { key: 'export_excel', label: 'Ekspor Laporan Excel', inputType: 'toggle' },
  { key: 'export_pdf', label: 'Ekspor PDF Branded', inputType: 'toggle' },
  { key: 'multi_user', label: 'Multi-user / Tim', inputType: 'number', suffix: 'user' },
  { key: 'api_access', label: 'Akses API (Integrasi ERP)', inputType: 'toggle' },
  { key: 'whitelabel', label: 'White-label Reports', inputType: 'toggle' },
  { key: 'priority_support', label: 'Prioritas Support (WA/24jam)', inputType: 'toggle' },
  { key: 'onboarding', label: 'Onboarding & Training Tim', inputType: 'toggle' },
]

/** Angka yang mungkin tersimpan sebagai string/boolean di katalog lama. */
function angka(v: unknown, bawaan = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : bawaan
  if (typeof v === 'boolean') return v ? 999 : 0
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (t === 'true') return 999
    if (t === 'false' || t === '') return 0
    const n = parseInt(t, 10)
    return Number.isNaN(n) ? bawaan : n
  }
  return bawaan
}

/**
 * Ubah satu baris katalog apa pun (termasuk format lama Starter/Pro yang
 * memakai features.fs_projects & features.cost_control) menjadi bentuk baru.
 */
export function normalisasiPaket(raw: unknown): KatalogPaket | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const id = typeof p.id === 'string' ? p.id : ''
  if (!id) return null

  const fitur = (p.features && typeof p.features === 'object' ? p.features : {}) as Record<string, boolean | number>

  // Katalog lama menyimpan jumlah proyek di dalam features.
  const fsProjects = angka(p.fsProjects ?? fitur.fs_projects, 0)
  const costProjects = angka(p.costProjects ?? fitur.cost_control, 0)

  const cakupanValid = ['feasibility', 'kontraktor', 'bundle'] as const
  let product: CakupanKatalog = null
  if (typeof p.product === 'string' && (cakupanValid as readonly string[]).includes(p.product)) {
    product = p.product as CakupanKatalog
  } else if (id !== 'free') {
    // Katalog lama tanpa penanda: tebak dari kuota proyeknya.
    if (fsProjects > 0 && costProjects > 0) product = 'bundle'
    else if (costProjects > 0) product = 'kontraktor'
    else product = 'feasibility'
  }

  return {
    id,
    name: typeof p.name === 'string' ? p.name : id,
    product,
    deskripsi: typeof p.deskripsi === 'string' ? p.deskripsi : '',
    priceIdr: angka(p.priceIdr, 0),
    promoPriceIdr: p.promoPriceIdr === null || p.promoPriceIdr === undefined || p.promoPriceIdr === ''
      ? null : angka(p.promoPriceIdr, 0),
    fsProjects,
    costProjects,
    features: fitur,
    isVisible: p.isVisible !== false,
    recommended: p.recommended === true,
  }
}

/**
 * Baca katalog dari app_settings. Katalog lama tetap terbaca; katalog yang
 * belum punya keempat id baru dilengkapi dari KATALOG_DEFAULT agar halaman
 * harga tidak pernah kosong.
 */
export function bacaKatalog(raw: unknown): KatalogPaket[] {
  const list = Array.isArray(raw)
    ? raw.map(normalisasiPaket).filter((p): p is KatalogPaket => p !== null)
    : []
  if (list.length === 0) return KATALOG_DEFAULT.map(p => ({ ...p }))

  const adaId = new Set(list.map(p => p.id))
  const lengkap = [...list]
  for (const bawaan of KATALOG_DEFAULT) {
    if (!adaId.has(bawaan.id)) lengkap.push({ ...bawaan })
  }
  return lengkap
}

/**
 * Ambil katalog dari app_settings lewat REST langsung.
 *
 * Tidak memakai supabase-js karena klien itu bisa MENGGANTUNG saat mencoba
 * menyegarkan token (mis. pengunjung yang masih punya sesi lama). Kalau
 * promise-nya tidak pernah selesai, halaman harga jadi kosong sama sekali.
 * Di sini permintaan dibatasi waktu dan SELALU jatuh ke katalog bawaan bila
 * gagal, sehingga daftar harga tidak pernah kosong.
 */
export async function muatKatalog(ms = 8000): Promise<KatalogPaket[]> {
  try {
    const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
    const url = env.VITE_SUPABASE_URL || 'https://ciazztqmkhzrgbaqfyyz.supabase.co'
    const key = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1BxZhA48DtR8KG94xUm0zg_6w-dg1xD'

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    const head = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    try {
      // 1) RPC publik — jalan juga untuk pengunjung yang belum login, walau
      //    RLS app_settings tertutup.
      const rpc = await fetch(`${url}/rest/v1/rpc/public_plan_catalog`, {
        method: 'POST', signal: ctrl.signal, headers: head, body: '{}',
      })
      if (rpc.ok) {
        const nilai = await rpc.json()
        if (Array.isArray(nilai) && nilai.length > 0) return bacaKatalog(nilai)
      }

      // 2) Fallback: baca tabel langsung (untuk database yang belum
      //    menjalankan migration_public_plan_catalog.sql).
      const res = await fetch(
        `${url}/rest/v1/app_settings?select=value&key=eq.plan_catalog`,
        { signal: ctrl.signal, headers: head },
      )
      if (!res.ok) return bacaKatalog(null)
      const rows = await res.json() as Array<{ value?: unknown }>
      return bacaKatalog(rows[0]?.value)
    } finally { clearTimeout(timer) }
  } catch {
    return bacaKatalog(null)
  }
}

/** Urutan tampil: Free Trial, FS, Kontraktor AI, Bundle, lalu sisanya. */
const URUTAN = ['free', 'fs', 'kontraktor', 'bundle']
export function urutkanKatalog(list: KatalogPaket[]): KatalogPaket[] {
  return [...list].sort((a, b) => {
    const ia = URUTAN.indexOf(a.id), ib = URUTAN.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}

/** Katalog yang ditampilkan ke calon pelanggan. */
export function katalogTampil(list: KatalogPaket[]): KatalogPaket[] {
  return urutkanKatalog(list.filter(p => p.isVisible))
}

/** Kuota proyek sebuah paket untuk satu produk. */
export function kuotaProyek(paket: KatalogPaket | null, produk: 'feasibility' | 'kontraktor'): number {
  if (!paket) return 0
  return produk === 'kontraktor' ? paket.costProjects : paket.fsProjects
}

/** Harga efektif (pakai promo bila lebih murah dari harga normal). */
export function hargaEfektif(paket: KatalogPaket): number {
  const { priceIdr, promoPriceIdr } = paket
  if (promoPriceIdr !== null && promoPriceIdr > 0 && promoPriceIdr < priceIdr) return promoPriceIdr
  return priceIdr
}

/** Total untuk durasi tertentu, setelah diskon durasi. */
export function totalHarga(paket: KatalogPaket, bulan: number, diskonPct: number): number {
  const total = hargaEfektif(paket) * Math.max(1, bulan)
  return Math.round(total * (1 - diskonPct / 100))
}
