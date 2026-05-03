import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Moon, Sun, Home, ChevronRight, User, CreditCard, LogOut, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFSStore } from '@/store/fsStore'
import { useAuthStore } from '@/store/authStore'
import PlanBadge from '@/components/subscription/PlanBadge'

interface HeaderProps {
  breadcrumbs?: Array<{ label: string; href?: string }>
  actions?: React.ReactNode
}

export default function Header({ breadcrumbs, actions }: HeaderProps) {
  const navigate   = useNavigate()
  const location   = useLocation()
  const isDarkMode = useFSStore(s => s.isDarkMode)
  const toggleDark = useFSStore(s => s.toggleDarkMode)

  const { user, profile, signOut, landingContent } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isPortalHome = location.pathname === '/home'

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [menuOpen])

  async function handleSignOut() {
    try {
      setMenuOpen(false)
      await signOut()
    } finally {
      navigate('/auth')
    }
  }

  const initials = (profile?.full_name ?? user?.email ?? 'U')
    .charAt(0).toUpperCase()
  const isSuperAdmin = profile?.role === 'superadmin'

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        {/* Left: Logo + Breadcrumbs */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          >
            {landingContent.branding.logoUrl ? (
              <img src={landingContent.branding.logoUrl} alt={landingContent.branding.siteName} className="h-8 w-auto" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
                <span className="text-gold font-serif font-bold text-sm">P</span>
              </div>
            )}
            <span className="font-serif font-semibold text-navy dark:text-gold hidden sm:block">
              {landingContent.branding.siteName}
            </span>
          </button>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              {breadcrumbs.map((crumb, i) => (
                <div key={i} className="flex items-center gap-1 min-w-0">
                  {crumb.href ? (
                    <button
                      onClick={() => crumb.href && navigate(crumb.href)}
                      className="hover:text-foreground transition-colors truncate max-w-[160px]"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-foreground font-medium truncate max-w-[160px]">
                      {crumb.label}
                    </span>
                  )}
                  {i < breadcrumbs.length - 1 && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                </div>
              ))}
            </nav>
          )}

        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {actions}
          {!isPortalHome && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/home')} className="hidden sm:flex gap-1.5">
              <Home className="h-4 w-4" />
              <span>Portal</span>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Toggle dark mode">
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* User Avatar Dropdown */}
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-muted transition-colors"
                aria-label="User menu"
              >
                <div className="w-7 h-7 rounded-lg bg-navy dark:bg-gold flex items-center justify-center shrink-0">
                  <span className="font-serif font-bold text-white dark:text-navy text-xs">{initials}</span>
                </div>
                <PlanBadge className="hidden sm:inline-flex" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-sm font-medium truncate">{profile?.full_name || user.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <MenuItem icon={<User className="h-4 w-4" />}       label="Profil Saya"   onClick={() => { setMenuOpen(false); navigate('/profile') }} />
                    <MenuItem icon={<CreditCard className="h-4 w-4" />} label="Paket & Harga" onClick={() => { setMenuOpen(false); navigate('/pricing') }} />
                    {isSuperAdmin && (
                      <MenuItem icon={<Shield className="h-4 w-4" />} label="Admin Panel" onClick={() => { setMenuOpen(false); navigate('/admin') }} className="text-gold" />
                    )}
                  </div>
                  <div className="border-t border-border py-1">
                    <MenuItem icon={<LogOut className="h-4 w-4" />} label="Keluar" onClick={handleSignOut} className="text-destructive" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function MenuItem({ icon, label, onClick, className = '' }: {
  icon: React.ReactNode; label: string; onClick: () => void; className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left ${className}`}
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  )
}
