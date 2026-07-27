// ============================================================
// PropFS — Satu barang, satu baris stok
//
// Nama material diketik ulang oleh orang yang berbeda di tempat yang berbeda:
// nota dari toko, request dari tukang, item PO, koreksi gudang. Hasilnya satu
// barang yang sama tercatat dengan beberapa nama:
//
//   "Triplek 9mm Pku"
//   "Triplek 9mm Pku @130lmbr/pallet"
//   "Triplek 9mm Pku (pallet)"
//
// Stoknya lalu terbagi ke beberapa baris, dan tidak ada satu pun yang benar.
// Modul ini menyatukannya kembali.
//
// Aturannya sengaja KONSERVATIF. Menggabungkan dua barang yang sebenarnya
// berbeda jauh lebih berbahaya daripada membiarkan dua baris terpisah: yang
// pertama membuat stok palsu yang dipercaya orang, yang kedua hanya
// merepotkan. Maka penggabungan hanya terjadi bila nama yang satu adalah AWALAN
// UTUH dari yang lain, dipisah spasi. "Kayu 2x3" tidak pernah bergabung dengan
// "Kayu 2x3x4" karena setelah awalannya tidak ada spasi.
//
// Tanpa DOM & tanpa impor runtime, supaya bisa diuji di Node.
// ============================================================

/**
 * Buang keterangan kemasan/harga yang menempel di belakang nama, lalu ratakan
 * penulisannya. Yang dibuang hanyalah bagian yang jelas BUKAN identitas barang:
 *
 *   "@130lmbr/pallet"  keterangan isi per kemasan
 *   "@ Rp58.000"       harga yang ikut terketik
 *   "(pallet)" "[SNI]" catatan dalam kurung
 *
 * Tanda kutip inci diseragamkan karena papan ketik HP menghasilkan " ” ″ yang
 * berbeda-beda untuk maksud yang sama.
 */
export function normalNama(nama: unknown): string {
  return String(nama ?? '')
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    // Semua yang mengikuti "@" adalah keterangan kemasan atau harga.
    .replace(/@.*$/, '')
    // Catatan dalam kurung, di mana pun letaknya.
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s+/g, ' ')
    // Pemisah yang menggantung setelah pemangkasan.
    .replace(/[\s,;.\-–—/]+$/, '')
    .trim()
    .toLowerCase()
}

/**
 * true bila `panjang` hanyalah `pendek` ditambah keterangan di belakangnya.
 * Batas spasi wajib ada, supaya ukuran yang berbeda tidak ikut tergabung.
 */
export function awalanUtuh(pendek: string, panjang: string): boolean {
  if (!pendek || !panjang || pendek === panjang) return false
  if (pendek.length < 3) return false
  return panjang.startsWith(pendek + ' ')
}

/**
 * Petakan tiap nama ke nama BAKU-nya — nama terpendek yang masih menjelaskan
 * barang yang sama. Yang terpendek dipilih karena keterangan kemasan selalu
 * menambah, tidak pernah mengurangi.
 *
 * Rantai ikut diselesaikan: bila C bergabung ke B dan B ke A, C berakhir di A.
 */
export function petaNamaBaku(namaAsli: Iterable<string>): Map<string, string> {
  const unik = [...new Set([...namaAsli].map(normalNama).filter(Boolean))]
  // Terpendek dulu supaya calon induk selalu sudah diperiksa lebih awal.
  unik.sort((a, b) => a.length - b.length || a.localeCompare(b))

  const induk = new Map<string, string>()
  for (const n of unik) {
    const orangTua = unik.find(k => k !== n && awalanUtuh(k, n))
    induk.set(n, orangTua ?? n)
  }
  // Rapikan rantai: telusuri sampai bertemu nama yang menjadi induk dirinya.
  const baku = new Map<string, string>()
  for (const n of unik) {
    let cur = n
    // Batas langkah menjaga dari rantai melingkar bila datanya aneh.
    for (let i = 0; i < unik.length; i++) {
      const next = induk.get(cur) ?? cur
      if (next === cur) break
      cur = next
    }
    baku.set(n, cur)
  }
  return baku
}

/**
 * Pengelompok siap pakai untuk perhitungan stok.
 *
 * `kunci(nama)` mengembalikan penanda kelompok, dan `tampilan(nama)` nama yang
 * pantas ditampilkan — yaitu penulisan ASLI terpendek dalam kelompok itu,
 * bukan hasil normalisasi yang sudah kehilangan huruf besarnya.
 */
export function pengelompokNama(namaAsli: Iterable<string>) {
  const semua = [...namaAsli].filter(n => String(n ?? '').trim())
  const baku = petaNamaBaku(semua)

  // Penulisan asli terbaik per kelompok: yang terpendek, karena keterangan
  // kemasan hanya menambah panjang.
  const tampil = new Map<string, string>()
  for (const asli of semua) {
    const k = baku.get(normalNama(asli))
    if (!k) continue
    const rapi = String(asli).trim()
    const ada = tampil.get(k)
    if (!ada || rapi.length < ada.length) tampil.set(k, rapi)
  }

  return {
    kunci: (nama: unknown) => {
      const n = normalNama(nama)
      return baku.get(n) ?? n
    },
    tampilan: (nama: unknown) => {
      const k = baku.get(normalNama(nama)) ?? normalNama(nama)
      return tampil.get(k) ?? String(nama ?? '').trim()
    },
  }
}
