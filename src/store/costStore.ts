import { create } from 'zustand'
import { BudgetPlan, BudgetComponent, MaterialScheduleItem } from '../types/cost.types'
import { RealisasiEntry } from '../lib/ai-realisasi'
import { supabase } from '../lib/supabase'
import { gabungProyek, sisipkanProyek, gabungNisan, type Nisan } from '../lib/sinkronProyek'
import { dataOwnerId } from '../lib/teamApi'
import { tandaiMenyimpan, tandaiTersimpan, tandaiGagal } from '../lib/syncStatus'

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
  /**
   * Baris realisasi yang sudah DIHAPUS, berikut kapan dihapusnya.
   *
   * Ikut disimpan dan ikut naik ke cloud — di sanalah gunanya: perangkat lain
   * membacanya lalu berhenti menghidupkan kembali baris yang sudah dihapus di
   * sini. Tanpa medan ini, penggabungan antar-perangkat tidak punya cara
   * membedakan "sudah dihapus" dari "belum pernah ada di sisi itu".
   *
   * Opsional supaya seluruh dokumen lama tetap terbaca apa adanya.
   */
  dihapus?: Nisan[]
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
  /** Penghapusan pada proyek yang sedang dibuka. Lihat SavedCostProject.dihapus. */
  nisanRealisasi: Nisan[]
  
  // States
  isProcessingUpload: boolean
  isGeneratingMaterial: boolean
  isProcessingRealisasi: boolean

  // Actions
  loadProjects: () => void
  /**
   * Satukan dengan salinan server. `paksaDorong` mengulang unggahan SELURUH
   * proyek — dipakai tombol "Sinkronkan sekarang".
   */
  sinkronCloud: (paksaDorong?: boolean) => Promise<{ ok: boolean; lokal: number; cloud: number; gagal?: number }>
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
//
// null berarti PEMILIKNYA BELUM DIKENALI. Dulu keadaan itu dijawab dengan kunci
// ":anonymous", dan itulah salah satu sebab proyek "hilang": tulisan pertama
// setelah halaman dibuka mendarat di laci yang salah, lalu tidak pernah dibaca
// lagi begitu sesinya siap. Sekarang penyimpanan ditunda sampai pemiliknya
// jelas — menunda lebih baik daripada menyimpan ke tempat yang salah.
function getUserStorageKey(): string | null {
  try {
    // Saat membuka workspace perusahaan lain sebagai anggota tim, kunci mengikuti
    // pemilik workspace agar data antar-perusahaan tidak tercampur di perangkat ini.
    const owner = dataOwnerId()
    if (owner) return `propfs-cost-projects:${owner}`
  } catch { /* ignore */ }
  return null
}

function loadLocalData(): SavedCostProject[] {
  try {
    const key = getUserStorageKey()
    if (!key) return []
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch { return [] }
}

function saveLocalData(projects: SavedCostProject[]) {
  try {
    const key = getUserStorageKey()
    if (!key) return
    localStorage.setItem(key, JSON.stringify(projects))
  } catch { /* ignore */ }
}

// ── Sinkron cloud (Supabase) agar proyek terlihat di semua perangkat ────────
function cloudUserId(): string | null {
  // Anggota tim membaca/menulis data milik pemilik workspace (diizinkan RLS
  // lewat is_team_member); tanpa workspace terpilih = data milik sendiri.
  return dataOwnerId()
}

/**
 * Tunggu sampai pemilik data dikenali.
 *
 * `initialize()` di authStore berjalan asinkron; pada pemuatan pertama halaman
 * bisa saja sudah meminta daftar proyek sebelum sesinya selesai dibaca.
 * Menunggu sebentar jauh lebih baik daripada menyerah diam-diam — itu yang
 * dulu membuat laptop tidak pernah membaca cloud sama sekali.
 */
async function tungguPemilik(maksMs = 6000): Promise<string | null> {
  const mulai = Date.now()
  for (;;) {
    const id = cloudUserId()
    if (id) return id
    if (Date.now() - mulai >= maksMs) return null
    await new Promise(r => setTimeout(r, 200))
  }
}

/** true bila proyeknya benar-benar sampai di server. */
async function upsertCloudProject(p: SavedCostProject): Promise<boolean> {
  const user_id = cloudUserId()
  // Belum login: data tetap aman di localStorage, bukan kegagalan.
  if (!user_id) { tandaiTersimpan(); return false }
  tandaiMenyimpan()
  try {
    const { error } = await supabase.from('cost_projects').upsert(
      { user_id, id: p.info.id, data: p, updated_at: p.updatedAt },
      { onConflict: 'user_id,id' },
    )
    if (error) throw error
    tandaiTersimpan()
    return true
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e)
    console.warn('[cost] gagal sinkron proyek ke cloud:', pesan)
    tandaiGagal(pesan)
    return false
  }
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
  nisanRealisasi: [],
  
  isProcessingUpload: false,
  isGeneratingMaterial: false,
  isProcessingRealisasi: false,

  loadProjects: () => {
    // tampilkan data lokal dulu (cepat/offline), lalu gabungkan dengan cloud
    set({ savedProjects: loadLocalData() })
    void get().sinkronCloud()
  },

  /**
   * Ambil salinan cloud, satukan dengan yang ada di perangkat ini, lalu dorong
   * balik yang belum sampai.
   *
   * Dulu bagian ini MENYERAH DIAM-DIAM bila sesinya belum siap
   * (`if (!user_id) return`) dan tidak pernah dicoba lagi. Di laptop yang baru
   * dibuka, itu berarti cloud tidak pernah dibaca sama sekali — dan pemakainya
   * hanya melihat daftar kosong tanpa tahu sebabnya. Sekarang sesinya ditunggu
   * sebentar, dan hasilnya dilaporkan lewat penanda sinkron.
   */
  sinkronCloud: async (paksaDorong = false) => {
    const user_id = await tungguPemilik()
    if (!user_id) {
      tandaiGagal('Sesi belum siap — proyek baru tersimpan di perangkat ini saja.')
      return { ok: false, lokal: loadLocalData().length, cloud: 0 }
    }

    // Dibaca ULANG di sini, bukan dipakai dari memori: antara halaman dibuka
    // dan jawaban cloud tiba, pemakainya bisa saja sudah menyimpan sesuatu.
    const local = loadLocalData()
    try {
      const { data, error } = await supabase
        .from('cost_projects').select('data').eq('user_id', user_id)
      if (error) throw error
      const cloud = (data ?? [])
        .map(r => r.data as SavedCostProject)
        .filter(p => p?.info?.id)

      const { gabungan, perluDorong } = gabungProyek(
        local as never, cloud as never,
      ) as unknown as { gabungan: SavedCostProject[]; perluDorong: SavedCostProject[] }

      set({ savedProjects: gabungan })
      saveLocalData(gabungan)

      // paksaDorong dipakai tombol "Sinkronkan sekarang": kalau ada yang dulu
      // gagal naik tanpa ketahuan, mengulang seluruhnya jauh lebih murah
      // daripada kehilangan satu proyek.
      const dorong = paksaDorong ? gabungan : perluDorong
      let gagal = 0
      for (const p of dorong) {
        const berhasil = await upsertCloudProject(p)
        if (!berhasil) gagal++
      }
      if (gagal === 0) tandaiTersimpan()

      return { ok: gagal === 0, lokal: gabungan.length, cloud: cloud.length, gagal }
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e)
      console.warn('[cost] sinkron cloud gagal:', pesan)
      tandaiGagal(pesan)
      return { ok: false, lokal: local.length, cloud: 0 }
    }
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
      // Ikut disimpan dan ikut naik ke cloud — di sanalah gunanya: perangkat
      // lain membacanya lalu berhenti menghidupkan kembali baris yang sudah
      // dihapus di sini.
      dihapus: get().nisanRealisasi,
      updatedAt: now
    }

    // Disisipkan ke daftar yang dibaca ULANG dari penyimpanan, BUKAN ke
    // salinan yang menempel di memori sejak halaman dibuka. Proyek yang datang
    // dari cloud beberapa ratus milidetik setelah halaman terbuka dulu terhapus
    // di sini — daftar lama ditulis ulang utuh, dan proyek yang belum sempat
    // masuk ke memori ikut lenyap dari perangkat ini.
    const terbaru = loadLocalData()
    const dasar = terbaru.length >= savedProjects.length ? terbaru : savedProjects
    const nextProjects = sisipkanProyek(dasar as never, updatedProject as never) as unknown as SavedCostProject[]

    set({ savedProjects: nextProjects })
    saveLocalData(nextProjects)
    void upsertCloudProject(updatedProject)
  },

  initProject: (info) => {
    set({ projectInfo: info, activePlan: null, draftComponents: [], materialSchedule: [], realisasiEntries: [], nisanRealisasi: [] })
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
        nisanRealisasi: gabungNisan((p as { dihapus?: Nisan[] }).dihapus ?? []),
        draftComponents: []
      })
    }
  },

  clearProject: () => {
    set({ projectInfo: null, activePlan: null, draftComponents: [], materialSchedule: [], realisasiEntries: [], nisanRealisasi: [] })
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
    // Penghapusan DICATAT, bukan sekadar dijalankan.
    //
    // Penggabungan antar-perangkat menyatukan baris dari kedua sisi, dan
    // penyatuan seperti itu tidak bisa menyatakan penghapusan sama sekali:
    // ketiadaan sebuah baris di satu sisi tidak bisa dibedakan dari "belum
    // pernah ada di sisi itu". Tanpa catatan ini, baris yang dihapus di HP
    // hidup lagi dari salinan laptop, dihapus lagi, hidup lagi — dan
    // pemakainya menyimpulkan aplikasinya tidak menyimpan apa-apa.
    set(state => ({
      realisasiEntries: state.realisasiEntries.filter(e => e.id !== id),
      nisanRealisasi: gabungNisan(state.nisanRealisasi, [{ id, at: new Date().toISOString() }]),
    }))
    setTimeout(() => get().saveToStorage(), 300)
  },

  clearRealisasiEntries: () => {
    // Seluruh id yang dibuang ikut dicatat. Mengosongkan tanpa mencatat berarti
    // seluruhnya kembali pada sinkronisasi berikutnya — kerugian yang persis
    // sama, hanya sekaligus.
    const waktu = new Date().toISOString()
    set(state => ({
      realisasiEntries: [],
      nisanRealisasi: gabungNisan(
        state.nisanRealisasi,
        state.realisasiEntries.map(e => ({ id: String(e.id ?? ''), at: waktu })),
      ),
    }))
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
