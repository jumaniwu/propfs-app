// ============================================================
// PropFS — Menarik kembali pengeluaran yang terhapus oleh satu ketukan
//
// KENAPA BERKAS INI ADA.
//
// Tombol "Reset" di Realisasi Biaya menghapus SELURUH pengeluaran proyek,
// dengan satu dialog konfirmasi yang mudah ditekan tanpa dibaca. Sekali
// tertekan, tidak ada jalan kembali sama sekali.
//
// Yang membuatnya tidak bisa dibatalkan bukan penghapusannya, melainkan
// NISAN-nya. Tiap entri yang dibuang dicatat sebagai "sengaja dihapus", dan
// catatan itu ikut tersinkron. Tanpanya, seluruh entri akan hidup kembali
// pada sinkronisasi berikutnya — jadi nisan itu memang harus ada. Tetapi
// akibatnya: salinan yang masih tersimpan di perangkat lain pun akan IKUT
// DIHAPUS begitu perangkat itu menyinkron. Nisan mengejar datanya ke mana pun
// ia berada.
//
// Karena itu memulihkan bukan sekadar menambahkan entrinya kembali. Nisannya
// harus diangkat pada saat yang sama — kalau tidak, entri yang baru saja
// dipulihkan akan lenyap lagi pada sinkronisasi berikutnya, dan yang
// memulihkannya akan mengira dirinya salah tekan untuk kedua kalinya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi.ts'

const teks = (v: unknown): string => String(v ?? '').trim()
const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface RencanaPulihRealisasi {
  /** Entri yang akan dikembalikan. */
  entri: RealisasiEntry[]
  /** Nisan yang harus diangkat supaya entri di atas tidak terhapus lagi. */
  nisanDiangkat: string[]
  totalRupiah: number
  /** Sudah ada di aplikasi, tidak diapa-apakan. */
  sudahAda: number
  /** Ditolak beserta sebabnya. */
  dilewati: Array<{ apa: string; sebab: string }>
}

/**
 * Baca entri pengeluaran dari apa pun bentuk salinannya.
 *
 * Diterima tiga bentuk, karena tiga-tiganya yang mungkin dipegang orang saat
 * sedang panik: isi localStorage apa adanya (larik proyek), satu objek proyek,
 * atau larik entri telanjang.
 */
export function bacaEntriPulih(mentah: unknown, proyekId?: string): RealisasiEntry[] {
  const dariProyek = (p: unknown): RealisasiEntry[] => {
    const o = p as { realisasiEntries?: unknown; info?: { id?: string }; id?: string } | null
    const e = o?.realisasiEntries
    return Array.isArray(e) ? e as RealisasiEntry[] : []
  }
  const idProyek = (p: unknown): string => {
    const o = p as { info?: { id?: string }; id?: string } | null
    return teks(o?.info?.id ?? o?.id)
  }

  if (Array.isArray(mentah)) {
    // Larik entri telanjang: dikenali dari adanya `jumlah` atau `tipe`.
    const telanjang = mentah.filter(
      x => x && typeof x === 'object' && ('jumlah' in x || 'tipe' in x),
    ) as RealisasiEntry[]
    if (telanjang.length > 0) return telanjang

    // Larik proyek. Bila id proyeknya disebut, HANYA proyek itu yang diambil —
    // menggabungkan pengeluaran dua proyek jauh lebih merusak daripada tidak
    // memulihkan apa pun.
    const cocok = proyekId
      ? mentah.filter(p => idProyek(p) === teks(proyekId))
      : mentah
    return cocok.flatMap(dariProyek)
  }
  if (mentah && typeof mentah === 'object') return dariProyek(mentah)
  return []
}

/**
 * Susun rencana pemulihan.
 *
 * `nisan` adalah daftar id yang tercatat "sengaja dihapus". Berbeda dari
 * pemulihan lain di aplikasi ini, di sini nisan TIDAK menghalangi — justru
 * nisan itulah yang sedang dibatalkan. Reset adalah penghapusan yang disesali,
 * dan menghormati nisannya berarti menolak memulihkan apa pun.
 */
export function rencanaPulihRealisasi(
  calon: RealisasiEntry[] | null | undefined,
  entriSekarang: Array<{ id?: string }> | null | undefined,
  nisan?: Array<string | { id?: string }> | null,
): RencanaPulihRealisasi {
  const ada = new Set((entriSekarang ?? []).map(e => teks(e?.id)).filter(Boolean))
  const idNisan = new Set(
    (nisan ?? []).map(h => typeof h === 'string' ? teks(h) : teks(h?.id)).filter(Boolean),
  )

  const entri: RealisasiEntry[] = []
  const dilewati: Array<{ apa: string; sebab: string }> = []
  const dipakai = new Set<string>()
  let sudahAda = 0

  for (const e of calon ?? []) {
    const id = teks(e?.id)
    const nama = teks(e?.namaMaterial) || teks(e?.namaTukang) || teks(e?.keterangan) || id || '(tanpa nama)'
    if (!id) { dilewati.push({ apa: nama, sebab: 'tidak punya id' }); continue }
    if (ada.has(id)) { sudahAda++; continue }
    if (dipakai.has(id)) continue
    const jumlah = angka(e?.jumlah)
    if (jumlah <= 0) { dilewati.push({ apa: nama, sebab: 'nominalnya nol' }); continue }
    dipakai.add(id)
    entri.push({ ...e, id, jumlah })
  }

  return {
    entri,
    // Hanya nisan milik entri yang benar-benar dipulihkan. Mengangkat seluruh
    // nisan akan menghidupkan kembali penghapusan yang memang disengaja.
    nisanDiangkat: entri.map(e => e.id).filter(id => idNisan.has(id)),
    totalRupiah: entri.reduce((s, e) => s + angka(e.jumlah), 0),
    sudahAda,
    dilewati,
  }
}

/** Kalimat konfirmasi — menyebut nominal, karena itu yang bisa dicocokkan orang. */
export function kalimatPulihRealisasi(r: RencanaPulihRealisasi | null | undefined): string {
  const n = r?.entri.length ?? 0
  if (n < 1) {
    if ((r?.sudahAda ?? 0) > 0) return 'Semua pengeluaran di berkas ini sudah ada di aplikasi.'
    return 'Tidak ada pengeluaran yang bisa dipulihkan dari berkas ini.'
  }
  const rupiah = `Rp ${Math.round(r?.totalRupiah ?? 0).toLocaleString('id-ID')}`
  const bagian = [`${n} pengeluaran senilai ${rupiah} akan dikembalikan.`]
  if ((r?.sudahAda ?? 0) > 0) bagian.push(`${r?.sudahAda} yang sudah ada dibiarkan apa adanya.`)
  if ((r?.nisanDiangkat.length ?? 0) > 0) {
    bagian.push(`Catatan "sudah dihapus" untuk ${r?.nisanDiangkat.length} entri ikut dibatalkan,`
      + ' supaya tidak terhapus lagi saat sinkron.')
  }
  return bagian.join(' ')
}
