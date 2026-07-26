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

// ── Aturan watermark ────────────────────────────────────────────────────────

/** Teks watermark yang dicetak pada laporan paket gratis. */
export const TEKS_WATERMARK = 'PropFS — Versi Gratis'

/**
 * Paket yang masih dianggap gratis (belum berlangganan).
 * Laporan pada paket ini diberi watermark; paket berbayar tidak.
 */
const PAKET_GRATIS = new Set(['', 'free', 'trial', 'free_trial'])

/** Apakah laporan perlu diberi watermark untuk paket ini. */
export function perluWatermark(planId: string | null | undefined): boolean {
  return PAKET_GRATIS.has((planId ?? '').trim().toLowerCase())
}

// ── Identitas yang tampil di laporan ────────────────────────────────────────

export interface IdentitasLaporan {
  nama: string
  logo: string
  /** Baris kontak ringkas untuk kop laporan; kosong bila belum diisi. */
  kontak: string
  /** true bila memakai identitas PropFS (perusahaan belum mengisi profil). */
  bawaan: boolean
}

/**
 * Identitas yang dipakai mencetak laporan. Bila nama perusahaan sudah diisi,
 * identitas PropFS TIDAK dipakai lagi.
 */
export function identitasLaporan(profil: CompanyProfile | null | undefined): IdentitasLaporan {
  const nama = (profil?.nama ?? '').trim()
  if (!nama) {
    return { nama: 'PropFS', logo: '', kontak: 'propfs.id', bawaan: true }
  }
  const kontak = [profil?.alamat, profil?.telepon, profil?.email, profil?.website]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join(' · ')
  return { nama, logo: (profil?.logo ?? '').trim(), kontak, bawaan: false }
}

/** Baris kaki laporan: identitas perusahaan, plus penanda gratis bila perlu. */
export function footerLaporan(
  profil: CompanyProfile | null | undefined,
  planId: string | null | undefined,
): string {
  const id = identitasLaporan(profil)
  const dasar = id.bawaan
    ? 'Dokumen digital · propfs.id'
    : `Dokumen digital · ${id.nama}${id.kontak ? ' · ' + id.kontak : ''}`
  return perluWatermark(planId) ? `${dasar} · ${TEKS_WATERMARK}` : dasar
}

/**
 * Potongan kop + watermark untuk disebar ke setiap sheet laporan Excel:
 * `buildReportSheet({ ...spec, ...kopLaporan(profil, plan) })`.
 */
export function kopLaporan(
  profil: CompanyProfile | null | undefined,
  planId: string | null | undefined,
): { kop?: string; kopKontak?: string; watermark?: string } {
  const id = identitasLaporan(profil)
  const out: { kop?: string; kopKontak?: string; watermark?: string } = {}
  if (!id.bawaan) {
    out.kop = id.nama
    if (id.kontak) out.kopKontak = id.kontak
  }
  if (perluWatermark(planId)) out.watermark = TEKS_WATERMARK
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
