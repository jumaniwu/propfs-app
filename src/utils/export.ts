// ============================================================
// PropFS — Export Utilities (PDF & JSON)
// ============================================================

import type { SavedProject } from '../types/fs.types'

/**
 * Export project data ke JSON file
 */
export function exportToJSON(project: SavedProject): void {
  const data = JSON.stringify(project, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${sanitizeFilename(project.name || 'project')}_${formatDateForFile()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Import project dari JSON file
 */
export async function importFromJSON(file: File): Promise<SavedProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as SavedProject
        resolve(data)
      } catch {
        reject(new Error('File JSON tidak valid'))
      }
    }
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsText(file)
  })
}

/**
 * Export halaman report ke PDF menggunakan native browser print.
 *
 * Mengapa pendekatan ini (bukan html2canvas + jsPDF):
 * - html2canvas merender hanya elemen yang visible di viewport → tabel panjang
 *   terpotong karena overflow-x hidden dan elemen yang scroll-hidden tidak ikut.
 * - PDF hasil html2canvas adalah gambar (raster), bukan teks yang bisa dicopy/search.
 * - Blob URL download tidak reliable di semua browser (Chrome kadang pakai UUID).
 * - window.print() + CSS @media print adalah cara terpaling akurat:
 *   browser natively menangani page breaks, table headers yang berulang, fonts, dll.
 * - document.title sebelum print → Chrome/Edge gunakan ini sebagai nama file default PDF.
 */
export function exportToPDF(
  _elementId = 'report-content', // kept for API compatibility
  filename = 'propfs-report',
): Promise<void> {
  return new Promise<void>((resolve) => {
    const originalTitle = document.title

    // Set title = nama file → browser pakai ini sbg default filename saat "Save as PDF"
    const cleanName = sanitizeFilename(filename || 'propfs-report')
    const dateStr   = formatDateForFile()
    document.title  = `PropFS_${cleanName}_${dateStr}`

    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.title = originalTitle
        resolve()
      }, 1000)
    }, 150)
  })
}

/**
 * Print halaman report langsung dari browser
 */
export function printReport(): void {
  window.print()
}

// ── HELPERS ───────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 80)
}

function formatDateForFile(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
