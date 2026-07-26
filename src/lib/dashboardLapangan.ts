// ============================================================
// PropFS — Ringkasan untuk dashboard Home Kontraktor AI (logika murni)
//  • Status progres proyek: telat / on track / lebih cepat
//  • Stok material menipis: peringatan dini sebelum kehabisan
// ============================================================

import type { MaterialUsage, MaterialRequest } from './materialApi'
import type { MaterialScheduleItem } from '@/types/cost.types'

// ── Status progres pekerjaan ────────────────────────────────────────────────

export type StatusProgres = 'telat' | 'on_track' | 'lebih_cepat' | 'belum_mulai'

export interface ProyekProgres {
  projectId: string
  nama: string
  /** Progres fisik nyata, 0–100. */
  progressPct: number
  /** Progres yang seharusnya tercapai menurut jadwal, 0–100. */
  rencanaPct: number
  /** progressPct − rencanaPct. Negatif = tertinggal dari jadwal. */
  selisihPct: number
  status: StatusProgres
  /** Hari berjalan sejak mulai; negatif bila proyek belum dimulai. */
  hariBerjalan: number
  totalHari: number
}

const HARI = 86_400_000

/**
 * Berapa persen pekerjaan yang seharusnya selesai hari ini, dihitung linier
 * dari tanggal mulai dan durasi target proyek.
 */
export function rencanaProgres(
  startDate: string, durasiBulan: number, sekarang = new Date(),
): { rencanaPct: number; hariBerjalan: number; totalHari: number } {
  const mulai = new Date(startDate)
  const totalHari = Math.max(1, Math.round((durasiBulan || 0) * 30))
  if (Number.isNaN(mulai.getTime())) return { rencanaPct: 0, hariBerjalan: 0, totalHari }

  const hariBerjalan = Math.floor((sekarang.getTime() - mulai.getTime()) / HARI)
  const pct = (hariBerjalan / totalHari) * 100
  return {
    rencanaPct: Math.min(100, Math.max(0, pct)),
    hariBerjalan,
    totalHari,
  }
}

/** Ambang toleransi (persen) sebelum sebuah proyek dianggap telat. */
export const TOLERANSI_PCT = 5

export interface ProyekUntukProgres {
  id: string
  nama: string
  progressPct: number
  startDate: string
  durasiBulan: number
}

export function ringkasProgres(
  proyek: ProyekUntukProgres[], sekarang = new Date(),
): ProyekProgres[] {
  return proyek.map(p => {
    const { rencanaPct, hariBerjalan, totalHari } = rencanaProgres(p.startDate, p.durasiBulan, sekarang)
    const selisihPct = p.progressPct - rencanaPct

    let status: StatusProgres
    if (hariBerjalan < 0) status = 'belum_mulai'
    else if (selisihPct < -TOLERANSI_PCT) status = 'telat'
    else if (selisihPct > TOLERANSI_PCT) status = 'lebih_cepat'
    else status = 'on_track'

    return {
      projectId: p.id, nama: p.nama, progressPct: p.progressPct,
      rencanaPct, selisihPct, status, hariBerjalan, totalHari,
    }
  })
}

export const LABEL_STATUS: Record<StatusProgres, string> = {
  telat: 'Telat', on_track: 'On Track', lebih_cepat: 'Lebih Cepat', belum_mulai: 'Belum Mulai',
}

// ── Stok material menipis ───────────────────────────────────────────────────

export interface StokMenipis {
  nama: string
  satuan: string
  rencana: number
  terpakai: number
  /** rencana − terpakai; sisa yang masih boleh dipakai menurut rencana. */
  sisa: number
  /** Persentase sisa terhadap rencana. */
  sisaPct: number
  /** Qty request yang sudah disetujui/dibeli tapi belum diterima. */
  dalamProses: number
  /** true bila sisa sudah habis atau melewati rencana. */
  habis: boolean
}

/** Ambang bawaan: stok dianggap menipis bila sisa ≤ 20% dari rencana. */
export const AMBANG_MENIPIS_PCT = 20

/**
 * Material yang sisanya menipis atau sudah terlampaui, diurutkan dari yang
 * paling kritis. Material yang sudah punya request dalam proses tetap
 * ditampilkan, tapi ditandai agar tidak dipesan dua kali.
 */
export function stokMenipis(
  rencana: MaterialScheduleItem[],
  pemakaian: MaterialUsage[],
  requests: MaterialRequest[],
  ambangPct = AMBANG_MENIPIS_PCT,
): StokMenipis[] {
  const kunci = (s: string) => s.trim().toLowerCase()

  const map = new Map<string, StokMenipis>()
  for (const r of rencana) {
    const nama = (r.materialName ?? '').trim()
    if (!nama) continue
    const k = kunci(nama)
    const ada = map.get(k)
    if (ada) ada.rencana += r.estimatedVolume || 0
    else {
      map.set(k, {
        nama, satuan: r.unit || '-', rencana: r.estimatedVolume || 0,
        terpakai: 0, sisa: 0, sisaPct: 0, dalamProses: 0, habis: false,
      })
    }
  }

  for (const u of pemakaian) {
    const row = map.get(kunci(u.nama ?? ''))
    if (row) row.terpakai += u.qty || 0
  }

  for (const q of requests) {
    // hanya yang sedang berjalan; ditolak & diterima tidak menambah "dalam proses"
    if (q.status !== 'menunggu' && q.status !== 'disetujui' && q.status !== 'dibeli') continue
    const row = map.get(kunci(q.nama ?? ''))
    if (row) row.dalamProses += q.qty || 0
  }

  return [...map.values()]
    .map(r => {
      const sisa = r.rencana - r.terpakai
      return {
        ...r, sisa,
        sisaPct: r.rencana > 0 ? (sisa / r.rencana) * 100 : 0,
        habis: sisa <= 0,
      }
    })
    // hanya yang sudah dipakai dan sisanya menipis
    .filter(r => r.rencana > 0 && r.terpakai > 0 && r.sisaPct <= ambangPct)
    .sort((a, b) => a.sisaPct - b.sisaPct)
}
