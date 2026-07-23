/**
 * Navigasi bawah ala aplikasi mobile (hanya tampil di layar < lg).
 * Semua modul utama bisa dijangkau satu ketukan; tidak mengubah routing
 * yang ada — hanya memanggil navigate() ke path yang sudah terdaftar.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Calculator, Map, BarChart3, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface NavItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** path lain yang juga dianggap aktif untuk item ini */
  match: string[]
}

const NAV_ITEMS: NavItem[] = [
  { path: '/home', label: 'Beranda', icon: Home, match: ['/home'] },
  { path: '/dashboard', label: 'Feasibility', icon: Calculator, match: ['/dashboard', '/input', '/result', '/report'] },
  { path: '/siteplan', label: 'AI Architect', icon: Map, match: ['/siteplan'] },
  { path: '/cost-control', label: 'Kontraktor AI', icon: BarChart3, match: ['/cost-control', '/cost-report'] },
  { path: '/profile', label: 'Profil', icon: User, match: ['/profile', '/pricing', '/payment'] },
]

// Halaman tanpa bottom nav: landing, auth, legal, reset password, admin
const HIDDEN_PREFIXES = ['/auth', '/legal', '/reset-password', '/admin']

export function useBottomNavVisible(): boolean {
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  if (!user) return false
  if (location.pathname === '/') return false
  return !HIDDEN_PREFIXES.some(p => location.pathname.startsWith(p))
}

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const visible = useBottomNavVisible()
  if (!visible) return null

  return (
    <>
      {/* spacer agar konten halaman tidak tertutup nav yang fixed */}
      <div aria-hidden className="h-16 lg:hidden" />
      <nav
        aria-label="Navigasi utama"
        className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-white dark:bg-navy border-t border-border shadow-[0_-2px_10px_rgba(13,27,42,0.08)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS.map(item => {
            const active = item.match.some(m => location.pathname.startsWith(m))
            const Icon = item.icon
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-gold' : 'text-muted-foreground hover:text-navy dark:hover:text-cream'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
