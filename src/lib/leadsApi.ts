// ============================================================
// PropFS — API Cari Leads
// REST langsung dengan batas waktu, pola sama dengan penerimaanApi.ts.
// window.__leadsApiMock dipakai test E2E.
//
// PENTING soal halaman publik: `formInfo` dan `kirim` dipanggil oleh calon
// konsumen yang TIDAK login. Keduanya harus memakai anon key saja — mengirim
// JWT milik pengguna lain (yang mungkin tertinggal di localStorage perangkat
// bersama) akan ditolak Supabase sebagai 401 dan formnya gagal terbuka.
// ============================================================

import type { Lead, IsiFormLead, StatusLead } from './leads'
import { dataOwnerId } from './teamApi'
import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'

export interface InfoFormLead {
  nama_perusahaan: string
  logo_url: string
  wa_official: string
}

export interface LeadsApi {
  /** Daftar lead workspace aktif, terbaru lebih dulu. */
  list(): Promise<Lead[]>
  ubahStatus(id: string, status: StatusLead, catatan?: string): Promise<void>
  hapus(id: string): Promise<void>
  /** Tautan form milik pengguna; dibuatkan bila belum ada. */
  tokenSaya(): Promise<string>
  /** Ganti tautan form — dipakai bila tautan lama terlanjur tersebar salah. */
  gantiToken(): Promise<string>
  /** Nomor WhatsApp official yang dituju calon konsumen setelah mengisi form. */
  simpanWaOfficial(nomor: string): Promise<void>
  bacaWaOfficial(): Promise<string>

  // ── Dipanggil dari halaman publik, tanpa login ──
  formInfo(token: string): Promise<InfoFormLead | null>
  /** Menyimpan lead; balikannya berisi nomor WA tujuan bila berhasil. */
  kirim(token: string, isi: IsiFormLead): Promise<{ ok: boolean; wa_official: string }>
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

// Foto kondisi bangunan dikirim sebagai data URL, jadi badannya bisa besar.
async function restFetch(path: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const { url, key } = supaConf()
  const token = storedAccessToken(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
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

/**
 * Panggilan dari halaman PUBLIK: anon key saja, tidak pernah membawa JWT.
 * Lihat catatan di kepala berkas — ini yang dulu membuat halaman publik
 * gagal terbuka pada klik pertama.
 */
async function restAnon(path: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const { url, key } = supaConf()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(`${url}/rest/v1/${path}`, {
      ...init, signal: ctrl.signal,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
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
  if (status === 404) return ' — jalankan migration_leads.sql di Supabase SQL Editor.'
  if (status === 403) {
    return ' — akses ditolak. Pastikan migration_leads.sql sudah dijalankan,'
      + ' lalu keluar dan masuk lagi.'
  }
  if (status === 413) return ' — fotonya terlalu besar. Coba resolusi lebih kecil.'
  return ` (HTTP ${status}).`
}

const realApi: LeadsApi = {
  async list() {
    const owner = dataOwnerId()
    if (!owner) return []
    const res = await restFetch(`leads?select=*&user_id=eq.${owner}&order=created_at.desc`)
    if (!res.ok) throw new Error(`Gagal memuat leads${sebab(res.status)}`)
    return await res.json() as Lead[]
  },

  async ubahStatus(id, status, catatan) {
    const isi: Record<string, unknown> = { status }
    if (catatan !== undefined) isi.catatan_internal = catatan
    const res = await restFetch(`leads?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(isi) })
    if (!res.ok) throw new Error(`Gagal memperbarui lead${sebab(res.status)}`)
  },

  async hapus(id) {
    const res = await restFetch(`leads?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus lead${sebab(res.status)}`)
  },

  async tokenSaya() {
    const res = await restFetch('rpc/leads_token_saya', { method: 'POST', body: '{}' })
    if (!res.ok) throw new Error(`Gagal membuat tautan form${sebab(res.status)}`)
    return (await res.json() as string) ?? ''
  },

  async gantiToken() {
    const res = await restFetch('rpc/leads_token_ganti', { method: 'POST', body: '{}' })
    if (!res.ok) throw new Error(`Gagal mengganti tautan form${sebab(res.status)}`)
    return (await res.json() as string) ?? ''
  },

  async simpanWaOfficial(nomor) {
    const owner = dataOwnerId()
    if (!owner) throw new Error('Sesi tidak dikenali — keluar lalu masuk lagi.')
    // Profil perusahaan bisa saja belum pernah dibuat, jadi dipakai upsert.
    const res = await restFetch('company_profiles', {
      method: 'POST',
      body: JSON.stringify({ user_id: owner, wa_official: nomor }),
      headers: { Prefer: 'resolution=merge-duplicates' },
    })
    if (!res.ok) throw new Error(`Gagal menyimpan nomor WhatsApp${sebab(res.status)}`)
  },

  async bacaWaOfficial() {
    const owner = dataOwnerId()
    if (!owner) return ''
    const res = await restFetch(`company_profiles?select=wa_official&user_id=eq.${owner}`)
    if (!res.ok) return ''
    const baris = await res.json() as Array<{ wa_official?: string }>
    return baris[0]?.wa_official ?? ''
  },

  // ── Publik ────────────────────────────────────────────────────────────────
  async formInfo(token) {
    const res = await restAnon('rpc/leads_form_info', {
      method: 'POST', body: JSON.stringify({ p_token: token }),
    })
    if (!res.ok) throw new Error(`Gagal membuka form${sebab(res.status)}`)
    const baris = await res.json() as InfoFormLead[]
    return baris[0] ?? null
  },

  async kirim(token, isi) {
    const res = await restAnon('rpc/leads_kirim', {
      method: 'POST', body: JSON.stringify({ p_token: token, p_data: isi }),
    })
    if (!res.ok) throw new Error(`Gagal mengirim data${sebab(res.status)}`)
    const baris = await res.json() as Array<{ ok: boolean; wa_official: string }>
    return baris[0] ?? { ok: false, wa_official: '' }
  },
}

export function leadsApi(): LeadsApi {
  return (window as { __leadsApiMock?: LeadsApi }).__leadsApiMock ?? realApi
}
