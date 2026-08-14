// Store Modul Akuntan: pemasukan & penyesuaian inventori.
// Persist lokal (cepat/offline) + sinkron ke Supabase (tabel akuntan_data)
// agar data sama di semua perangkat.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PemasukanEntry, InventoryAdjustment } from '@/lib/akuntan'
import { supabase } from '@/lib/supabase'
import { useCostStore } from './costStore'
import { gabungDenganNisan, type Nisan } from '@/lib/cloudSync'
import { dataOwnerId } from '@/lib/teamApi'
import { tandaiMenyimpan, tandaiTersimpan, tandaiGagal } from '@/lib/syncStatus'

interface AkuntanStore {
  pemasukanEntries: PemasukanEntry[]
  inventoryAdjustments: InventoryAdjustment[]
  /**
   * Catatan penghapusan yang ikut disinkronkan. Tanpa ini, entri yang dihapus
   * di satu perangkat akan dihidupkan kembali oleh data cloud dan tampil dobel.
   */
  hapusan: Nisan[]
  addPemasukan: (p: Omit<PemasukanEntry, 'id'>) => void
  deletePemasukan: (id: string) => void
  /** Pindahkan entri ke proyek lain (atau ke Umum bila projectId kosong). */
  setPemasukanProject: (id: string, projectId?: string) => void
  addAdjustment: (a: Omit<InventoryAdjustment, 'id'>) => void
  deleteAdjustment: (id: string) => void
  setAdjustmentProject: (id: string, projectId?: string) => void
  clearAkuntan: () => void
  /** Tarik data cloud & gabungkan (dipanggil saat tab Akuntan dibuka). */
  loadFromCloud: () => Promise<void>
}

/**
 * Tunggu sampai pemilik datanya diketahui.
 *
 * `dataOwnerId()` bersandar pada sesi yang dimuat SETELAH halaman terbuka.
 * Sebelumnya `loadFromCloud` langsung `return` bila ia masih null, dan tidak
 * pernah dicoba lagi — di laptop yang baru dibuka, cloud tidak pernah dibaca
 * sama sekali, dan yang terlihat hanya "Belum ada pemasukan tercatat".
 *
 * costStore sudah memperbaiki cacat yang sama persis; akuntanStore tidak ikut.
 */
async function tungguPemilik(maksMs = 6000): Promise<string | null> {
  const mulai = Date.now()
  for (;;) {
    const id = userId()
    if (id) return id
    if (Date.now() - mulai >= maksMs) return null
    await new Promise(r => setTimeout(r, 200))
  }
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

type IsiAkuntan = Pick<AkuntanStore, 'pemasukanEntries' | 'inventoryAdjustments' | 'hapusan'>

let pushTimer: ReturnType<typeof setTimeout> | null = null
function pushCloud(state: IsiAkuntan) {
  if (pushTimer) clearTimeout(pushTimer)
  tandaiMenyimpan()
  pushTimer = setTimeout(() => {
    void (async () => {
      const user_id = await tungguPemilik()
      // Belum login: data tetap aman di localStorage, jadi tidak dianggap gagal.
      if (!user_id) { tandaiTersimpan(); return }
      try {
        const { error } = await supabase.from('akuntan_data').upsert({
          user_id,
          data: {
            pemasukanEntries: state.pemasukanEntries,
            inventoryAdjustments: state.inventoryAdjustments,
            hapusan: state.hapusan,
          },
          updated_at: new Date().toISOString(),
        })
        if (error) throw error
        tandaiTersimpan()
      } catch (e) {
        const pesan = e instanceof Error ? e.message : String(e)
        console.warn('[akuntan] sinkron cloud gagal:', pesan)
        tandaiGagal(pesan)
      }
    })()
  }, 800)
}

/** Catat penghapusan sebuah id pada waktu sekarang. */
function nisanBaru(id: string): Nisan {
  return { id, at: new Date().toISOString() }
}

export const useAkuntanStore = create<AkuntanStore>()(
  persist(
    (set, get) => ({
      pemasukanEntries: [],
      inventoryAdjustments: [],
      hapusan: [],
      addPemasukan: (p) => {
        // projectId dari pemanggil diutamakan; `p` bisa memuat projectId
        // bernilai undefined, jadi jangan andalkan urutan spread.
        const projectId = p.projectId ?? proyekAktifId()
        set(s => ({
          pemasukanEntries: [...s.pemasukanEntries, {
            ...p, projectId,
            id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }],
        }))
        pushCloud(get())
      },
      deletePemasukan: (id) => {
        set(s => ({
          pemasukanEntries: s.pemasukanEntries.filter(p => p.id !== id),
          hapusan: [...s.hapusan, nisanBaru(id)],
        }))
        pushCloud(get())
      },
      setPemasukanProject: (id, projectId) => {
        set(s => ({
          pemasukanEntries: s.pemasukanEntries.map(p => p.id === id ? { ...p, projectId } : p),
        }))
        pushCloud(get())
      },
      addAdjustment: (a) => {
        const projectId = a.projectId ?? proyekAktifId()
        set(s => ({
          inventoryAdjustments: [...s.inventoryAdjustments, {
            ...a, projectId,
            id: `ia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          }],
        }))
        pushCloud(get())
      },
      deleteAdjustment: (id) => {
        set(s => ({
          inventoryAdjustments: s.inventoryAdjustments.filter(a => a.id !== id),
          hapusan: [...s.hapusan, nisanBaru(id)],
        }))
        pushCloud(get())
      },
      setAdjustmentProject: (id, projectId) => {
        set(s => ({
          inventoryAdjustments: s.inventoryAdjustments.map(a => a.id === id ? { ...a, projectId } : a),
        }))
        pushCloud(get())
      },
      clearAkuntan: () => {
        // Semua id yang dibuang ikut dicatat, agar tidak kembali dari cloud.
        set(s => ({
          pemasukanEntries: [], inventoryAdjustments: [],
          hapusan: [
            ...s.hapusan,
            ...s.pemasukanEntries.map(p => nisanBaru(p.id)),
            ...s.inventoryAdjustments.map(a => nisanBaru(a.id)),
          ],
        }))
        pushCloud(get())
      },
      loadFromCloud: async () => {
        const user_id = await tungguPemilik()
        if (!user_id) {
          // Dilaporkan, bukan didiamkan. Daftar kosong yang sebenarnya
          // "belum sempat dibaca" terlihat persis sama dengan "memang belum
          // ada isinya" — dan itulah yang membuat orang mengira datanya hilang.
          tandaiGagal('Sesi belum siap — data akuntan belum sempat ditarik dari cloud.')
          return
        }
        try {
          const { data, error } = await supabase
            .from('akuntan_data').select('data').eq('user_id', user_id).maybeSingle()
          if (error) throw error
          const cloud = (data?.data ?? {}) as Partial<IsiAkuntan>
          const nisanCloud = cloud.hapusan ?? []

          const pm = gabungDenganNisan(
            get().pemasukanEntries, cloud.pemasukanEntries ?? [], p => p.id,
            get().hapusan, nisanCloud,
          )
          const ia = gabungDenganNisan(
            get().inventoryAdjustments, cloud.inventoryAdjustments ?? [], a => a.id,
            get().hapusan, nisanCloud,
          )
          const merged: IsiAkuntan = {
            pemasukanEntries: pm.entries,
            inventoryAdjustments: ia.entries,
            // kedua panggilan memakai kumpulan nisan yang sama, jadi cukup satu
            hapusan: pm.nisan,
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
