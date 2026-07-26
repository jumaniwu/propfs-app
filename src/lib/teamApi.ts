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
  member_email: string
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
}

export interface TeamApi {
  listMembers(): Promise<TeamMember[]>
  createUser(input: BuatPenggunaInput): Promise<{ member: TeamMember; sudahPunyaAkun: boolean }>
  updateMember(id: string, patch: Partial<Pick<TeamMember, 'role' | 'jabatan' | 'nama' | 'no_wa' | 'status'>>): Promise<void>
  deleteMember(id: string): Promise<void>
  myWorkspaces(): Promise<Workspace[]>
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

const realApi: TeamApi = {
  async listMembers() {
    const res = await restFetch('team_members?select=*&order=created_at.desc')
    if (!res.ok) throw new Error(`Gagal memuat anggota (HTTP ${res.status}).`)
    return await res.json() as TeamMember[]
  },

  async createUser(input) {
    const { url, key } = supaConf()
    const token = storedAccessToken(url)
    if (!token) throw new Error('Sesi login tidak ditemukan — muat ulang halaman lalu coba lagi.')

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    try {
      const res = await fetch(`${url}/functions/v1/create-team-user`, {
        method: 'POST', signal: ctrl.signal,
        headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; member?: TeamMember; sudah_punya_akun?: boolean }
      if (!res.ok) {
        throw new Error(data.error
          || `Gagal membuat pengguna (HTTP ${res.status}). Pastikan Edge Function create-team-user sudah di-deploy.`)
      }
      return { member: data.member as TeamMember, sudahPunyaAkun: !!data.sudah_punya_akun }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Waktu habis saat membuat pengguna.')
      throw e
    } finally { clearTimeout(timer) }
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
