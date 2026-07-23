// Store Modul Akuntan: pemasukan & penyesuaian inventori (persist lokal,
// mengikuti pola realisasiEntries pada costStore).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PemasukanEntry, InventoryAdjustment } from '@/lib/akuntan'

interface AkuntanStore {
  pemasukanEntries: PemasukanEntry[]
  inventoryAdjustments: InventoryAdjustment[]
  addPemasukan: (p: Omit<PemasukanEntry, 'id'>) => void
  deletePemasukan: (id: string) => void
  addAdjustment: (a: Omit<InventoryAdjustment, 'id'>) => void
  deleteAdjustment: (id: string) => void
  clearAkuntan: () => void
}

export const useAkuntanStore = create<AkuntanStore>()(
  persist(
    (set) => ({
      pemasukanEntries: [],
      inventoryAdjustments: [],
      addPemasukan: (p) => set(s => ({
        pemasukanEntries: [...s.pemasukanEntries, { ...p, id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
      })),
      deletePemasukan: (id) => set(s => ({
        pemasukanEntries: s.pemasukanEntries.filter(p => p.id !== id),
      })),
      addAdjustment: (a) => set(s => ({
        inventoryAdjustments: [...s.inventoryAdjustments, { ...a, id: `ia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
      })),
      deleteAdjustment: (id) => set(s => ({
        inventoryAdjustments: s.inventoryAdjustments.filter(a => a.id !== id),
      })),
      clearAkuntan: () => set({ pemasukanEntries: [], inventoryAdjustments: [] }),
    }),
    { name: 'propfs-akuntan' },
  ),
)
