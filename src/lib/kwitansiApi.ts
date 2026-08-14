// ============================================================
// PropFS — Kwitansi & kuota e-Meterai: jalur data
//
// Memakai `restFetch` milik procurementApi, bukan salinannya. Di dalamnya ada
// penyegaran token dan batas waktu yang sudah terbukti; menyalinnya akan
// melahirkan salinan kedua yang tertinggal begitu salah satunya diperbaiki.
// ============================================================
import { restFetch } from './procurementApi'
import { tautanPublik } from './tautanPendek'
import type { Kwitansi, KuotaMaterai, StatusMaterai, MetodeTerima } from './kwitansi'

export interface BarisKwitansi extends Kwitansi {
  id: string
  pemasukan_id: string
  penanda_signature: string | null
  perlu_materai: boolean
  materai_at: string | null
  materai_pdf?: string | null
  materai_galat: string
  view_token: string
  terkirim_at: string | null
  created_at: string
}

/** Yang dilihat konsumen lewat tautannya — tanpa apa pun yang bersifat internal. */
export interface KwitansiPublik {
  nomor: string
  tanggal: string
  penerima_dari: string
  untuk_pembayaran: string
  jumlah: number
  metode: MetodeTerima
  project_name: string
  catatan: string
  penanda_nama: string
  penanda_jabatan: string
  penanda_signature: string | null
  materai_status: StatusMaterai
  materai_sn: string
  kop_nama: string
  kop_logo: string
  kop_kontak: string
}

export type BuatKwitansi = Omit<Kwitansi, 'id' | 'materai_sn'> & {
  pemasukan_id?: string
  penanda_signature?: string | null
  perlu_materai: boolean
}

export interface KwitansiApi {
  list(): Promise<BarisKwitansi[]>
  buat(k: BuatKwitansi): Promise<BarisKwitansi>
  ubah(id: string, patch: Partial<BarisKwitansi>): Promise<void>
  hapus(id: string): Promise<void>
  /** Tandai sudah dikirim — sebelum itu tautannya tidak membuka apa pun. */
  tandaiTerkirim(id: string): Promise<void>
  byToken(token: string): Promise<KwitansiPublik | null>

  kuota(): Promise<KuotaMaterai>
  tambahKuota(jumlah: number, catatan?: string): Promise<number | null>
  /** Potong satu kuota. false bila kuotanya sudah habis. */
  pakaiKuota(kwitansiId: string): Promise<boolean>
  /** Kembalikan kuota ketika pembubuhan di sisi penyedia gagal. */
  kembalikanKuota(kwitansiId: string, sebab: string): Promise<void>
}

const PESAN_MIGRASI = ' Jalankan migration_kwitansi_materai.sql di Supabase SQL Editor.'

/**
 * 403 dari PostgREST berarti kebijakan RLS menolak barisnya.
 *
 * Hampir selalu satu dari dua hal, dan keduanya bisa dikerjakan pemakainya —
 * jadi keduanya disebutkan. "HTTP 403" sendirian tidak memberi tahu apa pun
 * dan membuat orang mengira aplikasinya rusak.
 */
const PESAN_403 = ' Tabelnya menolak akses: jalankan migration_kwitansi_materai.sql'
  + ' (dan migration_kwitansi_materai_pdf.sql) di Supabase SQL Editor, lalu keluar'
  + ' dan masuk lagi.'

async function json<T>(path: string, init: RequestInit, apa: string, publik = false): Promise<T> {
  const res = await restFetch(path, init, 15000, publik)
  if (!res.ok) {
    throw new Error(
      `Gagal ${apa} (HTTP ${res.status}).`
      + (res.status === 404 ? PESAN_MIGRASI : res.status === 403 ? PESAN_403 : ''),
    )
  }
  return await res.json() as T
}

const rpc = <T>(fn: string, body: unknown, apa: string, publik = false) =>
  json<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) }, apa, publik)

const nyata: KwitansiApi = {
  async list() {
    return await json<BarisKwitansi[]>('kwitansi?select=*&order=created_at.desc', {}, 'memuat kwitansi')
  },
  async buat(k) {
    const rows = await json<BarisKwitansi[]>('kwitansi', {
      method: 'POST', body: JSON.stringify(k), headers: { Prefer: 'return=representation' },
    }, 'menyimpan kwitansi')
    return rows[0]
  },
  async ubah(id, patch) {
    const res = await restFetch(`kwitansi?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`Gagal memperbarui kwitansi (HTTP ${res.status}).`)
  },
  async hapus(id) {
    const res = await restFetch(`kwitansi?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus kwitansi (HTTP ${res.status}).`)
  },
  async tandaiTerkirim(id) {
    await nyata.ubah(id, { terkirim_at: new Date().toISOString() } as Partial<BarisKwitansi>)
  },
  async byToken(token) {
    const rows = await rpc<KwitansiPublik[]>('kwitansi_by_token', { p_token: token },
      'membuka kwitansi', true)
    return rows?.[0] ?? null
  },

  async kuota() {
    // Baris kuota baru ada setelah pembelian pertama; belum ada bukan galat.
    const rows = await json<Array<{ dibeli: number; terpakai: number }>>(
      'materai_kuota?select=dibeli,terpakai', {}, 'memuat kuota e-Meterai',
    ).catch(() => [])
    return { dibeli: rows[0]?.dibeli ?? 0, terpakai: rows[0]?.terpakai ?? 0 }
  },
  async tambahKuota(jumlah, catatan = '') {
    return await rpc<number | null>('materai_tambah_kuota',
      { p_jumlah: Math.floor(jumlah), p_catatan: catatan }, 'menambah kuota e-Meterai')
  },
  async pakaiKuota(kwitansiId) {
    return (await rpc<boolean>('materai_pakai', { p_kwitansi_id: kwitansiId },
      'memakai kuota e-Meterai')) === true
  },
  async kembalikanKuota(kwitansiId, sebab) {
    await rpc<boolean>('materai_kembalikan', { p_kwitansi_id: kwitansiId, p_sebab: sebab },
      'mengembalikan kuota e-Meterai')
  },
}

export function kwitansiApi(): KwitansiApi {
  return (window as { __kwitansiApiMock?: KwitansiApi }).__kwitansiApiMock ?? nyata
}

/** Tautan kwitansi yang dikirim ke konsumen lewat WhatsApp. */
export function kwitansiLink(token: string): string {
  return tautanPublik('kwitansi', token, window.location.origin)
}

// ── Pembubuhan e-Meterai ────────────────────────────────────────────────────

export interface HasilMaterai {
  ok: boolean
  pdfBase64?: string
  sn?: string
  /** Kalimat siap tampil bila gagal. */
  pesan?: string
  /** true bila penyedianya memang belum dipasang — bukan kerusakan. */
  belumDipasang?: boolean
  distributor?: string[]
}

/**
 * Minta perantara membubuhkan e-Meterai.
 *
 * Kuota TIDAK dipotong di sini. Yang memotongnya adalah pemanggilnya, setelah
 * jawaban ini berhasil — supaya kegagalan jaringan tidak memakan meterai yang
 * sudah dibayar. Bila potongan sudah terjadi lalu pembubuhannya gagal,
 * `kembalikanKuota` yang mengurusnya.
 */
export async function bubuhkanMaterai(d: {
  pdfBase64: string; nomor: string; tanggal: string; namaDokumen?: string
}): Promise<HasilMaterai> {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    const res = await fetch('/api/materai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ namaDokumen: 'Kwitansi', ...d }),
    })
    const badan = await res.json().catch(() => null) as {
      pdfBase64?: string; sn?: string
      error?: { status?: string; message?: string; langkah?: string; distributor?: string[] }
    } | null

    if (res.ok && badan?.pdfBase64) {
      return { ok: true, pdfBase64: badan.pdfBase64, sn: badan.sn ?? '' }
    }
    const err = badan?.error
    if (err?.status === 'MATERAI_BELUM_DIPASANG') {
      return {
        ok: false, belumDipasang: true,
        pesan: `${err.message ?? ''} ${err.langkah ?? ''}`.trim(),
        distributor: err.distributor ?? [],
      }
    }
    return { ok: false, pesan: err?.message ?? `Pembubuhan gagal (HTTP ${res.status}).` }
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : 'Pembubuhan e-Meterai gagal.' }
  }
}
