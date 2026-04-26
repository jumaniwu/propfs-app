// ============================================================
// PropFS — Core Feasibility Study Calculation Engine
// PT. Mettaland Batam Sukses
// ============================================================

import type {
  FSInputs,
  FSResults,
  TipeBangunan,
  BiayaBangunPerFase,
  HargaJualPerFase,
  PenerimaanPerFase,
  BagiHasilResult,
  SensitivityCell,
  StatusKelayakan,
  PenjualanPerFase,
} from '../types/fs.types'
import { calcCashFlow } from './cashflow'

// ── STATUS HELPER ──────────────────────────────────────────
export function getStatusKelayakan(netMarginPct: number): StatusKelayakan {
  if (netMarginPct >= 25) return 'sangat_layak'
  if (netMarginPct >= 15) return 'layak'
  return 'tidak_layak'
}

// ── ENTITY NORMALIZATION ───────────────────────────────────

export interface SellingEntity {
  id: string
  tipeIdAsli: string
  nama: string
  kategori: 'landed' | 'apartemen'
  luasBangunan: number // landed = luasBangunan, apt = luasUnit
  luasKavling: number
  jumlahUnit: number
  // Cost
  biayaPokokPerM2: number
  kenaikanBiayaPerFase: number
  // Margin
  marginBangunanPerM2: number
  kelipatanMarginBangunan: number
  marginKavlingPerM2: number
  kelipatanMarginKavling: number
}

export function getSellingEntities(inputs: FSInputs): SellingEntity[] {
  const entities: SellingEntity[] = []

  for (const t of inputs.tipeBangunan) {
    if (t.kategori === 'apartemen') {
      const units = t.tipeUnit || []
      const totalNSA = units.reduce((s, u) => s + ((u.luasSemigross || 0) * (u.jumlahUnit || 0)), 0)
      const efisiensi = t.efisiensiLantai || 80
      const totalGFA  = totalNSA / (efisiensi / 100)
      
      const podiumCost = (t.luasPodiumParkiran || 0) * (t.biayaKonstruksiPodiumPerM2 || 0)
      const towerCostRaw = totalGFA * (t.biayaKonstruksiTowerPerM2 || 0) 
      const baseCost = podiumCost + towerCostRaw
      // Normalize cost per m2 of NSA so it can scale with units sold smoothly
      const biayaPokokPerM2 = totalNSA > 0 ? baseCost / totalNSA : 0

      for (const u of units) {
        entities.push({
          id: u.id,
          tipeIdAsli: t.id,
          nama: `${t.nama} - ${u.nama}`,
          kategori: 'apartemen',
          luasBangunan: u.luasSemigross,
          luasKavling: 0,
          jumlahUnit: u.jumlahUnit,
          biayaPokokPerM2,
          kenaikanBiayaPerFase: t.kenaikanBiayaPerFase,
          marginBangunanPerM2: u.marginUnitPerM2 || 0,
          kelipatanMarginBangunan: u.kelipatanMarginUnit || 1,
          marginKavlingPerM2: 0,
          kelipatanMarginKavling: 0
        })
      }
    } else {
      entities.push({
        id: t.id,
        tipeIdAsli: t.id,
        nama: t.nama,
        kategori: 'landed',
        luasBangunan: t.luasBangunan,
        luasKavling: t.luasKavling,
        jumlahUnit: t.jumlahUnit,
        biayaPokokPerM2: t.biayaKonstruksiPerM2,
        kenaikanBiayaPerFase: t.kenaikanBiayaPerFase,
        marginBangunanPerM2: t.marginBangunanPerM2,
        kelipatanMarginBangunan: t.kelipatanMarginBangunan,
        marginKavlingPerM2: t.marginKavlingPerM2,
        kelipatanMarginKavling: t.kelipatanMarginKavling
      })
    }
  }

  return entities
}

// ── BIAYA ──────────────────────────────────────────────────

export function calcBiayaPersiapan(inputs: FSInputs): number {
  const bp = inputs.biayaPersiapan
  if (!bp) return 0
  const luasEfektifBruto = (inputs.lahan?.luasLahanTotal || 0) * ((inputs.lahan?.pctLahanEfektif || 0) / 100)
  const luasLahanDisimpan = inputs.lahan?.luasLahanDisimpan || 0
  const luasLahanTotal = inputs.lahan?.luasLahanTotal || 0

  let hargaLahan = bp.hargaBeliLahan || 0
  if (bp.gunakanPerM2 && bp.hargaBeliLahanPerM2 && luasLahanTotal > 0) {
    hargaLahan = bp.hargaBeliLahanPerM2 * luasLahanTotal
  }

  let perizinan = bp.biayaPerizinan || 0
  if (bp.gunakanPerizinanPerM2 && bp.biayaPerizinanPerM2 && luasLahanTotal > 0) {
    perizinan = bp.biayaPerizinanPerM2 * luasLahanTotal
  }

  let pengolahan = bp.biayaPengolahanLahan || 0
  if (bp.gunakanPengolahanPerM2 && bp.biayaPengolahanPerM2 && luasLahanTotal > 0) {
    pengolahan = bp.biayaPengolahanPerM2 * luasLahanTotal
  }

  let sarpras = bp.biayaSaranadanPrasarana || 0
  if (bp.gunakanSarprasPerM2 && bp.biayaSarprasPerM2) {
    const luasEfektif = Math.max(0, luasEfektifBruto - luasLahanDisimpan)
    const luasInfrastruktur = luasLahanTotal - luasEfektifBruto // fasum statis
    if (luasInfrastruktur > 0) {
      sarpras = bp.biayaSarprasPerM2 * luasInfrastruktur
    } else {
      sarpras = 0
    }
  }

  let inventaris = bp.biayaInventarisProyek || 0
  if (bp.gunakanInventarisPerM2 && bp.biayaInventarisPerM2 && luasLahanTotal > 0) {
    inventaris = bp.biayaInventarisPerM2 * luasLahanTotal
  }

  return hargaLahan + perizinan + pengolahan + sarpras + inventaris
}

export function calcMonthlyBiayaOperasional(inputs: FSInputs): number {
  const bo = inputs.biayaOperasional
  if (!bo) return 0
  const totalMonths = (inputs.durasiPerFase || 0) * (inputs.jumlahFase || 0)
  if (totalMonths <= 0) return 0

  let marketingTotal = 0
  if (bo.biayaMarketingMode === 'per_bulan') {
    marketingTotal = (bo.biayaMarketingPerBulan || 0) * totalMonths
  } else if (bo.biayaMarketingMode === 'lumpsum_periode') {
    marketingTotal = bo.biayaMarketingLumpsum || 0
  } else if (bo.biayaMarketingMode === 'detail_item') {
    marketingTotal = Object.values(bo.biayaMarketingDetail || {}).reduce((sum, val) => sum + (Number(val) || 0), 0)
  }

  let kantorTotal = 0
  if (bo.biayaUmumMode === 'per_bulan') {
    kantorTotal = (bo.biayaUmumKantorPerBulan || 0) * totalMonths
  } else if (bo.biayaUmumMode === 'lumpsum_periode') {
    kantorTotal = bo.biayaUmumLumpsum || 0
  } else if (bo.biayaUmumMode === 'detail_item') {
    const totalGajiBulan = Object.values((bo.biayaUmumDetail || {}).gaji || {}).reduce((sum, item) => {
      if (typeof item === 'object' && item !== null) return sum + (item.org * item.gaji)
      return sum + (Number(item) || 0)
    }, 0)
    const d = bo.biayaUmumDetail || {}
    const totalUmumBulan = totalGajiBulan + (d.atk||0) + (d.konsumsi||0) + (d.akomodasi||0) + (d.transportasi||0) + (d.komunikasi||0) + (d.biayaLainLain||0)
    kantorTotal = totalUmumBulan * totalMonths
  }

  return (marketingTotal + kantorTotal) / totalMonths
}

export function calcBiayaOperasional(inputs: FSInputs): number {
  const totalMonths = inputs.durasiPerFase * inputs.jumlahFase
  const monthly = calcMonthlyBiayaOperasional(inputs)
  return monthly * totalMonths
}

export function calcBiayaBangunPerUnit(tipe: SellingEntity, fase: number): number {
  const multiplier = Math.pow(1 + tipe.kenaikanBiayaPerFase / 100, fase - 1)
  return tipe.biayaPokokPerM2 * multiplier * tipe.luasBangunan
}

export function calcBiayaBangunDetail(inputs: FSInputs, entities: SellingEntity[]): BiayaBangunPerFase[] {
  const result: BiayaBangunPerFase[] = []
  for (const tipe of entities) {
    for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
      const biayaPerUnit = calcBiayaBangunPerUnit(tipe, fase)
      const unitPerFase = Math.round(tipe.jumlahUnit / inputs.jumlahFase)
      result.push({
        tipeId: tipe.id,
        fase,
        biayaPerUnit,
        totalUnit: unitPerFase,
        totalBiaya: biayaPerUnit * unitPerFase,
      })
    }
  }
  return result
}

export function calcTotalBiayaBangun(inputs: FSInputs, entities: SellingEntity[]): number {
  let total = 0
  for (const tipe of entities) {
    for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
      const biayaPerUnit = calcBiayaBangunPerUnit(tipe, fase)
      const unitTerjual = getUnitTerjual(inputs.penjualan, tipe.id, fase)
      total += biayaPerUnit * unitTerjual
    }
  }
  return total
}

function getUnitTerjual(penjualan: PenjualanPerFase[], tipeId: string, fase: number): number {
  const found = penjualan.find(p => p.tipeId === tipeId && p.fase === fase)
  return found?.unitTerjual ?? 0
}

export function calcTotalInvestment(
  totalBiayaPersiapan: number,
  totalBiayaOperasional: number,
  totalBiayaBangun: number,
): number {
  return totalBiayaPersiapan + totalBiayaOperasional + totalBiayaBangun
}

// ── HARGA JUAL ─────────────────────────────────────────────

export function calcBiayaPersiapanPerM2(entities: SellingEntity[], totalBiayaPersiapan: number): number {
  const totalLuasKavling = entities.reduce((sum, t) => sum + (t.luasKavling * t.jumlahUnit), 0)
  if (totalLuasKavling <= 0) return 0
  return totalBiayaPersiapan / totalLuasKavling
}

export function calcBiayaOpsPerM2(entities: SellingEntity[], totalBiayaOps: number): number {
  const totalLuasKavling = entities.reduce((sum, t) => sum + (t.luasKavling * t.jumlahUnit), 0)
  if (totalLuasKavling <= 0) return 0
  return totalBiayaOps / totalLuasKavling
}

export function calcHargaJualBangunan(tipe: SellingEntity, fase: number): number {
  if (!tipe.luasBangunan || tipe.luasBangunan <= 0) return 0
  const biayaPokok = calcBiayaBangunPerUnit(tipe, fase) / tipe.luasBangunan
  const hargaPerM2Base = biayaPokok + tipe.marginBangunanPerM2
  const escalation = 1 + (tipe.kelipatanMarginBangunan / 100) * (fase - 1)
  return hargaPerM2Base * escalation * tipe.luasBangunan
}

export function calcHargaJualKavling(
  tipe: SellingEntity,
  biayaPersiapanPerM2: number,
  biayaOpsPerM2: number,
): number {
  return (biayaPersiapanPerM2 + biayaOpsPerM2 + tipe.marginKavlingPerM2) * tipe.luasKavling
}

export function calcHargaJualDetail(
  inputs: FSInputs,
  entities: SellingEntity[],
  biayaPersiapanPerM2: number,
  biayaOpsPerM2: number,
): HargaJualPerFase[] {
  const result: HargaJualPerFase[] = []
  for (const tipe of entities) {
    for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
      const hargaBangunan = calcHargaJualBangunan(tipe, fase)
      const hargaKavling  = calcHargaJualKavling(tipe, biayaPersiapanPerM2, biayaOpsPerM2)
      result.push({
        tipeId: tipe.id,
        fase,
        hargaBangunan,
        hargaKavling,
        hargaTotal: hargaBangunan + hargaKavling,
      })
    }
  }
  return result
}

// ── REVENUE ────────────────────────────────────────────────

export function calcPenerimaanDetail(
  inputs: FSInputs,
  entities: SellingEntity[],
  hargaJualPerFase: HargaJualPerFase[],
): PenerimaanPerFase[] {
  const result: PenerimaanPerFase[] = []
  for (const tipe of entities) {
    for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
      const unitTerjual = getUnitTerjual(inputs.penjualan, tipe.id, fase)
      const harga = hargaJualPerFase.find(h => h.tipeId === tipe.id && h.fase === fase)
      const hargaPerUnit = harga?.hargaTotal ?? 0
      result.push({
        fase,
        tipeId: tipe.id,
        unitTerjual,
        hargaPerUnit,
        totalPenerimaan: unitTerjual * hargaPerUnit,
      })
    }
  }
  return result
}

export function calcGrossRevenue(penerimaanDetail: PenerimaanPerFase[]): number {
  return penerimaanDetail.reduce((sum, p) => sum + p.totalPenerimaan, 0)
}

// ── PROFIT ─────────────────────────────────────────────────

export function calcGrossProfit(grossRevenue: number, totalInvestment: number): number {
  return grossRevenue - totalInvestment
}

export function calcGrossMargin(grossProfit: number, grossRevenue: number): number {
  if (grossRevenue <= 0) return 0
  return (grossProfit / grossRevenue) * 100
}

export function calcTotalRiba(inputs: FSInputs): number {
  const pinjaman = inputs.potongan.riba
  if (!pinjaman || pinjaman.pokokPinjaman <= 0) return 0
  const { pokokPinjaman, bungaPerTahun, periodeBulan, metode } = pinjaman
  const bungaPerBulan = bungaPerTahun / 12 / 100
  if (metode === 'flat') return pokokPinjaman * bungaPerBulan * periodeBulan
  if (metode === 'efektif' || metode === 'anuitas') {
    if (bungaPerBulan <= 0) return pokokPinjaman
    const angsuran = pokokPinjaman * bungaPerBulan / (1 - Math.pow(1 + bungaPerBulan, -periodeBulan))
    return (angsuran * periodeBulan) - pokokPinjaman
  }
  return 0
}

export function calcTotalPotongan(inputs: FSInputs, grossRevenue: number): { pphFinal: number, totalRiba: number, feeMarketing: number, bonusTutupTahun: number, csr: number, total: number } {
  const { potongan } = inputs
  const pphFinal        = grossRevenue * (potongan.pphFinal / 100)
  const feeMarketing    = grossRevenue * (potongan.feePenjualanLangsung / 100)
  const bonusTutupTahun = grossRevenue * (potongan.bonusTutupTahun / 100)
  const totalRiba       = calcTotalRiba(inputs)
  const csr             = potongan.csrDanLainLain

  return { pphFinal, totalRiba, feeMarketing, bonusTutupTahun, csr, total: pphFinal + feeMarketing + bonusTutupTahun + totalRiba + csr }
}

export function calcNetProfit(grossProfit: number, totalPotongan: number): number {
  return grossProfit - totalPotongan
}

export function calcNetMargin(netProfit: number, grossRevenue: number): number {
  if (grossRevenue <= 0) return 0
  return (netProfit / grossRevenue) * 100
}

export function calcBagiHasil(
  grossRevenue: number,
  grossProfit: number,
  totalPotongan: number,
  pctPemilik: number,
  skenarioId: 'A' | 'B' | 'C',
): BagiHasilResult {
  const nilaiPemilik    = grossRevenue * (pctPemilik / 100)
  const netDevProfit    = grossProfit - totalPotongan - nilaiPemilik
  const netDevMargin    = grossRevenue > 0 ? (netDevProfit / grossRevenue) * 100 : 0
  const nilaiDeveloper  = grossRevenue - nilaiPemilik

  return {
    skenarioId, pctPemilik, nilaiPemilik, nilaiDeveloper, netDevProfit, netDevMargin, status: getStatusKelayakan(netDevMargin)
  }
}

export function calcMinHargaJual(totalInvestment: number, totalUnit: number, pctPemilik: number, pctPotongan: number, targetMargin: number): number {
  if (totalUnit <= 0) return 0
  const faktor = 1 - (pctPemilik / 100) - (pctPotongan / 100) - (targetMargin / 100)
  if (faktor <= 0) return Infinity
  const grMin = totalInvestment / faktor
  return grMin / totalUnit
}

const SENSITIVITY_CHANGES = [-20, -10, 0, 10, 20]
export function calcSensitivityMatrix(baseGrossRevenue: number, baseTotalCost: number): SensitivityCell[][] {
  return SENSITIVITY_CHANGES.map(biayaChange =>
    SENSITIVITY_CHANGES.map(revenueChange => {
      const adjRevenue = baseGrossRevenue * (1 + revenueChange / 100)
      const adjCost    = baseTotalCost    * (1 + biayaChange / 100)
      const netProfit  = adjRevenue - adjCost
      const netMargin  = adjRevenue > 0 ? (netProfit / adjRevenue) * 100 : -100
      return { biayaChange, revenueChange, netMargin, status: getStatusKelayakan(netMargin) }
    })
  )
}

// ── MAIN CALCULATOR ────────────────────────────────────────

export function calculateFS(inputs: FSInputs): FSResults {
  const entities = getSellingEntities(inputs)
  const isKerjasama = inputs.lahan?.statusKerjasama ?? true
  
  const totalBiayaPersiapan    = calcBiayaPersiapan(inputs)
  const totalBiayaOperasional  = calcBiayaOperasional(inputs)
  const totalBiayaBangun       = calcTotalBiayaBangun(inputs, entities)
  
  const totalInvestment        = calcTotalInvestment(totalBiayaPersiapan, totalBiayaOperasional, totalBiayaBangun)

  const biayaPersiapanPerM2 = calcBiayaPersiapanPerM2(entities, totalBiayaPersiapan)
  const biayaOpsPerM2       = calcBiayaOpsPerM2(entities, totalBiayaOperasional)

  const hargaJualPerFase = calcHargaJualDetail(inputs, entities, biayaPersiapanPerM2, biayaOpsPerM2)
  const biayaBangunPerFase = calcBiayaBangunDetail(inputs, entities)

  const penerimaanPerFase = calcPenerimaanDetail(inputs, entities, hargaJualPerFase)
  const grossRevenue      = calcGrossRevenue(penerimaanPerFase)

  const grossProfit  = calcGrossProfit(grossRevenue, totalInvestment)
  const grossMargin  = calcGrossMargin(grossProfit, grossRevenue)

  const potonganDetail = calcTotalPotongan(inputs, grossRevenue)

  const netProfit  = calcNetProfit(grossProfit, potonganDetail.total)
  const netMargin  = calcNetMargin(netProfit, grossRevenue)
  const status     = getStatusKelayakan(netMargin)

  let bagiHasil: BagiHasilResult[] = []
  if (isKerjasama) {
    bagiHasil = inputs.potongan.skenarioBagiHasil.map(sk =>
      calcBagiHasil(grossRevenue, grossProfit, potonganDetail.total, sk.pctPemilik, sk.id)
    )
  } else {
    bagiHasil = [{
      skenarioId: 'A', pctPemilik: 0, nilaiPemilik: 0,
      nilaiDeveloper: grossRevenue, netDevProfit: netProfit, netDevMargin: netMargin, status: status,
    }]
  }

  let assetLahan: AssetLahan | undefined
  if ((inputs.lahan?.luasLahanDisimpan || 0) > 0) {
    const landed = entities.filter(e => e.kategori !== 'apartemen')
    const avgMarginKavling = landed.length > 0
      ? landed.reduce((sum, e) => sum + (e.marginKavlingPerM2 || 0), 0) / landed.length
      : 0
    const estimasiHargaPerM2 = biayaPersiapanPerM2 + biayaOpsPerM2 + avgMarginKavling
    assetLahan = {
      luasLahanDisimpan: inputs.lahan.luasLahanDisimpan!,
      estimasiHargaPerM2,
      totalNilaiAset: inputs.lahan.luasLahanDisimpan! * estimasiHargaPerM2
    }
  }

  // cashflow perlu menggunakan entities
  const cashFlow = calcCashFlow(inputs, entities, hargaJualPerFase)

  const sensitivityMatrix = calcSensitivityMatrix(grossRevenue, totalInvestment)

  const totalUnit = entities.reduce((s, t) => s + t.jumlahUnit, 0)
  const unitTerjualTotal = inputs.penjualan.reduce((s, p) => s + p.unitTerjual, 0)
  const rataHargaPerUnit = unitTerjualTotal > 0 ? grossRevenue / unitTerjualTotal : 0
  const hppPerUnit       = unitTerjualTotal > 0 ? totalInvestment / unitTerjualTotal : 0
  
  const totalLuasKavlingLanded = entities.reduce((s, t) => s + t.luasKavling * t.jumlahUnit, 0)
  const revenuePerM2     = totalLuasKavlingLanded > 0 ? grossRevenue / totalLuasKavlingLanded : 0

  return {
    totalBiayaPersiapan, totalBiayaOperasional, totalBiayaBangun, totalInvestment,
    grossRevenue, hargaJualPerFase, penerimaanPerFase, biayaBangunPerFase,
    grossProfit, grossMargin,
    pphFinal: potonganDetail.pphFinal, totalRiba: potonganDetail.totalRiba, feeMarketing: potonganDetail.feeMarketing, bonusTutupTahun: potonganDetail.bonusTutupTahun, csr: potonganDetail.csr, totalPotongan: potonganDetail.total,
    netProfit, netMargin, statusKelayakan: status,
    bagiHasil, assetLahan, cashFlow, sensitivityMatrix,
    rataHargaPerUnit, hppPerUnit, revenuePerM2, totalUnit,
    biayaPersiapanPerM2, biayaOpsPerM2,
  }
}
