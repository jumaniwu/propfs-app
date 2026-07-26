// ============================================================
// PropFS — Penggunaan & Request Material (Kontraktor AI)
// Pekerja mengisi lewat link laporan yang sudah ada (report_token).
// REST langsung (bypass session supabase-js yang bisa menggantung).
// window.__materialApiMock dipakai test E2E.
// ============================================================

import type { MaterialScheduleItem } from '@/types/cost.types'

export type Urgensi = 'normal' | 'segera' | 'darurat'
export type StatusRequest = 'menunggu' | 'disetujui' | 'ditolak' | 'dibeli' | 'diterima'

export interface MaterialUsage {
  id: string
  log_id: string | null
  project_name: string
  tanggal: string          // YYYY-MM-DD
  nama: string
  satuan: string
  qty: number
  lokasi: string
  pelapor: string
  catatan: string
  photos: string[]
  created_at?: string
}

export interface MaterialRequest {
  id: string
  log_id: string | null
  project_name: string
  tanggal: string
  nama: string
  satuan: string
  qty: number
  urgensi: Urgensi
  butuh_tanggal: string | null
  pemohon: string
  catatan: string
  photos: string[]
  status: StatusRequest
  approver: string
  approved_at: string | null
  catatan_approval: string
  /** Qty yang sudah masuk Purchase Order; sisa = qty − qty_dipesan. */
  qty_dipesan?: number
  created_at?: string
}

export interface MaterialApi {
  listUsage(): Promise<MaterialUsage[]>
  listRequests(): Promise<MaterialRequest[]>
  /**
   * Buat permintaan material dari dalam aplikasi (anggota tim yang login).
   * Sebelum ini, permintaan hanya bisa lahir dari link publik pekerja —
   * PM dan logistik tidak punya jalan sama sekali.
   */
  createRequest(r: {
    tanggal: string; pemohon: string; nama: string; satuan: string; qty: number
    urgensi: Urgensi; butuh_tanggal: string | null; catatan: string; project_name: string
  }): Promise<MaterialRequest>
  setRequestStatus(id: string, status: StatusRequest, approver: string, catatan: string): Promise<void>
  deleteUsage(id: string): Promise<void>
  deleteRequest(id: string): Promise<void>
  // publik (token pekerja)
  submitUsage(token: string, u: {
    tanggal: string; pelapor: string; nama: string; satuan: string
    qty: number; lokasi: string; catatan: string; photos: string[]
  }): Promise<boolean>
  submitRequest(token: string, r: {
    tanggal: string; pemohon: string; nama: string; satuan: string; qty: number
    urgensi: Urgensi; butuhTanggal: string | null; catatan: string; photos: string[]
  }): Promise<boolean>
}

// ── REST langsung (pola sama dengan fieldReports.ts) ─────────────────────────
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
async function restFetch(path: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const { url, key } = supaConf()
  const token = storedAccessToken(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(`${url}/rest/v1/${path}`, {
      ...init, signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Waktu habis — periksa koneksi internet lalu coba lagi.')
    throw e
  } finally { clearTimeout(timer) }
}
async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const res = await restFetch(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Gagal (HTTP ${res.status}).`)
  return await res.json() as T
}

const realApi: MaterialApi = {
  async listUsage() {
    const res = await restFetch('material_usage?select=*&order=tanggal.desc,created_at.desc')
    if (!res.ok) throw new Error(`Gagal memuat pemakaian (HTTP ${res.status}).`)
    return await res.json() as MaterialUsage[]
  },
  async listRequests() {
    const res = await restFetch('material_requests?select=*&order=tanggal.desc,created_at.desc')
    if (!res.ok) throw new Error(`Gagal memuat permintaan (HTTP ${res.status}).`)
    return await res.json() as MaterialRequest[]
  },
  async createRequest(r) {
    const res = await restFetch('material_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...r, status: 'menunggu', photos: [] }),
    })
    if (!res.ok) throw new Error(`Gagal menyimpan permintaan (HTTP ${res.status}).`)
    const rows = await res.json() as MaterialRequest[]
    return rows[0]
  },

  async setRequestStatus(id, status, approver, catatan) {
    const res = await restFetch(`material_requests?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status, approver,
        catatan_approval: catatan,
        approved_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) throw new Error(`Gagal memperbarui status (HTTP ${res.status}).`)
  },
  async deleteUsage(id) {
    const res = await restFetch(`material_usage?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus (HTTP ${res.status}).`)
  },
  async deleteRequest(id) {
    const res = await restFetch(`material_requests?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus (HTTP ${res.status}).`)
  },
  async submitUsage(token, u) {
    return await rpc<boolean>('material_usage_submit', {
      p_token: token, p_tanggal: u.tanggal, p_pelapor: u.pelapor, p_nama: u.nama,
      p_satuan: u.satuan, p_qty: u.qty, p_lokasi: u.lokasi, p_catatan: u.catatan, p_photos: u.photos,
    }) === true
  },
  async submitRequest(token, r) {
    return await rpc<boolean>('material_request_submit', {
      p_token: token, p_tanggal: r.tanggal, p_pemohon: r.pemohon, p_nama: r.nama,
      p_satuan: r.satuan, p_qty: r.qty, p_urgensi: r.urgensi,
      p_butuh_tanggal: r.butuhTanggal, p_catatan: r.catatan, p_photos: r.photos,
    }) === true
  },
}

export function materialApi(): MaterialApi {
  return (window as { __materialApiMock?: MaterialApi }).__materialApiMock ?? realApi
}

/** Dipakai untuk label & warna chip urgensi. */
export const URGENSI_LABEL: Record<Urgensi, string> = {
  normal: 'Normal', segera: 'Segera', darurat: 'Darurat',
}
export const URGENSI_TONE: Record<Urgensi, string> = {
  normal: 'bg-slate-100 text-slate-600',
  segera: 'bg-amber-100 text-amber-700',
  darurat: 'bg-red-100 text-red-700',
}
export const STATUS_TONE: Record<StatusRequest, string> = {
  menunggu: 'bg-amber-100 text-amber-700',
  disetujui: 'bg-blue-100 text-blue-700',
  ditolak: 'bg-slate-200 text-slate-600',
  dibeli: 'bg-violet-100 text-violet-700',
  diterima: 'bg-emerald-100 text-emerald-700',
}

// ── Ringkasan kekurangan material (logika murni, bisa diuji) ─────────────────

export interface BarisKekurangan {
  nama: string
  satuan: string
  /** Volume rencana dari Material Schedule. 0 bila material ini tidak ada di rencana. */
  rencana: number
  /** Total dipakai di lapangan. */
  terpakai: number
  /** Total qty request yang sudah berstatus diterima (barang sudah datang). */
  diterima: number
  /** Total qty request yang masih menunggu/disetujui/dibeli (belum sampai). */
  dalamProses: number
  /** rencana − terpakai. Negatif = pemakaian melebihi rencana. */
  sisaRencana: number
  /** true bila pemakaian melebihi rencana, atau sisa < 10% rencana. */
  perluPerhatian: boolean
  /** true bila material dipakai/diminta tapi tidak ada di Material Schedule. */
  diluarRencana: boolean
}

const kunciNama = (s: string) => s.trim().toLowerCase()

/**
 * Bandingkan rencana (Material Schedule) dengan pemakaian lapangan dan
 * request material, agar admin cepat melihat material yang menipis atau
 * sudah melewati rencana.
 */
export function ringkasKekurangan(
  rencana: MaterialScheduleItem[],
  pemakaian: MaterialUsage[],
  requests: MaterialRequest[],
): BarisKekurangan[] {
  const map = new Map<string, BarisKekurangan>()

  const ambil = (nama: string, satuan: string): BarisKekurangan => {
    const k = kunciNama(nama)
    const ada = map.get(k)
    if (ada) {
      if (!ada.satuan && satuan) ada.satuan = satuan
      return ada
    }
    const baru: BarisKekurangan = {
      nama: nama.trim(), satuan: satuan || '-', rencana: 0, terpakai: 0,
      diterima: 0, dalamProses: 0, sisaRencana: 0,
      perluPerhatian: false, diluarRencana: true,
    }
    map.set(k, baru)
    return baru
  }

  for (const r of rencana) {
    if (!r.materialName?.trim()) continue
    const row = ambil(r.materialName, r.unit)
    row.rencana += r.estimatedVolume || 0
    row.diluarRencana = false
  }
  for (const u of pemakaian) {
    if (!u.nama?.trim()) continue
    ambil(u.nama, u.satuan).terpakai += u.qty || 0
  }
  for (const q of requests) {
    if (!q.nama?.trim()) continue
    const row = ambil(q.nama, q.satuan)
    if (q.status === 'diterima') row.diterima += q.qty || 0
    else if (q.status !== 'ditolak') row.dalamProses += q.qty || 0
  }

  return [...map.values()]
    .map(r => {
      const sisaRencana = r.rencana - r.terpakai
      const perluPerhatian = r.rencana > 0
        ? sisaRencana < r.rencana * 0.1   // sisa < 10% (termasuk negatif)
        : r.terpakai > 0                   // dipakai tapi tak ada di rencana
      return { ...r, sisaRencana, perluPerhatian }
    })
    // yang perlu perhatian tampil lebih dulu, lalu pemakaian terbesar
    .sort((a, b) =>
      Number(b.perluPerhatian) - Number(a.perluPerhatian) || b.terpakai - a.terpakai)
}
