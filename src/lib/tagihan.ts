// ============================================================
// PropFS — Perhitungan tagihan langganan (logika murni)
//
// Angka-angka ini sebelumnya ditulis di tengah sebuah komponen halaman, di
// dalam `useEffect` yang juga memanggil Supabase dan mengalihkan rute. Karena
// halaman itu kini pensiun, perhitungannya dipindahkan ke sini — dan sekaligus
// jadi bisa diuji, yang selama ini tidak pernah terjadi pada potongan harga
// 3 bulan dan 12 bulan.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/** Potongan berdasarkan lama berlangganan sekaligus. */
export const DISKON_BULAN: Record<number, number> = { 3: 0.10, 12: 0.20 }

export function diskonBulan(bulan: number): number {
  return DISKON_BULAN[Math.floor(Number(bulan))] ?? 0
}

export interface RincianTagihan {
  bulan: number
  diskon: number
  subtotal: number
  ppn: number
  total: number
}

/**
 * Rincian satu tagihan langganan.
 *
 * Pembulatan dilakukan pada subtotal DULU, baru PPN dihitung dari subtotal yang
 * sudah bulat — supaya angka yang tercetak di invoice benar-benar berjumlah
 * sama bila dijumlahkan ulang oleh pembacanya.
 */
export function hitungTagihan(hargaSebulan: number, bulan = 1, ppnRate = 0): RincianTagihan {
  const b = Math.max(1, Math.floor(Number(bulan)) || 1)
  const harga = Math.max(0, Number(hargaSebulan) || 0)
  const diskon = diskonBulan(b)
  const subtotal = Math.round(harga * b * (1 - diskon))
  const ppn = Math.round(subtotal * Math.max(0, Number(ppnRate) || 0))
  return { bulan: b, diskon, subtotal, ppn, total: subtotal + ppn }
}

/**
 * Nomor invoice: INV-YYYYMMDD-NNNN.
 *
 * Tanggalnya waktu SETEMPAT, bukan UTC. Pelanggan di WIB yang menerbitkan
 * tagihan pukul 00.30 tidak boleh menerima invoice bertanggal kemarin.
 */
export function nomorInvoice(sekarang: Date = new Date(), acak: () => number = Math.random): string {
  const d = Number.isNaN(sekarang.getTime()) ? new Date() : sekarang
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  const urut = String(Math.floor(acak() * 10000)).padStart(4, '0')
  return `INV-${y}${m}${t}-${urut}`
}

/** Akhir periode langganan, dihitung per bulan kalender. */
export function akhirPeriode(bulan = 1, mulai: Date = new Date()): Date {
  const b = Math.max(1, Math.floor(Number(bulan)) || 1)
  const d = new Date(mulai.getTime())
  const tanggalAwal = d.getDate()
  d.setMonth(d.getMonth() + b)
  // 31 Jan + 1 bulan tidak boleh melompat ke 3 Maret; mundurkan ke akhir bulan.
  if (d.getDate() !== tanggalAwal) d.setDate(0)
  return d
}
