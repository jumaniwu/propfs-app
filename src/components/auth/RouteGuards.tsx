// ── Auth Route Guards ────────────────────────────────────
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { sesiTim } from '@/lib/teamApi'
import { rutaTagihan, RUTA_LANGGANAN } from '@/lib/berandaMasuk'
import { useRutaMasuk } from '@/hooks/useRutaMasuk'
import type { AppFeature } from '@/lib/supabase'

/** Beranda sesi tim: karyawan selalu mendarat di modul Kontraktor AI. */
const HOME_TIM = '/kontraktor'

/**
 * Halaman non-Kontraktor yang tetap boleh dibuka akun tim. Selain ini,
 * karyawan diarahkan kembali ke Kontraktor AI — akun tim memang tidak
 * berlangganan Feasibility Study dan tidak punya dashboard akun utama.
 */
const BOLEH_UNTUK_TIM = ['/profile']

/** Fitur yang aksesnya menumpang langganan perusahaan saat sesi tim aktif. */
const FITUR_KONTRAKTOR: AppFeature[] = [
  'cost_control', 'cost_rab', 'cost_realisasi', 'cost_material', 'scurve',
]

interface Props { children: React.ReactNode }
interface FeatureProps { children: React.ReactNode; feature: AppFeature }

function Spinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/** Redirect to /auth if not logged in. Block if user is suspended. */
export function PrivateRoute({ children }: Props) {
  const { user, profile, isLoading, signOut } = useAuthStore()
  const { pathname } = useLocation()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/auth" replace />

  // Sesi tim dikunci ke Kontraktor AI — jangan pernah mendarat di dashboard
  // akun utama atau modul Feasibility Study milik perusahaan lain.
  if (sesiTim() && !BOLEH_UNTUK_TIM.some(p => pathname.startsWith(p))) {
    return <Navigate to={HOME_TIM} replace />
  }
  
  // Block suspended users
  if (profile && profile.is_active === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white rounded-3xl shadow-2xl p-10 space-y-6 border border-red-100">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-4xl">🔒</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-navy mb-2">Akun Dinonaktifkan</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Akun Anda saat ini dinonaktifkan oleh administrator. Silakan hubungi tim kami untuk informasi lebih lanjut.
            </p>
          </div>
          <a href="mailto:support@propfs.id" className="block text-sm text-gold font-semibold hover:underline">
            support@propfs.id
          </a>
          <button
            onClick={() => signOut()}
            className="w-full py-3 rounded-xl bg-navy text-white font-bold hover:bg-navy/90 transition-colors"
          >
            Keluar
          </button>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}

/** Sudah login: langsung ke berandanya, bukan ke dashboard akun lama. */
export function AuthRoute({ children }: Props) {
  const { user, isLoading } = useAuthStore()
  const beranda = useRutaMasuk()
  const urlParams = new URLSearchParams(window.location.search)
  const planParam = urlParams.get('plan')
  // Paket yang dipilih sebelum login tetap ditagihkan lebih dulu; `/home` kini
  // hanya pintu penerbit tagihan, bukan halaman yang menampilkan apa pun.
  const redirectTo = planParam && planParam !== 'free' ? rutaTagihan(planParam) : beranda

  // Do not return null on isLoading here, because it will UNMOUNT AuthPage and destroy its local state
  // AuthPage itself already handles its loading state via the useAuthStore's isLoading flag.
  if (user && !isLoading) return <Navigate to={sesiTim() ? HOME_TIM : redirectTo} replace />
  return <>{children}</>
}

/** Open Route — always renders, no redirect, no loading block */
export function OpenRoute({ children }: Props) {
  // Do NOT block on isLoading — landing page should always render immediately
  return <>{children}</>
}

/** Redirect non-superadmin away from admin routes */
export function AdminRoute({ children }: Props) {
  const { user, profile, isLoading } = useAuthStore()
  const beranda = useRutaMasuk()
  if (isLoading) return <Spinner />
  if (!user || profile?.role !== 'superadmin') return <Navigate to={beranda} replace />
  return <>{children}</>
}

/** Block access to feature-gated routes for users without the feature.
 *  Superadmin always passes through. Free users are redirected to /pricing. */
export function FeatureRoute({ children, feature }: FeatureProps) {
  const { user, isLoading, isFeatureEnabled } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/auth" replace />

  // Anggota tim tidak punya langganan sendiri — hak aksesnya menumpang
  // langganan perusahaan, yang sudah diperiksa saat login tim dan diperiksa
  // ulang di halaman Home Kontraktor AI. Tanpa pengecualian ini, penjaga
  // rute akan menendang karyawan keluar begitu ia masuk.
  if (sesiTim() && FITUR_KONTRAKTOR.includes(feature)) return <>{children}</>

  if (!isFeatureEnabled(feature)) {
    // JANGAN kirim ke beranda: sejak beranda pemakai Kontraktor AI adalah
    // `/kontraktor` — rute yang dijaga penjaga ini juga — mengirimnya ke sana
    // berarti ditolak lagi, lalu dialihkan lagi, tanpa henti. Halaman paket
    // selalu boleh dibuka siapa pun yang login, jadi lingkarannya berhenti di
    // situ, dan memang di situlah kuncinya bisa dibuka.
    return <Navigate to={RUTA_LANGGANAN} replace state={{ upgradeNeeded: feature }} />
  }
  return <>{children}</>
}
