// ============================================================
// PropFS — Kwitansi digital & kewajiban e-Meterai
//
// Setelah penerimaan termin dicatat, yang ditunggu konsumen adalah buktinya.
// Sampai sekarang bukti itu dibuat di luar sistem — diketik ulang di Word,
// difoto, dikirim lewat WhatsApp — sehingga angka yang tercatat di pembukuan
// dan angka yang dipegang konsumen tidak pernah dijamin sama.
//
// KEWAJIBAN METERAI BUKAN PILIHAN.
//
// UU No. 10 Tahun 2020 tentang Bea Meterai menetapkan dokumen yang menyatakan
// penerimaan uang di atas Rp 5.000.000 sebagai objek bea meterai Rp 10.000 —
// dan kwitansi termasuk di dalamnya secara eksplisit. Ketentuannya berlaku
// untuk dokumen elektronik, bukan hanya kertas. Kwitansi bernilai besar tanpa
// meterai lemah kedudukannya sebagai alat bukti bila kelak dipersoalkan, dan
// yang menanggung akibatnya adalah pihak yang menerbitkannya.
//
// Karena itu ambangnya dihitung di sini, diuji di sini, dan dokumen yang
// melewatinya tidak bisa ditandai selesai hanya karena tidak ada yang ingat.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/**
 * Batas nominal yang mewajibkan meterai.
 *
 * Undang-undangnya berbunyi "lebih dari Rp5.000.000,00" — jadi nominal yang
 * PERSIS lima juta TIDAK wajib bermeterai. Beda satu rupiah, dan salah
 * membacanya berarti membubuhkan meterai pada dokumen yang tidak memerlukannya
 * (kuota terbuang) atau melewatkannya pada yang memerlukan (dokumennya lemah).
 */
export const AMBANG_MATERAI = 5_000_000

/** Tarif bea meterai sejak 1 Januari 2021: satu tarif, Rp 10.000. */
export const TARIF_MATERAI = 10_000

export function perluMaterai(jumlah: unknown): boolean {
  const n = Number(jumlah)
  return Number.isFinite(n) && n > AMBANG_MATERAI
}

export type StatusMaterai = 'tidak_perlu' | 'menunggu' | 'terbubuh' | 'gagal'

export const LABEL_STATUS_MATERAI: Record<StatusMaterai, string> = {
  tidak_perlu: 'Tidak perlu meterai',
  menunggu: 'Menunggu e-Meterai',
  terbubuh: 'e-Meterai terbubuh',
  gagal: 'Pembubuhan gagal',
}

export const TONE_STATUS_MATERAI: Record<StatusMaterai, string> = {
  tidak_perlu: 'bg-slate-100 text-slate-700',
  menunggu: 'bg-amber-100 text-amber-800',
  terbubuh: 'bg-emerald-100 text-emerald-700',
  gagal: 'bg-rose-100 text-rose-700',
}

export type MetodeTerima = 'transfer' | 'tunai' | 'giro' | 'lainnya'

export const LABEL_METODE_TERIMA: Record<MetodeTerima, string> = {
  transfer: 'Transfer Bank',
  tunai: 'Tunai',
  giro: 'Giro / Cek',
  lainnya: 'Lainnya',
}

export interface Kwitansi {
  id?: string
  nomor: string
  tanggal: string
  /** Nama konsumen yang menyerahkan uang. */
  penerima_dari: string
  penerima_wa: string
  /** Uraian: "Termin 2 Ruko De Monde Bay Blok A-3". */
  untuk_pembayaran: string
  jumlah: number
  metode: MetodeTerima
  project_name: string
  penanda_nama: string
  penanda_jabatan: string
  catatan: string
  materai_status: StatusMaterai
  materai_sn: string
  /** PDF yang SUDAH dibubuhi meterai, diunggah kembali oleh penerbitnya. */
  materai_pdf?: string | null
  /** Tanda tangan digital penerima, sebagai data URL PNG. */
  penanda_signature?: string | null
}

export const KWITANSI_KOSONG: Kwitansi = {
  nomor: '', tanggal: '', penerima_dari: '', penerima_wa: '',
  untuk_pembayaran: '', jumlah: 0, metode: 'transfer', project_name: '',
  penanda_nama: '', penanda_jabatan: '', catatan: '',
  materai_status: 'tidak_perlu', materai_sn: '',
}

/** Status awal sebuah kwitansi yang baru dibuat, dari nominalnya sendiri. */
export function statusMaterajAwal(jumlah: unknown): StatusMaterai {
  return perluMaterai(jumlah) ? 'menunggu' : 'tidak_perlu'
}

/**
 * Nomor kwitansi berurut per bulan: KW/2026/08/0007.
 *
 * Bulan ikut di dalam nomor supaya urutannya tidak perlu dijaga lintas tahun,
 * dan supaya nomor yang sama tidak lahir dua kali ketika penghitungnya
 * di-reset — nomor kwitansi kembar adalah masalah pembukuan, bukan kosmetik.
 */
export function nomorKwitansi(urut: number, sekarang = new Date()): string {
  const th = sekarang.getFullYear()
  const bl = String(sekarang.getMonth() + 1).padStart(2, '0')
  return `KW/${th}/${bl}/${String(Math.max(1, Number(urut) || 1)).padStart(4, '0')}`
}

// ── Terbilang ───────────────────────────────────────────────────────────────

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan',
  'sembilan', 'sepuluh', 'sebelas',
]

/**
 * Angka menjadi kata, seperti yang harus tertulis pada kwitansi.
 *
 * Ada di sini dan diuji karena inilah bagian yang paling mudah salah tanpa
 * terlihat salah: "seratus" vs "satu ratus", "seribu" vs "satu ribu", dan
 * "sebelas" yang bukan "satu puluh satu". Kwitansi dengan terbilang yang
 * keliru bisa dipersoalkan justru ketika ia paling dibutuhkan, dan angkanya
 * di baris atas tetap terlihat benar.
 */
function kata(n: number): string {
  if (n < 12) return SATUAN[n]
  if (n < 20) return `${kata(n - 10)} belas`
  if (n < 100) {
    const p = Math.floor(n / 10)
    const s = n % 10
    return `${kata(p)} puluh${s ? ` ${kata(s)}` : ''}`
  }
  if (n < 200) return `seratus${n - 100 ? ` ${kata(n - 100)}` : ''}`
  if (n < 1000) {
    const r = Math.floor(n / 100)
    const s = n % 100
    return `${kata(r)} ratus${s ? ` ${kata(s)}` : ''}`
  }
  if (n < 2000) return `seribu${n - 1000 ? ` ${kata(n - 1000)}` : ''}`
  if (n < 1_000_000) {
    const r = Math.floor(n / 1000)
    const s = n % 1000
    return `${kata(r)} ribu${s ? ` ${kata(s)}` : ''}`
  }
  if (n < 1_000_000_000) {
    const r = Math.floor(n / 1_000_000)
    const s = n % 1_000_000
    return `${kata(r)} juta${s ? ` ${kata(s)}` : ''}`
  }
  if (n < 1_000_000_000_000) {
    const r = Math.floor(n / 1_000_000_000)
    const s = n % 1_000_000_000
    return `${kata(r)} miliar${s ? ` ${kata(s)}` : ''}`
  }
  const r = Math.floor(n / 1_000_000_000_000)
  const s = n % 1_000_000_000_000
  return `${kata(r)} triliun${s ? ` ${kata(s)}` : ''}`
}

/** "Dua juta tiga ratus sembilan puluh ribu rupiah" — siap dicetak. */
export function terbilang(jumlah: unknown): string {
  const n = Math.floor(Math.abs(Number(jumlah) || 0))
  if (n === 0) return 'Nol rupiah'
  const t = kata(n).replace(/\s+/g, ' ').trim()
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} rupiah`
}

// ── Kuota e-Meterai per perusahaan ──────────────────────────────────────────

export interface KuotaMaterai {
  dibeli: number
  terpakai: number
}

export function sisaKuota(k: KuotaMaterai | null | undefined): number {
  return Math.max(0, (Number(k?.dibeli) || 0) - (Number(k?.terpakai) || 0))
}

/**
 * Boleh membubuhkan meterai sekarang, atau apa yang menghalanginya.
 *
 * Alasannya dikembalikan, bukan sekadar boleh/tidak. Tombol yang mati tanpa
 * sebab membuat orang menebak — dan di sini tebakannya mahal: ia akan mengira
 * fiturnya rusak lalu mengirim kwitansinya tanpa meterai.
 */
export function bolehBubuhMaterai(
  kwitansi: Pick<Kwitansi, 'jumlah' | 'materai_status'>,
  kuota: KuotaMaterai | null | undefined,
  penyediaSiap: boolean,
): { boleh: boolean; alasan: string } {
  if (!perluMaterai(kwitansi.jumlah)) {
    return {
      boleh: false,
      alasan: `Nominalnya tidak melebihi Rp ${AMBANG_MATERAI.toLocaleString('id-ID')}, `
        + 'jadi tidak wajib bermeterai.',
    }
  }
  if (kwitansi.materai_status === 'terbubuh') {
    return { boleh: false, alasan: 'e-Meterai sudah terbubuh pada kwitansi ini.' }
  }
  if (!penyediaSiap) {
    return {
      boleh: false,
      alasan: 'Penyedia e-Meterai belum dihubungkan. Berlangganan ke salah satu distributor '
        + 'resmi Peruri, lalu pasang kuncinya di Pengaturan server.',
    }
  }
  if (sisaKuota(kuota) < 1) {
    return {
      boleh: false,
      alasan: 'Kuota e-Meterai perusahaan sudah habis. Beli dulu kuotanya di distributor '
        + 'resmi, lalu catat penambahannya di sini.',
    }
  }
  return { boleh: true, alasan: '' }
}

/**
 * Boleh dikirim ke konsumen, atau apa yang kurang.
 *
 * Kwitansi yang wajib bermeterai TIDAK boleh dikirim sebelum meterainya
 * terbubuh — bukan karena aplikasinya rewel, melainkan karena dokumen yang
 * sudah dipegang konsumen tidak bisa ditarik kembali untuk dimeterai
 * belakangan. Yang bisa ditunda adalah pengirimannya, bukan meterainya.
 */
/**
 * Peringatan meterai — bukan penghalang.
 *
 * Semula kwitansi di atas ambang DITAHAN sampai meterainya terbubuh. Itu benar
 * secara hukum, tetapi salah secara alat: pembubuhannya dikerjakan sendiri di
 * situs e-Meterai, dan menahan dokumennya di sini berarti menahan pekerjaan
 * yang memang harus keluar dari aplikasi ini dulu.
 *
 * Jadi kewajibannya tetap DIKATAKAN, di layar dan di atas kertas, tetapi yang
 * memutuskan kapan mengirim adalah orang yang mengerjakannya.
 */
export function peringatanMaterai(k: Pick<Kwitansi, 'jumlah' | 'materai_status'>): string {
  if (!perluMaterai(k?.jumlah)) return ''
  if (k?.materai_status === 'terbubuh') return ''
  return `Nominal di atas Rp ${AMBANG_MATERAI.toLocaleString('id-ID')} wajib bermeterai `
    + `Rp ${TARIF_MATERAI.toLocaleString('id-ID')} (UU No. 10/2020). Unduh PDF-nya, bubuhkan `
    + 'e-Meterai sendiri, lalu unggah kembali di sini.'
}

/**
 * Berkas mana yang dikirim ke konsumen.
 *
 * Bila versi bermeterai sudah diunggah, ITULAH yang dikirim. Mengirim PDF
 * bersih padahal versi bermeterainya ada berarti konsumen memegang dokumen
 * yang lebih lemah daripada yang sudah dibayar meterainya — dan tidak ada yang
 * akan menyadarinya sampai dokumennya dipersoalkan.
 */
export function berkasUntukKonsumen(
  k: Pick<Kwitansi, 'materai_status'> & { materai_pdf?: string | null },
): 'bermeterai' | 'bersih' {
  return k?.materai_status === 'terbubuh' && String(k?.materai_pdf ?? '').trim()
    ? 'bermeterai' : 'bersih'
}

/** Situs resmi tempat meterai dibubuhkan sendiri. */
export const TAUTAN_EMETERAI = 'https://e-meterai.co.id'

export function siapKirimKwitansi(k: Kwitansi): { boleh: boolean; alasan: string } {
  if (!String(k.penerima_dari ?? '').trim()) {
    return { boleh: false, alasan: 'Nama penyetor belum diisi.' }
  }
  if (!String(k.untuk_pembayaran ?? '').trim()) {
    return { boleh: false, alasan: 'Uraian pembayaran belum diisi.' }
  }
  if (!(Number(k.jumlah) > 0)) {
    return { boleh: false, alasan: 'Nominalnya masih nol.' }
  }
  if (!String(k.penanda_nama ?? '').trim()) {
    return { boleh: false, alasan: 'Nama penanda tangan belum diisi.' }
  }
  // Kewajiban meterai TIDAK lagi menahan pengiriman — lihat `peringatanMaterai`.
  return { boleh: true, alasan: '' }
}

/** Pesan WhatsApp yang menyertai kwitansi. Di sini supaya bisa diuji. */
export function pesanWaKwitansi(k: Kwitansi, tautan: string): string {
  const rp = `Rp ${Math.round(Number(k.jumlah) || 0).toLocaleString('id-ID')}`
  return [
    `Terima kasih ${k.penerima_dari}.`,
    '',
    `Pembayaran ${k.untuk_pembayaran} sebesar ${rp} sudah kami terima.`,
    `Kwitansi resminya: ${k.nomor}`,
    ...(k.materai_status === 'terbubuh'
      // Disebutkan hanya bila memang benar. Menuliskannya pada dokumen yang
      // belum bermeterai berarti menyatakan sesuatu yang tidak benar tentang
      // kekuatan hukumnya sendiri.
      ? ['Sudah dibubuhi e-Meterai resmi.']
      : []),
    '',
    'Unduh kwitansinya di:',
    tautan,
  ].join('\n')
}
