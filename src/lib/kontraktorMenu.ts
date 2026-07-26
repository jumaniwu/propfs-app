// ============================================================
// Katalog menu Kontraktor AI — sumber tunggal untuk grid ikon di Home
// dan untuk pencarian. Menambah fitur baru cukup menambah satu entri.
// Modul ini sengaja bebas JSX/DOM agar mudah diuji & dipakai ulang saat
// Kontraktor AI dipisah menjadi aplikasi tersendiri.
// ============================================================
import {
  LayoutDashboard, FileSpreadsheet, PackageOpen, ReceiptIcon, TrendingUp,
  FileDown, Scale, FileSignature, HardHat, CalendarDays, Link2,
  ClipboardList, Boxes, ShoppingCart, Users, UserPlus, ShieldCheck,
  BarChart3, Settings, type LucideIcon,
} from 'lucide-react'
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

export const MENU_ITEMS: MenuItem[] = [
  // ── Proyek ────────────────────────────────────────────────────────────────
  { key: 'overview',  label: 'Dashboard Proyek', icon: LayoutDashboard, kategori: 'proyek', tab: 'overview',  tone: TONE.navy },
  { key: 'rab',       label: 'RAB Proyek',       icon: FileSpreadsheet, kategori: 'proyek', tab: 'rab',       tone: TONE.blue,    feature: 'cost_rab', alias: 'anggaran biaya' },
  { key: 'material',  label: 'Material Schedule', icon: PackageOpen,    kategori: 'proyek', tab: 'material',  tone: TONE.amber,   feature: 'cost_material', alias: 'jadwal bahan' },
  { key: 'kurva_s',   label: 'Kurva S',          icon: TrendingUp,      kategori: 'proyek', tab: 'kurva_s',   tone: TONE.emerald, feature: 'scurve', alias: 'progress kurva' },
  { key: 'realisasi', label: 'Realisasi Biaya',  icon: ReceiptIcon,     kategori: 'proyek', tab: 'realisasi', tone: TONE.rose,    feature: 'cost_realisasi', alias: 'pengeluaran nota ai' },
  { key: 'laporan',   label: 'Laporan & Export', icon: FileDown,        kategori: 'proyek', tab: 'laporan',   tone: TONE.slate },

  // ── Keuangan ──────────────────────────────────────────────────────────────
  { key: 'akuntan',     label: 'Laba Rugi',      icon: Scale,       kategori: 'keuangan', tab: 'akuntan', sub: 'labarugi',  tone: TONE.navy,    alias: 'akuntan neraca' },
  { key: 'pemasukan',   label: 'Pemasukan',      icon: TrendingUp,  kategori: 'keuangan', tab: 'akuntan', sub: 'pemasukan', tone: TONE.emerald, alias: 'termin masuk' },
  { key: 'inventori',   label: 'Inventori',      icon: Boxes,       kategori: 'keuangan', tab: 'akuntan', sub: 'inventori', tone: TONE.amber,   alias: 'stok gudang' },
  { key: 'opname',      label: 'Opname',         icon: ClipboardList, kategori: 'keuangan', tab: 'akuntan', sub: 'opname',  tone: TONE.violet,  alias: 'progres pekerjaan' },
  { key: 'konsolidasi', label: 'Konsolidasi',    icon: BarChart3,   kategori: 'keuangan', path: '/kontraktor/konsolidasi', tone: TONE.gold, tag: 'BARU', alias: 'laporan semua proyek gabungan' },

  // ── Lapangan ──────────────────────────────────────────────────────────────
  { key: 'spk',          label: 'SPK Digital',     icon: FileSignature, kategori: 'lapangan', tab: 'spk',      tone: TONE.violet, alias: 'kontrak tanda tangan' },
  { key: 'lapangan',     label: 'Laporan Harian',  icon: HardHat,       kategori: 'lapangan', tab: 'lapangan', tone: TONE.amber,  alias: 'laporan pekerja mandor' },
  { key: 'kalender',     label: 'Kalender Progres', icon: CalendarDays, kategori: 'lapangan', tab: 'lapangan', tone: TONE.emerald, alias: 'progres harian owner' },
  { key: 'pakai_bahan',  label: 'Pakai Material',  icon: PackageOpen,   kategori: 'lapangan', path: '/kontraktor/material', tone: TONE.blue, tag: 'BARU', alias: 'penggunaan material lapangan' },
  { key: 'req_bahan',    label: 'Request Material', icon: ShoppingCart, kategori: 'lapangan', path: '/kontraktor/material?sub=request', tone: TONE.rose, tag: 'BARU', alias: 'permintaan bahan kekurangan' },
  { key: 'link_pekerja', label: 'Link Pekerja',    icon: Link2,         kategori: 'lapangan', tab: 'lapangan', tone: TONE.slate,  alias: 'bagikan link laporan' },

  // ── Tim ───────────────────────────────────────────────────────────────────
  { key: 'tim',        label: 'Anggota Tim',   icon: Users,       kategori: 'tim', path: '/kontraktor/tim', tone: TONE.navy,   tag: 'BARU' },
  { key: 'tim_undang', label: 'Undang Anggota', icon: UserPlus,   kategori: 'tim', path: '/kontraktor/tim?aksi=undang', tone: TONE.emerald, tag: 'BARU', alias: 'invite karyawan' },
  { key: 'tim_role',   label: 'Role & Akses',  icon: ShieldCheck, kategori: 'tim', path: '/kontraktor/tim?tab=role', tone: TONE.violet, tag: 'BARU', alias: 'hak akses jabatan' },

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

/** Pencarian sederhana berdasarkan label + alias + kategori. */
export function cariMenu(items: MenuItem[], q: string): MenuItem[] {
  const t = q.trim().toLowerCase()
  if (!t) return items
  return items.filter(i =>
    i.label.toLowerCase().includes(t) ||
    (i.alias ?? '').toLowerCase().includes(t) ||
    i.kategori.includes(t),
  )
}
