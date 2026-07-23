// ============================================================
// PropFS — API SPK & Opname (Supabase)
// SPK dan Form Opname disimpan di Supabase agar bisa diakses
// vendor/tukang lewat link publik ber-token, tanpa login.
// window.__spkApiMock dipakai test E2E untuk memotong jaringan.
// ============================================================

import { supabase } from './supabase'
import type { OpnameItem } from './akuntan'

export interface SpkLingkupItem {
  uraian: string
  volume: number
  satuan: string
  harga: number
}

export interface SpkTermin { nama: string; pct: number }

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
  signature_data?: string | null
  signed_name?: string | null
  signed_at?: string | null
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
  updateSpkStatus(id: string, status: SpkDoc['status']): Promise<void>
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

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Harus login.')
  return data.user.id
}

const realApi: SpkApi = {
  async listSpk() {
    const { data, error } = await supabase.from('spk_docs')
      .select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as SpkDoc[]
  },
  async createSpk(doc) {
    const user_id = await uid()
    const { data, error } = await supabase.from('spk_docs')
      .insert({ ...doc, user_id }).select('*').single()
    if (error) throw new Error(error.message)
    return data as SpkDoc
  },
  async updateSpkStatus(id, status) {
    const { error } = await supabase.from('spk_docs').update({ status }).eq('id', id)
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
    const { data, error } = await supabase.from('opname_forms')
      .select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as OpnameDoc[]
  },
  async createOpname(doc) {
    const user_id = await uid()
    const { data, error } = await supabase.from('opname_forms')
      .insert({ ...doc, user_id }).select('*').single()
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
