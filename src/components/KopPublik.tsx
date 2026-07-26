// ============================================================
// Kop & kaki halaman PUBLIK (dibuka tanpa login lewat link bertoken).
// Menampilkan nama & logo perusahaan pemilik link; identitas PropFS hanya
// dipakai bila perusahaan belum mengisi profilnya.
// ============================================================
import { useEffect, useState } from 'react'
import { identitasLaporan, PROFIL_KOSONG, type CompanyProfile } from '@/lib/branding'

function supaConf() {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  return {
    url: env.VITE_SUPABASE_URL || 'https://ciazztqmkhzrgbaqfyyz.supabase.co',
    key: env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1BxZhA48DtR8KG94xUm0zg_6w-dg1xD',
  }
}

/** Ambil nama & logo perusahaan pemilik token (RPC publik). */
export function useBrandingPublik(token: string): CompanyProfile {
  const [profil, setProfil] = useState<CompanyProfile>(PROFIL_KOSONG)

  useEffect(() => {
    if (!token) return
    const mock = (window as { __brandingPublikMock?: CompanyProfile }).__brandingPublikMock
    if (mock) { setProfil(mock); return }

    const { url, key } = supaConf()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    fetch(`${url}/rest/v1/rpc/branding_by_token`, {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((rows: Array<{ nama_perusahaan?: string; logo_url?: string }> | null) => {
        const row = Array.isArray(rows) ? rows[0] : null
        if (row?.nama_perusahaan) {
          setProfil({ ...PROFIL_KOSONG, nama: row.nama_perusahaan, logo: row.logo_url ?? '' })
        }
      })
      .catch(() => { /* migrasi belum dijalankan / offline — pakai identitas bawaan */ })
      .finally(() => clearTimeout(timer))

    return () => { clearTimeout(timer); ctrl.abort() }
  }, [token])

  return profil
}

/** Judul halaman publik: logo + nama perusahaan, dengan sub-judul modul. */
export function KopPublik({ profil, subjudul }: { profil: CompanyProfile; subjudul: string }) {
  const merek = identitasLaporan(profil)
  return (
    <div className="text-center">
      {merek.logo && (
        <img src={merek.logo} alt={merek.nama}
          className="h-12 max-w-[180px] object-contain mx-auto mb-2" />
      )}
      <p className="font-serif font-bold text-xl text-navy">
        {merek.bawaan ? 'PropFS · Kontraktor AI' : merek.nama}
      </p>
      <p className="text-xs text-muted-foreground">{subjudul}</p>
    </div>
  )
}

/** Kaki halaman publik. */
export function KakiPublik({ profil }: { profil: CompanyProfile }) {
  const merek = identitasLaporan(profil)
  return (
    <p className="text-center text-[10px] text-muted-foreground">
      {merek.bawaan
        ? 'Dokumen digital · propfs.id · Kontraktor AI'
        : `Dokumen digital · ${merek.nama}`}
    </p>
  )
}
