import { useState, useRef, useEffect } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Users, Webhook, Settings, LogOut,
  Home, Zap, Crown, Receipt, UserPlus, Menu, X,
  ChevronDown, User, Bell
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useRutaMasuk } from '@/hooks/useRutaMasuk'

const NAV_LINKS = [
  { id: 'dashboard', path: '/admin',          label: 'Dashboard',      icon: LayoutDashboard, bottomNav: true },
  { id: 'billing',   path: '/admin/billing',  label: 'AI Billing',     icon: Zap,             bottomNav: false },
  { id: 'plans',     path: '/admin/plans',    label: 'Katalog & Harga',icon: Crown,           bottomNav: true },
  { id: 'invoices',  path: '/admin/invoices', label: 'Invoice',        icon: Receipt,         bottomNav: true },
  { id: 'users',     path: '/admin/users',    label: 'Pelanggan',      icon: Users,           bottomNav: true },
  { id: 'employees', path: '/admin/staff',    label: 'Tim & Karyawan', icon: UserPlus,        bottomNav: false },
  { id: 'cms',       path: '/admin/cms',      label: 'Konten Website', icon: Webhook,         bottomNav: false },
  { id: 'settings',  path: '/admin/settings', label: 'Sistem & Fitur', icon: Settings,        bottomNav: false },
]

const BOTTOM_NAV = NAV_LINKS.filter(l => l.bottomNav)

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const beranda = useRutaMasuk()
  const { signOut, profile } = useAuthStore()
  const profileRef = useRef<HTMLDivElement>(null)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const currentPage = NAV_LINKS.find(l =>
    l.path === location.pathname || (l.path !== '/admin' && location.pathname.startsWith(l.path))
  )

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    <div className="flex bg-background min-h-screen">

      {/* ── DESKTOP SIDEBAR (hidden on mobile) ──────────────── */}
      <aside className="hidden lg:flex w-64 bg-navy text-white flex-col shrink-0 sticky top-0 h-screen">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0">
          <div className="font-serif font-bold text-lg tracking-wide text-gold">
            PropFS <span className="font-sans font-light text-white ml-1">Admin</span>
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto no-scrollbar">
          {NAV_LINKS.map(link => {
            const Icon = link.icon
            const isActive = location.pathname === link.path || (link.path !== '/admin' && location.pathname.startsWith(link.path))
            return (
              <Link
                key={link.id}
                to={link.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group ${
                  isActive ? 'bg-gold text-navy font-bold shadow-lg shadow-gold/20' : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-navy' : 'text-white/60 group-hover:text-white'}`} />
                <span className="truncate text-sm">{link.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mx-4 border-t border-white/10" />
        <div className="px-3 py-4 space-y-1">
          <Link to={beranda} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-colors text-sm">
            <Home className="h-5 w-5 shrink-0" /> Kembali ke App
          </Link>
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-sm">
            <LogOut className="h-5 w-5 shrink-0" /> Log Out
          </button>
        </div>
      </aside>

      {/* ── MOBILE DRAWER OVERLAY ───────────────────────────── */}
      {drawerOpen && (
        <div
          // z-[60]: tirainya harus di atas navigasi bawah — di sini navigasi
          // milik AdminLayout sendiri (z-40), yang dirender BELAKANGAN dan
          // karena itu menang pada nilai yang sama. Akibatnya bukan tampilan
          // yang salah, melainkan menu navigasi yang masih bisa ditekan di
          // balik tirai: laci dibuka, satu ketukan meleset, dan halamannya
          // berpindah ke tempat lain. Lihat lib/lapisan.ts.
          className="fixed inset-0 bg-black/50 z-[60] lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER ───────────────────────────────────── */}
      <aside className={`fixed top-0 left-0 h-full w-72 bg-navy text-white flex flex-col z-[61] transform transition-transform duration-300 lg:hidden ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Drawer Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/10 shrink-0">
          <div className="font-serif font-bold text-lg text-gold">
            PropFS <span className="font-sans font-light text-white ml-1">Admin</span>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Profile Mini in Drawer */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gold flex items-center justify-center text-navy font-bold text-sm shrink-0">
              {(profile?.full_name || 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{profile?.full_name || 'Administrator'}</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest">{profile?.role}</p>
            </div>
          </div>
        </div>

        {/* Drawer Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {NAV_LINKS.map(link => {
            const Icon = link.icon
            const isActive = location.pathname === link.path || (link.path !== '/admin' && location.pathname.startsWith(link.path))
            return (
              <Link
                key={link.id}
                to={link.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive ? 'bg-gold text-navy font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-navy' : ''}`} />
                <span className="text-sm">{link.label}</span>
                {link.bottomNav && (
                  <span className="ml-auto text-[9px] bg-white/10 px-2 py-0.5 rounded-full">Pinned</span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="mx-4 border-t border-white/10" />
        <div className="px-3 py-4 space-y-1">
          <Link to={beranda} className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:bg-white/10 hover:text-white text-sm transition-colors">
            <Home className="h-5 w-5" /> Kembali ke App
          </Link>
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 text-sm transition-colors">
            <LogOut className="h-5 w-5" /> Log Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">

        {/* ── TOP HEADER ──────────────────────────────────────── */}
        <header className="h-14 lg:h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 shrink-0 z-30 shadow-sm sticky top-0">
          {/* Left: hamburger + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Menu size={22} />
            </button>
            <div className="hidden lg:flex items-center gap-1 text-sm text-muted-foreground">
              <span className="font-semibold text-navy">Admin</span>
              {currentPage && (
                <>
                  <span>/</span>
                  <span className="font-bold text-foreground">{currentPage.label}</span>
                </>
              )}
            </div>
            <span className="lg:hidden font-bold text-navy text-sm">{currentPage?.label || 'Admin'}</span>
          </div>

          {/* Right: notification + profile dropdown */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <button className="relative p-2 rounded-xl hover:bg-slate-100 text-muted-foreground transition-colors">
              <Bell size={18} />
            </button>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-navy flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {(profile?.full_name || 'A')[0].toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-navy leading-tight">{profile?.full_name?.split(' ')[0] || 'Admin'}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{profile?.role}</p>
                </div>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Profile info */}
                  <div className="px-4 py-3 border-b border-border bg-slate-50">
                    <p className="text-sm font-bold text-navy">{profile?.full_name || 'Administrator'}</p>
                    <p className="text-xs text-muted-foreground">{profile?.email}</p>
                    <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest bg-navy text-gold px-2 py-0.5 rounded-full">
                      {profile?.role}
                    </span>
                  </div>

                  {/* Quick links */}
                  <div className="py-1.5">
                    <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-slate-50 transition-colors">
                      <LayoutDashboard size={15} className="text-muted-foreground" />
                      Dashboard
                    </Link>
                    <Link to="/admin/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-slate-50 transition-colors">
                      <Settings size={15} className="text-muted-foreground" />
                      Sistem & Fitur
                    </Link>
                    <Link to={beranda} className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-slate-50 transition-colors">
                      <Home size={15} className="text-muted-foreground" />
                      Kembali ke App
                    </Link>
                  </div>

                  <div className="border-t border-border py-1.5">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={15} />
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── PAGE CONTENT ──────────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-slate-50 pb-20 lg:pb-8">
          <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Outlet />
          </div>
        </div>
      </main>

      {/* ── BOTTOM TAB BAR (Mobile only) ──────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border shadow-lg">
        <div className="flex items-stretch">
          {BOTTOM_NAV.map(link => {
            const Icon = link.icon
            const isActive = location.pathname === link.path || (link.path !== '/admin' && location.pathname.startsWith(link.path))
            return (
              <Link
                key={link.id}
                to={link.path}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-colors ${
                  isActive ? 'text-navy' : 'text-muted-foreground hover:text-navy'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-navy/10' : ''}`}>
                  <Icon size={isActive ? 20 : 18} className={isActive ? 'text-navy' : ''} strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className={`text-[9px] font-bold leading-tight text-center ${isActive ? 'text-navy' : 'text-muted-foreground'}`}>
                  {link.label}
                </span>
                {isActive && <div className="w-1 h-1 rounded-full bg-navy mt-0.5" />}
              </Link>
            )
          })}
          {/* Settings shortcut */}
          <Link
            to="/admin/settings"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-colors ${
              location.pathname.startsWith('/admin/settings') ? 'text-navy' : 'text-muted-foreground'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${location.pathname.startsWith('/admin/settings') ? 'bg-navy/10' : ''}`}>
              <Settings size={location.pathname.startsWith('/admin/settings') ? 20 : 18} strokeWidth={location.pathname.startsWith('/admin/settings') ? 2.5 : 1.8} />
            </div>
            <span className={`text-[9px] font-bold ${location.pathname.startsWith('/admin/settings') ? 'text-navy' : 'text-muted-foreground'}`}>
              Sistem
            </span>
            {location.pathname.startsWith('/admin/settings') && <div className="w-1 h-1 rounded-full bg-navy mt-0.5" />}
          </Link>

          {/* More menu trigger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 text-muted-foreground"
          >
            <div className="p-1.5 rounded-xl">
              <Menu size={18} strokeWidth={1.8} />
            </div>
            <span className="text-[9px] font-bold">Lainnya</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
