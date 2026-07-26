// ============================================================
// PropFS — API Tim & Pengguna (Kontraktor AI)
// Membaca/mengubah daftar anggota lewat REST langsung, dan membuat akun
// baru (User ID + password) lewat Edge Function create-team-user karena
// pembuatan akun butuh service_role yang tidak boleh ada di browser.
// window.__teamApiMock dipakai test E2E.
// ============================================================

import { useAuthStore } from '@/store/authStore'
import type { TeamRole } from '@/lib/teamRoles'

export interface TeamMember {
  id: string
  owner_id: string
  member_user_id: string | null
  /** Email asli anggota — data kontak, BUKAN yang dipakai login. */
  member_email: string
  /** User ID yang diketik anggota di halaman login tim. */
  username: string | null
  /** Email internal <username>@<kode>.tim.propfs.id yang dipakai auth. */
  login_email: string | null
  nama: string
  jabatan: string
  no_wa: string
  role: TeamRole
  project_ids: string[] | null
  status: 'aktif' | 'nonaktif' | 'diundang'
  created_at?: string
  joined_at?: string | null
}

export interface BuatPenggunaInput {
  username: string
  email: string
  password: string
  nama: string
  jabatan: string
  no_wa: string
  role: TeamRole
}

export interface Workspace {
  owner_id: string
  nama: string
  perusahaan: string
  role: TeamRole
  /** Kode Perusahaan workspace ini, mis. "PFS-4K7M". */
  kode?: string
  /** Keputusan akses Kontraktor AI perusahaan, dihitung backend. */
  owner_akses?: boolean | null
  /** Paket Kontraktor AI milik pemilik workspace — untuk ditampilkan. */
  owner_plan?: string | null
  owner_plan_expires?: string | null
  owner_trial_expires?: string | null
}

/** Kuota pengguna tim milik perusahaan, apa adanya dari backend. */
export interface KuotaTimMentah {
  batas_dasar: number
  slot_tambahan: number
  terpakai: number
}

export interface TeamApi {
  listMembers(): Promise<TeamMember[]>
  createUser(input: BuatPenggunaInput): Promise<{ member: TeamMember; kode: string; loginEmail: string }>
  /** Atur ulang password anggota (karyawan lupa password). */
  resetPassword(memberId: string, password: string): Promise<void>
  updateMember(id: string, patch: Partial<Pick<TeamMember, 'role' | 'jabatan' | 'nama' | 'no_wa' | 'status'>>): Promise<void>
  deleteMember(id: string): Promise<void>
  myWorkspaces(): Promise<Workspace[]>
  /** Kode Perusahaan milik pengguna yang sedang login; dibuatkan bila belum ada. */
  kodePerusahaan(): Promise<string>
  /** Kuota pengguna tim: batas dasar, slot tambahan yang dibeli, dan terpakai. */
  kuotaTim(): Promise<KuotaTimMentah | null>
}

// ── REST langsung (pola sama dengan fieldReports.ts / materialApi.ts) ───────
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

/** Detik kedaluwarsa dari klaim `exp` JWT; null bila tidak terbaca. */
function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch { return null }
}

/**
 * Token yang dijamin masih berlaku untuk memanggil Edge Function.
 * Token di localStorage bisa sudah kedaluwarsa (umumnya 1 jam); bila begitu
 * kita minta sesi baru ke supabase-js — dengan batas waktu, karena klien itu
 * kadang menggantung di Chrome mobile.
 */
async function freshAccessToken(url: string): Promise<string | null> {
  const stored = storedAccessToken(url)
  const exp = stored ? jwtExp(stored) : null
  const masihLama = exp !== null && exp * 1000 - Date.now() > 60_000
  if (stored && masihLama) return stored

  try {
    const { supabase } = await import('@/lib/supabase')
    const segar = await Promise.race([
      supabase.auth.getSession().then(r => r.data.session?.access_token ?? null),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 6000)),
    ])
    if (segar) return segar
  } catch { /* pakai token tersimpan sebagai upaya terakhir */ }
  return stored
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

/**
 * Panggil Edge Function create-team-user (aksi 'buat' atau 'reset').
 * Kegagalan jaringan diterjemahkan jadi petunjuk yang bisa ditindaklanjuti —
 * di sini penyebabnya hampir selalu deploy atau setelan Verify JWT.
 */
async function panggilFungsiTim(payload: Record<string, unknown>): Promise<{
  member?: TeamMember; kode?: string; login_email?: string
}> {
  const { url, key } = supaConf()
  const token = await freshAccessToken(url)
  if (!token) throw new Error('Sesi login tidak ditemukan — muat ulang halaman lalu coba lagi.')

  const exp = jwtExp(token)
  if (exp !== null && exp * 1000 <= Date.now()) {
    throw new Error('Sesi login sudah kedaluwarsa. Logout lalu login kembali, kemudian ulangi.')
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(`${url}/functions/v1/create-team-user`, {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({})) as {
      error?: string; member?: TeamMember; kode?: string; login_email?: string
    }
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Edge Function "create-team-user" belum ditemukan. Deploy dulu di Supabase → Edge Functions (nama harus persis create-team-user).')
      }
      throw new Error(data.error || `Permintaan gagal (HTTP ${res.status}).`)
    }
    return data
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Waktu habis — periksa koneksi lalu coba lagi.')
    }
    // fetch() melempar TypeError bila permintaan tidak pernah sampai:
    // fungsi belum di-deploy, atau preflight CORS ditolak gateway.
    if (e instanceof TypeError) {
      throw new Error(
        'Tidak bisa menghubungi Edge Function "create-team-user". Periksa di Supabase → Edge Functions: '
        + '(1) fungsi sudah ter-deploy dengan nama persis create-team-user, dan '
        + '(2) setelan "Verify JWT" pada fungsi ini DIMATIKAN — fungsi sudah memeriksa sesi login sendiri.',
      )
    }
    throw e
  } finally { clearTimeout(timer) }
}

const realApi: TeamApi = {
  async listMembers() {
    const res = await restFetch('team_members?select=*&order=created_at.desc')
    if (!res.ok) throw new Error(`Gagal memuat anggota (HTTP ${res.status}).`)
    return await res.json() as TeamMember[]
  },

  async createUser(input) {
    const data = await panggilFungsiTim({ aksi: 'buat', ...input })
    return {
      member: data.member as TeamMember,
      kode: data.kode ?? '',
      loginEmail: data.login_email ?? '',
    }
  },

  async resetPassword(memberId, password) {
    await panggilFungsiTim({ aksi: 'reset', member_id: memberId, password })
  },

  async updateMember(id, patch) {
    const res = await restFetch(`team_members?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(`Gagal memperbarui anggota (HTTP ${res.status}).`)
  },

  async deleteMember(id) {
    const res = await restFetch(`team_members?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus anggota (HTTP ${res.status}).`)
  },

  async myWorkspaces() {
    const res = await restFetch('rpc/my_workspaces', { method: 'POST', body: '{}' })
    if (!res.ok) return []
    return await res.json() as Workspace[]
  },

  async kodePerusahaan() {
    const res = await restFetch('rpc/kode_perusahaan_saya', { method: 'POST', body: '{}' })
    if (!res.ok) {
      throw new Error(
        `Gagal membaca Kode Perusahaan (HTTP ${res.status}) — pastikan migration_team_login.sql sudah dijalankan.`,
      )
    }
    return (await res.json() as string | null) ?? ''
  },

  async kuotaTim() {
    const res = await restFetch('rpc/kuota_tim_saya', { method: 'POST', body: '{}' })
    // Halaman Tim tetap berguna walau migrasi kuota belum dijalankan —
    // null membuat pemanggil memakai batas bawaan.
    if (!res.ok) return null
    const rows = await res.json() as KuotaTimMentah[] | KuotaTimMentah | null
    return Array.isArray(rows) ? rows[0] ?? null : rows
  },
}

/**
 * Nama perusahaan pemilik sebuah Kode Perusahaan. Dipakai halaman login tim
 * SEBELUM pengguna masuk, jadi memakai kunci anon. Mengembalikan string
 * kosong bila kodenya tidak dikenal.
 */
export async function perusahaanByKode(kode: string, ms = 8000): Promise<string> {
  const { url, key } = supaConf()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(`${url}/rest/v1/rpc/perusahaan_by_kode`, {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kode: kode }),
    })
    if (!res.ok) return ''
    const rows = await res.json() as Array<{ nama_perusahaan?: string }>
    return rows?.[0]?.nama_perusahaan ?? ''
  } catch { return '' } finally { clearTimeout(timer) }
}

export function teamApi(): TeamApi {
  return (window as { __teamApiMock?: TeamApi }).__teamApiMock ?? realApi
}

// ── Workspace aktif (milik sendiri vs milik perusahaan lain) ────────────────
const WS_KEY = 'propfs-workspace-owner'

/** Owner id workspace yang sedang dibuka; null = workspace milik sendiri. */
export function getWorkspaceOwner(): string | null {
  try { return localStorage.getItem(WS_KEY) || null } catch { return null }
}
export function setWorkspaceOwner(ownerId: string | null): void {
  try {
    if (ownerId) localStorage.setItem(WS_KEY, ownerId)
    else localStorage.removeItem(WS_KEY)
  } catch { /* ignore */ }
}

// ── Sesi tim ────────────────────────────────────────────────────────────────
// Ditandai saat seseorang masuk lewat halaman login tim (/tim/masuk). Sesi
// seperti ini dikunci pada satu perusahaan: tidak ada Feasibility Study,
// tidak ada dashboard akun utama, dan tidak ada penukar workspace.
const SESI_TIM_KEY = 'propfs-sesi-tim'

export function sesiTim(): boolean {
  try { return localStorage.getItem(SESI_TIM_KEY) === '1' } catch { return false }
}
export function setSesiTim(aktif: boolean): void {
  try {
    if (aktif) localStorage.setItem(SESI_TIM_KEY, '1')
    else localStorage.removeItem(SESI_TIM_KEY)
  } catch { /* ignore */ }
}
/** Bersihkan jejak sesi tim & workspace — dipanggil saat logout. */
export function bersihkanSesiTim(): void {
  setSesiTim(false)
  setWorkspaceOwner(null)
}

/** Id pemilik data yang harus dipakai saat query — anggota membaca data owner. */
export function dataOwnerId(): string | null {
  const ws = getWorkspaceOwner()
  if (ws) return ws
  try { return useAuthStore.getState().user?.id ?? null } catch { return null }
}

/** Role pengguna saat ini pada workspace aktif. Pemilik sendiri = 'pemilik'. */
export function roleSaatIni(workspaces: Workspace[]): TeamRole {
  const ws = getWorkspaceOwner()
  if (!ws) return 'pemilik'
  return workspaces.find(w => w.owner_id === ws)?.role ?? 'viewer'
}

/** Password acak yang mudah dibacakan lewat telepon (tanpa karakter mirip). */
export function passwordAcak(panjang = 10): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyz'
  const besar = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const angka = '23456789'
  const semua = huruf + besar + angka
  const acak = (s: string) => s[Math.floor(Math.random() * s.length)]
  // pastikan minimal 1 huruf besar dan 1 angka
  let out = acak(besar) + acak(angka)
  while (out.length < panjang) out += acak(semua)
  return out.split('').sort(() => Math.random() - 0.5).join('')
}
