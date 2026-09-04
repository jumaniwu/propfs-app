// ============================================================
// PropFS — Laporan Harian Lapangan (Kontraktor AI)
// - 1 link untuk pekerja upload laporan harian (kerja, progress, foto)
// - 1 link untuk owner melihat kalender progress
// - Auto-upload foto ke Google Drive lewat Apps Script webhook
// REST langsung (bypass session supabase-js yang bisa menggantung).
// window.__fieldApiMock dipakai test E2E.
// ============================================================

import { useAuthStore } from '@/store/authStore'
import { bacaGalatServer, badanRespons } from './galatServer'
import { tautanPublik } from './tautanPendek'
import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'
import type { BarisAbsensi } from './absensiPekerja'
import { bacaDaftarPekerja, type PekerjaLapangan } from './pekerjaLapangan'

export interface FieldLog {
  id: string
  project_name: string
  drive_webhook: string
  report_token: string
  view_token: string
  created_at?: string
}

export interface FieldReport {
  id: string
  log_id: string
  tanggal: string           // YYYY-MM-DD
  pelapor: string
  kegiatan: string[]
  catatan: string
  photos: string[]          // data URL
  /**
   * Siapa saja yang bekerja hari itu. Opsional: baris laporan yang dibuat
   * sebelum kolomnya ada tidak punya ini sama sekali.
   */
  absensi?: BarisAbsensi[]
  created_at?: string
}

/** Header halaman pekerja, beserta daftar pekerja yang terdaftar di sana. */
export interface FieldHeader {
  project_name: string
  drive_webhook: string
  /** Pekerja terdaftar; kosong bila migrasinya belum jalan. */
  pekerja?: PekerjaLapangan[]
}

/** Data pendaftaran seorang pekerja oleh pengawas. */
export interface DaftarPekerjaInput {
  nama: string
  peran?: string
  no_hp?: string
  jenis?: 'harian' | 'borongan'
  upah_harian?: number
  foto?: string
}

export interface FieldApi {
  listLogs(): Promise<FieldLog[]>
  createLog(projectName: string, driveWebhook: string): Promise<FieldLog>
  updateLog(id: string, patch: Partial<Pick<FieldLog, 'project_name' | 'drive_webhook'>>): Promise<void>
  deleteLog(id: string): Promise<void>
  listReports(logId: string): Promise<FieldReport[]>
  /**
   * Laporan harian TERBARU lintas semua log, untuk lonceng notifikasi.
   * Dibatasi jumlahnya karena yang dibutuhkan hanya kabar terkini — menarik
   * seluruh riwayat hanya memperlambat pembukaan panel.
   */
  listReportsTerbaru(batas?: number): Promise<FieldReport[]>
  deleteReport(id: string): Promise<void>
  // publik (token)
  getLogByReportToken(token: string): Promise<FieldHeader | null>
  submitReport(token: string, r: Omit<FieldReport, 'id' | 'log_id' | 'created_at'>): Promise<boolean>
  getOwnerView(token: string): Promise<{ project_name: string; reports: FieldReport[] } | null>

  // ── Daftar pekerja (pengawas, lewat link yang sama) ──
  /** Pekerja terdaftar di buku laporan ini. */
  listPekerja(token: string): Promise<PekerjaLapangan[]>
  /** Daftarkan pekerja. Mendaftarkan orang yang sama dua kali memperbaruinya. */
  daftarPekerja(token: string, p: DaftarPekerjaInput): Promise<string>
  /** Berhenti menawarkan pekerja di absen harian; absensinya yang lalu tetap. */
  nonaktifkanPekerja(token: string, id: string): Promise<boolean>
}

// ── REST langsung ────────────────────────────────────────────────────────────
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
 * `publik: true` memakai KUNCI ANON saja, tidak pernah JWT pengguna.
 *
 * Halaman bertoken dibuka tanpa login, tetapi perangkatnya bisa saja menyimpan
 * sesi Supabase yang sudah kedaluwarsa — milik pemakai aplikasi yang membuka
 * linknya sendiri, atau sisa login lama. JWT kedaluwarsa yang ikut terkirim
 * ditolak sebagai HTTP 401, dan halamannya gagal walau tokennya sah. Muat ulang
 * "menyembuhkan" karena supabase-js sempat menyegarkan token di latar belakang
 * — itulah kenapa gagalnya hanya di pembukaan pertama.
 */
async function restFetch(
  path: string, init: RequestInit = {}, ms = 15000, publik = false,
): Promise<Response> {
  const { url, key } = supaConf()
  // Token dari localStorage bisa saja sudah kedaluwarsa — supabase-js
  // menyegarkannya di latar belakang, dan pada pembukaan PERTAMA halaman
  // sering mendahuluinya. Dulu itu tampil sebagai "HTTP 401, muat ulang dulu".
  // Sekali ditolak, sesinya disegarkan lalu permintaannya diulang satu kali.
  const token = publik ? null : storedAccessToken(url)
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
async function rpc<T>(fn: string, body: unknown, publik = false): Promise<T> {
  const res = await restFetch(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) }, 15000, publik)
  if (!res.ok) {
    // Pesan server DIBACA, tidak dibuang.
    //
    // Dulu baris ini hanya menyusun "Gagal (HTTP 500)." dari nomor statusnya.
    // Padahal PostgREST selalu mengirim badan JSON berisi `message`, `code`,
    // dan `hint` — dan nomor 500 menutupi sebab yang sangat berbeda-beda:
    // fungsinya belum ada karena migrasinya belum dijalankan, tabelnya belum
    // ada, kolomnya berubah, atau ada kekeliruan di dalam fungsinya. Pemilik
    // rumah yang membuka tautan kalender progres melihat nomor itu dan tidak
    // bisa berbuat apa-apa; yang memperbaikinya pun tidak bisa menebak.
    throw new Error(bacaGalatServer(res.status, await badanRespons(res), 'Data').pesan)
  }
  return await res.json() as T
}
function uid(): string {
  const u = useAuthStore.getState().user
  if (!u?.id) throw new Error('Sesi login tidak ditemukan — muat ulang halaman lalu coba lagi.')
  return u.id
}

const realApi: FieldApi = {
  async listLogs() {
    const res = await restFetch('field_logs?select=*&order=created_at.desc')
    if (!res.ok) {
      throw new Error(bacaGalatServer(res.status, await badanRespons(res), 'Buku laporan').pesan)
    }
    return await res.json() as FieldLog[]
  },
  async createLog(projectName, driveWebhook) {
    const res = await restFetch('field_logs', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: uid(), project_name: projectName, drive_webhook: driveWebhook }),
    })
    if (!res.ok) throw new Error(`Gagal membuat (HTTP ${res.status}).`)
    return (await res.json() as FieldLog[])[0]
  },
  async updateLog(id, patch) {
    const res = await restFetch(`field_logs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(`Gagal memperbarui (HTTP ${res.status}).`)
  },
  async deleteLog(id) {
    const res = await restFetch(`field_logs?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus (HTTP ${res.status}).`)
  },
  async listReportsTerbaru(batas = 30) {
    const res = await restFetch(
      `field_reports?select=*&order=created_at.desc,tanggal.desc&limit=${Math.max(1, batas)}`)
    if (!res.ok) throw new Error(`Gagal memuat laporan (HTTP ${res.status}).`)
    return await res.json() as FieldReport[]
  },
  async listReports(logId) {
    const res = await restFetch(`field_reports?select=*&log_id=eq.${logId}&order=tanggal.desc,created_at.desc`)
    if (!res.ok) throw new Error(`Gagal memuat laporan (HTTP ${res.status}).`)
    return await res.json() as FieldReport[]
  },
  async deleteReport(id) {
    const res = await restFetch(`field_reports?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus laporan (HTTP ${res.status}).`)
  },
  async getLogByReportToken(token) {
    const data = await rpc<FieldHeader[]>('field_log_by_report_token', { p_token: token }, true)
    const row = (Array.isArray(data) ? data[0] : data) ?? null
    if (!row) return null
    // `pekerja` hanya ada setelah migrasi pekerja dijalankan. Tanpanya
    // halaman absensi tetap terbuka — daftarnya saja yang kosong.
    return { ...row, pekerja: bacaDaftarPekerja(row.pekerja) }
  },
  async submitReport(token, r) {
    const inti = {
      p_token: token, p_tanggal: r.tanggal, p_pelapor: r.pelapor,
      p_kegiatan: r.kegiatan, p_catatan: r.catatan, p_photos: r.photos,
    }
    try {
      return await rpc<boolean>('field_report_submit', { ...inti, p_absensi: r.absensi ?? [] }, true) === true
    } catch (e) {
      // Selama migrasi absensi belum dijalankan, fungsi bertujuh parameter
      // belum ada dan Supabase menjawab 404. Laporan harian adalah pekerjaan
      // tiap sore yang tidak boleh ikut mati karena kolom baru — kirim ulang
      // tanpa absensi, dan katakan terus terang apa yang tidak tersimpan.
      if (!(e instanceof Error) || !/HTTP 40[04]/.test(e.message)) throw e
      const ok = await rpc<boolean>('field_report_submit', inti, true) === true
      if (ok && (r.absensi?.length ?? 0) > 0) {
        throw new Error('Laporan tersimpan, tetapi absensi belum — migrasi absensi belum dijalankan di Supabase.')
      }
      return ok
    }
  },
  async listPekerja(token) {
    // Migrasi pekerja belum tentu sudah dijalankan. Halaman absensi harus
    // tetap terbuka tanpanya — hanya daftarnya yang kosong.
    try {
      return bacaDaftarPekerja(await rpc('field_workers_by_token', { p_token: token }, true))
    } catch (e) {
      if (e instanceof Error && /HTTP 40[04]/.test(e.message)) return []
      throw e
    }
  },
  async daftarPekerja(token, p) {
    return await rpc<string>('field_worker_daftar', {
      p_token: token,
      p_nama: p.nama,
      p_peran: p.peran ?? '',
      p_no_hp: p.no_hp ?? '',
      p_jenis: p.jenis ?? 'harian',
      p_upah: p.upah_harian ?? 0,
      p_foto: p.foto ?? '',
    }, true)
  },
  async nonaktifkanPekerja(token, id) {
    return await rpc<boolean>('field_worker_nonaktif', { p_token: token, p_id: id }, true) === true
  },

  async getOwnerView(token) {
    const data = await rpc<Array<{ project_name: string; reports: FieldReport[] }>>('field_log_by_view_token', { p_token: token }, true)
    const row = Array.isArray(data) ? data[0] : data
    return row ? { project_name: row.project_name, reports: row.reports ?? [] } : null
  },
}

export function fieldApi(): FieldApi {
  return (window as { __fieldApiMock?: FieldApi }).__fieldApiMock ?? realApi
}

// ── Link publik ──────────────────────────────────────────────────────────────
// Jalur pendek; bentuk lamanya tetap dilayani, lihat lib/tautanPendek.ts.
export function laporLink(token: string): string { return tautanPublik('lapor', token, window.location.origin) }
export function progresLink(token: string): string { return tautanPublik('progress', token, window.location.origin) }
export function waShare(message: string): string { return `https://wa.me/?text=${encodeURIComponent(message)}` }

// ── Google Drive webhook (Apps Script) ───────────────────────────────────────
const DRIVE_KEY = 'propfs-drive-webhook'
export function getDriveWebhook(): string {
  try { return localStorage.getItem(DRIVE_KEY) ?? '' } catch { return '' }
}
export function setDriveWebhook(url: string): void {
  try { localStorage.setItem(DRIVE_KEY, url.trim()) } catch { /* ignore */ }
}

/** Kirim satu foto ke Apps Script Web App (fire-and-forget, tidak memblok UI). */
export async function uploadToDrive(webhookUrl: string, file: { name: string; mimeType: string; base64Data: string; folder?: string }): Promise<void> {
  if (!webhookUrl) return
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      signal: ctrl.signal,
      // Apps Script Web App menerima text/plain agar tanpa preflight CORS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ name: file.name, mimeType: file.mimeType, data: file.base64Data, folder: file.folder ?? '' }),
    })
  } catch (e) {
    console.warn('[Drive] upload gagal:', e)
  } finally { clearTimeout(timer) }
}
