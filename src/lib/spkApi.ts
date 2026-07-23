// ============================================================
// PropFS — API SPK & Opname (Supabase)
// SPK dan Form Opname disimpan di Supabase agar bisa diakses
// vendor/tukang lewat link publik ber-token, tanpa login.
// window.__spkApiMock dipakai test E2E untuk memotong jaringan.
// ============================================================

import { supabase } from './supabase'
import { useAuthStore } from '@/store/authStore'
import type { OpnameItem } from './akuntan'

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

/** Jaring pengaman: jangan biarkan tombol berputar selamanya. */
function withTimeout<T>(p: PromiseLike<T>, ms = 20000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error('Waktu habis — periksa koneksi internet lalu coba lagi.')), ms)),
  ])
}

const realApi: SpkApi = {
  async listSpk() {
    const { data, error } = await withTimeout(supabase.from('spk_docs')
      .select('*').order('created_at', { ascending: false }))
    if (error) throw new Error(error.message)
    return (data ?? []) as SpkDoc[]
  },
  async createSpk(doc) {
    const user_id = uid()
    const { data, error } = await withTimeout(supabase.from('spk_docs')
      .insert({ ...doc, user_id }).select('*').single())
    if (error) throw new Error(error.message)
    return data as SpkDoc
  },
  async updateSpk(id, patch) {
    const { error } = await withTimeout(supabase.from('spk_docs').update(patch).eq('id', id))
    if (error) throw new Error(error.message)
  },
  async updateSpkStatus(id, status) {
    const { error } = await supabase.from('spk_docs').update({ status }).eq('id', id)
    if (error) throw new Error(error.message)
  },
  async signSpkAsPemberi(id, signatureDataUrl, name) {
    const { error } = await withTimeout(supabase.from('spk_docs').update({
      pemberi_signature: signatureDataUrl,
      pemberi_signed_name: name,
      pemberi_signed_at: new Date().toISOString(),
    }).eq('id', id))
    if (error) throw new Error(error.message)
  },
  async deleteSpk(id) {
    const { error } = await supabase.from('spk_docs').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
  async getSpkByToken(token) {
    const { data, error } = await supabase.rpc('spk_get_by_token', { p_token: token })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    return row ?? null
  },
  async signSpkByToken(token, signatureDataUrl, name) {
    const { data, error } = await supabase.rpc('spk_sign_by_token', {
      p_token: token, p_signature: signatureDataUrl, p_name: name,
    })
    if (error) throw new Error(error.message)
    return data === true
  },
  async listOpname() {
    const { data, error } = await withTimeout(supabase.from('opname_forms')
      .select('*').order('created_at', { ascending: false }))
    if (error) throw new Error(error.message)
    return (data ?? []) as OpnameDoc[]
  },
  async createOpname(doc) {
    const user_id = uid()
    const { data, error } = await withTimeout(supabase.from('opname_forms')
      .insert({ ...doc, user_id }).select('*').single())
    if (error) throw new Error(error.message)
    return data as OpnameDoc
  },
  async approveOpname(id) {
    const { error } = await supabase.from('opname_forms').update({ status: 'disetujui' }).eq('id', id)
    if (error) throw new Error(error.message)
  },
  async deleteOpname(id) {
    const { error } = await supabase.from('opname_forms').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
  async getOpnameByToken(token) {
    const { data, error } = await supabase.rpc('opname_get_by_token', { p_token: token })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    return row ?? null
  },
  async fillOpnameByToken(token, items, by) {
    const { data, error } = await supabase.rpc('opname_fill_by_token', {
      p_token: token, p_items: items, p_by: by,
    })
    if (error) throw new Error(error.message)
    return data === true
  },
  async sendSpkEmail(spk, link) {
    if (!spk.vendor_email) throw new Error('Email vendor belum diisi.')
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        type: 'spk_sign',
        email_to: spk.vendor_email,
        payload: {
          vendor_name: spk.vendor_name,
          nomor: spk.nomor,
          project_name: spk.project_name,
          nilai: spk.nilai_kontrak,
          link,
        },
      },
    })
    if (error) throw new Error(error.message)
  },
}

export function spkApi(): SpkApi {
  return getMock() ?? realApi
}

/** Link publik halaman tanda tangan / isi opname. */
export function spkSignLink(token: string): string {
  return `${window.location.origin}/spk/sign/${token}`
}
export function opnameFillLink(token: string): string {
  return `${window.location.origin}/opname/isi/${token}`
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

/** Template pasal untuk KONSUMEN/PEMILIK (perjanjian pemesanan/jual-beli
 *  antara pengembang dan pembeli). Spesifikasi mengikat pada RAB/penawaran
 *  yang WAJIB dilampirkan. Bisa diedit user. */
export function defaultPasalKonsumen(ctx: PasalContext): SpkPasal[] {
  const terminStr = ctx.termin.length
    ? ctx.termin.map((t, i) => `${i + 1}. ${t.nama}: ${t.pct}% (${rupiah((ctx.nilai * t.pct) / 100)})`).join('\n')
    : 'Dibayarkan sesuai kesepakatan para pihak.'
  const nilaiStr = `${rupiah(ctx.nilai)} (${terbilang(ctx.nilai)} rupiah)`
  return [
    {
      judul: 'PASAL 1 — OBJEK PERJANJIAN',
      isi: `PIHAK PERTAMA (Penjual/Pengembang) menjual dan menyerahkan kepada PIHAK KEDUA (Pembeli/Pemilik), dan PIHAK KEDUA membeli${ctx.proyek ? ` unit/bangunan pada proyek "${ctx.proyek}"` : ' unit/bangunan'} beserta spesifikasi sebagaimana tercantum dalam Rincian & Spesifikasi serta RAB / Surat Penawaran Harga yang TERLAMPIR dan menjadi bagian tidak terpisahkan dari perjanjian ini.`,
    },
    {
      judul: 'PASAL 2 — HARGA & CARA PEMBAYARAN',
      isi: `Harga disepakati sebesar ${nilaiStr}. Pembayaran dilakukan menurut jadwal berikut:\n${terminStr}\nPembayaran dianggap sah setelah dana diterima PIHAK PERTAMA dan dikonfirmasi.`,
    },
    {
      judul: 'PASAL 3 — SPESIFIKASI & LAMPIRAN',
      isi: `Spesifikasi teknis, material, dan volume mengikuti RAB / Surat Penawaran Harga terlampir. Setiap perubahan spesifikasi (tambah/kurang) atas permintaan PIHAK KEDUA diperhitungkan sebagai pekerjaan tambah-kurang dan disepakati tertulis.`,
    },
    {
      judul: 'PASAL 4 — JANGKA WAKTU & SERAH TERIMA',
      isi: `PIHAK PERTAMA menyelesaikan dan menyerahkan objek dalam estimasi ${ctx.durasi} (${terbilang(ctx.durasi)}) hari kalender sejak ${ctx.tglMulai || 'perjanjian ditandatangani dan pembayaran tahap pertama diterima'}. Serah terima dituangkan dalam Berita Acara Serah Terima (BAST).`,
    },
    {
      judul: 'PASAL 5 — KEWAJIBAN PIHAK PERTAMA (PENJUAL)',
      isi: `PIHAK PERTAMA wajib: (a) membangun/menyediakan objek sesuai spesifikasi lampiran; (b) menyerahkan objek tepat waktu dalam kondisi baik; (c) memberikan masa pemeliharaan/garansi sesuai kesepakatan.`,
    },
    {
      judul: 'PASAL 6 — KEWAJIBAN PIHAK KEDUA (PEMBELI)',
      isi: `PIHAK KEDUA wajib: (a) melakukan pembayaran sesuai jadwal pada Pasal 2; (b) melakukan pemeriksaan pada saat serah terima; (c) melunasi seluruh kewajiban sebelum penyerahan hak/sertifikat.`,
    },
    {
      judul: 'PASAL 7 — PEMBATALAN & SANKSI',
      isi: `Apabila PIHAK KEDUA membatalkan secara sepihak, pembayaran yang telah masuk dapat diperhitungkan sebagai denda/biaya administrasi sesuai kesepakatan. Apabila PIHAK PERTAMA gagal menyerahkan objek, PIHAK PERTAMA mengembalikan pembayaran PIHAK KEDUA.`,
    },
    {
      judul: 'PASAL 8 — KEADAAN KAHAR (FORCE MAJEURE)',
      isi: `Keterlambatan akibat keadaan kahar (bencana alam, kebijakan pemerintah, dan sebab lain di luar kendali) bukan merupakan kelalaian, sepanjang diberitahukan secara tertulis paling lambat 7 (tujuh) hari sejak kejadian.`,
    },
    {
      judul: 'PASAL 9 — PENYELESAIAN PERSELISIHAN',
      isi: `Segala perselisihan diselesaikan secara musyawarah untuk mufakat. Apabila tidak tercapai, para pihak menyelesaikannya melalui jalur hukum yang berlaku di wilayah hukum Republik Indonesia.`,
    },
    {
      judul: 'PASAL 10 — PENUTUP',
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
    ? 'SURAT PERJANJIAN / PEMESANAN'
    : 'SURAT PERINTAH KERJA'
}
