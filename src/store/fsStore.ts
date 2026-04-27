// ============================================================
// PropFS — fsStore (Supabase + localStorage DEV fallback)
// ============================================================

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { FSInputs, FSResults, SavedProject } from '../types/fs.types'
import { DEFAULT_INPUTS, TEMPLATE_A, TEMPLATE_B } from '../types/fs.types'
import { calculateFS } from '../engine/calculator'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'

const APP_VERSION = '1.0.0'

// ── DEV MODE: use localStorage when Supabase is not configured ──
const IS_DEV_MODE = import.meta.env.VITE_SUPABASE_URL?.includes('placeholder')
const LS_DEV_KEY  = 'propfs-projects-dev'
const LS_DARK_KEY = 'propfs-dark-mode'

function loadLocalProjects(): SavedProject[] {
  try { return JSON.parse(localStorage.getItem(LS_DEV_KEY) ?? '[]') } catch { return [] }
}
function saveLocalProjects(projects: SavedProject[]) {
  localStorage.setItem(LS_DEV_KEY, JSON.stringify(projects))
}

// ── STORE TYPES ─────────────────────────────────────────────

interface FSStore {
  projects:         SavedProject[]
  currentProjectId: string | null
  currentInputs:    FSInputs
  currentResults:   FSResults | null
  currentStep:      number
  isDarkMode:       boolean
  isSaving:         boolean

  createProject:      (template?: 'A' | 'B' | null) => Promise<string>
  loadProject:        (id: string) => Promise<void>
  fetchProjects:      () => Promise<void>
  saveCurrentProject: () => Promise<void>
  deleteProject:      (id: string) => Promise<void>
  duplicateProject:   (id: string) => Promise<string>

  updateInputs:    (partial: Partial<FSInputs>) => void
  setCurrentStep:  (step: number) => void
  calculate:       () => FSResults
  toggleDarkMode:  () => void
  reset:           () => void
}

// ── HELPERS ──────────────────────────────────────────────────

function mergeTemplate(template?: 'A' | 'B' | null): FSInputs {
  if (template === 'A') return { ...DEFAULT_INPUTS, ...TEMPLATE_A } as FSInputs
  if (template === 'B') return { ...DEFAULT_INPUTS, ...TEMPLATE_B } as FSInputs
  return { ...DEFAULT_INPUTS }
}

function migrateInputs(stored: FSInputs): FSInputs {
  const def = DEFAULT_INPUTS
  return {
    ...def,
    ...stored,
    lahan:            { ...def.lahan,            ...stored.lahan },
    biayaPersiapan:   { ...def.biayaPersiapan,   ...(stored.biayaPersiapan   || {}) },
    biayaOperasional: {
      ...def.biayaOperasional,
      ...(stored.biayaOperasional || {}),
      biayaMarketingDetail: {
        ...def.biayaOperasional.biayaMarketingDetail,
        ...((stored.biayaOperasional || {}).biayaMarketingDetail || {}),
      },
      biayaUmumDetail: {
        ...def.biayaOperasional.biayaUmumDetail,
        ...((stored.biayaOperasional || {}).biayaUmumDetail || {}),
        gaji: {
          ...def.biayaOperasional.biayaUmumDetail.gaji,
          ...(((stored.biayaOperasional || {}).biayaUmumDetail || {}).gaji || {}),
        },
      },
    },
    skemaPembayaran: { ...def.skemaPembayaran, ...(stored.skemaPembayaran || {}) },
    potongan: {
      ...def.potongan,
      ...(stored.potongan || {}),
      skenarioBagiHasil:
        (stored.potongan?.skenarioBagiHasil?.length ?? 0) > 0
          ? stored.potongan!.skenarioBagiHasil
          : def.potongan.skenarioBagiHasil,
    },
    tipeBangunan: stored.tipeBangunan ?? [],
    penjualan:    stored.penjualan    ?? [],
  }
}

function rowToProject(row: any): SavedProject {
  return {
    id:        row.id,
    user_id:   row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name:      row.name,
    inputs:    migrateInputs(row.inputs as FSInputs),
    results:   row.results as FSResults | null,
    version:   row.version,
  }
}

// ── STORE ────────────────────────────────────────────────────

export const useFSStore = create<FSStore>((set, get) => ({
  projects:         IS_DEV_MODE ? loadLocalProjects() : [],
  currentProjectId: null,
  currentInputs:    { ...DEFAULT_INPUTS },
  currentResults:   null,
  currentStep:      1,
  isDarkMode:       localStorage.getItem(LS_DARK_KEY) === 'true',
  isSaving:         false,

  // ── FETCH ALL PROJECTS ──────────────────────────────────
  fetchProjects: async () => {
    if (IS_DEV_MODE) {
      set({ projects: loadLocalProjects() })
      return
    }
    const { user, profile } = useAuthStore.getState()
    if (!user) return

    let query = supabase.from('projects').select('*')
    // If not superadmin, only show own projects
    if (profile?.role !== 'superadmin') {
      query = query.eq('user_id', user.id)
    }

    const { data, error } = await query.order('updated_at', { ascending: false })
    if (!error && data) {
      set({ projects: data.map(rowToProject) })
    }
  },

  // ── CREATE PROJECT ──────────────────────────────────────
  createProject: async (template) => {
    const inputs = mergeTemplate(template)
    const id     = uuidv4()
    const now    = new Date().toISOString()
    const project: SavedProject = {
      id, createdAt: now, updatedAt: now,
      name: inputs.namaProyek || 'Proyek Baru',
      inputs, results: null, version: APP_VERSION,
    }

    if (IS_DEV_MODE) {
      const next = [project, ...get().projects]
      set({ projects: next, currentProjectId: id, currentInputs: inputs, currentResults: null, currentStep: 1 })
      saveLocalProjects(next)
      return id
    }

    const user = useAuthStore.getState().user
    if (!user) throw new Error('Belum login')

    const { error } = await supabase.from('projects').insert({
      id, user_id: user.id,
      name: inputs.namaProyek || 'Proyek Baru',
      inputs, results: null, version: APP_VERSION,
      created_at: now, updated_at: now,
    })
    if (error) {
      const msg = error.message || JSON.stringify(error)
      throw new Error(`Database error: ${msg}. Pastikan Supabase API Key sudah benar di Vercel.`)
    }

    // Increment total_projects_created (Free plan gate)
    try {
      await supabase.rpc('increment_project_counter', { uid: user.id })
    } catch { /* ignore */ }

    set(state => ({
      projects: [project, ...state.projects],
      currentProjectId: id,
      currentInputs: inputs,
      currentResults: null,
      currentStep: 1,
    }))
    return id
  },

  // ── LOAD PROJECT ────────────────────────────────────────
  loadProject: async (id) => {
    const cached = get().projects.find(p => p.id === id)
    if (cached) {
      set({ currentProjectId: id, currentInputs: migrateInputs(cached.inputs), currentResults: cached.results, currentStep: 1 })
      return
    }
    if (IS_DEV_MODE) return

    const { user, profile } = useAuthStore.getState()
    if (!user) return

    let query = supabase.from('projects').select('*').eq('id', id)
    if (profile?.role !== 'superadmin') {
      query = query.eq('user_id', user.id)
    }

    const { data } = await query.single()
    if (data) {
      const p = rowToProject(data)
      set({ currentProjectId: id, currentInputs: p.inputs, currentResults: p.results, currentStep: 1 })
    }
  },

  // ── SAVE CURRENT PROJECT ────────────────────────────────
  saveCurrentProject: async () => {
    const { currentProjectId, currentInputs, currentResults } = get()
    if (!currentProjectId) return
    set({ isSaving: true })
    const now = new Date().toISOString()

    try {
      if (IS_DEV_MODE) {
        const next = get().projects.map(p =>
          p.id === currentProjectId
            ? { ...p, name: currentInputs.namaProyek || p.name, inputs: currentInputs, results: currentResults, updatedAt: now }
            : p
        )
        set({ projects: next })
        saveLocalProjects(next)
        return
      }

      await supabase.from('projects').update({
        name: currentInputs.namaProyek || 'Proyek Baru',
        inputs: currentInputs, results: currentResults, updated_at: now,
      }).eq('id', currentProjectId)

      set(state => ({
        projects: state.projects.map(p =>
          p.id === currentProjectId
            ? { ...p, name: currentInputs.namaProyek || p.name, inputs: currentInputs, results: currentResults, updatedAt: now }
            : p
        ),
      }))
    } finally {
      set({ isSaving: false })
    }
  },

  // ── DELETE PROJECT ──────────────────────────────────────
  deleteProject: async (id) => {
    if (IS_DEV_MODE) {
      const next = get().projects.filter(p => p.id !== id)
      set(state => ({ projects: next, currentProjectId: state.currentProjectId === id ? null : state.currentProjectId }))
      saveLocalProjects(next)
      return
    }
    const { user, profile } = useAuthStore.getState()
    if (!user) throw new Error('Belum login')
    
    // Perform delete in Supabase
    let query = supabase.from('projects').delete().eq('id', id)
    if (profile?.role !== 'superadmin') {
      query = query.eq('user_id', user.id)
    }

    const { error } = await query
    if (error) {
      console.error("Supabase delete error:", error)
      throw error
    }

    set(state => ({
      projects: state.projects.filter(p => p.id !== id),
      currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
    }))
  },

  // ── DUPLICATE PROJECT ───────────────────────────────────
  duplicateProject: async (id) => {
    const original = get().projects.find(p => p.id === id)
    if (!original) throw new Error('Proyek tidak ditemukan')

    const newId  = uuidv4()
    const now    = new Date().toISOString()
    const inputs = { ...migrateInputs(original.inputs), namaProyek: `${original.inputs.namaProyek} (Salinan)` }
    const copy: SavedProject = {
      id: newId, createdAt: now, updatedAt: now,
      name: `${original.name} (Salinan)`,
      inputs, results: original.results, version: APP_VERSION,
    }

    if (IS_DEV_MODE) {
      const next = [copy, ...get().projects]
      set({ projects: next })
      saveLocalProjects(next)
      return newId
    }

    const { user, profile } = useAuthStore.getState()
    if (!user) throw new Error('Belum login')

    const { error } = await supabase.from('projects').insert({
      id: newId, user_id: original.user_id || user.id, // Keep original user_id if duplicating as admin, or use current user
      name: `${original.name} (Salinan)`,
      inputs, results: original.results, version: APP_VERSION,
      created_at: now, updated_at: now,
    })
    
    if (error) {
      console.error("Supabase duplicate error:", error)
      throw error
    }

    await supabase.rpc('increment_project_counter', { uid: user.id }).catch(() => {})

    set(state => ({ projects: [copy, ...state.projects] }))
    return newId
  },

  // ── UPDATE INPUTS ───────────────────────────────────────
  updateInputs: (partial) => {
    set(state => ({ currentInputs: { ...state.currentInputs, ...partial }, currentResults: null }))
    setTimeout(() => get().saveCurrentProject(), 800)
  },

  setCurrentStep: (step) => set({ currentStep: step }),

  // ── CALCULATE ───────────────────────────────────────────
  calculate: () => {
    const results = calculateFS(get().currentInputs)
    set({ currentResults: results })
    setTimeout(() => get().saveCurrentProject(), 100)
    return results
  },

  // ── UI ──────────────────────────────────────────────────
  toggleDarkMode: () => {
    set(state => {
      const next = !state.isDarkMode
      localStorage.setItem(LS_DARK_KEY, String(next))
      return { isDarkMode: next }
    })
  },

  reset: () => set({
    currentProjectId: null,
    currentInputs:    { ...DEFAULT_INPUTS },
    currentResults:   null,
    currentStep:      1,
  }),
}))
