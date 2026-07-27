// ============================================================
// PropFS — API Penerimaan (DO) & Pembayaran PO
// REST langsung dengan batas waktu, pola sama dengan procurementApi.ts.
// window.__penerimaanApiMock dipakai test E2E.
// ============================================================

import type { DeliveryOrder, PoPayment, DoItem, MetodeBayar } from './penerimaan'
import { milikWorkspace } from './procurement'
import { dataOwnerId } from './teamApi'

export interface BuatDoInput {
  po_id: string
  nomor_do: string
  nomor_nota: string
  tanggal_nota: string | null
  tanggal_terima: string
  penerima: string
  items: DoItem[]
  catatan: string
  foto: string[]
}

export interface BuatBayarInput {
  po_id: string
  tanggal: string
  jumlah: number
  metode: MetodeBayar
  referensi: string
  bukti: string | null
  catatan: string
}

export interface PenerimaanApi {
  listDo(): Promise<DeliveryOrder[]>
  createDo(input: BuatDoInput): Promise<DeliveryOrder>
  deleteDo(id: string): Promise<void>

  listBayar(): Promise<PoPayment[]>
  createBayar(input: BuatBayarInput): Promise<PoPayment>
  deleteBayar(id: string): Promise<void>

  /** Menandai PO selesai (barang lengkap) atau membatalkannya, di server. */
  tandaiSelesai(poId: string, selesai: boolean): Promise<boolean>
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

// Bukti bayar & foto nota berupa data URL, jadi kirimannya bisa besar —
// batas waktunya dilonggarkan dibanding permintaan biasa.
async function restFetch(path: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const { url, key } = supaConf()
  const token = storedAccessToken(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(`${url}/rest/v1/${path}`, {
      ...init, signal: ctrl.signal,
      headers: {
        apikey: key, Authorization: `Bearer ${token ?? key}`,
        'Content-Type': 'application/json', ...(init.headers ?? {}),
      },
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Waktu habis — periksa koneksi internet lalu coba lagi.')
    }
    throw e
  } finally { clearTimeout(timer) }
}

function sebab(status: number): string {
  if (status === 403) {
    return ' — akses ditolak. Pastikan migration_penerimaan.sql sudah'
      + ' dijalankan di Supabase, lalu keluar dan masuk lagi.'
  }
  if (status === 404) return ' — jalankan migration_penerimaan.sql di Supabase SQL Editor.'
  if (status === 413) return ' — berkasnya terlalu besar. Coba foto dengan resolusi lebih kecil.'
  return ` (HTTP ${status}).`
}

async function ambil<T>(path: string, apa: string): Promise<T> {
  const res = await restFetch(path)
  if (!res.ok) throw new Error(`Gagal memuat ${apa}${sebab(res.status)}`)
  return await res.json() as T
}

async function sisip<T>(tabel: string, body: unknown, apa: string): Promise<T> {
  const res = await restFetch(tabel, {
    method: 'POST', body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
  if (!res.ok) throw new Error(`Gagal menyimpan ${apa}${sebab(res.status)}`)
  return (await res.json() as T[])[0]
}

async function hapus(path: string, apa: string): Promise<void> {
  const res = await restFetch(path, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Gagal menghapus ${apa}${sebab(res.status)}`)
}

const realApi: PenerimaanApi = {
  listDo: () => ambil<DeliveryOrder[]>(
    'delivery_orders?select=*&order=tanggal_terima.desc,created_at.desc', 'penerimaan barang'),
  createDo: (input) => sisip<DeliveryOrder>(
    'delivery_orders', milikWorkspace({ ...input }, dataOwnerId()), 'penerimaan barang'),
  deleteDo: (id) => hapus(`delivery_orders?id=eq.${id}`, 'penerimaan barang'),

  listBayar: () => ambil<PoPayment[]>(
    'po_payments?select=*&order=tanggal.desc,created_at.desc', 'pembayaran'),
  createBayar: (input) => sisip<PoPayment>(
    'po_payments', milikWorkspace({ ...input }, dataOwnerId()), 'pembayaran'),
  deleteBayar: (id) => hapus(`po_payments?id=eq.${id}`, 'pembayaran'),

  async tandaiSelesai(poId, selesai) {
    const res = await restFetch('rpc/po_tandai_selesai', {
      method: 'POST', body: JSON.stringify({ p_po_id: poId, p_selesai: selesai }),
    })
    if (!res.ok) throw new Error(`Gagal memperbarui status PO${sebab(res.status)}`)
    return await res.json() as boolean
  },
}

export function penerimaanApi(): PenerimaanApi {
  return (window as { __penerimaanApiMock?: PenerimaanApi }).__penerimaanApiMock ?? realApi
}
