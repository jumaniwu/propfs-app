// ============================================================
// PropFS — API Chat Tim
// REST langsung dengan batas waktu, pola sama dengan penerimaanApi.ts.
// window.__chatTimApiMock dipakai test E2E.
// ============================================================

import type { PesanTim } from './chatTim'
import { dataOwnerId } from './teamApi'
import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'

export interface KirimPesanInput {
  teks: string
  foto?: string[]
  project_name?: string
  balas_id?: string | null
  penulis_nama: string
  penulis_role: string
}

/** Satu baris hasil RPC chat_tim_keaktifan. */
export interface KeaktifanTim {
  penulis_id: string | null
  penulis_nama: string
  penulis_role: string
  jumlah: number
  hari_aktif: number
  terakhir: string
}

export interface ChatTimApi {
  /** Pesan terbaru lebih dulu di kabel; pemanggilnya yang mengurut ulang. */
  list(batas?: number): Promise<PesanTim[]>
  kirim(input: KirimPesanInput): Promise<PesanTim>
  hapus(id: string): Promise<void>
  keaktifan(hari?: number): Promise<KeaktifanTim[]>
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
function idSaya(): string | null {
  try {
    const { url } = supaConf()
    const ref = url.replace(/^https?:\/\//, '').split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p.user?.id ?? p.currentSession?.user?.id ?? p.session?.user?.id ?? null
  } catch { return null }
}

// Foto lapangan dikirim sebagai data URL, jadi badannya bisa besar.
async function restFetch(path: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const { url, key } = supaConf()
  // Token dari localStorage bisa saja sudah kedaluwarsa; sekali ditolak,
  // sesinya disegarkan lalu permintaannya diulang satu kali. Lihat sesiSupabase.ts.
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

function sebab(status: number): string {
  if (status === 404) return ' — jalankan migration_chat_tim.sql di Supabase SQL Editor.'
  if (status === 403) {
    return ' — akses ditolak. Pastikan migration_chat_tim.sql sudah dijalankan'
      + ' dan Anda masih anggota aktif workspace ini.'
  }
  if (status === 413) return ' — fotonya terlalu besar. Coba resolusi lebih kecil.'
  return ` (HTTP ${status}).`
}

const realApi: ChatTimApi = {
  async list(batas = 200) {
    const owner = dataOwnerId()
    if (!owner) return []
    const res = await restFetch(
      `team_messages?select=*&user_id=eq.${owner}&order=created_at.desc&limit=${Math.max(1, batas)}`)
    if (!res.ok) throw new Error(`Gagal memuat percakapan tim${sebab(res.status)}`)
    return await res.json() as PesanTim[]
  },

  async kirim(input) {
    const owner = dataOwnerId()
    const saya = idSaya()
    // RLS mensyaratkan penulis_id = auth.uid(). Diperiksa di sini juga supaya
    // kegagalannya berbunyi jelas, bukan sekadar "HTTP 403".
    if (!owner || !saya) throw new Error('Sesi tidak dikenali — keluar lalu masuk lagi.')
    const res = await restFetch('team_messages', {
      method: 'POST',
      body: JSON.stringify({
        user_id: owner,
        penulis_id: saya,
        penulis_nama: input.penulis_nama,
        penulis_role: input.penulis_role,
        teks: input.teks,
        foto: input.foto ?? [],
        project_name: input.project_name ?? '',
        balas_id: input.balas_id ?? null,
      }),
      headers: { Prefer: 'return=representation' },
    })
    if (!res.ok) throw new Error(`Gagal mengirim pesan${sebab(res.status)}`)
    return (await res.json() as PesanTim[])[0]
  },

  async hapus(id) {
    const res = await restFetch(`team_messages?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus pesan${sebab(res.status)}`)
  },

  async keaktifan(hari = 30) {
    const owner = dataOwnerId()
    if (!owner) return []
    const res = await restFetch('rpc/chat_tim_keaktifan', {
      method: 'POST', body: JSON.stringify({ p_owner: owner, p_hari: hari }),
    })
    if (!res.ok) throw new Error(`Gagal memuat keaktifan tim${sebab(res.status)}`)
    return await res.json() as KeaktifanTim[]
  },
}

export function chatTimApi(): ChatTimApi {
  return (window as { __chatTimApiMock?: ChatTimApi }).__chatTimApiMock ?? realApi
}
