// ============================================================
// PropFS — Jalur data serah-terima alat kerja.
//
// Memakai `restFetch` milik procurementApi, bukan salinannya: penyegaran
// token dan batas waktunya sudah terbukti, dan salinan kedua akan tertinggal
// begitu salah satunya diperbaiki.
// ============================================================
import { restFetch } from './procurementApi'
import { milikWorkspace } from './procurement'
import { dataOwnerId } from './teamApi'
import type { Peminjaman } from './lacakAlat'

export type BuatPinjam = Omit<Peminjaman, 'id' | 'created_at'>

export interface AsetPinjamApi {
  list(): Promise<Peminjaman[]>
  pinjam(p: BuatPinjam): Promise<Peminjaman>
  kembalikan(id: string, patch: Partial<Peminjaman>): Promise<void>
  hapus(id: string): Promise<void>
}

const PESAN_404 = ' Jalankan migration_aset_pinjam.sql di Supabase SQL Editor.'
const PESAN_403 = ' Aksesnya ditolak. Coba keluar lalu masuk lagi; bila tetap begitu,'
  + ' pastikan migration_aset_pinjam.sql sudah dijalankan di Supabase.'

// Indeks unik parsial `aset_pinjam_satu_berjalan` menolak peminjaman kedua
// atas alat yang sama. Penolakannya sampai ke sini sebagai 409, dan pesan
// bawaan PostgREST menyebut nama indeksnya — yang tidak berarti apa pun bagi
// pengawas yang sedang berdiri di gudang. Diterjemahkan ke sebabnya.
const PESAN_409 = 'Alat ini baru saja dicatat dipinjam orang lain.'
  + ' Muat ulang daftarnya dulu — jangan dicatat dua kali.'

const PESAN_KOLOM = ' Kolom kelengkapan belum ada:'
  + ' jalankan migration_aset_lengkap.sql di Supabase SQL Editor.'

async function gagal(res: Response, apa: string): Promise<string> {
  if (res.status === 409) return PESAN_409
  if (res.status === 400) {
    const isi = await res.text().catch(() => '')
    if (/PGRST204|column/i.test(isi)) return `Gagal ${apa} (HTTP 400).${PESAN_KOLOM}`
  }
  return `Gagal ${apa} (HTTP ${res.status}).`
    + (res.status === 404 ? PESAN_404 : res.status === 403 ? PESAN_403 : '')
}

async function json<T>(path: string, init: RequestInit, apa: string): Promise<T> {
  const res = await restFetch(path, init, 15000)
  if (!res.ok) throw new Error(await gagal(res, apa))
  return await res.json() as T
}

const nyata: AsetPinjamApi = {
  async list() {
    // Foto ikut diambil. Ia besar — satu data URL bisa ratusan kilobita — dan
    // godaannya adalah mengambilnya belakangan. Tetapi foto itulah seluruh
    // gunanya tanda terima: memuat daftarnya tanpa foto berarti membuka
    // catatan yang tidak membuktikan apa-apa sampai diketuk satu per satu.
    return await json<Peminjaman[]>(
      'aset_pinjam?select=*&order=pinjam_at.desc&limit=400', {}, 'memuat catatan peminjaman',
    )
  },
  async pinjam(p) {
    // `user_id` distempel di sini, sama seperti seluruh tabel lain. Baris tanpa
    // pemilik membuat pemeriksaan RLS bernilai NULL — bukan true — sehingga
    // PostgREST menolaknya dengan 403 yang tidak menyebut kolom kosong.
    const rows = await json<Peminjaman[]>('aset_pinjam', {
      method: 'POST',
      body: JSON.stringify(milikWorkspace({ ...p }, dataOwnerId())),
      headers: { Prefer: 'return=representation' },
    }, 'menyimpan peminjaman')
    return rows[0]
  },
  async kembalikan(id, patch) {
    // Hanya baris yang MASIH BERJALAN yang boleh ditutup. Tanpa syarat
    // `kembali_at=is.null` di sini, dua ketukan tombol "Catat pengembalian"
    // akan menimpa pengembalian pertama dengan waktu yang kedua — dan foto
    // yang benar hilang tanpa jejak.
    const res = await restFetch(`aset_pinjam?id=eq.${id}&kembali_at=is.null`, {
      method: 'PATCH', body: JSON.stringify(patch),
      headers: { Prefer: 'return=representation' },
    }, 15000)
    if (!res.ok) throw new Error(await gagal(res, 'mencatat pengembalian'))
    const rows = await res.json() as Peminjaman[]
    if (!rows.length) {
      throw new Error('Pengembalian alat ini sudah dicatat sebelumnya. Muat ulang daftarnya.')
    }
  },
  async hapus(id) {
    const res = await restFetch(`aset_pinjam?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Gagal menghapus catatan (HTTP ${res.status}).`)
  },
}

export function asetPinjamApi(): AsetPinjamApi {
  return (window as { __asetPinjamApiMock?: AsetPinjamApi }).__asetPinjamApiMock ?? nyata
}
