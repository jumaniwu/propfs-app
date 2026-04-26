// ============================================================
// PropFS — Cost Control & RAB Types
// ============================================================

export type CostCategory = 'lahan' | 'infrastruktur' | 'bangunan' | 'operasional' | 'marketing' | 'lainnya'

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
}

export interface MaterialScheduleItem {
  id: string;
  materialName: string;
  estimatedVolume: number;
  unit: string;
  estimatedUnitPrice: number;
  estimatedTotalCost: number;
  linkedTasks: string[]; // List nama pekerjaan RAB yang memicu kebutuhan material ini
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
