// ============================================================
// PropFS — Memesan dalam satuan yang BERBEDA dari yang diminta lapangan
//
// Lapangan meminta dalam satuan kerja: 49 Batang kayu, 19 Ikat. Pembelian
// terjadi dalam satuan dagang: 2 Ton, 5 Kubik, 3 Truk. Keduanya benar, dan
// keduanya harus muncul di tempat yang berbeda:
//
//   VENDOR membaca PO. Ia harus melihat satuan dagang — "2 Ton" — karena
//   itulah yang bisa ia siapkan dan ia hargai. "49 Batang" tidak berarti
//   apa-apa di gudangnya.
//
//   LAPANGAN membaca "Menunggu Dipesan". Ia harus melihat satuan kerja —
//   permintaannya 49 Batang, dan setelah PO ini terbit sisanya nol.
//
// Sebelum modul ini, keduanya dipaksa menjadi satu angka. Satuannya terkunci
// ke satuan permintaan, dan jumlahnya dibatasi tidak boleh melebihi sisa.
// Akibatnya memesan 2 Ton mustahil: kalau ditulis "2", panel lapangan akan
// selamanya berbunyi "sisa 47 Batang" — permintaan yang sudah dipenuhi penuh
// tampak seperti terbengkalai, dan tidak ada seorang pun yang bisa
// menjelaskan selisihnya.
//
// Jadi satu baris PO kini membawa DUA angka:
//
//   qty + satuan  → yang dicetak di PO dan dikalikan harga. Milik vendor.
//   penuhi        → berapa banyak permintaan yang ditutup baris ini, DALAM
//                   satuan permintaan. Milik lapangan.
//
// Ketika satuannya sama, `penuhi` sama dengan `qty` dan tidak ada yang
// berubah dari perilaku lama — itu jalur yang dipakai hampir setiap hari dan
// ia tidak boleh terusik sama sekali.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()

/**
 * Satuan yang sering dipakai, untuk disodorkan sebagai saran ketikan.
 *
 * Bukan daftar tertutup: satuan di lapangan tidak terbatas ("truk", "rit",
 * "colt diesel"), dan memaksanya masuk daftar hanya membuat orang menulis
 * satuan yang salah supaya formulirnya mau lanjut.
 */
export const SATUAN_UMUM = [
  'Batang', 'Ikat', 'Lembar', 'Sak', 'Zak', 'Kg', 'Ton', 'Kubik', 'm³', 'm²', 'm',
  'Pcs', 'Unit', 'Set', 'Dus', 'Box', 'Roll', 'Kaleng', 'Rit', 'Truk',
] as const

/**
 * Apakah dua satuan sebenarnya satuan yang sama.
 *
 * Dibandingkan longgar dengan sengaja. "Batang", "batang", dan "BATANG "
 * adalah satu satuan yang sama, dan memperlakukannya sebagai berbeda akan
 * memunculkan kolom "memenuhi berapa" pada baris yang tidak berubah apa pun —
 * pertanyaan membingungkan yang jawabannya sudah jelas.
 */
export function satuanSama(a: unknown, b: unknown): boolean {
  const bersih = (v: unknown) => teks(v).toLowerCase().replace(/\s+/g, ' ')
  return bersih(a) === bersih(b)
}

export interface BarisPesan {
  /** Satuan pada Material Request — milik lapangan. */
  satuanRequest: string
  /** Satuan yang dipesan ke vendor — milik vendor. */
  satuanPesan: string
  /** Jumlah dalam satuan pesan. Ini yang dikalikan harga. */
  qty: number
  /** Jumlah dalam satuan REQUEST yang ditutup baris ini. */
  penuhi?: number
  /** Sisa permintaan yang belum dipesan, dalam satuan request. */
  sisa: number
}

const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Berapa banyak permintaan yang ditutup sebuah baris.
 *
 * Ketika satuannya SAMA, jawabannya jumlah yang dipesan — tidak ada yang
 * perlu diterjemahkan. Ketika BERBEDA, tidak ada rumus yang bisa menebaknya:
 * berapa batang dalam satu ton bergantung pada panjang dan jenis kayunya, dan
 * menebaknya berarti mengarang angka yang akan dipakai orang lain sebagai
 * kenyataan. Jadi angkanya diminta, dan yang ditawarkan hanyalah bawaan yang
 * paling sering benar: seluruh sisanya.
 */
export function penuhiBawaan(b: BarisPesan): number {
  if (satuanSama(b.satuanPesan, b.satuanRequest)) return Math.max(0, angka(b.qty))
  return Math.max(0, angka(b.sisa))
}

/** Nilai `penuhi` yang berlaku — yang diisi orang, atau bawaannya. */
export function penuhiBerlaku(b: BarisPesan): number {
  const diisi = angka(b.penuhi)
  if (diisi > 0) return diisi
  return penuhiBawaan(b)
}

/** Apakah baris ini memakai satuan yang berbeda dari permintaannya. */
export function satuanDiubah(b: BarisPesan): boolean {
  return !satuanSama(b.satuanPesan, b.satuanRequest)
}

export interface PeriksaBaris {
  boleh: boolean
  alasan: string
}

/**
 * Apakah satu baris pesanan layak diterbitkan.
 *
 * Batas atas diperiksa pada `penuhi`, BUKAN pada `qty` — dan di situlah letak
 * perbaikannya. Versi lama membatasi `qty` tidak boleh melebihi sisa, sehingga
 * "2 Ton" untuk permintaan "49 Batang" lolos begitu saja (2 < 49) sementara
 * "60 Batang" untuk permintaan 49 ditolak. Yang dijaga ternyata bukan
 * kelebihan pesan, melainkan kebetulan bahwa kedua angka itu memakai satuan
 * yang sama.
 */
export function siapBarisPesan(b: BarisPesan): PeriksaBaris {
  const qty = angka(b.qty)
  if (qty <= 0) return { boleh: false, alasan: 'Jumlah pesanan belum diisi.' }
  if (!teks(b.satuanPesan)) return { boleh: false, alasan: 'Satuan pesanan belum diisi.' }

  const penuhi = penuhiBerlaku(b)
  if (penuhi <= 0) {
    return {
      boleh: false,
      alasan: `Isi berapa ${teks(b.satuanRequest) || 'unit'} yang dipenuhi pesanan ini.`,
    }
  }
  const sisa = Math.max(0, angka(b.sisa))
  if (penuhi > sisa) {
    return {
      boleh: false,
      alasan: `Melebihi permintaan: sisa yang belum dipesan hanya ${sisa} ${teks(b.satuanRequest) || 'unit'}.`,
    }
  }
  return { boleh: true, alasan: '' }
}

/** Angka tanpa nol di belakang koma: 2 → "2", 2.5 → "2,5". */
export function jumlah(n: unknown): string {
  const v = angka(n)
  const bulat = Math.round(v * 1000) / 1000
  return String(bulat).replace('.', ',')
}

/**
 * Kalimat yang menjelaskan baris berpindah satuan, untuk dibaca ORANG DALAM.
 *
 * Tidak dicetak di PO. Vendor tidak perlu tahu satuan kerja lapangan, dan
 * mencantumkannya justru mengundang pertanyaan "jadi 2 ton atau 49 batang?"
 * pada dokumen yang seharusnya tidak menimbulkan pertanyaan sama sekali.
 */
export function ringkasPesan(b: BarisPesan): string {
  const q = `${jumlah(b.qty)} ${teks(b.satuanPesan) || 'unit'}`
  if (!satuanDiubah(b)) return q
  return `${q} — menutup ${jumlah(penuhiBerlaku(b))} ${teks(b.satuanRequest) || 'unit'} dari permintaan lapangan`
}

/**
 * Baris siap simpan: `penuhi` hanya dibawa bila ia memang berbeda dari `qty`.
 *
 * Tidak menuliskannya ketika nilainya sama adalah keputusan yang disengaja.
 * PO lama tidak punya medan ini, dan pembacanya di server memang menganggap
 * ketiadaannya berarti "pakai qty". Menuliskan angka yang sama di setiap baris
 * hanya menambah satu tempat lagi yang bisa berselisih dengan `qty` — dan
 * ketika keduanya berselisih tanpa alasan, tidak ada cara mengetahui mana yang
 * benar.
 */
export function barisUntukSimpan<T extends BarisPesan>(b: T): T & { penuhi?: number } {
  if (!satuanDiubah(b)) {
    const { penuhi: _buang, ...sisa } = b as T & { penuhi?: number }
    void _buang
    return sisa as T
  }
  return { ...b, penuhi: penuhiBerlaku(b) }
}
