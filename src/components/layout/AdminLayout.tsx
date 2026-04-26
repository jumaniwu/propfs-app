import { useState } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { LayoutDashboard, Users, Webhook, Settings, LogOut, PanelLeftClose, PanelLeft, Home, Zap, Crown, Receipt } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { id: 'dashboard', path: '/admin',         label: 'Dashboard Stats', icon: LayoutDashboard },
  { id: 'billing',   path: '/admin/billing', label: 'AI Billing',      icon: Zap },
  { id: 'plans',     path: '/admin/plans',   label: 'Paket Berlangganan',icon: Crown },
  { id: 'invoices',  path: '/admin/invoices',label: 'Invoice',         icon: Receipt },
  { id: 'users',     path: '/admin/users',   label: 'Pengguna',        icon: Users },
  { id: 'cms',       path: '/admin/cms',     label: 'Konten Website',  icon: Webhook },
  { id: 'settings',  path: '/admin/settings',label: 'Sistem & Fitur',  icon: Settings },
]

export default function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, profile } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex bg-background min-h-screen">
      {/* Sidebar */}
      <aside className={`bg-navy text-white flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'} relative z-20`}>
        {/* Header / Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
          {isSidebarOpen ? (
            <div className="font-serif font-bold text-lg tracking-wide text-gold">PropFS <span className="font-sans font-light text-white ml-1">Admin</span></div>
          ) : (
            <div className="font-serif font-bold text-xl text-gold mx-auto">P</div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white/50 hover:text-white absolute -right-3 top-5 bg-navy border border-white/20 rounded-full p-1 lg:hidden">
            {isSidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto overflow-x-hidden no-scrollbar">
          {NAV_LINKS.map(link => {
            const Icon = link.icon
            const isActive = location.pathname === link.path || (link.path !== '/admin' && location.pathname.startsWith(link.path))
            return (
              <Link 
                key={link.id} 
                to={link.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                  isActive ? 'bg-gold text-navy font-bold shadow-lg shadow-gold/20' : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
                title={link.label}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-navy' : 'text-white/60 group-hover:text-white'}`} />
                {isSidebarOpen && <span className="truncate">{link.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="mx-4 border-t border-white/10 my-4" />

        {/* Bottom Menu */}
        <div className="px-3 pb-6 space-y-2">
           <Link 
              to="/home"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-white/60 hover:bg-white/10 hover:text-white"
              title="Aplikasi Utama"
            >
              <Home className="h-5 w-5 shrink-0" />
              {isSidebarOpen && <span>Kembali ke App</span>}
            </Link>

           <button 
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-red-400 hover:bg-red-500/10 hover:text-red-300"
              title="Keluar"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {isSidebarOpen && <span>Log Out</span>}
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
           <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-muted-foreground hover:text-foreground hidden lg:block">
                {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
              </button>
              <h2 className="font-semibold text-foreground/80 hidden sm:block">Control Center</h2>
           </div>
           <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                 <p className="text-sm font-bold text-navy">{profile?.full_name || 'Administrator'}</p>
                 <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{profile?.role}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-navy flex items-center justify-center text-white font-bold text-sm">
                {(profile?.full_name || 'A')[0]}
              </div>
           </div>
        </header>

        {/* Page Content wrapped in scrollable area */}
        <div className="flex-1 overflow-auto bg-slate-50 relative p-6">
           <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
             <Outlet />
           </div>
        </div>
      </main>
    </div>
  )
}
