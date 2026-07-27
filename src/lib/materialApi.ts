// ============================================================
// PropFS — Penggunaan & Request Material (Kontraktor AI)
// Pekerja mengisi lewat link laporan yang sudah ada (report_token).
// REST langsung (bypass session supabase-js yang bisa menggantung).
// window.__materialApiMock dipakai test E2E.
// ============================================================

import type { MaterialScheduleItem } from '@/types/cost.types'
import { pengelompokNama } from './namaMaterial.ts'

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
   *
   * `user_id` WAJIB ada: RLS material_requests memakai
   * `auth.uid() = user_id or is_team_member(user_id)`, dan baris tanpa user_id
   * membuat pemeriksaan itu bernilai NULL — PostgREST menolaknya sebagai
   * HTTP 403, bukan pesan kolom kosong yang lebih jelas. Isinya pemilik
   * WORKSPACE (dataOwnerId), bukan uid penyisip, supaya permintaan anggota tim
   * tetap terlihat oleh pemilik perusahaan.
   */
  createRequest(r: {
    tanggal: string; pemohon: string; nama: string; satuan: string; qty: number
    urgensi: Urgensi; butuh_tanggal: string | null; catatan: string; project_name: string
    user_id: string
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
  /**
   * Pemakaian, request, dan penerimaan barang di proyek pemilik token ini,
   * untuk halaman laporan publik. Dipakai menyarankan nama material dan
   * menampilkan sisa stok — supaya tukang tidak mengetik nama dari nol.
   */
  byToken(token: string): Promise<StokMentah>
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
    if (!res.ok) {
      throw new Error(
        `Gagal menyimpan permintaan (HTTP ${res.status}).`
        + (res.status === 403 ? ' Akses ditolak — coba keluar lalu masuk lagi.' : ''),
      )
    }
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
  async byToken(token) {
    // Cakupannya per PROYEK, bukan per link — request yang dibuat dari dalam
    // aplikasi tidak punya log_id, dan satu proyek bisa punya banyak link.
    const kosong = { usage: [], requests: [], penerimaan: [], pembelian: [], penyesuaian: [] }
    try {
      const rows = await rpc<Partial<StokMentah>[]>('material_stok_by_report_token', { p_token: token })
      const r = rows?.[0]
      // Kolom pembelian & penyesuaian baru ada sejak migration_stok_gudang.sql;
      // versi fungsi yang lebih tua tetap terpakai tanpa membuat halaman gagal.
      return { ...kosong, ...r, usage: r?.usage ?? [], requests: r?.requests ?? [] }
    } catch {
      // migration_stok_lapangan.sql belum dijalankan: mundur ke fungsi lama
      // supaya halaman tetap jalan, meski daftarnya hanya sebatas link ini.
      const rows = await rpc<Partial<StokMentah>[]>('material_by_report_token', { p_token: token })
      const r = rows?.[0]
      return { ...kosong, usage: r?.usage ?? [], requests: r?.requests ?? [] }
    }
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

// ── Stok di lapangan, untuk halaman laporan publik ─────────────────────────

/** Bentuk minimal yang dibutuhkan perhitungan stok — bukan seluruh baris. */
export interface BarisStok { nama: string; satuan?: string; qty: number }
export interface BarisStokRequest extends BarisStok { status?: string }
export interface StokMentah {
  usage: BarisStok[]
  requests: BarisStokRequest[]
  /** Item pada Delivery Order — barang yang benar-benar sudah datang. */
  penerimaan: BarisStok[]
  /** Pembelian material dari nota di Realisasi Biaya (tanpa PO/surat jalan). */
  pembelian: BarisStok[]
  /** Penyesuaian stok manual di Inventori. Qty bertanda: negatif mengurangi. */
  penyesuaian: BarisStok[]
}

export interface StokMaterial {
  nama: string
  satuan: string
  /** Qty yang sudah masuk gudang: dari DO bila ada, kalau tidak dari request 'diterima'. */
  masuk: number
  /** Qty yang sudah dicatat terpakai. */
  terpakai: number
  /**
   * Sisa sebenarnya: masuk dikurangi pemakaian lapangan DAN penyesuaian
   * negatif dari kantor. Bisa negatif bila pemakaian dicatat sebelum
   * penerimaannya sempat masuk — dilaporkan apa adanya, bukan dipaksa nol.
   */
  stok: number
  /** Sudah diminta tapi belum sampai — disetujui/dibeli, belum 'diterima'. */
  dalamProses: number
  /** true bila belum ada satu pun penerimaan tercatat untuk material ini. */
  belumAdaPenerimaan: boolean
}

/**
 * Daftar material yang pernah tersentuh di proyek ini beserta sisanya.
 *
 * Dipakai halaman /l/:token supaya tukang tidak perlu mengetik nama material
 * dari nol — nama, satuan, dan sisa stok datang dari data yang sudah ada.
 *
 * Sengaja dihitung dari pemakaian, request, dan penerimaan barang saja, bukan
 * dari Material Schedule: rencana bukan stok — rencana adalah niat, bukan
 * barang yang ada.
 *
 * Barang bisa masuk gudang lewat tiga pintu yang sama sahnya, dan ketiganya
 * DIJUMLAHKAN karena masing-masing mencatat kejadian yang berbeda:
 *   1. Surat jalan (DO) — barang dari PO yang benar-benar datang.
 *   2. Nota pembelian di Realisasi Biaya — belanja langsung ke toko tanpa PO.
 *      Nota yang sudah dicatat sebagai surat jalan disaring di server, jadi
 *      yang sampai ke sini pasti pembelian yang berdiri sendiri.
 *   3. Penyesuaian stok manual di Inventori — koreksi, opname, temuan gudang.
 *      Qty-nya bertanda: negatif berarti barang keluar.
 *
 * Status 'diterima' pada request BUKAN pintu keempat melainkan CADANGAN: itu
 * penandaan manual dari tim yang belum memakai PO maupun nota, dan barang yang
 * sama gampang tercatat dua kali. Angkanya hanya dipakai bila ketiga pintu di
 * atas tidak menghasilkan apa pun.
 *
 * Bila semuanya kosong, `belumAdaPenerimaan` menyala supaya tampilan bisa
 * mengatakan "belum tercatat" alih-alih menampilkan angka 0 yang terbaca
 * seperti "barangnya habis".
 */
export function stokLapangan(
  pemakaian: BarisStok[] | null | undefined,
  requests: BarisStokRequest[] | null | undefined,
  penerimaan?: BarisStok[] | null,
  gudang?: { pembelian?: BarisStok[] | null; penyesuaian?: BarisStok[] | null } | null,
): StokMaterial[] {
  const map = new Map<string, StokMaterial & {
    _do: number; _manual: number; _beli: number; _sesuaiMasuk: number; _sesuaiKeluar: number
  }>()

  // Satu barang bisa tertulis dengan beberapa nama karena diketik ulang di
  // nota, request, PO, dan koreksi gudang. Kelompoknya disusun dari SELURUH
  // nama yang terlibat lebih dulu, supaya "Triplek 9mm Pku" dan
  // "Triplek 9mm Pku @130lmbr/pallet" jatuh ke satu baris, bukan dua.
  const kelompok = pengelompokNama([
    ...(pemakaian ?? []).map(x => x?.nama ?? ''),
    ...(requests ?? []).map(x => x?.nama ?? ''),
    ...(penerimaan ?? []).map(x => x?.nama ?? ''),
    ...(gudang?.pembelian ?? []).map(x => x?.nama ?? ''),
    ...(gudang?.penyesuaian ?? []).map(x => x?.nama ?? ''),
  ])

  const ambil = (nama: string, satuan: string) => {
    const bersih = kelompok.tampilan(nama)
    if (!bersih) return null
    const k = kelompok.kunci(nama)
    const ada = map.get(k)
    if (ada) {
      if (!ada.satuan && satuan?.trim()) ada.satuan = satuan.trim()
      return ada
    }
    const baru = {
      nama: bersih, satuan: (satuan ?? '').trim(),
      masuk: 0, terpakai: 0, stok: 0, dalamProses: 0, belumAdaPenerimaan: true,
      _do: 0, _manual: 0, _beli: 0, _sesuaiMasuk: 0, _sesuaiKeluar: 0,
    }
    map.set(k, baru)
    return baru
  }

  for (const u of pemakaian ?? []) {
    const row = ambil(u?.nama ?? '', u?.satuan ?? '')
    if (row) row.terpakai += Math.max(0, Number(u.qty) || 0)
  }
  for (const q of requests ?? []) {
    const row = ambil(q?.nama ?? '', q?.satuan ?? '')
    if (!row) continue
    const qty = Math.max(0, Number(q.qty) || 0)
    if (q.status === 'diterima') row._manual += qty
    else if (q.status !== 'ditolak') row.dalamProses += qty
  }
  for (const d of penerimaan ?? []) {
    const row = ambil(d?.nama ?? '', d?.satuan ?? '')
    if (row) row._do += Math.max(0, Number(d.qty) || 0)
  }
  for (const b of gudang?.pembelian ?? []) {
    const row = ambil(b?.nama ?? '', b?.satuan ?? '')
    if (row) row._beli += Math.max(0, Number(b.qty) || 0)
  }
  for (const a of gudang?.penyesuaian ?? []) {
    const row = ambil(a?.nama ?? '', a?.satuan ?? '')
    if (!row) continue
    const qty = Number(a.qty) || 0
    if (qty >= 0) row._sesuaiMasuk += qty
    else row._sesuaiKeluar += -qty
  }

  return [...map.values()]
    .map(({ _do, _manual, _beli, _sesuaiMasuk, _sesuaiKeluar, ...r }) => {
      const tercatat = _do + _beli + _sesuaiMasuk
      const masuk = tercatat > 0 ? tercatat : _manual
      const keluar = r.terpakai + _sesuaiKeluar
      return {
        ...r,
        masuk,
        // Barang yang sudah datang — lewat surat jalan maupun nota — tidak
        // lagi "dalam perjalanan", meski status request-nya masih 'dibeli'
        // dan belum sempat diperbarui.
        dalamProses: Math.max(0, r.dalamProses - _do - _beli),
        stok: masuk - keluar,
        belumAdaPenerimaan: tercatat === 0 && _manual === 0,
      }
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

/**
 * Saran nama material sesuai yang sedang diketik. Cocokkan per kata supaya
 * "semen 50" menemukan "Semen Portland 50kg"; tanpa ketikan, seluruh daftar
 * ditawarkan agar tukang bisa memilih tanpa mengetik sama sekali.
 */
export function cariMaterial(daftar: StokMaterial[], q: string, batas = 8): StokMaterial[] {
  const kata = (q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const cocok = kata.length === 0
    ? daftar
    : daftar.filter(m => {
      const teks = `${m.nama} ${m.satuan}`.toLowerCase()
      return kata.every(k => teks.includes(k))
    })
  return cocok.slice(0, Math.max(0, batas))
}
