// ============================================================
// PropFS — Kwitansi & kuota e-Meterai: jalur data
//
// Memakai `restFetch` milik procurementApi, bukan salinannya. Di dalamnya ada
// penyegaran token dan batas waktu yang sudah terbukti; menyalinnya akan
// melahirkan salinan kedua yang tertinggal begitu salah satunya diperbaiki.
// ============================================================
import { restFetch } from './procurementApi'
import { milikWorkspace } from './procurement'
import { dataOwnerId } from './teamApi'
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
  /**
   * PDF yang sudah dibubuhi meterai — INILAH yang diunduh konsumen bila ada.
   *
   * Opsional karena baris ini baru dikembalikan RPC setelah
   * migration_kwitansi_materai_publik.sql dijalankan. Selama belum, halaman
   * konsumen jatuh kembali ke PDF yang digambar ulang, persis seperti dulu.
   */
  materai_pdf?: string | null
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
  /**
   * PDF bermeterai satu baris, diambil hanya ketika benar-benar akan diunduh.
   *
   * Sengaja bukan bagian dari `list()`: berkasnya sampai 3 MB per baris, dan
   * daftar kwitansi memuat ulang tiap kali ada tindakan. String kosong berarti
   * barisnya memang belum punya versi bermeterai.
   */
  materaiPdf(id: string): Promise<string>

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
const PESAN_403 = ' Aksesnya ditolak. Coba keluar lalu masuk lagi; bila tetap begitu,'
  + ' pastikan migration_kwitansi_materai.sql sudah dijalankan di Supabase.'

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

/**
 * Kolom yang dimuat untuk daftar — disebut satu per satu supaya `materai_pdf`
 * TIDAK ikut.
 *
 * PDF bermeterai disimpan sebagai data URI di dalam barisnya sendiri, sampai
 * 3 MB setiap satu. Daftar kwitansi kini memuat ulang tiap kali ada tindakan,
 * jadi `select=*` berarti mengunduh ulang seluruh PDF yang pernah dibubuhi
 * hanya untuk menampilkan nomor dan nominalnya.
 */
const KOLOM_DAFTAR = [
  'id', 'nomor', 'tanggal', 'penerima_dari', 'penerima_wa', 'untuk_pembayaran',
  'jumlah', 'metode', 'project_name', 'penanda_nama', 'penanda_jabatan', 'catatan',
  'materai_status', 'materai_sn', 'penanda_signature', 'pemasukan_id', 'perlu_materai',
  'materai_at', 'materai_galat', 'view_token', 'terkirim_at', 'created_at',
].join(',')

const nyata: KwitansiApi = {
  async list() {
    // Bila satu saja kolom di atas belum ada di basis data pemakainya,
    // PostgREST menolak seluruh permintaannya. Daftar yang kosong gara-gara
    // satu nama kolom jauh lebih buruk daripada muatan yang lebih berat, jadi
    // ada jalan mundur ke `select=*`.
    const res = await restFetch(
      `kwitansi?select=${KOLOM_DAFTAR}&order=created_at.desc`, {}, 15000,
    ).catch(() => null)
    if (res?.ok) return await res.json() as BarisKwitansi[]
    return await json<BarisKwitansi[]>('kwitansi?select=*&order=created_at.desc', {}, 'memuat kwitansi')
  },
  async buat(k) {
    // `user_id` DISTEMPEL di sini, sama seperti seluruh tabel lain.
    //
    // Tanpa ini barisnya dikirim tanpa pemilik. Kolomnya `not null` dan
    // kebijakan RLS berbunyi `auth.uid() = user_id`, jadi PostgREST menolaknya
    // dengan 403 — dan 403 itu terbaca seperti "migrasinya belum dijalankan",
    // padahal migrasinya sudah benar sejak awal. Salah alamat yang membuat
    // orang menjalankan ulang SQL berkali-kali tanpa hasil.
    const rows = await json<BarisKwitansi[]>('kwitansi', {
      method: 'POST',
      body: JSON.stringify(milikWorkspace({ ...k }, dataOwnerId())),
      headers: { Prefer: 'return=representation' },
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
  async materaiPdf(id) {
    const rows = await json<Array<{ materai_pdf?: string | null }>>(
      `kwitansi?id=eq.${id}&select=materai_pdf`, {}, 'memuat PDF bermeterai',
    ).catch(() => [])
    return String(rows[0]?.materai_pdf ?? '')
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
