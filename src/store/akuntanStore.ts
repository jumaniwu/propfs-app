// Store Modul Akuntan: pemasukan & penyesuaian inventori.
// Persist lokal (cepat/offline) + sinkron ke Supabase (tabel akuntan_data)
// agar data sama di semua perangkat.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PemasukanEntry, InventoryAdjustment } from '@/lib/akuntan'
import { supabase } from '@/lib/supabase'
import { useCostStore } from './costStore'
import { unionById } from '@/lib/cloudSync'
import { dataOwnerId } from '@/lib/teamApi'

interface AkuntanStore {
  pemasukanEntries: PemasukanEntry[]
  inventoryAdjustments: InventoryAdjustment[]
  addPemasukan: (p: Omit<PemasukanEntry, 'id'>) => void
  deletePemasukan: (id: string) => void
  addAdjustment: (a: Omit<InventoryAdjustment, 'id'>) => void
  deleteAdjustment: (id: string) => void
  clearAkuntan: () => void
  /** Tarik data cloud & gabungkan (dipanggil saat tab Akuntan dibuka). */
  loadFromCloud: () => Promise<void>
}

function userId(): string | null {
  // Sama seperti costStore: anggota tim membaca data pemilik workspace aktif.
  return dataOwnerId()
}

/**
 * Proyek yang sedang dibuka — dipakai menandai entri baru agar laporan bisa
 * disaring per proyek maupun dikonsolidasi.
 */
function proyekAktifId(): string | undefined {
  try { return useCostStore.getState().projectInfo?.id } catch { return undefined }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
function pushCloud(state: Pick<AkuntanStore, 'pemasukanEntries' | 'inventoryAdjustments'>) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void (async () => {
      const user_id = userId()
      if (!user_id) return
      try {
        await supabase.from('akuntan_data').upsert({
          user_id,
          data: {
            pemasukanEntries: state.pemasukanEntries,
            inventoryAdjustments: state.inventoryAdjustments,
          },
          updated_at: new Date().toISOString(),
        })
      } catch (e) { console.warn('[akuntan] sinkron cloud gagal:', e) }
    })()
  }, 800)
}

export const useAkuntanStore = create<AkuntanStore>()(
  persist(
    (set, get) => ({
      pemasukanEntries: [],
      inventoryAdjustments: [],
      addPemasukan: (p) => {
        set(s => ({
          pemasukanEntries: [...s.pemasukanEntries, {
            projectId: proyekAktifId(), ...p,
            id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }],
        }))
        pushCloud(get())
      },
      deletePemasukan: (id) => {
        set(s => ({ pemasukanEntries: s.pemasukanEntries.filter(p => p.id !== id) }))
        pushCloud(get())
      },
      addAdjustment: (a) => {
        set(s => ({
          inventoryAdjustments: [...s.inventoryAdjustments, {
            projectId: proyekAktifId(), ...a,
            id: `ia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }],
        }))
        pushCloud(get())
      },
      deleteAdjustment: (id) => {
        set(s => ({ inventoryAdjustments: s.inventoryAdjustments.filter(a => a.id !== id) }))
        pushCloud(get())
      },
      clearAkuntan: () => {
        set({ pemasukanEntries: [], inventoryAdjustments: [] })
        pushCloud(get())
      },
      loadFromCloud: async () => {
        const user_id = userId()
        if (!user_id) return
        try {
          const { data, error } = await supabase
            .from('akuntan_data').select('data').eq('user_id', user_id).maybeSingle()
          if (error) throw error
          const cloud = (data?.data ?? {}) as Partial<Pick<AkuntanStore, 'pemasukanEntries' | 'inventoryAdjustments'>>
          const merged = {
            pemasukanEntries: unionById(get().pemasukanEntries, cloud.pemasukanEntries ?? [], p => p.id),
            inventoryAdjustments: unionById(get().inventoryAdjustments, cloud.inventoryAdjustments ?? [], a => a.id),
          }
          set(merged)
          pushCloud(merged)
        } catch (e) {
          console.warn('[akuntan] muat cloud gagal (tabel akuntan_data belum ada?):', e)
        }
      },
    }),
    { name: 'propfs-akuntan' },
  ),
)
