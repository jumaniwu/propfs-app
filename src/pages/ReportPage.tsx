import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Printer, Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import KPICards from '@/components/outputs/KPICards'
import TabRingkasan from '@/components/outputs/TabRingkasan'
import TabStrukturBiaya from '@/components/outputs/TabStrukturBiaya'
import TabProyeksiPendapatan from '@/components/outputs/TabProyeksiPendapatan'
import TabCashFlow from '@/components/outputs/TabCashFlow'
import TabBagiHasil from '@/components/outputs/TabBagiHasil'
import TabSensitivitas from '@/components/outputs/TabSensitivitas'
import StatusBadge from '@/components/shared/StatusBadge'
import SubscriptionGate from '@/components/subscription/SubscriptionGate'
import { useFSStore } from '@/store/fsStore'
import { exportToPDF, exportToJSON } from '@/utils/export'
import { formatRupiah, formatPct } from '@/engine/formatter'
import { toast } from '@/hooks/use-toast'

export default function ReportPage() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const projects         = useFSStore(s => s.projects)
  const currentProjectId = useFSStore(s => s.currentProjectId)
  const currentInputs    = useFSStore(s => s.currentInputs)
  const currentResults   = useFSStore(s => s.currentResults)
  const loadProject      = useFSStore(s => s.loadProject)

  useEffect(() => {
    if (id && id !== currentProjectId) {
      const project = projects.find(p => p.id === id)
      if (project) loadProject(id)
      else navigate('/', { replace: true })
    }
  }, [id])

  // Get the current project's creation date for the filename
  const currentProject = projects.find(p => p.id === (id ?? currentProjectId))
  const projectDate = currentProject?.createdAt
    ? new Date(currentProject.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '')
    : new Date().toISOString().slice(0,10).replace(/-/g, '')

  async function handleExportPDF() {
    const filename = `${currentInputs.namaProyek || 'PropFS Report'} ${projectDate}`
    toast({
      title: '🖨 Dialog Print akan terbuka',
      description: 'Pilih "Save as PDF" atau "Microsoft Print to PDF" sebagai printer, lalu klik Save.',
    })
    await exportToPDF('report-content', filename)
  }

  function handlePrint() {
    window.print()
  }

  if (!currentResults) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-500">Tidak ada data untuk ditampilkan.</p>
          <Button onClick={() => navigate('/')}>Kembali ke Dashboard</Button>
        </div>
      </div>
    )
  }

  const r   = currentResults
  const inp = currentInputs

  return (
    <>
      {/* Print toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="gold" size="sm" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Report content */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            margin: 15mm 20mm;
            size: auto;
          }
          @page :first {
            margin: 0;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background-color: white !important;
          }
          .sticky {
            position: static !important;
          }
          .overflow-x-auto, .overflow-y-auto {
            overflow: visible !important;
          }
          /* Ensure headers do not separate from tables */
          .table-container {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Except the cover, which gets full bleed! */
          #report-content > div.cover-page {
            height: 100vh !important;
            min-height: 100vh !important;
            padding: 24mm !important;
          }
          #report-content > div:not(.cover-page) {
            padding: 0 !important; /* Managed by @page margin now */
          }
        }
      `}} />
      <div id="report-content" className="bg-white text-gray-900 max-w-[900px] mx-auto">

        {/* ── Page 1: Cover ── */}
        <div className="cover-page print:break-before-page min-h-[297mm] flex flex-col justify-between p-12 bg-navy text-white">
          <div>
            {inp.logoUrl ? (
              <div className="h-16 mb-6">
                <img src={inp.logoUrl} alt="Logo Developer" className="h-full object-contain" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-gold rounded-2xl flex items-center justify-center mb-6">
                <span className="font-serif font-bold text-navy text-2xl">
                  {inp.namaDeveloper ? inp.namaDeveloper.charAt(0).toUpperCase() : 'P'}
                </span>
              </div>
            )}
            <div className="text-gold text-sm font-medium uppercase tracking-widest mb-2">PropFS Report</div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="text-gold/60 text-sm uppercase tracking-widest mb-2">Feasibility Study</div>
              <h1 className="font-serif text-4xl font-bold leading-tight">{inp.namaProyek || 'Feasibility Study Report'}</h1>
            </div>
            <div className="space-y-2 text-white/80">
              <p>📍 {inp.alamatLokasi}</p>
              <p>🏢 {inp.namaDeveloper}</p>
              <p>📅 Tahun Mulai: {inp.tahunMulai} | {inp.jumlahFase} Fase × {inp.durasiPerFase} Bulan</p>
            </div>
          </div>

          <div className="border-t border-white/20 pt-6 flex items-center justify-between text-white/50 text-sm">
            <span>Disiapkan oleh: {inp.namaDeveloper}</span>
            <span>{new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* ── Page 2: Executive Summary ── */}
        <div className="print:break-before-page p-10 space-y-6">
          <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
            Executive Summary
          </h2>

          <KPICards results={r} />

          <div className="bg-navy/5 rounded-xl p-5 space-y-3">
            <h3 className="font-serif font-semibold text-navy">Kesimpulan & Rekomendasi</h3>
            <div className="text-sm space-y-2 text-gray-700">
              <p>
                Proyek <strong>{inp.namaProyek}</strong> dengan total {r.totalUnit} unit pada lahan seluas{' '}
                {inp.lahan.luasLahanTotal.toLocaleString('id-ID')} m² menunjukkan hasil analisis kelayakan sebagai berikut:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Gross Revenue: <strong>{formatRupiah(r.grossRevenue, true)}</strong></li>
                <li>Total Investment: <strong>{formatRupiah(r.totalInvestment, true)}</strong> ({formatPct(r.totalInvestment / r.grossRevenue * 100)} dari GR)</li>
                <li>Gross Margin: <strong>{formatPct(r.grossMargin)}</strong></li>
                <li>Net Profit (sebelum bagi hasil): <strong>{formatRupiah(r.netProfit, true)}</strong></li>
                <li>Net Margin: <strong>{formatPct(r.netMargin)}</strong></li>
                {r.cashFlow.breakevenQuarter && (
                  <li>Titik Breakeven: <strong>Quarter ke-{r.cashFlow.breakevenQuarter}</strong></li>
                )}
              </ul>
              <p className="mt-3 font-medium">
                Status Kelayakan:{' '}
                <StatusBadge status={r.statusKelayakan} size="sm" />
              </p>
              <p className="text-gray-600 mt-2">
                {r.statusKelayakan === 'sangat_layak'
                  ? 'Proyek ini sangat layak untuk dilanjutkan. Net margin melebihi 25%, menunjukkan profitabilitas yang sangat baik bagi developer dan investor.'
                  : r.statusKelayakan === 'layak'
                  ? 'Proyek ini layak dilanjutkan dengan net margin di atas 15%. Pertimbangkan optimasi biaya atau harga jual untuk meningkatkan profitabilitas.'
                  : 'Proyek ini perlu evaluasi ulang. Net margin di bawah 15% menunjukkan risiko finansial yang cukup tinggi. Rekomendasikan negosiasi harga lahan atau peninjauan struktur biaya.'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Page 3: Struktur Biaya ── */}
        <div className="print:break-before-page p-10 space-y-6">
          <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
            Struktur Biaya Proyek
          </h2>
          <TabStrukturBiaya results={r} inputs={inp} />
        </div>

        {/* ── Page 4: Proyeksi Pendapatan ── */}
        <div className="print:break-before-page p-10 space-y-6">
          <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
            Proyeksi Pendapatan
          </h2>
          <TabProyeksiPendapatan results={r} inputs={inp} />
        </div>

        {/* ── Page 5: Laba Rugi ── */}
        <div className="print:break-before-page p-10 space-y-6">
          <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
            Rekapitulasi Laba Rugi
          </h2>
          <TabRingkasan results={r} />
        </div>

        {/* ── Page 6: Cash Flow ── */}
        <SubscriptionGate requiredPlan="pro" feature="Proyeksi Cash Flow">
          <div className="print:break-before-page p-10 space-y-6">
            <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
              Proyeksi Cash Flow
            </h2>
            <TabCashFlow results={r} />
          </div>
        </SubscriptionGate>

        {/* ── Page 7: Bagi Hasil ── */}
        <div className="print:break-before-page p-10 space-y-6">
          <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
            Analisis Bagi Hasil
          </h2>
          <TabBagiHasil results={r} />
        </div>

        {/* ── Page 8: Sensitivitas ── */}
        <SubscriptionGate requiredPlan="basic" feature="Analisis Sensitivitas">
          <div className="print:break-before-page p-10 space-y-6">
            <h2 className="font-serif text-2xl font-bold text-navy border-b-2 border-gold pb-3">
              Analisis Sensitivitas
            </h2>
            <TabSensitivitas results={r} />
          </div>
        </SubscriptionGate>

        {/* ── Footer ── */}
        <div className="p-10 border-t border-gray-200 text-center text-xs text-gray-400 space-y-1">
          <p>Dokumen ini dibuat oleh PropFS — Feasibility Study Properti</p>
          <p>{inp.namaDeveloper} | {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}</p>
          <p className="italic">Laporan ini bersifat confidential dan hanya untuk keperluan internal perusahaan.</p>
        </div>
      </div>
    </>
  )
}
