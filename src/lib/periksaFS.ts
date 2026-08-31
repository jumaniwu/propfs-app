// ============================================================
// PropFS — Kenapa seluruh angka FS berbunyi nol
//
// Diaudit dengan menjalankan kalkulatornya sendiri atas data yang bentuknya
// seperti proyek sungguhan. Hasilnya tegas: dengan JADWAL PENJUALAN KOSONG,
//
//     pendapatan       Rp 0
//     biaya bangun     Rp 0      ← ikut nol
//     total investasi  Rp 0      (hanya menyisakan persiapan + operasional)
//
// dan dengan jadwal yang sama diisi:
//
//     pendapatan       Rp 51.332.687.500
//     biaya bangun     Rp 24.753.750.000
//     laba bersih      Rp 21.445.668.750
//
// Sebabnya satu baris di kalkulator: `calcTotalBiayaBangun` menjumlahkan
// `biayaPerUnit × unitTerjual`, dan `calcPenerimaanDetail` juga bersandar
// pada `unitTerjual`. Keduanya membaca jadwal penjualan. Ketika jadwal itu
// kosong, seluruh laporan runtuh menjadi nol — TANPA satu pun keterangan.
//
// Yang paling merugikan bukan nolnya, melainkan diamnya. Angka yang tersisa
// (persiapan + operasional) terlihat cukup masuk akal sebagai "total
// investasi", sehingga tidak ada yang curiga bahwa seluruh anggaran
// pembangunan tidak ikut terhitung sama sekali.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

export interface PeriksaFS {
  /** Ada yang salah dan perlu dikatakan. */
  bermasalah: boolean
  /** Kalimat utama. Kosong bila tidak ada masalah. */
  pesan: string
  /** Ke mana pemakainya harus pergi. */
  langkah: string
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Periksa keadaan sebuah hasil FS sebelum ditampilkan.
 *
 * Urutannya dari sebab yang paling awal ke yang paling akhir: tanpa tipe
 * bangunan tidak ada apa pun untuk dijual, tanpa jadwal penjualan tidak ada
 * yang terjual, dan tanpa harga tidak ada uang masuk. Menyebut sebab yang
 * paling akhir lebih dulu mengirim orang memperbaiki hal yang tidak salah.
 */
export function periksaFS(k: {
  jumlahTipe: number
  totalUnit: number
  unitDijadwalkan: number
  grossRevenue: number
  totalInvestment: number
}): PeriksaFS {
  if (n(k.jumlahTipe) <= 0) {
    return {
      bermasalah: true,
      pesan: 'Belum ada tipe bangunan, jadi belum ada yang bisa dihitung.',
      langkah: 'Tambahkan tipe bangunan di Step 3.',
    }
  }

  if (n(k.totalUnit) <= 0) {
    return {
      bermasalah: true,
      pesan: 'Tipe bangunan sudah ada, tetapi jumlah unitnya masih nol.',
      langkah: 'Isi jumlah unit tiap tipe di Step 3.',
    }
  }

  if (n(k.unitDijadwalkan) <= 0) {
    return {
      bermasalah: true,
      // Menyebut biaya bangun secara khusus. Inilah bagian yang selama ini
      // hilang tanpa disadari siapa pun: nol di pendapatan masih terlihat,
      // nol di biaya bangun tidak — ia tersamar di dalam total investasi yang
      // angkanya tetap tampak masuk akal.
      pesan: 'Belum ada unit yang dijadwalkan terjual. Karena itu pendapatan'
        + ' Rp 0 — dan biaya pembangunan JUGA belum ikut terhitung, sehingga'
        + ' total investasi yang tampil baru berisi biaya persiapan dan operasional.',
      langkah: 'Isi Simulasi Penjualan: berapa unit tiap tipe terjual di tiap fase.',
    }
  }

  if (n(k.grossRevenue) <= 0) {
    return {
      bermasalah: true,
      pesan: 'Unit sudah dijadwalkan terjual, tetapi harga jual per unit masih nol.',
      langkah: 'Periksa margin bangunan & kavling di Step 5.',
    }
  }

  return { bermasalah: false, pesan: '', langkah: '' }
}

/**
 * Berapa unit yang dijadwalkan terjual, seluruh tipe & fase.
 *
 * Dipisah supaya pemanggilnya tidak perlu tahu bentuk datanya, dan supaya
 * baris yang cacat (unit negatif, tipe kosong) tidak ikut terhitung.
 */
export function totalDijadwalkan(
  penjualan: Array<{ unitTerjual?: number }> | null | undefined,
): number {
  return (penjualan ?? []).reduce((s, p) => s + Math.max(0, n(p?.unitTerjual)), 0)
}

/** Berapa unit yang direncanakan dibangun, seluruh tipe. */
export function totalUnitDibangun(
  tipe: Array<{ jumlahUnit?: number }> | null | undefined,
): number {
  return (tipe ?? []).reduce((s, t) => s + Math.max(0, n(t?.jumlahUnit)), 0)
}

/**
 * Peringatan ketika yang dijadwalkan terjual JAUH lebih sedikit daripada yang
 * dibangun.
 *
 * Bukan galat — pembangunan bertahap memang begitu. Tetapi karena biaya
 * pembangunan dihitung dari unit TERJUAL, selisih besar berarti sebagian
 * besar anggaran bangunan tidak masuk laporan, dan yang membacanya perlu tahu
 * bahwa itu memang yang dimaksudkannya.
 */
export function selisihJadwal(dibangun: unknown, dijadwalkan: unknown): string {
  const d = n(dibangun)
  const j = n(dijadwalkan)
  if (d <= 0 || j <= 0 || j >= d) return ''
  const pct = Math.round((j / d) * 100)
  if (pct >= 90) return ''
  return `Baru ${j} dari ${d} unit (${pct}%) yang dijadwalkan terjual.`
    + ' Biaya pembangunan dihitung dari unit terjual, jadi sisanya belum masuk laporan ini.'
}
