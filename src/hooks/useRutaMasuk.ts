// Beranda pemakai saat ini — satu sumber jawaban untuk semua pintu masuk.
//
// Dipakai tombol "Buka Portal" di landing page, pengalihan setelah login,
// tombol Portal di header, dan fallback rute tak dikenal. Dulu semuanya
// menuliskan '/home' sendiri-sendiri; itulah sebabnya mengubah satu tempat
// tidak pernah cukup.
import { useAuthStore } from '@/store/authStore'
import { sesiTim } from '@/lib/teamApi'
import { rutaMasuk, rutaSetelahMasuk, type AksesMasuk } from '@/lib/berandaMasuk'

/** Apa yang boleh dibuka pemakai saat ini. */
export function aksesMasukSaatIni(): AksesMasuk {
  const { isFeatureEnabled } = useAuthStore.getState()
  return {
    sesiTim: sesiTim(),
    kontraktor: isFeatureEnabled('cost_control'),
    fs: isFeatureEnabled('fs_module'),
  }
}

/** Rute beranda pemakai saat ini. */
export function rutaMasukSaatIni(): string {
  return rutaMasuk(aksesMasukSaatIni())
}

/** Rute setelah login: menerbitkan tagihan bila ada paket yang dipilih. */
export function rutaSetelahMasukSaatIni(plan?: string | null, bulan = 1): string {
  return rutaSetelahMasuk(aksesMasukSaatIni(), plan, bulan)
}

/**
 * Versi hook: ikut berubah saat profil/langganan selesai dimuat.
 *
 * Penting untuk komponen yang dirender sebelum profil siap — tanpa ini,
 * pemakai berlangganan yang membuka aplikasi dari nol akan dihitung "tanpa
 * akses" dan dilempar ke halaman paket.
 */
export function useRutaMasuk(): string {
  const profile = useAuthStore(s => s.profile)
  const globalFeatures = useAuthStore(s => s.globalFeatures)
  const subscriptions = useAuthStore(s => s.subscriptions)
  const isFeatureEnabled = useAuthStore(s => s.isFeatureEnabled)
  // Dibaca agar komponen dirender ulang saat profil & langganan selesai dimuat.
  void profile; void globalFeatures; void subscriptions
  return rutaMasuk({
    sesiTim: sesiTim(),
    kontraktor: isFeatureEnabled('cost_control'),
    fs: isFeatureEnabled('fs_module'),
  })
}
