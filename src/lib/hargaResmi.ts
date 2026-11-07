// ============================================================
// PropFS — Harga resmi sebuah invoice, dihitung ulang di server
//
// KENAPA BERKAS INI ADA.
//
// Server pembayaran menagih dan mengaktifkan paket berdasarkan harga resmi,
// bukan angka yang tertulis di invoice. Harga resmi itu harus SAMA PERSIS
// dengan yang dilihat pembeli di halaman Harga: katalog dari
// app_settings.plan_catalog lewat bacaKatalog, totalHarga dengan diskon
// durasi, lalu PPN dari app_settings.ppn_rate yang dibulatkan ke persen.
//
// Inilah rumus acuannya, dibangun dari fungsi katalog yang dipakai halaman
// Harga. api/_lib/aktivasi.ts memakai salinannya (fungsi server tidak bisa
// mengimpor dari src/), dan test/aktivasi-bayar.test.mjs membandingkan
// keduanya pada ratusan masukan — dua rumus harga yang suatu hari berbeda
// akan menolak pembayaran yang sah tanpa ada yang tahu.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import { totalHarga, type KatalogPaket } from './planCatalog.ts'

/** Diskon per durasi — harus sama dengan DURATIONS di PricingPage. */
export const DISKON_DURASI: Readonly<Record<number, number>> = { 1: 0, 3: 10, 12: 20 }

/** Halaman Harga menulis periode sebagai bulan × 30 hari. */
export const HARI_PER_BULAN = 30

/** Nama kunci app_settings untuk harga tiap add-on. */
export const KUNCI_HARGA_ADDON: Readonly<Record<string, string>> = {
  addon_fs: 'addon_fs_price',
  addon_cost: 'addon_cost_price',
  addon_user: 'addon_user_price',
}

/** PPN bawaan bila admin belum mengaturnya — sama dengan usePPNRate. */
export const PPN_BAWAAN = 0.11

/**
 * Selisih yang masih diterima, dalam rupiah.
 *
 * Hanya untuk pembulatan: PPN dan diskon masing-masing dibulatkan, dan dua
 * pembulatan bisa berbeda satu-dua rupiah antara browser dan server.
 * Sengaja SEMPIT. Selisih yang lebih besar dari ini bukan pembulatan.
 */
export const TOLERANSI_RP = 1000

export interface InvoiceUntukHarga {
  plan_id: string
  period_start?: string | null
  period_end?: string | null
}

export interface SumberHarga {
  katalog: KatalogPaket[]
  /** Tarif PPN sebagai pecahan (0.11), persis seperti tersimpan di app_settings. */
  ppnRate: number
  /** Harga add-on dalam rupiah, per plan_id add-on. */
  hargaAddon: Record<string, number>
}

export interface HargaResmi {
  total: number
  subtotal: number
  ppn: number
  bulan: number
}

/** Jumlah bulan dari periode invoice; minimal 1. */
export function bulanDariPeriode(mulai?: string | null, akhir?: string | null): number {
  const a = new Date(String(mulai ?? '')).getTime()
  const b = new Date(String(akhir ?? '')).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  return Math.max(1, Math.round((b - a) / (HARI_PER_BULAN * 86_400_000)))
}

/** Diskon untuk sebuah durasi. Durasi yang tidak ditawarkan tidak diberi diskon. */
export function diskonUntuk(bulan: number): number {
  return DISKON_DURASI[bulan] ?? 0
}

/** Persen PPN — dibulatkan sama seperti usePPNRate (0.11 → 11). */
export function ppnPersen(rate: unknown): number {
  const n = Number(rate ?? PPN_BAWAAN)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Math.round(PPN_BAWAAN * 100)
}

/**
 * Harga resmi sebuah invoice. null bila paketnya tidak bisa dibeli — tidak
 * dikenali, atau harganya belum diatur (0).
 *
 * Add-on ditagih sekali tanpa PPN, sama dengan buatInvoiceAddon.
 */
export function hargaResmi(inv: InvoiceUntukHarga | null | undefined, sumber: SumberHarga): HargaResmi | null {
  if (!inv?.plan_id) return null
  const id = String(inv.plan_id)

  if (id in KUNCI_HARGA_ADDON) {
    const harga = Math.floor(Number(sumber.hargaAddon?.[id]))
    if (!Number.isFinite(harga) || harga <= 0) return null
    return { total: harga, subtotal: harga, ppn: 0, bulan: 1 }
  }

  const paket = (sumber.katalog ?? []).find(p => p.id === id)
  if (!paket) return null

  const bulan = bulanDariPeriode(inv.period_start, inv.period_end)
  const subtotal = totalHarga(paket, bulan, diskonUntuk(bulan))
  const ppn = Math.round(subtotal * (ppnPersen(sumber.ppnRate) / 100))
  // Paket yang harganya belum diatur tidak dijual lewat pembayaran.
  if (subtotal + ppn <= 0) return null
  return { total: subtotal + ppn, subtotal, ppn, bulan }
}

/** Apakah `dibayar` mencukupi `harus`, dengan toleransi pembulatan. */
export function cukup(dibayar: number, harus: number): boolean {
  const d = Number(dibayar)
  const h = Number(harus)
  if (!Number.isFinite(d) || !Number.isFinite(h)) return false
  if (h <= 0) return d >= 0
  return d >= h - TOLERANSI_RP
}

/** Angka rupiah dari isian app_settings yang bisa berupa angka maupun teks berkutip. */
export function rupiahSetelan(v: unknown): number {
  const n = Math.floor(Number(String(v ?? '').replace(/"/g, '')))
  return Number.isFinite(n) ? n : 0
}
