// ============================================================
// PropFS — Penyimpanan desain AI Architect (siteplan)
// Desain disimpan sebagai input (koordinat + parameter) di
// localStorage via zustand/persist, lalu di-generate ulang saat
// dibuka (engine deterministik sehingga hasil selalu identik).
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { SiteplanConcept } from '@/engine/siteplan/layout.ts'

export interface SiteplanFormState {
  lotW: number; lotD: number
  roadMain: number; roadSec: number; blockMaxLen: number
  rthPct: number; fasumPct: number
  comEnabled: boolean; comW: number; comD: number; comMax: number
  towerW: number; towerD: number; towerCount: number
  mixTowerEnabled?: boolean
  mixRumah?: boolean
  mixRuko?: boolean
  mixPlaza?: boolean
  plazaW?: number
  plazaD?: number
}

export interface SavedSiteplan {
  id: string
  name: string
  savedAt: string
  coordsText: string
  concept: SiteplanConcept
  frontageEdge: number | null
  form: SiteplanFormState
  /** ringkasan kecil untuk kartu daftar */
  summary: { totalAreaM2: number; units: number; efficiencyPct: number }
}

interface SiteplanStore {
  designs: SavedSiteplan[]
  saveDesign: (d: Omit<SavedSiteplan, 'id' | 'savedAt'>) => string
  deleteDesign: (id: string) => void
}

export const useSiteplanStore = create<SiteplanStore>()(
  persist(
    set => ({
      designs: [],
      saveDesign: d => {
        const id = uuidv4()
        const entry: SavedSiteplan = { ...d, id, savedAt: new Date().toISOString() }
        set(s => ({ designs: [entry, ...s.designs].slice(0, 50) }))
        return id
      },
      deleteDesign: id => {
        set(s => ({ designs: s.designs.filter(x => x.id !== id) }))
      },
    }),
    { name: 'propfs-siteplan-designs' },
  ),
)
