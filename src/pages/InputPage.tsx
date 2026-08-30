import { useEffect, useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Save, Calculator, AlertCircle, Loader2 } from 'lucide-react'
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
import { denganBatasWaktu, pesanGalatMuat } from '@/lib/muatHasil'
import { labelSimpan } from '@/lib/simpanDraf'
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
  const fetchProjects    = useFSStore(s => s.fetchProjects)
  const loadProject      = useFSStore(s => s.loadProject)
  const createProject    = useFSStore(s => s.createProject)
  const updateInputs     = useFSStore(s => s.updateInputs)
  const setCurrentStep   = useFSStore(s => s.setCurrentStep)
  const calculate        = useFSStore(s => s.calculate)
  const saveProject      = useFSStore(s => s.saveCurrentProject)

  const [ready, setReady] = useState(false)

  // Load project from URL param
  //
  // Cacat yang sama pernah membuat halaman hasil berputar selamanya: badan
  // fungsi ini tidak punya penanganan galat, dan penanda selesai ada di dalam
  // jalur yang berhasil. `createProject()` di sini bahkan MELEMPAR dengan
  // sengaja ketika belum login — dan ketika itu terjadi, yang terlihat pemakai
  // hanya lingkaran berputar tanpa satu pun keterangan.
  const [galatMuat, setGalatMuat] = useState('')
  const isSaving = useFSStore(s => s.isSaving)
  const simpanGagal = useFSStore(s => s.simpanGagal)
  const simpanSegera = useFSStore(s => s.simpanSegera)

  // Perubahan yang masih menunggu jedanya dikirim ketika halaman ditinggalkan.
  // Tanpa ini, isian terakhir sebelum menekan "kembali" ikut hilang bersama
  // halamannya — dan itu justru isian yang paling baru.
  useEffect(() => () => simpanSegera(), [simpanSegera])
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        if (id) {
          // If project list is empty, fetch first to ensure the project exists
          if (projects.length === 0) await denganBatasWaktu(fetchProjects())
          await denganBatasWaktu(loadProject(id))
        } else if (!id && !currentProjectId) {
          const newId = await denganBatasWaktu(createProject())
          if (!cancelled) navigate(`/input/${newId}`, { replace: true })
        }
        if (!cancelled) setGalatMuat('')
      } catch (e) {
        if (!cancelled) setGalatMuat(pesanGalatMuat(e))
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    setReady(false)
    void init()
    return () => { cancelled = true }
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

  async function handleSaveDraft() {
    await saveProject()
    // Hasilnya diperiksa. Berkata "berhasil disimpan" atas penyimpanan yang
    // gagal adalah cara paling pasti membuat orang kehilangan pekerjaannya:
    // ia menutup halaman dengan tenang.
    const gagal = useFSStore.getState().simpanGagal
    if (gagal) {
      toast({
        title: 'Belum tersimpan ke server',
        description: `${gagal} Isian aman di perangkat ini — coba lagi setelah sinyal membaik.`,
        variant: 'destructive',
      })
      return
    }
    toast({ title: 'Draft tersimpan', description: 'Data proyek berhasil disimpan.', variant: 'success' as any })
    navigate('/dashboard')
  }

  async function handleCalculate() {
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

      // DITUNGGU sampai tersimpan, baru berpindah.
      //
      // Dulu halaman ini berpindah seketika sementara penyimpanan baru
      // dijadwalkan 100 milidetik kemudian. Halaman hasil lalu mengambil
      // barisnya dari server — yang masih berisi isian lama atau kosong — dan
      // menampilkan seluruh angkanya sebagai Rp 0, di atas judul proyek yang
      // sudah benar. Yang melihatnya menyimpulkan kalkulasinya rusak, padahal
      // isiannya memang belum sampai ke sana.
      await saveProject()

      const gagal = useFSStore.getState().simpanGagal
      if (gagal) {
        // Tetap boleh dilihat — hasilnya dihitung dari isian di layar ini,
        // bukan dari server. Yang tidak boleh adalah berpindah tanpa
        // memberitahu bahwa isiannya belum tersimpan.
        toast({
          title: 'Hasil belum tersimpan ke server',
          description: `${gagal} Isian aman di perangkat ini.`,
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Kalkulasi selesai!', description: 'Navigasi ke halaman hasil FS.', variant: 'success' })
      }

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

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-gold mx-auto" />
          <p className="text-muted-foreground text-sm">Memuat data proyek...</p>
        </div>
      </div>
    )
  }

  // Gagal memuat: dikatakan, bukan dibiarkan berputar.
  if (galatMuat) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-4xl">⚠️</div>
          <h2 className="font-serif text-xl font-semibold">Proyek belum bisa dibuka</h2>
          <p data-galat-muat className="text-sm text-muted-foreground leading-relaxed">{galatMuat}</p>
          <div className="flex gap-2 justify-center pt-2">
            <Button data-muat-ulang onClick={() => window.location.reload()}>Coba lagi</Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Ke Dashboard</Button>
          </div>
        </div>
      </div>
    )
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
          <div className="flex items-center gap-2">
            {/* Penanda simpan. Sampai sekarang kegagalan menyimpan tidak
                meninggalkan jejak apa pun — yang mengisi form baru
                mengetahuinya setelah memuat ulang halaman dan menemukan
                isiannya kosong. */}
            <span data-status-simpan className={`text-[10px] font-semibold ${
              simpanGagal ? 'text-amber-700' : 'text-muted-foreground'}`}>
              {labelSimpan(isSaving ? 'menyimpan' : simpanGagal ? 'gagal' : 'tersimpan', true)}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSaveDraft} className="gap-1.5 text-xs">
              <Save className="h-3.5 w-3.5" />
              Simpan Draft
            </Button>
          </div>
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
                <Button variant="outline" onClick={handleSaveDraft} className="gap-2 hidden sm:flex">
                  <Save className="h-4 w-4" /> Simpan Draft
                </Button>
                <Button variant="gold" onClick={() => void handleCalculate()} className="gap-2 font-bold shadow-md shadow-gold/20">
                  <Calculator className="h-4 w-4" /> Simpan & Publish Hitungan
                </Button>
              </>
            ) : (
              <>
                {currentStep >= 6 ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleCalculate()}
                    className="gap-2 text-sm"
                    title="Hitung dengan data yang ada"
                  >
                    <Calculator className="h-4 w-4" /> Hitung Sekarang
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleSaveDraft} className="gap-2 text-sm text-navy">
                    <Save className="h-4 w-4" /> Simpan Draft
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
