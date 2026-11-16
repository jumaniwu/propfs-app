// ============================================================
// PropFS — Biaya pokok sebuah tower apartemen
//
// SATU rumus, dipakai di tiga tempat: mesin hitung (getSellingEntities),
// halaman Biaya Pembangunan (tempat angkanya diisi), dan halaman Harga Jual
// ("Prorata HPP Bangunan / m²").
//
// KENAPA BERKAS INI ADA.
//
// HPP apartemen dihitung dari biaya TOWER per m² GFA dan biaya PODIUM per m²,
// dibagi luas jual (NSA). Tetapi halaman Biaya Pembangunan dulu menampilkan
// isian yang sama untuk tower maupun rumah tapak: "Biaya Konstruksi (Rp/m²)"
// — kolom milik rumah tapak, yang TIDAK dibaca perhitungan apartemen. Biaya
// tower & podium sendiri tidak punya isian di mana pun, sehingga terkunci di
// nilai bawaannya. Pemakai mengubah biaya konstruksi tower menjadi Rp 12 juta,
// HPP di Harga Jual tetap dihitung dari Rp 7 juta, dan tidak ada satu pun
// tanda bahwa angka yang diketiknya diabaikan.
//
// Tanpa DOM & tanpa impor kode supaya bisa diuji langsung di Node.
// ============================================================
import type { TipeBangunan } from '@/types/fs.types'

/** Efisiensi lantai bila belum diisi — sama dengan bawaan Tipe Bangunan. */
export const EFISIENSI_BAWAAN = 80

export interface RincianBiayaTower {
  /** Jumlah unit seluruh tipe unit di tower ini. */
  unit: number
  /** Luas jual total (NSA / semi gross), m². */
  nsa: number
  /** Efisiensi lantai yang dipakai, %. */
  efisiensi: number
  /** Luas kotor (GFA) = NSA ÷ efisiensi, m². */
  gfa: number
  luasPodium: number
  biayaTowerPerM2: number
  biayaPodiumPerM2: number
  /** GFA × biaya tower per m². */
  biayaTower: number
  /** Luas podium × biaya podium per m². */
  biayaPodium: number
  total: number
  /**
   * Biaya pokok per m² LUAS JUAL. Inilah angka "Prorata HPP Bangunan / m²"
   * di Harga Jual — biaya podium & bagian GFA yang tidak dijual ikut
   * ditanggung setiap m² yang dijual.
   */
  hppPerM2: number
}

const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function rincianBiayaTower(t: Partial<TipeBangunan> | null | undefined): RincianBiayaTower {
  const units = Array.isArray(t?.tipeUnit) ? t!.tipeUnit! : []
  const unit = units.reduce((s, u) => s + angka(u?.jumlahUnit), 0)
  const nsa = units.reduce((s, u) => s + angka(u?.luasSemigross) * angka(u?.jumlahUnit), 0)
  // `|| bawaan`: efisiensi 0 tidak masuk akal dan akan membagi dengan nol.
  const efisiensi = angka(t?.efisiensiLantai) || EFISIENSI_BAWAAN
  const gfa = nsa / (efisiensi / 100)
  const luasPodium = angka(t?.luasPodiumParkiran)
  const biayaTowerPerM2 = angka(t?.biayaKonstruksiTowerPerM2)
  const biayaPodiumPerM2 = angka(t?.biayaKonstruksiPodiumPerM2)
  const biayaTower = gfa * biayaTowerPerM2
  const biayaPodium = luasPodium * biayaPodiumPerM2
  const total = biayaTower + biayaPodium
  return {
    unit, nsa, efisiensi, gfa, luasPodium, biayaTowerPerM2, biayaPodiumPerM2,
    biayaTower, biayaPodium, total,
    hppPerM2: nsa > 0 ? total / nsa : 0,
  }
}

/** HPP per m² luas jual di sebuah fase, setelah kenaikan biaya per fase. */
export function hppTowerFase(t: Partial<TipeBangunan> | null | undefined, fase: number): number {
  const naik = Math.pow(1 + angka(t?.kenaikanBiayaPerFase) / 100, Math.max(0, Math.floor(angka(fase)) - 1))
  return rincianBiayaTower(t).hppPerM2 * naik
}

/**
 * Angka yang pernah diketik di kolom LAMA "Biaya Konstruksi (Rp/m²)" sebuah
 * tower — kolom milik rumah tapak, yang tidak dibaca perhitungan apartemen.
 *
 * Tower baru dibuat dengan nilai 0 di kolom itu, jadi angka di atas nol pasti
 * hasil ketikan pemakai yang mengira kolom itu menentukan HPP tower. Angkanya
 * TIDAK dipindahkan diam-diam: halaman Biaya Pembangunan menawarkannya, dan
 * pemakai yang memutuskan.
 */
export function biayaKolomLamaTower(t: Partial<TipeBangunan> | null | undefined): number {
  if (t?.kategori !== 'apartemen') return 0
  const v = angka(t?.biayaKonstruksiPerM2)
  return v > 0 ? v : 0
}
