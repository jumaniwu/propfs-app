// ============================================================
// PropFS — API Procurement (vendor, katalog, purchase order)
// REST langsung dengan batas waktu, pola sama dengan materialApi.ts —
// supabase-js bisa menggantung saat menyegarkan token di Chrome mobile.
// window.__procurementApiMock dipakai test E2E.
// ============================================================

import type {
  Vendor, VendorItem, PurchaseOrder, StatusVendor, StatusPo, PoItem,
} from './procurement'
import { milikWorkspace } from './procurement'
import { dataOwnerId } from './teamApi'
import { tautanPublik } from './tautanPendek'
import type { InvoiceVendor, StatusInvoice } from './invoiceVendor'
import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'

export interface BuatPoInput {
  nomor: string
  vendor_id: string | null
  vendor_nama: string
  vendor_wa: string
  project_name: string
  butuh_tanggal: string | null
  term: 'cash' | 'term'
  term_hari: number
  items: PoItem[]
  subtotal: number
  ppn_pct: number
  ppn: number
  total: number
  catatan: string
}

/** Profil vendor yang dikirim dari halaman registrasi publik. */
export interface ProfilVendorPublik {
  nama: string
  pic: string
  no_wa: string
  email: string
  alamat: string
  npwp: string
  kategori: string
  term: 'cash' | 'term'
  term_hari: number
  catatan: string
}

/** PO + kop perusahaan pembeli, sebagaimana dikembalikan po_get_by_token. */
export type PoPublik = PurchaseOrder & {
  kop_nama?: string
  kop_logo?: string
  kop_kontak?: string
}

export type ItemVendorPublik = Pick<VendorItem, 'nama' | 'satuan' | 'harga' | 'merek' | 'min_order' | 'catatan'>

export interface ProcurementApi {
  // ── Dalam aplikasi (butuh login) ──
  listVendors(): Promise<Vendor[]>
  updateVendor(id: string, patch: Partial<Pick<Vendor, 'nama' | 'pic' | 'no_wa' | 'email' | 'alamat' | 'npwp' | 'kategori' | 'term' | 'term_hari' | 'catatan' | 'status'>>): Promise<void>
  deleteVendor(id: string): Promise<void>
  /** Vendor ditambahkan manual oleh admin (tanpa lewat link registrasi). */
  createVendor(v: ProfilVendorPublik & { status?: StatusVendor }): Promise<Vendor>

  listVendorItems(): Promise<VendorItem[]>
  createVendorItem(vendorId: string, item: ItemVendorPublik): Promise<void>
  deleteVendorItem(id: string): Promise<void>

  listPo(): Promise<PurchaseOrder[]>
  createPo(input: BuatPoInput): Promise<PurchaseOrder>
  /**
   * Perbaiki data PO yang boleh berubah setelah terbit. Dipakai menyelaraskan
   * nomor WA vendor: salinannya bisa kosong bila PO dibuat sebelum nomor
   * vendornya diisi, dan itu tidak boleh membuat PO tak pernah bisa dikirim.
   */
  updatePo(id: string, patch: Partial<Pick<PurchaseOrder, 'vendor_wa' | 'vendor_nama' | 'catatan'>>): Promise<void>
  /** Tanda tangan pembuat atau persetujuan; status ikut disesuaikan. */
  signPo(id: string, peran: 'pembuat' | 'approver', data: {
    nama: string; jabatan: string; signature: string; catatan?: string
  }, status: StatusPo): Promise<void>
  rejectPo(id: string, catatan: string, oleh: string): Promise<void>
  /** Menandai terkirim + menambah qty_dipesan pada tiap request, di server. */
  kirimPo(id: string): Promise<boolean>
  deletePo(id: string): Promise<void>

  /** Tautan registrasi vendor milik perusahaan ini. */
  vendorToken(): Promise<string>
  /**
   * Terbitkan token registrasi baru. Dipakai untuk memperpendek tautan lama
   * dan untuk mematikan tautan yang terlanjur bocor — tautan sebelumnya
   * langsung tidak berlaku.
   */
  vendorTokenPutarUlang(): Promise<string>

  // ── Publik (tanpa login) ──
  perusahaanByVendorToken(token: string): Promise<string>
  daftarVendor(token: string, profil: ProfilVendorPublik, items: ItemVendorPublik[]): Promise<string | null>
  vendorBySelfToken(token: string): Promise<(ProfilVendorPublik & { status: StatusVendor; items: ItemVendorPublik[] }) | null>
  simpanItemVendor(token: string, items: ItemVendorPublik[]): Promise<boolean>
  /**
   * PO untuk halaman publik vendor, beserta kop perusahaan pembelinya.
   * Kop ikut dari server karena vendor membuka halaman ini tanpa login —
   * cache lokal dan sesi milik perangkat pemakai aplikasi, bukan vendor.
   */
  poByToken(token: string): Promise<PoPublik | null>

  // ── Tagihan dari vendor ───────────────────────────────────────────────
  /** Terbitkan tautan kirim-invoice untuk sebuah PO; token BARU tiap kali. */
  terbitkanInvoiceToken(poId: string): Promise<string | null>
  listInvoice(): Promise<BarisInvoice[]>
  updateInvoice(id: string, patch: Partial<Pick<BarisInvoice,
    'status' | 'catatan_periksa' | 'diperiksa_oleh' | 'diperiksa_at'>>): Promise<void>
  deleteInvoice(id: string): Promise<void>
  /** Yang dilihat vendor saat membuka tautannya; null bila tautannya mati. */
  invoiceFormByToken(token: string): Promise<FormInvoicePublik | null>
  /** Vendor mengirim tagihannya. Mengembalikan id barisnya, atau null. */
  kirimInvoice(token: string, data: KirimInvoice): Promise<string | null>
}

/** Satu tagihan sebagaimana tersimpan. */
export interface BarisInvoice extends InvoiceVendor {
  id: string
  po_id: string
  po_nomor: string
  vendor_id: string | null
  vendor_nama: string
  project_name: string
  status: StatusInvoice
  catatan_periksa: string
  diperiksa_oleh: string
  diperiksa_at: string | null
  berkas_nama: string
  berkas_mime: string
  berkas_data?: string | null
  created_at: string
}

/** Ringkasan PO yang ditampilkan pada halaman kirim invoice. */
export interface FormInvoicePublik {
  po_nomor: string
  vendor_nama: string
  project_name: string
  term: string
  term_hari: number
  items: PoItem[]
  total: number
  /** Sudah ada berapa tagihan untuk PO ini — vendor perlu tahu ia tidak dobel. */
  sudah_dikirim: number
}

export type KirimInvoice = InvoiceVendor & {
  berkas_nama?: string
  berkas_mime?: string
  berkas_data?: string
}

// ── REST langsung ───────────────────────────────────────────────────────────
function supaConf() {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  return {
    url: env.VITE_SUPABASE_URL || 'https://ciazztqmkhzrgbaqfyyz.supabase.co',
    key: env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1BxZhA48DtR8KG94xUm0zg_6w-dg1xD',
  }
}
function storedAccessToken(url: string): string | null {
  try {
    const ref = url.replace(/^https?:\/\//, '').split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p.access_token ?? p.currentSession?.access_token ?? p.session?.access_token ?? null
  } catch { return null }
}

/** `publik: true` memakai kunci anon saja — halaman vendor tidak punya sesi. */
async function restFetch(
  path: string, init: RequestInit = {}, ms = 15000, publik = false,
): Promise<Response> {
  const { url, key } = supaConf()
  // Token dari localStorage bisa saja sudah kedaluwarsa — supabase-js
  // menyegarkannya di latar belakang, dan pada pembukaan PERTAMA halaman
  // sering mendahuluinya. Dulu itu tampil sebagai "HTTP 401, muat ulang dulu".
  // Sekali ditolak, sesinya disegarkan lalu permintaannya diulang satu kali.
  const token = publik ? null : storedAccessToken(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    // Dikirim lewat fungsi supaya bisa diulang dengan token baru tanpa
    // menyusun ulang permintaannya — badan dan header harus persis sama.
    const kirim = (jwt: string | null) => fetch(`${url}/rest/v1/${path}`, {
      ...init, signal: ctrl.signal,
      headers: {
        apikey: key, Authorization: `Bearer ${jwt ?? key}`,
        'Content-Type': 'application/json', ...(init.headers ?? {}),
      },
    })
    const res = await kirim(token)
    if (!perluSegarkan(res.status, !!token)) return res
    const baru = await segarkanToken()
    return baru && baru !== token ? await kirim(baru) : res
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Waktu habis — periksa koneksi internet lalu coba lagi.')
    }
    throw e
  } finally { clearTimeout(timer) }
}

async function rpc<T>(fn: string, body: unknown, publik = false): Promise<T> {
  const res = await restFetch(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) }, 15000, publik)
  if (!res.ok) {
    throw new Error(
      `Gagal (HTTP ${res.status}).`
      + (res.status === 404 ? ' Pastikan migration_procurement.sql sudah dijalankan di Supabase.' : ''),
    )
  }
  return await res.json() as T
}

async function ambil<T>(path: string, apa: string): Promise<T> {
  const res = await restFetch(path)
  if (!res.ok) {
    throw new Error(
      `Gagal memuat ${apa} (HTTP ${res.status}).`
      + (res.status === 404 ? ' Jalankan migration_procurement.sql di Supabase SQL Editor.' : ''),
    )
  }
  return await res.json() as T
}

async function ubah(path: string, body: unknown, apa: string): Promise<void> {
  const res = await restFetch(path, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Gagal memperbarui ${apa} (HTTP ${res.status}).`)
}

async function hapus(path: string, apa: string): Promise<void> {
  const res = await restFetch(path, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Gagal menghapus ${apa} (HTTP ${res.status}).`)
}

/** Insert satu baris & kembalikan hasilnya. */
async function sisip<T>(tabel: string, body: unknown, apa: string): Promise<T> {
  const res = await restFetch(tabel, {
    method: 'POST', body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
  if (!res.ok) throw new Error(`Gagal menyimpan ${apa}${sebab(res.status)}`)
  const rows = await res.json() as T[]
  return rows[0]
}

/**
 * Pesan lanjutan menurut kode HTTP. 403 dari PostgREST berarti kebijakan RLS
 * menolak barisnya — nyaris selalu karena migrasi belum dijalankan sehingga
 * `is_team_member` belum ada, atau sesi login sudah kedaluwarsa.
 */
function sebab(status: number): string {
  if (status === 403) {
    return ' — akses ditolak. Pastikan migration_procurement.sql sudah'
      + ' dijalankan di Supabase, lalu keluar dan masuk lagi.'
  }
  if (status === 404) return ' — jalankan migration_procurement.sql di Supabase SQL Editor.'
  return ` (HTTP ${status}).`
}

const realApi: ProcurementApi = {
  listVendors: () => ambil<Vendor[]>('vendors?select=*&order=created_at.desc', 'vendor'),
  updateVendor: (id, patch) => ubah(`vendors?id=eq.${id}`, patch, 'vendor'),
  deleteVendor: (id) => hapus(`vendors?id=eq.${id}`, 'vendor'),
  createVendor: (v) => sisip<Vendor>(
    'vendors', milikWorkspace({ ...v, status: v.status ?? 'aktif' }, dataOwnerId()), 'vendor',
  ),

  listVendorItems: () => ambil<VendorItem[]>('vendor_items?select=*&order=nama.asc', 'katalog'),
  createVendorItem: async (vendorId, item) => {
    await sisip(
      'vendor_items', milikWorkspace({ ...item, vendor_id: vendorId }, dataOwnerId()), 'barang vendor',
    )
  },
  deleteVendorItem: (id) => hapus(`vendor_items?id=eq.${id}`, 'barang vendor'),

  listPo: () => ambil<PurchaseOrder[]>('purchase_orders?select=*&order=created_at.desc', 'purchase order'),
  createPo: (input) => sisip<PurchaseOrder>(
    'purchase_orders', milikWorkspace({ ...input, status: 'draft' }, dataOwnerId()), 'purchase order',
  ),
  updatePo: (id, patch) => ubah(`purchase_orders?id=eq.${id}`, patch, 'purchase order'),

  async signPo(id, peran, data, status) {
    const patch = peran === 'pembuat'
      ? {
        pembuat_nama: data.nama, pembuat_jabatan: data.jabatan,
        pembuat_signature: data.signature, pembuat_signed_at: new Date().toISOString(),
        status,
      }
      : {
        approver_nama: data.nama, approver_jabatan: data.jabatan,
        approver_signature: data.signature, approver_signed_at: new Date().toISOString(),
        catatan_approval: data.catatan ?? '', status,
      }
    await ubah(`purchase_orders?id=eq.${id}`, patch, 'purchase order')
  },

  rejectPo: (id, catatan, oleh) => ubah(`purchase_orders?id=eq.${id}`, {
    status: 'ditolak', catatan_approval: catatan,
    approver_nama: oleh, approver_signed_at: new Date().toISOString(),
  }, 'purchase order'),

  // Penambahan qty_dipesan dan perubahan status dilakukan dalam satu
  // transaksi di server; kalau dipecah di klien, angka terpesan bisa
  // separuh jalan ketika koneksi putus.
  kirimPo: (id) => rpc<boolean>('po_tandai_terkirim', { p_po_id: id }),

  deletePo: (id) => hapus(`purchase_orders?id=eq.${id}`, 'purchase order'),

  async vendorToken() {
    return (await rpc<string | null>('vendor_token_saya', {})) ?? ''
  },

  async vendorTokenPutarUlang() {
    return (await rpc<string | null>('vendor_token_putar_ulang', {})) ?? ''
  },

  // ── Publik ──
  async perusahaanByVendorToken(token) {
    const rows = await rpc<Array<{ nama_perusahaan?: string }>>(
      'perusahaan_by_vendor_token', { p_token: token }, true,
    ).catch(() => [])
    return rows?.[0]?.nama_perusahaan ?? ''
  },

  daftarVendor: (token, profil, items) => rpc<string | null>(
    'vendor_daftar', { p_token: token, p_profil: profil, p_items: items }, true,
  ),

  async vendorBySelfToken(token) {
    const rows = await rpc<Array<ProfilVendorPublik & { status: StatusVendor; items: ItemVendorPublik[] }>>(
      'vendor_by_self_token', { p_token: token }, true,
    )
    return rows?.[0] ?? null
  },

  simpanItemVendor: (token, items) => rpc<boolean>(
    'vendor_item_simpan', { p_token: token, p_items: items }, true,
  ),

  async poByToken(token) {
    const rows = await rpc<PoPublik[]>('po_get_by_token', { p_token: token }, true)
    return rows?.[0] ?? null
  },

  async terbitkanInvoiceToken(poId) {
    return (await rpc<string | null>('po_terbitkan_invoice_token', { p_po_id: poId })) ?? null
  },
  async listInvoice() {
    // `berkas_data` sengaja TIDAK ikut pada daftar: satu foto invoice ratusan
    // kilobita, dan menariknya untuk setiap baris membuat halaman yang
    // seharusnya ringan menjadi berat justru saat tagihannya menumpuk.
    return (await ambil<BarisInvoice[]>(
      'vendor_invoices?select=id,po_id,po_nomor,vendor_id,vendor_nama,project_name,'
      + 'nomor_invoice,tanggal,jatuh_tempo,items,subtotal,ppn,total,catatan,dikirim_oleh,'
      + 'berkas_nama,berkas_mime,status,catatan_periksa,diperiksa_oleh,diperiksa_at,created_at'
      + '&order=created_at.desc', 'daftar invoice',
    )) ?? []
  },
  async updateInvoice(id, patch) {
    await ubah(`vendor_invoices?id=eq.${id}`, patch, 'memperbarui invoice')
  },
  async deleteInvoice(id) { await hapus(`vendor_invoices?id=eq.${id}`, 'menghapus invoice') },

  async invoiceFormByToken(token) {
    const rows = await rpc<FormInvoicePublik[]>('invoice_form_by_token', { p_token: token }, true)
    return rows?.[0] ?? null
  },
  async kirimInvoice(token, data) {
    return (await rpc<string | null>('invoice_kirim', { p_token: token, p_data: data }, true)) ?? null
  },
}

export function procurementApi(): ProcurementApi {
  return (window as { __procurementApiMock?: ProcurementApi }).__procurementApiMock ?? realApi
}

/** Tautan registrasi vendor yang dibagikan lewat WA/email. */
export function vendorDaftarLink(token: string): string {
  return tautanPublik('vendor_daftar', token, window.location.origin)
}
/** Tautan pribadi vendor untuk memperbarui daftar barangnya. */
export function vendorItemLink(token: string): string {
  return tautanPublik('vendor_item', token, window.location.origin)
}
/** Tautan tempat vendor mengirim tagihannya, ikut di pesan WA yang sama. */
export function invoiceKirimLink(token: string): string {
  return tautanPublik('invoice', token, window.location.origin)
}
/** Tautan PO yang dikirim ke vendor — WhatsApp tidak bisa melampirkan file. */
export function poViewLink(token: string): string {
  return tautanPublik('po', token, window.location.origin)
}
