import { useState, useEffect } from 'react'
import {
  LayoutDashboard, FileSpreadsheet, PackageOpen, ReceiptIcon,
  TrendingUp, FileDown, Settings2, ChevronLeft, ChevronRight,
  Building2, X, Menu
} from 'lucide-react'
import { useCostStore } from '@/store/costStore'
import { useAuthStore } from '@/store/authStore'

import { AppFeature } from '@/lib/supabase'

export type WorkspaceTab = 'overview' | 'rab' | 'material' | 'realisasi' | 'kurva_s' | 'laporan' | 'settings'

interface SidebarItem {
  key: WorkspaceTab
  label: string
  icon: React.ReactNode
  feature?: AppFeature
  disabled?: boolean
}

interface WorkspaceSidebarProps {
  activeTab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
}

const NAV_ITEMS: SidebarItem[] = [
  { key: 'overview',   label: 'Dashboard Proyek',   icon: <LayoutDashboard className="w-5 h-5" /> },
  { key: 'rab',        label: 'RAB Proyek',          icon: <FileSpreadsheet className="w-5 h-5" />, feature: 'cost_rab' },
  { key: 'material',   label: 'Material Schedule',   icon: <PackageOpen className="w-5 h-5" />,    feature: 'cost_material' },
  { key: 'realisasi',  label: 'Realisasi Biaya',     icon: <ReceiptIcon className="w-5 h-5" />,    feature: 'cost_realisasi' },
  { key: 'kurva_s',    label: 'Kurva S & Progress',  icon: <TrendingUp className="w-5 h-5" />,     feature: 'scurve' },
  { key: 'laporan',    label: 'Laporan & Export',    icon: <FileDown className="w-5 h-5" /> },
  { key: 'settings',   label: 'Pengaturan Proyek',   icon: <Settings2 className="w-5 h-5" /> },
]

// ── Mobile Bottom Nav (shows 5 main items) ──
const MOBILE_ITEMS: WorkspaceTab[] = ['overview', 'rab', 'realisasi', 'kurva_s', 'laporan']

export default function WorkspaceSidebar({ activeTab, onTabChange }: WorkspaceSidebarProps) {
  const { isFeatureEnabled } = useAuthStore()
  const { projectInfo } = useCostStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on tab change
  useEffect(() => { setMobileOpen(false) }, [activeTab])

  const isItemVisible = (item: SidebarItem) => {
    if (!item.feature) return true
    return isFeatureEnabled(item.feature)
  }

  const visibleItems = NAV_ITEMS.filter(isItemVisible)
  const mobileNavItems = visibleItems.filter(i => MOBILE_ITEMS.includes(i.key))

  return (
    <>
      {/* ══ DESKTOP SIDEBAR ══════════════════════════════════════════════ */}
      <aside
        className={`
          hidden md:flex flex-col shrink-0 bg-white border-r border-border
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[64px]' : 'w-[240px]'}
        `}
        style={{ minHeight: 'calc(100vh - 56px)' }}
      >
        {/* Project Info Header */}
        {!collapsed && (
          <div className="px-4 pt-5 pb-3 border-b border-border">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-3.5 h-3.5 text-navy shrink-0" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                {projectInfo?.type || 'Proyek'}
              </p>
            </div>
            <p className="font-bold text-navy text-sm truncate">{projectInfo?.projectName}</p>
            {projectInfo?.location && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{projectInfo.location}</p>
            )}
          </div>
        )}
        {collapsed && (
          <div className="flex items-center justify-center py-5 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map(item => {
            const isActive = activeTab === item.key
            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                title={collapsed ? item.label : undefined}
                className={`
                  relative w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium
                  transition-all duration-150 text-left group
                  ${isActive
                    ? 'bg-navy/8 text-navy'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }
                `}
              >
                {/* Active indicator — left border */}
                {isActive && (
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-navy rounded-r-full" />
                )}
                <span className={`shrink-0 transition-colors ${isActive ? 'text-navy' : 'text-muted-foreground group-hover:text-foreground'}`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {/* Tooltip when collapsed */}
                {collapsed && (
                  <span className="absolute left-full ml-2 z-50 px-2 py-1 bg-navy text-white text-xs rounded-lg whitespace-nowrap
                    opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg">
                    {item.label}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => setCollapsed(v => !v)}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs font-medium"
            title={collapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <><ChevronLeft className="w-4 h-4" /><span>Ciutkan</span></>
            }
          </button>
        </div>
      </aside>

      {/* ══ MOBILE: Hamburger + Drawer ════════════════════════════════════ */}
      {/* Hamburger Button (top left, shown on mobile only) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-[62px] left-3 z-30 w-9 h-9 bg-white border border-border rounded-xl flex items-center justify-center shadow-sm"
        aria-label="Buka Menu"
      >
        <Menu className="w-4 h-4 text-navy" />
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`
          md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 bg-white shadow-2xl
          transform transition-transform duration-300 ease-out flex flex-col
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border bg-navy text-white">
          <div>
            <p className="font-bold text-sm">{projectInfo?.projectName}</p>
            <p className="text-white/60 text-xs mt-0.5">{projectInfo?.location}</p>
          </div>
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Nav */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map(item => {
            const isActive = activeTab === item.key
            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                className={`
                  relative w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium
                  transition-all text-left
                  ${isActive
                    ? 'bg-navy/8 text-navy'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }
                `}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-navy rounded-r-full" />
                )}
                <span className={isActive ? 'text-navy' : 'text-muted-foreground'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* ══ MOBILE BOTTOM NAV BAR ════════════════════════════════════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border flex safe-bottom">
        {mobileNavItems.map(item => {
          const isActive = activeTab === item.key
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-1 py-2.5
                min-h-[56px] transition-colors text-[10px] font-semibold
                ${isActive ? 'text-navy' : 'text-muted-foreground'}
              `}
            >
              <span className={`transition-transform ${isActive ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className="truncate max-w-[60px] text-center">{item.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
