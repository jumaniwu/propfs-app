// ============================================================
// PropFS — API Gambar Kerja & Denah
//
// Dua lapis, dan pemisahannya disengaja:
//
//   TABEL   menyimpan KETERANGAN gambar (nama, versi, kategori, siapa yang
//           mengunggah) lewat REST, pola sama dengan penerimaanApi.
//   STORAGE menyimpan BERKASNYA.
//
// Berkasnya tidak ikut masuk ke baris tabel sebagai base64, tidak seperti foto
// lapangan di modul lain. Gambar kerja berukuran belasan megabita; menaruhnya
// di dalam baris akan membuat SETIAP pembacaan daftar menarik seluruh isinya —
// termasuk saat pengawas hanya ingin melihat nama-namanya di HP.
//
// URL untuk membukanya BERTANDA TANGAN dan berumur pendek, dibuat saat
// gambarnya diketuk. Bucketnya privat: gambar kerja memuat dimensi, detail
// struktur, dan sering nama serta alamat pemiliknya.
// ============================================================

import type { BarisGambar } from './gambarKerja'
import { dataOwnerId } from './teamApi'
import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'

export const BUCKET = 'gambar-kerja'

export interface BuatGambarInput {
  project_name: string
  nama: string
  kategori: string
  versi: number
  path: string
  berkas_nama: string
  mime: string
  ukuran: number
  catatan: string
  perubahan: string
  diunggah_oleh: string
}

export interface GambarKerjaApi {
  list(proyek?: string): Promise<BarisGambar[]>
  /** Unggah berkas + catat barisnya. Berkas dulu: baris tanpa berkas adalah
   *  entri yang diketuk lalu gagal, dan itu lebih membingungkan daripada
   *  unggahan yang gagal dengan terang-terangan. */
  unggah(berkas: File, isi: BuatGambarInput): Promise<BarisGambar>
  /** URL bertanda tangan, berumur pendek. */
  tautan(path: string, detik?: number): Promise<string>
  hapus(id: string): Promise<void>
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

/**
 * Satu permintaan, dengan penyegaran token sekali bila ditolak.
 *
 * `jalur` lengkap dari akar (mis. `rest/v1/...` atau `storage/v1/...`) karena
 * modul ini memakai DUA layanan sekaligus — dan menuliskan awalannya di tiap
 * pemanggil adalah cara paling mudah salah menaruh berkas di tempat yang tidak
 * dijaga aturan akses mana pun.
 */
async function kirimKe(jalur: string, init: RequestInit = {}, ms = 120_000): Promise<Response> {
  const { url, key } = supaConf()
  const token = storedAccessToken(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const kirim = (jwt: string | null) => fetch(`${url}/${jalur}`, {
      ...init, signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${jwt ?? key}`, ...(init.headers ?? {}) },
    })
    const res = await kirim(token)
    if (!perluSegarkan(res.status, !!token)) return res
    const baru = await segarkanToken()
    return baru && baru !== token ? await kirim(baru) : res
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      // Gambar kerja bisa puluhan megabita di sinyal lapangan — batas waktunya
      // sudah dua menit, jadi yang sampai ke sini memang jaringannya, bukan
      // ukurannya.
      throw new Error('Waktu habis saat mengunggah — periksa koneksi lalu coba lagi.')
    }
    throw e
  } finally { clearTimeout(timer) }
}

function sebab(status: number): string {
  if (status === 403 || status === 404) {
    return ' — jalankan migration_gambar_kerja.sql di Supabase SQL Editor,'
      + ' lalu keluar dan masuk lagi.'
  }
  if (status === 409) {
    return ' — versi dengan nomor itu sudah ada. Muat ulang halamannya;'
      + ' mungkin ada orang lain yang baru saja mengunggah revisi.'
  }
  if (status === 413) return ' — berkasnya terlalu besar. Kirim per lembar.'
  return ` (HTTP ${status}).`
}

export function gambarKerjaApi(): GambarKerjaApi {
  const mock = (globalThis as { __gambarKerjaApiMock?: GambarKerjaApi }).__gambarKerjaApiMock
  if (mock) return mock

  return {
    async list(proyek?: string) {
      const saring = proyek
        ? `&project_name=eq.${encodeURIComponent(proyek)}`
        : ''
      const res = await kirimKe(
        `rest/v1/project_drawings?select=*&order=created_at.desc${saring}`,
      )
      if (!res.ok) throw new Error(`Gagal memuat gambar kerja${sebab(res.status)}`)
      return await res.json() as BarisGambar[]
    },

    async unggah(berkas: File, isi: BuatGambarInput) {
      // BERKAS DULU, baris belakangan.
      //
      // Urutan terbalik akan meninggalkan baris yang menunjuk ke berkas yang
      // tidak pernah ada — entri yang diketuk lalu gagal, tanpa penjelasan.
      // Kalau unggahannya yang gagal, yang tertinggal hanya berkas yatim di
      // Storage: tidak terlihat siapa pun, dan tidak menyesatkan siapa pun.
      const naik = await kirimKe(
        `storage/v1/object/${BUCKET}/${isi.path}`,
        {
          method: 'POST',
          body: berkas,
          headers: {
            'Content-Type': berkas.type || 'application/octet-stream',
            'x-upsert': 'false',
          },
        },
      )
      if (!naik.ok) throw new Error(`Gagal mengunggah berkas${sebab(naik.status)}`)

      const res = await kirimKe('rest/v1/project_drawings', {
        method: 'POST',
        body: JSON.stringify({ ...isi, user_id: dataOwnerId() }),
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      }, 30_000)
      if (!res.ok) throw new Error(`Gagal menyimpan keterangan gambar${sebab(res.status)}`)
      const baris = await res.json() as BarisGambar[]
      return baris[0]
    },

    async tautan(path: string, detik = 3600) {
      const res = await kirimKe(`storage/v1/object/sign/${BUCKET}/${path}`, {
        method: 'POST',
        body: JSON.stringify({ expiresIn: detik }),
        headers: { 'Content-Type': 'application/json' },
      }, 30_000)
      if (!res.ok) throw new Error(`Gagal membuka gambar${sebab(res.status)}`)
      const { signedURL, signedUrl } = await res.json() as { signedURL?: string; signedUrl?: string }
      const jalur = signedUrl ?? signedURL ?? ''
      if (!jalur) throw new Error('Gagal membuka gambar — tautannya tidak diberikan server.')
      return `${supaConf().url}/storage/v1${jalur.startsWith('/') ? jalur : `/${jalur}`}`
    },

    async hapus(id: string) {
      // Hanya barisnya. Berkasnya SENGAJA ditinggalkan di Storage: entri yang
      // dihapus karena salah ketik nama tidak boleh ikut menghilangkan gambar
      // yang mungkin sudah dirujuk orang lain, dan biaya penyimpanannya jauh
      // lebih murah daripada gambar yang hilang.
      const res = await kirimKe(`rest/v1/project_drawings?id=eq.${id}`, { method: 'DELETE' }, 30_000)
      if (!res.ok) throw new Error(`Gagal menghapus gambar${sebab(res.status)}`)
    },
  }
}
