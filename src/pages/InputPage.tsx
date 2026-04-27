import { useEffect, useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Save, Calculator, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Header from '@/components/layout/Header'
import ProgressSteps from '@/components/shared/ProgressSteps'
import Step1DataProyek from '@/components/inputs/Step1DataProyek'
import Step2DataLahan from '@/components/inputs/Step2DataLahan'
import Step3TipeBangunan from '@/components/inputs/Step3TipeBangunan'
import Step4BiayaPembangunan from '@/components/inputs/Step4BiayaPembangunan'
import Step5HargaJual from '@/components/inputs/Step5HargaJual'
import Step6SimulasiPenjualan from '@/components/inputs/Step6SimulasiPenjualan'
import Step7PotongandanBagiHasil from '@/components/inputs/Step7PotongandanBagiHasil'
import { useFSStore } from '@/store/fsStore'
import { toast } from '@/hooks/use-toast'

const STEP_TITLES = [
  'Data Proyek',
  'Data Lahan',
  'Tipe Bangunan',
  'Biaya Pembangunan',
  'Harga Jual',
  'Simulasi Penjualan',
  'Potongan & Bagi Hasil',
]

export default function InputPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const currentStep      = useFSStore(s => s.currentStep)
  const currentInputs    = useFSStore(s => s.currentInputs)
  const currentProjectId = useFSStore(s => s.currentProjectId)
  const projects         = useFSStore(s => s.projects)
  const loadProject      = useFSStore(s => s.loadProject)
  const createProject    = useFSStore(s => s.createProject)
  const updateInputs     = useFSStore(s => s.updateInputs)
  const setCurrentStep   = useFSStore(s => s.setCurrentStep)
  const calculate        = useFSStore(s => s.calculate)
  const saveProject      = useFSStore(s => s.saveCurrentProject)

  // Load project from URL param
  useEffect(() => {
    if (id && id !== currentProjectId) {
      const project = projects.find(p => p.id === id)
      if (project) {
        loadProject(id)
      } else {
        // Create new project if id not found
        navigate('/', { replace: true })
      }
    } else if (!id && !currentProjectId) {
      const newId = createProject()
      navigate(`/input/${newId}`, { replace: true })
    }
  }, [id])

  const handleChange = useCallback((partial: Partial<typeof currentInputs>) => {
    updateInputs(partial)
  }, [updateInputs])

  function handleNext() {
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function handleSaveDraft() {
    saveProject()
    toast({ title: 'Draft tersimpan', description: 'Data proyek berhasil disimpan.', variant: 'success' })
  }

  function handleCalculate() {
    try {
      // Basic validation
      if (!currentInputs.namaProyek) {
        toast({ title: 'Data belum lengkap', description: 'Isi nama proyek di Step 1 terlebih dahulu.', variant: 'destructive' })
        setCurrentStep(1)
        return
      }
      if (currentInputs.lahan.luasLahanTotal <= 0) {
        toast({ title: 'Data belum lengkap', description: 'Isi luas lahan di Step 2 terlebih dahulu.', variant: 'destructive' })
        setCurrentStep(2)
        return
      }
      if (currentInputs.tipeBangunan.length === 0) {
        toast({ title: 'Data belum lengkap', description: 'Tambahkan minimal 1 tipe bangunan di Step 3.', variant: 'destructive' })
        setCurrentStep(3)
        return
      }

      calculate()
      toast({ title: 'Kalkulasi selesai!', description: 'Navigasi ke halaman hasil FS.', variant: 'success' })

      if (currentProjectId) {
        navigate(`/result/${currentProjectId}`)
      }
    } catch (err) {
      console.error(err)
      toast({ title: 'Error kalkulasi', description: 'Terjadi kesalahan. Periksa data input.', variant: 'destructive' })
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1DataProyek inputs={currentInputs} onChange={handleChange} />
      case 2: return <Step2DataLahan  inputs={currentInputs} onChange={handleChange} />
      case 3: return <Step3TipeBangunan inputs={currentInputs} onChange={handleChange} />
      case 4: return <Step4BiayaPembangunan inputs={currentInputs} onChange={handleChange} />
      case 5: return <Step5HargaJual inputs={currentInputs} onChange={handleChange} />
      case 6: return <Step6SimulasiPenjualan inputs={currentInputs} onChange={handleChange} />
      case 7: return <Step7PotongandanBagiHasil inputs={currentInputs} onChange={handleChange} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: currentInputs.namaProyek || 'Proyek Baru', href: undefined },
          { label: STEP_TITLES[currentStep - 1] },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={handleSaveDraft} className="gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" />
            Simpan Draft
          </Button>
        }
      />

      <main className="max-w-4xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        {/* Progress */}
        <ProgressSteps
          currentStep={currentStep}
          onStepClick={(step) => setCurrentStep(step)}
        />

        {/* Step content card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="bg-navy px-6 py-4 flex items-center justify-between">
            <div>
              <div className="text-gold text-xs font-medium uppercase tracking-widest">
                Step {currentStep} dari 7
              </div>
              <h2 className="text-white font-serif font-semibold text-lg mt-0.5">
                {STEP_TITLES[currentStep - 1]}
              </h2>
            </div>
            <div className="text-white/40 font-serif text-5xl font-bold leading-none select-none">
              {currentStep}
            </div>
          </div>

          {/* Form content */}
          <div className="p-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Sebelumnya
          </Button>

          <div className="flex gap-2">
            {currentStep === 7 ? (
              <>
                <Button variant="outline" onClick={handleSaveDraft} className="gap-2">
                  <Save className="h-4 w-4" />
                  Simpan Draft
                </Button>
                <Button variant="gold" onClick={handleCalculate} className="gap-2">
                  <Calculator className="h-4 w-4" />
                  Hitung Feasibility Study
                </Button>
              </>
            ) : (
              <>
                {currentStep >= 6 && (
                  <Button
                    variant="outline"
                    onClick={handleCalculate}
                    className="gap-2 text-sm"
                    title="Hitung dengan data yang ada"
                  >
                    <Calculator className="h-4 w-4" />
                    Hitung Sekarang
                  </Button>
                )}
                <Button variant="default" onClick={handleNext} className="gap-2">
                  Selanjutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-3">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Data tersimpan otomatis ke browser. Klik <strong>Hitung Feasibility Study</strong> di Step 7
            untuk melihat hasil lengkap dengan semua chart dan analisis.
          </span>
        </div>
      </main>
    </div>
  )
}
