// ============================================================
// Katalog menu Kontraktor AI — sumber tunggal untuk grid ikon di Home
// dan untuk pencarian. Menambah fitur baru cukup menambah satu entri.
// Modul ini sengaja bebas JSX/DOM agar mudah diuji & dipakai ulang saat
// Kontraktor AI dipisah menjadi aplikasi tersendiri.
// ============================================================
import {
  LayoutDashboard, FileSpreadsheet, PackageOpen, ReceiptIcon, TrendingUp,
  FileDown, Scale, FileSignature, HardHat, ShoppingCart, Users,
  BarChart3, Settings, Store, type LucideIcon, Compass, Calculator, UserPlus, Megaphone,} from 'lucide-react'
import type { AppFeature } from '@/lib/supabase'
import type { WorkspaceTab } from '@/components/cost/WorkspaceSidebar'

export type MenuKategori = 'proyek' | 'keuangan' | 'lapangan' | 'tim'

export interface MenuItem {
  key: string
  label: string
  icon: LucideIcon
  kategori: MenuKategori
  /** Tab tujuan di workspace /cost-control — item ini butuh proyek aktif. */
  tab?: WorkspaceTab
  /** Sub-tab di dalam tab tujuan (mis. sub-tab modul Akuntan). */
  sub?: string
  /** Route langsung — dipakai item lintas proyek (tidak butuh proyek aktif). */
  path?: string
  /** Disembunyikan bila paket langganan tidak mengaktifkan fitur ini. */
  feature?: AppFeature
  /** Kelas warna kotak ikon (latar + teks). */
  tone: string
  /** Label kecil di pojok kotak, mis. 'BARU'. */
  tag?: string
  /** Kata bantu pencarian selain label. */
  alias?: string
  /**
   * Kunci fitur tambahan di `lib/fiturTambahan.ts`. Item yang menyebutkannya
   * baru tampil bila setelan backend mengizinkan — dipakai untuk merilis fitur
   * bertahap tanpa merilis ulang aplikasi.
   */
  tambahan?: string
}

export const KATEGORI: { key: MenuKategori | 'semua'; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'proyek', label: 'Proyek' },
  { key: 'keuangan', label: 'Keuangan' },
  { key: 'lapangan', label: 'Lapangan' },
  { key: 'tim', label: 'Tim' },
]

const TONE = {
  navy: 'bg-navy/10 text-navy',
  gold: 'bg-gold-lt text-[#8A6D1F]',
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-600',
} as const

// Satu ikon = satu halaman. Menu yang dulu terpisah tetapi bermuara ke
// halaman yang sama sudah digabung, karena halaman tujuannya memang sudah
// punya sub-tab sendiri. Label lama tetap dicantumkan sebagai `alias` supaya
// pencarian "opname", "undang", "kalender", dsb. tetap menemukannya.
export const MENU_ITEMS: MenuItem[] = [
  // ── Proyek ────────────────────────────────────────────────────────────────
  { key: 'overview',  label: 'Dashboard Proyek', icon: LayoutDashboard, kategori: 'proyek', tab: 'overview',  tone: TONE.navy },
  { key: 'rab',       label: 'RAB Proyek',       icon: FileSpreadsheet, kategori: 'proyek', tab: 'rab',       tone: TONE.blue,    feature: 'cost_rab', alias: 'anggaran biaya' },
  { key: 'material',  label: 'Material Schedule', icon: PackageOpen,    kategori: 'proyek', tab: 'material',  tone: TONE.amber,   feature: 'cost_material', alias: 'jadwal bahan' },
  { key: 'kurva_s',   label: 'Kurva S',          icon: TrendingUp,      kategori: 'proyek', tab: 'kurva_s',   tone: TONE.emerald, feature: 'scurve', alias: 'progress kurva' },
  { key: 'realisasi', label: 'Realisasi Biaya',  icon: ReceiptIcon,     kategori: 'proyek', tab: 'realisasi', tone: TONE.rose,    feature: 'cost_realisasi', alias: 'pengeluaran nota ai' },
  { key: 'laporan',   label: 'Laporan & Export', icon: FileDown,        kategori: 'proyek', tab: 'laporan',   tone: TONE.slate },
  // AI Architect dipindah ke sini dari menu produk terpisah: merancang layout
  // dan merendernya adalah pekerjaan kontraktor juga, bukan hanya milik studi
  // kelayakan. Halamannya tetap /siteplan supaya tautan lama tidak putus.
  { key: 'arsitek', label: 'AI Architect', icon: Compass, kategori: 'proyek', path: '/siteplan', tone: TONE.violet, tag: 'BARU',
    alias: 'siteplan layout kavling render 3d visual desain arsitek denah tata letak' },

  // ── Keuangan ──────────────────────────────────────────────────────────────
  // Halaman Akuntan sudah memuat Laba Rugi & Neraca, Pemasukan, Inventori,
  // dan Opname sebagai sub-tab — dulu empat ikon terpisah.
  { key: 'akuntan', label: 'Akuntan', icon: Scale, kategori: 'keuangan', tab: 'akuntan', tone: TONE.navy,
    alias: 'laba rugi neraca pemasukan termin inventori stok gudang opname progres pekerjaan' },
  { key: 'konsolidasi', label: 'Konsolidasi', icon: BarChart3, kategori: 'keuangan', path: '/kontraktor/konsolidasi', tone: TONE.gold,
    alias: 'laporan semua proyek gabungan' },
  // Satu halaman memuat Vendor, Katalog harga, dan Purchase Order.
  { key: 'procurement', label: 'Procurement', icon: Store, kategori: 'keuangan', path: '/kontraktor/procurement', tone: TONE.violet, tag: 'BARU',
    alias: 'vendor supplier katalog harga purchase order po pembelian pengadaan' },

  // ── Lapangan ──────────────────────────────────────────────────────────────
  { key: 'spk', label: 'SPK Digital', icon: FileSignature, kategori: 'lapangan', tab: 'spk', tone: TONE.violet,
    alias: 'kontrak tanda tangan' },
  // Satu halaman memuat laporan harian, link pekerja, dan link owner untuk
  // kalender progres — dulu tiga ikon yang tujuannya sama.
  { key: 'lapangan', label: 'Laporan Lapangan', icon: HardHat, kategori: 'lapangan', tab: 'lapangan', tone: TONE.amber,
    alias: 'laporan harian pekerja mandor kalender progres link bagikan owner' },
  // Satu halaman memuat Pakai Material, Request Material, dan Kekurangan.
  { key: 'material_lapangan', label: 'Material Lapangan', icon: ShoppingCart, kategori: 'lapangan', path: '/kontraktor/material', tone: TONE.rose,
    alias: 'pakai penggunaan request permintaan bahan kekurangan stok menipis' },

  // Cari Leads berdiri di kategori Tim, bukan Keuangan: yang mengerjakannya
  // orang — menyebar tautan, menelepon, mensurvei — bukan angka.
  { key: 'leads', label: 'Cari Leads', icon: UserPlus, kategori: 'tim', path: '/kontraktor/leads',
    tone: TONE.emerald, tag: 'BARU',
    alias: 'calon konsumen prospek form konsultasi renovasi pemasaran marketing wa whatsapp' },

  // Marcom berdiri di kategori Tim bersama Cari Leads: keduanya pekerjaan
  // memasarkan, bukan menghitung. Leads menampung yang sudah tertarik; Marcom
  // yang membuat mereka tertarik lebih dulu.
  { key: 'marcom', label: 'Marcom', icon: Megaphone, kategori: 'tim', path: '/kontraktor/marcom',
    tone: TONE.violet, tag: 'BARU',
    alias: 'promosi konten sosmed instagram tiktok foto video caption logo kontak iklan marketing' },

  // ── Tim ───────────────────────────────────────────────────────────────────
  // Satu halaman memuat daftar pengguna, pembuatan akun, dan matriks role.
  { key: 'tim', label: 'User Team', icon: Users, kategori: 'tim', path: '/kontraktor/tim', tone: TONE.navy,
    alias: 'anggota tim undang invite karyawan pengguna role hak akses jabatan kode perusahaan' },

  // ── Fitur tambahan ────────────────────────────────────────────────────────
  // Feasibility Study dulunya produk sendiri dengan menunya sendiri di navigasi
  // bawah. Sekarang ia satu ikon di sini, dan tampil-tidaknya diatur dari
  // backend (Admin → Pengaturan → Fitur Tambahan). Halamannya tetap /dashboard
  // supaya tautan lama tidak putus.
  { key: 'feasibility', label: 'Feasibility Study', icon: Calculator, kategori: 'proyek', path: '/dashboard',
    tone: TONE.emerald, tambahan: 'fs_module', feature: 'fs_module',
    alias: 'studi kelayakan fs analisa investasi npv irr bep proyeksi' },

  // ── Selalu paling belakang ────────────────────────────────────────────────
  // Berisi profil perusahaan (kop & logo laporan) dan auto-upload Google Drive.
  { key: 'settings', label: 'Pengaturan', icon: Settings, kategori: 'proyek', tab: 'settings', tone: TONE.slate,
    alias: 'setting proyek google drive auto upload foto profil perusahaan logo kop' },
]

/** Menu yang membutuhkan proyek aktif (tujuannya sebuah tab workspace). */
export function butuhProyek(item: MenuItem): boolean {
  return !!item.tab
}

/** URL tujuan sebuah menu untuk proyek tertentu. */
export function targetUrl(item: MenuItem, projectId?: string): string {
  if (item.path) return item.path
  const q = new URLSearchParams()
  if (item.tab) q.set('tab', item.tab)
  if (item.sub) q.set('sub', item.sub)
  if (projectId) q.set('project', projectId)
  return `/cost-control?${q.toString()}`
}

/**
 * Pencarian berdasarkan label + alias + kategori.
 * Tiap kata dicari terpisah, jadi "material request" dan "request material"
 * sama-sama menemukan Material Lapangan. Kalau seluruh kata dicocokkan
 * sebagai satu frasa utuh, urutan kata pada alias jadi ikut menentukan —
 * itu membuat pencarian terasa rusak tanpa sebab yang jelas.
 */
export function cariMenu(items: MenuItem[], q: string): MenuItem[] {
  const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (kata.length === 0) return items
  return items.filter(i => {
    const teks = `${i.label} ${i.alias ?? ''} ${i.kategori}`.toLowerCase()
    return kata.every(k => teks.includes(k))
  })
}
