// ============================================================
// PropFS — Penyusun workbook laporan Realisasi Biaya
//
// KENAPA BERKAS INI ADA.
//
// Isinya dipindahkan apa adanya dari tombol "Excel" di TabRealisasiBiaya.
// Selama tinggal di dalam komponen, ia tidak bisa dipanggil dari tes, dan
// pembacaan kembali laporannya terpaksa diuji terhadap sheet buatan tangan.
// Sheet buatan tangan itu lulus; berkas yang sebenarnya gagal — angkanya
// tertulis berformat, dan formatnya memakai koma sebagai pemisah ribuan.
//
// Sekarang penulis dan pembacanya memakai fungsi yang sama, jadi tesnya
// menulis berkas yang persis sama dengan yang diunduh orang, lalu
// membacanya kembali. Perbedaan bentuk apa pun antara keduanya akan
// ketahuan di tes, bukan di ponsel orang yang datanya sudah telanjur hilang.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi.ts'
import { buildReportSheet, reportXlsx } from '../utils/excel.ts'

export interface OpsiLaporanRealisasi {
  namaProyek: string
  /** Tanggal cetak yang sudah diformat; dibuat sendiri bila kosong. */
  dicetak?: string
}

/**
 * Susun workbook laporan dari entri realisasi.
 *
 * Lima sheet: Ringkasan, Rekap Kategori, Pembelian Material, Upah Tukang,
 * Semua Transaksi. Sheet Material dan Upah hanya dibuat bila ada isinya —
 * pembacanya harus tahan bila keduanya tidak ada.
 */
export function susunWorkbookRealisasi(
  entri: RealisasiEntry[], opsi: OpsiLaporanRealisasi,
): ReturnType<typeof reportXlsx.utils.book_new> {
  const wb = reportXlsx.utils.book_new()
  const namaProyek = opsi.namaProyek?.trim() || 'Proyek'
  const printed = opsi.dicetak
    || new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const dates = entri.map(e => e.tanggal).filter(Boolean).sort()
  const periode = dates.length ? `Periode: ${dates[0]} s.d. ${dates[dates.length - 1]} · ` : ''
  const subtitle = `Proyek: ${namaProyek} · ${periode}Dicetak: ${printed} · ${entri.length} transaksi`

  // Sheet 1: Ringkasan
  const grandTotal = entri.reduce((s, e) => s + e.jumlah, 0)
  const totalMaterial = entri.filter(e => e.tipe === 'material').reduce((s, e) => s + e.jumlah, 0)
  const totalUpah = entri.filter(e => e.tipe === 'upah').reduce((s, e) => s + e.jumlah, 0)
  reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
    title: 'LAPORAN REALISASI BIAYA PROYEK — RINGKASAN',
    subtitle,
    headers: ['Uraian', 'Jumlah Transaksi', 'Jumlah (Rp)'],
    rows: [
      ['Pembelian Material', entri.filter(e => e.tipe === 'material').length, totalMaterial],
      ['Upah Tukang/Pekerja', entri.filter(e => e.tipe === 'upah').length, totalUpah],
      ['Operasional & Lainnya', entri.filter(e => e.tipe !== 'material' && e.tipe !== 'upah').length,
        grandTotal - totalMaterial - totalUpah],
    ],
    sumCols: [1, 2],
  }), 'Ringkasan')

  // Sheet 2: Rekap per Kategori (gaya laporan akuntan)
  const kategoriList = [...new Set(entri.map(e => e.kategori || 'lainnya'))]
  reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
    title: 'REKAPITULASI PENGELUARAN PER KATEGORI',
    subtitle,
    headers: ['No', 'Kategori', 'Jumlah Transaksi', 'Total (Rp)', '% dari Total'],
    rows: kategoriList.map((k, i) => {
      const items = entri.filter(e => (e.kategori || 'lainnya') === k)
      const tot = items.reduce((s, e) => s + e.jumlah, 0)
      return [i + 1, k.toUpperCase(), items.length, tot,
        grandTotal > 0 ? `${((tot / grandTotal) * 100).toFixed(1)}%` : '0%']
    }),
    sumCols: [2, 3],
  }), 'Rekap Kategori')

  // Sheet 3: Pembelian Material
  const mat = entri.filter(e => e.tipe === 'material')
  if (mat.length > 0) {
    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'LAPORAN PEMBELIAN MATERIAL',
      subtitle,
      headers: ['No', 'Tanggal', 'Nama Material', 'Volume', 'Satuan', 'Harga Satuan (Rp)',
        'Total (Rp)', 'Supplier/Toko', 'No. Nota', 'Kategori', 'Metode Bayar', 'Status', 'Keterangan'],
      rows: mat.map((e, i) => [
        i + 1, e.tanggal, e.namaMaterial || e.keterangan, e.volume ?? '', e.satuan ?? '',
        e.hargaSatuan ?? '', e.jumlah, e.namaSupplier || '-', e.nomorNota || '-',
        e.kategori, e.metodePembayaran || 'Cash', e.status, e.keterangan,
      ]),
      sumCols: [6],
    }), 'Pembelian Material')
  }

  // Sheet 4: Upah Tukang
  const upah = entri.filter(e => e.tipe === 'upah')
  if (upah.length > 0) {
    reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
      title: 'LAPORAN UPAH TUKANG / PEKERJA',
      subtitle,
      headers: ['No', 'Tanggal', 'Nama Tukang/Mandor', 'Jenis Pekerjaan', 'Jumlah Orang',
        'Hari Kerja', 'Upah/Orang/Hari (Rp)', 'Total Upah (Rp)', 'Metode Bayar', 'Status', 'Keterangan'],
      rows: upah.map((e, i) => [
        i + 1, e.tanggal, e.namaTukang || e.keterangan, e.jenisKerja || '-', e.jumlahOrang ?? '',
        e.hariKerja ?? '', e.upahHarian ?? '', e.jumlah, e.metodePembayaran || 'Cash', e.status, e.keterangan,
      ]),
      sumCols: [7],
    }), 'Upah Tukang')
  }

  // Sheet 5: Semua Transaksi
  reportXlsx.utils.book_append_sheet(wb, buildReportSheet({
    title: 'DAFTAR SEMUA TRANSAKSI',
    subtitle,
    headers: ['No', 'Tanggal', 'Tipe', 'Keterangan', 'Kategori', 'Total (Rp)', 'Status'],
    rows: entri.map((e, i) => [
      i + 1, e.tanggal, e.tipe, e.keterangan, e.kategori, e.jumlah, e.status,
    ]),
    sumCols: [5],
  }), 'Semua Transaksi')

  return wb
}

/** Nama berkas unduhan; aman dipakai di semua sistem berkas. */
export function namaBerkasLaporan(namaProyek: string, tanggal = new Date()): string {
  const dateStr = tanggal.toLocaleDateString('id-ID').replace(/\//g, '')
  const aman = (namaProyek || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'Proyek'
  return `Laporan_Realisasi_${aman}_${dateStr}.xlsx`
}
