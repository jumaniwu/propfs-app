// ============================================================
// PropFS — TypeScript Types & Interfaces
// PT. Mettaland Batam Sukses
// ============================================================

export type JenisProyek = 'perumahan' | 'ruko' | 'mixed'
export type StatusKelayakan = 'sangat_layak' | 'layak' | 'tidak_layak'
export type MetodeBunga = 'flat' | 'anuitas' | 'efektif'

// ── TIPE BANGUNAN ──────────────────────────────────────────
export interface TipeUnitApartemen {
  id: string
  nama: string
  luasSemigross: number
  jumlahUnit: number
  marginUnitPerM2: number
  kelipatanMarginUnit: number
}

export interface TipeBangunan {
  kategori?: 'landed' | 'apartemen'
  id: string
  nama: string
  luasBangunan: number     // m² (untuk apartemen = 0 / diabaikan)
  luasKavling: number      // m² (untuk apartemen = 0 / diabaikan)
  jumlahUnit: number       // (untuk apartemen otomatis dihitung dari tipeUnit)
  // Biaya per tipe (Step 4) / Landed
  biayaKonstruksiPerM2: number
  kenaikanBiayaPerFase: number  // %, default 5
  // Harga jual (Step 5) / Landed
  marginBangunanPerM2: number
  kelipatanMarginBangunan: number
  marginKavlingPerM2: number
  kelipatanMarginKavling: number
  
  // Field Apartemen
  luasLahanTower?: number             // footprint (m2)
  luasLantaiDasar?: number            // GFA Ground (m2)
  luasPodiumParkiran?: number         // GFA Podium (m2)
  efisiensiLantai?: number            // %, default 80
  biayaKonstruksiPodiumPerM2?: number // Rp/m2
  biayaKonstruksiTowerPerM2?: number  // Rp/m2
  tipeUnit?: TipeUnitApartemen[]      // unit mix
}

// ── DATA LAHAN ─────────────────────────────────────────────
export interface DataLahan {
  luasLahanTotal: number       // m²
  pctLahanEfektif: number      // %, default 50
  statusKerjasama: boolean     // true: Kerjasama Bagi Hasil, false: Milik Sendiri
  luasLahanDisimpan?: number   // m², Land Banking / Future Development
  // Auto-calculated:
  luasEfektif?: number         // luasTotal × pct - luasLahanDisimpan
  luasFasilitasUmum?: number   // luasTotal - luasEfektif - luasLahanDisimpan
}

// ── BIAYA PERSIAPAN ────────────────────────────────────────
export interface BiayaPersiapan {
  hargaBeliLahan: number           // Rp total
  hargaBeliLahanPerM2?: number     // opsional
  gunakanPerM2: boolean            // untuk Lahan

  biayaPerizinan: number
  biayaPerizinanPerM2?: number
  gunakanPerizinanPerM2?: boolean

  biayaPengolahanLahan: number
  biayaPengolahanPerM2?: number
  gunakanPengolahanPerM2?: boolean

  biayaSaranadanPrasarana: number
  biayaSarprasPerM2?: number
  gunakanSarprasPerM2?: boolean

  biayaInventarisProyek: number
  biayaInventarisPerM2?: number
  gunakanInventarisPerM2?: boolean
}

// ── BIAYA OPERASIONAL ──────────────────────────────────────
export type ModeBiayaOperasional = 'per_bulan' | 'lumpsum_periode' | 'detail_item'

export interface DetailPemasaran {
  brosur: number
  spanduk: number
  papanReklame: number
  sponsor: number
  iklanMedia: number
  pameran: number
  biayaLainLain: number
}

export interface DetailGajiKantor {
  komisaris: { org: number; gaji: number }
  direktur: { org: number; gaji: number }
  keuangan: { org: number; gaji: number }
  logistik: { org: number; gaji: number }
  legal: { org: number; gaji: number }
  administrasi: { org: number; gaji: number }
  pemasaran: { org: number; gaji: number }
  arsitek: { org: number; gaji: number }
  engineer: { org: number; gaji: number }
  pengawas: { org: number; gaji: number }
  penjaga: { org: number; gaji: number }
  lainLainGaji: number
}

export interface DetailUmumKantor {
  gaji: DetailGajiKantor
  atk: number
  konsumsi: number
  akomodasi: number
  transportasi: number
  komunikasi: number
  biayaLainLain: number
}

export interface BiayaOperasional {
  biayaMarketingMode: ModeBiayaOperasional
  biayaMarketingPerBulan: number
  biayaMarketingLumpsum: number
  biayaMarketingDetail: DetailPemasaran

  biayaUmumMode: ModeBiayaOperasional
  biayaUmumKantorPerBulan: number
  biayaUmumLumpsum: number
  biayaUmumDetail: DetailUmumKantor
}

// ── PINJAMAN ──────────────────────────────────────────────
export interface DataPinjaman {
  pokokPinjaman: number
  bungaPerTahun: number   // %
  periodeBulan: number
  metode: MetodeBunga
}

// ── BAGI HASIL ─────────────────────────────────────────────
export interface SkenarioBagiHasil {
  id: 'A' | 'B' | 'C'
  label: string
  pctPemilik: number   // % ke pemilik lahan dari Gross Revenue
}

// ── POTONGAN ──────────────────────────────────────────────
export interface DataPotongan {
  pphFinal: number              // %, default 2.5
  riba?: DataPinjaman
  feePenjualanLangsung: number  // %, default 5
  bonusTutupTahun: number       // %, default 2.5
  skenarioBagiHasil: SkenarioBagiHasil[]
  csrDanLainLain: number        // Rp lump sum
}

// ── SIMULASI PENJUALAN & SKEMA PEMBAYARAN ─────────────────
export interface DataSkemaPembayaran {
  pctCashKeras: number
  pctCashBertahap: number
  pctKPR: number
  durasiCashBertahap: number
  dpKPR: number
  durasiCicilDPKPR: number
}

export interface PenjualanPerFase {
  tipeId: string
  fase: number
  unitTerjual: number
}

// ── INPUT LENGKAP FS ──────────────────────────────────────
export interface FSInputs {
  // Step 1
  namaProyek: string
  alamatLokasi: string
  namaDeveloper: string
  tahunMulai: number
  jumlahFase: number         // 1-6, default 3
  durasiPerFase: number      // bulan, default 24
  jenisProyek: JenisProyek
  logoUrl?: string           // base64 atau url

  // Step 2
  lahan: DataLahan

  // Step 3
  tipeBangunan: TipeBangunan[]

  // Step 4
  biayaPersiapan: BiayaPersiapan
  biayaOperasional: BiayaOperasional

  // Step 5 — harga jual di-embed dalam TipeBangunan (margin fields)

  // Step 6
  penjualan: PenjualanPerFase[]
  skemaPembayaran: DataSkemaPembayaran

  // Step 7
  potongan: DataPotongan
}

// ── OUTPUT / RESULTS ───────────────────────────────────────

export interface HargaJualPerFase {
  tipeId: string
  fase: number
  hargaBangunan: number
  hargaKavling: number
  hargaTotal: number
}

export interface BiayaBangunPerFase {
  tipeId: string
  fase: number
  biayaPerUnit: number
  totalUnit: number
  totalBiaya: number
}

export interface PenerimaanPerFase {
  fase: number
  tipeId: string
  unitTerjual: number
  hargaPerUnit: number
  totalPenerimaan: number
}

export interface BagiHasilResult {
  skenarioId: 'A' | 'B' | 'C'
  pctPemilik: number
  nilaiPemilik: number
  nilaiDeveloper: number
  netDevProfit: number
  netDevMargin: number
  status: StatusKelayakan
}

export interface CashFlowPeriode {
  periode: number          // 1-based (bulan atau quarter)
  label: string            // "Q1 F1", "Bulan 1", dll
  penerimaan: number
  biayaBangun: number
  biayaPersiapan: number
  biayaOperasional: number
  netCF: number
  kumulatif: number
  salesMarketing: number
  arBulanan: number
  apBulanan: number
}

export interface CashFlowResult {
  monthly: CashFlowPeriode[]
  quarterly: CashFlowPeriode[]
  annual: CashFlowPeriode[]
  breakevenBulan: number | null
  breakevenQuarter: number | null
  peakNegativeCF: number
  totalCashIn: number
  totalCashOut: number
}

export interface SensitivityCell {
  biayaChange: number    // %
  revenueChange: number  // %
  netMargin: number      // %
  status: StatusKelayakan
}

export interface AssetLahan {
  luasLahanDisimpan: number
  estimasiHargaPerM2: number
  totalNilaiAset: number
}

export interface FSResults {
  // Biaya
  totalBiayaPersiapan: number
  totalBiayaOperasional: number
  totalBiayaBangun: number
  totalInvestment: number

  // Revenue
  grossRevenue: number
  hargaJualPerFase: HargaJualPerFase[]
  penerimaanPerFase: PenerimaanPerFase[]
  biayaBangunPerFase: BiayaBangunPerFase[]

  // Profit
  grossProfit: number
  grossMargin: number

  // Potongan
  pphFinal: number
  totalRiba: number
  feeMarketing: number
  bonusTutupTahun: number
  csr: number
  totalPotongan: number

  // Net
  netProfit: number
  netMargin: number
  statusKelayakan: StatusKelayakan

  // Bagi hasil
  bagiHasil: BagiHasilResult[]

  // Asset Lahan Future Dev
  assetLahan?: AssetLahan

  // Cash flow
  cashFlow: CashFlowResult

  // Sensitivitas
  sensitivityMatrix: SensitivityCell[][]

  // Per unit stats
  rataHargaPerUnit: number
  hppPerUnit: number
  revenuePerM2: number
  totalUnit: number

  // Biaya per m²
  biayaPersiapanPerM2: number
  biayaOpsPerM2: number
}

// ── SAVED PROJECT ──────────────────────────────────────────
export interface SavedProject {
  id: string
  user_id?: string
  createdAt: string
  updatedAt: string
  name: string
  inputs: FSInputs
  results: FSResults | null
  version: string
}

// ── DEFAULT VALUES ─────────────────────────────────────────
export const DEFAULT_TIPE: Omit<TipeBangunan, 'id'> = {
  kategori: 'landed',
  nama: '',
  luasBangunan: 0,
  luasKavling: 0,
  jumlahUnit: 0,
  biayaKonstruksiPerM2: 6000000,
  kenaikanBiayaPerFase: 5,
  marginBangunanPerM2: 2000000,
  kelipatanMarginBangunan: 5,
  marginKavlingPerM2: 1000000,
  kelipatanMarginKavling: 5,
}

export const DEFAULT_APARTEMEN: Omit<TipeBangunan, 'id'> = {
  kategori: 'apartemen',
  nama: '',
  luasBangunan: 0,
  luasKavling: 0,
  jumlahUnit: 0,
  biayaKonstruksiPerM2: 0,
  kenaikanBiayaPerFase: 5,
  marginBangunanPerM2: 0,
  kelipatanMarginBangunan: 1,
  marginKavlingPerM2: 0,
  kelipatanMarginKavling: 1,
  
  luasLahanTower: 0,
  luasLantaiDasar: 0,
  luasPodiumParkiran: 0,
  efisiensiLantai: 80,
  biayaKonstruksiPodiumPerM2: 5000000,
  biayaKonstruksiTowerPerM2: 7000000,
  tipeUnit: []
}

export const DEFAULT_INPUTS: FSInputs = {
  namaProyek: '',
  alamatLokasi: '',
  namaDeveloper: '',
  tahunMulai: new Date().getFullYear(),
  jumlahFase: 3,
  durasiPerFase: 24,
  jenisProyek: 'perumahan',
  lahan: {
    luasLahanTotal: 0,
    pctLahanEfektif: 50,
    statusKerjasama: true,
    luasLahanDisimpan: 0,
  },
  tipeBangunan: [],
  biayaPersiapan: {
    hargaBeliLahan: 0,
    hargaBeliLahanPerM2: 0,
    gunakanPerM2: false,
    
    biayaPerizinan: 0,
    biayaPerizinanPerM2: 0,
    gunakanPerizinanPerM2: false,
    
    biayaPengolahanLahan: 0,
    biayaPengolahanPerM2: 0,
    gunakanPengolahanPerM2: false,
    
    biayaSaranadanPrasarana: 0,
    biayaSarprasPerM2: 0,
    gunakanSarprasPerM2: false,
    
    biayaInventarisProyek: 0,
    biayaInventarisPerM2: 0,
    gunakanInventarisPerM2: false,
  },
  biayaOperasional: {
    biayaMarketingMode: 'per_bulan',
    biayaMarketingPerBulan: 0,
    biayaMarketingLumpsum: 0,
    biayaMarketingDetail: {
      brosur: 0, spanduk: 0, papanReklame: 0, sponsor: 0, iklanMedia: 0, pameran: 0, biayaLainLain: 0
    },
    biayaUmumMode: 'per_bulan',
    biayaUmumKantorPerBulan: 0,
    biayaUmumLumpsum: 0,
    biayaUmumDetail: {
      gaji: {
        komisaris: { org: 0, gaji: 20000000 },
        direktur: { org: 1, gaji: 20000000 },
        keuangan: { org: 1, gaji: 3000000 },
        logistik: { org: 0, gaji: 3000000 },
        legal: { org: 0, gaji: 3000000 },
        administrasi: { org: 1, gaji: 3000000 },
        pemasaran: { org: 2, gaji: 3000000 },
        arsitek: { org: 0, gaji: 4000000 },
        engineer: { org: 0, gaji: 4000000 },
        pengawas: { org: 1, gaji: 4000000 },
        penjaga: { org: 2, gaji: 2000000 },
        lainLainGaji: 0
      },
      atk: 0, konsumsi: 0, akomodasi: 0, transportasi: 0, komunikasi: 0, biayaLainLain: 0
    }
  },
  penjualan: [],
  skemaPembayaran: {
    pctCashKeras: 10,
    pctCashBertahap: 30,
    pctKPR: 60,
    durasiCashBertahap: 24,
    dpKPR: 20,
    durasiCicilDPKPR: 6
  },
  potongan: {
    pphFinal: 2.5,
    feePenjualanLangsung: 5,
    bonusTutupTahun: 2.5,
    csrDanLainLain: 0,
    skenarioBagiHasil: [
      { id: 'A', label: 'Skenario A', pctPemilik: 25 },
      { id: 'B', label: 'Skenario B', pctPemilik: 30 },
      { id: 'C', label: 'Skenario C', pctPemilik: 35 },
    ],
  },
}

// ── TEMPLATE DATA ──────────────────────────────────────────
export const TEMPLATE_A: Partial<FSInputs> = {
  namaProyek: 'King Square - Bodhi Dharma',
  alamatLokasi: 'Batam Centre, Kepulauan Riau',
  namaDeveloper: '',
  tahunMulai: 2024,
  jumlahFase: 3,
  durasiPerFase: 24,
  jenisProyek: 'perumahan',
  lahan: {
    luasLahanTotal: 130000,
    pctLahanEfektif: 50,
    statusKerjasama: true,
  },
  tipeBangunan: [
    { id: 't1', nama: 'TIPE 235/85',  luasBangunan: 235, luasKavling: 85,  jumlahUnit: 242, biayaKonstruksiPerM2: 3500000, kenaikanBiayaPerFase: 5, marginBangunanPerM2: 2000000, kelipatanMarginBangunan: 5, marginKavlingPerM2: 1000000, kelipatanMarginKavling: 5 },
    { id: 't2', nama: 'TIPE 90/90',   luasBangunan: 90,  luasKavling: 90,  jumlahUnit: 150, biayaKonstruksiPerM2: 6000000, kenaikanBiayaPerFase: 5, marginBangunanPerM2: 2000000, kelipatanMarginBangunan: 5, marginKavlingPerM2: 1000000, kelipatanMarginKavling: 5 },
    { id: 't3', nama: 'TIPE 120/105', luasBangunan: 120, luasKavling: 105, jumlahUnit: 120, biayaKonstruksiPerM2: 6000000, kenaikanBiayaPerFase: 5, marginBangunanPerM2: 2000000, kelipatanMarginBangunan: 5, marginKavlingPerM2: 1000000, kelipatanMarginKavling: 5 },
    { id: 't4', nama: 'TIPE 180/128', luasBangunan: 180, luasKavling: 128, jumlahUnit: 50,  biayaKonstruksiPerM2: 6000000, kenaikanBiayaPerFase: 5, marginBangunanPerM2: 2000000, kelipatanMarginBangunan: 5, marginKavlingPerM2: 1000000, kelipatanMarginKavling: 5 },
    { id: 't5', nama: 'TIPE 250/200', luasBangunan: 250, luasKavling: 200, jumlahUnit: 40,  biayaKonstruksiPerM2: 6000000, kenaikanBiayaPerFase: 5, marginBangunanPerM2: 2000000, kelipatanMarginBangunan: 5, marginKavlingPerM2: 1000000, kelipatanMarginKavling: 5 },
  ],
  biayaPersiapan: {
    hargaBeliLahan: 78000000000,
    hargaBeliLahanPerM2: 0,
    gunakanPerM2: false,
    
    biayaPerizinan: 0,
    biayaPerizinanPerM2: 0,
    gunakanPerizinanPerM2: false,
    
    biayaPengolahanLahan: 0,
    biayaPengolahanPerM2: 0,
    gunakanPengolahanPerM2: false,
    
    biayaSaranadanPrasarana: 0,
    biayaSarprasPerM2: 0,
    gunakanSarprasPerM2: false,
    
    biayaInventarisProyek: 0,
    biayaInventarisPerM2: 0,
    gunakanInventarisPerM2: false,
  },
  biayaOperasional: {
    biayaMarketingMode: 'per_bulan',
    biayaMarketingPerBulan: 63000000,
    biayaMarketingLumpsum: 0,
    biayaMarketingDetail: {
      brosur: 5000000, spanduk: 3000000, papanReklame: 6000000, sponsor: 5000000, iklanMedia: 15000000, pameran: 10000000, biayaLainLain: 1000000
    },
    biayaUmumMode: 'per_bulan',
    biayaUmumKantorPerBulan: 63000000,
    biayaUmumLumpsum: 0,
    biayaUmumDetail: {
      gaji: {
        komisaris: { org: 0, gaji: 20000000 },
        direktur: { org: 1, gaji: 20000000 },
        keuangan: { org: 1, gaji: 2500000 },
        logistik: { org: 1, gaji: 5000000 },
        legal: { org: 1, gaji: 5000000 },
        administrasi: { org: 1, gaji: 2500000 },
        pemasaran: { org: 4, gaji: 3000000 },
        arsitek: { org: 0, gaji: 3000000 },
        engineer: { org: 0, gaji: 3000000 },
        pengawas: { org: 1, gaji: 6000000 },
        penjaga: { org: 4, gaji: 3000000 },
        lainLainGaji: 1000000
      },
      atk: 2000000, konsumsi: 0, akomodasi: 0, transportasi: 0, komunikasi: 3000000, biayaLainLain: 5000000
    }
  },
  penjualan: [
    // TIPE 235/85 — 242 unit / 3 fase
    { tipeId: 't1', fase: 1, unitTerjual: 81 },
    { tipeId: 't1', fase: 2, unitTerjual: 81 },
    { tipeId: 't1', fase: 3, unitTerjual: 80 },
    // TIPE 90/90 — 150 unit / 3 fase
    { tipeId: 't2', fase: 1, unitTerjual: 50 },
    { tipeId: 't2', fase: 2, unitTerjual: 50 },
    { tipeId: 't2', fase: 3, unitTerjual: 50 },
    // TIPE 120/105 — 120 unit / 3 fase
    { tipeId: 't3', fase: 1, unitTerjual: 40 },
    { tipeId: 't3', fase: 2, unitTerjual: 40 },
    { tipeId: 't3', fase: 3, unitTerjual: 40 },
    // TIPE 180/128 — 50 unit / 3 fase
    { tipeId: 't4', fase: 1, unitTerjual: 17 },
    { tipeId: 't4', fase: 2, unitTerjual: 17 },
    { tipeId: 't4', fase: 3, unitTerjual: 16 },
    // TIPE 250/200 — 40 unit / 3 fase
    { tipeId: 't5', fase: 1, unitTerjual: 14 },
    { tipeId: 't5', fase: 2, unitTerjual: 10 },
    { tipeId: 't5', fase: 3, unitTerjual: 15 },
  ],
  skemaPembayaran: {
    pctCashKeras: 10,
    pctCashBertahap: 30,
    pctKPR: 60,
    durasiCashBertahap: 24,
    dpKPR: 20,
    durasiCicilDPKPR: 6
  },
  potongan: {
    pphFinal: 2.5,
    feePenjualanLangsung: 5,
    bonusTutupTahun: 2.5,
    csrDanLainLain: 0,
    skenarioBagiHasil: [
      { id: 'A', label: 'Skenario A', pctPemilik: 25 },
      { id: 'B', label: 'Skenario B', pctPemilik: 30 },
      { id: 'C', label: 'Skenario C', pctPemilik: 35 },
    ],
  },
}

export const TEMPLATE_B: Partial<FSInputs> = {
  namaProyek: 'Ruko Komersial 2LT — Batam Centre',
  alamatLokasi: 'Batam Centre, ROW 70m',
  namaDeveloper: 'PT. KIS Batam Centre',
  tahunMulai: 2024,
  jumlahFase: 1,
  durasiPerFase: 12,
  jenisProyek: 'ruko',
  lahan: {
    luasLahanTotal: 5500,
    pctLahanEfektif: 70,
    statusKerjasama: true,
  },
  tipeBangunan: [
    { id: 'r1', nama: 'Standard',  luasBangunan: 140, luasKavling: 133, jumlahUnit: 19, biayaKonstruksiPerM2: 3800000, kenaikanBiayaPerFase: 0, marginBangunanPerM2: 2500000, kelipatanMarginBangunan: 1, marginKavlingPerM2: 2000000, kelipatanMarginKavling: 1 },
    { id: 'r2', nama: 'Corner',    luasBangunan: 140, luasKavling: 133, jumlahUnit: 8,  biayaKonstruksiPerM2: 3800000, kenaikanBiayaPerFase: 0, marginBangunanPerM2: 3500000, kelipatanMarginBangunan: 1, marginKavlingPerM2: 2000000, kelipatanMarginKavling: 1 },
    { id: 'r3', nama: 'End Unit',  luasBangunan: 140, luasKavling: 133, jumlahUnit: 4,  biayaKonstruksiPerM2: 3800000, kenaikanBiayaPerFase: 0, marginBangunanPerM2: 3000000, kelipatanMarginBangunan: 1, marginKavlingPerM2: 2000000, kelipatanMarginKavling: 1 },
  ],
  biayaPersiapan: {
    hargaBeliLahan: 2500000000,
    hargaBeliLahanPerM2: 0,
    gunakanPerM2: false,
    biayaPerizinan: 500000000,
    biayaPerizinanPerM2: 0,
    gunakanPerizinanPerM2: false,
    biayaPengolahanLahan: 1000000000,
    biayaPengolahanPerM2: 0,
    gunakanPengolahanPerM2: false,
    biayaSaranadanPrasarana: 1500000000,
    biayaSarprasPerM2: 0,
    gunakanSarprasPerM2: false,
    biayaInventarisProyek: 250000000,
    biayaInventarisPerM2: 0,
    gunakanInventarisPerM2: false,
  },
  biayaOperasional: {
    biayaMarketingMode: 'per_bulan',
    biayaMarketingPerBulan: 30000000,
    biayaMarketingLumpsum: 0,
    biayaMarketingDetail: {
      brosur: 5000000, spanduk: 3000000, papanReklame: 6000000, sponsor: 5000000, iklanMedia: 15000000, pameran: 10000000, biayaLainLain: 1000000
    },
    biayaUmumMode: 'per_bulan',
    biayaUmumKantorPerBulan: 20000000,
    biayaUmumLumpsum: 0,
    biayaUmumDetail: {
      gaji: {
        komisaris: { org: 0, gaji: 15000000 },
        direktur: { org: 1, gaji: 15000000 },
        keuangan: { org: 1, gaji: 2500000 },
        logistik: { org: 1, gaji: 3000000 },
        legal: { org: 0, gaji: 3000000 },
        administrasi: { org: 1, gaji: 2500000 },
        pemasaran: { org: 2, gaji: 3000000 },
        arsitek: { org: 0, gaji: 3000000 },
        engineer: { org: 0, gaji: 3000000 },
        pengawas: { org: 1, gaji: 5000000 },
        penjaga: { org: 2, gaji: 3000000 },
        lainLainGaji: 500000
      },
      atk: 1000000, konsumsi: 0, akomodasi: 0, transportasi: 0, komunikasi: 2000000, biayaLainLain: 2000000
    }
  },
  penjualan: [
    { tipeId: 'r1', fase: 1, unitTerjual: 19 },
    { tipeId: 'r2', fase: 1, unitTerjual: 8 },
    { tipeId: 'r3', fase: 1, unitTerjual: 4 },
  ],
  skemaPembayaran: {
    pctCashKeras: 20,
    pctCashBertahap: 50,
    pctKPR: 30,
    durasiCashBertahap: 12,
    dpKPR: 20,
    durasiCicilDPKPR: 6
  },
  potongan: {
    pphFinal: 2.5,
    feePenjualanLangsung: 3,
    bonusTutupTahun: 1,
    csrDanLainLain: 0,
    skenarioBagiHasil: [
      { id: 'A', label: 'Skenario A', pctPemilik: 20 },
      { id: 'B', label: 'Skenario B', pctPemilik: 25 },
      { id: 'C', label: 'Skenario C', pctPemilik: 30 },
    ],
  },
}
