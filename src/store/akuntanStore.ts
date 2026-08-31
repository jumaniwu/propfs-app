// Store Modul Akuntan: pemasukan, penyesuaian inventori, & biaya non-proyek.
// Persist lokal (cepat/offline) + sinkron ke Supabase (tabel akuntan_data)
// agar data sama di semua perangkat.
import { create } from 'zustand'
import {
  buatPenjagaSinkron, tulisanBerbahaya, PESAN_BACA_GAGAL,
} from '@/lib/jagaSinkron'
import { persist } from 'zustand/middleware'
import type { PemasukanEntry, InventoryAdjustment } from '@/lib/akuntan'
import type { RealisasiEntry } from '@/lib/ai-realisasi'
import { supabase } from '@/lib/supabase'
import { useCostStore } from './costStore'
import { gabungDenganNisan, type Nisan } from '@/lib/cloudSync'
import { dataOwnerId } from '@/lib/teamApi'
import { tandaiMenyimpan, tandaiTersimpan, tandaiGagal } from '@/lib/syncStatus'

interface AkuntanStore {
  pemasukanEntries: PemasukanEntry[]
  inventoryAdjustments: InventoryAdjustment[]
  /**
   * Pengeluaran perusahaan yang BUKAN milik proyek mana pun — biaya kantor,
   * pembelian alat, sewa, langganan.
   *
   * Tinggal di sini, bukan di costStore, karena costStore per-proyek dan
   * `saveToStorage()` langsung berhenti bila tidak ada proyek aktif. Store ini
   * memang sudah global per-pemakai, sudah bersinkron ke `akuntan_data`, dan
   * sudah punya nisan anti-hidup-lagi.
   *
   * Bertipe `RealisasiEntry` apa adanya, bukan bentuk baru: `hitungLabaRugi`
   * dan `hitungNeraca` menerimanya tanpa perubahan sedikit pun. Bentuk kedua
   * berarti dua jalur penghitungan yang harus dijaga tetap sama selamanya.
   */
  biayaUmumEntries: RealisasiEntry[]
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
  addBiayaUmum: (rows: Array<Omit<RealisasiEntry, 'id'> & { id?: string }>) => void
  deleteBiayaUmum: (id: string) => void
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

type IsiAkuntan = Pick<
  AkuntanStore, 'pemasukanEntries' | 'inventoryAdjustments' | 'biayaUmumEntries' | 'hapusan'
>

/**
 * Penjaga: TIDAK MENULIS sebelum cloud terbaca sekali.
 *
 * Baris akuntan menyimpan seluruh isinya sekaligus, dan tiap perubahan
 * menulis ulang baris itu. Tanpa penjaga ini, aplikasi yang dibuka di tempat
 * penyimpanan lokalnya kosong — peramban baru, APK yang dipasang ulang, cache
 * yang dibersihkan — lalu menerima SATU pemasukan akan mengirim keadaan
 * lokalnya yang berisi satu baris itu saja, dan MENIMPA salinan cloud berisi
 * pekerjaan kemarin.
 *
 * Sejak itu tidak ada lagi yang bisa dipulihkan: yang di cloud sudah
 * tertimpa, yang di perangkat memang tidak pernah ada. Persis itu yang
 * dilaporkan sebagai "pemasukan kemarin hilang".
 */
const penjaga = buatPenjagaSinkron()

let pushTimer: ReturnType<typeof setTimeout> | null = null
function pushCloud(state: IsiAkuntan) {
  if (pushTimer) clearTimeout(pushTimer)

  // Belum pernah membaca cloud: perubahannya DITAHAN, bukan dibuang.
  // `persist` sudah menyimpannya di perangkat, dan ia akan dikirim setelah
  // pembacaan berhasil — yaitu setelah digabungkan dengan isi cloud, sehingga
  // tidak ada yang tertimpa.
  if (!penjaga.bolehTulis()) {
    penjaga.tahan()
    tandaiGagal(PESAN_BACA_GAGAL)
    return
  }

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
            biayaUmumEntries: state.biayaUmumEntries,
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
      biayaUmumEntries: [],
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
      addBiayaUmum: (rows) => {
        const baru = (rows ?? []).map((r, i) => ({
          ...r,
          id: r.id || `bu-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        })) as RealisasiEntry[]
        if (baru.length === 0) return
        set(s => ({ biayaUmumEntries: [...s.biayaUmumEntries, ...baru] }))
        pushCloud(get())
      },
      deleteBiayaUmum: (id) => {
        set(s => ({
          biayaUmumEntries: s.biayaUmumEntries.filter(e => e.id !== id),
          hapusan: [...s.hapusan, nisanBaru(id)],
        }))
        pushCloud(get())
      },
      clearAkuntan: () => {
        // Semua id yang dibuang ikut dicatat, agar tidak kembali dari cloud.
        set(s => ({
          pemasukanEntries: [], inventoryAdjustments: [], biayaUmumEntries: [],
          hapusan: [
            ...s.hapusan,
            ...s.pemasukanEntries.map(p => nisanBaru(p.id)),
            ...s.inventoryAdjustments.map(a => nisanBaru(a.id)),
            ...s.biayaUmumEntries.map(e => nisanBaru(e.id)),
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

          // Lapis kedua, di belakang penjaga: keadaan lokal yang KOSONG tidak
          // boleh menimpa cloud yang berisi. Penjaga menutup jalur yang sudah
          // diketahui; pemeriksaan ini menangkap jalur yang belum terpikirkan.
          const kosongMenimpaBerisi = tulisanBerbahaya(
            get().pemasukanEntries.length + get().biayaUmumEntries.length
              + get().inventoryAdjustments.length,
            (cloud.pemasukanEntries?.length ?? 0) + (cloud.biayaUmumEntries?.length ?? 0)
              + (cloud.inventoryAdjustments?.length ?? 0),
          )

          const pm = gabungDenganNisan(
            get().pemasukanEntries, cloud.pemasukanEntries ?? [], p => p.id,
            get().hapusan, nisanCloud,
          )
          const ia = gabungDenganNisan(
            get().inventoryAdjustments, cloud.inventoryAdjustments ?? [], a => a.id,
            get().hapusan, nisanCloud,
          )
          const bu = gabungDenganNisan(
            get().biayaUmumEntries, cloud.biayaUmumEntries ?? [], e => e.id,
            get().hapusan, nisanCloud,
          )
          const merged: IsiAkuntan = {
            pemasukanEntries: pm.entries,
            inventoryAdjustments: ia.entries,
            biayaUmumEntries: bu.entries,
            // ketiga panggilan memakai kumpulan nisan yang sama, jadi cukup satu
            hapusan: pm.nisan,
          }
          set(merged)

          // Sejak pembacaan BERHASIL, penulisan diizinkan.
          penjaga.tandaiTerbaca()

          // Perubahan yang tertahan selama penantian dikirim sekarang — dan
          // yang dikirim adalah hasil GABUNGAN, bukan keadaan lokal tadi.
          // Itulah sebabnya menahan tidak berarti kehilangan.
          if (penjaga.lepasTertahan() || !kosongMenimpaBerisi) pushCloud(merged)
          else tandaiTersimpan()
        } catch (e) {
          // Dilaporkan, bukan hanya dicatat ke console. Pembacaan yang gagal
          // diam-diam adalah langkah kedua dari jalan yang menghapus data:
          // sesudahnya, penulisan berikutnya menimpa cloud dengan keadaan
          // lokal yang kosong. Sekarang penulisan itu memang tidak akan
          // terjadi — penjaga menahannya — tetapi pemakainya tetap harus tahu
          // bahwa perubahannya belum sampai ke mana pun selain perangkat ini.
          const pesan = e instanceof Error ? e.message : String(e)
          console.warn('[akuntan] muat cloud gagal (tabel akuntan_data belum ada?):', pesan)
          tandaiGagal(`${PESAN_BACA_GAGAL} (${pesan})`)
        }
      },
    }),
    { name: 'propfs-akuntan' },
  ),
)
