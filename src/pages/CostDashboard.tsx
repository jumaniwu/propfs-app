import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calculator, LineChart, FileSpreadsheet, PackageOpen,
  ReceiptIcon, TrendingUp, Download, FolderPlus, Building2,
  RefreshCw, Trash2, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react'
import { useState, useMemo } from 'react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import RABUploader from '@/components/cost/RABUploader'
import EditableRABTable from '@/components/cost/EditableRABTable'
import TabMaterialSchedule from '@/components/cost/TabMaterialSchedule'
import TabRealisasiBiaya from '@/components/cost/TabRealisasiBiaya'
import TabKurvaS from '@/components/cost/TabKurvaS'
import CreateProjectModal from '@/components/cost/CreateProjectModal'
import CostProjectCard from '@/components/cost/CostProjectCard'
import WorkspaceSidebar, { WorkspaceTab } from '@/components/cost/WorkspaceSidebar'
import { useCostStore } from '@/store/costStore'
import { useAuthStore } from '@/store/authStore'

export default function CostDashboard() {
  const navigate = useNavigate()
  const { isFeatureEnabled } = useAuthStore()
  const {
    savedProjects, activePlan, projectInfo, realisasiEntries,
    updateActivePlanComponents, clearProject, loadProject,
    deleteProject, clearActivePlan
  } = useCostStore()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('rab')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [search, setSearch] = useState('')

  const filteredProjects = savedProjects.filter(p =>
    p.info.projectName.toLowerCase().includes(search.toLowerCase()) ||
    (p.info.location || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleOpenProject = (id: string) => {
    loadProject(id)
    setActiveTab('rab')
  }

  // ── KPI Computations — reads raw state slices so Zustand triggers re-renders ─
  const totalRAB = activePlan?.totalBaselineBudget ?? 0

  const totalRealisasi = useMemo(
    () => realisasiEntries.reduce((s, e) => s + e.jumlah, 0),
    [realisasiEntries]
  )

  const actualProgressPct = useMemo(() => {
    const components = activePlan?.components ?? []
    if (components.length === 0) return 0
    const totalBudget = components.reduce((s, c) => s + c.totalPlannedCost, 0)
    if (totalBudget === 0) return 0
    return components.reduce((s, c) => s + ((c.progressPercentage ?? 0) * c.totalPlannedCost), 0) / totalBudget
  }, [activePlan])

  const deviasiPct = useMemo(() => {
    if (totalRAB === 0) return 0
    const costPct = (totalRealisasi / totalRAB) * 100
    return parseFloat((costPct - actualProgressPct).toFixed(1))
  }, [totalRAB, totalRealisasi, actualProgressPct])

  const isOverBudget = deviasiPct > 0

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* ── STATE 1: No project → Dashboard Mode ── */}
      {!projectInfo && (
        <main className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <button onClick={() => navigate('/home')}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ArrowLeft className="h-4 w-4" /> Kembali ke Portal
              </button>
              <h1 className="font-serif text-3xl font-bold">Dashboard Cost Control</h1>
              <p className="text-muted-foreground mt-1 text-sm">{savedProjects.length} proyek tersimpan</p>
            </div>
            <Button className="bg-navy text-white hover:bg-navy/90 font-bold gap-2" onClick={() => setShowCreateModal(true)}>
              <FolderPlus className="h-4 w-4" /> Buat Proyek Baru
            </Button>
          </div>

          {savedProjects.length === 0 ? (
            <div className="bg-white border border-border rounded-3xl p-16 text-center shadow-sm">
              <div className="w-20 h-20 bg-navy/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FolderPlus className="h-10 w-10 text-navy" />
              </div>
              <h2 className="font-serif text-2xl font-bold mb-3">Mulai dengan Proyek Baru</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8 text-sm leading-relaxed">
                Buat proyek konstruksi terlebih dahulu untuk mulai mengelola RAB, Material Schedule, Realisasi Biaya, dan Kurva S.
              </p>
              <Button className="bg-navy hover:bg-navy/90 text-white font-bold gap-2 px-8 py-6 text-base shadow-xl shadow-navy/20"
                onClick={() => setShowCreateModal(true)}>
                <FolderPlus className="h-5 w-5" /> Buat Proyek Baru
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map(proj => (
                <CostProjectCard key={proj.info.id} project={proj} onOpen={handleOpenProject}
                  onDelete={id => {
                    if (window.confirm('Yakin ingin menghapus proyek ini?')) deleteProject(id)
                  }}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {/* ── STATE 2: Project open, no RAB yet ── */}
      {projectInfo && !activePlan && (
        <main className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <button onClick={() => clearProject()}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
              </button>
              <h1 className="font-serif text-3xl font-bold">Workspace Proyek</h1>
              <p className="text-muted-foreground text-sm mt-1">
                <Building2 className="inline h-3.5 w-3.5 mr-1" />
                {projectInfo.projectName}{projectInfo.location && ` · ${projectInfo.location}`}
              </p>
            </div>
            <Button onClick={() => clearProject()} className="bg-navy text-white hover:bg-navy/90 font-bold px-6">
              Simpan & Kembali
            </Button>
          </div>
          {/* KPI bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <KpiCard title="Total Anggaran (RAB)" value="Rp 0" icon={<Calculator className="h-5 w-5 text-blue-600" />} />
            <KpiCard title="Realisasi Biaya" value="Rp 0" icon={<ReceiptIcon className="h-5 w-5 text-orange-600" />} />
            <KpiCard title="Deviasi Progress" value="0%" icon={<LineChart className="h-5 w-5 text-emerald-600" />} />
          </div>
          <RABUploader />
        </main>
      )}

      {/* ── STATE 3: Project + RAB loaded → Sidebar layout ── */}
      {projectInfo && activePlan && (
        <div className="flex relative">
          {/* Sidebar */}
          <WorkspaceSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Main Content */}
          <main className="flex-1 min-w-0 px-4 md:px-8 py-6 pb-20 md:pb-6">
            {/* Workspace Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <button onClick={() => clearProject()}
                  className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-1">
                  <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
                </button>
                <h1 className="font-serif text-2xl font-bold">Workspace Proyek</h1>
                <p className="text-muted-foreground text-xs mt-0.5">
                  <Building2 className="inline h-3 w-3 mr-1" />
                  {projectInfo.projectName}{projectInfo.location && ` · ${projectInfo.location}`}
                </p>
              </div>
              <Button onClick={() => clearProject()} className="bg-navy text-white hover:bg-navy/90 font-bold px-6 shadow-md">
                Simpan & Kembali
              </Button>
            </div>

            {/* ── KPI Cards (real-time) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {/* Total RAB */}
              <KpiCard
                title="Total Anggaran (RAB)"
                value={`Rp ${totalRAB.toLocaleString('id-ID')}`}
                icon={<Calculator className="h-5 w-5 text-blue-600" />}
              />
              {/* Realisasi Biaya — real-time from realisasiEntries */}
              <KpiCard
                title="Realisasi Biaya"
                value={`Rp ${totalRealisasi.toLocaleString('id-ID')}`}
                icon={<ReceiptIcon className="h-5 w-5 text-orange-600" />}
                sub={totalRAB > 0 ? `${((totalRealisasi / totalRAB) * 100).toFixed(1)}% dari RAB` : undefined}
              />
              {/* Deviasi Progress */}
              <KpiCard
                title="Deviasi Progress"
                value={`${deviasiPct >= 0 ? '+' : ''}${deviasiPct}%`}
                icon={
                  deviasiPct > 0
                    ? <ArrowUpRight className="h-5 w-5 text-red-500" />
                    : deviasiPct < 0
                    ? <ArrowDownRight className="h-5 w-5 text-emerald-600" />
                    : <Minus className="h-5 w-5 text-muted-foreground" />
                }
                sub={
                  deviasiPct > 0
                    ? `⚠️ Cost Overrun vs Progress ${actualProgressPct.toFixed(1)}%`
                    : deviasiPct < 0
                    ? `✅ Under Budget · Progress ${actualProgressPct.toFixed(1)}%`
                    : `Progress ${actualProgressPct.toFixed(1)}%`
                }
                highlight={deviasiPct > 0 ? 'red' : deviasiPct < 0 ? 'green' : undefined}
              />
            </div>

            {/* ── Tab Content ── */}
            <div className="bg-white border border-border rounded-3xl shadow-sm overflow-hidden">
              <div className="p-6 md:p-8">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-serif font-bold text-navy">Dashboard Proyek</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="bg-muted/30 rounded-2xl p-5 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Info Proyek</p>
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-border/40">
                            {[
                              ['Nama Proyek', projectInfo.projectName],
                              ['Lokasi', projectInfo.location || '-'],
                              ['Pemilik', projectInfo.owner || '-'],
                              ['Tipe', projectInfo.type || '-'],
                              ['Mulai', projectInfo.startDate || '-'],
                              ['Target Durasi', `${projectInfo.targetDurationMonths} Bulan`],
                            ].map(([k, v]) => (
                              <tr key={k}>
                                <td className="py-1.5 text-muted-foreground w-32">{k}</td>
                                <td className="py-1.5 font-medium">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-muted/30 rounded-2xl p-5 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ringkasan Anggaran</p>
                        {[
                          { label: 'Total RAB', val: totalRAB, pct: 100, color: 'bg-navy' },
                          { label: 'Realisasi Biaya', val: totalRealisasi, pct: totalRAB > 0 ? (totalRealisasi / totalRAB) * 100 : 0, color: 'bg-orange-400' },
                        ].map(r => (
                          <div key={r.label}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">{r.label}</span>
                              <span className="font-bold">Rp {r.val.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className={`h-2 rounded-full transition-all ${r.color}`} style={{ width: `${Math.min(r.pct, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground">Progress Fisik Aktual</p>
                          <p className="text-2xl font-bold text-navy mt-1">{actualProgressPct.toFixed(1)}%</p>
                          <div className="w-full bg-muted rounded-full h-2 mt-2">
                            <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${actualProgressPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* RAB Tab */}
                {activeTab === 'rab' && isFeatureEnabled('cost_rab') && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-serif font-bold text-navy">Data RAB Proyek</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                          {activePlan.components.length} item pekerjaan · Klik ✏️ untuk edit nilai secara manual.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => clearActivePlan()} className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50">
                          <RefreshCw className="w-4 h-4" /> Upload Ulang
                        </Button>
                        <Button variant="outline" className="gap-2">
                          <Download className="w-4 h-4" /> Export
                        </Button>
                      </div>
                    </div>
                    <EditableRABTable data={activePlan.components} onDataChange={updateActivePlanComponents} />
                  </div>
                )}

                {activeTab === 'material' && <TabMaterialSchedule />}
                {activeTab === 'realisasi' && <TabRealisasiBiaya />}
                {activeTab === 'kurva_s' && <TabKurvaS />}

                {/* Laporan & Export */}
                {activeTab === 'laporan' && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-serif font-bold text-navy">Laporan & Export</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { label: 'Export RAB ke Excel', desc: 'Daftar pekerjaan + harga satuan + total', icon: <FileSpreadsheet className="w-6 h-6" /> },
                        { label: 'Export Realisasi Biaya', desc: 'Laporan material + upah dari AI Assistant', icon: <ReceiptIcon className="w-6 h-6" /> },
                        { label: 'Export Material Schedule', desc: 'Kebutuhan + status + realisasi pembelian', icon: <PackageOpen className="w-6 h-6" /> },
                        { label: 'Export Kurva S', desc: 'Distribusi anggaran rencana vs aktual', icon: <TrendingUp className="w-6 h-6" /> },
                      ].map(r => (
                        <div key={r.label} className="bg-muted/30 border border-border rounded-2xl p-5 flex items-center gap-4">
                          <div className="w-12 h-12 bg-navy/10 rounded-xl flex items-center justify-center text-navy">{r.icon}</div>
                          <div>
                            <p className="font-semibold text-sm">{r.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 Gunakan tombol Export di masing-masing tab (RAB, Material Schedule, Realisasi, Kurva S) untuk mengunduh data spesifik.
                    </p>
                  </div>
                )}

                {/* Pengaturan */}
                {activeTab === 'settings' && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-serif font-bold text-navy">Pengaturan Proyek</h2>
                    <div className="bg-muted/30 rounded-2xl p-5 space-y-2 max-w-md">
                      <p className="text-sm font-semibold mb-3">Info Proyek</p>
                      {[
                        ['Nama', projectInfo.projectName],
                        ['Lokasi', projectInfo.location || '-'],
                        ['Pemilik', projectInfo.owner || '-'],
                        ['Tipe', projectInfo.type],
                        ['Mulai', projectInfo.startDate],
                        ['Durasi Target', `${projectInfo.targetDurationMonths} Bulan`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1.5 border-b border-border/40 text-sm">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 border-t border-border">
                      <p className="text-sm font-semibold text-red-600 mb-2">Zona Berbahaya</p>
                      <Button variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { if (window.confirm('Hapus proyek ini?')) deleteProject(projectInfo.id) }}>
                        <Trash2 className="w-4 h-4" /> Hapus Proyek Ini
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal onClose={() => setShowCreateModal(false)} onCreated={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string
  value: string
  icon: React.ReactNode
  sub?: string
  highlight?: 'red' | 'green'
}

function KpiCard({ title, value, icon, sub, highlight }: KpiCardProps) {
  return (
    <div className={`border rounded-2xl p-5 shadow-sm transition-colors ${
      highlight === 'red' ? 'bg-red-50 border-red-200' :
      highlight === 'green' ? 'bg-emerald-50 border-emerald-200' :
      'bg-card border-border'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">{icon}</div>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <div className={`text-2xl font-bold ${
        highlight === 'red' ? 'text-red-700' :
        highlight === 'green' ? 'text-emerald-700' :
        ''
      }`}>{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
