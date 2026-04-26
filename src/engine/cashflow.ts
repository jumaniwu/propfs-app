// ============================================================
// PropFS — Cash Flow Projection Engine
// ============================================================

import type {
  FSInputs,
  CashFlowPeriode,
  CashFlowResult,
  HargaJualPerFase,
} from '../types/fs.types'
import { calcBiayaBangunPerUnit, calcBiayaPersiapan, calcMonthlyBiayaOperasional } from './calculator'
import type { SellingEntity } from './calculator'

/**
 * Distribusikan nilai ke array periodik
 * Membantu spread biaya/revenue ke periode tertentu
 */
function spread(total: number, periods: number, startIdx = 0, arr: number[]): void {
  const perPeriod = Math.floor(total / periods)
  const remainder = total - perPeriod * periods
  for (let i = 0; i < periods; i++) {
    arr[startIdx + i] = (arr[startIdx + i] ?? 0) + perPeriod + (i === 0 ? remainder : 0)
  }
}

/**
 * Generate monthly cash flow data
 */
export function calcCashFlow(
  inputs: FSInputs,
  entities: SellingEntity[],
  hargaJualPerFase: HargaJualPerFase[],
): CashFlowResult {
  const skema = inputs.skemaPembayaran || {
    pctCashKeras: 10, pctCashBertahap: 30, pctKPR: 60,
    durasiCashBertahap: 24, dpKPR: 20, durasiCicilDPKPR: 6
  }

  const baseTotalBulan = (inputs.jumlahFase || 0) * (inputs.durasiPerFase || 0)

  // Max tail from Cash Bertahap or KPR
  const tailBertahap = skema.durasiCashBertahap || 1
  const tailKPR = (skema.durasiCicilDPKPR || 1) + 1 // + 1 for the bank disbursement month
  const maxTail = Math.max(tailBertahap, tailKPR)
  const totalBulan = baseTotalBulan + maxTail // extended timeline to settle AR

  // Arrays
  const penerimaanArr = new Array<number>(totalBulan).fill(0)
  const salesBookedArr = new Array<number>(totalBulan).fill(0) // Tracks AR
  const biayaBangunArr = new Array<number>(totalBulan).fill(0)
  const biayaPersiapanArr = new Array<number>(totalBulan).fill(0)
  const biayaOpsArr = new Array<number>(totalBulan).fill(0)

  // Sales & Marketing cost estimation map
  const bo = inputs.biayaOperasional
  let marketingTotal = 0
  if (bo) {
    if (bo.biayaMarketingMode === 'per_bulan') {
      marketingTotal = (bo.biayaMarketingPerBulan || 0) * baseTotalBulan
    } else if (bo.biayaMarketingMode === 'lumpsum_periode') {
      marketingTotal = bo.biayaMarketingLumpsum || 0
    } else if (bo.biayaMarketingMode === 'detail_item') {
      marketingTotal = Object.values(bo.biayaMarketingDetail || {}).reduce((sum, val) => sum + (Number(val) || 0), 0)
    }
  }
  const salesMarketingPerBulan = baseTotalBulan > 0 ? (marketingTotal / baseTotalBulan) : 0

  // ── Biaya Persiapan: spread di bulan 1-6 awal proyek (capped to base total bulan)
  const totalBP = calcBiayaPersiapan(inputs)
  const persiapanSpread = Math.min(6, baseTotalBulan)
  spread(totalBP, persiapanSpread, 0, biayaPersiapanArr)

  // ── Biaya Operasional: flat per bulan sepanjang umur pengembangan proyek
  const biayaOpsPerBulan = calcMonthlyBiayaOperasional(inputs)
  for (let i = 0; i < baseTotalBulan; i++) {
    biayaOpsArr[i] = biayaOpsPerBulan
  }

  // ── Per fase: biaya bangun & penerimaan simulasi skema
  for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
    const durasiFase = inputs.durasiPerFase || 1
    const faseStartBulan = (fase - 1) * durasiFase

    for (const tipe of entities) {
      const unitTerjual = inputs.penjualan?.find(p => p.tipeId === tipe.id && p.fase === fase)?.unitTerjual || 0
      if (unitTerjual === 0) continue

      // Biaya bangun: spread sepanjang durasi fase
      const biayaPerUnit = calcBiayaBangunPerUnit(tipe, fase)
      const totalBiayaTipe = biayaPerUnit * unitTerjual
      spread(totalBiayaTipe, durasiFase, faseStartBulan, biayaBangunArr)

      // Penjualan & Penerimaan Cash
      const hargaJual = hargaJualPerFase.find(h => h.tipeId === tipe.id && h.fase === fase)
      const hargaTotal = hargaJual?.hargaTotal ?? 0
      const totalSalesRevenue = hargaTotal * unitTerjual

      // Unit penjualan dianggap tersebar rata sepanjang fase ini
      const revenuePerBulanBooked = totalSalesRevenue / durasiFase

      for (let m = 0; m < durasiFase; m++) {
        const transMonth = faseStartBulan + m
        salesBookedArr[transMonth] += revenuePerBulanBooked

        // 1. Cash Keras (diterima bulan transaksi)
        const kerasAmt = revenuePerBulanBooked * ((skema.pctCashKeras || 0) / 100)
        penerimaanArr[transMonth] += kerasAmt

        // 2. Cash Bertahap
        const bertahapAmt = revenuePerBulanBooked * ((skema.pctCashBertahap || 0) / 100)
        const durBertahap = Math.max(1, skema.durasiCashBertahap || 1)
        const bertahapPerBulan = bertahapAmt / durBertahap
        for (let d = 0; d < durBertahap; d++) {
          penerimaanArr[transMonth + d] = (penerimaanArr[transMonth + d] || 0) + bertahapPerBulan
        }

        // 3. KPR Bank
        const kprAmt = revenuePerBulanBooked * ((skema.pctKPR || 0) / 100)
        const dpRatio = Math.min(100, Math.max(0, skema.dpKPR || 0)) / 100
        const dpAmt = kprAmt * dpRatio
        const plafonAmt = kprAmt - dpAmt

        const durCicilDP = Math.max(1, skema.durasiCicilDPKPR || 1)
        const dpPerBulan = dpAmt / durCicilDP
        for (let d = 0; d < durCicilDP; d++) {
          penerimaanArr[transMonth + d] = (penerimaanArr[transMonth + d] || 0) + dpPerBulan
        }

        // Plafon Cair sekaligus dibulan setelah DP lunas
        const plafonMonth = transMonth + durCicilDP
        penerimaanArr[plafonMonth] = (penerimaanArr[plafonMonth] || 0) + plafonAmt
      }
    }
  }

  // Tentukan actuaEndMonth (bulan terakhir yang ada settlement/biaya) untuk trim ekor nol
  let actualEndMonth = baseTotalBulan
  for (let i = totalBulan - 1; i >= baseTotalBulan; i--) {
    if ((penerimaanArr[i] || 0) > 0 || (biayaBangunArr[i] || 0) > 0 || (biayaOpsArr[i] || 0) > 0) {
      actualEndMonth = i + 1
      break
    }
  }

  // ── Build monthly periods
  const monthly: CashFlowPeriode[] = []
  let kumulatif = 0
  let breakevenBulan: number | null = null
  let peakNegative = 0
  let cumulativeSales = 0
  let cumulativeCashIn = 0

  for (let i = 0; i < actualEndMonth; i++) {
    const isTail = i >= baseTotalBulan
    const fase = isTail ? inputs.jumlahFase : Math.floor(i / inputs.durasiPerFase) + 1
    const bulanDalamFase = isTail ? (i - ((inputs.jumlahFase - 1) * inputs.durasiPerFase)) + 1 : (i % inputs.durasiPerFase) + 1

    const penerimaan = penerimaanArr[i] || 0
    const biayaBangun = biayaBangunArr[i] || 0
    const biayaPersiapan = biayaPersiapanArr[i] || 0
    const biayaOperasional = biayaOpsArr[i] || 0
    const salesBooked = salesBookedArr[i] || 0

    cumulativeSales += salesBooked
    cumulativeCashIn += penerimaan

    // Safety against minor float precision bugs creating negative AR
    let arBulanan = cumulativeSales - cumulativeCashIn
    if (arBulanan < 0.1) arBulanan = 0

    const net = penerimaan - biayaBangun - biayaPersiapan - biayaOperasional

    kumulatif += net
    if (kumulatif < peakNegative) peakNegative = kumulatif

    if (breakevenBulan === null && kumulatif >= 0 && i > 0) {
      breakevenBulan = i + 1  // 1-based
    }

    monthly.push({
      periode: i + 1,
      label: `B${bulanDalamFase} F${fase}`,
      penerimaan,
      biayaBangun,
      biayaPersiapan,
      biayaOperasional,
      netCF: net,
      kumulatif,
      salesMarketing: i < baseTotalBulan ? salesMarketingPerBulan : 0,
      arBulanan,
      apBulanan: 0,
    })
  }

  // ── Aggregate ke quarterly
  const quarterly: CashFlowPeriode[] = aggregatePeriods(monthly, 3, 'Q', inputs.tahunMulai)

  // ── Aggregate ke annual
  const annual: CashFlowPeriode[] = aggregatePeriods(monthly, 12, 'T', inputs.tahunMulai)

  // Breakeven quarter
  let breakevenQuarter: number | null = null
  if (breakevenBulan !== null) {
    breakevenQuarter = Math.ceil(breakevenBulan / 3)
  }

  const totalCashIn = monthly.reduce((s, p) => s + p.penerimaan, 0)
  const totalCashOut = monthly.reduce(
    (s, p) => s + p.biayaBangun + p.biayaPersiapan + p.biayaOperasional, 0
  )

  return {
    monthly,
    quarterly,
    annual,
    breakevenBulan,
    breakevenQuarter,
    peakNegativeCF: peakNegative,
    totalCashIn,
    totalCashOut,
  }
}

/**
 * Gabungkan monthly periods menjadi quarterly atau annual
 */
function aggregatePeriods(
  monthly: CashFlowPeriode[],
  groupSize: number,
  prefix: string,
  startYear?: number
): CashFlowPeriode[] {
  const result: CashFlowPeriode[] = []
  let kumulatif = 0

  for (let i = 0; i < monthly.length; i += groupSize) {
    const group = monthly.slice(i, i + groupSize)
    const periodIdx = Math.floor(i / groupSize) + 1

    let label = `${prefix}${periodIdx}`
    if (startYear) {
      if (prefix === 'Q') {
        const qNumber = ((periodIdx - 1) % 4) + 1
        const year = startYear + Math.floor((periodIdx - 1) / 4)
        label = `Q${qNumber} ${year}`
      } else if (prefix === 'T') {
        const year = startYear + periodIdx - 1
        label = `Thn ${year}`
      }
    }

    const penerimaan = group.reduce((s, p) => s + p.penerimaan, 0)
    const biayaBangun = group.reduce((s, p) => s + p.biayaBangun, 0)
    const biayaPersiapan = group.reduce((s, p) => s + p.biayaPersiapan, 0)
    const biayaOperasional = group.reduce((s, p) => s + p.biayaOperasional, 0)
    const salesMarketing = group.reduce((s, p) => s + p.salesMarketing, 0)

    const netCF = penerimaan - biayaBangun - biayaPersiapan - biayaOperasional
    kumulatif += netCF

    const lastPeriod = group[group.length - 1]

    result.push({
      periode: periodIdx,
      label,
      penerimaan,
      biayaBangun,
      biayaPersiapan,
      biayaOperasional,
      netCF,
      kumulatif,
      salesMarketing,
      arBulanan: lastPeriod ? lastPeriod.arBulanan : 0,
      apBulanan: lastPeriod ? lastPeriod.apBulanan : 0,
    })
  }

  return result
}
