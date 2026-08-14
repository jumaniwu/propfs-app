// ============================================================
// PropFS — Jalur data aset & alat kerja.
//
// Memakai `restFetch` milik procurementApi, bukan salinannya: penyegaran
// token dan batas waktunya sudah terbukti, dan salinan kedua akan tertinggal
// begitu salah satunya diperbaiki.
// ============================================================
import { restFetch } from './procurementApi'
import { milikWorkspace } from './procurement'
import { dataOwnerId } from './teamApi'
import type { AsetAlat } from './asetAlat'

export type BuatAset = Omit<AsetAlat, 'id' | 'created_at'>

export interface AsetApi {
  list(): Promise<AsetAlat[]>
  buat(a: BuatAset): Promise<AsetAlat>
  ubah(id: string, patch: Partial<AsetAlat>): Promise<void>
  hapus(id: string): Promise<void>
}

const PESAN_404 = ' Jalankan migration_aset_alat.sql di Supabase SQL Editor.'
const PESAN_403 = ' Aksesnya ditolak. Coba keluar lalu masuk lagi; bila tetap begitu,'
  + ' pastikan migration_aset_alat.sql sudah dijalankan di Supabase.'

async function json<T>(path: string, init: RequestInit, apa: string): Promise<T> {
  const res = await restFetch(path, init, 15000)
  if (!res.ok) {
    throw new Error(
      `Gagal ${apa} (HTTP ${res.status}).`
      + (res.status === 404 ? PESAN_404 : res.status === 403 ? PESAN_403 : ''),
    )
  }
  return await res.json() as T
}

const nyata: AsetApi = {
  async list() {
    return await json<AsetAlat[]>('aset_alat?select=*&order=created_at.desc', {}, 'memuat daftar alat')
  },
  async buat(a) {
    // `user_id` distempel di sini, sama seperti seluruh tabel lain. Baris tanpa
    // pemilik membuat pemeriksaan RLS bernilai NULL — bukan true — sehingga
    // PostgREST menolaknya dengan 403 yang tidak menyebut kolom kosong.
    const rows = await json<AsetAlat[]>('aset_alat', {
      method: 'POST',
      body: JSON.stringify(milikWorkspace({ ...a }, dataOwnerId())),
      headers: { Prefer: 'return=representation' },
    }, 'menyimpan alat')
    return rows[0]
  },
  async ubah(id, patch) {
    const res = await restFetch(`aset_alat?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`Gagal memperbarui alat (HTTP ${res.status}).`)
  },
  async hapus(id) {
    const res = await restFetch(`aset_alat?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus alat (HTTP ${res.status}).`)
  },
}

export function asetApi(): AsetApi {
  return (window as { __asetApiMock?: AsetApi }).__asetApiMock ?? nyata
}
