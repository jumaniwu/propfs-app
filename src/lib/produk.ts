// ============================================================
// PropFS — Pemisahan produk & langganan (logika murni, tanpa DOM)
// Feasibility Study dan Kontraktor AI adalah dua produk terpisah:
// masing-masing punya paket, harga, dan masa aktif sendiri.
//
// KOMPATIBILITAS: langganan lama belum punya kolom `product`. Langganan
// seperti itu dianggap mencakup KEDUA produk, supaya pelanggan yang sudah
// berjalan tidak kehilangan akses saat fitur ini dirilis.
// ============================================================

import type { AppFeature } from './supabase'

/** Produk yang bisa dipakai pelanggan. */
export type Produk = 'feasibility' | 'kontraktor'

/**
 * Cakupan sebuah katalog langganan. `bundle` mencakup kedua produk sekaligus.
 * Katalog Free Trial memakai `null` (aturan trial diatur terpisah).
 */
export type CakupanKatalog = Produk | 'bundle' | null

/** Produk apa saja yang tercakup sebuah katalog. */
export function produkTercakup(cakupan: CakupanKatalog): Produk[] {
  if (cakupan === 'bundle') return ['feasibility', 'kontraktor']
  if (cakupan === 'feasibility' || cakupan === 'kontraktor') return [cakupan]
  return []
}

export interface ProdukInfo {
  key: Produk
  nama: string
  deskripsi: string
  /** Route utama produk ini. */
  path: string
}

export const PRODUK: ProdukInfo[] = [
  {
    key: 'feasibility',
    nama: 'Feasibility Study',
    deskripsi: 'Analisa kelayakan proyek properti, AI Architect, dan laporan investasi.',
    path: '/dashboard',
  },
  {
    key: 'kontraktor',
    nama: 'Kontraktor AI',
    deskripsi: 'RAB, realisasi biaya, akuntan, SPK digital, dan laporan lapangan.',
    path: '/kontraktor',
  },
]

/** Fitur mana milik produk mana. Fitur yang tidak terdaftar berlaku umum. */
const FITUR_PRODUK: Partial<Record<AppFeature, Produk>> = {
  fs_module: 'feasibility',
  ai_solver: 'feasibility',
  cost_control: 'kontraktor',
  cost_rab: 'kontraktor',
  cost_material: 'kontraktor',
  cost_realisasi: 'kontraktor',
  scurve: 'kontraktor',
}

/** Produk pemilik sebuah fitur, atau null bila fitur berlaku umum. */
export function produkDariFitur(fitur: AppFeature): Produk | null {
  return FITUR_PRODUK[fitur] ?? null
}

/** Jenis kuota proyek per produk (dipakai canCreateProject). */
export function produkDariJenisProyek(jenis: 'fs' | 'cost'): Produk {
  return jenis === 'cost' ? 'kontraktor' : 'feasibility'
}

export interface LanggananRingkas {
  /** null pada langganan lama yang belum ditandai produknya. */
  product?: CakupanKatalog
  plan_id: string
  status: string
  expired_at?: string | null
}

/**
 * Apakah sebuah baris langganan berlaku untuk produk tertentu.
 * - `bundle` berlaku untuk kedua produk.
 * - Langganan tanpa `product` (data lama) dianggap mencakup semua produk.
 */
export function langgananUntuk(sub: LanggananRingkas, produk: Produk): boolean {
  if (sub.status !== 'active') return false
  if (!sub.product) return true
  if (sub.product === 'bundle') return true
  return sub.product === produk
}

/**
 * Pilih langganan aktif yang berlaku untuk sebuah produk. Langganan yang
 * ditandai produknya diprioritaskan di atas langganan lama tanpa penanda.
 */
export function langgananProduk<T extends LanggananRingkas>(subs: T[], produk: Produk): T | null {
  const cocok = subs.filter(s => langgananUntuk(s, produk))
  if (cocok.length === 0) return null
  return cocok.find(s => s.product === produk) ?? cocok[0]
}

/** Id paket yang berlaku untuk produk tertentu; 'free' bila tidak berlangganan. */
export function planProduk(subs: LanggananRingkas[], produk: Produk): string {
  return langgananProduk(subs, produk)?.plan_id ?? 'free'
}

/** Sudah kedaluwarsa bila expired_at ada dan sudah lewat. */
export function sudahKedaluwarsa(sub: LanggananRingkas, sekarang = new Date()): boolean {
  if (!sub.expired_at) return false
  const t = new Date(sub.expired_at)
  return !Number.isNaN(t.getTime()) && t.getTime() < sekarang.getTime()
}

/** Sisa hari langganan; null bila tanpa tanggal berakhir. */
export function sisaHari(sub: LanggananRingkas, sekarang = new Date()): number | null {
  if (!sub.expired_at) return null
  const t = new Date(sub.expired_at)
  if (Number.isNaN(t.getTime())) return null
  return Math.ceil((t.getTime() - sekarang.getTime()) / 86_400_000)
}
