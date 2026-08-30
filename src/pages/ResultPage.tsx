import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Edit, Printer, Download, RefreshCw, Lock, Loader2 } from 'lucide-react'
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
import TrialExpiredGate from '@/components/trial/TrialExpiredGate'
import { useFSStore } from '@/store/fsStore'
import { exportToJSON } from '@/utils/export'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from '@/hooks/use-toast'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import {
  denganBatasWaktu, keadaanMuat, pesanGalatMuat, perluMasukUlang, pesanTunggu,
  TUNGGU_SESI_MS, PESAN_SESI_TAK_SIAP,
  mulaiJam, ulangJam, lamaJam,
} from '@/lib/muatHasil'

function ResultPageContent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tabValue, setTabValue] = useState('ringkasan')

  const projects         = useFSStore(s => s.projects)
  const currentProjectId = useFSStore(s => s.currentProjectId)
  const currentInputs    = useFSStore(s => s.currentInputs)
  const currentResults   = useFSStore(s => s.currentResults)
  const loadProject      = useFSStore(s => s.loadProject)
  const fetchProjects    = useFSStore(s => s.fetchProjects)
  const calculate        = useFSStore(s => s.calculate)

  const [ready, setReady] = useState(false)
  const [galat, setGalat] = useState('')
  const [ulang, setUlang] = useState(0)
  // Sudah berapa detik menunggu, untuk mengganti kalimat di layar tunggu.
  const [detik, setDetik] = useState(0)

  // Yang ditunggu PENGGUNANYA, bukan penanda `isLoading`.
  //
  // `isLoading` menyala ulang setiap kali sesi disegarkan, dan penyegaran yang
  // gagal mengulanginya terus. Halaman yang menunggunya karena itu kembali ke
  // titik nol berkali-kali — dan yang terlihat pemakai adalah lingkaran
  // berputar yang tidak pernah berhenti, karena selalu ada pemuatan baru yang
  // menggantikan yang hampir selesai.
  //
  // Yang benar-benar dibutuhkan halaman ini cuma `user`. Begitu ia ada,
  // memuat proyek bisa dimulai; sisa pekerjaan sesi tidak menghalangi apa pun.
  const user = useAuthStore(s => s.user)

  // Dan penantiannya BERBATAS — dengan jam yang selamat dari pemasangan ulang.
  //
  // Halaman ini ternyata dipasang ulang berkali-kali selama sesi belum
  // stabil: tiap peristiwa auth merender ulang pohon di atasnya, dan komponen
  // ini lahir kembali dari nol. Setiap `setTimeout` di dalamnya karena itu
  // ikut kembali ke nol, sehingga batasnya TIDAK PERNAH tercapai betapapun
  // lamanya orang menunggu — lingkaran berputar yang benar-benar abadi.
  //
  // Jamnya disimpan di luar komponen, bertanda proyek + percobaan, sehingga
  // ia berlanjut melintasi kelahiran ulang dan hanya diatur ulang ketika yang
  // ditunggu memang berganti.
  const kunciJam = `result:${id ?? ''}:${ulang}`
  mulaiJam(kunciJam)
  const sesiMemuat = !user && lamaJam(kunciJam) < TUNGGU_SESI_MS

  const { canAccessCashflow, canAccessARAP, needsUpgradeForCashflow, isSubscriptionEnabled, canExportPDF } = useSubscription()

  // Load project if needed
  //
  // Dulu badan fungsi ini tidak punya SATU PUN penanganan galat, dan
  // `setReady(true)` ada di baris terakhirnya. Akibatnya lurus: apa pun yang
  // melempar di tengah jalan — sesi kedaluwarsa, jaringan putus, RLS menolak —
  // membuat baris itu tidak pernah tercapai, dan yang terlihat pemakai hanya
  // lingkaran berputar selamanya tanpa satu pun keterangan.
  //
  // Batas waktunya menutup bentuk kegagalan yang kedua, yang tidak bisa
  // ditangkap `catch` mana pun: permintaan yang tidak melempar DAN tidak
  // selesai. Di ponsel yang berpindah dari 5G ke tanpa sinyal, `fetch` bisa
  // menggantung tanpa batas — tidak ada galat, hanya janji yang tidak pernah
  // ditepati.
  // Penghitung detik, hidup HANYA selama menunggu. Dibersihkan begitu
  // selesai — pencacah yang terus berdetak di halaman yang sudah tampil
  // membuat seluruh pohon komponen dirender ulang tiap detik tanpa guna.
  // Berdetak selama menunggu. Selain mengganti kalimat di layar, detak inilah
  // yang membuat komponen merender ulang sehingga `lamaJam` di atas dibaca
  // lagi — tanpa itu, batas waktu sesi tidak pernah diperiksa ulang.
  useEffect(() => {
    if (ready && user) return
    const t = setInterval(() => setDetik(Math.floor(lamaJam(kunciJam) / 1000)), 500)
    return () => clearInterval(t)
  }, [ready, user, kunciJam])

  useEffect(() => {
    if (sesiMemuat) return
    // Penantian sesi habis dan penggunanya tetap tidak ada. Memuat proyek
    // tanpa pengguna akan pulang dengan tangan kosong, lalu halamannya
    // berkata "belum ada hasil" — menuduh datanya tidak ada padahal yang
    // tidak ada adalah sesinya.
    if (!user) { setGalat(PESAN_SESI_TAK_SIAP); setReady(true); return }
    let cancelled = false
    async function init() {
      try {
        if (id) {
          if (projects.length === 0) await denganBatasWaktu(fetchProjects())
          await denganBatasWaktu(loadProject(id))
        }
        if (!cancelled) setGalat('')
      } catch (e) {
        if (!cancelled) setGalat(pesanGalatMuat(e))
      } finally {
        // Di `finally`, bukan di baris terakhir `try`. Inilah seluruh
        // perbaikannya: penanda selesai harus dipasang baik ketika berhasil
        // maupun ketika gagal, kalau tidak kegagalan menjadi tak berujung.
        if (!cancelled) setReady(true)
      }
    }
    setReady(false)
    void init()
    return () => { cancelled = true }
  }, [id, sesiMemuat, user, ulang]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const keadaan = keadaanMuat({
    sesiMemuat, memuat: !ready, galat, adaHasil: !!currentResults,
  })

  // Loading guard — prevents blank page while fetching data
  //
  // Kalimatnya BERUBAH seiring waktu. Lingkaran berputar yang diam selama
  // belasan detik tidak bisa dibedakan dari yang macet, dan orang menutup
  // paksa halamannya tepat sebelum datanya sampai.
  if (keadaan === 'tunggu-sesi' || keadaan === 'memuat') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-gold mx-auto" />
          <p data-pesan-tunggu className="text-muted-foreground text-sm px-6">{pesanTunggu(detik)}</p>
        </div>
      </div>
    )
  }

  // Gagal memuat — DIBEDAKAN dari "belum ada hasil".
  //
  // Keduanya terlihat sama dari luar, tetapi yang ini masih bisa diperbaiki
  // dengan mencoba lagi. Menyebutnya "belum ada hasil" mengirim orang
  // menghitung ulang proyek yang datanya sebenarnya baik-baik saja.
  if (keadaan === 'galat') {
    const masukUlang = perluMasukUlang(galat)
    return (
      <div className="min-h-screen bg-background">
        <Header breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Hasil FS' }]} />
        <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="font-serif text-xl font-semibold">Hasil belum bisa dibuka</h2>
          <p data-galat-muat className="text-sm text-muted-foreground leading-relaxed">{galat}</p>
          <div className="flex gap-2 justify-center pt-2">
            {masukUlang ? (
              <Button onClick={() => navigate('/auth')} className="gap-2">Masuk kembali</Button>
            ) : (
              <Button data-muat-ulang onClick={() => { ulangJam(`result:${id ?? ''}:${ulang + 1}`); setUlang(n => n + 1) }} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Coba lagi
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Ke Dashboard</Button>
          </div>
        </div>
      </div>
    )
  }

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
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Dashboard</Button>
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
                  (requiredPlan === 'basic' && !canExportPDF)
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
                    <TrialExpiredGate feature="Cashflow Projection">
                      <SubscriptionGate requiredPlan="pro" feature="Analisa Cash Flow" overlay>
                        <TabCashFlow results={r} />
                      </SubscriptionGate>
                    </TrialExpiredGate>
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

export default function ResultPage() {
  return (
    <ErrorBoundary>
      <ResultPageContent />
    </ErrorBoundary>
  )
}
