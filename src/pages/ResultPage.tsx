import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Edit, Printer, Download, RefreshCw, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import Header from '@/components/layout/Header'
import KPICards from '@/components/outputs/KPICards'
import TabRingkasan from '@/components/outputs/TabRingkasan'
import TabStrukturBiaya from '@/components/outputs/TabStrukturBiaya'
import TabProyeksiPendapatan from '@/components/outputs/TabProyeksiPendapatan'
import TabCashFlow from '@/components/outputs/TabCashFlow'
import TabBagiHasil from '@/components/outputs/TabBagiHasil'
import TabSensitivitas from '@/components/outputs/TabSensitivitas'
import SubscriptionGate from '@/components/subscription/SubscriptionGate'
import { useFSStore } from '@/store/fsStore'
import { exportToJSON } from '@/utils/export'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from '@/hooks/use-toast'

export default function ResultPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tabValue, setTabValue] = useState('ringkasan')

  const projects         = useFSStore(s => s.projects)
  const currentProjectId = useFSStore(s => s.currentProjectId)
  const currentInputs    = useFSStore(s => s.currentInputs)
  const currentResults   = useFSStore(s => s.currentResults)
  const loadProject      = useFSStore(s => s.loadProject)
  const calculate        = useFSStore(s => s.calculate)

  const { canAccessCashflow, canAccessARAP, needsUpgradeForCashflow, isSubscriptionEnabled } = useSubscription()

  // Load project if needed
  useEffect(() => {
    if (id && id !== currentProjectId) {
      const project = projects.find(p => p.id === id)
      if (project) {
        loadProject(id)
      } else {
        navigate('/', { replace: true })
      }
    }
  }, [id])

  // Auto-calculate if results missing
  useEffect(() => {
    if (currentProjectId && !currentResults && currentInputs.tipeBangunan.length > 0) {
      try { calculate() } catch { /* ignore */ }
    }
  }, [currentProjectId, currentResults])

  function handleRecalculate() {
    try {
      calculate()
      toast({ title: 'Kalkulasi diperbarui', variant: 'success' as any })
    } catch {
      toast({ title: 'Error kalkulasi', variant: 'destructive' })
    }
  }

  function handleExportJSON() {
    const project = projects.find(p => p.id === (id || currentProjectId))
    if (project) {
      exportToJSON(project)
      toast({ title: 'JSON berhasil diexport', variant: 'success' as any })
    }
  }

  // Tab config: which tabs need Pro
  const TABS = [
    { value: 'ringkasan',    label: 'Ringkasan',         requiredPlan: null    },
    { value: 'biaya',        label: 'Struktur Biaya',    requiredPlan: null    },
    { value: 'pendapatan',   label: 'Proyeksi Pendapatan', requiredPlan: null  },
    { value: 'cashflow',     label: 'Cash Flow',         requiredPlan: 'pro' as const },
    { value: 'bagihasil',    label: 'Bagi Hasil',        requiredPlan: null    },
    { value: 'sensitivitas', label: 'Sensitivitas',      requiredPlan: 'basic' as const },
  ] as const

  // No results
  if (!currentResults) {
    return (
      <div className="min-h-screen bg-background">
        <Header breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Hasil FS' }]} />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
          <div className="text-4xl">📊</div>
          <h2 className="font-serif text-xl font-semibold">Belum Ada Hasil Kalkulasi</h2>
          <p className="text-muted-foreground text-sm">
            Lengkapi data input dan klik "Hitung Feasibility Study" untuk melihat hasil.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/')}>Dashboard</Button>
            <Button variant="gold" onClick={() => navigate(`/input/${id || currentProjectId}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Lengkapi Data Input
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const r = currentResults
  const projectName = currentInputs.namaProyek || 'Proyek'

  return (
    <div className="min-h-screen bg-background">
      <Header
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: projectName, href: `/input/${id}` },
          { label: 'Hasil FS' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleRecalculate} className="gap-1.5 hidden sm:flex">
              <RefreshCw className="h-3.5 w-3.5" />
              Hitung Ulang
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportJSON} className="gap-1.5 hidden sm:flex">
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/report/${id || currentProjectId}`)}
              className="gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Report PDF
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate(`/input/${id || currentProjectId}`)}
              className="gap-1.5"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit Input
            </Button>
          </div>
        }
      />

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        {/* Project title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-xl lg:text-2xl font-bold text-navy dark:text-gold">
              {projectName}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {currentInputs.alamatLokasi} ·{' '}
              {currentInputs.jumlahFase} fase × {currentInputs.durasiPerFase} bulan ·{' '}
              {currentInputs.tipeBangunan.length} tipe bangunan
            </p>
          </div>
        </div>

        {/* KPI Cards — always visible */}
        <KPICards results={r} />

        {/* Result tabs */}
        <Tabs defaultValue="ringkasan" className="space-y-4" onValueChange={setTabValue}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto p-1 flex-nowrap inline-flex min-w-max bg-muted gap-1">
              {TABS.map(({ value, label, requiredPlan }) => {
                const isLocked = isSubscriptionEnabled && requiredPlan && (
                  (requiredPlan === 'pro' && !canAccessCashflow) ||
                  (requiredPlan === 'basic' && !useSubscription().canExportPDF)
                )
                return (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="text-sm whitespace-nowrap data-[state=active]:bg-navy data-[state=active]:text-white gap-1.5"
                  >
                    {label}
                    {isLocked && <Lock className="h-3 w-3 opacity-60" />}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 lg:p-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={tabValue}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <TabsContent value="ringkasan" forceMount className="mt-0" hidden={tabValue !== 'ringkasan'}>
                  {tabValue === 'ringkasan' && <TabRingkasan results={r} />}
                </TabsContent>

                <TabsContent value="biaya" forceMount className="mt-0" hidden={tabValue !== 'biaya'}>
                  {tabValue === 'biaya' && <TabStrukturBiaya results={r} inputs={currentInputs} />}
                </TabsContent>

                <TabsContent value="pendapatan" forceMount className="mt-0" hidden={tabValue !== 'pendapatan'}>
                  {tabValue === 'pendapatan' && <TabProyeksiPendapatan results={r} inputs={currentInputs} />}
                </TabsContent>

                {/* CASHFLOW — gated to Pro */}
                <TabsContent value="cashflow" forceMount className="mt-0" hidden={tabValue !== 'cashflow'}>
                  {tabValue === 'cashflow' && (
                    <SubscriptionGate requiredPlan="pro" feature="Analisa Cash Flow" overlay>
                      <TabCashFlow results={r} />
                    </SubscriptionGate>
                  )}
                </TabsContent>

                <TabsContent value="bagihasil" forceMount className="mt-0" hidden={tabValue !== 'bagihasil'}>
                  {tabValue === 'bagihasil' && <TabBagiHasil results={r} />}
                </TabsContent>

                {/* SENSITIVITAS — gated to Basic */}
                <TabsContent value="sensitivitas" forceMount className="mt-0" hidden={tabValue !== 'sensitivitas'}>
                  {tabValue === 'sensitivitas' && (
                    <SubscriptionGate requiredPlan="basic" feature="Analisa Sensitivitas" overlay>
                      <TabSensitivitas results={r} />
                    </SubscriptionGate>
                  )}
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </main>
    </div>
  )
}
