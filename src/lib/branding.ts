import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'
// ============================================================
// PropFS — Profil Perusahaan & Branding Laporan (Kontraktor AI)
// Nama PT, logo, dan data kontak yang dipakai di SEMUA laporan.
// Bila perusahaan sudah mengisi profilnya, identitas PropFS tidak lagi
// ditampilkan di laporan — diganti identitas perusahaan tersebut.
//
// Watermark hanya muncul pada paket GRATIS. Begitu berlangganan, seluruh
// laporan bersih tanpa watermark.
// ============================================================

export interface CompanyProfile {
  nama: string
  /** Logo sebagai data URL (sudah dikecilkan). Kosong = pakai logo PropFS. */
  logo: string
  alamat: string
  telepon: string
  email: string
  website: string
  npwp: string
}

export const PROFIL_KOSONG: CompanyProfile = {
  nama: '', logo: '', alamat: '', telepon: '', email: '', website: '', npwp: '',
}

// ── Identitas yang tampil di laporan ────────────────────────────────────────

export interface IdentitasLaporan {
  nama: string
  logo: string
  /** Baris kontak ringkas untuk kop laporan; kosong bila belum diisi. */
  kontak: string
  /** true bila memakai identitas PropFS (perusahaan belum mengisi profil). */
  bawaan: boolean
  /**
   * Dari mana nama itu berasal:
   *   'perusahaan' — Profil Perusahaan di Pengaturan
   *   'akun'       — nama pemilik akun, dipakai kontraktor perorangan
   *   'bawaan'     — tidak ada keduanya, jatuh ke identitas PropFS
   */
  sumber: 'perusahaan' | 'akun' | 'bawaan'
}

/**
 * Identitas pemilik akun, dipakai bila Profil Perusahaan belum diisi.
 *
 * Kontraktor perorangan tidak pernah membuka Pengaturan dan tidak punya nama
 * PT — tanpa cadangan ini, dokumen yang dikirim ke vendor tidak menyebut satu
 * pun nama pemesan.
 */
export interface IdentitasCadangan {
  /** profile.full_name */
  nama?: string | null
  /** profile.company — dipakai lebih dulu bila ada. */
  perusahaan?: string | null
  telepon?: string | null
  email?: string | null
}

/**
 * Identitas yang dipakai mencetak laporan, berurutan:
 *
 *   1. Profil Perusahaan (nama PT + logo + kontak) bila sudah diisi
 *   2. Nama pemilik akun, untuk kontraktor perorangan
 *   3. Identitas PropFS sebagai kop bawaan
 */
export function identitasLaporan(
  profil: CompanyProfile | null | undefined,
  cadangan?: IdentitasCadangan | null,
): IdentitasLaporan {
  const nama = (profil?.nama ?? '').trim()
  if (nama) {
    const kontak = [profil?.alamat, profil?.telepon, profil?.email, profil?.website]
      .map(s => (s ?? '').trim())
      .filter(Boolean)
      .join(' · ')
    return { nama, logo: (profil?.logo ?? '').trim(), kontak, bawaan: false, sumber: 'perusahaan' }
  }

  const namaAkun = [(cadangan?.perusahaan ?? '').trim(), (cadangan?.nama ?? '').trim()]
    .find(Boolean) ?? ''
  if (namaAkun) {
    const kontak = [cadangan?.telepon, cadangan?.email]
      .map(s => (s ?? '').trim())
      .filter(Boolean)
      .join(' · ')
    // Tanpa logo: akun perorangan tidak punya berkas logo untuk dipakai.
    return { nama: namaAkun, logo: '', kontak, bawaan: false, sumber: 'akun' }
  }

  return { nama: 'PropFS', logo: '', kontak: 'propfs.id', bawaan: true, sumber: 'bawaan' }
}

/** Baris kaki laporan: identitas perusahaan. */
export function footerLaporan(profil: CompanyProfile | null | undefined): string {
  const id = identitasLaporan(profil)
  return id.bawaan
    ? 'Dokumen digital · propfs.id'
    : `Dokumen digital · ${id.nama}${id.kontak ? ' · ' + id.kontak : ''}`
}

/**
 * Potongan kop untuk disebar ke setiap sheet laporan Excel:
 * `buildReportSheet({ ...spec, ...kopLaporan(profil) })`.
 */
export function kopLaporan(
  profil: CompanyProfile | null | undefined,
): { kop?: string; kopKontak?: string } {
  const id = identitasLaporan(profil)
  const out: { kop?: string; kopKontak?: string } = {}
  if (!id.bawaan) {
    out.kop = id.nama
    if (id.kontak) out.kopKontak = id.kontak
  }
  return out
}

// ── Penyimpanan ─────────────────────────────────────────────────────────────
// Cache lokal supaya laporan bisa dicetak tanpa menunggu jaringan.

const KEY = 'propfs-company-profile'

/**
 * Pemilik data yang sedang dibuka. Dibaca langsung dari localStorage (bukan
 * lewat store) agar modul ini tetap murni dan bisa diuji di Node.
 */
function ownerId(): string | null {
  try {
    const ws = localStorage.getItem('propfs-workspace-owner')
    if (ws) return ws
    const { url } = supaConf()
    const ref = url.replace(/^https?:\/\//, '').split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p.user?.id ?? p.currentSession?.user?.id ?? p.session?.user?.id ?? null
  } catch { return null }
}

function cacheKey(): string {
  const owner = ownerId()
  return owner ? `${KEY}:${owner}` : KEY
}

/** Baca profil dari cache lokal (sinkron — aman dipanggil saat mencetak). */
export function getBrandingCache(): CompanyProfile {
  try {
    const raw = localStorage.getItem(cacheKey())
    if (!raw) return { ...PROFIL_KOSONG }
    return { ...PROFIL_KOSONG, ...(JSON.parse(raw) as Partial<CompanyProfile>) }
  } catch { return { ...PROFIL_KOSONG } }
}

function setBrandingCache(p: CompanyProfile): void {
  try { localStorage.setItem(cacheKey(), JSON.stringify(p)) } catch { /* ignore */ }
}

export interface BrandingApi {
  load(): Promise<CompanyProfile>
  save(p: CompanyProfile): Promise<void>
}

// REST langsung — pola sama dengan fieldReports.ts / materialApi.ts
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
  // Token dari localStorage bisa saja sudah kedaluwarsa — supabase-js
  // menyegarkannya di latar belakang, dan pada pembukaan PERTAMA halaman
  // sering mendahuluinya. Dulu itu tampil sebagai "HTTP 401, muat ulang dulu".
  // Sekali ditolak, sesinya disegarkan lalu permintaannya diulang satu kali.
  const token = storedAccessToken(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    // Dikirim lewat fungsi supaya bisa diulang dengan token baru tanpa
    // menyusun ulang permintaannya — badan dan header harus persis sama.
    const kirim = (jwt: string | null) => fetch(`${url}/rest/v1/${path}`, {
      ...init, signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${jwt ?? key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    const res = await kirim(token)
    if (!perluSegarkan(res.status, !!token)) return res
    const baru = await segarkanToken()
    return baru && baru !== token ? await kirim(baru) : res
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Waktu habis — periksa koneksi internet lalu coba lagi.')
    throw e
  } finally { clearTimeout(timer) }
}

const realApi: BrandingApi = {
  async load() {
    const owner = ownerId()
    if (!owner) return getBrandingCache()
    const res = await restFetch(`company_profiles?select=*&user_id=eq.${owner}`)
    if (!res.ok) throw new Error(`Gagal memuat profil perusahaan (HTTP ${res.status}).`)
    const rows = await res.json() as Array<Partial<CompanyProfile> & { logo_url?: string; nama_perusahaan?: string }>
    const row = rows[0]
    if (!row) return getBrandingCache()
    const profil: CompanyProfile = {
      nama: row.nama_perusahaan ?? '',
      logo: row.logo_url ?? '',
      alamat: row.alamat ?? '',
      telepon: row.telepon ?? '',
      email: row.email ?? '',
      website: row.website ?? '',
      npwp: row.npwp ?? '',
    }
    setBrandingCache(profil)
    return profil
  },

  async save(p) {
    const owner = ownerId()
    if (!owner) throw new Error('Sesi login tidak ditemukan — muat ulang halaman lalu coba lagi.')
    setBrandingCache(p) // simpan lokal dulu agar laporan langsung memakainya
    const res = await restFetch('company_profiles?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: owner,
        nama_perusahaan: p.nama,
        logo_url: p.logo,
        alamat: p.alamat,
        telepon: p.telepon,
        email: p.email,
        website: p.website,
        npwp: p.npwp,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) throw new Error(`Gagal menyimpan profil perusahaan (HTTP ${res.status}).`)
  },
}

export function brandingApi(): BrandingApi {
  return (window as { __brandingApiMock?: BrandingApi }).__brandingApiMock ?? realApi
}
