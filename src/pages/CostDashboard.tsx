import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calculator, LineChart, FileSpreadsheet, PackageOpen, ReceiptIcon, TrendingUp, Download, FolderPlus, Building2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import RABUploader from '@/components/cost/RABUploader'
import EditableRABTable from '@/components/cost/EditableRABTable'
import TabMaterialSchedule from '@/components/cost/TabMaterialSchedule'
import TabRealisasiBiaya from '@/components/cost/TabRealisasiBiaya'
import TabKurvaS from '@/components/cost/TabKurvaS'
import CreateProjectModal from '@/components/cost/CreateProjectModal'
import CostProjectCard from '@/components/cost/CostProjectCard'
import { useCostStore } from '@/store/costStore'
import { useAuthStore } from '@/store/authStore'
// using native or just a simpler approach, actually I will just use standard confirm for delete for now or a dialog
import { Trash2 } from 'lucide-react'

type TabKey = 'rab' | 'material' | 'realisasi' | 'kurva_s'

export default function CostDashboard() {
  const navigate = useNavigate()
  const { isFeatureEnabled } = useAuthStore()
  const { savedProjects, activePlan, projectInfo, updateActivePlanComponents, clearProject, loadProject, deleteProject, clearActivePlan } = useCostStore()
  const [activeTab, setActiveTab] = useState<TabKey>('rab')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [search, setSearch] = useState('')

  // Filter projects for dashboard view
  const filteredProjects = savedProjects.filter(p => 
    p.info.projectName.toLowerCase().includes(search.toLowerCase()) || 
    (p.info.location || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleOpenProject = (id: string) => {
    loadProject(id)
    setActiveTab('rab')
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Page Header (Mode Dashboard ATAU Workspace) */}
        {!projectInfo ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <button
                onClick={() => navigate('/home')}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ArrowLeft className="h-4 w-4" /> Kembali ke Portal
              </button>
              <h1 className="font-serif text-3xl font-bold">Dashboard Cost Control</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {savedProjects.length} proyek tersimpan
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                className="bg-navy text-white hover:bg-navy/90 font-bold gap-2"
                onClick={() => setShowCreateModal(true)}
              >
                <FolderPlus className="h-4 w-4" /> Buat Proyek Baru
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-8">
            <div>
              <button
                onClick={() => clearProject()}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
              </button>
              <h1 className="font-serif text-3xl font-bold">Workspace Proyek</h1>
              <p className="text-muted-foreground text-sm mt-1">
                <Building2 className="inline h-3.5 w-3.5 mr-1" />
                {projectInfo.projectName}
                {projectInfo.location && ` · ${projectInfo.location}`}
              </p>
            </div>
            <div>
              <Button onClick={() => clearProject()} className="bg-navy text-white hover:bg-navy/90 font-bold px-6 shadow-md transition-all">
                Simpan & Kembali
              </Button>
            </div>
          </div>
        )}

        {/* === STATE 1: Belum ada proyek dipilih (DASHBOARD MODE) === */}
        {!projectInfo && (
          <>
            {savedProjects.length === 0 ? (
              <div className="bg-white border border-border rounded-3xl p-16 text-center shadow-sm">
                <div className="w-20 h-20 bg-navy/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <FolderPlus className="h-10 w-10 text-navy" />
                </div>
                <h2 className="font-serif text-2xl font-bold mb-3">Mulai dengan Proyek Baru</h2>
                <p className="text-muted-foreground max-w-md mx-auto mb-8 text-sm leading-relaxed">
                  Buat proyek konstruksi terlebih dahulu untuk mulai mengelola RAB, Material Schedule, Realisasi Biaya, dan Kurva S.
                </p>
                <Button
                  className="bg-navy hover:bg-navy/90 text-white font-bold gap-2 px-8 py-6 text-base shadow-xl shadow-navy/20"
                  onClick={() => setShowCreateModal(true)}
                >
                  <FolderPlus className="h-5 w-5" /> Buat Proyek Baru
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(proj => (
                  <CostProjectCard
                    key={proj.info.id}
                    project={proj}
                    onOpen={handleOpenProject}
                    onDelete={(id) => {
                      if (window.confirm('Yakin ingin menghapus proyek ini? (Aksi tidak dapat dibatalkan)')) {
                        deleteProject(id)
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* === STATE 2: Proyek sudah dibuat, belum ada RAB === */}
        {projectInfo && !activePlan && (
          <>
            {/* KPI Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard title="Total Anggaran (RAB)" value="Rp 0" icon={<Calculator className="h-5 w-5 text-blue-600" />} />
              <StatCard title="Realisasi Biaya" value="Rp 0" icon={<ReceiptIcon className="h-5 w-5 text-orange-600" />} />
              <StatCard title="Deviasi Progress" value="0%" icon={<LineChart className="h-5 w-5 text-emerald-600" />} />
            </div>
            <RABUploader />
          </>
        )}

        {/* === STATE 3: Proyek + RAB sudah ada → Tampilkan Tab === */}
        {projectInfo && activePlan && (
          <>
            {/* KPI Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard
                title="Total Anggaran (RAB)"
                value={`Rp ${activePlan.totalBaselineBudget.toLocaleString('id-ID')}`}
                icon={<Calculator className="h-5 w-5 text-blue-600" />}
              />
              <StatCard title="Realisasi Biaya" value="Rp 0" icon={<ReceiptIcon className="h-5 w-5 text-orange-600" />} />
              <StatCard title="Deviasi Progress" value="0%" icon={<LineChart className="h-5 w-5 text-emerald-600" />} />
            </div>

            {/* Tabbed Panel */}
            <div className="bg-white border border-border rounded-3xl shadow-sm overflow-hidden">
              <div className="flex border-b border-border bg-muted/20 px-4 pt-4 overflow-x-auto">
                {isFeatureEnabled('cost_rab') && (
                  <TabButton active={activeTab === 'rab'} onClick={() => setActiveTab('rab')} icon={<FileSpreadsheet className="w-4 h-4" />}>
                    RAB Proyek
                  </TabButton>
                )}
                {isFeatureEnabled('cost_material') && (
                  <TabButton active={activeTab === 'material'} onClick={() => setActiveTab('material')} icon={<PackageOpen className="w-4 h-4" />}>
                    Material Schedule
                  </TabButton>
                )}
                {isFeatureEnabled('cost_realisasi') && (
                  <TabButton active={activeTab === 'realisasi'} onClick={() => setActiveTab('realisasi')} icon={<ReceiptIcon className="w-4 h-4" />}>
                    Realisasi Biaya
                  </TabButton>
                )}
                {isFeatureEnabled('scurve') && (
                  <TabButton active={activeTab === 'kurva_s'} onClick={() => setActiveTab('kurva_s')} icon={<TrendingUp className="w-4 h-4" />}>
                    Kurva S
                  </TabButton>
                )}
              </div>

              <div className="p-8">
                {activeTab === 'rab' && (
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
                    <EditableRABTable
                      data={activePlan.components}
                      onDataChange={updateActivePlanComponents}
                    />
                  </div>
                )}
                {activeTab === 'material' && <TabMaterialSchedule />}
                {activeTab === 'realisasi' && <TabRealisasiBiaya />}
                {activeTab === 'kurva_s' && <TabKurvaS />}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

interface TabButtonProps {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
}

function TabButton({ children, active, onClick, icon }: TabButtonProps) {
  const base = 'flex items-center gap-2 px-5 py-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap'
  const activeStyle = 'border-navy text-navy bg-white rounded-t-lg'
  const inactiveStyle = 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/50'
  return (
    <button onClick={onClick} className={[base, active ? activeStyle : inactiveStyle].join(' ')}>
      {icon}{children}
    </button>
  )
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">{icon}</div>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}
