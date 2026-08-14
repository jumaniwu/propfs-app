// ============================================================
// PropFS — Identitas pemakai yang sedang login
//
// Menyatukan satu hal yang sebelumnya diputuskan terpisah di tiap pemanggil:
// nama & logo apa yang dicetak di kop dokumen.
//
// Dipisahkan dari branding.ts karena modul ini membaca store, sedangkan
// branding.ts harus tetap murni agar bisa diuji langsung di Node.
// ============================================================
import { useAuthStore } from '@/store/authStore'
import { getBrandingCache, identitasLaporan, type IdentitasCadangan, type IdentitasLaporan } from './branding'

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

