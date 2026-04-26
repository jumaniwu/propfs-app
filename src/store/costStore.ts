import { create } from 'zustand'
import { BudgetPlan, BudgetComponent, MaterialScheduleItem } from '../types/cost.types'
import { RealisasiEntry } from '../lib/ai-realisasi'

export interface ProjectInfo {
  id: string
  projectName: string
  location: string
  owner: string
  startDate: string
  targetDurationMonths: number
  type: string
}

export interface SavedCostProject {
  info: ProjectInfo
  plan: BudgetPlan | null
  materialSchedule: MaterialScheduleItem[]
  realisasiEntries: RealisasiEntry[]
  updatedAt: string
}

interface CostStore {
  savedProjects: SavedCostProject[] // Tampilan Dashboard
  
  // Workspace Aktif
  projectInfo: ProjectInfo | null
  activePlan: BudgetPlan | null
  draftComponents: BudgetComponent[]
  materialSchedule: MaterialScheduleItem[]
  realisasiEntries: RealisasiEntry[]  // ← BARU: persisten
  
  // States
  isProcessingUpload: boolean
  isGeneratingMaterial: boolean
  isProcessingRealisasi: boolean

  // Actions
  loadProjects: () => void
  saveToStorage: () => void

  initProject: (info: ProjectInfo) => void
  loadProject: (id: string) => void
  clearProject: () => void
  deleteProject: (id: string) => void

  setProcessingUpload: (v: boolean) => void
  setGeneratingMaterial: (v: boolean) => void
  setProcessingRealisasi: (v: boolean) => void

  setDraftComponents: (components: BudgetComponent[]) => void
  clearDraft: () => void
  saveDraftToActivePlan: () => void

  updateActivePlanComponents: (components: BudgetComponent[]) => void
  setMaterialSchedule: (items: MaterialScheduleItem[]) => void
  applyActualCost: (componentId: string, actualCost: number) => void
  clearActivePlan: () => void

  // Realisasi Biaya persistence
  addRealisasiEntries: (entries: RealisasiEntry[]) => void
  clearRealisasiEntries: () => void
}

const STORAGE_KEY = 'propfs-cost-projects'

function loadLocalData(): SavedCostProject[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

export const useCostStore = create<CostStore>((set, get) => ({
  savedProjects: loadLocalData(),
  
  projectInfo: null,
  activePlan: null,
  draftComponents: [],
  materialSchedule: [],
  realisasiEntries: [],
  
  isProcessingUpload: false,
  isGeneratingMaterial: false,
  isProcessingRealisasi: false,

  loadProjects: () => {
    set({ savedProjects: loadLocalData() })
  },

  saveToStorage: () => {
    const { projectInfo, activePlan, materialSchedule, savedProjects } = get()
    if (!projectInfo) return

    const now = new Date().toISOString()
    const updatedProject: SavedCostProject = {
      info: projectInfo,
      plan: activePlan,
      materialSchedule,
      realisasiEntries: get().realisasiEntries,
      updatedAt: now
    }

    const nextProjects = savedProjects.filter(p => p.info.id !== projectInfo.id)
    nextProjects.unshift(updatedProject)

    set({ savedProjects: nextProjects })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects))
  },

  initProject: (info) => {
    set({ projectInfo: info, activePlan: null, draftComponents: [], materialSchedule: [], realisasiEntries: [] })
    setTimeout(() => get().saveToStorage(), 100)
  },

  loadProject: (id) => {
    const p = get().savedProjects.find(x => x.info.id === id)
    if (p) {
      set({ 
        projectInfo: p.info, 
        activePlan: p.plan, 
        materialSchedule: p.materialSchedule || [],
        realisasiEntries: p.realisasiEntries || [],
        draftComponents: []
      })
    }
  },

  clearProject: () => {
    set({ projectInfo: null, activePlan: null, draftComponents: [], materialSchedule: [], realisasiEntries: [] })
    get().loadProjects()
  },

  deleteProject: (id) => {
    const next = get().savedProjects.filter(p => p.info.id !== id)
    set({ savedProjects: next })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    
    // if currently open, close it
    if (get().projectInfo?.id === id) {
      get().clearProject()
    }
  },

  setProcessingUpload: (v) => set({ isProcessingUpload: v }),
  setGeneratingMaterial: (v) => set({ isGeneratingMaterial: v }),
  setProcessingRealisasi: (v) => set({ isProcessingRealisasi: v }),

  setDraftComponents: (components) => set({ draftComponents: components }),
  clearDraft: () => set({ draftComponents: [] }),

  saveDraftToActivePlan: () => {
    const { draftComponents, projectInfo } = get()
    if (draftComponents.length === 0) return

    const totalBaselineBudget = draftComponents.reduce((sum, item) => sum + item.totalPlannedCost, 0)

    const newPlan: BudgetPlan = {
      projectId: projectInfo?.id || 'project_1',
      baselineDate: new Date().toISOString(),
      status: 'active',
      totalBaselineBudget,
      components: draftComponents,
    }

    set({ activePlan: newPlan, draftComponents: [] })
    setTimeout(() => get().saveToStorage(), 100)
  },

  updateActivePlanComponents: (components) => {
    const { activePlan } = get()
    if (!activePlan) return
    const totalBaselineBudget = components.reduce((sum, item) => sum + item.totalPlannedCost, 0)
    set({ activePlan: { ...activePlan, components, totalBaselineBudget } })
    setTimeout(() => get().saveToStorage(), 100)
  },

  setMaterialSchedule: (items) => {
    set({ materialSchedule: items })
    setTimeout(() => get().saveToStorage(), 100)
  },

  applyActualCost: (componentId, actualCost) => {
    const { activePlan } = get()
    if (!activePlan) return
    const updated = activePlan.components.map(c =>
      c.id === componentId ? { ...c, actualCost } : c
    )
    const totalBaselineBudget = updated.reduce((s, c) => s + c.totalPlannedCost, 0)
    set({ activePlan: { ...activePlan, components: updated, totalBaselineBudget } })
    setTimeout(() => get().saveToStorage(), 100)
  },

  clearActivePlan: () => {
    if (window.confirm("Yakin ingin mengunggah ulang file RAB?\n\nCatatan: Data Material Schedule dan Buku Pengeluaran (Realisasi) yang sudah ada TIDAK akan terhapus otomatis, sehingga Anda bisa menyesuaikan ulang.")) {
      set({ activePlan: null, draftComponents: [] })
      setTimeout(() => get().saveToStorage(), 100)
    }
  },

  addRealisasiEntries: (entries) => {
    set(state => ({ realisasiEntries: [...state.realisasiEntries, ...entries] }))
    setTimeout(() => get().saveToStorage(), 300)
  },

  clearRealisasiEntries: () => {
    set({ realisasiEntries: [] })
    setTimeout(() => get().saveToStorage(), 300)
  },
}))
