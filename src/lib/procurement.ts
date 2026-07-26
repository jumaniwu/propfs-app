// ============================================================
// PropFS — Procurement (logika murni, tanpa DOM)
//
// Menyambung Material Request yang sudah disetujui ke Purchase Order:
// menghitung sisa yang belum dipesan, menjumlahkan nilai PO, membandingkan
// harga antar vendor, dan menjaga aturan bahwa PO hanya boleh dikirim setelah
// ditandatangani pembuat DAN disetujui.
// ============================================================

import type { MaterialRequest } from './materialApi'

// ── Vendor & katalog ────────────────────────────────────────────────────────

export type TermPembayaran = 'cash' | 'term'
export type StatusVendor = 'baru' | 'aktif' | 'nonaktif'

export interface Vendor {
  id: string
  nama: string
  pic: string
  no_wa: string
  email: string
  alamat: string
  npwp: string
  kategori: string
  term: TermPembayaran
  term_hari: number
  catatan: string
  status: StatusVendor
  self_token?: string
  created_at?: string
}

export interface VendorItem {
  id: string
  vendor_id: string
  nama: string
  satuan: string
  harga: number
  merek: string
  min_order: number
  catatan: string
}

export const LABEL_TERM: Record<TermPembayaran, string> = {
  cash: 'Cash / Tunai',
  term: 'Tempo',
}

export const LABEL_STATUS_VENDOR: Record<StatusVendor, string> = {
  baru: 'Baru — perlu verifikasi',
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
}

export const TONE_STATUS_VENDOR: Record<StatusVendor, string> = {
  baru: 'bg-amber-100 text-amber-700',
  aktif: 'bg-emerald-100 text-emerald-700',
  nonaktif: 'bg-slate-200 text-slate-600',
}

/** "Tempo 30 hari" / "Cash". Dipakai di kartu vendor dan pada PDF PO. */
export function teksTerm(term: TermPembayaran, hari: number): string {
  if (term !== 'term') return LABEL_TERM.cash
  const h = Math.max(0, Math.floor(hari || 0))
  return h > 0 ? `Tempo ${h} hari` : 'Tempo'
}

// ── Purchase Order ──────────────────────────────────────────────────────────

export type StatusPo =
  | 'draft'               // baru dibuat, belum ditandatangani
  | 'menunggu_approval'   // sudah ditandatangani pembuat
  | 'disetujui'           // sudah disetujui, siap dikirim
  | 'terkirim'            // sudah dikirim ke vendor
  | 'ditolak'
  | 'selesai'             // barang diterima

export interface PoItem {
  /** Material Request sumbernya; kosong bila barang ditambah manual. */
  request_id?: string | null
  nama: string
  satuan: string
  qty: number
  harga: number
  subtotal: number
}

export interface PurchaseOrder {
  id: string
  nomor: string
  vendor_id: string | null
  vendor_nama: string
  vendor_wa: string
  project_name: string
  tanggal: string
  butuh_tanggal: string | null
  term: TermPembayaran
  term_hari: number
  items: PoItem[]
  subtotal: number
  ppn_pct: number
  ppn: number
  total: number
  catatan: string
  status: StatusPo
  pembuat_nama: string
  pembuat_jabatan: string
  pembuat_signature: string | null
  pembuat_signed_at: string | null
  approver_nama: string
  approver_jabatan: string
  approver_signature: string | null
  approver_signed_at: string | null
  catatan_approval: string
  view_token: string
  terkirim_at?: string | null
  created_at?: string
}

export const LABEL_STATUS_PO: Record<StatusPo, string> = {
  draft: 'Draft',
  menunggu_approval: 'Menunggu Approval',
  disetujui: 'Disetujui',
  terkirim: 'Terkirim ke Vendor',
  ditolak: 'Ditolak',
  selesai: 'Selesai',
}

export const TONE_STATUS_PO: Record<StatusPo, string> = {
  draft: 'bg-slate-200 text-slate-600',
  menunggu_approval: 'bg-amber-100 text-amber-700',
  disetujui: 'bg-blue-100 text-blue-700',
  terkirim: 'bg-emerald-100 text-emerald-700',
  ditolak: 'bg-rose-100 text-rose-700',
  selesai: 'bg-navy/10 text-navy',
}

/** Nomor PO otomatis, mengikuti pola nomorSpkOtomatis(). */
export function nomorPo(count: number, sekarang = new Date()): string {
  const mm = String(sekarang.getMonth() + 1).padStart(2, '0')
  return `PO/${String(Math.max(0, count) + 1).padStart(3, '0')}/${mm}/${sekarang.getFullYear()}`
}

export interface TotalPo {
  subtotal: number
  ppn: number
  total: number
  /** Baris dengan subtotal yang sudah dihitung ulang. */
  items: PoItem[]
}

/**
 * Hitung ulang seluruh nilai PO dari qty × harga. Subtotal per baris tidak
 * dipercaya dari masukan supaya nilai PO tidak pernah berbeda dengan
 * rinciannya. Semua angka dibulatkan ke rupiah utuh.
 */
export function hitungTotalPo(items: PoItem[], ppnPct = 0): TotalPo {
  const baris = (items ?? []).map(i => {
    const qty = Number(i.qty) || 0
    const harga = Number(i.harga) || 0
    return { ...i, qty, harga, subtotal: Math.round(qty * harga) }
  })
  const subtotal = baris.reduce((s, i) => s + i.subtotal, 0)
  const pct = Math.max(0, Number(ppnPct) || 0)
  const ppn = Math.round(subtotal * (pct / 100))
  return { subtotal, ppn, total: subtotal + ppn, items: baris }
}

// ── Sambungan ke Material Request ───────────────────────────────────────────

/** Qty request yang masih belum dipesan. Tidak pernah negatif. */
export function sisaQty(r: Pick<MaterialRequest, 'qty'> & { qty_dipesan?: number }): number {
  const qty = Number(r.qty) || 0
  const dipesan = Math.max(0, Number(r.qty_dipesan) || 0)
  return Math.max(0, qty - dipesan)
}

/**
 * Request yang siap dipesan: sudah disetujui dan masih ada sisa qty.
 * Yang masih menunggu, ditolak, atau sudah penuh terpesan tidak ikut —
 * pemesanan hanya boleh lahir dari permintaan yang sudah lewat approval.
 */
export function belumTerpesan<T extends Pick<MaterialRequest, 'status' | 'qty'> & { qty_dipesan?: number }>(
  requests: T[],
): T[] {
  return (requests ?? []).filter(r => r.status === 'disetujui' && sisaQty(r) > 0)
}

/**
 * Apakah PO boleh dikirim ke vendor. Wajib ada tanda tangan pembuat DAN
 * persetujuan; keduanya diperiksa ulang di server oleh po_tandai_terkirim().
 * Mengembalikan alasan penolakan agar tombolnya bisa menjelaskan diri sendiri.
 */
export function bolehKirimPo(po: Pick<PurchaseOrder,
  'pembuat_signature' | 'approver_signature' | 'status' | 'items' | 'vendor_wa'>,
): { boleh: boolean; alasan: string } {
  if (!po.items || po.items.length === 0) return { boleh: false, alasan: 'PO belum punya barang.' }
  if (po.status === 'ditolak') return { boleh: false, alasan: 'PO sudah ditolak.' }
  if (po.status === 'terkirim' || po.status === 'selesai') {
    return { boleh: false, alasan: 'PO sudah dikirim ke vendor.' }
  }
  if (!po.pembuat_signature) return { boleh: false, alasan: 'Belum ditandatangani pembuat PO.' }
  if (!po.approver_signature) return { boleh: false, alasan: 'Belum disetujui Owner / Manajemen / Project Manager.' }
  if (!po.vendor_wa) return { boleh: false, alasan: 'Nomor WhatsApp vendor belum ada.' }
  return { boleh: true, alasan: '' }
}

/** Status PO yang sesuai setelah tanda tangan / persetujuan terisi. */
export function statusPoSetelah(po: Pick<PurchaseOrder,
  'pembuat_signature' | 'approver_signature' | 'status'>): StatusPo {
  if (po.status === 'terkirim' || po.status === 'selesai' || po.status === 'ditolak') return po.status
  if (po.pembuat_signature && po.approver_signature) return 'disetujui'
  if (po.pembuat_signature) return 'menunggu_approval'
  return 'draft'
}

// ── Katalog: perbandingan harga antar vendor ────────────────────────────────

export interface BarisKatalog {
  nama: string
  satuan: string
  /** Penawaran dari tiap vendor, termurah lebih dulu. */
  penawaran: Array<{
    vendor_id: string
    vendor_nama: string
    harga: number
    merek: string
    term: string
  }>
  hargaTermurah: number
  /** Nama vendor dengan harga termurah. */
  vendorTermurah: string
}

const kunci = (s: string) => (s ?? '').trim().toLowerCase()

/**
 * Kelompokkan barang vendor menurut namanya agar harga bisa dibandingkan.
 * Nama dibandingkan tanpa memperhatikan huruf besar/kecil dan spasi berlebih,
 * karena vendor mengisi sendiri dan penulisannya tidak akan seragam.
 */
export function ringkasKatalog(
  items: Array<VendorItem & { vendor_nama?: string }>,
  vendors: Array<Pick<Vendor, 'id' | 'nama' | 'term' | 'term_hari'>> = [],
): BarisKatalog[] {
  const petaVendor = new Map(vendors.map(v => [v.id, v]))
  const map = new Map<string, BarisKatalog>()

  for (const it of items ?? []) {
    const nama = (it.nama ?? '').trim()
    if (!nama) continue
    const k = kunci(nama)
    const v = petaVendor.get(it.vendor_id)
    const baris = map.get(k) ?? {
      nama, satuan: it.satuan || '-', penawaran: [],
      hargaTermurah: 0, vendorTermurah: '',
    }
    if (!baris.satuan || baris.satuan === '-') baris.satuan = it.satuan || '-'
    baris.penawaran.push({
      vendor_id: it.vendor_id,
      vendor_nama: it.vendor_nama || v?.nama || 'Vendor',
      harga: Number(it.harga) || 0,
      merek: it.merek || '',
      term: v ? teksTerm(v.term, v.term_hari) : '',
    })
    map.set(k, baris)
  }

  return [...map.values()]
    .map(b => {
      // Harga 0 berarti vendor belum mengisi harga — jangan dianggap termurah.
      const penawaran = [...b.penawaran].sort((a, c) => {
        if ((a.harga > 0) !== (c.harga > 0)) return a.harga > 0 ? -1 : 1
        return a.harga - c.harga
      })
      const termurah = penawaran.find(p => p.harga > 0)
      return {
        ...b, penawaran,
        hargaTermurah: termurah?.harga ?? 0,
        vendorTermurah: termurah?.vendor_nama ?? '',
      }
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

/**
 * Harga yang ditawarkan vendor tertentu untuk sebuah nama barang.
 * Dipakai mengisi harga otomatis saat membuat PO; 0 bila vendor tidak
 * menawarkan barang itu, supaya pembuat PO tahu harus mengisi manual.
 */
export function hargaVendorUntuk(
  items: VendorItem[], vendorId: string, nama: string,
): number {
  const k = kunci(nama)
  const harga = (items ?? [])
    .filter(i => i.vendor_id === vendorId && kunci(i.nama) === k)
    .map(i => Number(i.harga) || 0)
    .filter(h => h > 0)
  return harga.length > 0 ? Math.min(...harga) : 0
}
