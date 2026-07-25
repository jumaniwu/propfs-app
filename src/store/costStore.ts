import { create } from 'zustand'
import { BudgetPlan, BudgetComponent, MaterialScheduleItem } from '../types/cost.types'
import { RealisasiEntry } from '../lib/ai-realisasi'
import { useAuthStore } from './authStore'
import { supabase } from '../lib/supabase'
import { mergeNewest } from '../lib/cloudSync'

export interface ProjectInfo {
  id: string
  projectName: string
  location: string
  owner: string
  startDate: string
  targetDurationMonths: number
  type: string
  isSCurveGenerated?: boolean
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
  realisasiEntries: RealisasiEntry[]  // persisten
  
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
  updateMaterialItem: (id: string, patch: Partial<MaterialScheduleItem>) => void
  applyActualCost: (componentId: string, actualCost: number) => void
  clearActivePlan: () => void

  // Progress tracking per component
  updateComponentProgress: (componentId: string, percentage: number) => void

  // Realisasi Biaya persistence
  addRealisasiEntries: (entries: RealisasiEntry[]) => void
  updateRealisasiEntry: (id: string, patch: Partial<RealisasiEntry>) => void
  deleteRealisasiEntry: (id: string) => void
  clearRealisasiEntries: () => void

  // S-Curve config
  updateSCurveConfig: (duration: number, generated: boolean) => void

  // Computed helpers (derived values, not stored separately)
  getTotalRealisasi: () => number
  getActualProgressPct: () => number
  /** Realisasi seluruh proyek, tiap entri ditandai projectId (untuk konsolidasi). */
  getAllRealisasi: () => Array<RealisasiEntry & { projectId: string }>
  /** Ringkasan tiap proyek tersimpan: id, nama, nilai RAB, progress fisik. */
  getProjectSummaries: () => Array<{ id: string; nama: string; rab: number; progressPct: number }>
}

/** Progress fisik tertimbang bobot biaya, 0–100. */
function progressPlan(plan: BudgetPlan | null): number {
  const comps = plan?.components ?? []
  const total = comps.reduce((s, c) => s + c.totalPlannedCost, 0)
  if (total <= 0) return 0
  return comps.reduce((s, c) => s + (c.progressPercentage ?? 0) * c.totalPlannedCost, 0) / total
}

// ── SECURITY: Use user-scoped storage key to prevent data leaking between users ──
// Each user gets their own isolated localStorage key.
function getUserStorageKey(): string {
  try {
    const user = useAuthStore.getState().user
    if (user?.id) return `propfs-cost-projects:${user.id}`
  } catch { /* ignore */ }
  return 'propfs-cost-projects:anonymous'
}

function loadLocalData(): SavedCostProject[] {
  try {
    const key = getUserStorageKey()
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch { return [] }
}

function saveLocalData(projects: SavedCostProject[]) {
  try {
    const key = getUserStorageKey()
    localStorage.setItem(key, JSON.stringify(projects))
  } catch { /* ignore */ }
}

// ── Sinkron cloud (Supabase) agar proyek terlihat di semua perangkat ────────
function cloudUserId(): string | null {
  try { return useAuthStore.getState().user?.id ?? null } catch { return null }
}

async function upsertCloudProject(p: SavedCostProject): Promise<void> {
  const user_id = cloudUserId()
  if (!user_id) return
  try {
    await supabase.from('cost_projects').upsert(
      { user_id, id: p.info.id, data: p, updated_at: p.updatedAt },
      { onConflict: 'user_id,id' },
    )
  } catch (e) { console.warn('[cost] gagal sinkron proyek ke cloud:', e) }
}

async function deleteCloudProject(id: string): Promise<void> {
  const user_id = cloudUserId()
  if (!user_id) return
  try {
    await supabase.from('cost_projects').delete().eq('user_id', user_id).eq('id', id)
  } catch (e) { console.warn('[cost] gagal hapus proyek di cloud:', e) }
}

export const useCostStore = create<CostStore>((set, get) => ({
  savedProjects: [],  // Will be loaded after auth is ready (see loadProjects)
  
  projectInfo: null,
  activePlan: null,
  draftComponents: [],
  materialSchedule: [],
  realisasiEntries: [],
  
  isProcessingUpload: false,
  isGeneratingMaterial: false,
  isProcessingRealisasi: false,

  loadProjects: () => {
    // tampilkan data lokal dulu (cepat/offline), lalu gabungkan dengan cloud
    const local = loadLocalData()
    set({ savedProjects: local })
    void (async () => {
      const user_id = cloudUserId()
      if (!user_id) return
      try {
        const { data, error } = await supabase
          .from('cost_projects').select('data').eq('user_id', user_id)
        if (error) throw error
        const cloud = (data ?? [])
          .map(r => r.data as SavedCostProject)
          .filter(p => p?.info?.id)
        const { merged, toPush } = mergeNewest(
          local, cloud, p => p.info.id, p => p.updatedAt ?? '1970-01-01',
        )
        set({ savedProjects: merged })
        saveLocalData(merged)
        // dorong proyek yang hanya ada / lebih baru di perangkat ini
        for (const p of toPush) void upsertCloudProject(p)
      } catch (e) {
        console.warn('[cost] sinkron cloud gagal (tabel cost_projects belum ada?):', e)
      }
    })()
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
    saveLocalData(nextProjects)
    void upsertCloudProject(updatedProject)
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

  updateSCurveConfig: (duration, generated) => {
    const info = get().projectInfo;
    if (info) {
      set({ projectInfo: { ...info, targetDurationMonths: duration, isSCurveGenerated: generated } })
      get().saveToStorage()
    }
  },

  deleteProject: (id) => {
    const next = get().savedProjects.filter(p => p.info.id !== id)
    set({ savedProjects: next })
    saveLocalData(next)
    void deleteCloudProject(id)
    
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

  updateComponentProgress: (componentId, percentage) => {
    const { activePlan } = get()
    if (!activePlan) return
    const pct = Math.max(0, Math.min(100, percentage))
    const updated = activePlan.components.map(c =>
      c.id === componentId
        ? { ...c, progressPercentage: pct, progressUpdatedAt: new Date().toISOString() }
        : c
    )
    set({ activePlan: { ...activePlan, components: updated } })
    setTimeout(() => get().saveToStorage(), 300)
  },

  setMaterialSchedule: (items) => {
    set({ materialSchedule: items })
    setTimeout(() => get().saveToStorage(), 100)
  },

  updateMaterialItem: (id, patch) => {
    const { materialSchedule } = get()
    const updated = materialSchedule.map(m => m.id === id ? { ...m, ...patch } : m)
    set({ materialSchedule: updated })
    setTimeout(() => get().saveToStorage(), 300)
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

  updateRealisasiEntry: (id, patch) => {
    set(state => ({
      realisasiEntries: state.realisasiEntries.map(e => e.id === id ? { ...e, ...patch } : e)
    }))
    setTimeout(() => get().saveToStorage(), 300)
  },

  deleteRealisasiEntry: (id) => {
    set(state => ({
      realisasiEntries: state.realisasiEntries.filter(e => e.id !== id)
    }))
    setTimeout(() => get().saveToStorage(), 300)
  },

  clearRealisasiEntries: () => {
    set({ realisasiEntries: [] })
    setTimeout(() => get().saveToStorage(), 300)
  },

  // ── Computed helpers ───────────────────────────────────────────────────────
  getTotalRealisasi: () => {
    return get().realisasiEntries.reduce((sum, e) => sum + e.jumlah, 0)
  },

  getActualProgressPct: () => {
    const components = get().activePlan?.components ?? []
    if (components.length === 0) return 0
    const totalBudget = components.reduce((s, c) => s + c.totalPlannedCost, 0)
    if (totalBudget === 0) return 0
    const weightedProgress = components.reduce((s, c) => {
      const pct = c.progressPercentage ?? 0
      return s + (pct * c.totalPlannedCost)
    }, 0)
    return weightedProgress / totalBudget
  },

  // ── Lintas proyek (dipakai laporan konsolidasi) ────────────────────────────
  getAllRealisasi: () => {
    const { savedProjects, projectInfo, realisasiEntries } = get()
    const out: Array<RealisasiEntry & { projectId: string }> = []
    for (const p of savedProjects) {
      // proyek yang sedang dibuka: pakai state aktif (lebih baru dari snapshot)
      const entries = p.info.id === projectInfo?.id ? realisasiEntries : (p.realisasiEntries ?? [])
      for (const e of entries) out.push({ ...e, projectId: p.info.id })
    }
    // proyek aktif yang belum sempat tersimpan ke savedProjects
    if (projectInfo && !savedProjects.some(p => p.info.id === projectInfo.id)) {
      for (const e of realisasiEntries) out.push({ ...e, projectId: projectInfo.id })
    }
    return out
  },

  getProjectSummaries: () => {
    const { savedProjects, projectInfo, activePlan } = get()
    const list = savedProjects.map(p => {
      const plan = p.info.id === projectInfo?.id ? activePlan : p.plan
      return {
        id: p.info.id,
        nama: p.info.projectName,
        rab: plan?.totalBaselineBudget ?? 0,
        progressPct: progressPlan(plan ?? null),
      }
    })
    if (projectInfo && !savedProjects.some(p => p.info.id === projectInfo.id)) {
      list.push({
        id: projectInfo.id,
        nama: projectInfo.projectName,
        rab: activePlan?.totalBaselineBudget ?? 0,
        progressPct: progressPlan(activePlan),
      })
    }
    return list
  },
}))
