// ============================================================
// PropFS — Identitas & hak cetak pemakai yang sedang login
//
// Menyatukan dua hal yang sebelumnya diputuskan terpisah di tiap pemanggil:
//   1. Nama & logo apa yang dicetak di kop dokumen
//   2. Apakah dokumennya perlu diberi watermark "Versi Gratis"
//
// Dipisahkan dari branding.ts karena modul ini membaca store, sedangkan
// branding.ts harus tetap murni agar bisa diuji langsung di Node.
// ============================================================
import { useAuthStore } from '@/store/authStore'
import { getBrandingCache, identitasLaporan, type IdentitasCadangan, type IdentitasLaporan, type KonteksWatermark } from './branding'
import type { Produk } from './produk'

/** Nama pemilik akun, cadangan kop untuk kontraktor perorangan. */
export function identitasAkun(): IdentitasCadangan {
  const p = useAuthStore.getState().profile
  return {
    nama: p?.full_name ?? '',
    perusahaan: p?.company ?? '',
    telepon: p?.phone ?? '',
    email: p?.email ?? '',
  }
}

/** Kop dokumen: Profil Perusahaan → nama pemilik akun → identitas PropFS. */
export function kopSaya(): IdentitasLaporan {
  return identitasLaporan(getBrandingCache(), identitasAkun())
}

/**
 * Keadaan yang menentukan watermark. Peran dan pemberian akses per pengguna
 * ikut dibawa — paket saja tidak cukup, lihat perluWatermark() di branding.ts.
 */
export function konteksWatermark(produk: Produk = 'kontraktor'): KonteksWatermark {
  const s = useAuthStore.getState()
  return {
    planId: s.getPlanFor(produk),
    role: s.profile?.role ?? '',
    customFeatures: s.profile?.custom_features ?? null,
    fitur: 'cost_control',
    sistemLanggananAktif: s.isSubscriptionEnabled,
  }
}
