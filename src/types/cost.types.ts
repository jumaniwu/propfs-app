// ============================================================
// PropFS — Cost Control & RAB Types
// ============================================================

export type CostCategory = 'lahan' | 'infrastruktur' | 'bangunan' | 'operasional' | 'marketing' | 'lainnya'

export type MaterialStatus = 'belum_order' | 'sudah_order' | 'sudah_datang' | 'terpakai'

export interface BudgetComponent {
  id: string
  groupName?: string // Sub-kategori: Misal 'Struktur', 'Arsitektur', 'MEP', 'Persiapan'
  categoryId: CostCategory
  name: string
  plannedVolume: number
  unit: string
  unitLaborCost?: number    // Harga Satuan Upah per item
  unitMaterialCost?: number // Harga Satuan Material per item
  unitPrice: number         // Harga Satuan Keseluruhan
  totalPlannedCost: number
  // Progress tracking
  progressPercentage?: number     // 0–100%
  progressUpdatedAt?: string      // ISO timestamp
}

export interface MaterialScheduleItem {
  id: string
  materialName: string
  estimatedVolume: number
  unit: string
  estimatedUnitPrice: number
  estimatedTotalCost: number
  linkedTasks: string[] // List nama pekerjaan RAB yang memicu kebutuhan material ini
  // Extended fields
  status?: MaterialStatus
  leadTimeDays?: number          // Estimasi lead time dalam hari
  estimatedArrivalDate?: string  // Estimasi tanggal kedatangan (YYYY-MM-DD)
  // Realisasi pembelian
  actualQty?: number
  actualUnitPrice?: number
  actualTotalCost?: number
  supplier?: string
  orderDate?: string   // YYYY-MM-DD
  arrivalDate?: string // YYYY-MM-DD
  invoiceNumber?: string
}

export interface BudgetPlan {
  projectId: string
  baselineDate: string
  components: BudgetComponent[]
  totalBaselineBudget: number
  status: 'draft' | 'approved' | 'active'
}

export interface ActualCostEntry {
  id: string
  projectId: string
  componentId: string
  periodDate: string // YYYY-MM
  actualVolume: number
  actualCost: number
  proofUrl?: string
  remarks?: string
}

export interface SCurveDataPoint {
  periodDate: string // YYYY-MM
  plannedCumulativeCost: number
  actualCumulativeCost: number
  plannedCumulativePercentage: number
  actualCumulativePercentage: number
}
