// ============================================================
// PropFS — API SPK & Opname (Supabase)
// SPK dan Form Opname disimpan di Supabase agar bisa diakses
// vendor/tukang lewat link publik ber-token, tanpa login.
// window.__spkApiMock dipakai test E2E untuk memotong jaringan.
// ============================================================

import { useAuthStore } from '@/store/authStore'
import type { OpnameItem } from './akuntan'
import { tautanPublik } from './tautanPendek'
import { segarkanToken, perluSegarkan } from './sesiSupabase.ts'

export interface SpkLingkupItem {
  uraian: string
  volume: number
  satuan: string
  harga: number
}

export interface SpkTermin { nama: string; pct: number }

/** Pasal / isi dokumen kontrak yang bisa diedit pengguna. */
export interface SpkPasal { judul: string; isi: string }

export interface SpkDoc {
  id: string
  nomor: string
  project_name: string
  vendor_name: string
  vendor_email: string
  vendor_wa: string
  lingkup: SpkLingkupItem[]
  nilai_kontrak: number
  termin: SpkTermin[]
  tgl_mulai: string | null
  durasi_hari: number
  denda_permil: number
  catatan: string
  status: 'draft' | 'terkirim' | 'ditandatangani'
  sign_token: string
  // ── Pihak Kedua (Pelaksana/Vendor) ──
  signature_data?: string | null
  signed_name?: string | null
  signed_at?: string | null
  // ── Pihak Pertama (Pemberi Kerja) ──
  pemberi_nama?: string
  pemberi_jabatan?: string
  pemberi_signature?: string | null
  pemberi_signed_name?: string | null
  pemberi_signed_at?: string | null
  // ── Isi dokumen (pasal) yang bisa diedit ──
  pasal?: SpkPasal[]
  // ── Peran pihak kedua: 'Pelaksana' (vendor) atau 'Konsumen' (pemilik/pembeli) ──
  pihak_kedua_peran?: string
  // ── Lampiran RAB / Surat Penawaran Harga (data URL PDF/gambar) ──
  lampiran_nama?: string | null
  lampiran_data?: string | null
  created_at?: string
}

export interface OpnameDoc {
  id: string
  judul: string
  project_name: string
  tanggal: string
  petugas: string
  items: OpnameItem[]
  status: 'terbuka' | 'terisi' | 'disetujui'
  fill_token: string
  filled_by?: string | null
  filled_at?: string | null
  created_at?: string
}

export interface SpkApi {
  listSpk(): Promise<SpkDoc[]>
  createSpk(doc: Omit<SpkDoc, 'id' | 'sign_token' | 'status'>): Promise<SpkDoc>
  updateSpk(id: string, patch: Partial<Omit<SpkDoc, 'id' | 'sign_token'>>): Promise<void>
  updateSpkStatus(id: string, status: SpkDoc['status']): Promise<void>
  /** Pemberi kerja (Pihak Pertama) menandatangani dari dalam aplikasi (login). */
  signSpkAsPemberi(id: string, signatureDataUrl: string, name: string): Promise<void>
  deleteSpk(id: string): Promise<void>
  getSpkByToken(token: string): Promise<Omit<SpkDoc, 'id' | 'sign_token' | 'vendor_email' | 'vendor_wa'> | null>
  signSpkByToken(token: string, signatureDataUrl: string, name: string): Promise<boolean>
  listOpname(): Promise<OpnameDoc[]>
  createOpname(doc: Omit<OpnameDoc, 'id' | 'fill_token' | 'status'>): Promise<OpnameDoc>
  approveOpname(id: string): Promise<void>
  deleteOpname(id: string): Promise<void>
  getOpnameByToken(token: string): Promise<Omit<OpnameDoc, 'id' | 'fill_token'> | null>
  fillOpnameByToken(token: string, items: OpnameItem[], by: string): Promise<boolean>
  sendSpkEmail(spk: SpkDoc, link: string): Promise<void>
}

function getMock(): SpkApi | undefined {
  return (window as { __spkApiMock?: SpkApi }).__spkApiMock
}

function uid(): string {
  // ambil dari authStore (sinkron) — supabase.auth.getUser() melakukan
  // panggilan jaringan dan bisa menggantung (lock antar-tab)
  const u = useAuthStore.getState().user
  if (!u?.id) throw new Error('Sesi login tidak ditemukan — muat ulang halaman lalu coba lagi.')
  return u.id
}

// ── REST langsung (bypass session-machinery supabase-js) ────────────────────
// supabase-js v2 bisa MENGGANTUNG query bila auto-refresh token stall / lock
// antar-tab. Untuk operasi baca-tulis SPK/Opname kita panggil REST langsung
// dengan token dari storage + AbortController, sehingga tidak mungkin macet.
function supaConf() {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  const url = env.VITE_SUPABASE_URL || 'https://ciazztqmkhzrgbaqfyyz.supabase.co'
  const key = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1BxZhA48DtR8KG94xUm0zg_6w-dg1xD'
  return { url, key }
}

/** Ambil access token JWT user dari storage supabase (tanpa panggilan jaringan). */
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
      ...init,
      signal: ctrl.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${jwt ?? key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
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

async function restGet<T>(path: string): Promise<T> {
  const res = await restFetch(path)
  if (!res.ok) throw new Error(`Gagal memuat data (HTTP ${res.status}). ${res.status === 401 ? 'Sesi login mungkin kedaluwarsa — muat ulang halaman.' : ''}`)
  return await res.json() as T
}

async function restInsert<T>(table: string, body: unknown): Promise<T> {
  const res = await restFetch(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Gagal menyimpan (HTTP ${res.status}).`)
  const rows = await res.json() as T[]
  return rows[0]
}

async function restPatch(table: string, filter: string, body: unknown): Promise<void> {
  const res = await restFetch(`${table}?${filter}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Gagal memperbarui (HTTP ${res.status}).`)
}

async function restDelete(table: string, filter: string): Promise<void> {
  const res = await restFetch(`${table}?${filter}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Gagal menghapus (HTTP ${res.status}).`)
}

const realApi: SpkApi = {
  async listSpk() {
    return await restGet<SpkDoc[]>('spk_docs?select=*&order=created_at.desc')
  },
  async createSpk(doc) {
    const user_id = uid()
    return await restInsert<SpkDoc>('spk_docs', { ...doc, user_id })
  },
  async updateSpk(id, patch) {
    await restPatch('spk_docs', `id=eq.${id}`, patch)
  },
  async updateSpkStatus(id, status) {
    await restPatch('spk_docs', `id=eq.${id}`, { status })
  },
  async signSpkAsPemberi(id, signatureDataUrl, name) {
    await restPatch('spk_docs', `id=eq.${id}`, {
      pemberi_signature: signatureDataUrl,
      pemberi_signed_name: name,
      pemberi_signed_at: new Date().toISOString(),
    })
  },
  async deleteSpk(id) {
    await restDelete('spk_docs', `id=eq.${id}`)
  },
  async getSpkByToken(token) {
    // RPC publik via REST: kunci anon saja, JANGAN JWT pengguna.
    const res = await restFetch(
      'rpc/spk_get_by_token', { method: 'POST', body: JSON.stringify({ p_token: token }) }, 15000, true)
    if (!res.ok) throw new Error(`Gagal memuat SPK (HTTP ${res.status}).`)
    const data = await res.json()
    const row = Array.isArray(data) ? data[0] : data
    return row ?? null
  },
  async signSpkByToken(token, signatureDataUrl, name) {
    const res = await restFetch('rpc/spk_sign_by_token', {
      method: 'POST', body: JSON.stringify({ p_token: token, p_signature: signatureDataUrl, p_name: name }),
    }, 15000, true)
    if (!res.ok) throw new Error(`Gagal menyimpan tanda tangan (HTTP ${res.status}).`)
    return (await res.json()) === true
  },
  async listOpname() {
    return await restGet<OpnameDoc[]>('opname_forms?select=*&order=created_at.desc')
  },
  async createOpname(doc) {
    const user_id = uid()
    return await restInsert<OpnameDoc>('opname_forms', { ...doc, user_id })
  },
  async approveOpname(id) {
    await restPatch('opname_forms', `id=eq.${id}`, { status: 'disetujui' })
  },
  async deleteOpname(id) {
    await restDelete('opname_forms', `id=eq.${id}`)
  },
  async getOpnameByToken(token) {
    const res = await restFetch(
      'rpc/opname_get_by_token', { method: 'POST', body: JSON.stringify({ p_token: token }) }, 15000, true)
    if (!res.ok) throw new Error(`Gagal memuat form (HTTP ${res.status}).`)
    const data = await res.json()
    const row = Array.isArray(data) ? data[0] : data
    return row ?? null
  },
  async fillOpnameByToken(token, items, by) {
    const res = await restFetch('rpc/opname_fill_by_token', {
      method: 'POST', body: JSON.stringify({ p_token: token, p_items: items, p_by: by }),
    }, 15000, true)
    if (!res.ok) throw new Error(`Gagal mengirim opname (HTTP ${res.status}).`)
    return (await res.json()) === true
  },
  async sendSpkEmail(spk, link) {
    if (!spk.vendor_email) throw new Error('Email vendor belum diisi.')
    const { url, key } = supaConf()
    const token = storedAccessToken(url)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch(`${url}/functions/v1/send-email`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'spk_sign',
          email_to: spk.vendor_email,
          payload: {
            vendor_name: spk.vendor_name, nomor: spk.nomor,
            project_name: spk.project_name, nilai: spk.nilai_kontrak, link,
          },
        }),
      })
      if (!res.ok) throw new Error(`Email gagal (HTTP ${res.status}).`)
    } finally { clearTimeout(timer) }
  },
}

export function spkApi(): SpkApi {
  return getMock() ?? realApi
}

/** Link publik halaman tanda tangan / isi opname. */
export function spkSignLink(token: string): string {
  return tautanPublik('spk_sign', token, window.location.origin)
}
export function opnameFillLink(token: string): string {
  return tautanPublik('opname', token, window.location.origin)
}

/** Link WhatsApp siap kirim (wa.me) berisi pesan + link. */
export function waShareLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '62')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function nomorSpkOtomatis(count: number): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `SPK/${String(count + 1).padStart(3, '0')}/${mm}/${d.getFullYear()}`
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/** Terbilang sederhana bahasa Indonesia (untuk nilai kontrak pada pasal). */
export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'nol'
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
  const bagi = (x: number): string => {
    if (x < 12) return satuan[x]
    if (x < 20) return satuan[x - 10] + ' belas'
    if (x < 100) return satuan[Math.floor(x / 10)] + ' puluh' + (x % 10 ? ' ' + satuan[x % 10] : '')
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + bagi(x - 100) : '')
    if (x < 1000) return satuan[Math.floor(x / 100)] + ' ratus' + (x % 100 ? ' ' + bagi(x % 100) : '')
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + bagi(x - 1000) : '')
    if (x < 1_000_000) return bagi(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + bagi(x % 1000) : '')
    if (x < 1_000_000_000) return bagi(Math.floor(x / 1_000_000)) + ' juta' + (x % 1_000_000 ? ' ' + bagi(x % 1_000_000) : '')
    return bagi(Math.floor(x / 1_000_000_000)) + ' miliar' + (x % 1_000_000_000 ? ' ' + bagi(x % 1_000_000_000) : '')
  }
  return bagi(n).replace(/\s+/g, ' ').trim()
}

export interface PasalContext {
  pemberi: string
  vendor: string
  proyek: string
  nilai: number
  termin: SpkTermin[]
  durasi: number
  denda: number
  tglMulai: string | null
}

/** Template pasal standar ala kontrak kerja kontraktor — bisa diedit user. */
export function defaultPasal(ctx: PasalContext): SpkPasal[] {
  const terminStr = ctx.termin.length
    ? ctx.termin.map((t, i) => `${i + 1}. ${t.nama}: ${t.pct}% (${rupiah((ctx.nilai * t.pct) / 100)})`).join('\n')
    : 'Dibayarkan sesuai kesepakatan para pihak.'
  const nilaiStr = `${rupiah(ctx.nilai)} (${terbilang(ctx.nilai)} rupiah)`
  return [
    {
      judul: 'PASAL 1 — LINGKUP PEKERJAAN',
      isi: `PIHAK PERTAMA memberikan pekerjaan kepada PIHAK KEDUA, dan PIHAK KEDUA menerima pekerjaan${ctx.proyek ? ` pada proyek "${ctx.proyek}"` : ''} sesuai rincian lingkup pekerjaan (Rincian Pekerjaan) yang menjadi bagian tidak terpisahkan dari Surat Perintah Kerja ini. PIHAK KEDUA wajib melaksanakan pekerjaan sesuai gambar kerja, spesifikasi teknis, dan standar mutu yang berlaku.`,
    },
    {
      judul: 'PASAL 2 — NILAI PEKERJAAN & CARA PEMBAYARAN',
      isi: `Nilai pekerjaan disepakati sebesar ${nilaiStr} bersifat lumpsum/fixed price kecuali disepakati lain. Pembayaran dilakukan secara bertahap (termin):\n${terminStr}\nPembayaran dilakukan setelah pekerjaan pada tiap termin diperiksa dan disetujui PIHAK PERTAMA.`,
    },
    {
      judul: 'PASAL 3 — JANGKA WAKTU PELAKSANAAN',
      isi: `Pekerjaan dilaksanakan selama ${ctx.durasi} (${terbilang(ctx.durasi)}) hari kalender terhitung sejak ${ctx.tglMulai || 'tanggal yang ditetapkan PIHAK PERTAMA'}. Perpanjangan waktu hanya dapat diberikan atas persetujuan tertulis PIHAK PERTAMA.`,
    },
    {
      judul: 'PASAL 4 — DENDA KETERLAMBATAN',
      isi: `Apabila PIHAK KEDUA terlambat menyelesaikan pekerjaan, dikenakan denda sebesar ${ctx.denda}‰ (${terbilang(ctx.denda)} permil) dari nilai kontrak untuk setiap hari keterlambatan, dengan denda maksimum 5% (lima persen) dari nilai kontrak.`,
    },
    {
      judul: 'PASAL 5 — KEWAJIBAN PIHAK KEDUA (PELAKSANA)',
      isi: `PIHAK KEDUA wajib: (a) menyediakan tenaga kerja, peralatan, dan material sesuai lingkup; (b) menjaga mutu, keselamatan kerja (K3), dan kebersihan lokasi; (c) memperbaiki cacat/kekurangan pekerjaan atas biaya sendiri selama masa pemeliharaan; (d) bertanggung jawab atas kerusakan yang timbul akibat kelalaiannya.`,
    },
    {
      judul: 'PASAL 6 — KEWAJIBAN PIHAK PERTAMA (PEMBERI KERJA)',
      isi: `PIHAK PERTAMA wajib: (a) menyediakan lokasi kerja dan akses yang diperlukan; (b) melakukan pembayaran sesuai termin yang disepakati; (c) memberikan keputusan/persetujuan yang menjadi kewenangannya secara tepat waktu.`,
    },
    {
      judul: 'PASAL 7 — KEADAAN KAHAR (FORCE MAJEURE)',
      isi: `Keterlambatan atau kegagalan pelaksanaan akibat keadaan kahar (bencana alam, kebijakan pemerintah, kerusuhan, dan sebab lain di luar kendali para pihak) bukan merupakan kelalaian, sepanjang diberitahukan secara tertulis paling lambat 7 (tujuh) hari sejak kejadian.`,
    },
    {
      judul: 'PASAL 8 — PENYELESAIAN PERSELISIHAN',
      isi: `Segala perselisihan diselesaikan secara musyawarah untuk mufakat. Apabila tidak tercapai, para pihak sepakat menyelesaikannya melalui jalur hukum yang berlaku di wilayah hukum Republik Indonesia.`,
    },
    {
      judul: 'PASAL 9 — PENUTUP',
      isi: `Surat Perintah Kerja ini dibuat dan ditandatangani secara digital oleh para pihak, berlaku sebagai perjanjian yang sah dan mengikat sejak ditandatangani. Hal-hal yang belum diatur akan disepakati kemudian sebagai adendum yang menjadi bagian tidak terpisahkan.`,
    },
  ]
}

/**
 * Template pasal untuk KONSUMEN/PEMILIK.
 *
 * Ini perjanjian PEKERJAAN — kontraktor mengerjakan renovasi/pembangunan milik
 * pemesan — bukan jual-beli unit. Bedanya bukan sekadar kata: pada jual-beli
 * yang berpindah adalah barangnya, sedangkan di sini yang dijanjikan adalah
 * pekerjaan di atas properti yang sudah menjadi milik pemesan. Pasal yang
 * dibutuhkan pun berbeda — akses lokasi, pekerjaan tambah-kurang, masa
 * pemeliharaan, dan keselamatan kerja, yang semuanya tidak ada di jual-beli.
 *
 * Kedudukan pihak tetap seperti dokumen lain di aplikasi ini: PIHAK PERTAMA
 * adalah pemakai aplikasi (pelaksana), PIHAK KEDUA lawan bicaranya.
 * Spesifikasi mengikat pada RAB/penawaran yang WAJIB dilampirkan. Bisa diedit.
 */
export function defaultPasalKonsumen(ctx: PasalContext): SpkPasal[] {
  const terminStr = ctx.termin.length
    ? ctx.termin.map((t, i) => `${i + 1}. ${t.nama}: ${t.pct}% (${rupiah((ctx.nilai * t.pct) / 100)})`).join('\n')
    : 'Dibayarkan sesuai kesepakatan para pihak.'
  const nilaiStr = `${rupiah(ctx.nilai)} (${terbilang(ctx.nilai)} rupiah)`
  const objek = ctx.proyek ? `"${ctx.proyek}"` : 'yang disepakati para pihak'
  return [
    {
      judul: 'PASAL 1 — OBJEK & LINGKUP PEKERJAAN',
      isi: `PIHAK PERTAMA (Pelaksana) menyanggupi dan PIHAK KEDUA (Pemilik/Pemberi Kerja) menyerahkan pelaksanaan pekerjaan renovasi/pembangunan pada ${objek}. Lingkup, volume, dan spesifikasi pekerjaan mengikuti Rincian Pekerjaan serta RAB / Surat Penawaran Harga yang TERLAMPIR dan menjadi bagian tidak terpisahkan dari perjanjian ini.`,
    },
    {
      judul: 'PASAL 2 — NILAI & CARA PEMBAYARAN',
      isi: `Nilai pekerjaan disepakati sebesar ${nilaiStr}. Pembayaran dilakukan menurut jadwal berikut:\n${terminStr}\nPembayaran dianggap sah setelah dana diterima PIHAK PERTAMA dan dikonfirmasi.`,
    },
    {
      judul: 'PASAL 3 — SPESIFIKASI & LAMPIRAN',
      isi: `Spesifikasi teknis, material, merek, dan volume mengikuti RAB / Surat Penawaran Harga terlampir. Penggantian material dengan mutu setara hanya boleh dilakukan atas persetujuan tertulis PIHAK KEDUA.`,
    },
    {
      judul: 'PASAL 4 — JANGKA WAKTU & KETERLAMBATAN',
      isi: `Pekerjaan diselesaikan dalam ${ctx.durasi} (${terbilang(ctx.durasi)}) hari kalender sejak ${ctx.tglMulai || 'perjanjian ditandatangani dan pembayaran tahap pertama diterima'}. Keterlambatan yang bukan karena keadaan kahar maupun kelalaian PIHAK KEDUA dikenakan denda ${ctx.denda}‰ (${terbilang(ctx.denda)} permil) per hari dari nilai pekerjaan, setinggi-tingginya 5% (lima persen).`,
    },
    {
      judul: 'PASAL 5 — KEWAJIBAN PIHAK PERTAMA (PELAKSANA)',
      isi: `PIHAK PERTAMA wajib: (a) melaksanakan pekerjaan sesuai lampiran, tepat mutu dan tepat waktu; (b) menyediakan tenaga kerja, peralatan, dan material sesuai lingkup; (c) menjaga kebersihan serta merapikan lokasi setelah pekerjaan selesai; (d) memperbaiki pekerjaan yang tidak sesuai spesifikasi atas biaya sendiri.`,
    },
    {
      judul: 'PASAL 6 — KEWAJIBAN PIHAK KEDUA (PEMILIK)',
      isi: `PIHAK KEDUA wajib: (a) memberikan akses lokasi selama jam kerja yang disepakati; (b) menyediakan sambungan air dan listrik kerja, kecuali diperjanjikan lain; (c) menyelesaikan perizinan yang menjadi hak pemilik; (d) melakukan pembayaran sesuai jadwal pada Pasal 2.`,
    },
    {
      judul: 'PASAL 7 — PEKERJAAN TAMBAH & KURANG',
      isi: `Setiap perubahan lingkup atas permintaan PIHAK KEDUA diperhitungkan sebagai pekerjaan tambah/kurang, dihitung memakai harga satuan pada RAB terlampir, dan HARUS disepakati tertulis sebelum dikerjakan. Pekerjaan tambah dapat memperpanjang jangka waktu Pasal 4 secara proporsional.`,
    },
    {
      judul: 'PASAL 8 — SERAH TERIMA & MASA PEMELIHARAAN',
      isi: `Penyelesaian pekerjaan dituangkan dalam Berita Acara Serah Terima (BAST). Setelah serah terima berlaku masa pemeliharaan selama 90 (sembilan puluh) hari kalender; kerusakan akibat mutu pengerjaan dalam masa tersebut diperbaiki PIHAK PERTAMA tanpa biaya tambahan. Kerusakan akibat pemakaian yang tidak wajar atau perubahan oleh pihak lain tidak termasuk.`,
    },
    {
      judul: 'PASAL 9 — KESELAMATAN KERJA & TANGGUNG JAWAB',
      isi: `PIHAK PERTAMA bertanggung jawab atas keselamatan pekerjanya serta kerusakan bangunan atau harta benda PIHAK KEDUA yang timbul karena kelalaian pelaksanaan. Barang berharga milik PIHAK KEDUA di area kerja diamankan sendiri oleh PIHAK KEDUA sebelum pekerjaan dimulai.`,
    },
    {
      judul: 'PASAL 10 — KEADAAN KAHAR (FORCE MAJEURE)',
      isi: `Keterlambatan akibat keadaan kahar (bencana alam, kerusuhan, kebijakan pemerintah, dan sebab lain di luar kendali) bukan merupakan kelalaian, sepanjang diberitahukan secara tertulis paling lambat 7 (tujuh) hari sejak kejadian.`,
    },
    {
      judul: 'PASAL 11 — PEMUTUSAN PERJANJIAN',
      isi: `Perjanjian dapat diputus apabila salah satu pihak lalai dan tidak memperbaikinya dalam 14 (empat belas) hari sejak teguran tertulis. Pada pemutusan, pekerjaan yang telah terpasang diukur bersama dan diperhitungkan terhadap pembayaran yang sudah diterima.`,
    },
    {
      judul: 'PASAL 12 — PENYELESAIAN PERSELISIHAN',
      isi: `Segala perselisihan diselesaikan secara musyawarah untuk mufakat. Apabila tidak tercapai, para pihak menyelesaikannya melalui jalur hukum yang berlaku di wilayah hukum Republik Indonesia.`,
    },
    {
      judul: 'PASAL 13 — PENUTUP',
      isi: `Perjanjian ini dibuat dan ditandatangani secara digital oleh para pihak, berlaku sah dan mengikat sejak ditandatangani. Hal yang belum diatur disepakati kemudian sebagai adendum yang menjadi bagian tidak terpisahkan.`,
    },
  ]
}

export type SpkJenis = 'vendor' | 'konsumen'

/** Pilih template pasal sesuai jenis dokumen. */
export function pasalTemplate(ctx: PasalContext, jenis: SpkJenis): SpkPasal[] {
  return jenis === 'konsumen' ? defaultPasalKonsumen(ctx) : defaultPasal(ctx)
}

/** Judul dokumen menurut jenis / peran pihak kedua. */
export function spkTitle(peran?: string): string {
  return (peran || '').toLowerCase() === 'konsumen'
    ? 'SURAT PERJANJIAN RENOVASI'
    : 'SURAT PERINTAH KERJA'
}
