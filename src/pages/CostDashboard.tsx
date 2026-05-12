import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calculator, LineChart, FileSpreadsheet, PackageOpen,
  ReceiptIcon, TrendingUp, Download, FolderPlus, Building2,
  RefreshCw, Trash2, ArrowUpRight, ArrowDownRight, Minus,
  Info, Target, AlertTriangle, CheckCircle2, Presentation
} from 'lucide-react'
import { useState, useMemo } from 'react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import RABUploader from '@/components/cost/RABUploader'
import TrialExpiredGate from '@/components/trial/TrialExpiredGate'
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

  // ── EVM Analytics ─────────────────────────────────────────
  const evmMetrics = useMemo(() => {
    const EV = (actualProgressPct / 100) * totalRAB
    const AC = totalRealisasi
    const SPI = EV > 0 && totalRAB > 0 ? EV / Math.max(AC, 1) : null
    const CPI = AC > 0 ? EV / AC : null
    const EAC = CPI && CPI > 0 ? totalRAB / CPI : null
    const sisaAnggaran = totalRAB - AC
    const spiStatus = !SPI ? 'no_data' : SPI >= 1.05 ? 'ahead' : SPI >= 0.95 ? 'on_track' : 'behind'
    const cpiStatus = !CPI ? 'no_data' : CPI >= 1.05 ? 'under' : CPI >= 0.95 ? 'on_track' : 'over'
    return { EV, AC, SPI, CPI, EAC, sisaAnggaran, spiStatus, cpiStatus }
  }, [actualProgressPct, totalRAB, totalRealisasi])

  // ── Export Helpers ─────────────────────────────────────────
  const dateStr = () => new Date().toLocaleDateString('id-ID').replace(/\//g, '')
  const projName = projectInfo?.projectName ?? 'Proyek'

  // ── Global Header Helper ─────────────────────────────────────────
  const addGlobalHeader = (ws: ExcelJS.Worksheet, reportName: string, colCount: number) => {
    ws.mergeCells(1, 1, 1, colCount)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = `PROPFS — ${reportName.toUpperCase()}`
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1a2744' } }
    
    ws.mergeCells(2, 1, 2, colCount)
    ws.getCell(2, 1).value = `Nama Proyek  : ${projectInfo?.projectName || '-'}`
    ws.getCell(2, 1).font = { name: 'Calibri', size: 10 }

    ws.mergeCells(3, 1, 3, colCount)
    ws.getCell(3, 1).value = `Lokasi       : ${projectInfo?.location || '-'}`
    ws.getCell(3, 1).font = { name: 'Calibri', size: 10 }

    ws.mergeCells(4, 1, 4, colCount)
    ws.getCell(4, 1).value = `Dicetak      : ${new Date().toLocaleString('id-ID')}`
    ws.getCell(4, 1).font = { name: 'Calibri', size: 10 }
  }

  const formatHeaderRow = (row: ExcelJS.Row) => {
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2744' } }
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }
    })
  }

  const exportRAB = async () => {
    if (!activePlan) return
    const wb = new ExcelJS.Workbook()
    
    // ── Sheet 1: RAB Proyek ──
    const ws1 = wb.addWorksheet('RAB Proyek')
    addGlobalHeader(ws1, 'Laporan Rencana Anggaran Biaya (RAB)', 7)
    
    ws1.columns = [
      { key: 'no', width: 5 },
      { key: 'code', width: 12 },
      { key: 'name', width: 40 },
      { key: 'unit', width: 10 },
      { key: 'vol', width: 12 },
      { key: 'price', width: 18 },
      { key: 'total', width: 20 },
    ]

    const headerRow = ws1.addRow(['No', 'Kode Item', 'Uraian Pekerjaan', 'Satuan', 'Volume', 'Harga Satuan', 'Total Harga'])
    formatHeaderRow(headerRow)

    const grouped = activePlan.components.reduce((acc, c) => {
      const g = c.groupName || 'Lainnya'; if (!acc[g]) acc[g] = []; acc[g].push(c); return acc
    }, {} as Record<string, typeof activePlan.components>)

    let no = 1
    Object.entries(grouped).forEach(([grp, items]) => {
      // Category Header
      const catRow = ws1.addRow(['', '', grp.toUpperCase(), '', '', '', ''])
      ws1.mergeCells(`A${catRow.number}:G${catRow.number}`)
      const catCell = ws1.getCell(`A${catRow.number}`)
      catCell.value = grp.toUpperCase()
      catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFc9a84c' } }
      catCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1a2744' } }
      catCell.border = { bottom: { style: 'medium' } }

      // Items
      items.forEach(c => {
        const r = ws1.addRow([no++, '-', c.name, c.unit, c.plannedVolume, c.unitPrice, c.totalPlannedCost])
        r.font = { name: 'Calibri', size: 10 }
        r.getCell(5).numFmt = '#,##0.00'
        r.getCell(6).numFmt = '"Rp "#,##0'
        r.getCell(7).numFmt = '"Rp "#,##0'
        r.getCell(1).alignment = { horizontal: 'center' }
        r.getCell(4).alignment = { horizontal: 'center' }
      })

      // Subtotal
      const sub = items.reduce((s, c) => s + c.totalPlannedCost, 0)
      const subRow = ws1.addRow(['', '', `Subtotal ${grp}`, '', '', '', sub])
      subRow.getCell(3).font = { name: 'Calibri', size: 10, bold: true }
      subRow.getCell(7).font = { name: 'Calibri', size: 10, bold: true }
      subRow.getCell(7).numFmt = '"Rp "#,##0'
      subRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3DE' } }
        c.border = { top: { style: 'medium', color: { argb: 'FF3B6D11' } } }
      })
      ws1.addRow([]) // empty row
    })

    // Grand Total
    const gtRow = ws1.addRow(['', '', 'GRAND TOTAL ANGGARAN', '', '', '', totalRAB])
    gtRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2744' } }
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      c.border = { top: { style: 'double' } }
    })
    gtRow.getCell(7).numFmt = '"Rp "#,##0'

    // ── Sheet 2: Summary RAB ──
    const ws2 = wb.addWorksheet('Summary RAB')
    addGlobalHeader(ws2, 'Ringkasan Anggaran Biaya', 4)
    ws2.columns = [
      { key: 'cat', width: 35 },
      { key: 'count', width: 12 },
      { key: 'total', width: 20 },
      { key: 'pct', width: 25 },
    ]
    const sumHeader = ws2.addRow(['Nama Kategori', 'Jumlah Item', 'Total Nilai (Rp)', 'Persentase dari Total RAB (%)'])
    formatHeaderRow(sumHeader)

    Object.entries(grouped).forEach(([g, items]) => {
      const total = items.reduce((s, c) => s + c.totalPlannedCost, 0)
      const pct = totalRAB > 0 ? total / totalRAB : 0
      const r = ws2.addRow([g, items.length, total, pct])
      r.font = { name: 'Calibri', size: 10 }
      r.getCell(2).alignment = { horizontal: 'center' }
      r.getCell(3).numFmt = '"Rp "#,##0'
      r.getCell(4).numFmt = '0.00"%"'
      // Add data bar simulation
      r.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } }
    })

    const gtSumRow = ws2.addRow(['GRAND TOTAL', activePlan.components.length, totalRAB, 1])
    gtSumRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2744' } }
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    })
    gtSumRow.getCell(3).numFmt = '"Rp "#,##0'
    gtSumRow.getCell(4).numFmt = '0.00"%"'

    const buffer = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `RAB_${projName}_${dateStr()}.xlsx`)
  }

  const exportRealisasi = async () => {
    if (realisasiEntries.length === 0) return alert('Belum ada data realisasi biaya.')
    const wb = new ExcelJS.Workbook()
    
    // ── Sheet 1: Realisasi Biaya ──
    const ws1 = wb.addWorksheet('Realisasi Biaya')
    addGlobalHeader(ws1, 'Laporan Realisasi Biaya', 7)
    
    ws1.columns = [
      { key: 'no', width: 5 },
      { key: 'date', width: 14 },
      { key: 'desc', width: 35 },
      { key: 'cat', width: 15 },
      { key: 'amount', width: 18 },
      { key: 'method', width: 16 },
      { key: 'notes', width: 30 },
    ]

    const header = ws1.addRow(['No', 'Tanggal', 'Uraian', 'Kategori', 'Jumlah (Rp)', 'Metode Bayar', 'Keterangan'])
    formatHeaderRow(header)

    realisasiEntries.forEach((e, i) => {
      const r = ws1.addRow([
        i + 1,
        e.tanggal ? new Date(e.tanggal) : '-',
        e.tipe === 'material' ? (e.namaMaterial || e.keterangan) : (e.jenisKerja || e.keterangan),
        e.tipe.toUpperCase(),
        e.jumlah,
        e.metodePembayaran?.toUpperCase() || '-',
        e.keterangan || '-'
      ])
      r.font = { name: 'Calibri', size: 10 }
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(2).numFmt = 'DD MMM YYYY'
      r.getCell(2).alignment = { horizontal: 'center' }
      r.getCell(4).alignment = { horizontal: 'center' }
      r.getCell(5).numFmt = '"Rp "#,##0'
      r.getCell(6).alignment = { horizontal: 'center' }
      
      if (i % 2 === 1) {
        r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } })
      }
    })

    const totRow = ws1.addRow(['', '', 'TOTAL REALISASI BIAYA', '', totalRealisasi, '', ''])
    totRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3DE' } }
      c.font = { name: 'Calibri', size: 10, bold: true }
      c.border = { top: { style: 'medium', color: { argb: 'FF3B6D11' } } }
    })
    totRow.getCell(5).numFmt = '"Rp "#,##0'

    // ── Sheet 2: Summary ──
    const ws2 = wb.addWorksheet('Summary')
    addGlobalHeader(ws2, 'Executive Summary - Cost Control', 2)
    ws2.columns = [{ width: 35 }, { width: 25 }]

    const sHead = ws2.addRow(['Keterangan', 'Nilai'])
    formatHeaderRow(sHead)

    const sisa = totalRAB - totalRealisasi
    const pct = totalRAB > 0 ? totalRealisasi / totalRAB : 0
    const deviasi = pct * 100 - actualProgressPct
    
    // SPI/CPI placeholder values (since they require month elapsed logic from Kurva S)
    const spi = actualProgressPct > 0 ? (actualProgressPct / Math.max(1, pct*100)) : 1 
    const cpi = totalRealisasi > 0 ? ((actualProgressPct/100 * totalRAB) / totalRealisasi) : 1
    const eac = cpi > 0 ? totalRAB / cpi : totalRAB

    const addSumRow = (label: string, val: any, isRp: boolean, color?: string, bg?: string) => {
      const r = ws2.addRow([label, val])
      r.font = { name: 'Calibri', size: 10, bold: !!color, color: { argb: color || 'FF000000' } }
      if (bg) r.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } })
      if (isRp) r.getCell(2).numFmt = '"Rp "#,##0'
      else if (typeof val === 'number' && label.includes('%')) r.getCell(2).numFmt = '0.00"%"'
    }

    addSumRow('Total Anggaran (RAB)', totalRAB, true)
    addSumRow('Total Realisasi', totalRealisasi, true)
    addSumRow('Sisa Anggaran', sisa, true, sisa >= 0 ? 'FF3B6D11' : 'FFA32D2D', sisa < 0 ? 'FFFCEBEB' : undefined)
    addSumRow('% Terpakai', pct, false)
    addSumRow('Progress Fisik Aktual', actualProgressPct / 100, false)
    addSumRow('Deviasi Cost vs Progress', deviasi / 100, false, deviasi <= 0 ? 'FF3B6D11' : 'FFA32D2D', deviasi > 0 ? 'FFFCEBEB' : undefined)
    
    const statusText = deviasi > 5 ? '⚠ Perlu Perhatian' : deviasi < -5 ? '✓ Sangat Efisien' : '✓ On Track'
    addSumRow('Status', statusText, false, deviasi > 5 ? 'FFA32D2D' : 'FF3B6D11', deviasi > 5 ? 'FFFCEBEB' : undefined)
    
    addSumRow('SPI', `${spi.toFixed(2)} — ${spi < 1 ? 'Behind Sched.' : 'On Track'}`, false, spi < 1 ? 'FFA32D2D' : 'FF3B6D11')
    addSumRow('CPI', `${cpi.toFixed(2)} — ${cpi < 1 ? 'Over Budget' : 'Under Budget'}`, false, cpi < 1 ? 'FFA32D2D' : 'FF3B6D11')
    addSumRow('EAC (Forecast Akhir)', eac, true)

    const buffer = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `Realisasi_${projName}_${dateStr()}.xlsx`)
  }

  const exportMaterial = async () => {
    const mat = useCostStore.getState().materialSchedule
    if (mat.length === 0) return alert('Belum ada data Material Schedule. Generate terlebih dahulu di tab Material.')
    const wb = new ExcelJS.Workbook()

    // ── Sheet 1: Material Schedule ──
    const ws1 = wb.addWorksheet('Material Schedule')
    addGlobalHeader(ws1, 'Laporan Material Schedule', 9)

    ws1.columns = [
      { key: 'no', width: 5 },
      { key: 'name', width: 30 },
      { key: 'spec', width: 20 },
      { key: 'unit', width: 10 },
      { key: 'vol', width: 14 },
      { key: 'price', width: 18 },
      { key: 'total', width: 20 },
      { key: 'lead', width: 12 },
      { key: 'status', width: 18 },
    ]

    const header = ws1.addRow(['No', 'Nama Material', 'Spesifikasi', 'Satuan', 'Volume Total', 'Harga Satuan', 'Total Nilai', 'Lead Time', 'Status'])
    formatHeaderRow(header)

    let matTotal = 0
    mat.forEach((m, i) => {
      matTotal += m.estimatedTotalCost
      const r = ws1.addRow([
        i + 1, m.materialName, m.supplier || '-', m.unit, m.estimatedVolume, m.estimatedUnitPrice, m.estimatedTotalCost, m.leadTimeDays || '-', m.status || 'belum_order'
      ])
      r.font = { name: 'Calibri', size: 10 }
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(4).alignment = { horizontal: 'center' }
      r.getCell(5).numFmt = '#,##0.00'
      r.getCell(6).numFmt = '"Rp "#,##0'
      r.getCell(7).numFmt = '"Rp "#,##0'
      r.getCell(8).alignment = { horizontal: 'center' }
      r.getCell(9).alignment = { horizontal: 'center' }

      // Conditional formatting for status
      const statCell = r.getCell(9)
      const st = m.status || 'belum_order'
      if (st === 'belum_order') { statCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } }; statCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF854F0B' } } }
      else if (st === 'sudah_order') { statCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1FB' } }; statCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF185FA5' } } }
      else if (st === 'sudah_datang') { statCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3DE' } }; statCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF3B6D11' } } }
      else if (st === 'terpakai') { statCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EFE8' } }; statCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF5F5E5A' } } }
      statCell.value = st.replace('_', ' ').toUpperCase()
    })

    const totRow = ws1.addRow(['', '', 'TOTAL NILAI MATERIAL', '', '', '', matTotal, '', ''])
    totRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2744' } }
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    })
    totRow.getCell(7).numFmt = '"Rp "#,##0'

    // ── Sheet 2: Top 10 Material ──
    const ws2 = wb.addWorksheet('Top 10 Material')
    addGlobalHeader(ws2, 'Top 10 Material Termahal', 4)
    ws2.columns = [{ width: 12 }, { width: 35 }, { width: 20 }, { width: 15 }]
    const tHead = ws2.addRow(['Ranking', 'Nama Material', 'Total Nilai (Rp)', '% dari Total RAB'])
    formatHeaderRow(tHead)

    const top10 = [...mat].sort((a,b) => b.estimatedTotalCost - a.estimatedTotalCost).slice(0, 10)
    top10.forEach((m, i) => {
      const rank = i + 1
      const pct = totalRAB > 0 ? m.estimatedTotalCost / totalRAB : 0
      const r = ws2.addRow([rank, m.materialName, m.estimatedTotalCost, pct])
      r.font = { name: 'Calibri', size: 10 }
      r.getCell(1).alignment = { horizontal: 'center' }
      r.getCell(3).numFmt = '"Rp "#,##0'
      r.getCell(4).numFmt = '0.00"%"'

      if (rank === 1) {
        r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFc9a84c' } }; c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1a2744' } } })
      } else if (rank <= 3) {
        r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F0E0' } }; c.font = { name: 'Calibri', size: 10, color: { argb: 'FF1a2744' } } })
      } else if (i % 2 === 1) {
        r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } } })
      }
    })

    const buffer = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `MaterialSchedule_${projName}_${dateStr()}.xlsx`)
  }

  const exportKurvaS = () => {
    navigate(`/cost-report/${projectInfo?.id}?print=true`)
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* ── STATE 1: No project → Dashboard Mode ── */}
      {!projectInfo && (
        <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
            <div>
              <button onClick={() => navigate('/home')}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ArrowLeft className="h-4 w-4" /> Kembali ke Portal
              </button>
              <h1 className="font-serif text-2xl md:text-3xl font-bold">Dashboard Cost Control</h1>
              <p className="text-muted-foreground mt-1 text-sm">{savedProjects.length} proyek tersimpan</p>
            </div>
            <Button className="bg-navy text-white hover:bg-navy/90 font-bold gap-2 w-full sm:w-auto" onClick={() => setShowCreateModal(true)}>
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
        <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
            <div>
              <button onClick={() => clearProject()}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
              </button>
              <h1 className="font-serif text-2xl md:text-3xl font-bold">Workspace Proyek</h1>
              <p className="text-muted-foreground text-sm mt-1">
                <Building2 className="inline h-3.5 w-3.5 mr-1" />
                {projectInfo.projectName}{projectInfo.location && ` · ${projectInfo.location}`}
              </p>
            </div>
            <Button onClick={() => clearProject()} className="bg-navy text-white hover:bg-navy/90 font-bold px-6 w-full sm:w-auto">
              Simpan & Kembali
            </Button>
          </div>
          {/* KPI bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KpiCard title="Total Anggaran (RAB)" value="Rp 0" icon={<Calculator className="h-5 w-5 text-blue-600" />} />
            <KpiCard title="Realisasi Biaya" value="Rp 0" icon={<ReceiptIcon className="h-5 w-5 text-orange-600" />} />
            <KpiCard title="Deviasi Progress" value="0%" icon={<LineChart className="h-5 w-5 text-emerald-600" />} />
          </div>
          <TrialExpiredGate feature="AI RAB Parser">
            <RABUploader />
          </TrialExpiredGate>
        </main>
      )}

      {/* ── STATE 3: Project + RAB loaded → Sidebar layout ── */}
      {projectInfo && activePlan && (
        <div className="flex relative">
          {/* Sidebar */}
          <WorkspaceSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Main Content */}
          <main className="flex-1 min-w-0 px-3 md:px-8 py-4 md:py-6 pb-24 md:pb-6">
            {/* Workspace Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
              <div className="pl-10 md:pl-0">
                <button onClick={() => clearProject()}
                  className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-1">
                  <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
                </button>
                <h1 className="font-serif text-xl md:text-2xl font-bold">Workspace Proyek</h1>
                <p className="text-muted-foreground text-xs mt-0.5">
                  <Building2 className="inline h-3 w-3 mr-1" />
                  {projectInfo.projectName}{projectInfo.location && ` · ${projectInfo.location}`}
                </p>
              </div>
              <Button onClick={() => clearProject()} className="bg-navy text-white hover:bg-navy/90 font-bold px-5 shadow-md w-full sm:w-auto">
                Simpan & Kembali
              </Button>
            </div>

            {/* ── KPI Cards (real-time) ── */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 mb-5">
              <KpiCard
                title="Total Anggaran (RAB)"
                value={`Rp ${totalRAB.toLocaleString('id-ID')}`}
                icon={<Calculator className="h-5 w-5 text-blue-600" />}
              />
              <KpiCard
                title="Realisasi Biaya"
                value={`Rp ${totalRealisasi.toLocaleString('id-ID')}`}
                icon={<ReceiptIcon className="h-5 w-5 text-orange-600" />}
                sub={totalRAB > 0 ? `${((totalRealisasi / totalRAB) * 100).toFixed(1)}% dari RAB` : undefined}
              />
              {/* Enhanced Deviasi Card */}
              <div className={`border rounded-2xl p-5 shadow-sm ${
                deviasiPct > 0 ? 'bg-red-50 border-red-200' :
                deviasiPct < 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-card border-border'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    {deviasiPct > 0 ? <ArrowUpRight className="h-5 w-5 text-red-500" /> :
                     deviasiPct < 0 ? <ArrowDownRight className="h-5 w-5 text-emerald-600" /> :
                     <Minus className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Deviasi Progress</span>
                </div>
                <div className={`text-2xl font-bold mb-2 ${
                  deviasiPct > 0 ? 'text-red-700' : deviasiPct < 0 ? 'text-emerald-700' : ''
                }`}>{deviasiPct >= 0 ? '+' : ''}{deviasiPct}%</div>
                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                  <div className={`h-1.5 rounded-full transition-all ${
                    deviasiPct > 0 ? 'bg-red-500' : 'bg-emerald-500'
                  }`} style={{ width: `${Math.min(Math.abs(deviasiPct) * 5, 100)}%` }} />
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>📊 Biaya terpakai: {totalRAB > 0 ? ((totalRealisasi/totalRAB)*100).toFixed(1) : 0}% RAB</p>
                  <p>🏗️ Fisik selesai: {actualProgressPct.toFixed(1)}% RAB</p>
                  <p className={deviasiPct > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    ⚡ {deviasiPct > 0 ? 'Perlu perhatian' : deviasiPct < 0 ? 'Efisien' : 'On Track'}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Tab Content ── */}
            <div className="bg-white border border-border rounded-2xl md:rounded-3xl shadow-sm overflow-hidden">
              <div className="p-4 md:p-6 lg:p-8">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-5">
                    <h2 className="text-xl md:text-2xl font-serif font-bold text-navy">Dashboard Proyek</h2>
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

                    {/* EVM KPI Cards */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" /> Key Performance Indicators (EVM)
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'SPI', val: evmMetrics.SPI !== null ? evmMetrics.SPI.toFixed(2) : '—', sub: evmMetrics.spiStatus === 'ahead' ? '✅ Ahead' : evmMetrics.spiStatus === 'on_track' ? '🟡 On Track' : evmMetrics.spiStatus === 'behind' ? '🔴 Behind' : 'Input progress dulu', good: evmMetrics.SPI === null ? null : evmMetrics.SPI >= 1 },
                          { label: 'CPI', val: evmMetrics.CPI !== null ? evmMetrics.CPI.toFixed(2) : '—', sub: evmMetrics.cpiStatus === 'under' ? '✅ Under Budget' : evmMetrics.cpiStatus === 'on_track' ? '🟡 On Track' : evmMetrics.cpiStatus === 'over' ? '🔴 Over Budget' : 'Input realisasi dulu', good: evmMetrics.CPI === null ? null : evmMetrics.CPI >= 1 },
                          { label: 'EAC (Forecast)', val: evmMetrics.EAC ? `Rp ${(evmMetrics.EAC/1_000_000_000).toFixed(2)}M` : '—', sub: 'Estimasi total biaya akhir', good: evmMetrics.EAC !== null ? evmMetrics.EAC <= totalRAB : null },
                          { label: 'Sisa Anggaran', val: `Rp ${(evmMetrics.sisaAnggaran/1_000_000_000).toFixed(2)}M`, sub: 'RAB − Realisasi', good: evmMetrics.sisaAnggaran >= 0 },
                        ].map(m => (
                          <div key={m.label} className={`rounded-xl p-3 border ${
                            m.good === null ? 'bg-muted/30 border-border' :
                            m.good ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                          }`}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{m.label}</p>
                            <p className={`text-lg font-bold mt-0.5 ${
                              m.good === null ? '' : m.good ? 'text-emerald-700' : 'text-red-700'
                            }`}>{m.val}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}


                {/* RAB Tab */}
                {activeTab === 'rab' && isFeatureEnabled('cost_rab') && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl md:text-2xl font-serif font-bold text-navy">Data RAB Proyek</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                          {activePlan.components.length} item pekerjaan · Klik ✏️ untuk edit.
                        </p>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" onClick={() => clearActivePlan()} className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 flex-1 sm:flex-none text-sm">
                          <RefreshCw className="w-3.5 h-3.5" /> Upload Ulang
                        </Button>
                        <Button variant="outline" onClick={exportRAB} className="gap-1.5 flex-1 sm:flex-none text-sm">
                          <Download className="w-3.5 h-3.5" /> Export Excel
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
                  <div className="space-y-5">
                    <h2 className="text-xl md:text-2xl font-serif font-bold text-navy">Laporan & Export</h2>
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { label: 'Export RAB ke Excel', desc: `RAB_${projName}_${dateStr()}.xlsx · Grouping per kategori + Summary`, icon: <FileSpreadsheet className="w-6 h-6" />, action: exportRAB, color: 'bg-blue-50 border-blue-200 hover:bg-blue-100' },
                        { label: 'Export Realisasi Biaya', desc: `Realisasi_${projName}_${dateStr()}.xlsx · Material + Upah + Deviasi`, icon: <ReceiptIcon className="w-6 h-6" />, action: exportRealisasi, color: 'bg-orange-50 border-orange-200 hover:bg-orange-100' },
                        { label: 'Export Material Schedule', desc: `MaterialSchedule_${projName}_${dateStr()}.xlsx · Kebutuhan + Realisasi`, icon: <PackageOpen className="w-6 h-6" />, action: exportMaterial, color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
                        { label: 'Export Kurva S (PDF)', desc: 'Print / Save as PDF via browser · Dual curve Rencana vs Aktual', icon: <TrendingUp className="w-6 h-6" />, action: exportKurvaS, color: 'bg-purple-50 border-purple-200 hover:bg-purple-100' },
                        { label: 'Presentasi Laporan', desc: 'Lihat Laporan Eksekutif Cost Control di browser (Web View / PDF)', icon: <Presentation className="w-6 h-6" />, action: () => navigate(`/cost-report/${projectInfo?.id}`), color: 'bg-gold/10 border-gold/30 hover:bg-gold/20' },
                      ].map(r => (
                        <button key={r.label} onClick={r.action}
                          className={`w-full text-left border rounded-2xl p-5 flex items-center gap-4 transition-colors cursor-pointer ${r.color}`}>
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-navy shadow-sm shrink-0">{r.icon}</div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-navy">{r.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.desc}</p>
                          </div>
                          <Download className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
                        </button>
                      ))}
                    </div>

                    {/* EVM Analytics Section */}
                    <div className="border border-border rounded-2xl p-5 bg-white">
                      <h3 className="font-bold text-navy mb-4 flex items-center gap-2"><Target className="w-4 h-4" /> Key Performance Indicators (EVM)</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/30 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">SPI</p>
                          <p className={`text-xl font-bold ${evmMetrics.SPI === null ? 'text-muted-foreground' : evmMetrics.SPI >= 1 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {evmMetrics.SPI !== null ? evmMetrics.SPI.toFixed(2) : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {evmMetrics.spiStatus === 'ahead' ? '✅ Ahead of Schedule' : evmMetrics.spiStatus === 'on_track' ? '🟡 On Track' : evmMetrics.spiStatus === 'behind' ? '🔴 Behind Schedule' : 'Input progress dulu'}
                          </p>
                        </div>
                        <div className="bg-muted/30 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">CPI</p>
                          <p className={`text-xl font-bold ${evmMetrics.CPI === null ? 'text-muted-foreground' : evmMetrics.CPI >= 1 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {evmMetrics.CPI !== null ? evmMetrics.CPI.toFixed(2) : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {evmMetrics.cpiStatus === 'under' ? '✅ Under Budget' : evmMetrics.cpiStatus === 'on_track' ? '🟡 On Track' : evmMetrics.cpiStatus === 'over' ? '🔴 Over Budget' : 'Input realisasi dulu'}
                          </p>
                        </div>
                        <div className="bg-muted/30 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">EAC (Forecast)</p>
                          <p className="text-xl font-bold text-navy">
                            {evmMetrics.EAC ? `Rp ${(evmMetrics.EAC/1_000_000_000).toFixed(2)}M` : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">Estimasi total biaya akhir</p>
                        </div>
                        <div className="bg-muted/30 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sisa Anggaran</p>
                          <p className={`text-xl font-bold ${evmMetrics.sisaAnggaran >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            Rp {(evmMetrics.sisaAnggaran/1_000_000_000).toFixed(2)}M
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">RAB − Realisasi</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pengaturan */}
                {activeTab === 'settings' && (
                  <div className="space-y-5">
                    <h2 className="text-xl md:text-2xl font-serif font-bold text-navy">Pengaturan Proyek</h2>
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
