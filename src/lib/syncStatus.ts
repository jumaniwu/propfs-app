// ============================================================
// PropFS — Status simpan otomatis
//
// Seluruh data Kontraktor AI sebenarnya sudah tersimpan sendiri setiap kali
// diubah: localStorage langsung, lalu Supabase beberapa ratus milidetik
// kemudian. Tombol "Simpan Data" di header dulu hanya memunculkan notifikasi
// tanpa menyimpan apa pun, sehingga menyesatkan.
//
// Store kecil ini menggantikannya dengan keterangan yang benar: sedang
// menyimpan, sudah tersimpan (beserta waktunya), atau gagal beserta sebabnya.
// ============================================================
import { create } from 'zustand'

export type StatusSimpan = 'idle' | 'menyimpan' | 'tersimpan' | 'gagal'

interface SyncStatusStore {
  status: StatusSimpan
  /** Waktu penyimpanan terakhir yang berhasil, ISO string. */
  terakhir: string | null
  /** Sebab kegagalan, untuk ditampilkan apa adanya ke pengguna. */
  pesan: string
  tandaiMenyimpan: () => void
  tandaiTersimpan: () => void
  tandaiGagal: (pesan: string) => void
}

export const useSyncStatus = create<SyncStatusStore>((set) => ({
  status: 'idle',
  terakhir: null,
  pesan: '',
  tandaiMenyimpan: () => set({ status: 'menyimpan', pesan: '' }),
  tandaiTersimpan: () => set({
    status: 'tersimpan', terakhir: new Date().toISOString(), pesan: '',
  }),
  tandaiGagal: (pesan) => set({ status: 'gagal', pesan }),
}))

// Dipanggil dari store (bukan komponen), jadi disediakan sebagai fungsi biasa
// supaya tidak perlu hook.
export const tandaiMenyimpan = () => useSyncStatus.getState().tandaiMenyimpan()
export const tandaiTersimpan = () => useSyncStatus.getState().tandaiTersimpan()
export const tandaiGagal = (pesan: string) => useSyncStatus.getState().tandaiGagal(pesan)

/** "14:07" dari ISO string; kosong bila belum pernah tersimpan. */
export function jamSingkat(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export const LABEL_STATUS_SIMPAN: Record<StatusSimpan, string> = {
  idle: 'Tersimpan otomatis',
  menyimpan: 'Menyimpan…',
  tersimpan: 'Tersimpan',
  gagal: 'Gagal menyimpan',
}
